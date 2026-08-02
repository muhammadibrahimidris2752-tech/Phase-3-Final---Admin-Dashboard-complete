/* ============================================================
   My Account. Profile header (photo/name/email — from Google for
   Google accounts, from Firebase Auth otherwise), the Account and
   Settings rows, Sign Out, Change Password, and an email-verification
   status notice (all from the Customer Authentication step) — plus,
   new here, Profile Information and Addresses (Customer Profile step).

   Profile Information, Addresses, and Notification Preferences all
   live in one Firestore document, users/{uid} — see js/firestore.js
   for the reads/writes and js/auth.js for the in-memory cache
   (getCurrentUserProfile()) populated on sign-in. Notification
   Preferences migrates a one-time localStorage value the first time
   it's read for an account with nothing in Firestore yet — see
   getNotificationPrefs() below.

   Payment Methods still has no design or data model yet (same
   "coming soon" toast as Phase 1) — deferred to the Payments step,
   since "saved payment methods" isn't meaningful without a payment
   processor to tokenize against.

   Which of Change Password / Profile Information / Addresses is open
   (if any) is tracked by one shared accountSubview flag rather than a
   separate boolean per subview.
   ================================================================ */
import {
  getCurrentUser, logout,
  isCurrentEmailVerified, currentUserHasPasswordProvider,
  sendVerificationEmail, reloadCurrentUser, changePassword,
  getCurrentUserProfile, setCachedUserProfile
} from './auth.js';
import { saveUserProfile } from './firestore.js';
import { showPage, showToast } from './ui.js';
import { Store } from './store.js';

const NOTIFICATION_PREFS_KEY = 'khn_notification_prefs_v1';
const DEFAULT_PREFS = { orderUpdates: true, emailNotifications: true };

/** One-time migration source only. Nothing writes to this key anymore
    — Firestore is the source of truth for every account once this has
    been read here once (see getNotificationPrefs() below). */
function loadLegacyLocalPrefs(){
  try {
    const saved = localStorage.getItem(NOTIFICATION_PREFS_KEY);
    return saved ? JSON.parse(saved) : null;
  } catch(e){
    return null;
  }
}

function getNotificationPrefs(){
  const profile = getCurrentUserProfile() || {};
  if(profile.notificationPrefs){
    return { ...DEFAULT_PREFS, ...profile.notificationPrefs };
  }
  // Nothing in Firestore yet — either a brand new account, or an
  // existing one from before this step. Use the old localStorage value
  // once if there is one (so no one's toggle appears to reset), then
  // seed Firestore with it (or with the defaults) so this branch is
  // never taken again for this account.
  const prefs = loadLegacyLocalPrefs() || { ...DEFAULT_PREFS };
  const user = getCurrentUser();
  if(user){
    setCachedUserProfile({ ...profile, notificationPrefs: prefs });
    saveUserProfile(user.uid, { notificationPrefs: prefs }).catch(e => console.error('Could not migrate notification preferences:', e));
  }
  return prefs;
}

export function toggleNotificationPref(key){
  const prefs = getNotificationPrefs();
  prefs[key] = !prefs[key];
  const profile = getCurrentUserProfile() || {};
  setCachedUserProfile({ ...profile, notificationPrefs: prefs }); // optimistic — reflected immediately
  renderAccountPage();
  const user = getCurrentUser();
  if(user){
    saveUserProfile(user.uid, { notificationPrefs: prefs }).catch(e => console.error('Could not save notification preferences:', e));
  }
}
export function comingSoon(label){
  showToast(`${label} is coming soon`);
}

/** The header's account icon (desktop: always visible; mobile: CSS-
    hidden in favour of the bottom nav's Account tab, but this same
    handler still backs it). Signed in → straight to My Account.
    Signed out → the Sign In page (Google is the first option there,
    same one tap as before once you land on it). */
