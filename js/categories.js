import { SAMPLE_CATEGORIES } from '../data/products.sample.js';
import { getFirebaseApp, isFirebaseConfigured, loadFirebaseModule } from './firebase.js';
import { subscribeToCategories } from './firestore.js';

/* ============ CATEGORY DATA LAYER (Category Management step) ============
   Mirrors js/products.js exactly on purpose — same Firestore-first,
   sample-fallback-on-empty-or-failure shape, same single shared
   in-memory cache read through functions below rather than touched
   directly. The Admin Dashboard's Categories page is now the only
   place that manages real categories (js/admin-categories.js); nothing
   here or anywhere downstream hardcodes a category list any more —
   see the removed js/product-category.js and images/categories/*.png.

   A category document shape: { name, image, description, active,
   sortOrder }. `image` is a plain URL (same "URL field, not a file
   upload" decision already made for products — see PROJECT_SUMMARY.md).
   Products reference a category by its Firestore document id
   (product.catId) instead of by name, so renaming a category in the
   Admin Dashboard is instantly reflected everywhere a product shows
   its category — nothing on the product document itself changes.

   SAMPLE_CATEGORIES (data/products.sample.js) is the fallback used
   only when Firestore isn't configured, is unreachable, or the
   "categories" collection is empty — the exact same resilience rule
   loadProducts() already follows, so a fresh Firebase project (real
   config, but no categories added yet) still shows a working storefront
   instead of a blank one, and SAMPLE_PRODUCTS' own catId values resolve
   to real names instead of dangling.
   ============================================================ */
let categoriesCache = [];

export async function loadCategories(){
  if(isFirebaseConfigured()){
    try {
      const app = await getFirebaseApp();
      const { getFirestore, collection, getDocs } = await loadFirebaseModule('firestore');
      const db = getFirestore(app);
      const snap = await getDocs(collection(db, 'categories'));
      if(!snap.empty){
        categoriesCache = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        return categoriesCache;
      }
      console.warn('Firestore "categories" collection is empty — using sample categories instead.');
    } catch(e){
      console.error('Could not load categories from Firestore, falling back to sample categories:', e);
    }
  }
  categoriesCache = SAMPLE_CATEGORIES;
  return categoriesCache;
}

/** Full list, unfiltered/unsorted by active state — for the Admin
    Dashboard's Categories page, which needs to show and manage hidden
    categories too, not just what the storefront currently shows. */
export function getAllCategories(){
  return categoriesCache;
}

/** Storefront-safe view: active categories only (missing `active`
    defaults to true, same convention products.js's getActiveProducts()
    uses for `active`), sorted by sortOrder (missing sortOrder sorts
    last, stable by name as a tiebreaker) — this is what the home page's
    category tiles and the catalog's filter chips read. Deliberately
    filtered/sorted client-side rather than via a Firestore query so no
    composite index is ever required for this collection — same reason
    subscribeToProducts() below has no where()/orderBy() of its own. */
export function getActiveCategoriesSorted(){
  return [...categoriesCache]
    .filter(c => c.active !== false)
    .sort((a, b) => {
      const soA = typeof a.sortOrder === 'number' ? a.sortOrder : Infinity;
      const soB = typeof b.sortOrder === 'number' ? b.sortOrder : Infinity;
      if(soA !== soB) return soA - soB;
      return (a.name || '').localeCompare(b.name || '');
    });
}

export function getCategoryById(id){
  return categoriesCache.find(c => c.id === id);
}

/** Products store catId, not a name — every place that used to show
    p.cat directly now calls this instead, so a category rename in the
    Admin Dashboard reaches every product card, the cart, order-picking
    tools, etc. without touching a single product document. Falls back
    to a plain em dash for a product whose catId doesn't resolve (the
    category was deleted after the product was assigned to it) rather
    than showing a raw id or throwing. */
export function getCategoryName(catId){
  const c = getCategoryById(catId);
  return c ? c.name : '\u2014';
}

/** Live updates after the initial loadCategories() above — same
    empty-collection-falls-back-to-sample rule as products.js's
    subscribeToProductUpdates(). Returns an unsubscribe function. Both
    the storefront (js/app.js) and the admin dashboard
    (js/dashboard.js) call this and both read the one shared
    categoriesCache via the functions above — there's only ever one
    subscription and one cache, not one per caller. */
export async function subscribeToCategoryUpdates(callback){
  return subscribeToCategories(categories => {
    categoriesCache = categories.length ? categories : SAMPLE_CATEGORIES;
    callback();
  });
}
