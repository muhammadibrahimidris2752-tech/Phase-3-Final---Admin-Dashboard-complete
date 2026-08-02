/* ============================================================
   Everything involved in turning a cart into a placed order: the
   fulfilment/payment step, the verification code, order-history
   persistence, placing the order itself, and the two notification
   emails (admin + customer).

   Order flow (see handlePlaceOrderClick below):
     1. Save the order + decrement stock — saveOrderWithStockCheck(), one
                                          Firestore transaction (real, but
                                          no-op until Firebase is configured).
                                          Aborts with no order written if any
                                          line item doesn't have enough stock.
     2. Save to local order history   — saveHistoryToStorage()
     3. Email the admin               — sendAdminOrderEmail()
     4. Email the customer            — sendCustomerConfirmationEmail()
     5. Open WhatsApp with the order recap, as a redundant paper trail
     6. Show the customer their Orders page as confirmation

   Steps 3 and 4 each catch their own errors independently — a failed
   or unconfigured email never blocks the order itself or the other
   email. Placing an order now requires the customer to be signed in
   with Google (see the sign-in gate in handlePlaceOrderClick) — that,
   plus name/phone/email/address collected below, is what staff use to
   fulfil and confirm the order.
   ============================================================ */
import { Store, setState } from './store.js';
import { getCartLines, getSubtotal, persistCart } from './cart.js';
import { formatNaira, buildWaLink } from './utils.js';
import { showToast, showPage, renderCartPage } from './ui.js';
import { BRAND_NAME, ORDER_CODE_SALT, DELIVERY_CHARGE, EMAILJS_PUBLIC_KEY, EMAILJS_SERVICE_ID, EMAILJS_TEMPLATE_ID, EMAILJS_CUSTOMER_TEMPLATE_ID } from './config.js';
import { saveOrderWithStockCheck, saveUserProfile } from './firestore.js';
import { getCurrentUser, loginWithGoogle, getCurrentUserProfile, setCachedUserProfile } from './auth.js';
import { ORDER_STATUS } from './order-status.js';
import { renderHistoryPage } from './order-tracking.js';

/* ============ ORDER VERIFICATION CODE ============
   Produces a short deterministic code from an order's item IDs and
   quantities (never from price — a tampered product price would just
   make the code "consistent" with the wrong number, so hashing price
   in wouldn't add real protection). This code is stored with the order
   and shown on the customer's Orders page. It's also what the Verify
   Order (staff) page reproduces independently from its own device —
   see js/admin.js — as a check that's not fooled by anything changed
   in the customer's own browser.
   ================================================================ */
export function generateOrderCode(items){
  // items: [{id, qty}] — sorted so the same combination always produces the same code
  const sorted = [...items].sort((a,b)=> a.id.localeCompare(b.id));
  const raw = sorted.map(i=>`${i.id}:${i.qty}`).join('|') + '|' + ORDER_CODE_SALT;
  let hash = 0;
  for(let i=0;i<raw.length;i++){
    hash = ((hash<<5) - hash + raw.charCodeAt(i)) | 0;
  }
  return Math.abs(hash).toString(36).toUpperCase().padStart(6,'0').slice(0,6);
}

/* ============ FULFILMENT + PAYMENT METHOD ============
   Delivery vs Pickup, and the payment options that go with each —
   approved Phase 1 checkout step. Lives in Store.state (not just the
   DOM) so the selection survives the re-renders that already happen
   on every cart change (see store.js's render() dispatcher).
   ================================================================ */
const PAYMENT_METHOD_LABEL = {
  bank_transfer: 'Bank Transfer',
  pay_on_delivery: 'Pay on Delivery',
  pay_on_pickup: 'Pay on Pickup'
};
const PAYMENT_METHODS_BY_FULFILMENT = {
  delivery: ['bank_transfer', 'pay_on_delivery'],
  pickup: ['bank_transfer', 'pay_on_pickup']
};

