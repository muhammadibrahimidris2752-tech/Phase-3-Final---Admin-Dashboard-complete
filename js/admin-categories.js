/* ============================================================
   Admin Dashboard — Categories page (Category Management step).

   Same shape as js/admin-products.js on purpose: a search-filtered
   table, an Add/Edit modal, delete with confirm, all backed by
   addCategoryToFirestore()/updateCategoryInFirestore()/
   deleteCategoryFromFirestore() (js/firestore.js) doing the actual
   writes. This file never touches the shared categories cache
   directly — js/categories.js's live subscription (wired in
   js/dashboard.js, alongside the existing products one) picks up
   every write this file makes and re-renders the table, the same
   "no manual refresh step" reasoning js/admin-products.js documents.

   This IS now the only place a category can be created, renamed,
   hidden, deleted, or reordered — there's no bundled category list or
   bundled category images left in the project to fall back to editing
   by hand (see js/categories.js's header comment and the removed
   js/product-category.js / images/categories/ folder).

   Reordering: "Reorder Categories" is Up/Down buttons that swap
   sortOrder with the adjacent row, rather than drag-and-drop — this
   project has no drag-and-drop library and deliberately doesn't reach
   for a new dependency just for this (see PROJECT_SUMMARY.md's existing
   "no charting library either" reasoning for Analytics — same call
   here). Two Firestore writes per move; live sync re-renders the table
   with the new order automatically like everything else on this page.
   ============================================================ */
import { getAllCategories, getCategoryById } from './categories.js';
import { addCategoryToFirestore, updateCategoryInFirestore, deleteCategoryFromFirestore } from './firestore.js';
import { showAdminToast } from './admin.js';

/** Same sort the storefront's getActiveCategoriesSorted() (js/categories.js)
    uses, just without the active-only filter — the admin table shows
    hidden categories too (in their place in the order), so hiding a
    category doesn't also hide it from the one place meant to manage it. */
function sortedForAdmin(){
  return [...getAllCategories()].sort((a, b) => {
    const soA = typeof a.sortOrder === 'number' ? a.sortOrder : Infinity;
    const soB = typeof b.sortOrder === 'number' ? b.sortOrder : Infinity;
    if(soA !== soB) return soA - soB;
    return (a.name || '').localeCompare(b.name || '');
  });
}

function truncate(text, max){
  if(!text) return '';
  return text.length > max ? text.slice(0, max).trim() + '\u2026' : text;
}

/* ============ TABLE ============ */
function categoryRowHTML(c, index, total){
  return `<tr>
    <td>
      <div style="display:flex;align-items:center;gap:10px;">
        <div style="width:36px;height:36px;border-radius:8px;background:var(--cream-deep);flex-shrink:0;overflow:hidden;display:flex;align-items:center;justify-content:center;font-weight:700;color:var(--ink-soft);">
          ${c.image ? `<img src="${c.image}" alt="" style="width:100%;height:100%;object-fit:cover;" onerror="this.remove();">` : (c.name || '?').trim().charAt(0).toUpperCase()}
        </div>
        <div style="font-weight:600;">${c.name}</div>
      </div>
    </td>
    <td>${truncate(c.description, 60) || '<span style="color:var(--ink-soft);">\u2014</span>'}</td>
    <td>
      <button class="admin-btn admin-btn-outline" style="padding:6px 12px;font-size:12px;${c.active === false ? '' : 'color:var(--success);border-color:var(--success);'}" onclick="handleToggleCategoryActive('${c.id}')">
        ${c.active === false ? 'Hidden \u2014 Show' : 'Active \u2014 Hide'}
      </button>
    </td>
    <td>
      <button class="admin-btn admin-btn-outline" style="padding:6px 10px;font-size:12px;" ${index === 0 ? 'disabled' : ''} onclick="handleMoveCategory('${c.id}',-1)" aria-label="Move ${c.name} up">\u2191</button>
      <button class="admin-btn admin-btn-outline" style="padding:6px 10px;font-size:12px;" ${index === total - 1 ? 'disabled' : ''} onclick="handleMoveCategory('${c.id}',1)" aria-label="Move ${c.name} down">\u2193</button>
    </td>
    <td>
      <button class="admin-btn admin-btn-outline" style="padding:8px 14px;font-size:12.5px;margin-right:6px;" onclick="openEditCategoryModal('${c.id}')">Edit</button>
      <button class="admin-btn admin-btn-outline" style="padding:8px 14px;font-size:12.5px;color:var(--danger);border-color:var(--danger);" onclick="handleDeleteCategory('${c.id}')">Delete</button>
    </td>
  </tr>`;
}

export function renderCategoriesTable(){
  const searchEl = document.getElementById('categorySearchInput');
  const search = searchEl ? searchEl.value.trim().toLowerCase() : '';
  let list = sortedForAdmin();
  if(search) list = list.filter(c => (c.name || '').toLowerCase().includes(search));

  const body = document.getElementById('categoriesTableBody');
  const empty = document.getElementById('categoriesEmptyState');
  if(!body) return;
  body.innerHTML = list.map((c, i) => categoryRowHTML(c, i, list.length)).join('');
  if(empty) empty.style.display = list.length ? 'none' : '';
}

/* ============ ADD / EDIT MODAL ============ */
function setCategoryForm(c){
  document.getElementById('categoryFormId').value = c.id || '';
  document.getElementById('categoryFormName').value = c.name || '';
  document.getElementById('categoryFormImage').value = c.image || '';
  document.getElementById('categoryFormDescription').value = c.description || '';
  document.getElementById('categoryFormActive').checked = c.active !== false;
  document.getElementById('categoryFormError').textContent = '';
}

