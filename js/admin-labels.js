/* ============================================================
   Admin Dashboard — Labels page (Feature Labels step).

   Same shape as js/admin-categories.js: a search-filtered table, an
   Add/Edit modal, delete with confirm, backed by addLabelToFirestore()/
   updateLabelInFirestore()/deleteLabelFromFirestore() (js/firestore.js)
   for the actual writes, with js/labels.js's live subscription (wired
   in js/dashboard.js) picking up every write and re-rendering — no
   manual refresh step, same reasoning as the other admin pages.

   One extra piece beyond Categories: "choose which products use each
   label" is the reverse direction of assignment from the product
   form's own label checklist (js/admin-products.js) — from here, an
   admin picks one label and sees/edits every product's membership in
   it at once, which is the faster path when merchandising a label
   across many products rather than editing product-by-product.
   Both write to the exact same field (product.labels), so either path
   keeps the other in sync automatically via the live subscription.
   ============================================================ */
import { getAllLabels, getLabelById } from './labels.js';
import { getProducts } from './products.js';
import { addLabelToFirestore, updateLabelInFirestore, deleteLabelFromFirestore, updateProductInFirestore } from './firestore.js';
import { showAdminToast } from './admin.js';

function productCountForLabel(labelId){
  return getProducts().filter(p => Array.isArray(p.labels) && p.labels.includes(labelId)).length;
}

/* ============ TABLE ============ */
function labelRowHTML(l){
  return `<tr>
    <td style="font-weight:600;">${l.name}</td>
    <td>
      <button class="admin-btn admin-btn-outline" style="padding:6px 12px;font-size:12px;${l.enabled === false ? '' : 'color:var(--success);border-color:var(--success);'}" onclick="handleToggleLabelEnabled('${l.id}')">
        ${l.enabled === false ? 'Disabled \u2014 Enable' : 'Enabled \u2014 Disable'}
      </button>
    </td>
    <td>${productCountForLabel(l.id)} product${productCountForLabel(l.id) === 1 ? '' : 's'}</td>
    <td>
      <button class="admin-btn admin-btn-outline" style="padding:8px 14px;font-size:12.5px;margin-right:6px;" onclick="openLabelProductsModal('${l.id}')">Products</button>
      <button class="admin-btn admin-btn-outline" style="padding:8px 14px;font-size:12.5px;margin-right:6px;" onclick="openEditLabelModal('${l.id}')">Edit</button>
      <button class="admin-btn admin-btn-outline" style="padding:8px 14px;font-size:12.5px;color:var(--danger);border-color:var(--danger);" onclick="handleDeleteLabel('${l.id}')">Delete</button>
    </td>
  </tr>`;
}

export function renderLabelsTable(){
  const searchEl = document.getElementById('labelSearchInput');
  const search = searchEl ? searchEl.value.trim().toLowerCase() : '';
  let list = [...getAllLabels()].sort((a, b) => (a.name || '').localeCompare(b.name || ''));
  if(search) list = list.filter(l => (l.name || '').toLowerCase().includes(search));

  const body = document.getElementById('labelsTableBody');
  const empty = document.getElementById('labelsEmptyState');
  if(!body) return;
  body.innerHTML = list.map(labelRowHTML).join('');
  if(empty) empty.style.display = list.length ? 'none' : '';
}

/* ============ ADD / EDIT MODAL ============ */
function setLabelForm(l){
  document.getElementById('labelFormId').value = l.id || '';
  document.getElementById('labelFormName').value = l.name || '';
  document.getElementById('labelFormEnabled').checked = l.enabled !== false;
  document.getElementById('labelFormError').textContent = '';
}

export function openAddLabelModal(){
  document.getElementById('labelModalTitle').textContent = 'Add Label';
  setLabelForm({});
  document.getElementById('labelModal').style.display = 'flex';
}

export function openEditLabelModal(id){
  const l = getLabelById(id);
  if(!l) return;
  document.getElementById('labelModalTitle').textContent = 'Edit Label';
  setLabelForm(l);
  document.getElementById('labelModal').style.display = 'flex';
}

export function closeLabelModal(){
  document.getElementById('labelModal').style.display = 'none';
}

