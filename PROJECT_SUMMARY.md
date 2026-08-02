# Kitchen & Home By Noor — Project Summary

Renamed from PHASE1_SUMMARY.md — this now covers three phases of work,
not just Phase 1, and this doc's whole purpose is to onboard a fresh
session cold, so it's kept current rather than frozen at Phase 1.
**If you're a fresh Claude session picking this project up: read this
file and README.md in full before touching anything, then verify
important claims against the actual code rather than trusting this
doc blindly** — it's a snapshot, and snapshots drift.

## Architecture

Two independent front ends sharing one design system: the storefront
(`index.html` → `js/app.js`) and the admin dashboard
(`admin/index.html` → `js/dashboard.js`). Plain static HTML/CSS/ES
modules — no build step, no bundler, no package.json, no `.git`.

All storefront state lives in `js/store.js`: one `Store.state` object,
`setState(patch)` that merges and re-renders, and a single `render()`
dispatcher that knows everything downstream of state. The admin
dashboard doesn't share this — it has its own simpler DOM-class-based
page switching in `js/dashboard.js`, and its own live-data caches (see
`js/admin-orders.js`, `js/products.js`) rather than a `Store`.

Rendering is template-string HTML with `onclick="fn()"` attributes —
deliberate, not legacy debt. Since ES module exports aren't global,
`js/app.js` and `js/dashboard.js` each end with their own
`Object.assign(window, {...})`, exposing every function referenced
this way in their respective page's generated HTML. Static elements
that never get regenerated (login forms, sidebar nav, the product
form, modal close buttons) use `addEventListener` instead — no bridge
needed for those.

Products flow through one seam: `js/products.js`'s
`getProducts()`/`getActiveProducts()`/`getProductById()`.
`loadProducts()` tries Firestore first, falls back to
`data/products.sample.js` on any failure or empty collection.
`subscribeToProductUpdates()` keeps this live after the initial load —
both the storefront and the admin dashboard read the same in-memory
cache and the same subscription; there's only ever one. Categories and
labels (new this update — see Category Management / Feature Labels
below) follow the exact same shape, each in their own module
(`js/categories.js`, `js/labels.js`) with their own Firestore-first/
sample-fallback load, shared cache, and live subscription — three
parallel, identically-structured data seams, not one growing more
special cases. `js/products.js`'s old `getCategories()`/
`getCategoryIcon()` are gone; category names are admin-managed records
now (`js/categories.js`'s `getCategoryName()`), not a value derived
from whatever's in the product list.

One canonical order-status/timeline model (`js/order-status.js`)
drives every tab, label, and both Delivery/Pickup timelines — reused
directly by the admin Orders page's detail view (see `trackingTimelineHTML()`
and `statusBadgeClass()`, exported from `js/order-tracking.js`
specifically for this reuse), so there's one timeline implementation,
not two.

### Circular imports (verified against the actual import graph, not eyeballed)

Circular imports exist by design and are safe, because nothing calls
an imported function at module load time — only from inside functions
that run later, in event handlers or async init. The full, accurate
picture, built by parsing every `import` statement:

```
store  <-> ui
store  <-> admin
store  <-> order-tracking
ui     <-> search
ui     <-> account
ui     <-> auth-ui
ui     <-> cart
ui     <-> checkout
admin  <-> admin-orders
```

