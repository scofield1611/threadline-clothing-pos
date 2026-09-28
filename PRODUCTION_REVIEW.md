# ThreadLine POS — Production Readiness Review

Staff-engineer pass. Every item below was verified against the actual code
(grep/read, not assumption) before being listed. Format per item: severity,
why it matters, fix, and whether it blocks "production/portfolio" quality.

---

## 1. Architecture

### 1.1 — No test suite anywhere in the project
**Severity: Critical**
Zero `.test.` / `.spec.` files, no test runner configured in either
`package.json`. The most complex, highest-risk logic in the app
(`applyInventoryChange`'s conditional-update race fix, discount/tax math,
return over-refund guard) has no regression protection — a future edit
could silently reintroduce the oversell bug fixed last phase and nothing
would catch it.
**Fix:** Add a minimal test harness (Vitest) and cover the highest-risk
units first: `computeStockStatus`, the inventory transaction math, discount
calculation. Not full coverage — targeted coverage of the logic that has
already broken once.
**Fix before portfolio: Yes.**

### 1.2 — Separation of concerns is otherwise solid
Controllers stay thin, business logic lives in `services/`, validation is
centralized with Zod schemas per controller. This is a genuine strength —
noting it so the roadmap below doesn't read as all-negative.

### 1.3 — No API versioning
**Severity: Low**
Routes are `/api/products`, not `/api/v1/products`. Fine for a single
internal client today; would bite if a second client (mobile app) needs a
different contract later.
**Fix before production: No** — premature for current scope.

---

## 2. Backend

### 2.1 — No rate limiting on any endpoint, especially `/api/auth/login`
**Severity: High**
`grep` for `rate-limit`/`rateLimit` across `backend/` returns nothing, and
no package is installed. `POST /api/auth/login` will accept unlimited
attempts per second from a single IP — a brute-force script can try
thousands of passwords against `owner@store.com` with no friction at all.
**Fix:** Add `express-rate-limit`, apply a strict limiter to `/api/auth/*`
(e.g. 10 requests/minute per IP) and a looser general limiter to the rest
of the API.
**Fix before production: Yes.**

### 2.2 — CORS config is contradictory when `CLIENT_ORIGIN` is unset
**Severity: Medium**
`app.js`: `cors({ origin: process.env.CLIENT_ORIGIN || "*", credentials: true })`.
The CORS spec forbids `Access-Control-Allow-Origin: *` together with
`Access-Control-Allow-Credentials: true` — browsers reject that combination
outright. If `CLIENT_ORIGIN` isn't set (e.g. a developer skips it because
`.env.example` makes it look optional), the app silently ships a CORS config
that **doesn't work**, and the failure mode is a confusing browser-console
CORS error that looks unrelated to the actual cause.
**Fix:** Require `CLIENT_ORIGIN` explicitly (fail fast at boot if missing in
production), don't fall back to `*` when `credentials: true` is set.
**Fix before production: Yes.**

### 2.3 — No startup validation of required environment variables
**Severity: Medium**
Nothing checks that `JWT_SECRET` or `DATABASE_URL` are actually set before
the server starts handling requests. A missing `JWT_SECRET` doesn't fail
loudly at boot — it fails later, per-request, the first time `jwt.sign` or
`jwt.verify` is called, producing a confusing runtime error instead of an
immediate, obvious "you forgot to configure this" message.
**Fix:** A small boot-time check in `server.js` that throws with a clear
message if required env vars are missing/too short.
**Fix before production: Yes.**

### 2.4 — Invoice numbers have a real (if small) collision window
**Severity: Medium**
```js
const stamp = now.toISOString().replace(/[-:.TZ]/g, "").slice(0, 14); // second resolution
return `INV-${stamp}-${Math.floor(Math.random() * 900 + 100)}`;
```
The timestamp component only has **second-level** resolution, and the
random suffix has only 900 possible values. Two sales completing within the
same second have a real (low but non-trivial, birthday-paradox) chance of
colliding — which throws a raw Prisma P2002 straight to the cashier as "A
record with this invoiceNumber already exists" instead of the sale just
succeeding. On a busy floor with multiple registers this is a real
day-one bug, not a hypothetical.
**Fix:** Use a collision-proof suffix (`crypto.randomUUID()` slice, or a
per-day DB sequence) instead of `Math.random()`.
**Fix before production: Yes** — cheap to fix, meaningfully reduces a
real (if rare) checkout failure.

### 2.5 — Malformed JSON request bodies produce an unhelpful 500
**Severity: Low**
`express.json()` throws a `SyntaxError` on invalid JSON before any route
handler runs; `errorHandler` has no branch for it, so it falls through to
the generic "Something went wrong on our end" 500 instead of a `400 Bad
Request`. Cosmetic today (no client currently sends malformed JSON), but
it's the kind of API-consistency gap that shows up during any real
integration work.
**Fix:** Add a `SyntaxError` branch to `errorHandler` returning 400.
**Fix before production: Yes** — trivial, improves API consistency.

