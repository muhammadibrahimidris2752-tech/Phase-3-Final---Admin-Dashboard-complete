/* ============================================================
   Admin Dashboard (Phase 3) — Products page: table, search, and the
   Add/Edit/Delete flow.

   Reuses rather than reimplements: addProductToFirestore()/
   updateProductInFirestore()/deleteProductFromFirestore() (all
   already existed in js/firestore.js, just never called) do all the
   actual writes here. This file never touches the shared products
   cache directly — js/products.js's live subscription (already wired
   in js/app.js for the storefront, and in js/dashboard.js for this
   page) picks up every write this file makes and re-renders both
   sides, so a save/delete here needs no manual "now refresh the
   table" step of its own.

   The product form itself is static HTML in admin/index.html (like
   the login form dashboard.js already wires) rather than a template
   string, since its fields never change shape between Add and Edit —
   only the values differ — so populating/reading input values is
   simpler here than rebuilding the form each time. The one exception
   is the category <select> and the labels checklist below: both list
   admin-managed records that can change at any time from the
   Categories/Labels pages, so both are rebuilt from the live cache
   every time the form opens rather than being static HTML.

   Category Management / Feature Labels step: a product now stores
   catId (a Firestore category document id, js/categories.js) instead
   of a hardcoded category name, and labels (an array of Firestore
   label document ids, js/labels.js) instead of the old single
   `featured` boolean / `badge` string. js/product-category.js (the
   bundled PRODUCT_CATEGORIES list) is gone — the category <select>
   below is populated from Firestore, same as everything else category-
   related now.
   ============================================================ */
import { getProducts, getProductById } from './products.js';
import { addProductToFirestore, updateProductInFirestore, deleteProductFromFirestore } from './firestore.js';
import { formatNaira } from './utils.js';
import { getAllCategories, getCategoryName } from './categories.js';
import { getAllLabels, getEnabledLabelsForProduct } from './labels.js';
import { INVENTORY } from './inventory-config.js';
import { showAdminToast } from './admin.js';

// New products get a sensible, palette-consistent tint automatically —
// an admin adding a product doesn't need to pick a color. Categories are
// admin-defined and open-ended now (Category Management step), so this
// can no longer be a fixed name -> color map (there's no fixed list of
// names to map from any more) — instead every category id deterministically
// hashes to one warm, muted tint from the same small palette the original
// per-category colors were drawn from, so it's still consistent for a given
// category every time, just derived instead of hardcoded.
const TINT_PALETTE = ['#E8C9A0', '#AFC4CC', '#B7C2A4', '#E8BCC0', '#D9C7A3', '#C9D6C3', '#D8C4DC', '#C6D9E3'];
function tintForCategory(catId){
  if(!catId) return '#F5F5F5';
  let hash = 0;
  for(let i = 0; i < catId.length; i++){ hash = (hash * 31 + catId.charCodeAt(i)) >>> 0; }
  return TINT_PALETTE[hash % TINT_PALETTE.length];
}

/* ============ TABLE ============ */
function productRowHTML(p){
  const stockLabel = typeof p.stock === 'number'
    ? (p.stock <= 0 ? '<span style="color:var(--danger);font-weight:600;">Out of stock</span>'
       : p.stock <= INVENTORY.LOW_STOCK_WARNING ? `<span style="color:var(--danger);">${p.stock}</span>`
       : p.stock)
    : '\u2014';
  const labelNames = getEnabledLabelsForProduct(p).map(l => l.name);
  const tags = [...labelNames, p.active === false ? 'Hidden' : ''].filter(Boolean).join(' \u00b7 ');
  return `<tr>
    <td>
      <div style="display:flex;align-items:center;gap:10px;">
        <div style="width:36px;height:36px;border-radius:8px;background:${p.tint || 'var(--cream-deep)'};flex-shrink:0;overflow:hidden;display:flex;">
          ${p.image ? `<img src="${p.image}" alt="" style="width:100%;height:100%;object-fit:cover;">` : ''}
        </div>
        <div>
          <div style="font-weight:600;">${p.name}</div>
          ${tags ? `<div style="font-size:11.5px;color:var(--ink-soft);">${tags}</div>` : ''}
        </div>
      </div>
    </td>
    <td>${getCategoryName(p.catId)}</td>
    <td>${formatNaira(p.price)}</td>
    <td>${stockLabel}</td>
    <td>
      <button class="admin-btn admin-btn-outline" style="padding:8px 14px;font-size:12.5px;margin-right:6px;" onclick="openEditProductModal('${p.id}')">Edit</button>
      <button class="admin-btn admin-btn-outline" style="padding:8px 14px;font-size:12.5px;color:var(--danger);border-color:var(--danger);" onclick="handleDeleteProduct('${p.id}')">Delete</button>
    </td>
  </tr>`;
}

