/* ============================================================
   Entry point / bootstrap. Loaded as <script type="module"> from
   index.html, so it (and everything it imports) is deferred
   automatically — no explicit defer attribute needed, and DOM
   content above it is already parsed by the time this runs.

   Two things this file — and only this file — is responsible for:

   1. Explicit startup sequencing. Store.state starts with safe
      empty defaults (see store.js); this is where it actually gets
      populated (loading products, loading saved order history)
      before the first render. Keeping this in one place, run after
      the whole module graph has loaded, sidesteps any question of
      which order modules with circular imports (store.js ↔ ui.js,
      store.js ↔ admin.js, store.js ↔ order-tracking.js, ui.js ↔
      search.js/account.js/auth-ui.js/cart.js/checkout.js — all safe,
      but only because none of them call each other at the top level)
      finish loading in.

   2. Bridging to the existing markup. Rendering functions in ui.js/
      admin.js/search.js/account.js/order-tracking.js/checkout.js
      build HTML as strings with onclick="functionName()" attributes —
      the same pattern the single-file version used, preserved on
      purpose rather than rewritten to addEventListener, since
      rewriting it would be a real behavioral change, not just a
      reorganization. Inline handlers look up their function by name
      on `window`, but ES module exports are NOT automatically
      attached to `window` the way old-style <script> globals were.
      The Object.assign(window, {...}) below is that bridge — it's
      not accidental global pollution, it's the one place doing this
      on purpose, for exactly the functions the HTML references.
   ============================================================ */
import { onAuthStateChangedListener, loginWithGoogle } from './auth.js';
import { Store, isPageActive } from './store.js';
import { loadProducts, subscribeToProductUpdates } from './products.js';
import { loadCategories, subscribeToCategoryUpdates } from './categories.js';
import { loadLabels, subscribeToLabelUpdates } from './labels.js';
import {
  initTheme, renderChips, renderProductGrid, renderCategoryTiles, renderFeaturedProducts,
  renderFaqs, updateContactWaLink, updateContactEmailLink, updateCartBadge, showPage,
  toggleTheme, toggleMobileNav, toggleFaq, setFilter, handleSortChange, renderCartPage,
  renderSearchResults
} from './ui.js';
import { addToCart, changeQty, removeFromCart, startCartSync, stopCartSync } from './cart.js';
import {
  loadHistoryFromStorage, handlePlaceOrderClick,
  reorderFromHistory, deleteOrder, clearAllHistory,
  setFulfilment, setPaymentMethod, handleUseEmailInsteadClick
} from './checkout.js';
import { changeVerifyQty, resetVerify, updateVerifyMatchResult } from './admin.js';
import { toggleSearch, openSearchOverlay, closeSearchOverlay, handleSearchInput, clearSearchInput, useRecentSearch, removeRecentSearch } from './search.js';
import {
  renderAccountPage, handleAccountIconClick, handleSignOut, comingSoon, toggleNotificationPref,
  toggleAccountSubview, handleChangePasswordSubmit, handleResendVerification,
  handleProfileInfoSubmit, toggleAddAddressForm, handleAddAddressSubmit, handleDeleteAddress
} from './account.js';
import { setHistoryTab, startOrderHistorySync, stopOrderHistorySync, renderHistoryPage } from './order-tracking.js';
import { setAuthMode, handleAuthFormSubmit, handlePasswordResetSubmit } from './auth-ui.js';
import { EMAILJS_PUBLIC_KEY } from './config.js';

