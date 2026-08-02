/* Sample product catalog — today this IS the product database.
   js/products.js is the only file that imports this directly; every
   other module goes through js/products.js's functions instead of
   touching this array, so replacing it with a real Firestore
   collection later means editing js/products.js only — nothing
   else in the app needs to change.
   To go back to editing products by hand for now, just edit the
   array below directly.

   Category Management / Feature Labels step: products here now carry
   catId/labels (Firestore document id references) instead of the old
   cat name string / single badge string, matching exactly what a real
   Firestore product document looks like post-migration — see
   js/categories.js and js/labels.js. SAMPLE_CATEGORIES/SAMPLE_LABELS
   below are this file's fallback catalog's own category/label records
   (used only when Firestore is unconfigured, unreachable, or those
   collections are empty), the same resilience role SAMPLE_PRODUCTS
   already plays for products — see js/categories.js's loadCategories()
   and js/labels.js's loadLabels(). None of this is "bundled category
   data" in the sense the Admin Dashboard replaces: it's demo-mode-only
   fallback content, invisible the moment a real Firestore project has
   its own categories/labels, exactly like SAMPLE_PRODUCTS is invisible
   the moment real products exist. */
export const SAMPLE_CATEGORIES = [
  { id: 'sample-bags', name: 'Bags', image: '', description: '', active: true, sortOrder: 0 },
  { id: 'sample-shoes', name: 'Shoes', image: '', description: '', active: true, sortOrder: 1 },
  { id: 'sample-watches', name: 'Watches', image: '', description: '', active: true, sortOrder: 2 },
  { id: 'sample-accessories', name: 'Accessories', image: '', description: '', active: true, sortOrder: 3 }
];
export const SAMPLE_LABELS = [
  { id: 'sample-new', name: 'New', enabled: true },
  { id: 'sample-bestseller', name: 'Best Seller', enabled: true },
  { id: 'sample-limited', name: 'Limited Edition', enabled: true }
];
/** Generic fallback icon shown in a product's visual area when it has
    no image URL set — a single neutral package/box glyph used for
    every category now, since category-name-keyed icons (the old
    CATEGORY_ICONS map) can't work once categories are admin-defined
    and open-ended rather than a fixed hardcoded list. See
    js/ui.js's visualHTML(). */
