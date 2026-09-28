import { describe, it, expect } from "vitest";
import { applyInventoryChange, computeStockStatus } from "../inventoryService.js";
import { createFakeTx } from "./fakeTx.js";

describe("computeStockStatus", () => {
  it("returns OUT_OF_STOCK at zero", () => {
    expect(computeStockStatus(0, 5)).toBe("OUT_OF_STOCK");
  });

  it("returns OUT_OF_STOCK for negative stock", () => {
    expect(computeStockStatus(-3, 5)).toBe("OUT_OF_STOCK");
  });

  it("returns LOW_STOCK at exactly the threshold", () => {
    expect(computeStockStatus(5, 5)).toBe("LOW_STOCK");
  });

  it("returns LOW_STOCK just above zero", () => {
    expect(computeStockStatus(1, 5)).toBe("LOW_STOCK");
  });

  it("returns IN_STOCK above the threshold", () => {
    expect(computeStockStatus(6, 5)).toBe("IN_STOCK");
  });

  it("respects a per-variant threshold of zero (no low-stock warning until actually out)", () => {
    expect(computeStockStatus(1, 0)).toBe("IN_STOCK");
    expect(computeStockStatus(0, 0)).toBe("OUT_OF_STOCK");
  });
});

describe("applyInventoryChange", () => {
  function baseVariant(overrides = {}) {
    return { id: "v1", sku: "SKU-1", stock: 10, lowStockThreshold: 5, stockStatus: "IN_STOCK", ...overrides };
  }

  it("increases stock for a purchase and records the transaction", async () => {
    const tx = createFakeTx(baseVariant());
    const result = await applyInventoryChange(tx, { variantId: "v1", change: 5, type: "PURCHASE" });

    expect(result.variant.stock).toBe(15);
    expect(tx._state.transactions).toHaveLength(1);
    expect(tx._state.transactions[0]).toMatchObject({ variantId: "v1", change: 5, type: "PURCHASE" });
  });

  it("decreases stock for a sale within available stock", async () => {
    const tx = createFakeTx(baseVariant({ stock: 10 }));
    const result = await applyInventoryChange(tx, { variantId: "v1", change: -4, type: "SALE" });

    expect(result.variant.stock).toBe(6);
  });

  it("rejects a sale that would take stock negative, and writes no ledger row", async () => {
    const tx = createFakeTx(baseVariant({ stock: 2 }));

    await expect(applyInventoryChange(tx, { variantId: "v1", change: -5, type: "SALE" })).rejects.toThrow(/Not enough stock/);

    // The whole point of the guard: a rejected change must not leave a
    // stray InventoryTransaction row behind implying stock moved when it
    // didn't.
    expect(tx._state.transactions).toHaveLength(0);
    expect(tx._state.variant.stock).toBe(2);
  });

  it("rejects a zero change", async () => {
    const tx = createFakeTx(baseVariant());
    await expect(applyInventoryChange(tx, { variantId: "v1", change: 0, type: "ADJUSTMENT" })).rejects.toThrow();
  });

  it("rejects a non-integer change", async () => {
    const tx = createFakeTx(baseVariant());
    await expect(applyInventoryChange(tx, { variantId: "v1", change: 1.5, type: "ADJUSTMENT" })).rejects.toThrow();
  });

  it("recomputes and persists stockStatus when a sale crosses into LOW_STOCK", async () => {
    // Starts at 6 (IN_STOCK given threshold 5); selling 2 brings it to 4,
    // which should now be persisted as LOW_STOCK, not left stale as IN_STOCK.
    const tx = createFakeTx(baseVariant({ stock: 6, lowStockThreshold: 5, stockStatus: "IN_STOCK" }));
    const result = await applyInventoryChange(tx, { variantId: "v1", change: -2, type: "SALE" });

    expect(result.variant.stock).toBe(4);
    expect(result.variant.stockStatus).toBe("LOW_STOCK");
  });

  it("recomputes stockStatus to OUT_OF_STOCK when stock hits zero", async () => {
    const tx = createFakeTx(baseVariant({ stock: 1, stockStatus: "LOW_STOCK" }));
    const result = await applyInventoryChange(tx, { variantId: "v1", change: -1, type: "SALE" });

    expect(result.variant.stock).toBe(0);
    expect(result.variant.stockStatus).toBe("OUT_OF_STOCK");
  });

  // This is the regression test for the actual bug that was fixed: two
  // "concurrent" sales of the last unit of a variant must not both
  // succeed. We model concurrency the way it actually matters here — two
  // separate calls racing for the same last unit — rather than just
  // checking that a single call rejects a negative result.
  it("does not oversell the last unit when two sales race for it", async () => {
    const tx = createFakeTx(baseVariant({ stock: 1 }));

    const first = applyInventoryChange(tx, { variantId: "v1", change: -1, type: "SALE" });
    const second = applyInventoryChange(tx, { variantId: "v1", change: -1, type: "SALE" });

    const results = await Promise.allSettled([first, second]);
    const fulfilled = results.filter((r) => r.status === "fulfilled");
    const rejected = results.filter((r) => r.status === "rejected");

    // Exactly one of the two sales may succeed — this is the property the
    // old findUnique-then-update code violated (both could succeed).
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect(rejected[0].reason.message).toMatch(/Not enough stock/);

    // Final stock must be exactly 0, never negative, and never "1" (i.e.
    // the failed sale must not have silently also decremented).
    expect(tx._state.variant.stock).toBe(0);
    expect(tx._state.transactions).toHaveLength(1);
  });

  it("uses live stock at write time, not a value read before a concurrent mutation", async () => {
    const tx = createFakeTx(baseVariant({ stock: 1 }));

    // Simulate another already-committed transaction having consumed the
    // last unit before this call's write executes.
    tx._state.mutateStockDirectly(0);

    await expect(applyInventoryChange(tx, { variantId: "v1", change: -1, type: "SALE" })).rejects.toThrow(/Not enough stock/);
    expect(tx._state.variant.stock).toBe(0);
    expect(tx._state.transactions).toHaveLength(0);
  });

  it("allows a positive adjustment even when current stock is already zero", async () => {
    const tx = createFakeTx(baseVariant({ stock: 0, stockStatus: "OUT_OF_STOCK" }));
    const result = await applyInventoryChange(tx, { variantId: "v1", change: 8, type: "ADJUSTMENT", reason: "Recount" });

    expect(result.variant.stock).toBe(8);
    expect(result.variant.stockStatus).toBe("IN_STOCK");
  });

  it("throws for an unknown variant id", async () => {
    const tx = createFakeTx(baseVariant());
    await expect(applyInventoryChange(tx, { variantId: "does-not-exist", change: 1, type: "ADJUSTMENT" })).rejects.toThrow();
  });
});