export function handleAccountIconClick(){
  if(getCurrentUser()) showPage('account');
  else {
    Store.state.authReturnTo = 'account';
    showPage('signin');
  }
}

export async function handleSignOut(){
  try {
    await logout();
  } catch(e){
    console.error('Sign out failed:', e);
  }
  showToast('Signed out');
  showPage('catalog');
}

function initials(name){
  if(!name) return '';
  return name.trim().split(/\s+/).slice(0,2).map(w=>w[0]).join('').toUpperCase();
}

const ICON_PERSON = '<svg viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 21a8 8 0 0 0-16 0"/><circle cx="12" cy="8" r="4"/></svg>';

function profileHeaderHTML(user){
  const photo = user.photoURL
    ? `<img src="${user.photoURL}" alt="${user.displayName || 'Profile photo'}">`
    : `<span class="account-avatar-fallback">${initials(user.displayName) || ICON_PERSON}</span>`;
  return `
    <div class="account-profile-card">
      <div class="account-avatar">${photo}</div>
      <div class="account-profile-info">
        <div class="account-profile-name">${user.displayName || 'Your Account'}</div>
        <div class="account-profile-email">${user.email || ''}</div>
      </div>
    </div>
  `;
}

/** Informational only — never gates checkout, password changes, or
    any other customer feature. Just status + a resend action. Only
    shown for password accounts; Google accounts are inherently
    verified. */
function verificationNoticeHTML(){
  if(!currentUserHasPasswordProvider() || isCurrentEmailVerified()) return '';
  return `
    <div class="wa-note" style="margin-bottom:var(--s5);">
      <svg viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 8v4M12 16h.01"/></svg>
      <span>Your email isn\u2019t verified yet. <button class="footer-link-btn" style="font-size:13px;" onclick="handleResendVerification()">Resend verification email</button></span>
    </div>
  `;
}

function accountRowHTML(icon, label, onclick){
  return `<button class="account-row" onclick="${onclick}">
    <span class="account-row-icon">${icon}</span>
    <span class="account-row-label">${label}</span>
    <svg class="account-row-chevron" viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18l6-6-6-6"/></svg>
  </button>`;
}

function toggleRowHTML(key, label, sublabel, checked){
  return `<div class="account-toggle-row">
    <div>
      <div class="account-row-label">${label}</div>
      ${sublabel ? `<div class="account-toggle-sublabel">${sublabel}</div>` : ''}
    </div>
    <button class="toggle-switch ${checked?'on':''}" onclick="toggleNotificationPref('${key}')" role="switch" aria-checked="${checked}" aria-label="${label}">
      <span class="toggle-switch-thumb"></span>
    </button>
  </div>`;
}

const ICON_PROFILE = ICON_PERSON;
const ICON_ADDRESS = '<svg viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 10c0 7-9 12-9 12s-9-5-9-12a9 9 0 0 1 18 0Z"/><circle cx="12" cy="10" r="3"/></svg>';
const ICON_PAYMENT = '<svg viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="5" width="20" height="14" rx="2"/><path d="M2 10h20"/></svg>';
const ICON_ORDERS = '<svg viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4Z"/><path d="M3 6h18"/><path d="M16 10a4 4 0 0 1-8 0"/></svg>';
const ICON_ABOUT = '<svg viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/></svg>';
const ICON_FAQ = '<svg viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M9.5 9a2.5 2.5 0 0 1 5 0c0 1.5-2 2-2 3.5M12 17h.01"/></svg>';
const ICON_SIGNOUT = '<svg viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="M16 17l5-5-5-5"/><path d="M21 12H9"/></svg>';
const ICON_PASSWORD = '<svg viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>';

/* ---------- shared subview state ---------- */
let accountSubview = null; // null | 'changePassword' | 'profileInfo' | 'addresses'
let showAddAddressForm = false;

export function toggleAccountSubview(subview){
  accountSubview = subview;
  showAddAddressForm = false;
  renderAccountPage();
}