async function init(){
  // --- populate state before the first render ---
  // Category Management / Feature Labels step: categories and labels
  // load alongside products, not after — the very first paint below
  // (category tiles, filter chips, product card category/label pills)
  // depends on all three being ready at once.
  await Promise.all([loadProducts(), loadCategories(), loadLabels()]);
  Store.state.history = loadHistoryFromStorage();

  // --- visual/theme setup ---
  initTheme();

  // --- EmailJS (safe no-op if not configured — see config.js) ---
  if(typeof emailjs !== 'undefined' && EMAILJS_PUBLIC_KEY !== 'YOUR_EMAILJS_PUBLIC_KEY'){
    try { emailjs.init({ publicKey: EMAILJS_PUBLIC_KEY }); } catch(e){ console.error('EmailJS init failed:', e); }
  }

  // --- first paint ---
  renderChips();
  renderProductGrid();
  renderCategoryTiles();
  renderFeaturedProducts();
  renderFaqs();
  updateContactWaLink();
  updateContactEmailLink();
  updateCartBadge();

  // Live product sync (Admin Dashboard step) — re-runs the same render
  // calls as first paint above whenever the Firestore products
  // collection changes, so an edit made from the admin dashboard
  // reaches the storefront immediately: the exact "subscribe once,
  // re-render what's affected" pattern the rest of this file already
  // uses for cart/order/profile sync below. Also refreshes the cart
  // page if it's open — a live stock change is the one case where
  // what's already sitting in someone's bag can become invalid while
  // they're looking at it. renderSearchResults(Store.state.search) is
  // a safe no-op when the search overlay is closed or empty (it clears
  // and returns immediately — see js/ui.js) but keeps any currently
  // visible search-result product cards (labels, price, stock) live
  // too, the same "anywhere labels are displayed" rule as the grid.
  await subscribeToProductUpdates(() => {
    renderChips();
    renderProductGrid();
    renderCategoryTiles();
    renderFeaturedProducts();
    renderSearchResults(Store.state.search);
    if(isPageActive('cart')) renderCartPage();
  });

  // Same live-sync pattern as the products subscription just above —
  // a category rename/hide or a label rename/enable-disable from the
  // Admin Dashboard needs to reach every place a product shows its
  // category or its labels (tiles, chips, product cards, cart lines,
  // search results) immediately, without a page reload.
  await subscribeToCategoryUpdates(() => {
    renderChips();
    renderProductGrid();
    renderCategoryTiles();
    renderFeaturedProducts();
    renderSearchResults(Store.state.search);
    if(isPageActive('cart')) renderCartPage();
  });
  await subscribeToLabelUpdates(() => {
    renderChips();
    renderProductGrid();
    renderFeaturedProducts();
    renderSearchResults(Store.state.search);
  });

  // Re-renders My Account and/or My Orders in place if either is open
  // when auth state changes — including, since Step 1e, when nothing
  // about auth itself changed but the customer's users/{uid} document
  // was updated live (js/auth.js re-invokes this same callback on those
  // updates too, covering Profile Information, Addresses, Notification
  // Preferences, and hiddenOrderIds). Also moves the customer on from
  // the Sign In page once they're actually signed in (any method).
  //
  // startOrderHistorySync()/stopOrderHistorySync() — and, since the
  // Persistent Cart step, startCartSync()/stopCartSync() alongside them
  // — are gated on lastKnownUid actually changing, NOT run
  // unconditionally on every invocation of this callback. They used to
  // run every time, which included every live profile-driven
  // re-invocation above — since both start/stop are async and
  // re-subscribe from scratch, calling them repeatedly in quick
  // succession (which happens constantly, since almost any customer
  // action touches users/{uid}) raced: an overlapping call could see no
  // subscription to unsubscribe yet and start a second one, silently
  // orphaning the first. Gating on the uid actually transitioning means
  // these only ever run once per real sign-in or sign-out, regardless
  // of how often the callback itself re-fires. stopOrderHistorySync()
  // and stopCartSync() both clear their piece of Store.state
  // immediately, not just when they unsubscribe, so a different
  // customer signing in on the same device can never briefly see the
  // previous customer's orders or cart. Checkout's original sign-in
  // gate (js/checkout.js) never visits the Sign In page, so it's
  // untouched by any of this.
  let lastKnownUid = null;
  await onAuthStateChangedListener(user => {
    if(isPageActive('account')) renderAccountPage();
    if(isPageActive('history')) renderHistoryPage();
    if(user && isPageActive('signin')){
      const target = Store.state.authReturnTo || 'account';
      Store.state.authReturnTo = 'account';
      showPage(target);
    }
    const uid = user ? user.uid : null;
    if(uid !== lastKnownUid){
      lastKnownUid = uid;
      if(uid){ startOrderHistorySync(uid); startCartSync(uid); }
      else { stopOrderHistorySync(); stopCartSync(); }
    }
  });

  showPage(window.location.hash === '#verify-order' ? 'verify' : 'catalog');

  // --- bridge for onclick="" / oninput="" strings in generated HTML ---
  Object.assign(window, {
    showPage,
    addToCart,
    changeQty,
    removeFromCart,
    loginWithGoogle,
    setFilter,
    handleSortChange,
    handleSearchInput,
    clearSearchInput,
    useRecentSearch,
    removeRecentSearch,
    toggleTheme,
    toggleMobileNav,
    toggleSearch,
    openSearchOverlay,
    closeSearchOverlay,
    toggleFaq,
    handlePlaceOrderClick,
    handleUseEmailInsteadClick,
    setFulfilment,
    setPaymentMethod,
    reorderFromHistory,
    deleteOrder,
    clearAllHistory,
    setHistoryTab,
    changeVerifyQty,
    resetVerify,
    updateVerifyMatchResult,
    handleAccountIconClick,
    handleSignOut,
    comingSoon,
    toggleNotificationPref,
    toggleAccountSubview,
    handleChangePasswordSubmit,
    handleResendVerification,
    handleProfileInfoSubmit,
    toggleAddAddressForm,
    handleAddAddressSubmit,
    handleDeleteAddress,
    setAuthMode,
    handleAuthFormSubmit,
    handlePasswordResetSubmit
  });
}

document.addEventListener('DOMContentLoaded', init);
