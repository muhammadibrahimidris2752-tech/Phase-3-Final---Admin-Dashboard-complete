import { getFirebaseApp, isFirebaseConfigured, loadFirebaseModule } from './firebase.js';
import { getAdminRecord, getUserProfile, subscribeToUserProfile } from './firestore.js';

/* ============================================================
   Authentication. Two things use this today: checkout requires a
   Google sign-in before placing an order (js/checkout.js), and the
   header's account icon + My Account (js/account.js) use it for the
   customer-facing sign-in/profile. The admin login screen
   (admin/index.html, js/dashboard.js) uses the email/password +
   role-check side of this file for staff access.
   ============================================================ */

export async function signUp(email, password){
  if(!isFirebaseConfigured()) throw new Error('Firebase is not configured yet — see js/firebase.js.');
  const app = await getFirebaseApp();
  const { getAuth, createUserWithEmailAndPassword } = await loadFirebaseModule('auth');
  return createUserWithEmailAndPassword(getAuth(app), email, password);
}

export async function login(email, password){
  if(!isFirebaseConfigured()) throw new Error('Firebase is not configured yet — see js/firebase.js.');
  const app = await getFirebaseApp();
  const { getAuth, signInWithEmailAndPassword } = await loadFirebaseModule('auth');
  return signInWithEmailAndPassword(getAuth(app), email, password);
}

export async function logout(){
  if(!isFirebaseConfigured()) return;
  const app = await getFirebaseApp();
  const { getAuth, signOut } = await loadFirebaseModule('auth');
  return signOut(getAuth(app));
}

export function getCurrentUser(){
  // Synchronous by design (UI code needs this without awaiting), so this
  // stays null until onAuthStateChangedListener below has fired at least
  // once — that's the standard way Firebase Auth's state hydrates.
  return currentUser;
}

export function isCurrentUserAdmin(){
  return isAdmin(currentUser);
}

export function getCurrentUserRole(){
  return currentAdminRecord?.role ?? null;
}

let currentUser = null;
let currentAdminRecord = null;
let currentUserProfile = null;
let unsubscribeProfile = null;

/** Calls callback(user) whenever auth state changes; returns an unsubscribe function.
    Since Step 1e, this also re-invokes callback(user) whenever the signed-in
    customer's users/{uid} document changes live (Profile Information, Addresses,
    Notification Preferences, hiddenOrderIds) — reusing the same callback path
    rather than auth.js reaching into account.js/order-tracking.js directly, so
    this file stays free of any DOM/rendering knowledge. app.js is what decides
    what to actually re-render when the callback fires. */
export async function onAuthStateChangedListener(callback){
  if(!isFirebaseConfigured()){ callback(null); return () => {}; }
  try {
    const app = await getFirebaseApp();
    const { getAuth, onAuthStateChanged } = await loadFirebaseModule('auth');
    return onAuthStateChanged(getAuth(app), async user => {
  currentUser = user;

  if(unsubscribeProfile){
    unsubscribeProfile();
    unsubscribeProfile = null;
  }

  if(user){
    currentAdminRecord = await getAdminRecord(user.uid);
    currentUserProfile = await getUserProfile(user.uid); // one-time fetch first, for a fast first paint
    unsubscribeProfile = await subscribeToUserProfile(user.uid, profile => {
      currentUserProfile = profile;
      callback(user); // live update — re-render whatever's open, same as any other auth-state change
    });
  }else{
    currentAdminRecord = null;
    currentUserProfile = null;
  }

  callback(user);
});
  } catch(e){
    console.error('Auth state listener failed to attach:', e);
    callback(null);
    return () => {};
  }
}

export function getCurrentUserProfile(){
  return currentUserProfile;
}

/** Call after saveUserProfile() succeeds so My Account reflects the
    edit immediately, without waiting for another auth-state event. */
export function setCachedUserProfile(profile){
  currentUserProfile = profile;
}

/** Role checks — once user documents in Firestore have a `role` field. */
export function isAdmin(user){
  return !!user &&
         !!currentAdminRecord &&
         currentAdminRecord.active === true &&
         currentAdminRecord.role === 'owner';
}

/** Currently unused elsewhere in the app (dashboard.js gates its own
    login with its own inline active check) — kept correct here for
    when Step 3's admin backend starts relying on it. Requires active
    explicitly so this matches the orders Firestore rule, which is
    stricter than this function used to be. */
export function isWorker(user){
  return !!user &&
         !!currentAdminRecord &&
         currentAdminRecord.active === true &&
         (
           currentAdminRecord.role === 'owner' ||
           currentAdminRecord.role === 'manager' ||
           currentAdminRecord.role === 'staff'
         );
}

export async function loginWithGoogle(){
  if(!isFirebaseConfigured()) throw new Error('Firebase is not configured yet.');

  const app = await getFirebaseApp();

  const {
    getAuth,
    GoogleAuthProvider,
    signInWithPopup
  } = await loadFirebaseModule('auth');

  const provider = new GoogleAuthProvider();

  return signInWithPopup(getAuth(app), provider);
}

/* ============================================================
   Customer-facing email/password extensions (Phase 2, step 1).
   signUp()/login() above already existed (used by the admin login
   form) and are reused as-is here — see js/auth-ui.js for the new
   customer-facing Sign In / Create Account page, and js/account.js
   for Change Password and the email-verification notice.
   ============================================================ */

export async function sendPasswordReset(email){
  if(!isFirebaseConfigured()) throw new Error('Firebase is not configured yet — see js/firebase.js.');
  const app = await getFirebaseApp();
  const { getAuth, sendPasswordResetEmail } = await loadFirebaseModule('auth');
  return sendPasswordResetEmail(getAuth(app), email);
}

/** Informational only — nothing in this codebase gates any action on
    the result of this. See js/account.js's verification notice. */
export async function sendVerificationEmail(){
  if(!currentUser) throw new Error('No signed-in user to verify.');
  const { sendEmailVerification } = await loadFirebaseModule('auth');
  return sendEmailVerification(currentUser);
}

/** Firebase caches emailVerified on the client, so a just-clicked
    verification link isn't reflected until this is called. */
export async function reloadCurrentUser(){
  if(!currentUser) return null;
  const { reload } = await loadFirebaseModule('auth');
  await reload(currentUser);
  return currentUser;
}

export function isCurrentEmailVerified(){
  return !!currentUser && currentUser.emailVerified === true;
}

/** Google-only accounts have no Firebase-managed password — My Account
    uses this to decide whether to show the Change Password row at all. */
export function currentUserHasPasswordProvider(){
  return !!currentUser && currentUser.providerData.some(p => p.providerId === 'password');
}

/** Firebase rejects updatePassword() with auth/requires-recent-login if
    the session isn't fresh, so this always reauthenticates with the
    current password first rather than reacting to that error after
    the fact — simpler, and safer by default. */
export async function changePassword(currentPassword, newPassword){
  if(!currentUser) throw new Error('No signed-in user.');
  const { EmailAuthProvider, reauthenticateWithCredential, updatePassword } = await loadFirebaseModule('auth');
  const credential = EmailAuthProvider.credential(currentUser.email, currentPassword);
  await reauthenticateWithCredential(currentUser, credential);
  return updatePassword(currentUser, newPassword);
}

export { getAdminRecord };