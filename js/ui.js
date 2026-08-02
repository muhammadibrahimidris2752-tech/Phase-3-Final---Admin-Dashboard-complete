/* ============================================================
   Rendering, templates, navigation, and DOM/event logic.
   No file outside this one builds HTML strings or touches the
   DOM directly, except app.js (bootstrap) and admin.js (the
   staff-only Verify Order tool, which mirrors this file's
   patterns for its own separate page).
   ============================================================ */
import { Store, setState, isPageActive } from './store.js';
import { getActiveProducts } from './products.js';
import { PRODUCT_FALLBACK_ICON } from '../data/products.sample.js';
import { getActiveCategoriesSorted, getCategoryName } from './categories.js';
import { getEnabledLabels, getEnabledLabelsForProduct } from './labels.js';
import { getCartLines } from './cart.js';
import { renderVerifyPage } from './admin.js';
import { formatNaira, buildWaLink } from './utils.js';
import { BRAND_NAME, CONTACT_EMAIL } from './config.js';
import { FAQS } from '../data/faqs.js';
import { toggleSearch } from './search.js';
import { renderHistoryPage } from './order-tracking.js';
import { renderAccountPage } from './account.js';
import { fulfilmentSectionHTML } from './checkout.js';
import { renderSignInPage, resetAuthMode } from './auth-ui.js';
import { getCurrentUser } from './auth.js';

/* ============ TEMPLATES ============ */
export function visualHTML(p){
  const icon = `<svg viewBox="0 0 24 24" fill="none" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"${p.image?' style="display:none"':''}>${PRODUCT_FALLBACK_ICON}</svg>`;
  const img = p.image ? `<img src="${p.image}" alt="${p.name}" loading="lazy" onerror="this.style.display='none';this.nextElementSibling.style.display='block';">` : '';
  return img + icon;
}
/** Shared +/- stepper markup used by both the product grid and the cart list. */
export function qtyStepperHTML(id, qty, mountAnimation){
  const style = mountAnimation ? ' style="animation:pageIn .2s ease both;"' : '';
  return `<div class="qty-stepper"${style}>
        <button class="qty-btn" onclick="changeQty('${id}',-1)" aria-label="Decrease quantity">−</button>
        <span class="qty-val">${qty}</span>
        <button class="qty-btn" onclick="changeQty('${id}',1)" aria-label="Increase quantity">+</button>
      </div>`;
}
export function productCardHTML(p){
  const qty = Store.state.cart[p.id] || 0;
  const outOfStock = typeof p.stock === 'number' && p.stock <= 0;
  const control = outOfStock
    ? `<span class="out-of-stock-label">Out of Stock</span>`
    : qty > 0
      ? qtyStepperHTML(p.id, qty, true)
      : `<button class="add-btn" style="animation:pageIn .2s ease both;" onclick="addToCart('${p.id}')" aria-label="Add ${p.name} to bag">
        <svg viewBox="0 0 24 24" fill="none" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 5v14M5 12h14"/></svg>
      </button>`;
  // Feature Labels step: a product can carry any number of admin-defined
  // labels (js/labels.js) — replaces the old single `badge` string. Out
  // of Stock still wins the top-left slot outright (that's a real-time
  // availability fact, not a merchandising label, and showing both would
  // crowd a small card), otherwise every enabled label assigned to this
  // product renders as its own pill, in assignment order.
  const labels = outOfStock ? [] : getEnabledLabelsForProduct(p);
  const badgesHTML = outOfStock
    ? `<div class="product-badges"><div class="product-badge product-badge--oos">Out of Stock</div></div>`
    : labels.length
      ? `<div class="product-badges">${labels.map(l => `<div class="product-badge">${l.name}</div>`).join('')}</div>`
      : '';
  return `<div class="product-card${outOfStock ? ' out-of-stock' : ''}">
    ${badgesHTML}
    <div class="product-visual" style="background:${p.tint};">
      ${visualHTML(p)}
    </div>
    <div class="product-body">
      <div class="product-cat">${getCategoryName(p.catId)}</div>
      <div class="product-name">${p.name}</div>
      <div class="product-foot">
        <div class="product-price">${formatNaira(p.price)}</div>
        ${control}
      </div>
    </div>
  </div>`;
}
export function cartItemHTML(l){
  return `<div class="cart-item">
    <div class="cart-item-visual" style="background:${l.tint};">
      ${visualHTML(l)}
    </div>
    <div class="cart-item-info">
      <div class="product-name">${l.name}</div>
      <div class="product-cat">${getCategoryName(l.catId)}</div>
      <div class="cart-item-price">${formatNaira(l.price)}</div>
    </div>
    <div class="cart-item-side">
      <button class="remove-btn" onclick="removeFromCart('${l.id}')" aria-label="Remove ${l.name}">
        <svg viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0-1 14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2L4 6"/></svg>
      </button>
      ${qtyStepperHTML(l.id, l.qty, false)}
    </div>
  </div>`;
}