/* ---------- Change Password ---------- */

export async function handleChangePasswordSubmit(){
  const currentEl = document.getElementById('currentPassword');
  const newEl = document.getElementById('newPassword');
  const confirmEl = document.getElementById('newPasswordConfirm');
  const current = currentEl ? currentEl.value : '';
  const next = newEl ? newEl.value : '';
  const confirmVal = confirmEl ? confirmEl.value : '';

  if(!current){
    showToast('Please enter your current password');
    if(currentEl) currentEl.focus();
    return;
  }
  if(!next || next.length < 6){
    showToast('New password must be at least 6 characters');
    if(newEl) newEl.focus();
    return;
  }
  if(next !== confirmVal){
    showToast('New passwords don\u2019t match');
    if(confirmEl) confirmEl.focus();
    return;
  }

  try {
    await changePassword(current, next);
    showToast('Password changed');
    toggleAccountSubview(null);
  } catch(err){
    console.error('Change password failed:', err);
    const code = err && err.code;
    showToast(code === 'auth/wrong-password' || code === 'auth/invalid-credential'
      ? 'Your current password is incorrect'
      : 'Couldn\u2019t change your password right now \u2014 please try again');
  }
}

export async function handleResendVerification(){
  await reloadCurrentUser();
  if(isCurrentEmailVerified()){
    showToast('Your email is already verified');
    renderAccountPage();
    return;
  }
  try {
    await sendVerificationEmail();
    showToast('Verification email sent \u2014 check your inbox.');
  } catch(err){
    console.error('Failed to resend verification email:', err);
    showToast('Couldn\u2019t send that right now \u2014 please try again shortly.');
  }
}

function changePasswordFormHTML(){
  return `
    <div class="account-section-label">Change Password</div>
    <div class="account-section" style="padding:var(--s5);">
      <div class="name-field">
        <label for="currentPassword">Current password</label>
        <input type="password" id="currentPassword" placeholder="Your current password" autocomplete="current-password">
      </div>
      <div class="name-field">
        <label for="newPassword">New password</label>
        <input type="password" id="newPassword" placeholder="At least 6 characters" autocomplete="new-password">
      </div>
      <div class="name-field">
        <label for="newPasswordConfirm">Confirm new password</label>
        <input type="password" id="newPasswordConfirm" placeholder="Re-enter your new password" autocomplete="new-password">
      </div>
      <button class="btn btn-primary btn-block" onclick="handleChangePasswordSubmit()">Save New Password</button>
      <div style="text-align:center;margin-top:14px;">
        <button class="footer-link-btn" onclick="toggleAccountSubview(null)">Cancel</button>
      </div>
    </div>
  `;
}

/* ---------- Profile Information ---------- */

function profileInfoFormHTML(){
  const profile = getCurrentUserProfile() || {};
  const user = getCurrentUser();
  const name = profile.name || user.displayName || '';
  const phone = profile.phone || '';
  return `
    <div class="account-section-label">Profile Information</div>
    <div class="account-section" style="padding:var(--s5);">
      <div class="name-field">
        <label for="profileName">Name</label>
        <input type="text" id="profileName" placeholder="Your name" value="${name}">
      </div>
      <div class="name-field">
        <label for="profilePhone">Phone number</label>
        <input type="tel" id="profilePhone" placeholder="e.g. 0803 123 4567" value="${phone}">
      </div>
      <button class="btn btn-primary btn-block" onclick="handleProfileInfoSubmit()">Save</button>
      <div style="text-align:center;margin-top:14px;">
        <button class="footer-link-btn" onclick="toggleAccountSubview(null)">Cancel</button>
      </div>
    </div>
  `;
}

