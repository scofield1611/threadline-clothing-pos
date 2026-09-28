/**
 * A hand-written fake of the slice of the Prisma transaction client that
 * inventoryService.applyInventoryChange actually uses. This is NOT a mock
 * that just records calls — it maintains real in-memory state for one
 * ProductVariant row and applies the same WHERE-clause semantics Postgres
 * would, so the tests can genuinely exercise the "does the conditional
 * update actually block an oversell" property, not just check that
 * functions were called.
 */
export function createFakeTx(initialVariant) {
  let variant = { ...initialVariant };
  const inventoryTransactions = [];

  return {
    // Exposed for assertions in tests.
    _state: {
      get variant() {
        return variant;
      },
      get transactions() {
        return inventoryTransactions;
      },
      // Lets a test simulate "someone else's transaction already ran"
      // between our findUnique read and our updateMany write.
      mutateStockDirectly(newStock) {
        variant = { ...variant, stock: newStock };
      },
    },

    productVariant: {
      async findUnique({ where }) {
        if (where.id !== variant.id) return null;
        return { ...variant };
      },

      async updateMany({ where, data }) {
        if (where.id !== variant.id) return { count: 0 };

        // Mirrors the real WHERE clause: `stock: { gte: N }` — only matches
        // (and therefore only applies) if the CURRENT row satisfies the
        // condition, not the value the caller read earlier.
        if (where.stock && typeof where.stock.gte === "number") {
          if (variant.stock < where.stock.gte) {
            return { count: 0 };
          }
        }

        if (data.stock?.increment !== undefined) {
          variant = { ...variant, stock: variant.stock + data.stock.increment };
        }
        if (data.stockStatus) {
          variant = { ...variant, stockStatus: data.stockStatus };
        }
        return { count: 1 };
      },

      async update({ where, data }) {
        if (where.id !== variant.id) throw new Error("not found");
        variant = { ...variant, ...data };
        return { ...variant };
      },
    },

    inventoryTransaction: {
      async create({ data }) {
        const row = { id: `tx_${inventoryTransactions.length + 1}`, ...data };
        inventoryTransactions.push(row);
        return row;
      },
    },
  };
}