export const PRODUCT_FALLBACK_ICON = '<path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z"/><path d="M3.3 7 12 12l8.7-5"/><path d="M12 22V12"/>';
export const SAMPLE_PRODUCTS = [
  // Bags
  {id:'bag-1', catId:'sample-bags', name:'Woven Straw Tote', price:18500, labels:['sample-bestseller'], tint:'#E8C9A0', image:'', stock:15},
  {id:'bag-2', catId:'sample-bags', name:'Leather Crossbody', price:32000, labels:[], tint:'#E8C9A0', image:'', stock:22},
  {id:'bag-3', catId:'sample-bags', name:'Structured Clutch', price:27000, labels:['sample-new'], tint:'#E8C9A0', image:'', stock:8},
  {id:'bag-4', catId:'sample-bags', name:'Quilted Chain Shoulder Bag', price:38500, labels:[], tint:'#E8C9A0', image:'', stock:0},
  {id:'bag-5', catId:'sample-bags', name:'Canvas Weekender Bag', price:45000, labels:[], tint:'#E8C9A0', image:'', stock:30},
  {id:'bag-6', catId:'sample-bags', name:'Mini Top-Handle Bag', price:29000, labels:['sample-new'], tint:'#E8C9A0', image:'', stock:12},
  {id:'bag-7', catId:'sample-bags', name:'Suede Hobo Bag', price:34500, labels:[], tint:'#E8C9A0', image:'', stock:18},
  {id:'bag-8', catId:'sample-bags', name:'Patent Leather Tote', price:41000, labels:['sample-bestseller'], tint:'#E8C9A0', image:'', stock:5},
  {id:'bag-9', catId:'sample-bags', name:'Woven Rattan Basket Bag', price:22000, labels:[], tint:'#E8C9A0', image:'', stock:25},
  {id:'bag-10', catId:'sample-bags', name:'Embellished Evening Bag', price:36000, labels:['sample-limited'], tint:'#E8C9A0', image:'', stock:0},
  // Shoes
  {id:'shoe-1', catId:'sample-shoes', name:'Classic White Sneakers', price:24000, labels:['sample-bestseller'], tint:'#AFC4CC', image:'', stock:15},
  {id:'shoe-2', catId:'sample-shoes', name:'Strapped Block Heels', price:21500, labels:['sample-new'], tint:'#AFC4CC', image:'', stock:22},
  {id:'shoe-3', catId:'sample-shoes', name:'Pointed Toe Flats', price:17000, labels:[], tint:'#AFC4CC', image:'', stock:8},
  {id:'shoe-4', catId:'sample-shoes', name:'Suede Ankle Boots', price:33000, labels:[], tint:'#AFC4CC', image:'', stock:0},
  {id:'shoe-5', catId:'sample-shoes', name:'Woven Espadrille Sandals', price:15500, labels:[], tint:'#AFC4CC', image:'', stock:30},
  {id:'shoe-6', catId:'sample-shoes', name:'Platform Loafers', price:26500, labels:['sample-new'], tint:'#AFC4CC', image:'', stock:12},
  {id:'shoe-7', catId:'sample-shoes', name:'Stiletto Pumps', price:29000, labels:[], tint:'#AFC4CC', image:'', stock:18},
  {id:'shoe-8', catId:'sample-shoes', name:'Chunky Combat Boots', price:31000, labels:['sample-bestseller'], tint:'#AFC4CC', image:'', stock:5},
  {id:'shoe-9', catId:'sample-shoes', name:'Slide Sandals', price:12000, labels:[], tint:'#AFC4CC', image:'', stock:25},
  {id:'shoe-10', catId:'sample-shoes', name:'Metallic Strap Heels', price:27500, labels:['sample-limited'], tint:'#AFC4CC', image:'', stock:0},
  // Watches
  {id:'watch-1', catId:'sample-watches', name:'Minimalist Steel Watch', price:35000, labels:['sample-bestseller'], tint:'#B7C2A4', image:'', stock:15},
  {id:'watch-2', catId:'sample-watches', name:'Rose Gold Chain Watch', price:42000, labels:[], tint:'#B7C2A4', image:'', stock:22},
  {id:'watch-3', catId:'sample-watches', name:'Leather Strap Classic Watch', price:31000, labels:[], tint:'#B7C2A4', image:'', stock:8},
  {id:'watch-4', catId:'sample-watches', name:'Diamond-Dial Dress Watch', price:58000, labels:['sample-limited'], tint:'#B7C2A4', image:'', stock:0},
  {id:'watch-5', catId:'sample-watches', name:'Mesh Band Watch', price:28500, labels:[], tint:'#B7C2A4', image:'', stock:30},
  {id:'watch-6', catId:'sample-watches', name:'Chronograph Sports Watch', price:46000, labels:['sample-new'], tint:'#B7C2A4', image:'', stock:12},
  {id:'watch-7', catId:'sample-watches', name:'Two-Tone Bracelet Watch', price:39500, labels:[], tint:'#B7C2A4', image:'', stock:18},
  {id:'watch-8', catId:'sample-watches', name:'Vintage Square Face Watch', price:33500, labels:[], tint:'#B7C2A4', image:'', stock:5},
  {id:'watch-9', catId:'sample-watches', name:'Ceramic White Watch', price:44000, labels:['sample-bestseller'], tint:'#B7C2A4', image:'', stock:25},
  {id:'watch-10', catId:'sample-watches', name:'Bangle Cuff Watch', price:26000, labels:[], tint:'#B7C2A4', image:'', stock:0},
  // Accessories
  {id:'acc-1', catId:'sample-accessories', name:'Aviator Sunglasses', price:12000, labels:[], tint:'#E8BCC0', image:'', stock:15},
  {id:'acc-2', catId:'sample-accessories', name:'Beaded Statement Necklace', price:9500, labels:[], tint:'#E8BCC0', image:'', stock:22},
  {id:'acc-3', catId:'sample-accessories', name:'Silk Scarf', price:8000, labels:['sample-limited'], tint:'#E8BCC0', image:'', stock:8},
  {id:'acc-4', catId:'sample-accessories', name:'Pearl Drop Earrings', price:11000, labels:['sample-new'], tint:'#E8BCC0', image:'', stock:0},
  {id:'acc-5', catId:'sample-accessories', name:'Layered Gold Bracelet Set', price:13500, labels:['sample-bestseller'], tint:'#E8BCC0', image:'', stock:30},
  {id:'acc-6', catId:'sample-accessories', name:'Cat-Eye Sunglasses', price:10500, labels:[], tint:'#E8BCC0', image:'', stock:12},
  {id:'acc-7', catId:'sample-accessories', name:'Leather Belt', price:7500, labels:[], tint:'#E8BCC0', image:'', stock:18},
  {id:'acc-8', catId:'sample-accessories', name:'Wide-Brim Sun Hat', price:14000, labels:[], tint:'#E8BCC0', image:'', stock:5},
  {id:'acc-9', catId:'sample-accessories', name:'Charm Anklet', price:6500, labels:[], tint:'#E8BCC0', image:'', stock:25},
  {id:'acc-10', catId:'sample-accessories', name:'Oversized Hair Clip Set', price:5000, labels:['sample-new'], tint:'#E8BCC0', image:'', stock:0}
];