export function getOrderTotal(){
  return getSubtotal() + (Store.state.fulfillment === 'delivery' ? DELIVERY_CHARGE : 0);
}
export function setFulfilment(method){
  const validIds = PAYMENT_METHODS_BY_FULFILMENT[method] || PAYMENT_METHODS_BY_FULFILMENT.delivery;
  const keepCurrent = validIds.includes(Store.state.paymentMethod);
  setState({ fulfillment: method, paymentMethod: keepCurrent ? Store.state.paymentMethod : validIds[0] });
}
export function setPaymentMethod(method){
  setState({ paymentMethod: method });
}
export function fulfilmentSectionHTML(){
  const fulfillment = Store.state.fulfillment || 'delivery';
  const validIds = PAYMENT_METHODS_BY_FULFILMENT[fulfillment];
  const paymentMethod = validIds.includes(Store.state.paymentMethod) ? Store.state.paymentMethod : validIds[0];
  const subtotal = getSubtotal();
  const deliveryCharge = fulfillment === 'delivery' ? DELIVERY_CHARGE : 0;
  const total = subtotal + deliveryCharge;
  const itemCount = getCartLines().reduce((s,l)=>s+l.qty,0);
  return `
    <div class="fulfilment-section">
      <div class="fulfilment-label">How would you like to get your order?</div>
      <div class="fulfilment-toggle">
        <button class="fulfilment-option ${fulfillment==='delivery'?'active':''}" onclick="setFulfilment('delivery')">
          <svg viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="1" y="3" width="15" height="13" rx="2"/><path d="M16 8h3l3 3v5h-6"/><circle cx="5.5" cy="18.5" r="2"/><circle cx="18.5" cy="18.5" r="2"/></svg>
          Delivery
        </button>
        <button class="fulfilment-option ${fulfillment==='pickup'?'active':''}" onclick="setFulfilment('pickup')">
          <svg viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 7 12 3 4 7v10l8 4 8-4Z"/><path d="M4 7l8 4 8-4M12 11v10"/></svg>
          Pickup
        </button>
      </div>
      <div class="fulfilment-label" style="margin-top:var(--s4);">Payment method</div>
      <div class="payment-method-list">
        ${validIds.map(id => `
          <button class="payment-method-option ${paymentMethod===id?'active':''}" onclick="setPaymentMethod('${id}')">
            <span class="payment-method-radio"></span>${PAYMENT_METHOD_LABEL[id]}
          </button>
        `).join('')}
      </div>
      <div class="summary-box" style="margin-top:var(--s4);">
        <div class="summary-row"><span>Subtotal (${itemCount} item${itemCount===1?'':'s'})</span><span>${formatNaira(subtotal)}</span></div>
        ${fulfillment==='delivery' ? `<div class="summary-row"><span>Delivery charge</span><span>${formatNaira(deliveryCharge)}</span></div>` : ''}
        <div class="summary-row total"><span>Total</span><span>${formatNaira(total)}</span></div>
      </div>
    </div>
  `;
}

/* ============ ORDER HISTORY PERSISTENCE ============
   Order history is saved to localStorage so it survives a page
   refresh. It's per-browser/per-device — a customer switching from
   Chrome to Safari, or to a different phone, starts with an empty
   history there. That's expected for a no-backend storefront like
   this one. Everything here is wrapped in try/catch: some browsers
   (private mode, certain in-app browsers) block storage entirely —
   if that happens the site should keep working normally, it just
   won't remember orders between visits.
   ================================================================ */
const HISTORY_STORAGE_KEY = 'khn_order_history_v1';
export function loadHistoryFromStorage(){
  try {
    const saved = localStorage.getItem(HISTORY_STORAGE_KEY);
    return saved ? JSON.parse(saved) : [];
  } catch(e){
    return [];
  }
}
export function saveHistoryToStorage(){
  try {
    localStorage.setItem(HISTORY_STORAGE_KEY, JSON.stringify(Store.state.history));
  } catch(e){
    // storage full or blocked — history still works for this session
  }
}

