import { ApiError } from "../utils/ApiError.js";

/**
 * Pure helper — the single definition of what counts as low/out of stock,
 * used both here (to persist `stockStatus`) and anywhere that needs to
 * classify a stock number without hitting the DB (e.g. a form preview).
 */
export function computeStockStatus(stock, lowStockThreshold) {
  if (stock <= 0) return "OUT_OF_STOCK";
  if (stock <= lowStockThreshold) return "LOW_STOCK";
  return "IN_STOCK";
}

// Back-compat alias used by a few controllers that already pass a full
// variant object (`{ stock, lowStockThreshold }`).
export function stockStatus(variant) {
  return computeStockStatus(variant.stock, variant.lowStockThreshold);
}

/**
 * Applies a stock change to a ProductVariant and writes the corresponding
 * InventoryTransaction row, atomically, inside an existing Prisma
 * transaction client (`tx`). This is intentionally the ONLY function in the
 * codebase allowed to touch `productVariant.stock` — every purchase, sale,
 * return, damage report, or manual adjustment must route through here so the
 * running stock count and the transaction ledger can never disagree.
 *
 * Concurrency note: this used to be a `findUnique` -> compute-in-JS ->
 * `update`, which is a classic lost-update race - two concurrent sales of
 * the last unit could both read stock=1 and both write stock=0. The fix is
 * to make the WRITE itself conditional: `updateMany` with a
 * `stock >= -change` guard in the WHERE clause means the database only
 * applies the decrement if there's still enough stock *at the moment the
 * row is actually written*, and we detect a lost race by checking
 * `count === 0`.
 *
 * @param {import('@prisma/client').Prisma.TransactionClient} tx
 * @param {object} params
 * @param {string} params.variantId
 * @param {number} params.change - signed delta, e.g. +10 for a purchase, -2 for a sale
 * @param {'PURCHASE'|'SALE'|'RETURN'|'DAMAGE'|'ADJUSTMENT'} params.type
 * @param {string} [params.reason]
 * @param {string} [params.referenceType]
 * @param {string} [params.referenceId]
 * @param {string} [params.userId]
 * @param {boolean} [params.allowNegative] - allow stock to go below 0 (rare; off by default)
 */
export async function applyInventoryChange(tx, {
  variantId,
  change,
  type,
  reason = null,
  referenceType = null,
  referenceId = null,
  userId = null,
  allowNegative = false,
}) {
  if (!Number.isInteger(change) || change === 0) {
    throw ApiError.badRequest("Inventory change must be a non-zero integer");
  }

  const variant = await tx.productVariant.findUnique({ where: { id: variantId } });
  if (!variant) throw ApiError.notFound("Product variant not found");

  let updateResult;
  if (change < 0 && !allowNegative) {
    // Conditional decrement: only succeeds if enough stock still exists
    // at write time, regardless of what we read a moment ago.
    updateResult = await tx.productVariant.updateMany({
      where: { id: variantId, stock: { gte: -change } },
      data: { stock: { increment: change } },
    });
    if (updateResult.count === 0) {
      // Someone else consumed the stock between our read and our write.
      const fresh = await tx.productVariant.findUnique({ where: { id: variantId } });
      throw ApiError.badRequest(
        `Not enough stock for ${variant.sku} (have ${fresh?.stock ?? 0}, needed ${-change})`
      );
    }
  } else {
    await tx.productVariant.updateMany({
      where: { id: variantId },
      data: { stock: { increment: change } },
    });
  }

  const updatedVariant = await tx.productVariant.findUnique({ where: { id: variantId } });
  const nextStatus = computeStockStatus(updatedVariant.stock, updatedVariant.lowStockThreshold);
  if (nextStatus !== updatedVariant.stockStatus) {
    await tx.productVariant.update({ where: { id: variantId }, data: { stockStatus: nextStatus } });
    updatedVariant.stockStatus = nextStatus;
  }

  const transaction = await tx.inventoryTransaction.create({
    data: { variantId, change, type, reason, referenceType, referenceId, createdById: userId },
  });

  return { variant: updatedVariant, transaction };
}
