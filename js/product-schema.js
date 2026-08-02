/* Shape for a brand-new product in the admin dashboard's Add/Edit
   Product form (js/admin-products.js). `catId` (not `cat`) holds a
   Firestore category document id — see js/categories.js — and
   `labels` (not the old single `featured` boolean) holds an array of
   Firestore label document ids — see js/labels.js. Both are reference
   fields now, resolved to display names live, so a category rename or
   a label rename is reflected everywhere without touching any product
   document. `badge` (the old free-text New/Bestseller/Limited string)
   is gone entirely — it's fully superseded by `labels`. */
export const EMPTY_PRODUCT = {
  name: "",
  catId: "",
  brand: "Kitchen And Home By Noor",

  price: 0,
  stock: 10,

  labels: [],
  tint: "#F5F5F5",

  image: "",

  description: "",

  active: true,

  createdAt: null,
  updatedAt: null
};
