/* ============================================================
   Admin Dashboard — Delivery Zones page (Phase 4 Step 1 — Smart
   Delivery Engine, part of the Secure Checkout & Paystack Integration
   phase).

   Same shape as js/admin-categories.js on purpose: a search-filtered
   table, an Add/Edit modal, delete with confirm, all backed by
   addDeliveryZoneToFirestore()/updateDeliveryZoneInFirestore()/
   deleteDeliveryZoneFromFirestore() (js/firestore.js) doing the actual
   writes. This file never touches the shared delivery zones cache
   directly — js/delivery-zones.js's live subscription (wired in
   js/dashboard.js, alongside products/categories/labels) picks up
   every write this file makes and re-renders the table, the same
   "no manual refresh step" reasoning every other admin CRUD page here
   documents.

   Scope of this step: management only. Checkout does not read
   deliveryZones yet — it still uses the flat DELIVERY_CHARGE constant
   from js/config.js exactly as before, unchanged. Wiring checkout up
   to these zones (and to the Cloud Functions pricing pipeline that
   will actually charge for one) is a later Phase 4 step. Building the
   admin side first, on its own, means the owner can already be
   populating real zones by the time checkout starts using them — and
   this step carries zero risk to the live storefront, since nothing
   customer-facing changes.

   Reordering: Up/Down buttons swap sortOrder with the adjacent row,
   same convention (and same "no drag-and-drop library" reasoning) as
   js/admin-categories.js.
   ============================================================ */
import { getAllDeliveryZones, getDeliveryZoneById } from './delivery-zones.js';
import { addDeliveryZoneToFirestore, updateDeliveryZoneInFirestore, deleteDeliveryZoneFromFirestore } from './firestore.js';
import { formatNaira } from './utils.js';
import { showAdminToast } from './admin.js';

/** Same sort js/admin-categories.js's sortedForAdmin() uses — the
    admin table shows hidden zones too (in their place in the order),
    so hiding a zone doesn't also hide it from the one place meant to
    manage it. */