export async function handleProfileInfoSubmit(){
  const nameEl = document.getElementById('profileName');
  const phoneEl = document.getElementById('profilePhone');
  const name = nameEl ? nameEl.value.trim() : '';
  const phone = phoneEl ? phoneEl.value.trim() : '';

  if(!name){
    showToast('Please enter your name');
    if(nameEl) nameEl.focus();
    return;
  }

  const user = getCurrentUser();
  const patch = { name, phone };
  const ok = await saveUserProfile(user.uid, patch);
  if(ok){
    setCachedUserProfile({ ...(getCurrentUserProfile() || {}), ...patch });
    showToast('Profile updated');
    toggleAccountSubview(null);
  } else {
    showToast('Couldn\u2019t save your profile right now \u2014 please try again');
  }
}

/* ---------- Addresses ---------- */

function generateAddressId(){
  return 'addr_' + Math.random().toString(36).slice(2, 11);
}

export function toggleAddAddressForm(force){
  showAddAddressForm = typeof force === 'boolean' ? force : !showAddAddressForm;
  renderAccountPage();
}

export async function handleAddAddressSubmit(){
  const labelEl = document.getElementById('newAddressLabel');
  const addressEl = document.getElementById('newAddressText');
  const label = labelEl ? labelEl.value.trim() : '';
  const address = addressEl ? addressEl.value.trim() : '';

  if(!label){
    showToast('Please give this address a label');
    if(labelEl) labelEl.focus();
    return;
  }
  if(!address){
    showToast('Please enter the address');
    if(addressEl) addressEl.focus();
    return;
  }

  const profile = getCurrentUserProfile() || {};
  const addresses = profile.addresses || [];
  const newAddress = {
    id: generateAddressId(),
    label,
    address,
    default: addresses.length === 0 // first saved address becomes the default automatically
  };
  const updatedAddresses = [...addresses, newAddress];

  const user = getCurrentUser();
  const ok = await saveUserProfile(user.uid, { addresses: updatedAddresses });
  if(ok){
    setCachedUserProfile({ ...profile, addresses: updatedAddresses });
    showToast('Address saved');
    showAddAddressForm = false;
    renderAccountPage();
  } else {
    showToast('Couldn\u2019t save that address right now \u2014 please try again');
  }
}

export async function handleDeleteAddress(id){
  const profile = getCurrentUserProfile() || {};
  const addresses = profile.addresses || [];
  const updatedAddresses = addresses.filter(a => a.id !== id);
  // If the address we just removed was the default, promote the next
  // one so there's still a clear default whenever at least one remains.
  if(updatedAddresses.length > 0 && !updatedAddresses.some(a => a.default)){
    updatedAddresses[0] = { ...updatedAddresses[0], default: true };
  }

  const user = getCurrentUser();
  const ok = await saveUserProfile(user.uid, { addresses: updatedAddresses });
  if(ok){
    setCachedUserProfile({ ...profile, addresses: updatedAddresses });
    showToast('Address removed');
    renderAccountPage();
  } else {
    showToast('Couldn\u2019t remove that address right now \u2014 please try again');
  }
}

function addressCardHTML(addr){
  return `
    <div class="account-row" style="cursor:default;">
      <span class="account-row-icon">${ICON_ADDRESS}</span>
      <span class="account-row-label">${addr.label}${addr.default ? ' <span style="color:var(--terracotta);font-weight:600;">\u00b7 Default</span>' : ''}<br><span style="font-size:12px;color:var(--ink-soft);font-weight:400;">${addr.address}</span></span>
      <button class="footer-link-btn" style="font-size:12px;" onclick="handleDeleteAddress('${addr.id}')">Remove</button>
    </div>
  `;
}

function addAddressFormHTML(){
  return `
    <div class="account-section" style="padding:var(--s5);margin-top:var(--s5);">
      <div class="name-field">
        <label for="newAddressLabel">Label</label>
        <input type="text" id="newAddressLabel" placeholder="e.g. Home, Office">
      </div>
      <div class="name-field">
        <label for="newAddressText">Address</label>
        <input type="text" id="newAddressText" placeholder="e.g. 12 Ahmadu Bello Way, Jos">
      </div>
      <button class="btn btn-primary btn-block" onclick="handleAddAddressSubmit()">Save Address</button>
      <div style="text-align:center;margin-top:14px;">
        <button class="footer-link-btn" onclick="toggleAddAddressForm(false)">Cancel</button>
      </div>
    </div>
  `;
}

