import { SAMPLE_DELIVERY_ZONES } from '../data/products.sample.js';
import { getFirebaseApp, isFirebaseConfigured, loadFirebaseModule } from './firebase.js';
import { subscribeToDeliveryZones } from './firestore.js';

/* ============ DELIVERY ZONE DATA LAYER (Phase 4 Step 1 — Smart Delivery
   Engine, part of the Secure Checkout & Paystack Integration phase) ============
   Mirrors js/categories.js exactly on purpose — same Firestore-first,
   sample-fallback-on-empty-or-failure shape, same single shared
   in-memory cache read through the functions below rather than
   touched directly. The Admin Dashboard's Delivery Zones page
   (js/admin-delivery-zones.js) is the only place real zones are
   managed.

   A delivery zone document shape: { name, fee, description, active,
   sortOrder }. `fee` is a plain number (Naira, whole units — same
   convention as product.price; see js/utils.js's formatNaira()).

   This step only ships the data layer + the Admin Dashboard's
   management page. Nothing on the storefront reads this collection
   yet — checkout keeps using the flat DELIVERY_CHARGE from
   js/config.js exactly as it does today, unchanged, until a later
   Phase 4 step wires checkout up to the Cloud Functions pricing
   pipeline that will actually charge for a zone's fee. That's also
   why getActiveDeliveryZonesSorted() below (the checkout-facing view,
   same shape as js/categories.js's getActiveCategoriesSorted()) has
   no caller yet in this step — it exists now so the module is
   complete and ready for that step, the same way js/categories.js
   shipped both its admin- and storefront-facing exports together.

   IMPORTANT for later steps: this cache must only ever be used for a
   client-side ESTIMATE/display. The amount actually charged will
   always be computed by the initializeCheckout Cloud Function reading
   the real zone fee from Firestore directly — never from whatever a
   browser happens to have cached — so a tampered local cache can
   never change what's charged.

   SAMPLE_DELIVERY_ZONES (data/products.sample.js) is the fallback used
   only when Firestore isn't configured, is unreachable, or the
   "deliveryZones" collection is empty — the exact same resilience rule
   loadCategories()/loadProducts() already follow.
   ================================================================ */
let deliveryZonesCache = [];

export async function loadDeliveryZones(){
  if(isFirebaseConfigured()){
    try {
      const app = await getFirebaseApp();
      const { getFirestore, collection, getDocs } = await loadFirebaseModule('firestore');
      const db = getFirestore(app);
      const snap = await getDocs(collection(db, 'deliveryZones'));
      if(!snap.empty){
        deliveryZonesCache = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        return deliveryZonesCache;
      }
      console.warn('Firestore "deliveryZones" collection is empty — using sample delivery zones instead.');
    } catch(e){
      console.error('Could not load delivery zones from Firestore, falling back to sample zones:', e);
    }
  }
  deliveryZonesCache = SAMPLE_DELIVERY_ZONES;
  return deliveryZonesCache;
}

/** Full list, unfiltered/unsorted by active state — for the Admin
    Dashboard's Delivery Zones page, which needs to show and manage
    hidden zones too, not just what checkout will eventually offer. */
export function getAllDeliveryZones(){
  return deliveryZonesCache;
}

/** Checkout-safe view: active zones only (missing `active` defaults to
    true, same convention as products/categories), sorted by sortOrder
    (missing sortOrder sorts last, stable by name as a tiebreaker) —
    same shape as js/categories.js's getActiveCategoriesSorted(). No
    caller yet in this step — see the file header. */
export function getActiveDeliveryZonesSorted(){
  return [...deliveryZonesCache]
    .filter(z => z.active !== false)
    .sort((a, b) => {
      const soA = typeof a.sortOrder === 'number' ? a.sortOrder : Infinity;
      const soB = typeof b.sortOrder === 'number' ? b.sortOrder : Infinity;
      if(soA !== soB) return soA - soB;
      return (a.name || '').localeCompare(b.name || '');
    });
}

export function getDeliveryZoneById(id){
  return deliveryZonesCache.find(z => z.id === id);
}

/** Live updates after the initial loadDeliveryZones() above — same
    empty-collection-falls-back-to-sample rule as js/categories.js's
    subscribeToCategoryUpdates(). Returns an unsubscribe function. */
export async function subscribeToDeliveryZoneUpdates(callback){
  return subscribeToDeliveryZones(zones => {
    deliveryZonesCache = zones.length ? zones : SAMPLE_DELIVERY_ZONES;
    callback();
  });
}