### 2.6 — Bulk import has no upper bound on row count
**Severity: Medium**
`bulkImportProducts`: `z.array(importRowSchema).min(1).parse(...)` — no
`.max()`. A CSV with 50,000 rows would be accepted and processed serially
(one `$transaction` per row), tying up a request thread and the DB
connection pool for an extended period.
**Fix:** Cap at something reasonable (e.g. 1,000 rows/import) and tell the
person to split larger files.
**Fix before production: Yes** — one line, real DoS/perf exposure.

### 2.7 — `requireAuth` hits the database on every single request
**Severity: Low**
Every authenticated request does a `prisma.user.findUnique` just to check
`isActive` and re-attach role. Correct behavior (a deactivated user's
existing token stops working immediately), but at scale this is a DB round
trip per request that a short-lived in-memory cache (or including
`isActive`/`role` in the JWT with a short expiry) could reduce.
**Fix before production: No** — correct and safe as-is; only worth
revisiting if request volume becomes a bottleneck.

---

## 3. Database

### 3.1 — Most foreign-key columns have no index
**Severity: High**
Verified directly against `schema.prisma`: relation scalar columns like
`Product.categoryId`, `Product.brandId`, `Purchase.supplierId`,
`Purchase.createdById`, `PurchaseItem.purchaseId`, `PurchaseItem.variantId`,
`Sale.customerId`, `Sale.cashierId`, `SaleItem.saleId`, `SaleItem.variantId`,
`Return.saleId`, `ReturnItem.returnId`, `ReturnItem.variantId`,
`ActivityLog.userId` have **no `@@index`**. This is a common Prisma+Postgres
gotcha: unlike MySQL, Postgres does **not** get an automatic index on a
relation's scalar field just because `@relation` is declared. Every one of
those columns is used in a `WHERE`/`JOIN` somewhere in this codebase
(customer purchase history, supplier purchase history, dashboard
aggregates, sale-item joins in reports). On a real dataset (thousands of
sales) these become sequential scans.
**Fix:** Add `@@index` on every FK column that's queried — done in this
pass (see schema diff).
**Fix before production: Yes.**

### 3.2 — Money is `Decimal` in Postgres but floats in application code
**Severity: Medium**
The schema does the right thing (`Decimal(12,2)` everywhere), but
`saleController`/`POSPage` compute subtotal/discount/tax with plain JS
numbers and round with `.toFixed(2)` at each step. This is a known,
previously-documented tradeoff — re-flagging it here because a
"production-readiness" review should treat money-math-by-float as a
standing risk, not a solved problem, even though today's
rounding-at-each-boundary approach avoids the worst cases.
**Fix before production: No** — correct fix (integer minor-units
throughout) is a genuine schema-wide change, disproportionate to do as a
drive-by here. Documented, not silently ignored.

### 3.3 — Cascade rules are sound but implicit
**Severity: Low**
`ProductVariant.onDelete: Cascade` from `Product` is intentional and
correct (deleting a product should take its variants with it), while
`SaleItem`/`PurchaseItem`/`ReturnItem` → `ProductVariant` has no explicit
`onDelete`, which defaults to `Restrict` in Postgres — meaning you
literally cannot delete a variant that has sales history, which is the
right behavior. Worth a schema comment so a future engineer doesn't "fix"
it by adding `onDelete: Cascade` there, which would silently destroy sales
history.
**Fix before production: No** — behavior is already correct; added a
clarifying comment only.

---

## 4. Frontend

### 4.1 — Backend pagination exists; frontend never uses it
**Severity: High**
Every list endpoint returns `meta.totalPages`/`meta.total`, but a repo-wide
search for `totalPages` turns up exactly one hit — the TypeScript type
definition itself. Every list page (`Products`, `Inventory`, `Customers`,
`Suppliers`, `Purchases`) requests `pageSize: 50` and **silently shows only
the first 50 rows** with no indication more exist. A store with 60 products
cannot see the last 10 anywhere in the UI. This isn't a cosmetic gap, it's
a functional data-visibility bug.
**Fix:** A shared `Pagination` component + wiring into the affected pages.
**Fix before production: Yes.**

