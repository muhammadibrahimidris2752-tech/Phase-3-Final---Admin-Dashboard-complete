# Kitchen & Home By Noor

A mobile-first storefront with on-site ordering, staff tools, and a
now-functional admin dashboard — built as a static site (no build
step, no bundler) on plain ES modules, with Firebase/Firestore/EmailJS
wired in as real, live integrations (not stubs).

Placing an order runs a stock-safe Firestore transaction (saves the
order and decrements inventory atomically, or saves nothing if stock
just ran out), saves to local order history, emails the admin and
customer via EmailJS, and opens WhatsApp with the order details — all
from the same "Place Order" click, with every step independent of the
others so a failed email or a blocked popup never blocks the order
itself.

**For full architectural detail, what's built, what's postponed, and
the security review for the admin dashboard phase, see
[PROJECT_SUMMARY.md](./PROJECT_SUMMARY.md).** This file stays a short,
current-at-a-glance overview; that one is the deep dive, kept
up to date the same way this one is.

## Project structure

```
index.html              Customer-facing site — all pages live here, toggled by showPage()
admin/index.html        Admin dashboard — real login/role gate, live Products/Orders/
                         Customers/Analytics/Dashboard/Settings pages

css/
  tokens.css             Design tokens — colors, type, spacing, radius (light + dark theme). Load first.
  base.css               Reset, base elements, .container, page switcher, buttons, page-head, toast
  header-nav.css         Header, desktop nav, hamburger + drawer, footer, mobile bottom nav
  search.css             Search bar — desktop's simple bar and the mobile overlay (back/clear/recent)
  home.css               Hero (desktop only), trust strip, category tiles, Featured Products, toolbar
  products.css           Product card grid + qty stepper (shared by catalog and cart) + out-of-stock state
  cart-checkout.css      Cart list, order summary, fulfilment/payment method step, checkout panel
  content-pages.css      About, FAQ, Contact
  account-orders.css     My Account, My Orders (status tabs + tracking timeline)
  admin.css              Admin dashboard styles — layout, tables, modals, toggles, analytics bars
  responsive.css         min-width overrides for the customer site (mobile-first; linked after the above)
  animations.css         @keyframes, shared by both surfaces

js/
  app.js                 Storefront entry point: startup sequencing + the onclick="" window bridge
  config.js               Site settings — brand name, WhatsApp number, EmailJS keys, delivery charge, etc.
  store.js                Central state (Store, setState, render dispatcher)
  products.js              Product data layer — Firestore-first with sample-data fallback, plus a live
                           subscription (subscribeToProductUpdates) shared by the storefront and admin
  cart.js                  Cart logic (add/remove/change qty, totals, stock-aware caps)
  checkout.js              Fulfilment/payment step, order code, history, stock-safe order placement, both emails
  order-status.js          The one canonical order-status/timeline model
  order-tracking.js        My Orders: status tabs + per-order tracking timeline (reused by the admin Orders page)
  search.js                Search overlay (mobile) + recent-searches persistence
  account.js               My Account page (profile, settings, notification toggles, sign out)
  ui.js                    Catalog/cart/FAQ/About/Contact rendering, navigation, theme, toast
  admin.js                 Verify Order staff tool + shared admin toast + live dashboard stats
  admin-products.js        Admin Products page: table, search, Add/Edit/Delete
  admin-orders.js          Admin Orders page: live feed, search, status filter, detail view, status updates
  admin-customers.js       Admin Customers page: customer list derived from order history
  admin-analytics.js       Admin Analytics page: revenue trend, order-status breakdown, top products
  dashboard.js             Admin dashboard bootstrap: login gate, role check, nav, wiring every admin module
  auth.js                  Firebase Authentication — Google + email/password sign-in, role checks (staff)
  firebase.js              Firebase init — lazy-loads the SDK only once real config is present
  firestore.js             All Firestore reads/writes — products, orders (incl. the stock-check transaction), profiles, carts
  utils.js                 formatNaira, buildWaLink
  inventory-config.js      Stock thresholds (LOW_STOCK_WARNING, DEFAULT_STOCK, ALLOW_BACKORDER) — now in real use
  product-category.js      Category list — now in real use (the admin product form's Category select)
  product-brands.js,
  product-schema.js       Brand list / product-form shape — product-schema.js now in real use (admin
                           Add/Edit form defaults); product-brands.js still scaffolded, not yet imported

data/
  products.sample.js      Fallback catalog (40 sample items, now with stock values) — see PROJECT_SUMMARY.md
  faqs.js                  FAQ content

assets/
  images/ icons/ logos/    Empty for now — where product photos etc. will go
images/categories/         Category tile images (bags/shoes/watches/accessories/all)

firebase.json              Firebase project config (Hosting + Firestore, not required for GitHub Pages)
firestore.rules            Real, scoped rules per collection — see PROJECT_SUMMARY.md's security review
firestore.indexes.json     The composite index order history/sync needs (userId asc + date desc)
```

## Architecture overview

Two independent front ends share one design system: the **storefront**
(`index.html` → `js/app.js`) and the **admin dashboard**
(`admin/index.html` → `js/dashboard.js`). Both are plain static HTML —
there's no build step, so anything you see here is exactly what ships.

Storefront state lives in one place (`js/store.js`): a `Store.state`
object, a `setState()` that merges patches, and a `render()` dispatcher
that redraws whatever's currently visible. The admin dashboard doesn't
share this `Store` — it keeps its own simpler page-switching and its
own live-data caches (see `js/admin-orders.js`, `js/products.js`).

Rendering functions build HTML as template strings with
`onclick="functionName()"` attributes on both sides — the same pattern
the project has always used — and `js/app.js` / `js/dashboard.js` each
end with their own `Object.assign(window, {...})` bridge exposing every
function their own page's inline HTML calls this way (ES module
exports aren't automatically global). Static elements that never get
regenerated (login forms, sidebar nav, the product form) are wired
with plain `addEventListener` instead, on both sides.

Products are only ever read through `js/products.js`'s `getProducts()`
/ `getActiveProducts()` / `getProductById()` / `getCategories()` —
nothing else touches `data/products.sample.js` directly. That's what
lets `loadProducts()` try Firestore first and silently fall back to
the sample data, and it means a real catalog can replace the sample
one with no other file changing. `subscribeToProductUpdates()` keeps
this live after the initial load, for both the storefront and the
admin dashboard.

Circular imports exist between several files by design, and are safe
because nothing calls a cross-imported function at module load
time — see PROJECT_SUMMARY.md for the full, verified list (built by
parsing the actual import graph, not eyeballed).

## Local development

Browsers block ES module imports when a page is opened directly from
disk (`file://…`) — you'll get a blank page and a CORS-looking console
error. This doesn't affect the live site at all (GitHub Pages serves
over real HTTPS), but locally you need to serve the folder over HTTP:

```bash
python3 -m http.server 8000        # then open http://localhost:8000
# or
npx serve
```

Or use your editor's "Live Server" extension. Once it's a
`http://localhost:...` URL, everything behaves exactly like the live
site.

Firebase CLI is set up for this project (`kitchen-and-home-by-noor`)
on Node.js v22. After any change to `firestore.rules` or
`firestore.indexes.json`, deploy with:

```bash
firebase deploy --only firestore:rules,firestore:indexes
```

## Current limitations

See **PROJECT_SUMMARY.md → Intentionally postponed** for the full,
current list (payments, image upload to Storage, editable settings,
the real product catalog, and a couple of smaller known gaps) —
kept in one place instead of duplicated here so it can't drift out of
sync with itself across two files.
