/* ============================================================
   Staff/admin-only logic — not part of the customer-facing site.

   The Verify Order tool (below) is reached only via the direct link
   ending in #verify-order — see the routing check in app.js. It's not
   linked from the nav on purpose.

   showAdminToast() below is the one shared toast implementation for
   every admin-side file (js/dashboard.js, js/admin-products.js,
   js/admin-orders.js, js/admin-customers.js) — it lives here rather
   than in js/dashboard.js because dashboard.js is the admin bootstrap
   (like js/app.js is for the storefront) and nothing should import
   from a bootstrap file; this file is already what dashboard.js pulls
   shared logic from, the same relationship js/ui.js has to js/app.js.

   Product CRUD lives in js/admin-products.js, order management in
   js/admin-orders.js, and the Customers/Analytics pages read the
   shared order cache admin-orders.js maintains — see those files.
   getDashboardStats() below is real, reading getProducts() (this
   file's own import) and getAllOrders() (admin-orders.js).
   ============================================================ */
import { Store, setState } from './store.js';
import { getProducts, getProductById } from './products.js';
import { getCategoryName } from './categories.js';
import { formatNaira } from './utils.js';
import { generateOrderCode } from './checkout.js';
import { getAllOrders } from './admin-orders.js';
import { INVENTORY } from './inventory-config.js';

/* ============ TOAST (shared by every admin-side file) ============ */
export function showAdminToast(msg){
  const wrap = document.getElementById('adminToastWrap');
  if(!wrap) return;
  const t = document.createElement('div');
  t.className = 'admin-toast';
  t.textContent = msg;
  wrap.appendChild(t);
  setTimeout(() => t.remove(), 2300);
}

/* ============ VERIFY ORDER (staff tool) ============
   A hidden page for Noor's team — not linked from the nav, reached
   only via the direct link ending in #verify-order. Staff re-type
   what the customer says they ordered, using THIS device's own copy
   of product data (never touched by whatever happened in the customer's
   browser), so the total and code shown here are always trustworthy.
   Kept in Store.state.verify, entirely separate from the real cart.
   ================================================================ */
export function changeVerifyQty(id, delta){
  const verify = {...Store.state.verify};
  verify[id] = (verify[id]||0) + delta;
  if(verify[id] <= 0) delete verify[id];
  setState({ verify });
}
export function verifyQtyStepperHTML(id, qty){
  return `<div class="qty-stepper">
        <button class="qty-btn" onclick="changeVerifyQty('${id}',-1)" aria-label="Decrease quantity">−</button>
        <span class="qty-val">${qty}</span>
        <button class="qty-btn" onclick="changeVerifyQty('${id}',1)" aria-label="Increase quantity">+</button>
      </div>`;
}
export function renderVerifyPicker(){
  const catIds = [...new Set(getProducts().map(p=>p.catId))];
  document.getElementById('verifyPicker').innerHTML = catIds.map(catId=>{
    const items = getProducts().filter(p=>p.catId===catId);
    return `<div>
      <div class="product-cat" style="margin-bottom:6px;">${getCategoryName(catId)}</div>
      ${items.map(p=>`
        <div style="display:flex;align-items:center;justify-content:space-between;gap:10px;padding:8px 0;border-bottom:1px solid var(--line);">
          <div style="flex:1;">
            <div class="product-name" style="font-size:14px;">${p.name}</div>
            <div class="cart-item-price">${formatNaira(p.price)}</div>
          </div>
          ${verifyQtyStepperHTML(p.id, Store.state.verify[p.id]||0)}
        </div>
      `).join('')}
    </div>`;
  }).join('');
}
export function renderVerifySummary(){
  const items = Object.entries(Store.state.verify).map(([id,qty])=>({id,qty}));
  const lines = items.map(i=>{
    const p = getProductById(i.id);
    return {...p, qty:i.qty, lineTotal:p.price*i.qty};
  });
  const total = lines.reduce((s,l)=>s+l.lineTotal,0);
  const code = items.length ? generateOrderCode(items) : '——';
  const summaryEl = document.getElementById('verifySummary');
  summaryEl.innerHTML = `
    <div class="summary-row total"><span>Correct Total</span><span>${formatNaira(total)}</span></div>
    <div class="summary-row"><span>Correct Code</span><span style="font-family:monospace;font-weight:700;letter-spacing:1px;">${code}</span></div>
  `;
  summaryEl.dataset.code = code;
}
export function updateVerifyMatchResult(){
  const summaryEl = document.getElementById('verifySummary');
  const codeInput = document.getElementById('verifyCodeInput');
  const resultEl = document.getElementById('verifyMatchResult');
  if(!summaryEl || !codeInput || !resultEl) return;
  const correctCode = summaryEl.dataset.code;
  const typed = codeInput.value.trim().toUpperCase();
  const hasItems = Object.keys(Store.state.verify).length > 0;
  if(typed && hasItems){
    const match = typed === correctCode;
    resultEl.innerHTML = match
      ? `<div style="color:var(--wa-deep);font-weight:600;font-size:13.5px;margin:8px 0 var(--s4);">✓ Code matches — safe to confirm at this total.</div>`
      : `<div style="color:var(--danger);font-weight:600;font-size:13.5px;margin:8px 0 var(--s4);">✗ Code does not match — do not confirm at the customer's stated price.</div>`;
  } else {
    resultEl.innerHTML = '';
  }
}
export function renderVerifyPage(){
  renderVerifyPicker();
  renderVerifySummary();
  updateVerifyMatchResult();
}
export function resetVerify(){
  const codeInput = document.getElementById('verifyCodeInput');
  if(codeInput) codeInput.value = '';
  setState({ verify: {} });
}


/* ============ DASHBOARD STATISTICS ============
   Real numbers, computed from the same live data admin-orders.js and
   products.js already maintain — nothing fetched separately here.
   "Pending" = still in flight (not yet delivered/picked up, and not
   cancelled). "Completed" = delivered or picked up. Cancelled orders
   count toward neither bucket, and are excluded from revenue — an
   order that didn't happen isn't a sale. */
export function getDashboardStats(){
  const orders = getAllOrders();
  const completed = orders.filter(o => o.status === 'delivered' || o.status === 'picked_up');
  const cancelled = orders.filter(o => o.status === 'cancelled');
  const pending = orders.length - completed.length - cancelled.length;
  const revenue = orders.reduce((sum, o) => o.status === 'cancelled' ? sum : sum + (o.total || 0), 0);
  const products = getProducts();
  const lowStockCount = products.filter(p => typeof p.stock === 'number' && p.stock <= INVENTORY.LOW_STOCK_WARNING).length;
  return {
    totalProducts: products.length,
    totalOrders: orders.length,
    pendingOrders: pending,
    completedOrders: completed.length,
    revenue,
    lowStockCount
  };
}
