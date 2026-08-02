/* ============================================================
   "My Orders" — order history with status tabs (All / Processing /
   In Transit / Delivered) and a per-order tracking timeline.

   Since the Order History step (Phase 2), history is a live Firestore
   subscription filtered to the signed-in customer's own orders (see
   js/firestore.js's subscribeToUserOrders()), replacing localStorage
   as the source of truth — started/stopped by app.js's auth-state
   listener via startOrderHistorySync()/stopOrderHistorySync() below.
   Deleting an order or clearing history (js/checkout.js) never
   touches the real order record — it adds to hiddenOrderIds on the
   customer's users/{uid} document instead, so the business's record
   stays intact and the hide follows the customer across devices.
   Signed out, this page shows the same sign-in prompt My Account
   uses — there's no "whose orders" to show otherwise.

   Split out of ui.js as its own file (Phase 1) since this grew from
   a flat list into a real feature with its own state (historyTab)
   and its own status/timeline model — see js/order-status.js for
   the single canonical list every status label and timeline step
   comes from.

   Note on today's data: a new order's status starts at "confirmed"
   and stays there (see js/checkout.js) — advancing it to Processing/
   In Transit/etc. is an admin-side action that isn't built yet (the
   admin Orders page is still a placeholder, see admin/index.html).
   So most orders will show step 1 complete for now; the timeline
   itself is ready to reflect real progress the moment staff have a
   way to set it.
   ============================================================ */
import { Store, setState, isPageActive } from './store.js';
import { formatNaira } from './utils.js';
import { ORDER_TABS, ORDER_STATUS_LABEL, getOrderTab, getTimelineFor } from './order-status.js';
import { subscribeToUserOrders } from './firestore.js';
import { getCurrentUser, getCurrentUserProfile } from './auth.js';

export function setHistoryTab(tab){ setState({ historyTab: tab }); }

/* ---------- live sync lifecycle — called from app.js's auth-state listener ---------- */
let unsubscribeOrders = null;

export async function startOrderHistorySync(uid){
  if(unsubscribeOrders){
    unsubscribeOrders();
    unsubscribeOrders = null;
  }
  unsubscribeOrders = await subscribeToUserOrders(uid, orders => {
    Store.state.history = orders;
    if(isPageActive('history')) renderHistoryPage();
  });
}

/** Stops the subscription AND clears history immediately (rather than
    only when the next snapshot or render happens), so there's no
    window where a different customer signing in on the same device
    could briefly see the previous customer's orders. */
export function stopOrderHistorySync(){
  if(unsubscribeOrders){
    unsubscribeOrders();
    unsubscribeOrders = null;
  }
  Store.state.history = [];
  renderHistoryPage();
}

/** Exported (Admin Dashboard step) so js/admin-orders.js's order detail
    view can reuse the exact same status-badge coloring and tracking
    timeline the customer sees, instead of a second implementation of
    either. Nothing about how these are used here changes. */
export function statusBadgeClass(status){
  if(status === 'delivered' || status === 'picked_up') return 'status-badge-done';
  if(status === 'cancelled') return 'status-badge-cancelled';
  return 'status-badge-active';
}