export async function handleLabelFormSubmit(e){
  e.preventDefault();
  const errorEl = document.getElementById('labelFormError');
  errorEl.textContent = '';

  const id = document.getElementById('labelFormId').value;
  const name = document.getElementById('labelFormName').value.trim();
  const enabled = document.getElementById('labelFormEnabled').checked;

  if(!name){ errorEl.textContent = 'Please enter a label name.'; return; }

  const submitBtn = document.getElementById('labelFormSubmit');
  submitBtn.disabled = true;
  submitBtn.textContent = 'Saving\u2026';
  try {
    if(id){
      await updateLabelInFirestore(id, { name, enabled, updatedAt: Date.now() });
      showAdminToast('Label updated');
    } else {
      await addLabelToFirestore({ name, enabled, createdAt: Date.now(), updatedAt: Date.now() });
      showAdminToast('Label added');
    }
    closeLabelModal();
  } catch(err){
    console.error('Could not save label:', err);
    errorEl.textContent = 'Could not save the label \u2014 please try again.';
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = 'Save Label';
  }
}

export async function handleDeleteLabel(id){
  const l = getLabelById(id);
  if(!l) return;
  const count = productCountForLabel(id);
  const warning = count ? ` It's currently assigned to ${count} product${count === 1 ? '' : 's'}, and will be removed from all of them.` : '';
  if(!confirm(`Delete "${l.name}"?${warning} This can't be undone.`)) return;
  try {
    // Deleting a label document alone would leave dangling ids inside
    // affected products' labels arrays — getEnabledLabelsForProduct()
    // (js/labels.js) already tolerates that gracefully on read, but
    // cleaning the arrays up here keeps product documents accurate
    // rather than relying on read-time filtering forever.
    const affected = getProducts().filter(p => Array.isArray(p.labels) && p.labels.includes(id));
    await Promise.all(affected.map(p =>
      updateProductInFirestore(p.id, { labels: p.labels.filter(lid => lid !== id), updatedAt: Date.now() })
    ));
    await deleteLabelFromFirestore(id);
    showAdminToast('Label deleted');
  } catch(err){
    console.error('Could not delete label:', err);
    showAdminToast('Could not delete the label \u2014 please try again');
  }
}

/** Quick Enable/Disable from the table — same field the modal's toggle
    controls, just a faster path to it. */
export async function handleToggleLabelEnabled(id){
  const l = getLabelById(id);
  if(!l) return;
  try {
    await updateLabelInFirestore(id, { enabled: l.enabled === false, updatedAt: Date.now() });
    showAdminToast(l.enabled === false ? 'Label enabled' : 'Label disabled');
  } catch(err){
    console.error('Could not update label:', err);
    showAdminToast('Could not update the label \u2014 please try again');
  }
}

/* ============ "PRODUCTS USING THIS LABEL" MODAL ============
   Reverse-direction assignment — see the file header. pendingSelection
   holds the in-progress edit in memory (initialized from each
   product's current labels array on open) so that typing in the
   search box to find more products doesn't lose checkbox state for
   products the search has temporarily filtered out of view — the
   checklist below always re-renders its checked state from
   pendingSelection, never by re-reading product.labels mid-edit. */
let openLabelId = null;
let pendingSelection = new Set();

function renderLabelProductsChecklist(){
  const searchEl = document.getElementById('labelProductsSearchInput');
  const search = searchEl ? searchEl.value.trim().toLowerCase() : '';
  let list = getProducts();
  if(search) list = list.filter(p => p.name.toLowerCase().includes(search));

  const container = document.getElementById('labelProductsChecklist');
  if(!container) return;
  container.innerHTML = list.length
    ? list.map(p => `
        <label class="admin-checkbox-row">
          <input type="checkbox" value="${p.id}" onchange="handleLabelProductToggle('${p.id}', this.checked)" ${pendingSelection.has(p.id) ? 'checked' : ''}>
          <span>${p.name}</span>
        </label>
      `).join('')
    : `<span style="font-size:13px;color:var(--ink-soft);">No products found.</span>`;
}