/** Full catalog (including anything an admin has hidden), search-
    filtered by name only, in whatever order getProducts() returns —
    the same order the storefront falls back to. Also re-rendered
    whenever categories or labels change (js/dashboard.js), since each
    row shows a resolved category name and resolved label names. */
export function renderProductsTable(){
  const searchEl = document.getElementById('productSearchInput');
  const search = searchEl ? searchEl.value.trim().toLowerCase() : '';
  let list = getProducts();
  if(search) list = list.filter(p => p.name.toLowerCase().includes(search));

  const body = document.getElementById('productsTableBody');
  const empty = document.getElementById('productsEmptyState');
  if(!body) return;
  body.innerHTML = list.map(productRowHTML).join('');
  if(empty) empty.style.display = list.length ? 'none' : '';
}

/* ============ ADD / EDIT MODAL ============ */
/** Rebuilt from the live categories cache every time the form opens
    (see the file header) rather than being static HTML. Shows every
    category, not just active ones — an admin editing a product that's
    still assigned to a category they've since hidden needs to see and
    keep that assignment, not have it silently disappear from the list. */
function populateCategorySelect(selectedId){
  const sel = document.getElementById('productFormCat');
  if(!sel) return;
  const categories = getAllCategories();
  sel.innerHTML = categories.length
    ? categories.map(c => `<option value="${c.id}">${c.name}${c.active === false ? ' (Hidden)' : ''}</option>`).join('')
    : `<option value="">No categories yet \u2014 add one on the Categories page</option>`;
  if(selectedId) sel.value = selectedId;
}

/** Rebuilt from the live labels cache every time the form opens, same
    reasoning as populateCategorySelect() above — shows every label
    (including disabled ones, marked as such) so an admin can still see
    and un-check a disabled label already assigned to this product. */
function populateLabelsChecklist(selectedIds){
  const container = document.getElementById('productFormLabels');
  if(!container) return;
  const labels = getAllLabels();
  const selected = new Set(selectedIds || []);
  container.innerHTML = labels.length
    ? labels.map(l => `
        <label class="admin-checkbox-pill">
          <input type="checkbox" value="${l.id}" ${selected.has(l.id) ? 'checked' : ''}>
          <span>${l.name}${l.enabled === false ? ' (disabled)' : ''}</span>
        </label>
      `).join('')
    : `<span style="font-size:13px;color:var(--ink-soft);">No labels yet \u2014 add one on the Labels page.</span>`;
}

function getCheckedLabelIds(){
  return [...document.querySelectorAll('#productFormLabels input[type="checkbox"]:checked')].map(el => el.value);
}

function setProductForm(p){
  document.getElementById('productFormId').value = p.id || '';
  document.getElementById('productFormName').value = p.name || '';
  populateCategorySelect(p.catId || '');
  document.getElementById('productFormPrice').value = p.price ?? 0;
  document.getElementById('productFormStock').value = p.stock ?? INVENTORY.DEFAULT_STOCK;
  document.getElementById('productFormImage').value = p.image || '';
  populateLabelsChecklist(p.labels || []);
  document.getElementById('productFormActive').checked = p.active !== false;
  document.getElementById('productFormError').textContent = '';
}

