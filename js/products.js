import { SAMPLE_PRODUCTS } from '../data/products.sample.js';
import { getFirebaseApp, isFirebaseConfigured, loadFirebaseModule } from './firebase.js';
import { subscribeToProducts } from './firestore.js';

/* ============ PRODUCT DATA LAYER ============
   Everything else in the app calls the functions below instead of
   reading product data directly.

   loadProducts() tries Firestore first if Firebase is configured, and
   falls back to the local sample data if Firestore isn't configured,
   is unreachable, or the "products" collection is empty — the site
   should never show a blank catalog just because a network call failed.

   Firestore documents are expected to have the same fields as
   data/products.sample.js (catId, name, price, labels, tint, image) —
   the product's `id` comes from the Firestore document ID itself.
   Category Management / Feature Labels step: `catId` references a
   Firestore category document (js/categories.js) and `labels`
   references zero or more Firestore label documents (js/labels.js) —
   both replace the old hardcoded `cat` name string / `badge` string /
   `featured` boolean. getCategories()/getCategoryIcon() that used to
   live here are gone: category names are no longer just a distinct
   set of product field values, they're admin-managed records (see
   js/categories.js's getCategoryName()), and product visuals use one
   shared fallback icon now instead of a category-name-keyed map (see
   PRODUCT_FALLBACK_ICON in data/products.sample.js).
   ================================================================ */
let productsCache = [];

export async function loadProducts(){
  if(isFirebaseConfigured()){
    try {
      const app = await getFirebaseApp();
      const { getFirestore, collection, getDocs } = await loadFirebaseModule('firestore');
      const db = getFirestore(app);
      const snap = await getDocs(collection(db, 'products'));
      if(!snap.empty){
        productsCache = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        return productsCache;
      }
      console.warn('Firestore "products" collection is empty — using local sample data instead.');
    } catch(e){
      console.error('Could not load products from Firestore, falling back to sample data:', e);
    }
  }
  productsCache = SAMPLE_PRODUCTS;
  return productsCache;
}

export function getProducts(){
  return productsCache;
}

export function getProductById(id){
  return productsCache.find(p => p.id === id);
}

/* ============================================================
   Admin Dashboard (Phase 3) additions below. getProducts() above stays
   exactly as it was — the admin Products page still needs the full,
   unfiltered list (including anything an admin has marked unavailable,
   so they can find and re-enable it). Customer-facing rendering
   (js/ui.js) uses getActiveProducts() instead, added here rather than
   filtering inside getProducts() itself, so this is additive and
   nothing that already calls getProducts() changes behaviour.
   ================================================================ */

/** Storefront-safe view: excludes anything an admin has explicitly
    marked unavailable. `active` defaults to true when absent so every
    pre-existing product (the whole sample catalog, and any Firestore
    product created before this field existed) keeps showing exactly as
    before — this only ever hides a product once someone deliberately
    flips it off. */
export function getActiveProducts(){
  return productsCache.filter(p => p.active !== false);
}

/** Live updates after the initial loadProducts() above — same
    empty-collection-falls-back-to-sample rule, so a subscription firing
    on an empty Firestore "products" collection can never wipe out the
    fallback catalog that's currently on screen. Returns an unsubscribe
    function. The storefront (js/app.js) and the admin dashboard
    (js/admin-products.js) both call this and both read the one shared
    productsCache via getProducts()/getActiveProducts() above — there's
    only ever one subscription and one cache, not one per caller. */
export async function subscribeToProductUpdates(callback){
  return subscribeToProducts(products => {
    productsCache = products.length ? products : SAMPLE_PRODUCTS;
    callback();
  });
}
