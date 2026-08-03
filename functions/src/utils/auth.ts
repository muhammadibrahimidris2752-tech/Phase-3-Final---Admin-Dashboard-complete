/**
 * Cloud Functions mirror of js/auth.js's isAdmin()/isWorker() checks.
 * Same admins/{uid} document, same `active` + `role` fields, same
 * three staff roles — deliberately kept in lockstep with both
 * js/auth.js and firestore.rules (which encode this same check for
 * the client) so "who counts as an admin" never drifts between the
 * three places that ask the question.
 */
import { HttpsError, CallableRequest } from 'firebase-functions/v2/https';
import { db } from '../admin';

interface AdminRecord {
  active?: boolean;
  role?: string;
}

async function getAdminRecord(uid: string): Promise<AdminRecord | null> {
  const snap = await db.collection('admins').doc(uid).get();
  return snap.exists ? (snap.data() as AdminRecord) : null;
}

/**
 * Throws unless the caller is signed in and is an active owner — same
 * bar as js/auth.js's isAdmin(). Use for anything only the owner
 * should be able to trigger (matches the owner-role-write rules on
 * products/categories/labels/deliveryZones in firestore.rules).
 * Returns the caller's uid on success.
 */
export async function requireOwner(request: CallableRequest): Promise<string> {
  const uid = request.auth?.uid;
  if (!uid) {
    throw new HttpsError('unauthenticated', 'You must be signed in.');
  }
  const record = await getAdminRecord(uid);
  if (!record || record.active !== true || record.role !== 'owner') {
    throw new HttpsError('permission-denied', 'This action requires owner access.');
  }
  return uid;
}

/**
 * Throws unless the caller is signed in and is active staff of any
 * role (owner/manager/staff) — same bar as js/auth.js's isWorker()
 * (matches the staff-role read/update rules on orders/{orderId} in
 * firestore.rules). Returns the caller's uid on success.
 */
export async function requireStaff(request: CallableRequest): Promise<string> {
  const uid = request.auth?.uid;
  if (!uid) {
    throw new HttpsError('unauthenticated', 'You must be signed in.');
  }
  const record = await getAdminRecord(uid);
  if (!record || record.active !== true || !['owner', 'manager', 'staff'].includes(record.role ?? '')) {
    throw new HttpsError('permission-denied', 'This action requires staff access.');
  }
  return uid;
}
