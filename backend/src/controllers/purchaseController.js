import { z } from "zod";
import { prisma } from "../config/prisma.js";
import { ApiError } from "../utils/ApiError.js";
import { parsePagination, buildMeta } from "../utils/pagination.js";
import { applyInventoryChange } from "../services/inventoryService.js";
import { logActivity } from "../services/activityLogService.js";

const purchaseSchema = z.object({
  supplierId: z.string().min(1),
  invoiceNumber: z.string().min(1),
  date: z.string().datetime().optional(),
  notes: z.string().optional().nullable(),
  items: z
    .array(
      z.object({
        variantId: z.string().min(1),
        quantity: z.number().int().positive(),
        purchasePrice: z.number().min(0),
      })
    )
    .min(1, "Add at least one line item"),
});

export async function listPurchases(req, res) {
  const pagination = parsePagination(req.query);
  const { supplierId } = req.query;
  const where = supplierId ? { supplierId } : {};

  const [items, total] = await Promise.all([
    prisma.purchase.findMany({
      where,
      include: { supplier: true, createdBy: { select: { name: true } }, items: { include: { variant: { include: { product: true } } } } },
      orderBy: { createdAt: "desc" },
      skip: pagination.skip,
      take: pagination.take,
    }),
    prisma.purchase.count({ where }),
  ]);

  res.json({ data: items, meta: buildMeta(pagination, total) });
}

export async function getPurchase(req, res) {
  const purchase = await prisma.purchase.findUnique({
    where: { id: req.params.id },
    include: { supplier: true, createdBy: { select: { name: true } }, items: { include: { variant: { include: { product: true } } } } },
  });
  if (!purchase) throw ApiError.notFound("Purchase not found");
  res.json({ data: purchase });
}

// Creating a purchase (1) records the purchase + line items and
// (2) increases stock for every variant, each as its own audited
// InventoryTransaction — all inside a single DB transaction so a failure
// partway through can never leave stock partially updated.
export async function createPurchase(req, res) {
  const data = purchaseSchema.parse(req.body);

  const totalAmount = data.items.reduce((sum, i) => sum + i.quantity * i.purchasePrice, 0);

  const purchase = await prisma.$transaction(async (tx) => {
    const created = await tx.purchase.create({
      data: {
        supplierId: data.supplierId,
        invoiceNumber: data.invoiceNumber,
        date: data.date ? new Date(data.date) : new Date(),
        notes: data.notes || null,
        totalAmount,
        createdById: req.user.id,
        items: {
          create: data.items.map((i) => ({
            variantId: i.variantId,
            quantity: i.quantity,
            purchasePrice: i.purchasePrice,
          })),
        },
      },
      include: { items: true },
    });

    for (const item of created.items) {
      await applyInventoryChange(tx, {
        variantId: item.variantId,
        change: item.quantity,
        type: "PURCHASE",
        referenceType: "PURCHASE",
        referenceId: created.id,
        userId: req.user.id,
      });
    }

    return tx.purchase.findUnique({
      where: { id: created.id },
      include: { supplier: true, items: { include: { variant: { include: { product: true } } } } },
    });
  });

  await logActivity({ action: "PURCHASE_ADDED", entity: "Purchase", entityId: purchase.id, userId: req.user.id, details: { totalAmount } });
  res.status(201).json({ data: purchase });
}