/* ============ NAVIGATION ============ */
export function showPage(id){
  document.querySelectorAll('.page').forEach(p=>p.classList.remove('active'));
  const target = document.getElementById('page-'+id);
  if(target) target.classList.add('active');
  document.querySelectorAll('.nav-link, .mobile-nav-link, .bottom-nav-link').forEach(n=>n.classList.toggle('active', n.dataset.nav===id));
  window.scrollTo(0,0);
  toggleMobileNav(false);
  toggleSearch(false);
  if(id==='cart') renderCartPage();
  if(id==='history') renderHistoryPage();
  if(id==='verify') renderVerifyPage();
  if(id==='account') renderAccountPage();
  if(id==='signin'){ resetAuthMode(); renderSignInPage(); }
}
/** Shared open/close behaviour for slide-panels (search bar, mobile drawer). Exported so js/search.js can reuse it for the search overlay instead of duplicating this logic. */
export function togglePanel(panelId, force){
  const panel = document.getElementById(panelId);
  const open = typeof force==='boolean' ? force : !panel.classList.contains('open');
  panel.classList.toggle('open', open);
  return open;
}
export function toggleMobileNav(force){
  const open = togglePanel('mobileNavDrawer', force);
  document.getElementById('hamburgerIconOpen').style.display = open ? 'none' : 'block';
  document.getElementById('hamburgerIconClose').style.display = open ? 'block' : 'none';
}
export function initTheme(){
  const prefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
  setTheme(prefersDark ? 'dark' : 'light');
}
export function setTheme(theme){
  document.documentElement.setAttribute('data-theme', theme);
  document.getElementById('themeIconSun').style.display = theme==='dark' ? 'block' : 'none';
  document.getElementById('themeIconMoon').style.display = theme==='light' ? 'block' : 'none';
}
export function toggleTheme(){
  const current = document.documentElement.getAttribute('data-theme');
  setTheme(current==='dark' ? 'light' : 'dark');
}
export function updateContactWaLink(){
  const btn = document.getElementById('contactWaBtn');
  if(!btn) return;
  btn.href = buildWaLink(`Hi ${BRAND_NAME}! 👋 I have a question.`);
}
export function updateContactEmailLink(){
  const btn = document.getElementById('contactEmailBtn');
  if(!btn) return;
  const subject = `Inquiry from ${BRAND_NAME} website`;
  const body = `Hi ${BRAND_NAME},\n\n`;
  const mailtoUrl = `mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  const isAndroid = /Android/i.test(navigator.userAgent);
  if(isAndroid){
    const gmailComposeData = `mail.google.com/mail/?view=cm&fs=1&to=${encodeURIComponent(CONTACT_EMAIL)}&su=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
    btn.href = `intent://${gmailComposeData}#Intent;scheme=https;package=com.google.android.gm;S.browser_fallback_url=${encodeURIComponent(mailtoUrl)};end`;
  } else {
    btn.href = mailtoUrl;
  }
  document.getElementById('contactEmailSub').textContent = CONTACT_EMAIL;
}

/* ============ CATALOG ============ */
/** Chips come from two live Firestore-backed sources, both admin-
    managed: active categories (js/categories.js) and enabled labels
    (js/labels.js) — neither derived from whatever's in the current
    product list. This is what makes a brand-new label an admin just
    created show up here immediately (bug fix: previously only two
    hardcoded pseudo-label filters existed — "New Arrivals"/"Best
    Sellers" — matched against a fixed field, so any *other* label an
    admin created, however enabled and assigned, never became a filter
    at all; now every enabled label is its own filter chip
    automatically, including but not limited to labels named New or
    Best Seller). Filter values are prefixed (`cat:<id>` / `label:<id>`)
    since both are independent Firestore collections and their ids
    aren't guaranteed distinct from each other — see getFilteredSorted()
    and renderCategoryTiles() below, which use the same prefixes. */
