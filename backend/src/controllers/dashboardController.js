import { prisma } from "../config/prisma.js";

function startOfDay(d = new Date()) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}
function startOfMonth(d = new Date()) {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

export async function getSummary(req, res) {
  const now = new Date();
  const todayStart = startOfDay(now);
  const monthStart = startOfMonth(now);

  const [
    todaySales,
    monthSales,
    totalProducts,
    lowStockCount,
    outOfStockCount,
    valuationRows,
    recentSales,
    bestSellerGroups,
  ] = await Promise.all([
    prisma.sale.aggregate({ where: { createdAt: { gte: todayStart }, status: { not: "VOID" } }, _sum: { totalAmount: true }, _count: true }),
    prisma.sale.aggregate({ where: { createdAt: { gte: monthStart }, status: { not: "VOID" } }, _sum: { totalAmount: true }, _count: true }),
    prisma.product.count({ where: { status: "ACTIVE" } }),
    // Indexed lookup instead of pulling every variant down and filtering in JS.
    prisma.productVariant.count({ where: { stockStatus: "LOW_STOCK" } }),
    prisma.productVariant.count({ where: { stockStatus: "OUT_OF_STOCK" } }),
    prisma.$queryRaw`
      SELECT COALESCE(SUM(v.stock * p."costPrice"), 0)::float AS "costValue"
      FROM "product_variants" v JOIN "products" p ON p.id = v."productId"
    `,
    prisma.sale.findMany({
      where: { status: { not: "VOID" } },
      orderBy: { createdAt: "desc" },
      take: 8,
      include: { customer: true, cashier: { select: { name: true } }, items: true },
    }),
    prisma.saleItem.groupBy({
      by: ["variantId"],
      where: { sale: { createdAt: { gte: monthStart }, status: { not: "VOID" } } },
      _sum: { quantity: true, lineTotal: true },
      orderBy: { _sum: { quantity: "desc" } },
      take: 5,
    }),
  ]);

  // One follow-up query for all best-seller variants at once (was: one
  // findUnique per row in a loop — an N+1 that scaled with `take`).
  const bestSellerVariants = await prisma.productVariant.findMany({
    where: { id: { in: bestSellerGroups.map((g) => g.variantId) } },
    include: { product: true },
  });
  const variantById = new Map(bestSellerVariants.map((v) => [v.id, v]));
  const bestSellers = bestSellerGroups.map((g) => {
    const variant = variantById.get(g.variantId);
    return {
      variantId: g.variantId,
      name: variant?.product.name,
      size: variant?.size,
      color: variant?.color,
      quantitySold: g._sum.quantity,
      revenue: g._sum.lineTotal,
    };
  });

  // Gross profit for the month — one query joining sale items to their
  // variant's product cost, rather than loading everything into JS.
  const monthSaleItems = await prisma.saleItem.findMany({
    where: { sale: { createdAt: { gte: monthStart }, status: { not: "VOID" } } },
    select: { quantity: true, lineTotal: true, variant: { select: { product: { select: { costPrice: true } } } } },
  });
  const monthProfit = monthSaleItems.reduce((sum, item) => {
    const cost = Number(item.variant.product.costPrice) * item.quantity;
    return sum + (Number(item.lineTotal) - cost);
  }, 0);

  res.json({
    todaySales: { total: todaySales._sum.totalAmount || 0, count: todaySales._count },
    monthSales: { total: monthSales._sum.totalAmount || 0, count: monthSales._count },
    monthProfit,
    totalProducts,
    lowStockCount,
    outOfStockCount,
    inventoryValue: valuationRows[0]?.costValue || 0,
    bestSellers,
    recentSales: recentSales.map((s) => ({
      id: s.id,
      invoiceNumber: s.invoiceNumber,
      total: s.totalAmount,
      customer: s.customer?.name || "Walk-in",
      cashier: s.cashier.name,
      itemCount: s.items.length,
      createdAt: s.createdAt,
    })),
  });
}

// Daily sales for the last 14 days, for the dashboard line/bar chart.
export async function getSalesChart(req, res) {
  const days = 14;
  const since = startOfDay(new Date(Date.now() - (days - 1) * 24 * 60 * 60 * 1000));

  const sales = await prisma.sale.findMany({
    where: { createdAt: { gte: since }, status: { not: "VOID" } },
    select: { createdAt: true, totalAmount: true },
  });

  const buckets = new Map();
  for (let i = 0; i < days; i++) {
    const d = new Date(since.getTime() + i * 24 * 60 * 60 * 1000);
    buckets.set(d.toISOString().slice(0, 10), 0);
  }
  for (const sale of sales) {
    const key = sale.createdAt.toISOString().slice(0, 10);
    buckets.set(key, (buckets.get(key) || 0) + Number(sale.totalAmount));
  }

  res.json({ data: Array.from(buckets.entries()).map(([date, total]) => ({ date, total })) });
}

// Revenue grouped by category for the last 30 days — new for the dashboard
// upgrade. Aggregated in SQL rather than pulling every sale item to JS.
export async function getCategoryPerformance(req, res) {
  const since = startOfDay(new Date(Date.now() - 29 * 24 * 60 * 60 * 1000));

  const rows = await prisma.$queryRaw`
    SELECT COALESCE(c.name, 'Uncategorized') AS category,
           SUM(si."lineTotal")::float AS revenue,
           SUM(si.quantity)::int AS "unitsSold"
    FROM "sale_items" si
    JOIN "sales" s ON s.id = si."saleId"
    JOIN "product_variants" v ON v.id = si."variantId"
    JOIN "products" p ON p.id = v."productId"
    LEFT JOIN "categories" c ON c.id = p."categoryId"
    WHERE s."createdAt" >= ${since} AND s.status != 'VOID'
    GROUP BY c.name
    ORDER BY revenue DESC
    LIMIT 8
  `;

  res.json({ data: rows });
}

// Small feed for the dashboard's "recent activity" panel — a lighter
// projection than the full activity-logs page.
export async function getRecentActivity(req, res) {
  const logs = await prisma.activityLog.findMany({
    orderBy: { createdAt: "desc" },
    take: 10,
    include: { user: { select: { name: true } } },
  });
  res.json({ data: logs });
}
