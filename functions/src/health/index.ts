/**
 * Phase 4 Step 2 — Cloud Functions scaffolding.
 *
 * healthCheck is the only real function this step ships: a minimal
 * owner-only callable that proves the whole pipeline works —
 * TypeScript builds, Functions v2 deploys, the Admin SDK can read
 * Firestore, and the same admins/{uid} authorization this project
 * already uses everywhere else (js/auth.js, firestore.rules) works
 * correctly from a Cloud Function too — before any payment, order, or
 * delivery logic gets built on top of it in later steps.
 *
 * Nothing on the frontend calls this yet. Check it after deploying via
 * the Firebase console's Functions tab, `firebase functions:shell`, or
 * the emulator UI — not by wiring it into any page.
 */
import { onCall } from 'firebase-functions/v2/https';
import { requireOwner } from '../utils';

export const healthCheck = onCall(async (request) => {
  await requireOwner(request);
  return {
    ok: true,
    message: 'Cloud Functions are wired up correctly.',
    timestamp: new Date().toISOString(),
  };
});
