/* ============================================================
   Admin Dashboard controller — admin/index.html's only script.

   Reuses the existing modules rather than reimplementing anything:
     - js/auth.js            for sign-in/out and the admins/{uid} lookup
     - js/admin.js            for getDashboardStats() and the shared
                               showAdminToast() every admin-side file uses
     - js/products.js         for the product cache + live subscription
                               (also what the storefront uses — one
                               subscription, one cache, both sides)
     - js/admin-products.js   Products page: table, search, Add/Edit/Delete
     - js/admin-categories.js Categories page: table, search, reorder,
                               Add/Edit/Delete/Hide-Show (Category
                               Management step)
     - js/admin-labels.js     Labels page: table, search,
                               Add/Edit/Delete/Enable-Disable, and the
                               per-label "which products use this"
                               assignment view (Feature Labels step)
     - js/admin-delivery-zones.js  Delivery Zones page: table, search,
                               reorder, Add/Edit/Delete/Hide-Show
                               (Phase 4 Step 1 — Smart Delivery Engine;
                               management only so far, not yet read by
                               checkout)
     - js/admin-orders.js     Orders page: live feed, search, filter,
                               detail view, status updates
     - js/admin-customers.js  Customers page: table, derived from orders
     - js/admin-analytics.js  Analytics page: revenue/status/top-products
     - js/order-tracking.js   statusBadgeClass(), reused for the Recent
                               Orders list below
     - js/config.js / js/inventory-config.js  for the real values shown
                               on the Settings page

   This file uses addEventListener for its own static elements (login
   form, sidebar, theme toggle, product form, modal close buttons) —
   unchanged from Phase 2. The Products/Categories/Labels/Orders table
   rows and the order detail modal body ARE dynamically generated
   template strings (like js/ui.js's product cards), so their action
   buttons use the onclick="" + window-bridge pattern instead — see the
   Object.assign(window, {...}) at the bottom, the same bridge
   js/app.js already uses for the storefront.

   Theme init/toggle is intentionally duplicated here in miniature
   (~10 lines) rather than importing js/ui.js — ui.js pulls in the
   entire customer-facing module graph (cart, checkout, product
   rendering), which would be a strange, heavy dependency for an admin
   page to carry just for a light/dark toggle.
   ============================================================ */
import { onAuthStateChangedListener, getAdminRecord, login, logout } from './auth.js';
import { getDashboardStats, showAdminToast } from './admin.js';
import { loadProducts, subscribeToProductUpdates } from './products.js';
import { loadCategories, subscribeToCategoryUpdates } from './categories.js';
import { loadLabels, subscribeToLabelUpdates } from './labels.js';
import { loadDeliveryZones, subscribeToDeliveryZoneUpdates } from './delivery-zones.js';
import { renderProductsTable, initProductsPage, openEditProductModal, handleDeleteProduct } from './admin-products.js';
import {
  renderCategoriesTable, initCategoriesPage, openEditCategoryModal,
  handleDeleteCategory, handleToggleCategoryActive, handleMoveCategory
} from './admin-categories.js';
import {
  renderLabelsTable, initLabelsPage, openEditLabelModal, handleDeleteLabel,
  handleToggleLabelEnabled, openLabelProductsModal, handleLabelProductToggle,
  refreshLabelProductsModalIfOpen
} from './admin-labels.js';
import {
  renderDeliveryZonesTable, initDeliveryZonesPage, openEditDeliveryZoneModal,
  handleDeleteDeliveryZone, handleToggleDeliveryZoneActive, handleMoveDeliveryZone
} from './admin-delivery-zones.js';
import { renderOrdersTable, initOrdersPage, startAdminOrdersSync, stopAdminOrdersSync, getAllOrders, viewOrderDetail, handleOrderStatusChange } from './admin-orders.js';
import { renderCustomersTable } from './admin-customers.js';
import { renderAnalyticsPage } from './admin-analytics.js';
import { statusBadgeClass } from './order-tracking.js';
import { ORDER_STATUS_LABEL } from './order-status.js';
import { formatNaira } from './utils.js';
import { BRAND_NAME, DELIVERY_CHARGE } from './config.js';
import { INVENTORY } from './inventory-config.js';