export function openAddCategoryModal(){
  document.getElementById('categoryModalTitle').textContent = 'Add Category';
  setCategoryForm({});
  document.getElementById('categoryModal').style.display = 'flex';
}

export function openEditCategoryModal(id){
  const c = getCategoryById(id);
  if(!c) return;
  document.getElementById('categoryModalTitle').textContent = 'Edit Category';
  setCategoryForm(c);
  document.getElementById('categoryModal').style.display = 'flex';
}

export function closeCategoryModal(){
  document.getElementById('categoryModal').style.display = 'none';
}

export async function handleCategoryFormSubmit(e){
  e.preventDefault();
  const errorEl = document.getElementById('categoryFormError');
  errorEl.textContent = '';

  const id = document.getElementById('categoryFormId').value;
  const name = document.getElementById('categoryFormName').value.trim();
  const image = document.getElementById('categoryFormImage').value.trim();
  const description = document.getElementById('categoryFormDescription').value.trim();
  const active = document.getElementById('categoryFormActive').checked;

  if(!name){ errorEl.textContent = 'Please enter a category name.'; return; }

  const submitBtn = document.getElementById('categoryFormSubmit');
  submitBtn.disabled = true;
  submitBtn.textContent = 'Saving\u2026';
  try {
    if(id){
      await updateCategoryInFirestore(id, { name, image, description, active, updatedAt: Date.now() });
      showAdminToast('Category updated');
    } else {
      // New categories go to the end of the admin-set order by default —
      // one more than the highest sortOrder currently in use.
      const highest = getAllCategories().reduce((max, c) => Math.max(max, typeof c.sortOrder === 'number' ? c.sortOrder : -1), -1);
      await addCategoryToFirestore({
        name, image, description, active,
        sortOrder: highest + 1,
        createdAt: Date.now(), updatedAt: Date.now()
      });
      showAdminToast('Category added');
    }
    closeCategoryModal();
  } catch(err){
    console.error('Could not save category:', err);
    errorEl.textContent = 'Could not save the category \u2014 please try again.';
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = 'Save Category';
  }
}

export async function handleDeleteCategory(id){
  const c = getCategoryById(id);
  if(!c) return;
  if(!confirm(`Delete "${c.name}"? Products already using this category will show "\u2014" as their category until reassigned. This can't be undone.`)) return;
  try {
    await deleteCategoryFromFirestore(id);
    showAdminToast('Category deleted');
  } catch(err){
    console.error('Could not delete category:', err);
    showAdminToast('Could not delete the category \u2014 please try again');
  }
}

/** Quick Hide/Show from the table, without opening the full modal —
    same "Active/Hidden" field the modal's toggle controls, just a
    faster path to it for the single most common edit. */
export async function handleToggleCategoryActive(id){
  const c = getCategoryById(id);
  if(!c) return;
  try {
    await updateCategoryInFirestore(id, { active: c.active === false, updatedAt: Date.now() });
    showAdminToast(c.active === false ? 'Category shown' : 'Category hidden');
  } catch(err){
    console.error('Could not update category visibility:', err);
    showAdminToast('Could not update the category \u2014 please try again');
  }
}

/** Reorder Categories: swaps this category's sortOrder with whichever
    neighbor is currently adjacent to it in the admin-visible order
    (direction -1 = up, 1 = down) — see the file header for why this is
    two plain writes rather than drag-and-drop. Silently no-ops at
    either end of the list (the table already disables the button
    there, this is just the same guard against a stray call). */
export async function handleMoveCategory(id, direction){
  const list = sortedForAdmin();
  const index = list.findIndex(c => c.id === id);
  const swapIndex = index + direction;
  if(index === -1 || swapIndex < 0 || swapIndex >= list.length) return;

  const current = list[index];
  const neighbor = list[swapIndex];
  const currentOrder = typeof current.sortOrder === 'number' ? current.sortOrder : index;
  const neighborOrder = typeof neighbor.sortOrder === 'number' ? neighbor.sortOrder : swapIndex;
  try {
    await Promise.all([
      updateCategoryInFirestore(current.id, { sortOrder: neighborOrder, updatedAt: Date.now() }),
      updateCategoryInFirestore(neighbor.id, { sortOrder: currentOrder, updatedAt: Date.now() })
    ]);
  } catch(err){
    console.error('Could not reorder categories:', err);
    showAdminToast('Could not reorder categories \u2014 please try again');
  }
}

/** Wires the Categories page's static controls — search input, Add
    Category button, and the form's submit/cancel/close/backdrop —
    exactly once. Called from js/dashboard.js's init(), the same
    convention js/admin-products.js's initProductsPage() uses. */
export function initCategoriesPage(){
  document.getElementById('categorySearchInput')?.addEventListener('input', renderCategoriesTable);
  document.getElementById('addCategoryBtn')?.addEventListener('click', openAddCategoryModal);
  document.getElementById('categoryForm')?.addEventListener('submit', handleCategoryFormSubmit);
  document.getElementById('categoryFormCancel')?.addEventListener('click', closeCategoryModal);
  document.getElementById('categoryModalClose')?.addEventListener('click', closeCategoryModal);
  document.getElementById('categoryModal')?.addEventListener('click', (e) => {
    if(e.target.id === 'categoryModal') closeCategoryModal();
  });
}
