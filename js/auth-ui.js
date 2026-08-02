/* ============================================================
   Sign In / Create Account / Reset Password — the customer-facing
   email+password page (Phase 2, step 1). Kept separate from auth.js
   (pure Firebase wrappers, no DOM) and from account.js (a different
   page), mirroring how js/search.js is split out from js/ui.js for
   one self-contained feature.

   Reached three ways: the header account icon and My Account's
   signed-out state (both go straight here when signed out — see
   js/account.js), and checkout's "Prefer email?" link (js/checkout.js)
   — which sets Store.state.authReturnTo to 'cart' first so a
   successful sign-in returns the customer to their bag instead of
   My Account. The actual navigation away from this page after a
   successful sign-in — by any method, including the Google button
   below — happens in one place, app.js's auth-state listener, rather
   than being duplicated here.
   ============================================================ */
import { login, signUp, sendPasswordReset, sendVerificationEmail } from './auth.js';
import { showToast } from './ui.js';

let authMode = 'signin'; // 'signin' | 'signup' | 'reset'

/** Called only from showPage()'s navigation dispatcher, so the page
    always opens on Sign In, never stuck on whatever mode it was left
    in last time. The mode-switch links below call setAuthMode()
    instead, which re-renders without resetting. */
export function resetAuthMode(){
  authMode = 'signin';
}

export function setAuthMode(mode){
  authMode = mode;
  renderSignInPage();
}

function fieldHTML(id, label, type, placeholder){
  const autocomplete = type === 'password' ? 'current-password' : (type === 'email' ? 'email' : 'off');
  return `<div class="name-field">
    <label for="${id}">${label}</label>
    <input type="${type}" id="${id}" placeholder="${placeholder}" autocomplete="${autocomplete}">
  </div>`;
}

function friendlyAuthError(err){
  const code = err && err.code;
  const map = {
    'auth/invalid-email': 'That email address doesn\u2019t look right.',
    'auth/user-not-found': 'No account found with that email.',
    'auth/wrong-password': 'Incorrect password.',
    'auth/invalid-credential': 'Incorrect email or password.',
    'auth/email-already-in-use': 'An account already exists with that email \u2014 try signing in instead.',
    'auth/weak-password': 'Please use at least 6 characters.',
    'auth/too-many-requests': 'Too many attempts \u2014 please wait a moment and try again.'
  };
  return map[code] || 'Something went wrong \u2014 please try again.';
}

export function renderSignInPage(){
  const el = document.getElementById('signinContent');
  if(!el) return;

  const googleButton = `<button class="btn btn-primary btn-block" onclick="loginWithGoogle()">Continue with Google</button>`;
  const divider = `<div class="account-section-label" style="text-align:center;margin-top:var(--s5);">Or use email</div>`;

  if(authMode === 'signup'){
    el.innerHTML = `
      ${googleButton}
      ${divider}
      ${fieldHTML('authEmail', 'Email address', 'email', 'e.g. amina@email.com')}
      ${fieldHTML('authPassword', 'Password', 'password', 'At least 6 characters')}
      ${fieldHTML('authPasswordConfirm', 'Confirm password', 'password', 'Re-enter your password')}
      <button class="btn btn-primary btn-block" onclick="handleAuthFormSubmit()">Create Account</button>
      <div style="text-align:center;margin-top:14px;">
        <button class="footer-link-btn" onclick="setAuthMode('signin')">Already have an account? Sign in</button>
      </div>
    `;
    return;
  }

  if(authMode === 'reset'){
    el.innerHTML = `
      <p style="font-size:14px;color:var(--ink-soft);margin-bottom:var(--s5);">Enter your email and we\u2019ll send you a link to reset your password.</p>
      ${fieldHTML('authEmail', 'Email address', 'email', 'e.g. amina@email.com')}
      <button class="btn btn-primary btn-block" onclick="handlePasswordResetSubmit()">Send Reset Link</button>
      <div style="text-align:center;margin-top:14px;">
        <button class="footer-link-btn" onclick="setAuthMode('signin')">Back to Sign In</button>
      </div>
    `;
    return;
  }

  // default: 'signin'
  el.innerHTML = `
    ${googleButton}
    ${divider}
    ${fieldHTML('authEmail', 'Email address', 'email', 'e.g. amina@email.com')}
    ${fieldHTML('authPassword', 'Password', 'password', 'Your password')}
    <button class="btn btn-primary btn-block" onclick="handleAuthFormSubmit()">Sign In</button>
    <div style="text-align:center;margin-top:14px;">
      <button class="footer-link-btn" onclick="setAuthMode('reset')">Forgot password?</button>
    </div>
    <div style="text-align:center;margin-top:8px;">
      <button class="footer-link-btn" onclick="setAuthMode('signup')">New here? Create an account</button>
    </div>
  `;
}

export async function handleAuthFormSubmit(){
  const emailEl = document.getElementById('authEmail');
  const passwordEl = document.getElementById('authPassword');
  const email = emailEl ? emailEl.value.trim() : '';
  const password = passwordEl ? passwordEl.value : '';

  if(!email || !email.includes('@')){
    showToast('Please enter a valid email address');
    if(emailEl) emailEl.focus();
    return;
  }
  if(!password || password.length < 6){
    showToast('Password must be at least 6 characters');
    if(passwordEl) passwordEl.focus();
    return;
  }

  if(authMode === 'signup'){
    const confirmEl = document.getElementById('authPasswordConfirm');
    const confirmVal = confirmEl ? confirmEl.value : '';
    if(password !== confirmVal){
      showToast('Passwords don\u2019t match');
      if(confirmEl) confirmEl.focus();
      return;
    }
    try {
      await signUp(email, password);
      sendVerificationEmail().catch(e => console.error('Verification email failed to send:', e));
      showToast('Account created! Check your email to verify it.');
      // Navigating away from this page happens via app.js's auth-state
      // listener once Firebase reports the newly signed-in user.
    } catch(err){
      console.error('Sign up failed:', err);
      showToast(friendlyAuthError(err));
    }
    return;
  }

  try {
    await login(email, password);
    showToast('Signed in');
  } catch(err){
    console.error('Sign in failed:', err);
    showToast(friendlyAuthError(err));
  }
}

export async function handlePasswordResetSubmit(){
  const emailEl = document.getElementById('authEmail');
  const email = emailEl ? emailEl.value.trim() : '';
  if(!email || !email.includes('@')){
    showToast('Please enter a valid email address');
    if(emailEl) emailEl.focus();
    return;
  }
  try {
    await sendPasswordReset(email);
    showToast('Reset link sent \u2014 check your email.');
    setAuthMode('signin');
  } catch(err){
    console.error('Password reset failed:', err);
    showToast(friendlyAuthError(err));
  }
}