export function openLabelProductsModal(labelId){
  const l = getLabelById(labelId);
  if(!l) return;
  openLabelId = labelId;
  pendingSelection = new Set(getProducts().filter(p => Array.isArray(p.labels) && p.labels.includes(labelId)).map(p => p.id));
  document.getElementById('labelProductsModalTitle').textContent = `Products using "${l.name}"`;
  const searchEl = document.getElementById('labelProductsSearchInput');
  if(searchEl) searchEl.value = '';
  renderLabelProductsChecklist();
  document.getElementById('labelProductsModal').style.display = 'flex';
}

export function closeLabelProductsModal(){
  document.getElementById('labelProductsModal').style.display = 'none';
  openLabelId = null;
  pendingSelection = new Set();
}

/** Called from js/dashboard.js's live subscriptions (Bug 4 fix) —
    if a product's labels change (or a product is added/removed) while
    this modal happens to be open, its product list needs to reflect
    that without waiting for the admin to close and reopen it. A no-op
    when the modal isn't open. Deliberately does NOT touch
    pendingSelection — that's the admin's own in-progress, unsaved
    edit (see the block comment above), and re-deriving checked state
    from live product data mid-edit could silently discard a checkbox
    they just clicked, whether the live change came from another admin
    or from their own save elsewhere. Re-rendering the list (still
    respecting the current search filter) is enough to keep names,
    additions, and removals current without touching that. */
export function refreshLabelProductsModalIfOpen(){
  if(openLabelId) renderLabelProductsChecklist();
}

export function handleLabelProductToggle(productId, checked){
  if(checked) pendingSelection.add(productId);
  else pendingSelection.delete(productId);
}

export async function handleLabelProductsSave(){
  if(!openLabelId) return;
  const labelId = openLabelId;
  const before = new Set(getProducts().filter(p => Array.isArray(p.labels) && p.labels.includes(labelId)).map(p => p.id));
  const after = pendingSelection;
  const changed = getProducts().filter(p => before.has(p.id) !== after.has(p.id));

  const saveBtn = document.getElementById('labelProductsSaveBtn');
  if(saveBtn){ saveBtn.disabled = true; saveBtn.textContent = 'Saving\u2026'; }
  try {
    await Promise.all(changed.map(p => {
      const current = Array.isArray(p.labels) ? p.labels : [];
      const newLabels = after.has(p.id) ? [...current, labelId] : current.filter(id => id !== labelId);
      return updateProductInFirestore(p.id, { labels: newLabels, updatedAt: Date.now() });
    }));
    showAdminToast(changed.length ? 'Label assignments updated' : 'No changes to save');
    closeLabelProductsModal();
  } catch(err){
    console.error('Could not update label assignments:', err);
    showAdminToast('Could not update label assignments \u2014 please try again');
  } finally {
    if(saveBtn){ saveBtn.disabled = false; saveBtn.textContent = 'Save'; }
  }
}

/** Wires the Labels page's static controls, and both modals'
    submit/cancel/close/backdrop — exactly once. Called from
    js/dashboard.js's init(), the same convention every other admin
    page here uses. */
export function initLabelsPage(){
  document.getElementById('labelSearchInput')?.addEventListener('input', renderLabelsTable);
  document.getElementById('addLabelBtn')?.addEventListener('click', openAddLabelModal);
  document.getElementById('labelForm')?.addEventListener('submit', handleLabelFormSubmit);
  document.getElementById('labelFormCancel')?.addEventListener('click', closeLabelModal);
  document.getElementById('labelModalClose')?.addEventListener('click', closeLabelModal);
  document.getElementById('labelModal')?.addEventListener('click', (e) => {
    if(e.target.id === 'labelModal') closeLabelModal();
  });

  document.getElementById('labelProductsSearchInput')?.addEventListener('input', renderLabelProductsChecklist);
  document.getElementById('labelProductsSaveBtn')?.addEventListener('click', handleLabelProductsSave);
  document.getElementById('labelProductsCancel')?.addEventListener('click', closeLabelProductsModal);
  document.getElementById('labelProductsModalClose')?.addEventListener('click', closeLabelProductsModal);
  document.getElementById('labelProductsModal')?.addEventListener('click', (e) => {
    if(e.target.id === 'labelProductsModal') closeLabelProductsModal();
  });
}