export function renderChips(){
  const chips = [
    { id: 'All', label: 'All' },
    ...getActiveCategoriesSorted().map(c => ({ id: 'cat:' + c.id, label: c.name })),
    ...getEnabledLabels().map(l => ({ id: 'label:' + l.id, label: l.name }))
  ];
  document.getElementById('chipRow').innerHTML = chips.map(c=>
    `<button class="chip ${c.id===Store.state.filter?'active':''}" onclick="setFilter('${c.id}')">${c.label}</button>`
  ).join('');
}
export function setFilter(c){ setState({ filter: c }); }
export function handleSortChange(){ setState({ sort: document.getElementById('sortSelect').value }); }
export function getFilteredSorted(){
  const { filter, sort, search } = Store.state;
  let list = [...getActiveProducts()];
  if(filter && filter.startsWith('label:')){
    const labelId = filter.slice('label:'.length);
    list = list.filter(p => Array.isArray(p.labels) && p.labels.includes(labelId));
  } else if(filter && filter.startsWith('cat:')){
    const catId = filter.slice('cat:'.length);
    list = list.filter(p => p.catId === catId);
  }
  if(search.trim()) list = list.filter(p=>p.name.toLowerCase().includes(search.trim().toLowerCase()));
  if(sort==='price-low') list.sort((a,b)=>a.price-b.price);
  else if(sort==='price-high') list.sort((a,b)=>b.price-a.price);
  return list;
}
export function renderProductGrid(){
  const list = getFilteredSorted();
  document.getElementById('productGrid').innerHTML = list.length
    ? list.map(productCardHTML).join('')
    : `<div class="empty-state" style="grid-column:1/-1;"><h3>Nothing here yet</h3><p>Try another category or search term.</p></div>`;
}
/** Homepage "Featured Products" — originally reused the existing `badge`
    field (New/Bestseller) rather than a dedicated flag, so it stayed
    fully data-driven against whatever catalog was loaded, then extended
    in the Admin Dashboard step to also honor an explicit `featured`
    toggle. Feature Labels step: both are gone now, replaced by a
    product qualifying here the same way it always effectively did —
    by carrying at least one enabled label. A product with no labels at
    all (the common case for a brand-new, not-yet-merchandised product)
    simply doesn't show here, exactly as an unbadged/unfeatured product
    didn't before. Capped at 6 so it reads as a curated strip, not a
    second full grid. */
export function renderFeaturedProducts(){
  const el = document.getElementById('featuredGrid');
  if(!el) return;
  const featured = getActiveProducts().filter(p => getEnabledLabelsForProduct(p).length > 0).slice(0, 6);
  el.innerHTML = featured.length
    ? featured.map(productCardHTML).join('')
    : '';
  const section = document.getElementById('featuredSection');
  if(section) section.style.display = featured.length ? '' : 'none';
}
/** Matching products for the mobile search overlay — lives here (not in
    js/search.js, where the rest of the search feature lives) so
    store.js's render() dispatcher can call it the same way it already
    calls renderProductGrid()/renderFeaturedProducts(), without needing
    a new store.js<->search.js circular import. This is also why the
    qty stepper inside a search result now stays in sync with the cart:
    every setState() re-runs render(), which re-runs this, which
    rebuilds these cards from the current cart state — the exact same
    mechanism the main grid and Featured Products already rely on.
    Matches by product name only (case-insensitive substring, the same
    rule getFilteredSorted() uses below), deliberately not scoped by
    whatever category chip/sort happens to be selected on the homepage
    underneath — search should search everything. */
export function renderSearchResults(query){
  const el = document.getElementById('searchResultsList');
  if(!el) return;
  const trimmed = query.trim().toLowerCase();
  if(!trimmed){
    el.innerHTML = '';
    return;
  }
  const matches = getActiveProducts().filter(p => p.name.toLowerCase().includes(trimmed));
  el.innerHTML = matches.length
    ? `<div class="product-grid">${matches.map(productCardHTML).join('')}</div>`
    : `<div class="empty-state"><h3>Nothing here yet</h3><p>Try another search term.</p></div>`;
}
/** Home page "Shop by Category" tiles — sourced from the Admin
    Dashboard's Categories page (js/categories.js), active + in admin-
    set order, not derived from products. Each tile shows that
    category's Firestore-stored Image URL; a category with no image
    set yet (or whose image URL fails to load) falls back to a plain
    tinted initial rather than a broken image or a bundled placeholder
    file — there are no bundled category images shipped with this
    project any more (see CATEGORY IMAGES in the task, and the removed
    images/categories/ folder). */
