/* ============================================================
   Admin Dashboard (Phase 3) — Customers page.

   Deliberately built from js/admin-orders.js's order cache rather than
   reading users/{uid} profile documents: firestore.rules keeps that
   collection strictly owner-only (see the rule and its comment), and
   opening it up to staff reads would be a real, security-relevant
   change to a system the customer-sync phase already verified working.
   Every order already carries the customer's name/email/phone (see
   js/checkout.js), and staff can already read every order — so this
   needs no new data source and no rule change at all, just aggregation
   over data this dashboard already has.

   One consequence worth knowing: a customer who has never placed an
   order won't show up here, even if they've signed up and have a
   profile. That's the tradeoff for not touching the users/{uid} rule —
   flagged in the summary this phase ships with, not hidden.
   ============================================================ */
import { getAllOrders } from './admin-orders.js';
import { formatNaira } from './utils.js';

function buildCustomerList(){
  const map = new Map();
  getAllOrders().forEach(o => {
    const key = o.userId || o.email || o.googleEmail;
    if(!key) return;
    const c = map.get(key) || { name: '', email: '', phone: '', orderCount: 0, totalSpent: 0, lastOrderDate: 0 };
    c.orderCount += 1;
    if(o.status !== 'cancelled') c.totalSpent += (o.total || 0);
    if(o.date > c.lastOrderDate){
      c.lastOrderDate = o.date;
      c.name = o.name || o.googleName || c.name;
      c.email = o.email || o.googleEmail || c.email;
      c.phone = o.phone || c.phone;
    }
    map.set(key, c);
  });
  return [...map.values()].sort((a, b) => b.lastOrderDate - a.lastOrderDate);
}

function customerRowHTML(c){
  return `<tr>
    <td>
      <div style="font-weight:600;">${c.name || 'Unknown customer'}</div>
      <div style="font-size:12.5px;color:var(--ink-soft);">${c.email || '\u2014'}</div>
    </td>
    <td>${c.phone || '\u2014'}</td>
    <td>${c.orderCount}</td>
    <td>${formatNaira(c.totalSpent)}</td>
    <td style="white-space:nowrap;color:var(--ink-soft);font-size:13px;">${new Date(c.lastOrderDate).toLocaleDateString('en-NG',{dateStyle:'medium'})}</td>
  </tr>`;
}

export function renderCustomersTable(){
  const list = buildCustomerList();
  const body = document.getElementById('customersTableBody');
  const empty = document.getElementById('customersEmptyState');
  if(!body) return;
  body.innerHTML = list.map(customerRowHTML).join('');
  if(empty) empty.style.display = list.length ? 'none' : '';
}
