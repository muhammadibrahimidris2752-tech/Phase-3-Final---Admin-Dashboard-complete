/* ============================================================
   Admin Dashboard (Phase 3) — Orders page: live order feed, search,
   status filter, order detail view, and status updates.

   Reuses rather than reimplements:
     - subscribeToAllOrders() (js/firestore.js) is the same live,
       all-orders query this project already had — it just wasn't
       wired to any UI before this file.
     - updateOrderStatus() (js/firestore.js) is the only write this
       needs. The customer's own live subscription
       (js/order-tracking.js's startOrderHistorySync(), already
       verified working cross-device) picks up a status change the
       moment this writes it — "the customer's timeline updates live"
       needs no new mechanism, just this one write.
     - trackingTimelineHTML() / statusBadgeClass() (js/order-tracking.js)
       are reused directly, so there's one timeline implementation and
       one status-color mapping, not two.

   This file owns the one shared live orders subscription and cache
   (ordersCache) — js/admin.js's getDashboardStats(), js/admin-
   customers.js, and js/admin-analytics.js all read from getAllOrders()
   below rather than each subscribing separately.
   ============================================================ */
import { subscribeToAllOrders, updateOrderStatus } from './firestore.js';
import { formatNaira } from './utils.js';
import { ORDER_STATUS, ORDER_STATUS_LABEL, getTimelineFor } from './order-status.js';
import { statusBadgeClass, trackingTimelineHTML } from './order-tracking.js';
import { showAdminToast } from './admin.js';

let ordersCache = [];
let unsubscribeOrders = null;
let openOrderId = null; // tracks which order's detail modal is open, so a live update can refresh it in place

export function getAllOrders(){
  return ordersCache;
}

/** Starts the one live subscription this whole admin dashboard uses for
    order data. onUpdate is called on every snapshot (initial load and
    every change after) so the caller (js/dashboard.js) can refresh
    whatever depends on it — the Orders table, the dashboard stats, the
    Customers and Analytics pages. */
export async function startAdminOrdersSync(onUpdate){
  if(unsubscribeOrders){
    unsubscribeOrders();
    unsubscribeOrders = null;
  }
  unsubscribeOrders = await subscribeToAllOrders(orders => {
    ordersCache = orders;
    if(openOrderId){
      const stillOpen = ordersCache.find(o => o.id === openOrderId);
      if(stillOpen) renderOrderDetailModal(stillOpen);
    }
    onUpdate();
  });
}

/** Mirrors stopOrderHistorySync() (js/order-tracking.js) — called on
    admin logout so the subscription doesn't keep running (and keep
    counting as Firestore reads) after no one's watching it. */
export function stopAdminOrdersSync(){
  if(unsubscribeOrders){
    unsubscribeOrders();
    unsubscribeOrders = null;
  }
  ordersCache = [];
}

function searchableText(o){
  return [o.id, o.code, o.name, o.googleName, o.email, o.googleEmail, o.phone].filter(Boolean).join(' ').toLowerCase();
}

function orderRowHTML(o){
  const status = o.status || ORDER_STATUS.CONFIRMED;
  const customerName = o.name || o.googleName || 'Unknown customer';
  const customerEmail = o.email || o.googleEmail || '';
  return `<tr>
    <td>
      <div style="font-weight:600;">${o.id}</div>
      ${o.code ? `<div style="font-size:11.5px;color:var(--ink-faint);font-family:monospace;">${o.code}</div>` : ''}
    </td>
    <td>
      <div>${customerName}</div>
      ${customerEmail ? `<div style="font-size:12.5px;color:var(--ink-soft);">${customerEmail}</div>` : ''}
    </td>
    <td>${formatNaira(o.total)}</td>
    <td><span class="status-badge ${statusBadgeClass(status)}">${ORDER_STATUS_LABEL[status] || status}</span></td>
    <td style="white-space:nowrap;color:var(--ink-soft);font-size:13px;">${new Date(o.date).toLocaleString('en-NG',{dateStyle:'medium',timeStyle:'short'})}</td>
    <td>
      <button class="admin-btn admin-btn-outline" style="padding:8px 16px;font-size:12.5px;" onclick="viewOrderDetail('${o.id}')">View</button>
    </td>
  </tr>`;
}

/** Reads the current search text + status filter straight from the DOM
    (both are static elements in admin/index.html) and re-renders the
    table from ordersCache — called on every keystroke/filter change and
    every live update, so it's always showing the current cache filtered
    the current way. */
export function renderOrdersTable(){
  const searchEl = document.getElementById('orderSearchInput');
  const filterEl = document.getElementById('orderStatusFilter');
  const search = searchEl ? searchEl.value.trim().toLowerCase() : '';
  const filter = filterEl ? filterEl.value : 'all';

  let list = [...ordersCache].sort((a,b) => b.date - a.date);
  if(filter !== 'all') list = list.filter(o => (o.status || ORDER_STATUS.CONFIRMED) === filter);
  if(search) list = list.filter(o => searchableText(o).includes(search));

  const body = document.getElementById('ordersTableBody');
  const empty = document.getElementById('ordersEmptyState');
  if(!body) return;
  body.innerHTML = list.map(orderRowHTML).join('');
  if(empty) empty.style.display = list.length ? 'none' : '';
}