/* ============ THEME (small, self-contained — see note above) ============ */
function initTheme(){
  const prefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
  setTheme(prefersDark ? 'dark' : 'light');
}
function setTheme(theme){
  document.documentElement.setAttribute('data-theme', theme);
  const sun = document.getElementById('themeIconSun');
  const moon = document.getElementById('themeIconMoon');
  if(sun) sun.style.display = theme === 'dark' ? 'block' : 'none';
  if(moon) moon.style.display = theme === 'light' ? 'block' : 'none';
}
function toggleTheme(){
  const current = document.documentElement.getAttribute('data-theme');
  setTheme(current === 'dark' ? 'light' : 'dark');
}

/* ============ GATES ============ */
function showGate(which){
  ['loading', 'login', 'denied'].forEach(name => {
    const el = document.getElementById('gate-' + name);
    if(el) el.style.display = name === which ? 'flex' : 'none';
  });
  const shell = document.getElementById('dashboardShell');
  if(shell) shell.style.display = which === 'dashboard' ? 'flex' : 'none';
}

/* ============ LOGIN FORM ============ */
function wireLoginForm(){
  const form = document.getElementById('loginForm');
  const errorEl = document.getElementById('loginError');
  const submitBtn = document.getElementById('loginSubmitBtn');
  if(!form) return;

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    errorEl.textContent = '';
    const email = document.getElementById('loginEmail').value.trim();
    const password = document.getElementById('loginPassword').value;
    if(!email || !password){
      errorEl.textContent = 'Enter both email and password.';
      return;
    }
    submitBtn.disabled = true;
    submitBtn.textContent = 'Signing in…';
    try {
      await login(email, password);
      // onAuthStateChangedListener (already attached) picks up the
      // resulting sign-in automatically — no manual redirect needed here.
    } catch(err){
      console.error('Admin login failed:', err);
      errorEl.textContent = err && err.message === 'Firebase is not configured yet — see js/firebase.js.'
        ? 'Admin login isn\u2019t set up yet \u2014 Firebase needs to be connected first.'
        : 'Sign-in failed. Check your email and password and try again.';
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = 'Sign In';
    }
  });
}

/* ============ LOGOUT ============ */
let unsubscribeProducts = null;
let unsubscribeCategories = null;
let unsubscribeLabels = null;
let unsubscribeDeliveryZones = null;
async function handleLogout(){
  stopAdminOrdersSync();
  if(unsubscribeProducts){ unsubscribeProducts(); unsubscribeProducts = null; }
  if(unsubscribeCategories){ unsubscribeCategories(); unsubscribeCategories = null; }
  if(unsubscribeLabels){ unsubscribeLabels(); unsubscribeLabels = null; }
  if(unsubscribeDeliveryZones){ unsubscribeDeliveryZones(); unsubscribeDeliveryZones = null; }
  try {
    await logout();
  } catch(err){
    console.error('Logout failed:', err);
  }
  showGate('login');
}

