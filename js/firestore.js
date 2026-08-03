import { getFirebaseApp, isFirebaseConfigured, loadFirebaseModule } from './firebase.js';

/* ============================================================
   Firestore operations. Each function is already called from the
   right place (checkout.js, admin.js) with the right arguments — if
   Firebase isn't configured yet, each one safely no-ops instead of
   throwing, so nothing else in the app needs to change or check
   isFirebaseConfigured() itself.
   ============================================================ */

export async function saveOrderToFirestore(order){
  if(!isFirebaseConfigured()) return null;

  try {
    const app = await getFirebaseApp();
    const { getFirestore, collection, addDoc } = await loadFirebaseModule('firestore');

    const db = getFirestore(app);
    const docRef = await addDoc(collection(db, 'orders'), order);

    return docRef.id;
  } catch(e){
    console.error("Firestore save failed:", e);
    return null;
  }
}

/** Subscribes to live order updates for an admin/worker view.
    Returns an unsubscribe function — always call it, even on the no-op path. */
export async function subscribeToOrders(callback){
  if(!isFirebaseConfigured()) return () => {};
  try {
    const app = await getFirebaseApp();
    const { getFirestore, collection, onSnapshot, orderBy, query } = await loadFirebaseModule('firestore');
    const db = getFirestore(app);
    const q = query(collection(db, 'orders'), orderBy('date', 'desc'));
    return onSnapshot(q, snap => {
      callback(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    }, err => {
      console.error('Order subscription error:', err);
    });
  } catch(e){
    console.error('Could not subscribe to Firestore orders:', e);
    return () => {};
  }
}

/** Customer-scoped version of subscribeToOrders() above, for "My
    Orders" (js/order-tracking.js) — same shape, filtered to one
    customer's own orders. Needs a composite index the first time it
    runs against real data (userId equality + a date ordering on a
    different field); Firestore will offer a direct console link to
    create it if so. */
export async function subscribeToUserOrders(uid, callback){
  if(!isFirebaseConfigured() || !uid) return () => {};
  try {
    const app = await getFirebaseApp();
    const { getFirestore, collection, onSnapshot, orderBy, query, where } = await loadFirebaseModule('firestore');
    const db = getFirestore(app);
    const q = query(collection(db, 'orders'), where('userId', '==', uid), orderBy('date', 'desc'));
    return onSnapshot(q, snap => {
      callback(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    }, err => {
      console.error('Order subscription error (customer-scoped):', err);
    });
  } catch(e){
    console.error('Could not subscribe to this customer\u2019s Firestore orders:', e);
    return () => {};
  }
}

export async function addProductToFirestore(product){
  if(!isFirebaseConfigured()) return null;
  try {
    const app = await getFirebaseApp();
    const { getFirestore, collection, addDoc } = await loadFirebaseModule('firestore');
    const docRef = await addDoc(collection(getFirestore(app), 'products'), product);
    return docRef.id;
  } catch(e){
    console.error('Could not add product to Firestore:', e);
    return null;
  }
}

export async function updateProductInFirestore(id, changes){
  if(!isFirebaseConfigured()) return null;
  try {
    const app = await getFirebaseApp();
    const { getFirestore, doc, updateDoc } = await loadFirebaseModule('firestore');
    await updateDoc(doc(getFirestore(app), 'products', id), changes);
    return true;
  } catch(e){
    console.error('Could not update product in Firestore:', e);
    return false;
  }
}

export async function deleteProductFromFirestore(id){
  if(!isFirebaseConfigured()) return null;
  try {
    const app = await getFirebaseApp();
    const { getFirestore, doc, deleteDoc } = await loadFirebaseModule('firestore');
    await deleteDoc(doc(getFirestore(app), 'products', id));
    return true;
  } catch(e){
    console.error('Could not delete product in Firestore:', e);
    return false;
  }
}

/** orderId here is order.id — the app's own human-readable code (e.g.
    "ORD-736684", set in js/checkout.js) — not the Firestore document's
    own id. Those were never the same thing: js/firestore.js's
    saveOrderWithStockCheck() creates each order with an auto-generated
    document id, and order.id lives as an ordinary field inside that
    document, same as it always has (that's also why every display of
    an order — admin table/modal, customer order history, both order
    emails, the WhatsApp recap — already shows "ORD-736684" correctly;
    only this one function was assuming orderId was the document id).
    Queried by the id field instead of assumed, so this works for every
    order regardless of when it was placed, not just ones created after
    this fix. A single-field equality filter needs no composite index.
    Also appends to statusHistory (seeded with one entry at order
    creation — see checkout.js) alongside status, since
    trackingTimelineHTML() (js/order-tracking.js) looks up a timestamp
    per step from statusHistory — without this, the timeline would show
    the right current step but no date under it. */
export async function updateOrderStatus(orderId, status){
  if(!isFirebaseConfigured()) return false;
  try {
    const app = await getFirebaseApp();
    const { getFirestore, collection, query, where, getDocs, updateDoc, arrayUnion } = await loadFirebaseModule('firestore');
    const db = getFirestore(app);
    const q = query(collection(db, 'orders'), where('id', '==', orderId));
    const snap = await getDocs(q);
    if(snap.empty){
      console.error('Could not update order status: no order found with id', orderId);
      return false;
    }
    await updateDoc(snap.docs[0].ref, {
      status,
      statusHistory: arrayUnion({ status, at: Date.now() })
    });
    return true;
  } catch(e){
    console.error('Could not update order status in Firestore:', e);
    return false;
  }
}

export async function getAdminRecord(uid){
  if(!isFirebaseConfigured()) return null;

  try{
    const app = await getFirebaseApp();
    const { getFirestore, doc, getDoc } = await loadFirebaseModule('firestore');

    const db = getFirestore(app);

    const snap = await getDoc(doc(db, 'admins', uid));

    if(!snap.exists()) return null;

    return snap.data();

  }catch(e){
    console.error('Could not load admin record:', e);
    return null;
  }
}

/* ============================================================
   Customer profile (Phase 2, Customer Profile step). One document
   per customer at users/{uid} holds Profile Information, Addresses,
   and — in the next step — Notification Preferences, per the
   "store everything in users/{uid}" decision. See js/auth.js for the
   in-memory cache read by My Account (js/account.js).
   ============================================================ */

export async function getUserProfile(uid){
  if(!isFirebaseConfigured() || !uid) return null;
  try {
    const app = await getFirebaseApp();
    const { getFirestore, doc, getDoc } = await loadFirebaseModule('firestore');
    const snap = await getDoc(doc(getFirestore(app), 'users', uid));
    return snap.exists() ? snap.data() : null;
  } catch(e){
    console.error('Could not load user profile:', e);
    return null;
  }
}

/** Merges patch into users/{uid} — pass only the fields that changed
    (e.g. { addresses: [...] }), existing fields not present in patch
    are left alone. */
export async function saveUserProfile(uid, patch){
  if(!isFirebaseConfigured() || !uid) return false;
  try {
    const app = await getFirebaseApp();
    const { getFirestore, doc, setDoc } = await loadFirebaseModule('firestore');
    await setDoc(doc(getFirestore(app), 'users', uid), patch, { merge: true });
    return true;
  } catch(e){
    console.error('Could not save user profile:', e);
    return false;
  }
}

/** Live version of getUserProfile() above, for cross-device sync (Step
    1e) — Profile Information, Addresses, Notification Preferences, and
    hiddenOrderIds all live in this one document, so subscribing to it
    once covers all of them. See js/auth.js for the subscription
    lifecycle around currentUserProfile. Unlike subscribeToUserOrders(),
    this is a single-document read, not a collection query — no
    composite index needed. */
export async function subscribeToUserProfile(uid, callback){
  if(!isFirebaseConfigured() || !uid) return () => {};
  try {
    const app = await getFirebaseApp();
    const { getFirestore, doc, onSnapshot } = await loadFirebaseModule('firestore');
    const db = getFirestore(app);
    return onSnapshot(doc(db, 'users', uid), snap => {
      callback(snap.exists() ? snap.data() : null);
    }, err => {
      console.error('User profile subscription error:', err);
    });
  } catch(e){
    console.error('Could not subscribe to this customer\u2019s Firestore profile:', e);
    return () => {};
  }
}

/* ============================================================
   Customer cart (Phase 2, Persistent Cart step). One document per
   customer at carts/{uid} — a dedicated collection, deliberately NOT
   folded into users/{uid}, since cart changes happen far more often
   than profile edits and shouldn't be bundled with them. See
   js/cart.js for the sync lifecycle (startCartSync()/stopCartSync(),
   and the guest/cloud cart merge on sign-in) around Store.state.cart.
   ============================================================ */

export async function getUserCart(uid){
  if(!isFirebaseConfigured() || !uid) return null;
  try {
    const app = await getFirebaseApp();
    const { getFirestore, doc, getDoc } = await loadFirebaseModule('firestore');
    const snap = await getDoc(doc(getFirestore(app), 'carts', uid));
    return snap.exists() ? snap.data() : null;
  } catch(e){
    console.error('Could not load user cart:', e);
    return null;
  }
}

/** Full replacement of carts/{uid} — always pass the complete cart
    object, not just whatever changed. Unlike saveUserProfile() above,
    this deliberately does NOT use { merge: true }: a merge only ever
    adds or updates fields, so a removed item's quantity would never
    actually disappear from the document. */
export async function saveCartToFirestore(uid, cart){
  if(!isFirebaseConfigured() || !uid) return false;
  try {
    const app = await getFirebaseApp();
    const { getFirestore, doc, setDoc } = await loadFirebaseModule('firestore');
    await setDoc(doc(getFirestore(app), 'carts', uid), cart);
    return true;
  } catch(e){
    console.error('Could not save user cart:', e);
    return false;
  }
}

/** Live version of getUserCart() above, for cross-device sync. Single-
    document read, like subscribeToUserProfile() — no composite index
    needed. */
export async function subscribeToUserCart(uid, callback){
  if(!isFirebaseConfigured() || !uid) return () => {};
  try {
    const app = await getFirebaseApp();
    const { getFirestore, doc, onSnapshot } = await loadFirebaseModule('firestore');
    const db = getFirestore(app);
    return onSnapshot(doc(db, 'carts', uid), snap => {
      callback(snap.exists() ? snap.data() : null);
    }, err => {
      console.error('User cart subscription error:', err);
    });
  } catch(e){
    console.error('Could not subscribe to this customer\u2019s Firestore cart:', e);
    return () => {};
  }
}

/* ============================================================
   Admin Dashboard (Phase 3). Product CRUD reuses addProductToFirestore/
   updateProductInFirestore/deleteProductFromFirestore above — nothing
   new needed there. Two new pieces below: a live products subscription
   (so admin edits reach the storefront without a refresh, same pattern
   as subscribeToUserCart/subscribeToUserProfile above) and order
   placement folded together with inventory decrement in one
   transaction (see js/cart.js, js/checkout.js, js/admin-products.js,
   js/admin-orders.js for how these are used).
   ============================================================ */

/** Live version of loadProducts() in js/products.js — every signed-in-
    or-not visitor gets the same feed (products/{productId} is public-
    read, see firestore.rules), so this needs no uid. Used by both the
    storefront (js/products.js's subscribeToProductUpdates()) and the
    admin dashboard's Products page, from the same subscription — see
    js/products.js, which owns the single shared in-memory cache both
    sides read from. */
export async function subscribeToProducts(callback){
  if(!isFirebaseConfigured()) return () => {};
  try {
    const app = await getFirebaseApp();
    const { getFirestore, collection, onSnapshot } = await loadFirebaseModule('firestore');
    const db = getFirestore(app);
    return onSnapshot(collection(db, 'products'), snap => {
      callback(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    }, err => {
      console.error('Product subscription error:', err);
    });
  } catch(e){
    console.error('Could not subscribe to Firestore products:', e);
    return () => {};
  }
}

/** Live version of subscribeToOrders() above, but that function already
    covers this exact need (all orders, unfiltered) — kept as a single
    export so admin-orders.js has one obvious thing to import rather
    than two names for the same query. Re-exported here only for
    discoverability alongside the other admin-facing functions; the
    implementation lives in subscribeToOrders() and isn't duplicated. */
export { subscribeToOrders as subscribeToAllOrders };

/** Places an order and decrements each purchased item's stock in one
    Firestore transaction, so an order is never saved without the stock
    to back it, and two customers racing for the last unit can't both
    win — Firestore retries the losing transaction against fresh data,
    so it correctly sees the item as sold out on retry rather than
    letting stock go negative. Only line items backed by a real
    Firestore product document with a numeric `stock` field are checked
    or decremented; a sample-catalog item (no Firestore document for
    its id) or a product with no stock field set is treated as
    unlimited, same as every prior phase — this only ever tightens
    behavior for products an admin has actually put stock numbers on.
    Requires the narrow customer stock-decrement rule in
    firestore.rules (see the comment there) alongside the existing
    owner-only product write rule, which this never touches.
    Returns { ok, orderId, insufficient } — insufficient is a list of
    { id, name, available } for any item that didn't have enough stock;
    when non-empty, ok is false and nothing was written (no order, no
    stock change) so the caller (js/checkout.js) can ask the customer
    to adjust their bag instead of completing the order. */
export async function saveOrderWithStockCheck(order){
  if(!isFirebaseConfigured()) return { ok: true, orderId: null, insufficient: [] };
  try {
    const app = await getFirebaseApp();
    const { getFirestore, collection, doc, runTransaction } = await loadFirebaseModule('firestore');
    const db = getFirestore(app);
    const orderRef = doc(collection(db, 'orders'));
    let insufficient = [];

    await runTransaction(db, async (tx) => {
      insufficient = []; // reset on every attempt — Firestore retries this whole function on conflict
      const refs = order.items.map(l => doc(db, 'products', l.id));
      const snaps = [];
      for(const ref of refs){
        snaps.push(await tx.get(ref)); // transactions require all reads before any writes, hence sequential
      }

      snaps.forEach((snap, i) => {
        if(!snap.exists()) return; // sample-catalog item — no Firestore doc, not stock-tracked
        const stock = snap.data().stock;
        if(typeof stock !== 'number') return; // this product doesn't track stock
        if(stock < order.items[i].qty){
          insufficient.push({ id: order.items[i].id, name: order.items[i].name, available: stock });
        }
      });

      if(insufficient.length) return; // abort the transaction — nothing gets written

      snaps.forEach((snap, i) => {
        if(!snap.exists()) return;
        const stock = snap.data().stock;
        if(typeof stock !== 'number') return;
        tx.update(refs[i], { stock: stock - order.items[i].qty });
      });

      tx.set(orderRef, order);
    });

    return { ok: insufficient.length === 0, orderId: insufficient.length === 0 ? orderRef.id : null, insufficient };
  } catch(e){
    console.error('Could not save order with stock check:', e);
    return { ok: false, orderId: null, insufficient: [], error: e };
  }
}

/* ============================================================
   Category Management (Category Management step). CRUD + a live
   subscription, exactly the same shape as the product functions
   above — addCategoryToFirestore/updateCategoryInFirestore/
   deleteCategoryFromFirestore/subscribeToCategories mirror
   addProductToFirestore/updateProductInFirestore/
   deleteProductFromFirestore/subscribeToProducts one-for-one. See
   js/categories.js for the shared cache both the storefront and the
   Admin Dashboard's Categories page read from, and js/admin-
   categories.js for the page that calls the functions below.
   ============================================================ */

export async function addCategoryToFirestore(category){
  if(!isFirebaseConfigured()) return null;
  try {
    const app = await getFirebaseApp();
    const { getFirestore, collection, addDoc } = await loadFirebaseModule('firestore');
    const docRef = await addDoc(collection(getFirestore(app), 'categories'), category);
    return docRef.id;
  } catch(e){
    console.error('Could not add category to Firestore:', e);
    return null;
  }
}

export async function updateCategoryInFirestore(id, changes){
  if(!isFirebaseConfigured()) return null;
  try {
    const app = await getFirebaseApp();
    const { getFirestore, doc, updateDoc } = await loadFirebaseModule('firestore');
    await updateDoc(doc(getFirestore(app), 'categories', id), changes);
    return true;
  } catch(e){
    console.error('Could not update category in Firestore:', e);
    return false;
  }
}

export async function deleteCategoryFromFirestore(id){
  if(!isFirebaseConfigured()) return null;
  try {
    const app = await getFirebaseApp();
    const { getFirestore, doc, deleteDoc } = await loadFirebaseModule('firestore');
    await deleteDoc(doc(getFirestore(app), 'categories', id));
    return true;
  } catch(e){
    console.error('Could not delete category in Firestore:', e);
    return false;
  }
}

/** Live version of loadCategories() in js/categories.js — public-read
    (see firestore.rules), so this needs no uid. No where()/orderBy()
    here on purpose: active-filtering and sortOrder-sorting happen
    client-side in js/categories.js, the same reason subscribeToProducts()
    above has no query filters of its own — it keeps this collection
    free of any composite-index requirement. */
export async function subscribeToCategories(callback){
  if(!isFirebaseConfigured()) return () => {};
  try {
    const app = await getFirebaseApp();
    const { getFirestore, collection, onSnapshot } = await loadFirebaseModule('firestore');
    const db = getFirestore(app);
    return onSnapshot(collection(db, 'categories'), snap => {
      callback(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    }, err => {
      console.error('Category subscription error:', err);
    });
  } catch(e){
    console.error('Could not subscribe to Firestore categories:', e);
    return () => {};
  }
}

/* ============================================================
   Feature Labels (Feature Labels step). Same CRUD + live-subscription
   shape again — see js/labels.js for the shared cache and
   js/admin-labels.js for the Admin Dashboard page that calls these.
   ============================================================ */

export async function addLabelToFirestore(label){
  if(!isFirebaseConfigured()) return null;
  try {
    const app = await getFirebaseApp();
    const { getFirestore, collection, addDoc } = await loadFirebaseModule('firestore');
    const docRef = await addDoc(collection(getFirestore(app), 'labels'), label);
    return docRef.id;
  } catch(e){
    console.error('Could not add label to Firestore:', e);
    return null;
  }
}

export async function updateLabelInFirestore(id, changes){
  if(!isFirebaseConfigured()) return null;
  try {
    const app = await getFirebaseApp();
    const { getFirestore, doc, updateDoc } = await loadFirebaseModule('firestore');
    await updateDoc(doc(getFirestore(app), 'labels', id), changes);
    return true;
  } catch(e){
    console.error('Could not update label in Firestore:', e);
    return false;
  }
}

export async function deleteLabelFromFirestore(id){
  if(!isFirebaseConfigured()) return null;
  try {
    const app = await getFirebaseApp();
    const { getFirestore, doc, deleteDoc } = await loadFirebaseModule('firestore');
    await deleteDoc(doc(getFirestore(app), 'labels', id));
    return true;
  } catch(e){
    console.error('Could not delete label in Firestore:', e);
    return false;
  }
}

/** Live version of loadLabels() in js/labels.js — same no-query-filter
    reasoning as subscribeToCategories() above. */
export async function subscribeToLabels(callback){
  if(!isFirebaseConfigured()) return () => {};
  try {
    const app = await getFirebaseApp();
    const { getFirestore, collection, onSnapshot } = await loadFirebaseModule('firestore');
    const db = getFirestore(app);
    return onSnapshot(collection(db, 'labels'), snap => {
      callback(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    }, err => {
      console.error('Label subscription error:', err);
    });
  } catch(e){
    console.error('Could not subscribe to Firestore labels:', e);
    return () => {};
  }
}

/* ============================================================
   Delivery Zones (Phase 4 Step 1 — Smart Delivery Engine, part of the
   Secure Checkout & Paystack Integration phase). Same CRUD + live-
   subscription shape as Category Management / Feature Labels above —
   addDeliveryZoneToFirestore/updateDeliveryZoneInFirestore/
   deleteDeliveryZoneFromFirestore/subscribeToDeliveryZones mirror
   addCategoryToFirestore/updateCategoryInFirestore/
   deleteCategoryFromFirestore/subscribeToCategories one-for-one. See
   js/delivery-zones.js for the shared cache both the storefront
   (later step) and the Admin Dashboard's Delivery Zones page read
   from, and js/admin-delivery-zones.js for the page that calls the
   functions below.
   ============================================================ */

export async function addDeliveryZoneToFirestore(zone){
  if(!isFirebaseConfigured()) return null;
  try {
    const app = await getFirebaseApp();
    const { getFirestore, collection, addDoc } = await loadFirebaseModule('firestore');
    const docRef = await addDoc(collection(getFirestore(app), 'deliveryZones'), zone);
    return docRef.id;
  } catch(e){
    console.error('Could not add delivery zone to Firestore:', e);
    return null;
  }
}

export async function updateDeliveryZoneInFirestore(id, changes){
  if(!isFirebaseConfigured()) return null;
  try {
    const app = await getFirebaseApp();
    const { getFirestore, doc, updateDoc } = await loadFirebaseModule('firestore');
    await updateDoc(doc(getFirestore(app), 'deliveryZones', id), changes);
    return true;
  } catch(e){
    console.error('Could not update delivery zone in Firestore:', e);
    return false;
  }
}

export async function deleteDeliveryZoneFromFirestore(id){
  if(!isFirebaseConfigured()) return null;
  try {
    const app = await getFirebaseApp();
    const { getFirestore, doc, deleteDoc } = await loadFirebaseModule('firestore');
    await deleteDoc(doc(getFirestore(app), 'deliveryZones', id));
    return true;
  } catch(e){
    console.error('Could not delete delivery zone in Firestore:', e);
    return false;
  }
}

/** Live version of loadDeliveryZones() in js/delivery-zones.js —
    public-read (see firestore.rules), so this needs no uid. No
    where()/orderBy() here on purpose, same reasoning as
    subscribeToCategories() above. */
export async function subscribeToDeliveryZones(callback){
  if(!isFirebaseConfigured()) return () => {};
  try {
    const app = await getFirebaseApp();
    const { getFirestore, collection, onSnapshot } = await loadFirebaseModule('firestore');
    const db = getFirestore(app);
    return onSnapshot(collection(db, 'deliveryZones'), snap => {
      callback(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    }, err => {
      console.error('Delivery zone subscription error:', err);
    });
  } catch(e){
    console.error('Could not subscribe to Firestore delivery zones:', e);
    return () => {};
  }
}
