/* ============================================================
   Admin Dashboard (Phase 3) — Analytics page.

   No charting library — this project has no build step or bundler
   (see README.md), so pulling one in for three simple visualizations
   isn't worth the new dependency. Plain HTML/CSS bar rows instead,
   styled with the same tokens (css/tokens.css) everything else uses.

   Everything here reads js/admin-orders.js's shared order cache and
   js/products.js's product cache — no new subscription, no new data
   source, same reasoning as js/admin-customers.js.
   ============================================================ */
import { getAllOrders } from './admin-orders.js';
import { formatNaira } from './utils.js';
import { ORDER_STATUS_LABEL } from './order-status.js';

function barRowHTML(label, value, maxValue, displayValue){
  const pct = maxValue > 0 ? Math.max(4, Math.round((value / maxValue) * 100)) : 0;
  return `<div class="admin-bar-row">
    <div class="admin-bar-label">${label}</div>
    <div class="admin-bar-track"><div class="admin-bar-fill" style="width:${pct}%;"></div></div>
    <div class="admin-bar-value">${displayValue}</div>
  </div>`;
}

/** Last 7 days, oldest first, including days with no orders at all. */
function renderRevenueTrend(){
  const el = document.getElementById('analyticsRevenueTrend');
  if(!el) return;
  const orders = getAllOrders().filter(o => o.status !== 'cancelled');
  const days = [];
  for(let i = 6; i >= 0; i--){
    const d = new Date();
    d.setDate(d.getDate() - i);
    days.push({ key: d.toDateString(), label: d.toLocaleDateString('en-NG', { weekday: 'short', day: 'numeric' }), total: 0 });
  }
  orders.forEach(o => {
    const key = new Date(o.date).toDateString();
    const day = days.find(d => d.key === key);
    if(day) day.total += (o.total || 0);
  });
  const max = Math.max(...days.map(d => d.total), 0);
  el.innerHTML = days.map(d => barRowHTML(d.label, d.total, max, formatNaira(d.total))).join('');
}

function renderOrdersByStatus(){
  const el = document.getElementById('analyticsOrderStatus');
  if(!el) return;
  const orders = getAllOrders();
  const counts = {};
  orders.forEach(o => { const s = o.status || 'confirmed'; counts[s] = (counts[s] || 0) + 1; });
  const entries = Object.entries(counts).sort((a, b) => b[1] - a[1]);
  const max = Math.max(...entries.map(e => e[1]), 0);
  el.innerHTML = entries.length
    ? entries.map(([status, count]) => barRowHTML(ORDER_STATUS_LABEL[status] || status, count, max, count)).join('')
    : '<p class="admin-placeholder-text">No orders yet.</p>';
}

/** Aggregates each order's own stored item name/qty — not a fresh
    product lookup — so this stays accurate even for a product that's
    since been renamed, hidden, or deleted; it reflects what was
    actually sold at the time. */
function renderTopProducts(){
  const el = document.getElementById('analyticsTopProducts');
  if(!el) return;
  const totals = new Map();
  getAllOrders().filter(o => o.status !== 'cancelled').forEach(o => {
    (o.items || []).forEach(line => {
      const key = line.name || line.id;
      totals.set(key, (totals.get(key) || 0) + line.qty);
    });
  });
  const top = [...totals.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);
  const max = Math.max(...top.map(t => t[1]), 0);
  el.innerHTML = top.length
    ? top.map(([name, qty]) => barRowHTML(name, qty, max, `${qty} sold`)).join('')
    : '<p class="admin-placeholder-text">No sales yet.</p>';
}

export function renderAnalyticsPage(){
  renderRevenueTrend();
  renderOrdersByStatus();
  renderTopProducts();
}