function sortedForAdmin(){
  return [...getAllDeliveryZones()].sort((a, b) => {
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
function deliveryZoneRowHTML(z, index, total){
  return `<tr>
    <td style="font-weight:600;">${z.name}</td>
    <td>${truncate(z.description, 60) || '<span style="color:var(--ink-soft);">\u2014</span>'}</td>
    <td>${formatNaira(z.fee || 0)}</td>
    <td>
      <button class="admin-btn admin-btn-outline" style="padding:6px 12px;font-size:12px;${z.active === false ? '' : 'color:var(--success);border-color:var(--success);'}" onclick="handleToggleDeliveryZoneActive('${z.id}')">
        ${z.active === false ? 'Hidden \u2014 Show' : 'Active \u2014 Hide'}
      </button>
    </td>
    <td>
      <button class="admin-btn admin-btn-outline" style="padding:6px 10px;font-size:12px;" ${index === 0 ? 'disabled' : ''} onclick="handleMoveDeliveryZone('${z.id}',-1)" aria-label="Move ${z.name} up">\u2191</button>
      <button class="admin-btn admin-btn-outline" style="padding:6px 10px;font-size:12px;" ${index === total - 1 ? 'disabled' : ''} onclick="handleMoveDeliveryZone('${z.id}',1)" aria-label="Move ${z.name} down">\u2193</button>
    </td>
    <td>
      <button class="admin-btn admin-btn-outline" style="padding:8px 14px;font-size:12.5px;margin-right:6px;" onclick="openEditDeliveryZoneModal('${z.id}')">Edit</button>
      <button class="admin-btn admin-btn-outline" style="padding:8px 14px;font-size:12.5px;color:var(--danger);border-color:var(--danger);" onclick="handleDeleteDeliveryZone('${z.id}')">Delete</button>
    </td>
  </tr>`;
}

export function renderDeliveryZonesTable(){
  const searchEl = document.getElementById('deliveryZoneSearchInput');
  const search = searchEl ? searchEl.value.trim().toLowerCase() : '';
  let list = sortedForAdmin();
  if(search) list = list.filter(z => (z.name || '').toLowerCase().includes(search));

  const body = document.getElementById('deliveryZonesTableBody');
  const empty = document.getElementById('deliveryZonesEmptyState');
  if(!body) return;
  body.innerHTML = list.map((z, i) => deliveryZoneRowHTML(z, i, list.length)).join('');
  if(empty) empty.style.display = list.length ? 'none' : '';
}

/* ============ ADD / EDIT MODAL ============ */
function setDeliveryZoneForm(z){
  document.getElementById('deliveryZoneFormId').value = z.id || '';
  document.getElementById('deliveryZoneFormName').value = z.name || '';
  document.getElementById('deliveryZoneFormFee').value = z.fee ?? 0;
  document.getElementById('deliveryZoneFormDescription').value = z.description || '';
  document.getElementById('deliveryZoneFormActive').checked = z.active !== false;
  document.getElementById('deliveryZoneFormError').textContent = '';
}

export function openAddDeliveryZoneModal(){
  document.getElementById('deliveryZoneModalTitle').textContent = 'Add Delivery Zone';
  setDeliveryZoneForm({});
  document.getElementById('deliveryZoneModal').style.display = 'flex';
}

export function openEditDeliveryZoneModal(id){
  const z = getDeliveryZoneById(id);
  if(!z) return;
  document.getElementById('deliveryZoneModalTitle').textContent = 'Edit Delivery Zone';
  setDeliveryZoneForm(z);
  document.getElementById('deliveryZoneModal').style.display = 'flex';
}

export function closeDeliveryZoneModal(){
  document.getElementById('deliveryZoneModal').style.display = 'none';
}

export async function handleDeliveryZoneFormSubmit(e){
  e.preventDefault();
  const errorEl = document.getElementById('deliveryZoneFormError');
  errorEl.textContent = '';

  const id = document.getElementById('deliveryZoneFormId').value;
  const name = document.getElementById('deliveryZoneFormName').value.trim();
  const fee = Number(document.getElementById('deliveryZoneFormFee').value);
  const description = document.getElementById('deliveryZoneFormDescription').value.trim();
  const active = document.getElementById('deliveryZoneFormActive').checked;

  if(!name){ errorEl.textContent = 'Please enter a zone name.'; return; }
  if(!Number.isFinite(fee) || fee < 0){ errorEl.textContent = 'Please enter a valid delivery fee.'; return; }

  const submitBtn = document.getElementById('deliveryZoneFormSubmit');
  submitBtn.disabled = true;
  submitBtn.textContent = 'Saving\u2026';
  try {
    if(id){
      await updateDeliveryZoneInFirestore(id, { name, fee, description, active, updatedAt: Date.now() });
      showAdminToast('Delivery zone updated');
    } else {
      // New zones go to the end of the admin-set order by default —
      // one more than the highest sortOrder currently in use, same
      // convention as js/admin-categories.js.
      const highest = getAllDeliveryZones().reduce((max, z) => Math.max(max, typeof z.sortOrder === 'number' ? z.sortOrder : -1), -1);
      await addDeliveryZoneToFirestore({
        name, fee, description, active,
        sortOrder: highest + 1,
        createdAt: Date.now(), updatedAt: Date.now()
      });
      showAdminToast('Delivery zone added');
    }
    closeDeliveryZoneModal();
  } catch(err){
    console.error('Could not save delivery zone:', err);
    errorEl.textContent = 'Could not save the delivery zone \u2014 please try again.';
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = 'Save Delivery Zone';
  }
}

export async function handleDeleteDeliveryZone(id){
  const z = getDeliveryZoneById(id);
  if(!z) return;
  if(!confirm(`Delete "${z.name}"? This can't be undone.`)) return;
  try {
    await deleteDeliveryZoneFromFirestore(id);
    showAdminToast('Delivery zone deleted');
  } catch(err){
    console.error('Could not delete delivery zone:', err);
    showAdminToast('Could not delete the delivery zone \u2014 please try again');
  }
}

/** Quick Hide/Show from the table, without opening the full modal —
    same "Active/Hidden" field the modal's toggle controls, just a
    faster path to it for the single most common edit. */
export async function handleToggleDeliveryZoneActive(id){
  const z = getDeliveryZoneById(id);
  if(!z) return;
  try {
    await updateDeliveryZoneInFirestore(id, { active: z.active === false, updatedAt: Date.now() });
    showAdminToast(z.active === false ? 'Delivery zone shown' : 'Delivery zone hidden');
  } catch(err){
    console.error('Could not update delivery zone visibility:', err);
    showAdminToast('Could not update the delivery zone \u2014 please try again');
  }
}

/** Swaps this zone's sortOrder with whichever neighbor is currently
    adjacent to it in the admin-visible order (direction -1 = up,
    1 = down) — see the file header for why this is two plain writes
    rather than drag-and-drop. Silently no-ops at either end of the
    list (the table already disables the button there). */
export async function handleMoveDeliveryZone(id, direction){
  const list = sortedForAdmin();
  const index = list.findIndex(z => z.id === id);
  const swapIndex = index + direction;
  if(index === -1 || swapIndex < 0 || swapIndex >= list.length) return;

  const current = list[index];
  const neighbor = list[swapIndex];
  const currentOrder = typeof current.sortOrder === 'number' ? current.sortOrder : index;
  const neighborOrder = typeof neighbor.sortOrder === 'number' ? neighbor.sortOrder : swapIndex;
  try {
    await Promise.all([
      updateDeliveryZoneInFirestore(current.id, { sortOrder: neighborOrder, updatedAt: Date.now() }),
      updateDeliveryZoneInFirestore(neighbor.id, { sortOrder: currentOrder, updatedAt: Date.now() })
    ]);
  } catch(err){
    console.error('Could not reorder delivery zones:', err);
    showAdminToast('Could not reorder delivery zones \u2014 please try again');
  }
}

/** Wires the Delivery Zones page's static controls — search input, Add
    Delivery Zone button, and the form's submit/cancel/close/backdrop —
    exactly once. Called from js/dashboard.js's init(), the same
    convention every other admin CRUD page here uses. */
export function initDeliveryZonesPage(){
  document.getElementById('deliveryZoneSearchInput')?.addEventListener('input', renderDeliveryZonesTable);
  document.getElementById('addDeliveryZoneBtn')?.addEventListener('click', openAddDeliveryZoneModal);
  document.getElementById('deliveryZoneForm')?.addEventListener('submit', handleDeliveryZoneFormSubmit);
  document.getElementById('deliveryZoneFormCancel')?.addEventListener('click', closeDeliveryZoneModal);
  document.getElementById('deliveryZoneModalClose')?.addEventListener('click', closeDeliveryZoneModal);
  document.getElementById('deliveryZoneModal')?.addEventListener('click', (e) => {
    if(e.target.id === 'deliveryZoneModal') closeDeliveryZoneModal();
  });
}