/* ============ PLACE ORDER ============ */
export async function handlePlaceOrderClick(){
  const lines = getCartLines();
  if(!lines.length) return;

  const fulfillment = Store.state.fulfillment || 'delivery';
  const nameEl = document.getElementById('custName');
  const phoneEl = document.getElementById('custPhone');
  const emailEl = document.getElementById('custEmail');
  const addressEl = document.getElementById('custAddress');
  const name = nameEl ? nameEl.value.trim() : '';
  const phone = phoneEl ? phoneEl.value.trim() : '';
  const email = emailEl ? emailEl.value.trim() : '';
  const address = addressEl ? addressEl.value.trim() : '';

  if(!name){
    showToast('Please add your name');
    if(nameEl) nameEl.focus();
    return;
  }
  if(!phone){
    showToast('Please add a phone number so we can reach you');
    if(phoneEl) phoneEl.focus();
    return;
  }
  if(!email || !email.includes('@')){
    showToast('Please add a valid email for your order confirmation');
    if(emailEl) emailEl.focus();
    return;
  }
  if(fulfillment === 'delivery' && !address){
    showToast('Please add a delivery address');
    if(addressEl) addressEl.focus();
    return;
  }

  let user = getCurrentUser();
  if(!user){
    showToast('Please sign in with Google before placing your order.');
    try {
      await loginWithGoogle();
      user = getCurrentUser();
    } catch(err){
      console.error(err);
      return;
    }
    if(!user) return;
  }

  const deliveryCharge = fulfillment === 'delivery' ? DELIVERY_CHARGE : 0;
  const order = {
    id: 'ORD-' + Math.floor(100000 + Math.random()*900000),
    date: Date.now(),
    items: lines,
    subtotal: getSubtotal(),
    deliveryCharge: deliveryCharge,
    total: getSubtotal() + deliveryCharge,
    fulfillment: fulfillment,
    paymentMethod: Store.state.paymentMethod,
    name: name,
    phone: phone,
    email: email,
    address: fulfillment === 'delivery' ? address : '',

    userId: user ? user.uid : null,
    googleName: user ? user.displayName : '',
    googleEmail: user ? user.email : '',

    status: ORDER_STATUS.CONFIRMED,
    statusHistory: [{ status: ORDER_STATUS.CONFIRMED, at: Date.now() }],

    code: generateOrderCode(lines.map(l => ({ id: l.id, qty: l.qty })))
  };

  const result = await saveOrderWithStockCheck(order); // stock-safe transaction — see js/firestore.js
  if(!result.ok){
    const detail = result.insufficient.map(i => `${i.name} (${i.available} left)`).join(', ');
    showToast(detail
      ? `Sorry, stock just changed — ${detail}. Please update your bag and try again.`
      : 'Could not place your order — please try again.');
    renderCartPage();
    return;
  }

  Store.state.history.unshift(order);
  saveHistoryToStorage();
  sendAdminOrderEmail(order);
  sendCustomerConfirmationEmail(order);
  window.open(buildWaLink(buildWhatsAppOrderMessage(order)), '_blank', 'noopener,noreferrer');
  setState({ cart: {}, paymentMethod: null });
  persistCart({});
  showToast('Order placed! Confirmation emailed, and we\u2019ve opened WhatsApp for you too.');
  showPage('history');
}

/** The cart page's small "Prefer email? Sign in here" link (only shown
    when signed out — see renderCartPage() in js/ui.js). Deliberately
    does NOT touch the sign-in gate above: that gate still auto-triggers
    Google as the fastest path, unchanged from Phase 1. This is a
    secondary option for customers who'd rather not use Google at all —
    it sends them to the full Sign In page, and they return to this
    same cart page (with Place Order ready) once signed in, via
    Store.state.authReturnTo and app.js's auth-state listener. */
export function handleUseEmailInsteadClick(){
  Store.state.authReturnTo = 'cart';
  showPage('signin');
}

/** WhatsApp is back as an additional step alongside Firestore/email —
    some customers expect a WhatsApp confirmation, and it gives a
    redundant paper trail. Built straight from the already-validated
    order object, so it can never drift out of sync with what was
    actually saved. */
function buildWhatsAppOrderMessage(order){
  let msg = `Hi ${BRAND_NAME}! \u{1F44B} I've placed an order on your website:\n\n`;
  order.items.forEach((l,i)=>{
    msg += `${i+1}. ${l.name} \u00d7${l.qty} \u2014 ${formatNaira(l.lineTotal)}\n`;
  });
  msg += `\n*Total: ${formatNaira(order.total)}*`;
  if(order.deliveryCharge) msg += ` (incl. ${formatNaira(order.deliveryCharge)} delivery)`;
  msg += `\n\nName: ${order.name}`;
  msg += `\nFulfilment: ${order.fulfillment === 'pickup' ? 'Pickup' : 'Delivery'}`;
  msg += `\nPayment method: ${PAYMENT_METHOD_LABEL[order.paymentMethod] || order.paymentMethod || '\u2014'}`;
  if(order.fulfillment !== 'pickup') msg += `\nDelivery address: ${order.address}`;
  msg += `\n\nVerification code: ${order.code}`;
  msg += `\nOrder ID: ${order.id}`;
  return msg;
}

export function reorderFromHistory(orderId){
  const order = Store.state.history.find(o=>o.id===orderId);
  if(!order) return;
  const cart = {...Store.state.cart};
  order.items.forEach(l=>{ cart[l.id] = (cart[l.id]||0) + l.qty; });
  setState({ cart });
  persistCart(cart);
  showToast('Added to bag');
  showPage('cart');
}
/** Never touches the real order record — see the file header. Adds to
    hiddenOrderIds on the customer's users/{uid} document instead, so
    the business's record stays intact and the hide follows the
    customer across devices, surviving the next live snapshot. */