export function trackingTimelineHTML(order){
  const timeline = getTimelineFor(order);
  const history = order.statusHistory || [];
  const currentIndex = Math.max(0, timeline.indexOf(order.status));
  return `<div class="tracking-timeline">
    ${timeline.map((s, i) => {
      const entry = history.find(h => h.status === s);
      const state = i < currentIndex ? 'done' : i === currentIndex ? 'current' : 'upcoming';
      const checkIcon = `<svg viewBox="0 0 24 24" fill="none" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M4 12.5l5 5.5L20 6"/></svg>`;
      return `<div class="tracking-step tracking-step-${state}">
        <div class="tracking-dot">${state === 'upcoming' ? '' : checkIcon}</div>
        <div class="tracking-step-body">
          <div class="tracking-step-label">${ORDER_STATUS_LABEL[s] || s}</div>
          ${entry ? `<div class="tracking-step-date">${new Date(entry.at).toLocaleString('en-NG',{dateStyle:'medium',timeStyle:'short'})}</div>` : ''}
        </div>
      </div>`;
    }).join('')}
  </div>`;
}

function orderCardHTML(o){
  const status = o.status || 'confirmed';
  const label = ORDER_STATUS_LABEL[status] || 'Order Confirmed';
  const itemCount = o.items.reduce((s,l)=>s+l.qty,0);
  return `<div class="history-card">
    <div class="history-top">
      <span class="history-id">${o.id}</span>
      <div class="history-top-right">
        <span class="status-badge ${statusBadgeClass(status)}">${label}</span>
        <button class="remove-btn" onclick="deleteOrder('${o.id}')" aria-label="Delete this order">
          <svg viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0-1 14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2L4 6"/></svg>
        </button>
      </div>
    </div>
    <div class="history-date">${new Date(o.date).toLocaleString('en-NG',{dateStyle:'medium',timeStyle:'short'})} &middot; ${itemCount} item${itemCount===1?'':'s'}</div>
    ${o.items.map(l=>`<div class="summary-row"><span>${l.name} &times; ${l.qty}</span><span>${formatNaira(l.lineTotal)}</span></div>`).join('')}
    <div class="summary-row total"><span>Total</span><span>${formatNaira(o.total)}</span></div>
    ${o.code ? `<div style="font-size:11px;color:var(--ink-faint);margin-top:8px;">Verification code: <span style="font-family:monospace;font-weight:700;">${o.code}</span></div>` : ''}
    <div class="tracking-heading">Track Your Order</div>
    ${trackingTimelineHTML(o)}
    <button class="btn btn-outline btn-block" style="margin-top:12px;" onclick="reorderFromHistory('${o.id}')">Reorder These Items</button>
  </div>`;
}

export function renderHistoryPage(){
  const el = document.getElementById('historyContent');

  if(!getCurrentUser()){
    el.innerHTML = `<div class="empty-state">
      <div class="empty-icon"><svg viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 21a8 8 0 0 0-16 0"/><circle cx="12" cy="8" r="4"/></svg></div>
      <h3>Sign in to view your orders</h3>
      <p>Sign in to see your order history and track your orders.</p>
      <button class="btn btn-primary" onclick="handleAccountIconClick()">Sign In</button>
    </div>`;
    return;
  }

  const hiddenOrderIds = (getCurrentUserProfile() || {}).hiddenOrderIds || [];
  const history = Store.state.history.filter(o => !hiddenOrderIds.includes(o.id));

  if(history.length===0){
    el.innerHTML = `<div class="empty-state">
      <div class="empty-icon"><svg viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg></div>
      <h3>Nothing Here Yet</h3>
      <p>You haven't placed any orders yet. Explore the collection and build your selection.</p>
      <button class="btn btn-primary" onclick="showPage('catalog')">Explore the Collection</button>
    </div>`;
    return;
  }
  const activeTab = Store.state.historyTab || 'All';
  const filtered = activeTab === 'All' ? history : history.filter(o => getOrderTab(o.status) === activeTab);
  el.innerHTML = `
    <div class="order-tabs">
      ${ORDER_TABS.map(t => `<button class="order-tab ${t===activeTab?'active':''}" onclick="setHistoryTab('${t}')">${t}</button>`).join('')}
    </div>
    <div style="display:flex;justify-content:flex-end;margin:14px 0;">
      <button class="footer-link-btn" onclick="clearAllHistory()">Clear All History</button>
    </div>
    <div class="history-list">
      ${filtered.length
        ? filtered.map(orderCardHTML).join('')
        : `<div class="empty-state"><h3>No orders here</h3><p>Nothing under &ldquo;${activeTab}&rdquo; yet.</p></div>`
      }
    </div>
  `;
}