function addressesSectionHTML(){
  const profile = getCurrentUserProfile() || {};
  const addresses = profile.addresses || [];
  return `
    <div class="account-section-label">Addresses</div>
    ${addresses.length === 0
      ? `<div class="account-section" style="padding:var(--s5);text-align:center;">
           <p style="font-size:14px;color:var(--ink-soft);margin:0;">No saved addresses yet.</p>
         </div>`
      : `<div class="account-section">${addresses.map(addressCardHTML).join('')}</div>`
    }
    ${showAddAddressForm
      ? addAddressFormHTML()
      : `<button class="btn btn-primary btn-block" style="margin-top:var(--s5);" onclick="toggleAddAddressForm(true)">Add Address</button>`
    }
    <div style="text-align:center;margin-top:14px;">
      <button class="footer-link-btn" onclick="toggleAccountSubview(null)">Back</button>
    </div>
  `;
}

/* ---------- main render ---------- */

export function renderAccountPage(){
  const el = document.getElementById('accountContent');
  if(!el) return;
  const user = getCurrentUser();

  if(!user){
    accountSubview = null;
    showAddAddressForm = false;
    el.innerHTML = `<div class="empty-state">
      <div class="empty-icon">${ICON_PERSON}</div>
      <h3>Sign in to view your account</h3>
      <p>Sign in to see your profile and order history.</p>
      <button class="btn btn-primary" onclick="handleAccountIconClick()">Sign In</button>
    </div>`;
    return;
  }

  if(accountSubview === 'changePassword'){
    el.innerHTML = profileHeaderHTML(user) + changePasswordFormHTML();
    return;
  }
  if(accountSubview === 'profileInfo'){
    el.innerHTML = profileHeaderHTML(user) + profileInfoFormHTML();
    return;
  }
  if(accountSubview === 'addresses'){
    el.innerHTML = profileHeaderHTML(user) + addressesSectionHTML();
    return;
  }

  const prefs = getNotificationPrefs();
  el.innerHTML = `
    ${profileHeaderHTML(user)}
    ${verificationNoticeHTML()}

    <div class="account-section-label">Account</div>
    <div class="account-section">
      ${accountRowHTML(ICON_PROFILE, 'Profile Information', "toggleAccountSubview('profileInfo')")}
      ${accountRowHTML(ICON_ADDRESS, 'Addresses', "toggleAccountSubview('addresses')")}
      ${accountRowHTML(ICON_PAYMENT, 'Payment Methods', "comingSoon('Payment Methods')")}
      ${accountRowHTML(ICON_ORDERS, 'Order History', "showPage('history')")}
      ${currentUserHasPasswordProvider() ? accountRowHTML(ICON_PASSWORD, 'Change Password', "toggleAccountSubview('changePassword')") : ''}
    </div>

    <div class="account-section-label">Settings</div>
    <div class="account-section">
      ${toggleRowHTML('orderUpdates', 'Order Updates', 'Get notified as your order status changes', prefs.orderUpdates)}
      ${toggleRowHTML('emailNotifications', 'Email Notifications', 'Receive updates by email', prefs.emailNotifications)}
      ${accountRowHTML(ICON_ABOUT, 'About Us', "showPage('about')")}
      ${accountRowHTML(ICON_FAQ, 'FAQ', "showPage('faq')")}
    </div>

    <div class="account-section">
      <button class="account-row account-row-danger" onclick="handleSignOut()">
        <span class="account-row-icon">${ICON_SIGNOUT}</span>
        <span class="account-row-label">Sign Out</span>
      </button>
    </div>
  `;
}