export function openAddProductModal(){
  document.getElementById('productModalTitle').textContent = 'Add Product';
  setProductForm({});
  document.getElementById('productModal').style.display = 'flex';
}

export function openEditProductModal(id){
  const p = getProductById(id);
  if(!p) return;
  document.getElementById('productModalTitle').textContent = 'Edit Product';
  setProductForm(p);
  document.getElementById('productModal').style.display = 'flex';
}

export function closeProductModal(){
  document.getElementById('productModal').style.display = 'none';
}

export async function handleProductFormSubmit(e){
  e.preventDefault();
  const errorEl = document.getElementById('productFormError');
  errorEl.textContent = '';

  const id = document.getElementById('productFormId').value;
  const name = document.getElementById('productFormName').value.trim();
  const catId = document.getElementById('productFormCat').value;
  const price = Number(document.getElementById('productFormPrice').value);
  const stock = Number(document.getElementById('productFormStock').value);
  const image = document.getElementById('productFormImage').value.trim();
  const labels = getCheckedLabelIds();
  const active = document.getElementById('productFormActive').checked;

  if(!name){ errorEl.textContent = 'Please enter a product name.'; return; }
  if(!catId){ errorEl.textContent = 'Please choose a category.'; return; }
  if(!Number.isFinite(price) || price < 0){ errorEl.textContent = 'Please enter a valid price.'; return; }
  if(!Number.isFinite(stock) || stock < 0){ errorEl.textContent = 'Please enter a valid stock quantity.'; return; }

  const submitBtn = document.getElementById('productFormSubmit');
  submitBtn.disabled = true;
  submitBtn.textContent = 'Saving\u2026';
  try {
    if(id){
      await updateProductInFirestore(id, { name, catId, price, stock, image, labels, active, updatedAt: Date.now() });
      showAdminToast('Product updated');
    } else {
      await addProductToFirestore({
        name, catId, price, stock, image, labels, active,
        tint: tintForCategory(catId),
        createdAt: Date.now(), updatedAt: Date.now()
      });
      showAdminToast('Product added');
    }
    closeProductModal();
  } catch(err){
    console.error('Could not save product:', err);
    errorEl.textContent = 'Could not save the product \u2014 please try again.';
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = 'Save Product';
  }
}

export async function handleDeleteProduct(id){
  const p = getProductById(id);
  if(!p) return;
  if(!confirm(`Delete "${p.name}"? This can't be undone.`)) return;
  try {
    await deleteProductFromFirestore(id);
    showAdminToast('Product deleted');
  } catch(err){
    console.error('Could not delete product:', err);
    showAdminToast('Could not delete the product \u2014 please try again');
  }
}

/** Wires the Products page's static controls — search input, Add
    Product button, and the form's submit/cancel/close/backdrop —
    exactly once, the same addEventListener convention js/dashboard.js
    uses for its own static elements. Called from js/dashboard.js's
    init(). The category <select> and labels checklist themselves are
    populated on-demand each time the modal opens (see setProductForm()
    above), not here — they depend on data that may not have loaded yet
    at initProductsPage() time, and can change at any point afterwards. */
export function initProductsPage(){
  document.getElementById('productSearchInput')?.addEventListener('input', renderProductsTable);
  document.getElementById('addProductBtn')?.addEventListener('click', openAddProductModal);
  document.getElementById('productForm')?.addEventListener('submit', handleProductFormSubmit);
  document.getElementById('productFormCancel')?.addEventListener('click', closeProductModal);
  document.getElementById('productModalClose')?.addEventListener('click', closeProductModal);
  document.getElementById('productModal')?.addEventListener('click', (e) => {
    if(e.target.id === 'productModal') closeProductModal();
  });
}