Earlier docs (and an earlier audit) listed `ui <-> order-tracking` —
that pair isn't real; `order-tracking.js` never imports from `ui.js`.
Its real circular partner is `store.js`. `ui <-> cart` and
`ui <-> checkout` existed since Phase 1 but were never listed anywhere.
`admin <-> admin-orders` is new in Phase 3 (admin.js's
`getDashboardStats()` reads `admin-orders.js`'s order cache;
`admin-orders.js` calls admin.js's shared `showAdminToast()`).
`js/categories.js`, `js/labels.js`, `js/admin-categories.js`, and
`js/admin-labels.js` (new this update) introduce none — re-verified
against the full import graph after adding them, not assumed from
having written them one-directionally.

## What's built and verified

### Storefront UX (Phase 1 baseline)
Mobile bottom nav + trimmed hamburger, mobile search overlay with
recent searches, Featured Products, My Account/My Orders, the
Delivery/Pickup checkout step, the Verify Order staff tool. All intact.

### Firebase / Firestore / EmailJS — live, not stubs
`js/firebase.js` holds a real project config for
`kitchen-and-home-by-noor`, `js/config.js` has real EmailJS IDs.

### Customer Authentication, Profile, Order History, Persistent Cart (Phase 2)
Email/password sign-up & sign-in, Forgot Password, email verification
(informational, gates nothing), Change Password (reauthenticates
first). Profile Information/Addresses/Notification Preferences synced
to `users/{uid}` in Firestore, not localStorage. Order History live
via `subscribeToUserOrders()`, with `hiddenOrderIds` on the profile
doc so deleting history never touches the real order record. Cart
persisted to its own `carts/{uid}` collection, full-replace writes,
guest-cart-merges-into-account on sign-in.

**Cross-device sync (cart, order history, guest-cart-merge, profile)
has been tested and confirmed working** as of this phase — this was
an open question earlier in Phase 2's development and is now resolved.

### Admin Dashboard (Phase 3 — this phase)

**Product CRUD** (`js/admin-products.js`) — Add/Edit/Delete, backed by
the Firestore functions that already existed in `js/firestore.js`
(`addProductToFirestore`/`updateProductInFirestore`/
`deleteProductFromFirestore`) but were never called before this phase.
Form fields: Name, Category (a `<select>` rebuilt from live Firestore
categories every time the form opens — see Category Management below;
`js/product-category.js`'s old hardcoded `PRODUCT_CATEGORIES` list is
gone), Price, Stock quantity, Image URL (a URL field, not a file
upload — see Postponed below), a Labels checklist (see Feature Labels
below, replacing the old single Featured toggle), Available-on-storefront
toggle. New products get an automatic tint color, deterministically
hashed from the category id into a small fixed palette, so they fit
the existing visual language without the admin needing to pick one —
necessarily a hash now rather than a name lookup, since categories are
admin-defined and open-ended rather than a fixed hardcoded list.
`js/product-schema.js`'s scaffolded `EMPTY_PRODUCT` shape had a latent
bug — `category` instead of `cat`, which is what every other file
actually uses — fixed as part of putting this file into real use; its
shape has since moved on again to `catId`/`labels` (see below).

**Live Product Updates** — `js/products.js` now subscribes to the
Firestore `products` collection continuously (`subscribeToProductUpdates()`),
not just once at page load, mirroring the same pattern Phase 2 already
established for cart/order/profile sync. An edit made from the admin
dashboard reaches the storefront (and every open admin tab) without a
refresh. An empty Firestore collection still safely falls back to the
sample catalog, on every snapshot, not just the first load.

**Inventory Management** — Each product has a `stock` field
(`data/products.sample.js`'s 40 sample items now do too, so this is
demonstrable before any real product exists in Firestore). Placing an
order runs `saveOrderWithStockCheck()` (`js/firestore.js`): one
Firestore transaction that reads every line item's current stock,
aborts with **nothing written** — no order, no stock change — if any
item doesn't have enough, and otherwise writes the order and
decrements every item's stock atomically. This is race-safe: two
customers checking out the last unit at the same moment can't both
succeed, because Firestore retries the loser's transaction against
the now-current (sold-out) stock. The storefront disables/replaces the
add-to-cart control with an "Out of Stock" label once `stock` reaches
0 (`js/ui.js`), and `js/cart.js`'s `addToCart`/`changeQty` cap at
available stock with a toast rather than silently overselling in the
UI layer, before the transaction is ever the one catching it. See
**Security review** below for the Firestore rule this required.

**Order Management** (`js/admin-orders.js`) — Live feed of every order
(reusing `subscribeToOrders()`, aliased `subscribeToAllOrders`, which
already existed in `js/firestore.js` but was never wired to any UI).
Search by order ID, code, customer name/email/phone. Filter by status.
An order detail modal reuses the customer-facing timeline and status-
badge rendering directly (`trackingTimelineHTML()`/`statusBadgeClass()`,
exported from `js/order-tracking.js` for this reuse) and lets staff
change status via `updateOrderStatus()` (already existed, now called
for real). **The customer's own tracking timeline updates live from
this with no new mechanism** — it rides entirely on the
already-verified-working `startOrderHistorySync()` subscription; this
phase only needed to actually call the write.

**Dashboard Statistics** (`js/admin.js`'s `getDashboardStats()`) — Total
Products, Total Orders, Pending Orders (not yet delivered/picked-up,
and not cancelled), Completed Orders (delivered or picked-up),
Revenue (sum of all non-cancelled order totals), and Low Stock count
(reusing `js/inventory-config.js`'s already-scaffolded
`LOW_STOCK_WARNING` threshold rather than inventing a new number). All
computed live from the same shared products/orders caches everything
else on this page uses — nothing fetched separately. The Dashboard
page also shows a Recent Orders list (the 5 most recent), replacing an
old "coming in a later phase" placeholder that was no longer accurate
once the underlying data existed.

**Customers** (`js/admin-customers.js`) — Deliberately built from the
order cache, not by reading `users/{uid}` profile documents directly.
`firestore.rules` keeps that collection strictly owner-only, and every
order already carries the customer's name/email/phone — so this needs
no new data source and no rules change. The one real consequence: a
signed-up customer who has never placed an order won't appear here.
That's a deliberate tradeoff to avoid loosening a rule Phase 2 just
finished verifying, not an oversight — see Security review below.

**Category Management** (`js/categories.js`, `js/admin-categories.js` —
this update) — Replaces the old bundled category system entirely.
`js/product-category.js` (a hardcoded `PRODUCT_CATEGORIES` array) and
`images/categories/*.png` (five bundled category images) are both
deleted from the project; categories now live in their own Firestore
`categories` collection (`name`, `image` — a URL, same "URL field, not
a file upload" decision already made for products — `description`,
`active`, `sortOrder`), managed exclusively from a new Categories page
in the Admin Dashboard: Add/Edit/Delete, Hide/Show (the `active`
field, with a one-click toggle in the table as well as in the modal),
Reorder (Up/Down buttons that swap `sortOrder` with the adjacent row —
no drag-and-drop library, same "not worth a new dependency" call
Analytics already made), and Search. Products reference a category by
its Firestore document id (`catId`), not by name, so a rename in the
Admin Dashboard reaches every product card, the cart, the Verify Order
picker, and everywhere else a category name is shown, instantly and
without touching a single product document — `getCategoryName(catId)`
is the one place that resolution happens. The storefront's category
tiles and filter chips are now sourced directly from active categories
(`getActiveCategoriesSorted()`), not derived from whatever `cat`
values happened to exist across the current product list, so a
category with zero products yet is still visible and manageable. A
category with no Image URL set (or one whose URL fails to load) falls
back to a plain tinted initial letter rather than a broken image or a
bundled placeholder file — there are no bundled placeholder files left
to fall back to. Firestore-first with a sample-category fallback
(`SAMPLE_CATEGORIES` in `data/products.sample.js`) on empty/unreachable,
identical resilience rule to products — this is demo-mode-only
fallback content, not "bundled category data" in the sense the task
asked to remove; it plays the exact same role `SAMPLE_PRODUCTS` already
plays for products, and disappears the moment real categories exist.

**Feature Labels** (`js/labels.js`, `js/admin-labels.js` — this
update) — Replaces the old single `featured` boolean and the old ad
hoc `badge` string (which only ever held one of three fixed values:
New/Bestseller/Limited) with fully admin-managed, multi-assign labels.
Labels live in their own Firestore `labels` collection (`name`,
`enabled`), managed from a new Labels page: Create/Rename/Delete,
Enable/Disable, and "choose which products use each label" — a
dedicated modal listing every product with a checkbox per product,
diffed and batch-saved on Save, as the reverse-direction counterpart
to the per-product label checklist already in the product form (both
edit the same `product.labels` array, so either path keeps the other
in sync automatically via live sync). A product can carry any number
of labels; product cards render every enabled one as its own pill
(`.product-badges` in `css/products.css`, replacing the old single
`.product-badge`), stacked rather than limited to one. Deleting a
label cleans up its id from every product that had it assigned, rather
than leaving a dangling reference for `getEnabledLabelsForProduct()` to
filter out forever. The homepage's "Featured Products" strip and the
catalog's "New Arrivals"/"Best Sellers" quick filters — both
pre-existing features — are preserved by re-pointing them at this same
label system instead of the removed fields: "Featured Products" now
shows any product with at least one enabled label (the same
"badge-or-featured" condition as before, just expressed through
labels), and "New Arrivals"/"Best Sellers" match a product carrying an
enabled label named "New" / "Best Seller" (case-insensitive) rather
than a hardcoded field — an admin who creates labels with those exact
names (both are in the suggested list) gets the same quick filters
back with no code change. Firestore-first with a sample-label fallback
(`SAMPLE_LABELS`), same resilience rule as categories/products above.

**Analytics** (`js/admin-analytics.js`) — Revenue trend (last 7 days),
orders by status, top 5 products by quantity sold — all computed from
the same order cache, rendered as plain HTML/CSS bar rows. No charting
library: this project has no build step, and one library for three
simple bars wasn't worth the new dependency.

**Settings** — Kept the existing "Signed in as" section and added a
real, read-only Store Configuration section (store name, delivery
charge, low-stock threshold) sourced from `js/config.js` and
`js/inventory-config.js` — not fabricated placeholder text, and
honestly labeled as read-only, since editing these from the UI isn't
built yet (see Postponed below).

### Post-deploy bug fixes: Labels realtime sync (this update)

Four related bugs were reported after `firestore.rules` was deployed
and the Category Management / Feature Labels work was tested live.
All four traced back to two root causes — one wiring gap in the admin
dashboard's live-data setup, and one missing feature in the storefront
(labels were never actually wired into filtering at all, live-sync or
not). Nothing about `js/firestore.js`'s subscriptions themselves, or
about `js/categories.js`/`js/labels.js`'s cache shape, was wrong —
both were re-verified against `js/products.js`'s and
`js/categories.js`'s already-working equivalents and found identical
in structure. The fixes below are additive re-wiring, not a rewrite of
either module.

**Root cause 1 — the Labels page's product count is derived data with
no re-render trigger of its own.** `productCountForLabel()`
(`js/admin-labels.js`) has always computed live from
`getProducts()` — it was never stale data sitting in Firestore, it was
correctly computed from whatever was in memory at render time. The bug
was entirely about *when* `renderLabelsTable()` got called: checking
"Luxury" on a product is a write to the **products** collection (the
product's `labels` array), not the labels collection, so it fires
`subscribeToProductUpdates`, not `subscribeToLabelUpdates`. But
`js/dashboard.js`'s products subscription callback only ever called
`renderProductsTable()` — `renderLabelsTable()` was wired to the
*labels* subscription only. So a label's own product count went stale
after every product-side edit (assigning it in the product form, or
via the Labels page's own "Products" modal) and only came right again
if something else happened to touch the labels collection and force a
recompute. This explains Bug 1 exactly (Camaleonda Sofa showing
"Luxury — 0 products") and is most of what was being felt as Bug 2's
"sometimes requires a refresh" and Bug 4's synchronization complaints
— editing a label *document* (create/rename/enable/disable/delete)
was already live via the existing labels subscription; editing a
*product's* labels was the gap. Fixed by adding `renderLabelsTable()`
(and a new guarded `refreshLabelProductsModalIfOpen()`, for the
"Products using this label" modal specifically, in case it's open when
the underlying list changes) to the products subscription callback in
`js/dashboard.js`, alongside the `renderProductsTable()` call already
there — no new subscription, no polling, same realtime listener,
just also re-rendering the one more view that depends on its data.
`refreshLabelProductsModalIfOpen()` is intentionally guarded (a no-op
unless that modal is currently open) and intentionally leaves
`pendingSelection` — the admin's own in-progress, unsaved checkbox
edits — untouched even when it does refresh, re-deriving only the
product *list* (so an add/remove/rename stays current) rather than
the checked state, since blindly re-deriving checked state from live
data mid-edit could silently discard a checkbox the admin just
clicked.

**Root cause 2 — labels were never wired into storefront filtering at
all, dynamically or otherwise.** The original implementation kept
exactly two hardcoded quick filters, "New Arrivals" and "Best
Sellers," matched by searching a product's labels for one named
literally "new" or "best seller" (case-insensitive). That was a
deliberate preservation of two pre-existing homepage shortcuts, but it
meant *only* labels with those two exact names could ever become a
filter — creating a label called "Luxury," "Clearance," or anything
else, however enabled and assigned, never appeared as a filter chip
anywhere, live-synced or not, because no code path connected the
general set of labels to the chip row at all. This is Bug 3 exactly.
Fixed in `js/ui.js` by replacing both hardcoded chips with a fully
dynamic set: `renderChips()` now builds one chip per active category
*and* one chip per enabled label, straight from
`getActiveCategoriesSorted()`/`getEnabledLabels()` — the same two live
caches everything else already reads from — so a brand-new enabled
label becomes a working filter the moment its live subscription fires,
with no hardcoded name-matching involved. Category and label filter
values are now prefixed (`cat:<id>` / `label:<id>`) since they're two
independent Firestore collections whose document ids aren't guaranteed
distinct from each other; `getFilteredSorted()` and
`renderCategoryTiles()`'s tile links were updated to match. The
homepage's "Featured Products" strip (any product with at least one
enabled label) was untouched — it was never one of the two hardcoded
filters and was already fully dynamic.

**Also fixed while tracing "anywhere labels are displayed":**
`js/app.js`'s live subscriptions re-render the product grid, category
tiles, featured strip, and chips, but never touched the mobile search
overlay's own result cards (`renderSearchResults()`, `js/ui.js`) —
so a product card with label badges, if it happened to be visible in
an open search overlay at the moment a label or product changed,
would sit stale until the overlay was closed and reopened. All three
storefront subscriptions (products/categories/labels) now also call
`renderSearchResults(Store.state.search)`, which is a safe no-op when
the overlay is closed or empty.

**What was investigated and deliberately left alone:** both
`js/categories.js` and `js/labels.js` fall back to sample data
(`SAMPLE_CATEGORIES`/`SAMPLE_LABELS`) if their Firestore collection is
ever empty — including from the *admin's own* dashboard, not just the
storefront. If every real label were deleted, the Labels page would
show the three sample labels instead of an empty state, and trying to
edit one would fail (no matching Firestore document). This is a real,
confusing edge case, but it isn't one of the four reported bugs, a
refresh doesn't fix it (both the live path and a fresh page load hit
the identical fallback), and the exact same pattern already existed
for `js/products.js` before this phase — fixing it only for
categories/labels would be inconsistent, and restructuring
`js/products.js`'s cache to distinguish "admin true state" from
"storefront resilient state" is a meaningfully bigger change than this
bug-fix pass, with its own risk of breaking Products (explicitly out
of bounds for this round). Flagged here for a future phase rather than
folded in silently.

## Security review

Everything below was written or changed for this phase; the customer
sync systems from Phase 2 (`users/{uid}`, `carts/{uid}`, `orders/{orderId}`'s
existing rules) were **not** touched.

- **`firestore.rules` — one narrow addition to `products/{productId}`,
  plus two new collections (this update).** The `products/{productId}`
  rule itself: previously allowed writes only from an active
  owner-role admin. That rule is unchanged. A second, additive
  `allow update` was added, scoped as tightly as Firestore rules
  allow: a signed-in user (any signed-in user, not just staff) may
  change **only** the `stock` field on a product document, and only to
  a smaller number than it currently holds
  (`request.resource.data.diff(resource.data).affectedKeys().hasOnly(['stock'])`
  plus a strict `<` check, plus `>= 0`). Name, price, category, image,
  labels/active flags, and everything else still require the
  owner-role rule. This is what makes `saveOrderWithStockCheck()`'s
  transaction possible at all — without it, a customer's order-time
  stock decrement would be rejected outright. The tradeoff: this rule
  trusts the client to send a correctly-computed lower number; a
  determined attacker with dev tools open could call the Firestore SDK
  directly and decrement someone else's stock by an arbitrary (but
  still positive, still smaller, still stock-only) amount — a nuisance
  attack, not a data-integrity or privacy one, and not different in
  kind from what any client-authoritative pricing/inventory system
  without a Cloud Functions backend accepts. Closing this fully would
  need a Cloud Function trigger on order creation, doing the decrement
  server-side under admin privileges, immune to rules entirely — not
  built here, since this project has no Functions setup at all
  (Hosting + Firestore only; see `firebase.json`), and adding one is a
  meaningfully bigger infrastructure change than this phase's scope.
  New this update: `categories/{categoryId}` and `labels/{labelId}`
  each get their own rule block, identical in shape to
  `products/{productId}`'s base rule — public read, owner-role-only
  write — and deliberately **without** a customer-writable carve-out
  like the `stock` one above, since nothing about a category or a
  label is ever written by a signed-in customer; only the Admin
  Dashboard's Categories/Labels pages write to either collection. A
  label being assigned/unassigned to a product is a write to the
  *product* document (its `labels` array), governed by the existing
  `products/{productId}` owner-role rule, not by the new `labels`
  rule.
- **`admins/{uid}` and `users/{uid}` rules: untouched.** Customers page
  deliberately reads from orders instead of profiles for exactly this
  reason — see above.
- **No new Cloud Functions, no new third-party services.** Everything
  added runs client-side against the existing Firebase project.
- **`firestore.indexes.json`: unchanged.** Both new collections are
  read via `subscribeToCategories()`/`subscribeToLabels()`
  (`js/firestore.js`) with no `where()`/`orderBy()` in the query
  itself — identical to `subscribeToProducts()`'s existing shape.
  Active-filtering and `sortOrder`-sorting happen client-side in
  `js/categories.js`, so neither collection ever needs a composite
  index.
- **XSS surface:** every new piece of admin-rendered HTML (product
  rows, order rows, the order detail modal, customer rows, analytics
  labels, and now category rows, label rows, and the label-products
  checklist) interpolates data the same way the rest of this codebase
  already does — template strings, no sanitization library, matching
  the existing app-wide pattern (also true of every product name,
  customer name, and address on the storefront already). This isn't a
  new risk this phase introduced; it's the pre-existing trust model
  (the only writers are the store owner's own admin account and its
  own signed-in customers) carried forward unchanged.
- **`ORDER_CODE_SALT` and `DELIVERY_CHARGE`** are still the Phase 1/2
  placeholders (see Postponed) — unrelated to this phase, flagged
  again here since Settings now surfaces `DELIVERY_CHARGE` visibly.

## Intentionally postponed

- **Payments.** Paystack hasn't started — zero references anywhere in
  the codebase (verified by search, not assumed).
- **Image upload to Firebase Storage.** The admin product form takes
  an image URL directly. The original `uploadProductImage()` stub
  (which would have needed Storage, not just Firestore) was removed
  rather than left as dead code alongside the real URL-based flow.
- **Editable Settings.** Store name, delivery charge, and low-stock
  threshold now display real values, but changing them still means
  editing `js/config.js`/`js/inventory-config.js` directly — there's
  no Firestore-backed settings document or edit form yet.
- **Customers without any order.** See Security review — a real,
  known gap, not an oversight.
- **Admin pages showing sample data as if it were real, if a
  collection is ever fully emptied.** `js/products.js`,
  `js/categories.js`, and `js/labels.js` all fall back to sample data
  on an empty Firestore collection — good resilience for the
  storefront, but it means the Admin Dashboard's own Products/
  Categories/Labels pages would show that same fallback content (and
  fail confusingly if edited) rather than a genuine empty state, in
  the edge case where an admin deletes every real record in one of
  these collections. Noted during the Labels realtime-sync bug fixes
  (see above) but deliberately not changed there — it's not one of the
  reported bugs, refreshing doesn't fix it (the fallback is identical
  on a fresh load), and it already existed for products before this
  phase, so fixing it only for categories/labels would be
  inconsistent. Properly closing this means giving admin pages their
  own "real state only" read of these collections instead of sharing
  the storefront's resilient one — a small but real architecture
  change, better done deliberately in its own pass.