export async function deleteOrder(orderId){
  const user = getCurrentUser();
  if(!user) return;
  const profile = getCurrentUserProfile() || {};
  const hiddenOrderIds = profile.hiddenOrderIds || [];
  if(hiddenOrderIds.includes(orderId)) return;
  const updated = [...hiddenOrderIds, orderId];
  setCachedUserProfile({ ...profile, hiddenOrderIds: updated }); // optimistic — reflected immediately
  renderHistoryPage();
  showToast('Order removed');
  const ok = await saveUserProfile(user.uid, { hiddenOrderIds: updated });
  if(!ok) console.error('Could not persist hidden order id:', orderId);
}
export async function clearAllHistory(){
  if(!confirm('Clear your entire order history? This can\'t be undone.')) return;
  const user = getCurrentUser();
  if(!user) return;
  const profile = getCurrentUserProfile() || {};
  const existingHidden = profile.hiddenOrderIds || [];
  const allIds = Store.state.history.map(o => o.id);
  const updated = [...new Set([...existingHidden, ...allIds])];
  setCachedUserProfile({ ...profile, hiddenOrderIds: updated });
  renderHistoryPage();
  showToast('Order history cleared');
  const ok = await saveUserProfile(user.uid, { hiddenOrderIds: updated });
  if(!ok) console.error('Could not persist cleared order history');
}

/* ============ NOTIFICATION EMAILS ============
   One shared payload builder, used by both emails, so item-formatting
   logic exists in exactly one place and any future notification (e.g.
   a Firebase order-status-changed email) can reuse the same shape
   without the order object itself ever needing to change.
   ================================================================ */
function buildOrderEmailPayload(order){
  return {
    order_id: order.id,
    order_code: order.code,
    customer_name: order.name || '(not provided)',
    customer_phone: order.phone || '(not provided)',
    customer_email: order.email || '(not provided)',
    customer_address: order.fulfillment === 'pickup' ? '(pickup — no delivery address)' : (order.address || '(not provided)'),
    order_date: new Date(order.date).toLocaleString('en-NG', {dateStyle:'medium', timeStyle:'short'}),
    items_summary: order.items.map(l=>`${l.name} x${l.qty} — ${formatNaira(l.lineTotal)}`).join('\n'),
    items_summary_html: order.items.map(l=>`${l.name} x${l.qty} — ${formatNaira(l.lineTotal)}`).join('<br>'),
    fulfilment_method: order.fulfillment === 'pickup' ? 'Pickup' : 'Delivery',
    payment_method: PAYMENT_METHOD_LABEL[order.paymentMethod] || order.paymentMethod || '(not provided)',
    delivery_charge: order.deliveryCharge ? formatNaira(order.deliveryCharge) : 'N/A (Pickup)',
    order_subtotal: formatNaira(order.subtotal != null ? order.subtotal : order.total),
    order_total: formatNaira(order.total)
  };
}

export function emailJsReady(){
  return typeof emailjs !== 'undefined'
    && EMAILJS_PUBLIC_KEY !== 'YOUR_EMAILJS_PUBLIC_KEY'
    && EMAILJS_SERVICE_ID !== 'YOUR_EMAILJS_SERVICE_ID'
    && EMAILJS_TEMPLATE_ID !== 'YOUR_EMAILJS_TEMPLATE_ID';
}
/** Separate readiness check for the customer template specifically —
    the admin email keeps working even if this one isn't set up yet. */
export function customerEmailJsReady(){
  return typeof emailjs !== 'undefined'
    && EMAILJS_PUBLIC_KEY !== 'YOUR_EMAILJS_PUBLIC_KEY'
    && EMAILJS_SERVICE_ID !== 'YOUR_EMAILJS_SERVICE_ID'
    && EMAILJS_CUSTOMER_TEMPLATE_ID !== 'YOUR_EMAILJS_CUSTOMER_TEMPLATE_ID';
}

export function sendAdminOrderEmail(order){
  if(!emailJsReady()) return;

  emailjs.send(
    EMAILJS_SERVICE_ID,
    EMAILJS_TEMPLATE_ID,
    buildOrderEmailPayload(order)
  )
  .catch(function(err){
    console.error('Admin order email failed to send:', err);
  });
}

export function sendCustomerConfirmationEmail(order){
  if(!customerEmailJsReady()) return;
  emailjs.send(EMAILJS_SERVICE_ID, EMAILJS_CUSTOMER_TEMPLATE_ID, buildOrderEmailPayload(order))
    .catch(function(err){
      // Customer email failing should never affect the order, the admin
      // email, or anything the customer sees — it's already complete by
      // this point (history saved, cart cleared, confirmation shown).
      console.error('Customer confirmation email failed to send:', err);
    });
}