/* ============ SIDEBAR NAVIGATION ============ */
const PAGE_TITLES = {
  dashboard: 'Dashboard', products: 'Products', categories: 'Categories',
  labels: 'Labels', 'delivery-zones': 'Delivery Zones', orders: 'Orders',
  customers: 'Customers', analytics: 'Analytics', settings: 'Settings'
};
function showPage(page){
  document.querySelectorAll('.admin-page').forEach(p => p.classList.remove('active'));
  const target = document.getElementById('page-' + page);
  if(target) target.classList.add('active');
  document.querySelectorAll('.admin-nav-link').forEach(link => {
    link.classList.toggle('active', link.dataset.page === page);
  });
  const title = document.getElementById('topbarTitle');
  if(title) title.textContent = PAGE_TITLES[page] || '';
  closeSidebar();
  window.scrollTo(0, 0);
}
function wireSidebarNav(){
  document.querySelectorAll('.admin-nav-link').forEach(link => {
    link.addEventListener('click', () => showPage(link.dataset.page));
  });
}
function openSidebar(){
  document.getElementById('adminSidebar').classList.add('open');
  document.getElementById('sidebarOverlay').classList.add('open');
}
function closeSidebar(){
  document.getElementById('adminSidebar').classList.remove('open');
  document.getElementById('sidebarOverlay').classList.remove('open');
}
function wireSidebarToggle(){
  const toggleBtn = document.getElementById('sidebarToggle');
  const overlay = document.getElementById('sidebarOverlay');
  if(toggleBtn) toggleBtn.addEventListener('click', () => {
    const sidebar = document.getElementById('adminSidebar');
    sidebar.classList.contains('open') ? closeSidebar() : openSidebar();
  });
  if(overlay) overlay.addEventListener('click', closeSidebar);
}

/* ============ DASHBOARD PAGE (stats + recent orders) ============
   Real numbers now, computed in js/admin.js's getDashboardStats() from
   the same live products/orders caches the rest of this dashboard uses. */
function populateDashboardStats(){
  const stats = getDashboardStats();
  document.getElementById('statTotalProducts').textContent = stats.totalProducts;
  document.getElementById('statTotalOrders').textContent = stats.totalOrders;
  document.getElementById('statPendingOrders').textContent = stats.pendingOrders;
  document.getElementById('statCompletedOrders').textContent = stats.completedOrders;
  document.getElementById('statRevenue').textContent = formatNaira(stats.revenue);
  document.getElementById('statLowStock').textContent = stats.lowStockCount;
}
function renderRecentOrders(){
  const el = document.getElementById('dashboardRecentOrders');
  if(!el) return;
  const recent = [...getAllOrders()].sort((a, b) => b.date - a.date).slice(0, 5);
  el.innerHTML = recent.length ? recent.map(o => `
    <div class="admin-modal-row" style="padding:10px 0;">
      <span>${o.name || o.googleName || 'Unknown customer'} &mdash; ${o.id}</span>
      <strong><span class="status-badge ${statusBadgeClass(o.status)}" style="margin-right:8px;">${ORDER_STATUS_LABEL[o.status] || o.status}</span>${formatNaira(o.total)}</strong>
    </div>`).join('') : '<p class="admin-placeholder-text">No orders yet.</p>';
}

/* ============ SETTINGS PAGE ============
   Real, current values from js/config.js / js/inventory-config.js —
   read-only display, honestly labeled as such (no editing UI yet, and
   nothing here pretends otherwise). */
function populateSettingsPage(role){
  const roleEl = document.getElementById('settingsAccountRole');
  if(roleEl) roleEl.textContent = role ? `Role: ${role}` : '';
  document.getElementById('settingsStoreName').textContent = BRAND_NAME;
  document.getElementById('settingsDeliveryCharge').textContent = formatNaira(DELIVERY_CHARGE);
  document.getElementById('settingsLowStockThreshold').textContent = `${INVENTORY.LOW_STOCK_WARNING} units`;
}

/* ============ LIVE DATA (Admin Dashboard step) ============
   One products subscription (shared with the storefront — see
   js/products.js), one categories subscription and one labels
   subscription (Category Management / Feature Labels steps — see
   js/categories.js / js/labels.js, also shared with the storefront),
   and one orders subscription (js/admin-orders.js), each re-rendering
   every view that depends on it. Simpler than tracking which admin
   page is currently visible: rebuilding a cached table from an
   in-memory array is cheap, so everything just always stays current,
   and switching pages never shows stale data. Products are
   re-rendered on category/label updates too, since each product row
   shows a resolved category name and resolved label names.

   Bug fix (post-deploy regression): the Labels page's product counts
   are computed live from the products collection (productCountForLabel()
   in js/admin-labels.js), not stored on the label document — so a
   product's labels changing (checking/unchecking a label in the
   product form, or via the Labels page's own "Products" assignment
   modal) is a write to the *products* collection, not the labels
   collection, and needs the *products* subscription below to
   re-render the Labels table too, the same way it already re-renders
   the Products table on a category/label change. This was the missing
   link — renderLabelsTable() was only ever wired to the labels
   subscription, so a label's own count stayed stale until something
   else happened to touch the labels collection and force a refresh.
   refreshLabelProductsModalIfOpen() is the same fix applied to the
   "Products using this label" modal, in case it's open when the
   underlying product list changes. */
