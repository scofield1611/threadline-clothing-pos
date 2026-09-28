# ThreadLine — Commercial Polish Pass

Scope: no new business modules, no architecture changes — purely making
the existing app feel like finished, sellable software. Ordered by the
priority given.

## 1. POS usability (the main ask)

**Before:** a 3-column CSS grid where a long cart pushed the whole page
into scroll, and the payment/checkout panel could scroll out of view along
with everything else.

**After:** the POS page now anchors to the viewport height at desktop
widths (`lg:h-full lg:overflow-hidden`, with `min-h-0` threaded through
every flex ancestor — the classic CSS gotcha that silently breaks internal
scroll containers if you miss one). Concretely:
- The cart list is now the *only* thing that scrolls, in its own bounded
  region — scanner input and customer picker stay pinned at the top, so a
  cashier never loses their place while scanning a large order.
- The payment panel (method selection, mixed-payment breakdown, Hold/Charge)
  is a visually distinct panel pinned to the bottom of the right column
  (`lg:sticky lg:bottom-0`) — it is never scrolled out of reach, which was
  the literal "sticky payment panel" ask.
- Payment method buttons are larger (44px+ touch targets), icon-labeled
  (Banknote/Smartphone/CreditCard/Layers), and use `aria-pressed` for the
  active state.
- Scanner + customer picker were merged into one compact header card
  instead of two separate cards, cutting vertical space so more of the
  cart is visible without scrolling in the common case.
- The Charge button now shows the actual amount (`Charge ₹1,234`) instead
  of a bare shortcut hint, so the cashier's eye doesn't have to jump to the
  total above it to confirm what they're about to charge.
- Mobile (below `lg`) intentionally keeps simple natural-stacking + page
  scroll rather than fighting the same flex-height math on small screens —
  the no-scroll treatment is a desktop-POS-terminal optimization, not
  something that translates well to a narrow phone viewport.

## 2. Dashboard polish

- Split the flat 8-card stat grid into a **primary KPI row** (4 larger
  cards: Today's Sales, Monthly Sales, Monthly Profit, Inventory Value)
  and a **compact secondary info bar** (Total Products, Low/Out of Stock,
  Orders Today) — real visual hierarchy instead of 8 identically-weighted
  boxes.
- Staggered fade-in on stat cards and quick actions on mount (respects
  `prefers-reduced-motion`, see Accessibility below).
- Consistent row-hover states on Best Sellers / Recent Activity / Recent
  Sales, and Best Sellers now uses the same `EmptyState` component as
  everywhere else instead of a bare paragraph.
- Added a "View all" link from Recent Sales to Reports.

## 3. Responsive design

- Navbar title now truncates instead of overflowing on narrow screens.
- Fixed a missing `aria-label` on the mobile menu button while touching
  that file.
- POS breakpoint behavior described above.

## 4. Premium UI/UX

- `Card` component now has a subtle hover-elevation transition
  (`shadow-card` -> `shadow-elevated`) — one small central change that
  lifts the whole app's perceived quality since every screen uses it.
- Buttons now have tactile press feedback (`active:scale-[0.98]`),
  disabled under `prefers-reduced-motion`.
- Payment method selector and quick actions use icon + label instead of
  bare text/icon-only, consistent with the "premium SaaS" reference points
  (Stripe/Shopify) named in the original brief.

## 5. Accessibility

- **Skip-to-content link** — previously a keyboard user had to tab through
  the entire sidebar on every single page before reaching content.
- **Toast notifications now have `aria-live="polite"`** — they were purely
  visual before; a screen reader user got no indication a sale succeeded
  or failed.
- **`prefers-reduced-motion` respected globally** — all animations/
  transitions collapse to near-zero duration for anyone who's asked their
  OS for reduced motion, which matters more now that hover/mount animation
  is used more throughout the app.
- Consistent `focus-visible` ring app-wide, not just on the components that
  already set it explicitly.
- Cart quantity is now an `aria-live="polite"` region so a screen reader
  announces the new count after +/- without extra chatter elsewhere.
- Filled in the last couple of missing `aria-label`s found during this pass
  (Navbar mobile menu button).

## 6. Performance

- **Route-based code splitting.** Dashboard and POS (by far the two most-
  visited screens) stay in the initial bundle for zero loading-spinner
  delay; every secondary management screen (Products, Inventory, Purchases,
  Reports, Catalog, Activity Logs, Settings, Suppliers, Returns) is now
  `React.lazy`-loaded. This also means JsBarcode and PapaParse — real
  weight, only ever used on Inventory — are no longer in the bundle a
  cashier downloads just to open the POS.

## 7. Production-quality finishing touches

- **404 page + catch-all route** — previously an unmatched URL rendered
  nothing at all.
- **Favicon** (inline SVG, no image asset needed) plus `theme-color` and a
  meta description — small things a recruiter or client actually notices
  in a browser tab.

## Explicitly not touched in this pass

Per the brief: no new business modules, no architectural changes. The
remaining Phase B/C items from `PRODUCTION_REVIEW.md` (remaining `any`
types, a shared `DataTable`, structured logging, integer-based money) are
still open and still tracked there — this pass was scoped to usability and
finish, not to reopen that list.
