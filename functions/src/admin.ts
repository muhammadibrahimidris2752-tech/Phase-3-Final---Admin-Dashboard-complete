/**
 * Single shared Firebase Admin SDK initialization for every Cloud
 * Function module in this codebase.
 *
 * admin.initializeApp() must only ever run once per Function
 * instance — every other module imports `db`/`auth` from here
 * instead of calling initializeApp() itself, which is what
 * guarantees that no matter how many feature modules eventually get
 * bundled into this deploy (payments, orders, delivery, email...),
 * initialization only happens once.
 */
import { initializeApp, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';

if (getApps().length === 0) {
  initializeApp();
}

export const db = getFirestore();
export const auth = getAuth();
