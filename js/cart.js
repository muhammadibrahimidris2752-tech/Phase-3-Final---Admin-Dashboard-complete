import { Store, setState } from './store.js';
import { getProductById } from './products.js';
import { showToast } from './ui.js';
import { getCurrentUser } from './auth.js';
import { getUserCart, saveCartToFirestore, subscribeToUserCart } from './firestore.js';

/* ============ CART ============
   Both mutators below are stock-aware (Inventory Management, Phase 3):
   a product's `stock` field, when present, caps how many of it the
   cart can hold. Missing/non-numeric stock (every product before this
   phase, and any product an admin hasn't set stock on) is treated as
   unlimited — unchanged from every prior phase. This is a UI-layer
   convenience only; the real, race-safe enforcement is the Firestore
   transaction in saveOrderWithStockCheck() (js/firestore.js), run at
   the moment an order is actually placed (js/checkout.js) — this just
   stops the cart from *offering* more than is available in the first
   place, so the transaction only ever has to reject the rare case
   where stock changed after it was already in someone's bag. */
function stockFor(id){
  const p = getProductById(id);
  return p && typeof p.stock === 'number' ? p.stock : null;
}
export function addToCart(id){
  const cart = {...Store.state.cart};
  const stock = stockFor(id);
  if(stock !== null && stock <= 0){
    showToast('That item is out of stock');
    return;
  }
  const next = (cart[id]||0) + 1;
  if(stock !== null && next > stock){
    showToast(`Only ${stock} left in stock`);
    return;
  }
  cart[id] = next;
  setState({ cart });
  persistCart(cart);
  showToast('Added to bag');
}
export function changeQty(id, delta){
  const cart = {...Store.state.cart};
  const next = (cart[id]||0) + delta;
  const stock = stockFor(id);
  if(delta > 0 && stock !== null && next > stock){
    showToast(stock <= 0 ? 'That item is out of stock' : `Only ${stock} left in stock`);
    return;
  }
  cart[id] = next;
  if(cart[id] <= 0) delete cart[id];
  setState({ cart });
  persistCart(cart);
}
export function removeFromCart(id){
  const cart = {...Store.state.cart};
  delete cart[id];
  setState({ cart });
  persistCart(cart);
  showToast('Removed from bag');
}
export function getCartLines(){
  return Object.entries(Store.state.cart)
    .map(([id, qty]) => {
      const p = getProductById(id);
      if(!p) return null;

      return {
        ...p,
        qty,
        lineTotal: p.price * qty
      };
    })
    .filter(Boolean);
}

export function getSubtotal(){
  return getCartLines().reduce((s, l) => s + l.lineTotal, 0);
}

/** Pushes the given cart to Firestore for the signed-in customer, so it
    syncs across their devices. Signed out, this silently no-ops — guest
    carts stay local-only, exactly as before this step. Called after the
    local setState() above in every mutator, same fire-and-forget style
    as saveOrderToFirestore() in js/checkout.js: the UI has already
    updated by the time this runs, so a failure here only means the sync
    silently doesn't happen, not that anything visible breaks. Returns
    the underlying promise so startCartSync() below can await it when it
    needs to, without forcing every other caller to. */
export async function persistCart(cart){
  const user = getCurrentUser();
  if(!user) return;
  await saveCartToFirestore(user.uid, cart);
}

/* ---------- live sync lifecycle — called from app.js's auth-state
   listener, same pattern as js/order-tracking.js's
   startOrderHistorySync()/stopOrderHistorySync() ---------- */
let unsubscribeCart = null;

/** On sign-in: one-time fetch of this customer's Firestore cart, merged
    with whatever's already in the local (guest) cart by summing
    quantities per product id — a guest who added items before signing
    in shouldn't lose them, and neither should whatever they already had
    saved from another device. The merged result is written back to
    Firestore before the live subscription attaches, so every device
    converges on the same cart; the subscription then takes over for
    anything that changes afterward. */
export async function startCartSync(uid){
  if(unsubscribeCart){
    unsubscribeCart();
    unsubscribeCart = null;
  }
  const remoteCart = await getUserCart(uid) || {};
  const merged = { ...remoteCart };
  for(const id in Store.state.cart){
    merged[id] = (merged[id]||0) + Store.state.cart[id];
  }
  setState({ cart: merged });
  await persistCart(merged);

  unsubscribeCart = await subscribeToUserCart(uid, cart => {
    setState({ cart: cart || {} });
  });
}

/** Stops the subscription AND clears the cart immediately (rather than
    only when the next snapshot or render happens), so there's no window
    where a different customer signing in on the same device could
    briefly see the previous customer's cart — same reasoning as
    stopOrderHistorySync() in js/order-tracking.js. */
export function stopCartSync(){
  if(unsubscribeCart){
    unsubscribeCart();
    unsubscribeCart = null;
  }
  setState({ cart: {} });
}