/* ============ ORDER DETAIL MODAL ============ */
function orderDetailBodyHTML(o){
  const status = o.status || ORDER_STATUS.CONFIRMED;
  const statusOptions = [...getTimelineFor(o), ORDER_STATUS.CANCELLED];
  return `
    <div class="admin-modal-section">
      <div class="admin-modal-row"><span>Order</span><strong>${o.id}</strong></div>
      ${o.code ? `<div class="admin-modal-row"><span>Verification code</span><strong style="font-family:monospace;">${o.code}</strong></div>` : ''}
      <div class="admin-modal-row"><span>Placed</span><strong>${new Date(o.date).toLocaleString('en-NG',{dateStyle:'medium',timeStyle:'short'})}</strong></div>
      <div class="admin-modal-row"><span>Fulfilment</span><strong>${o.fulfillment === 'pickup' ? 'Pickup' : 'Delivery'}</strong></div>
    </div>
    <div class="admin-modal-section">
      <h4>Customer</h4>
      <div class="admin-modal-row"><span>Name</span><strong>${o.name || o.googleName || '\u2014'}</strong></div>
      <div class="admin-modal-row"><span>Phone</span><strong>${o.phone || '\u2014'}</strong></div>
      <div class="admin-modal-row"><span>Email</span><strong>${o.email || o.googleEmail || '\u2014'}</strong></div>
      ${o.fulfillment !== 'pickup' ? `<div class="admin-modal-row"><span>Address</span><strong>${o.address || '\u2014'}</strong></div>` : ''}
    </div>
    <div class="admin-modal-section">
      <h4>Items</h4>
      ${o.items.map(l => `<div class="summary-row"><span>${l.name} &times; ${l.qty}</span><span>${formatNaira(l.lineTotal)}</span></div>`).join('')}
      <div class="summary-row"><span>Subtotal</span><span>${formatNaira(o.subtotal)}</span></div>
      ${o.deliveryCharge ? `<div class="summary-row"><span>Delivery</span><span>${formatNaira(o.deliveryCharge)}</span></div>` : ''}
      <div class="summary-row total"><span>Total</span><span>${formatNaira(o.total)}</span></div>
    </div>
    <div class="admin-modal-section">
      <h4>Status</h4>
      <select class="admin-filter-select" style="width:100%;margin-bottom:14px;" onchange="handleOrderStatusChange('${o.id}', this.value)">
        ${statusOptions.map(s => `<option value="${s}" ${s === status ? 'selected' : ''}>${ORDER_STATUS_LABEL[s]}</option>`).join('')}
      </select>
      ${trackingTimelineHTML(o)}
    </div>`;
}

function renderOrderDetailModal(o){
  const body = document.getElementById('orderDetailModalBody');
  const title = document.getElementById('orderDetailModalTitle');
  if(!body) return;
  if(title) title.textContent = `Order ${o.id}`;
  body.innerHTML = orderDetailBodyHTML(o);
}

export function viewOrderDetail(orderId){
  const order = ordersCache.find(o => o.id === orderId);
  if(!order) return;
  openOrderId = orderId;
  renderOrderDetailModal(order);
  const modal = document.getElementById('orderDetailModal');
  if(modal) modal.style.display = 'flex';
}

export function closeOrderDetailModal(){
  openOrderId = null;
  const modal = document.getElementById('orderDetailModal');
  if(modal) modal.style.display = 'none';
}

export async function handleOrderStatusChange(orderId, status){
  try {
    const ok = await updateOrderStatus(orderId, status);
    if(ok){
      showAdminToast(`Order ${orderId} marked ${ORDER_STATUS_LABEL[status] || status}`);
    } else {
      showAdminToast('Could not update the order — please try again');
      // updateOrderStatus() returning false means nothing was written —
      // the <select> is currently showing the newly-picked status even
      // though it didn't take. Re-render from the still-unchanged cache
      // so it snaps back to what's actually saved, instead of lying.
      const current = ordersCache.find(o => o.id === orderId);
      if(current) renderOrderDetailModal(current);
    }
  } catch(e){
    console.error('Could not update order status:', e);
    showAdminToast('Could not update the order — please try again');
  }
}

/** Wires the Orders page's static search/filter/modal-close controls.
    Called once from js/dashboard.js's init(), same as its own
    wireLoginForm()/wireSidebarNav() — addEventListener, not onclick="",
    since these elements already exist in admin/index.html and are
    never regenerated (only the table rows and modal body are). */
export function initOrdersPage(){
  document.getElementById('orderSearchInput')?.addEventListener('input', renderOrdersTable);
  document.getElementById('orderStatusFilter')?.addEventListener('change', renderOrdersTable);
  document.getElementById('orderDetailModalClose')?.addEventListener('click', closeOrderDetailModal);
  document.getElementById('orderDetailModal')?.addEventListener('click', (e) => {
    if(e.target.id === 'orderDetailModal') closeOrderDetailModal(); // click on the backdrop itself
  });
}