### 4.2 — Query invalidation gaps leave stale data on screen
**Severity: High**
`POSPage`'s checkout `useMutation` has **zero** `invalidateQueries` calls.
After a sale completes, `Inventory` (stock counts) and `Dashboard`
(today's sales, low-stock counts) are still showing pre-sale data for up
to `staleTime` (15s) or until a manual refresh. Separately,
`ProductFormDrawer` only invalidates `["products"]` — creating a product
with opening stock never invalidates `["inventory"]` or
`["inventory-summary"]`, so the Inventory page can show a product as
"out of stock" moments after it was created with 20 units on hand.
**Fix:** Invalidate `["inventory"]`, `["inventory-summary"]`,
`["dashboard-summary"]` (and friends) at the actual mutation sites that
change stock.
**Fix before production: Yes.**

### 4.3 — Form labels are not programmatically associated with their inputs
**Severity: High (Accessibility)**
`LoginPage` and `POSPage` correctly pair `<Label htmlFor="x">` with
`<Input id="x">`. Everywhere else — `CustomersPage`, `SuppliersPage`,
`PurchasesPage`, `ReturnsPage`, `SettingsPage`, `InventoryPage`'s adjust
drawer, `ProductFormDrawer` — labels and inputs are visually adjacent but
have no `htmlFor`/`id` link. A screen reader announces these inputs with no
accessible name at all. This is the single most common, most-checked
accessibility failure (WCAG 2.1 SC 1.3.1/4.1.2) and would be caught
immediately by any accessibility audit or a recruiter running Lighthouse.
**Fix:** A small `FormField` wrapper (label + input, auto-generated `id` via
`useId()`) used across the affected forms — fixes it once, structurally,
instead of patching each form by hand.
**Fix before production: Yes.**

### 4.4 — Several icon-only buttons have no accessible name
**Severity: Medium (Accessibility)**
The barcode-label print button in `InventoryPage` (`<Tag />` with no text
or `aria-label`), the mobile sidebar close button, and the `Drawer`'s close
button all render an icon with no text and no `aria-label`. A screen reader
announces "button" with no indication of what it does.
**Fix:** Add `aria-label` to each.
**Fix before production: Yes** — trivial, meaningful for real
accessibility compliance.

### 4.5 — Widespread `any` typing undercuts the TypeScript story
**Severity: Medium**
16 occurrences of `: any` / `as any` across page components (sale rows in
`ReportsPage`/`PurchasesPage`, log rows in `ActivityLogsPage`, history rows
in `CustomersPage`/`SuppliersPage`). The project is pitched as a
TypeScript codebase, but a meaningful slice of the data flowing through the
UI has no type checking at all — a backend field rename wouldn't be caught
by the compiler in these spots.
**Fix:** Define the missing response types (`Sale`, `Purchase`, `Return`,
`ActivityLog`) in `types/index.ts` and use them instead of `any`.
**Fix before production: No, but should be Phase B** — real but not
blocking; the `any`s are in read-only display code, not logic.

### 4.6 — Duplicated list-page boilerplate
**Severity: Low**
Already flagged in the prior review pass and still true: `Products`,
`Inventory`, `Customers`, `Suppliers`, `Purchases` each hand-roll their own
search bar + table + skeleton + empty state. Not wrong, just repetitive —
a shared `DataTable` would reduce this by half. Deliberately not rushed
into this pass (rewriting five list pages is a bigger, riskier change than
the accessibility/pagination fixes above, which don't require touching
table markup).
**Fix before production: No** — Phase C.

---

## 5. UI/UX

### 5.1 — Dashboard/Inventory pagination and cache-staleness issues
Covered above (4.1, 4.2) — repeating here only to note these are as much
UX bugs (a cashier not seeing real stock levels) as engineering bugs.

### 5.2 — Loading-vs-empty flash on Dashboard's new panels
**Severity: Low**
`categoryPerformance`/`recentActivity` panels check `!data?.length` without
checking `isLoading` first, so there's a brief flash of "No sales in the
last 30 days yet" before the real data arrives on a slow connection.
**Fix:** Gate on `isLoading` the same way the rest of the dashboard already
does.
**Fix before production: Yes** — small, but it's a visible bug on every
page load.

### 5.3 — Keyboard accessibility of the core flows is actually good
POS shortcuts (F2/F4/F6/F7), Radix `Dialog`/`Select` (built-in focus trap +
Escape-to-close), and real `<button>`/`<input>` elements throughout are all
correct. Noting this so the roadmap isn't read as "everything is broken" —
the interaction layer is solid; the gaps are specifically in label wiring
and icon-only buttons, not keyboard operability.

---

## 6. Security

### 6.1 — No rate limiting (repeated from 2.1 — it's the single biggest security gap)

### 6.2 — No account lockout after repeated failed logins
**Severity: Medium**
Related to but distinct from rate limiting: even with rate limiting, there's
no per-account lockout/backoff after N failed attempts on a specific email.
**Fix before production: No** — rate limiting closes most of the practical
risk for a single-store deployment; full lockout is a Phase B nice-to-have.

### 6.3 — CSRF: not applicable, and that's correctly reflected in the code
Bearer-token JWT in an `Authorization` header (not a cookie) is immune to
classic CSRF by construction — noting this explicitly as a reviewed-and-fine
item rather than a gap, since "CSRF considerations" was explicitly asked
for.

### 6.4 — XSS: no `dangerouslySetInnerHTML` anywhere in the codebase
Verified — React's default JSX escaping is relied on everywhere, correctly.

---

## 7. Performance

### 7.1 — No route-level code splitting
**Severity: Low**
`AppRouter` statically imports every page; the whole app (including
Recharts, all page components) ships in one bundle. At the current page
count this isn't yet a real problem, but it's the kind of thing that gets
expensive quietly.
**Fix before production: No** — Phase C; revisit if bundle size actually
becomes a complaint.

### 7.2 — Missing DB indexes (3.1) are the real performance risk here, not the frontend

---

## 8. Developer Experience

### 8.1 — `npm run lint` is broken out of the box
**Severity: Medium**
`frontend/package.json` defines `"lint": "eslint ."` but there is no
ESLint config file anywhere in the repo. Running the documented lint
command fails immediately with "no configuration found." For a project
whose whole pitch is production-quality code, a broken lint script is a bad
first impression the moment someone tries to contribute.
**Fix:** Add a real `eslint.config.js` (flat config) with the React +
TypeScript recommended rule sets.
**Fix before production: Yes** — cheap, and it's the first command anyone
new to the repo will run.

### 8.2 — No structured logging
**Severity: Low**
`console.log`/`console.error` throughout. Fine for local dev, not fine for
anything resembling production ops (no log levels, no request correlation).
**Fix before production: No** — Phase C; a real logger (pino) is easy to
add later and doesn't change behavior today.

---

## 9. Portfolio Quality — honest assessment

**What would impress a recruiter or client today:** the inventory-ledger
design (stock only ever changes through one audited function), the RBAC
model, the POS UX detail (hold/resume, keyboard shortcuts, barcode-first
flow), and the fact that the last review cycle's bugs were *real* bugs with
*real* fixes, not busywork.

**What would reduce confidence, in order:**
1. Zero tests — the first question any senior engineer asks about a
   "production-quality" claim is "show me the tests," and there are none.
2. A broken `npm run lint` — a five-second check that immediately
   undercuts the "production quality" framing.
3. Silent data loss via unindexed pagination (4.1) — a demo where someone
   adds a 60th product and it just vanishes from the list is a bad look.
4. Accessibility gaps that any Lighthouse run would surface immediately.

None of these are hard to fix — that's good news, not bad. They're exactly
the kind of gaps that separate "a working demo" from "software someone
reviewed carefully," and closing them is what Phase A below does.

---

## Roadmap

### Phase A — Must fix before portfolio (implemented in this pass)
- [x] A1. Add missing FK indexes across the schema (3.1)
- [x] A2. Rate limiting on `/api/auth/*` and the general API (2.1)
- [x] A3. Fix CORS credentials/wildcard contradiction (2.2)
- [x] A4. Startup env-var validation (2.3)
- [x] A5. Collision-resistant invoice numbers (2.4)
- [x] A6. `SyntaxError` -> 400 in the error handler (2.5)
- [x] A7. Cap bulk-import row count (2.6)
- [x] A8. Shared `Pagination` component wired into list pages — Products,
      Inventory, Customers, Suppliers, Purchases, and Activity Logs (4.1)
- [x] A9. Fix query-invalidation gaps after checkout, product creation,
      stock adjustments, purchases, and returns (4.2)
- [x] A10. Real `htmlFor`/`id` label association applied across every form
      in the app (Settings, Customers, Suppliers, Purchases, Returns,
      Inventory adjust, Product form), plus a `Select` component fix so
      labels can actually target it (4.3)
- [x] A11. `aria-label` on icon-only buttons: sidebar close, drawer close,
      POS cart quantity/remove controls, inventory label-print, customer
      picker clear (4.4)
- [x] A12. Fix loading/empty flash on the dashboard's category-performance
      and recent-activity panels (5.2)
- [x] A13. Real ESLint flat config so `npm run lint` actually works (8.1)
- [x] A14. Vitest harness + a focused regression suite for
      `applyInventoryChange`/`computeStockStatus` — including a test that
      directly reproduces the "two sales race for the last unit" scenario
      that was the actual bug fixed last phase (1.1)

### Phase B — Should improve (not done in this pass, tracked)
- Replace remaining `any` types with real response types (4.5)
- Per-account login lockout in addition to rate limiting (6.2)
- Reduce list-page boilerplate with a shared `DataTable` (4.6)

### Phase C — Nice to have
- Route-level code splitting (7.1)
- Structured logging (8.2)
- API versioning (1.3)
- Integer-based money storage (3.2, still tracked from the last review)
