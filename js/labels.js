import { SAMPLE_LABELS } from '../data/products.sample.js';
import { getFirebaseApp, isFirebaseConfigured, loadFirebaseModule } from './firebase.js';
import { subscribeToLabels } from './firestore.js';

/* ============ PRODUCT LABEL DATA LAYER (Feature Labels step) ============
   Replaces the old single hardcoded `featured` boolean (and the ad hoc
   `badge` string that only ever held one of three fixed values) with
   fully admin-managed, multi-assign labels — same Firestore-first,
   sample-fallback shape as js/categories.js and js/products.js.

   A label document shape: { name, enabled }. A product references zero
   or more labels by id in product.labels (an array of label document
   ids, not names — same reasoning as product.catId in js/categories.js:
   renaming a label from the Admin Dashboard's Labels page instantly
   updates every product card showing it, with no product document
   needing to change). "Enable/Disable" (the `enabled` field) hides a
   label from the storefront everywhere without deleting it or losing
   which products it's assigned to — a product that only has disabled
   labels simply shows none, exactly like an out-of-stock/inactive
   product still exists but doesn't render.
   ============================================================ */
let labelsCache = [];

export async function loadLabels(){
  if(isFirebaseConfigured()){
    try {
      const app = await getFirebaseApp();
      const { getFirestore, collection, getDocs } = await loadFirebaseModule('firestore');
      const db = getFirestore(app);
      const snap = await getDocs(collection(db, 'labels'));
      if(!snap.empty){
        labelsCache = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        return labelsCache;
      }
      console.warn('Firestore "labels" collection is empty — using sample labels instead.');
    } catch(e){
      console.error('Could not load labels from Firestore, falling back to sample labels:', e);
    }
  }
  labelsCache = SAMPLE_LABELS;
  return labelsCache;
}

/** Full list, including disabled labels — for the Admin Dashboard's
    Labels page (which needs to show and re-enable a disabled label)
    and the product form's label picker (an admin should still see and
    be able to un-assign a disabled label already on a product). */
export function getAllLabels(){
  return labelsCache;
}

/** Storefront-safe view: enabled labels only — this is what product
    cards actually render. Missing `enabled` defaults to true, matching
    the same convention used for product/category `active`. */
export function getEnabledLabels(){
  return labelsCache.filter(l => l.enabled !== false);
}

export function getLabelById(id){
  return labelsCache.find(l => l.id === id);
}

export function getLabelName(id){
  const l = getLabelById(id);
  return l ? l.name : '';
}

/** Resolves a product's label ids into enabled label objects, in the
    order they were assigned — used everywhere a product card renders
    its labels (js/ui.js) and in Verify Order / admin table summaries.
    A label that's been deleted or disabled since assignment silently
    drops out here rather than showing a broken/blank pill. */
export function getEnabledLabelsForProduct(product){
  if(!product || !Array.isArray(product.labels)) return [];
  return product.labels
    .map(id => getLabelById(id))
    .filter(l => l && l.enabled !== false);
}

/** Live updates after the initial loadLabels() above — same pattern as
    js/categories.js's subscribeToCategoryUpdates(). Returns an
    unsubscribe function. */
export async function subscribeToLabelUpdates(callback){
  return subscribeToLabels(labels => {
    labelsCache = labels.length ? labels : SAMPLE_LABELS;
    callback();
  });
}
