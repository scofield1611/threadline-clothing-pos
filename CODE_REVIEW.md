# ThreadLine POS — Code Review (Phase 1 → Phase 2)

Reviewed against the actual codebase, not generic checklist items. Each entry
references the real file/behavior. Ordered by severity within each category.

## 🔴 Critical (fixed in this pass)

1. **Lost-update race condition on stock** — `inventoryService.applyInventoryChange`
   does `findUnique` → compute in JS → `update`. Two concurrent sales of the
   last unit of a variant can both read `stock: 1`, both compute `0`, both
   write `0` — selling the same last item twice. The code comment claimed
   Prisma's update "serializes" this; it doesn't, on `READ COMMITTED`
   (Postgres default). **Fix:** conditional atomic update
   (`updateMany` with a `WHERE stock + change >= 0` guard, checked via
   `count`), so the write itself enforces the invariant instead of a JS
   read‑then‑write.

2. **`updateProduct` silently drops variants** — the Zod schema strips
   `variants` out (`const { variants, ...productFields } = data`) and never
   uses it. There is no way to add a new size/colour to an existing product,
   or edit a variant's price/threshold, without recreating the product from
   scratch. **Fix:** variant upsert support in `updateProduct`.

3. **Stock-filter pagination is wrong** — `listProducts`/`listStock` filter
   `LOW_STOCK`/`OUT_OF_STOCK` **after** the DB page is fetched. Page 1 of
   "Low stock" can legitimately show 0 or 3 results depending on what
   happened to be in that page of 50, and `meta.total` reports the
   unfiltered count. **Fix:** persist a `stockStatus` enum column on
   `ProductVariant`, updated atomically alongside `stock`, and filter/query
   on it directly (indexed, correct, and O(1) to check instead of recomputed
   every read).

4. **N+1 query in dashboard best-sellers** — `getSummary` does a
   `groupBy`, then loops and calls `productVariant.findUnique` once per
   result. **Fix:** single follow-up query with `id: { in: [...] }`.

5. **Returns have no over-return guard** — `createReturn` lets a return
   reference any `variantId`/`quantity` with no check against how much of
   that item was actually sold (or already returned) on that invoice. A
   cashier could refund the same item twice. **Fix:** validate remaining
   returnable quantity per sale item.

## 🟠 High

6. **POS auto-refocus breaks every other input** — `POSPage` attaches a
   `window` click listener that unconditionally refocuses the barcode
   scanner input. Clicking the discount field, tax rate, or a payment
   amount immediately loses focus back to the scanner. This alone made the
   discount/tax/payment fields effectively unusable by mouse. **Fixed** as
   part of the POS rework (refocus only when no other field is focused).

7. **Customer is never attached to a sale** — the POS checkout mutation
   never includes `customerId` in the request body, even though the backend
   supports it and the UI implies "Walk-in" vs a real customer. Every sale
   silently becomes a walk-in sale. **Fixed** with a real customer picker.

8. **Unbounced search inputs** — Products, Inventory, Customers pages fire
   a network request on every keystroke (`queryKey: ["products", search]`
   with no debounce). On a real catalog this is a meaningful load spike and
   a laggy typing experience. **Fixed** with a shared `useDebouncedValue`
   hook.

9. **No idempotency on checkout** — a slow network + a double click (or a
   retry) can submit the same cart twice before the button's `loading`
   state visually disables it. **Fixed** by generating a client-side
   idempotency key per cart and having the sale endpoint dedupe on it.

## 🟡 Medium

10. **CORS default falls back to `*`** in `app.js` when `CLIENT_ORIGIN` is
    unset — fine for local dev, a footgun in production. Left as-is
    functionally (documented in `.env.example`) since changing the default
    is a deploy-config decision, not a code bug — but now called out in the
    README/settings page.
11. **Missing composite index** for date-range dashboard/report queries —
    `Sale.createdAt` had no index; every "today"/"this month"/report query
    was a sequential scan once the sales table grows. Added.
12. **Duplicated list-page boilerplate** — Products, Inventory, Customers,
    Purchases each hand-roll the same search-bar-plus-table-plus-skeleton
    layout. Extracted into a shared `PageHeader` + kept per-page tables
    (full `DataTable` abstraction intentionally deferred — see notes below).
13. **Floating-point money accumulation** — line totals are rounded with
    `.toFixed(2)` per line but summed as JS floats; over many lines this can
    drift by fractions of a paisa. Not fixed in this pass (would mean
    switching the whole money path to integer paisa, which is a schema-wide
    change) — flagged for Phase 3, mitigated today by rounding at every
    aggregation boundary rather than only at the end.

## 🟢 Low / stylistic
- Inconsistent skeleton row counts across pages (cosmetic).
- No 404 route in the router.
- No favicon/app icon.

---

## What this pass implements (priority order requested)

1. **POS redesign** — barcode-first flow (bug fixed), customer picker,
   hold/resume bills, keyboard shortcuts (F2 scan, F4 charge, F6 hold, F7
   resume, Esc clear), printable receipt, idempotent checkout.
2. **Dashboard upgrade** — fixed N+1, category performance chart, quick
   actions, recent activity feed, top-products already present now backed
   by a cleaner query.
3. **Inventory upgrade** — Inventory History (timeline) page wired to the
   existing `/inventory/history` endpoint (backend already had it — there
   was just no UI), stock valuation card, low-stock alert banner, barcode
   label printing, CSV bulk import.
4. **UI polish** — shared `PageHeader`, debounce hook, small consistency
   fixes to spacing/empty states across touched pages.
5. **Business workflows** — Store Settings (new, minimal model), receipt
   component reused by POS, CSV/PDF-via-print export kept and extended.

## Explicitly deferred (called out, not silently skipped)
- Full `DataTable` abstraction (sortable/resizable columns) — real value,
  but a genuine rewrite of every list page; flagged for a dedicated pass
  rather than rushed here.
- Integer-based money storage — correct long-term fix, too invasive for
  "don't redesign the architecture."
- Multi-currency / multi-store — out of scope per current schema.