- **Backorder support.** `js/inventory-config.js`'s
  `ALLOW_BACKORDER: false` reflects what's actually built (stock can
  never go negative, no exceptions); toggling it to `true` isn't wired
  to anything.
- **The real Kitchen & Home catalog.** Still the same 40-item
  bags/shoes/watches/accessories sample set (now expressed as
  `catId`/`labels` referencing `SAMPLE_CATEGORIES`/`SAMPLE_LABELS`
  rather than the old `cat`/`badge` strings — see Category Management
  / Feature Labels above) — the admin dashboard can now replace it
  product-by-product, and categories/labels product-by-product too,
  but nothing has been added yet. The storefront's copy (hero section,
  About page, trust strip) is still fashion-store voice too, not just
  fashion-store data — worth a copy pass whenever the real catalog
  goes in, not just a data swap.
- **Drag-and-drop category reordering.** Up/Down buttons ship instead
  (see Category Management above) — no drag-and-drop library exists in
  this project, and reaching for one just for reordering wasn't judged
  worth the new dependency, the same call Analytics already made about
  charting.
- **Two config placeholders from earlier phases, still placeholders:**
  `DELIVERY_CHARGE` (flat NGN 1,500) and `ORDER_CODE_SALT`.
- **Confirming `firestore.rules`/`firestore.indexes.json` are live in
  the actual Firebase project**, not just correct in this repo copy —
  same caveat every phase has carried; only `firebase deploy` (or
  checking the Firebase console) can confirm that, not a code read.
  This now also covers the two new rule blocks for `categories` and
  `labels` (see Security review above) — neither collection will
  actually be writable from the Admin Dashboard until `firebase
  deploy --only firestore:rules` (or the console) picks them up.

## Development environment
Firebase CLI installed and working. Node.js v22. Firebase project:
`kitchen-and-home-by-noor`. Authentication and CLI setup complete.
