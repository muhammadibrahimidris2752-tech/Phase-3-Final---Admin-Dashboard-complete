import { renderChips, renderProductGrid, renderFeaturedProducts, renderSearchResults, updateCartBadge, renderCartPage } from './ui.js';
import { renderVerifyPage } from './admin.js';
import { renderHistoryPage } from './order-tracking.js';

/* ============ STORE ============================================
   Single owner of all mutable app state. setState() is the only
   way to mutate it, and it's also the only place that decides
   what needs to redraw — individual actions don't need to
   remember which render functions to call.

   Note on `history: []` below: it's intentionally NOT populated
   from localStorage right here at module load time. This file is
   imported in a cycle with ui.js/admin.js (they need Store, this
   file's render() needs their render functions) — ES modules handle
   that fine as long as nothing at the top level of any file calls
   into another before it's had a chance to load. app.js explicitly
   sets Store.state.history = loadHistoryFromStorage() as its first
   init step, before the first render(), which keeps that guarantee
   simple and explicit rather than relying on cross-file timing.
   ================================================================ */
export const Store = {
  state: {
    cart: {},          // { productId: qty }
    filter: 'All',
    sort: 'featured',
    search: '',
    history: [],        // [{ id, date, items, total, name, code }], newest first — see app.js init
    verify: {},         // { productId: qty } — staff-only Verify Order page, kept separate from the real cart
    fulfillment: 'delivery',  // 'delivery' | 'pickup' — checkout step, see js/checkout.js
    paymentMethod: null,      // set once the customer picks one of the options for their fulfilment method
    historyTab: 'All',        // My Orders filter tab — see js/order-tracking.js
    authReturnTo: 'account'   // where to go after a successful sign-in on the Sign In page — 'cart' when reached via checkout's "Prefer email?" link, 'account' otherwise. Set directly (not via setState) since it has no visual effect on its own — see js/account.js, js/checkout.js, and app.js's auth-state listener.
  }
};

export function setState(patch){
  Object.assign(Store.state, patch);
  render();
}

export function isPageActive(id){
  const el = document.getElementById('page-'+id);
  return !!el && el.classList.contains('active');
}

/** Single re-render dispatcher — the one place that knows what depends on Store.state. */
export function render(){
  updateCartBadge();
  renderChips();
  renderProductGrid();
  renderFeaturedProducts();
  renderSearchResults(Store.state.search);
  if(isPageActive('cart')) renderCartPage();
  if(isPageActive('history')) renderHistoryPage();
  if(isPageActive('verify')) renderVerifyPage();
}
