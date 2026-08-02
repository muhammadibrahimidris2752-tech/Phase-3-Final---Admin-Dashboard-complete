/* ============================================================
   Firebase app initialization.

   The SDK is loaded dynamically (via import(), inside a function) rather
   than as a static top-level import, on purpose:
     - Until firebaseConfig below has real values, isFirebaseConfigured()
       is false and NOTHING here ever fetches anything over the network —
       today's page load is exactly as fast/lightweight as before.
     - Even once configured, if the CDN is briefly unreachable, this
       fails as a normal rejected Promise any caller can catch — not a
       page-breaking module resolution error.

   To actually turn this on:
     1. Create a free project at https://console.firebase.google.com
     2. Build icon (</>) → register a Web App → copy the config object
        it shows you into firebaseConfig below
     3. Enable Firestore (Build → Firestore Database → Create database)
     4. Enable Authentication (Build → Authentication → get started →
        enable Email/Password, or whichever sign-in method you want)
   That's it — no CDN <script> tag needed in index.html, and nothing
   else in the codebase needs to change; products.js, firestore.js, and
   auth.js already call the functions below correctly.
   ============================================================ */

export const firebaseConfig = {
  apiKey: "AIzaSyCZZaFdbJeD4l50TpZ5AkaRDh9c9F-5z3I",
  authDomain: "kitchen-and-home-by-noor.firebaseapp.com",
  projectId: "kitchen-and-home-by-noor",
  storageBucket: "kitchen-and-home-by-noor.firebasestorage.app",
  messagingSenderId: "87351685848",
  appId: "1:87351685848:web:c88064272b6281cd77ddad",
  measurementId: "G-HP3CDHWQZP"
};

// Check https://firebase.google.com/docs/web/setup for the current version
// if this one is ever out of date.
export const FIREBASE_SDK_VERSION = '10.13.0';

let appPromise = null;

export function isFirebaseConfigured(){
  return firebaseConfig.apiKey !== "YOUR_FIREBASE_API_KEY";
}

/** Dynamically loads one piece of Firebase's modular SDK from CDN,
    e.g. loadFirebaseModule('firestore') → the firebase-firestore.js module. */
export async function loadFirebaseModule(pkg){
  return import(`https://www.gstatic.com/firebasejs/${FIREBASE_SDK_VERSION}/firebase-${pkg}.js`);
}

/** Returns the initialized Firebase app, or null if not configured yet.
    Safe to call repeatedly — only initializes once. */
export async function getFirebaseApp(){
  if(!isFirebaseConfigured()) return null;
  if(!appPromise){
    appPromise = loadFirebaseModule('app').then(({ initializeApp }) => initializeApp(firebaseConfig));
  }
  return appPromise;
}
