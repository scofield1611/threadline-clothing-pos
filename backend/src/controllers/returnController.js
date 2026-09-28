import { z } from "zod";
import { prisma } from "../config/prisma.js";
import { ApiError } from "../utils/ApiError.js";
import { applyInventoryChange } from "../services/inventoryService.js";
import { logActivity } from "../services/activityLogService.js";

const returnSchema = z.object({
  saleId: z.string().min(1),
  type: z.enum(["RETURN", "EXCHANGE"]),
  reason: z.string().optional().nullable(),
  items: z
    .array(
      z.object({
        variantId: z.string().min(1),
        quantity: z.number().int().positive(),
        refundAmount: z.number().min(0),
      })
    )
    .min(1),
});

export async function createReturn(req, res) {
  const data = returnSchema.parse(req.body);

  const sale = await prisma.sale.findUnique({ where: { id: data.saleId }, include: { items: true } });
  if (!sale) throw ApiError.notFound("Original sale not found");

  // How much of each variant was already returned/exchanged against this
  // sale, so we can enforce: quantity returned now + already returned <=
  // quantity originally sold. Without this, the same item could be
  // refunded twice.
  const previousReturnItems = await prisma.returnItem.findMany({
    where: { return: { saleId: data.saleId } },
  });
  const alreadyReturnedByVariant = new Map();
  for (const item of previousReturnItems) {
    alreadyReturnedByVariant.set(item.variantId, (alreadyReturnedByVariant.get(item.variantId) || 0) + item.quantity);
  }

  for (const requested of data.items) {
    const soldItem = sale.items.find((si) => si.variantId === requested.variantId);
    if (!soldItem) {
      throw ApiError.badRequest(`This variant was not part of invoice ${sale.invoiceNumber}`);
    }
    const alreadyReturned = alreadyReturnedByVariant.get(requested.variantId) || 0;
    const remaining = soldItem.quantity - alreadyReturned;
    if (requested.quantity > remaining) {
      throw ApiError.badRequest(
        `Cannot return ${requested.quantity} units — only ${remaining} of ${soldItem.quantity} sold are still returnable`
      );
    }
  }

  const result = await prisma.$transaction(async (tx) => {
    const created = await tx.return.create({
      data: {
        saleId: data.saleId,
        type: data.type,
        reason: data.reason || null,
        items: { create: data.items },
      },
      include: { items: true },
    });

    // Returned/exchanged stock goes back on the shelf.
    for (const item of created.items) {
      await applyInventoryChange(tx, {
        variantId: item.variantId,
        change: item.quantity,
        type: "RETURN",
        referenceType: "RETURN",
        referenceId: created.id,
        userId: req.user.id,
      });
    }

    // Recompute total returned quantity vs total sold quantity across the
    // whole invoice (quantity-aware, not just "some row exists").
    const totalSold = sale.items.reduce((sum, i) => sum + i.quantity, 0);
    const allReturnItems = await tx.returnItem.findMany({ where: { return: { saleId: data.saleId } } });
    const totalReturned = allReturnItems.reduce((sum, i) => sum + i.quantity, 0);

    await tx.sale.update({
      where: { id: data.saleId },
      data: { status: totalReturned >= totalSold ? "RETURNED" : "PARTIALLY_RETURNED" },
    });

    return created;
  });

  await logActivity({ action: "RETURN_CREATED", entity: "Return", entityId: result.id, userId: req.user.id, details: { saleId: data.saleId, type: data.type } });
  res.status(201).json({ data: result });
}

export async function listReturns(req, res) {
  const returns = await prisma.return.findMany({
    include: { items: { include: { variant: { include: { product: true } } } }, sale: { select: { invoiceNumber: true } } },
    orderBy: { createdAt: "desc" },
    take: 100,
  });
  res.json({ data: returns });
}
