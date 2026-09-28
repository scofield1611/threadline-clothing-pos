import { z } from "zod";
import crypto from "crypto";
import { prisma } from "../config/prisma.js";
import { ApiError } from "../utils/ApiError.js";
import { parsePagination, buildMeta } from "../utils/pagination.js";
import { applyInventoryChange } from "../services/inventoryService.js";
import { logActivity } from "../services/activityLogService.js";

const saleSchema = z.object({
  clientRef: z.string().min(1).optional(),
  customerId: z.string().optional().nullable(),
  items: z
    .array(
      z.object({
        variantId: z.string().min(1),
        quantity: z.number().int().positive(),
      })
    )
    .min(1, "Cart is empty"),
  discount: z
    .object({
      type: z.enum(["FLAT", "PERCENTAGE", "COUPON"]),
      value: z.number().min(0),
      couponCode: z.string().optional(),
    })
    .optional()
    .nullable(),
  taxRate: z.number().min(0).max(1).optional().default(0), // e.g. 0.05 for 5% GST
  payments: z
    .array(
      z.object({
        method: z.enum(["CASH", "UPI", "CARD", "MIXED"]),
        amount: z.number().positive(),
      })
    )
    .min(1, "At least one payment is required"),
});

function nextInvoiceNumber() {
  // Human-readable, sortable invoice numbers. The old version used
  // Math.random() over only 900 possible values combined with a
  // second-resolution timestamp — two sales completing in the same second
  // had a real, non-trivial chance of colliding and throwing a raw
  // "invoice number already exists" error at the cashier. crypto.randomBytes
  // gives a far larger, cryptographically random suffix, making a collision
  // astronomically unlikely instead of merely unlikely. The unique
  // constraint on Sale.invoiceNumber remains as a hard backstop either way.
  const now = new Date();
  const stamp = now.toISOString().replace(/[-:.TZ]/g, "").slice(0, 14);
  const suffix = crypto.randomBytes(4).toString("hex").toUpperCase();
  return `INV-${stamp}-${suffix}`;
}

function computeDiscount(subtotal, discount) {
  if (!discount) return 0;
  if (discount.type === "FLAT" || discount.type === "COUPON") return Math.min(discount.value, subtotal);
  if (discount.type === "PERCENTAGE") return +(subtotal * (discount.value / 100)).toFixed(2);
  return 0;
}

export async function listSales(req, res) {
  const pagination = parsePagination(req.query);
  const { from, to, cashierId } = req.query;

  const where = {
    AND: [
      cashierId ? { cashierId } : {},
      from || to
        ? { createdAt: { gte: from ? new Date(from) : undefined, lte: to ? new Date(to) : undefined } }
        : {},
    ],
  };

  const [items, total] = await Promise.all([
    prisma.sale.findMany({
      where,
      include: {
        customer: true,
        cashier: { select: { name: true } },
        items: { include: { variant: { include: { product: true } } } },
        payments: true,
      },
      orderBy: { createdAt: "desc" },
      skip: pagination.skip,
      take: pagination.take,
    }),
    prisma.sale.count({ where }),
  ]);

  res.json({ data: items, meta: buildMeta(pagination, total) });
}

export async function getSale(req, res) {
  const sale = await prisma.sale.findUnique({
    where: { id: req.params.id },
    include: {
      customer: true,
      cashier: { select: { name: true } },
      items: { include: { variant: { include: { product: true } } } },
      payments: true,
    },
  });
  if (!sale) throw ApiError.notFound("Sale not found");
  res.json({ data: sale });
}

// The full POS checkout flow. Cashier-accessible.
export async function createSale(req, res) {
  const data = saleSchema.parse(req.body);

  // Idempotent checkout: if this exact cart submission (identified by its
  // client-generated key) already went through, hand back the original
  // sale instead of charging/decrementing stock a second time.
  if (data.clientRef) {
    const existing = await prisma.sale.findUnique({
      where: { clientRef: data.clientRef },
      include: { customer: true, items: { include: { variant: { include: { product: true } } } }, payments: true },
    });
    if (existing) return res.status(200).json({ data: existing, deduplicated: true });
  }

  const sale = await prisma.$transaction(async (tx) => {
    // Load current prices/stock for every requested variant in one query.
    const variants = await tx.productVariant.findMany({
      where: { id: { in: data.items.map((i) => i.variantId) } },
      include: { product: true },
    });

    const variantMap = new Map(variants.map((v) => [v.id, v]));
    for (const item of data.items) {
      if (!variantMap.has(item.variantId)) {
        throw ApiError.notFound(`Variant ${item.variantId} not found`);
      }
    }

    const lineItems = data.items.map((item) => {
      const variant = variantMap.get(item.variantId);
      const unitPrice = Number(variant.price ?? variant.product.sellPrice);
      return {
        variantId: item.variantId,
        quantity: item.quantity,
        unitPrice,
        lineTotal: +(unitPrice * item.quantity).toFixed(2),
      };
    });

    const subtotal = +lineItems.reduce((sum, i) => sum + i.lineTotal, 0).toFixed(2);
    const discountAmount = computeDiscount(subtotal, data.discount);
    const taxableAmount = subtotal - discountAmount;
    const taxAmount = +(taxableAmount * data.taxRate).toFixed(2);
    const totalAmount = +(taxableAmount + taxAmount).toFixed(2);

    const paidAmount = +data.payments.reduce((sum, p) => sum + p.amount, 0).toFixed(2);
    if (Math.abs(paidAmount - totalAmount) > 0.01) {
      throw ApiError.badRequest(`Payment total (${paidAmount}) does not match invoice total (${totalAmount})`);
    }

    const created = await tx.sale.create({
      data: {
        invoiceNumber: nextInvoiceNumber(),
        clientRef: data.clientRef || null,
        customerId: data.customerId || null,
        cashierId: req.user.id,
        subtotal,
        discountAmount,
        taxAmount,
        totalAmount,
        discountType: data.discount?.type || null,
        discountValue: data.discount?.value || null,
        couponCode: data.discount?.couponCode || null,
        items: { create: lineItems },
        payments: { create: data.payments },
      },
      include: { items: true, payments: true },
    });

    // Decrement stock for every line item — this is where a sale actually
    // touches inventory, and it will throw (rolling back the whole sale)
    // if any variant doesn't have enough stock.
    for (const item of created.items) {
      await applyInventoryChange(tx, {
        variantId: item.variantId,
        change: -item.quantity,
        type: "SALE",
        referenceType: "SALE",
        referenceId: created.id,
        userId: req.user.id,
      });
    }

    return tx.sale.findUnique({
      where: { id: created.id },
      include: {
        customer: true,
        items: { include: { variant: { include: { product: true } } } },
        payments: true,
      },
    });
  });

  await logActivity({ action: "SALE_CREATED", entity: "Sale", entityId: sale.id, userId: req.user.id, details: { total: sale.totalAmount } });
  res.status(201).json({ data: sale });
}
