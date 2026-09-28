import { z } from "zod";
import { prisma } from "../config/prisma.js";
import { parsePagination, buildMeta } from "../utils/pagination.js";
import { applyInventoryChange } from "../services/inventoryService.js";
import { logActivity } from "../services/activityLogService.js";

// GET /api/inventory — current stock across all variants, with low/out filters.
// Filter is applied via the persisted `stockStatus` column, so pagination and
// meta.total are correct (previously this filtered the already-paginated
// page in JS, which gave wrong counts and could show empty pages).
export async function listStock(req, res) {
  const pagination = parsePagination(req.query);
  const { search, filter } = req.query; // filter: LOW_STOCK | OUT_OF_STOCK

  const where = {
    AND: [
      search
        ? {
            OR: [
              { sku: { contains: search, mode: "insensitive" } },
              { barcode: { contains: search, mode: "insensitive" } },
              { product: { name: { contains: search, mode: "insensitive" } } },
            ],
          }
        : {},
      filter === "LOW_STOCK" || filter === "OUT_OF_STOCK" ? { stockStatus: filter } : {},
    ],
  };

  const [items, total] = await Promise.all([
    prisma.productVariant.findMany({
      where,
      include: { product: { include: { brand: true, category: true } } },
      orderBy: { updatedAt: "desc" },
      skip: pagination.skip,
      take: pagination.take,
    }),
    prisma.productVariant.count({ where }),
  ]);

  res.json({ data: items, meta: buildMeta(pagination, total) });
}

// GET /api/inventory/summary — valuation + low/out counts for the inventory
// page header. Kept as one grouped query rather than pulling every variant
// down to the client to sum in JS.
export async function getInventorySummary(req, res) {
  const [valuationRows, lowStockCount, outOfStockCount, totalVariants] = await Promise.all([
    prisma.$queryRaw`
      SELECT COALESCE(SUM(v.stock * p."costPrice"), 0)::float AS "costValue",
             COALESCE(SUM(v.stock * COALESCE(v.price, p."sellPrice")), 0)::float AS "retailValue"
      FROM "product_variants" v
      JOIN "products" p ON p.id = v."productId"
    `,
    prisma.productVariant.count({ where: { stockStatus: "LOW_STOCK" } }),
    prisma.productVariant.count({ where: { stockStatus: "OUT_OF_STOCK" } }),
    prisma.productVariant.count(),
  ]);

  res.json({
    costValue: valuationRows[0]?.costValue || 0,
    retailValue: valuationRows[0]?.retailValue || 0,
    lowStockCount,
    outOfStockCount,
    totalVariants,
  });
}

// GET /api/inventory/history?variantId=
export async function listInventoryHistory(req, res) {
  const pagination = parsePagination(req.query);
  const { variantId, type } = req.query;
  const where = {
    AND: [variantId ? { variantId } : {}, type ? { type } : {}],
  };

  const [items, total] = await Promise.all([
    prisma.inventoryTransaction.findMany({
      where,
      include: { variant: { include: { product: true } }, createdBy: { select: { name: true } } },
      orderBy: { createdAt: "desc" },
      skip: pagination.skip,
      take: pagination.take,
    }),
    prisma.inventoryTransaction.count({ where }),
  ]);

  res.json({ data: items, meta: buildMeta(pagination, total) });
}

const adjustmentSchema = z.object({
  variantId: z.string().min(1),
  change: z.number().int().refine((v) => v !== 0, "Change cannot be zero"),
  type: z.enum(["DAMAGE", "ADJUSTMENT"]),
  reason: z.string().min(1, "A reason is required for manual stock changes"),
});

// POST /api/inventory/adjust — manual correction or damage report.
// This is the ONLY endpoint that lets a human directly move stock outside
// of a purchase/sale/return, and it still goes through applyInventoryChange
// so it's fully logged in the ledger like everything else.
export async function createAdjustment(req, res) {
  const data = adjustmentSchema.parse(req.body);

  const result = await prisma.$transaction((tx) =>
    applyInventoryChange(tx, {
      variantId: data.variantId,
      change: data.change,
      type: data.type,
      reason: data.reason,
      referenceType: "MANUAL",
      userId: req.user.id,
    })
  );

  await logActivity({
    action: data.type === "DAMAGE" ? "STOCK_DAMAGE_REPORTED" : "STOCK_ADJUSTED",
    entity: "ProductVariant",
    entityId: data.variantId,
    userId: req.user.id,
    details: { change: data.change, reason: data.reason },
  });

  res.status(201).json({ data: result });
}