export function renderCategoryTiles(){
  const categories = getActiveCategoriesSorted();
  document.getElementById('catTiles').innerHTML = categories.map(c => {
    const items = getActiveProducts().filter(p => p.catId === c.id);
    const initial = (c.name || '?').trim().charAt(0).toUpperCase() || '?';
    const visual = c.image
      ? `<img src="${c.image}" class="cat-tile-image" alt="" onerror="this.style.display='none';this.nextElementSibling.style.display='flex';">
         <div class="cat-tile-fallback" style="display:none;">${initial}</div>`
      : `<div class="cat-tile-fallback">${initial}</div>`;

    return `
      <button class="cat-tile"
        onclick="setFilter('cat:${c.id}');document.getElementById('catalogGridAnchor').scrollIntoView({behavior:'smooth'});">

        ${visual}

        <span class="cat-tile-name">${c.name}</span>
        <span class="cat-tile-count">${items.length} items</span>
      </button>
    `;
  }).join('');
}
export function renderFaqs(){
  document.getElementById('faqList').innerHTML = FAQS.map((f,i)=>`
    <div class="faq-item">
      <button class="faq-question" onclick="toggleFaq(${i})">
        <span>${f.q}</span>
        <svg class="faq-chevron" id="faqChevron${i}" viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9l6 6 6-6"/></svg>
      </button>
      <div class="faq-answer" id="faqAnswer${i}">${f.a}</div>
    </div>
  `).join('');
}
export function toggleFaq(i){
  const ans = document.getElementById('faqAnswer'+i);
  const chev = document.getElementById('faqChevron'+i);
  const open = ans.classList.toggle('open');
  chev.style.transform = open ? 'rotate(180deg)' : 'rotate(0deg)';
}

export function updateCartBadge(){
  const count = Object.values(Store.state.cart).reduce((a,b)=>a+b,0);
  // Two badges now share this count: the header's (desktop) and the
  // bottom nav's (mobile) — see index.html.
  ['cartBadge', 'cartBadgeMobile'].forEach(id=>{
    const badge = document.getElementById(id);
    if(!badge) return;
    badge.textContent = count;
    badge.style.transition = 'transform .25s cubic-bezier(.34,1.56,.64,1)';
    badge.style.transform = 'scale(1.35)';
    setTimeout(()=>{ badge.style.transform = 'scale(1)'; }, 220);
  });
}
export function renderCartPage(){
  const lines = getCartLines();
  const el = document.getElementById('cartContent');
  if(lines.length===0){
    el.innerHTML = `<div class="empty-state">
      <div class="empty-icon"><svg viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4Z"/><path d="M3 6h18"/><path d="M16 10a4 4 0 0 1-8 0"/></svg></div>
      <h3>Your bag is empty</h3>
      <p>Explore the collection and add something you love.</p>
      <button class="btn btn-primary" onclick="showPage('catalog')">Explore the Collection</button>
    </div>`;
    return;
  }
  const itemCount = lines.reduce((s,l)=>s+l.qty,0);
  el.innerHTML = `
    <div class="cart-list">${lines.map(cartItemHTML).join('')}</div>
    <div class="checkout-panel">
      ${fulfilmentSectionHTML()}
      <div class="name-field">
        <label for="custName">Your name</label>
        <input type="text" id="custName" placeholder="e.g. Amina">
      </div>
      <div class="name-field">
        <label for="custPhone">Phone number</label>
        <input type="tel" id="custPhone" placeholder="e.g. 0803 123 4567">
      </div>
      <div class="name-field">
        <label for="custEmail">Email address (for your order confirmation)</label>
        <input type="email" id="custEmail" placeholder="e.g. amina@email.com">
      </div>
      <div class="name-field" id="addressField">
        <label for="custAddress">Delivery address</label>
        <input type="text" id="custAddress" placeholder="e.g. 12 Ahmadu Bello Way, Jos">
      </div>
      <button class="btn btn-primary btn-block" id="placeOrderBtn" onclick="handlePlaceOrderClick()">
        Place Order
      </button>
      ${!getCurrentUser() ? `<div style="text-align:center;margin-top:10px;">
        <button class="footer-link-btn" onclick="handleUseEmailInsteadClick()">Prefer email? Sign in here</button>
      </div>` : ''}
      <div class="wa-note">
        <svg viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/></svg>
        Your order will be securely saved, and a confirmation will be sent to your email. We'll also open WhatsApp so you can reach us directly. We'll keep you updated as your order progresses, and you can view your order details and track its status anytime under Your Orders.
      </div>
    </div>
  `;
  document.getElementById('addressField').style.display = Store.state.fulfillment === 'pickup' ? 'none' : '';
}

/* ============ TOAST ============ */
export function showToast(msg){
  const wrap = document.getElementById('toastWrap');
  const t = document.createElement('div');
  t.className = 'toast';
  t.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M4 12.5l5 5.5L20 6"/></svg><span></span>';
  t.querySelector('span').textContent = msg;
  wrap.appendChild(t);
  setTimeout(()=>t.remove(), 2300);
}