async function startLiveAdminData(){
  unsubscribeProducts = await subscribeToProductUpdates(() => {
    renderProductsTable();
    renderLabelsTable();
    refreshLabelProductsModalIfOpen();
    populateDashboardStats();
  });
  unsubscribeCategories = await subscribeToCategoryUpdates(() => {
    renderCategoriesTable();
    renderProductsTable();
  });
  unsubscribeLabels = await subscribeToLabelUpdates(() => {
    renderLabelsTable();
    renderProductsTable();
    refreshLabelProductsModalIfOpen();
  });
  unsubscribeDeliveryZones = await subscribeToDeliveryZoneUpdates(() => {
    renderDeliveryZonesTable();
  });
  await startAdminOrdersSync(() => {
    renderOrdersTable();
    renderCustomersTable();
    renderAnalyticsPage();
    renderRecentOrders();
    populateDashboardStats();
  });
}

/* ============ INIT ============ */
async function init(){
  initTheme();
  document.getElementById('themeToggleBtn')?.addEventListener('click', toggleTheme);

  wireLoginForm();
  document.getElementById('deniedLogoutBtn')?.addEventListener('click', handleLogout);
  document.getElementById('logoutBtn')?.addEventListener('click', handleLogout);

  wireSidebarNav();
  wireSidebarToggle();
  initProductsPage();
  initCategoriesPage();
  initLabelsPage();
  initDeliveryZonesPage();
  initOrdersPage();

  // First paint, same as the storefront (js/app.js) — subscriptions
  // (above) take over after. Categories/labels load alongside products
  // rather than after, since the Products page's table and form both
  // resolve/list category and label names as soon as it renders.
  // Delivery zones load alongside them too (Phase 4 Step 1) — no other
  // page depends on zones yet, but loading it here keeps every admin
  // data source populated before the first render, the same rule the
  // other three already follow.
  await Promise.all([loadProducts(), loadCategories(), loadLabels(), loadDeliveryZones()]);

  showGate('loading');
  onAuthStateChangedListener(async (user) => {
    if(!user){
      showGate('login');
      return;
    }
    const adminRecord = await getAdminRecord(user.uid);
    if(!adminRecord || adminRecord.active !== true){
      showGate('denied');
      return;
    }
    document.getElementById('welcomeHeading').textContent = `Welcome back${adminRecord.role ? ', ' + adminRecord.role : ''}`;
    document.getElementById('settingsAccountEmail').textContent = user.email || '\u2014';
    populateSettingsPage(adminRecord.role);
    renderProductsTable();
    renderCategoriesTable();
    renderLabelsTable();
    renderDeliveryZonesTable();
    await startLiveAdminData();
    showGate('dashboard');
  });

  // Bridge for the dynamically-generated table rows and modal content
  // in js/admin-products.js, js/admin-categories.js, js/admin-labels.js,
  // and js/admin-orders.js — same pattern js/app.js uses for the
  // storefront's onclick="" markup.
  Object.assign(window, {
    openEditProductModal, handleDeleteProduct,
    openEditCategoryModal, handleDeleteCategory, handleToggleCategoryActive, handleMoveCategory,
    openEditLabelModal, handleDeleteLabel, handleToggleLabelEnabled, openLabelProductsModal, handleLabelProductToggle,
    openEditDeliveryZoneModal, handleDeleteDeliveryZone, handleToggleDeliveryZoneActive, handleMoveDeliveryZone,
    viewOrderDetail, handleOrderStatusChange
  });
}

document.addEventListener('DOMContentLoaded', init);
