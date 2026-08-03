/**
 * Firebase ID token verification for API Gateway endpoints — the
 * Lambda-world counterpart to functions/src/utils/auth.ts's
 * requireOwner()/requireStaff(), which Functions v2's onCall gave for
 * free via request.auth. Here it's explicit: the caller sends
 * `Authorization: Bearer <Firebase ID token>`, and this module
 * verifies it, sharing the same Firestore/app singleton from
 * lambda/admin.ts but obtaining its own Auth instance (see below).
 *
 * Not called by the health handler in this step (see README.md for
 * why) — it exists now so the next real endpoint (once checkout logic
 * migrates here) has authentication ready rather than needing to
 * invent it from scratch.
 *
 * IMPORTANT — bundling: firebase-admin/auth is imported here, not in
 * lambda/admin.ts, deliberately. It transitively depends on
 * `jwks-rsa`, which currently pulls in a version of `jose` that
 * dropped CommonJS support entirely — importing it anywhere reachable
 * by /health broke that endpoint's Lambda at cold start
 * (ERR_REQUIRE_ESM), before the handler ever ran. Keeping the import
 * here means only a handler that actually imports this auth module
 * pays that cost — /health never does. Whichever future step first
 * wires requireOwner()/requireStaff() into a real endpoint will need
 * to resolve this the same way (an `overrides` pin to a
 * CommonJS-compatible `jose` version is the likely fix, once a known-
 * good version is confirmed against whatever firebase-admin version is
 * current then — see PROJECT_SUMMARY.md for the full writeup) before
 * that endpoint's bundle can run.
 */
import type { APIGatewayProxyEventV2 } from 'aws-lambda';
import { getAuth, DecodedIdToken } from 'firebase-admin/auth';
import { getFirebaseAdmin } from '../admin';
import { UnauthorizedError, ForbiddenError } from '../shared/errors';

interface AdminRecord {
  active?: boolean;
  role?: string;
}

/**
 * Extracts and verifies the Firebase ID token from an API Gateway v2
 * event's Authorization header. Throws UnauthorizedError if the
 * header is missing, malformed, or the token doesn't verify.
 */
export async function verifyIdToken(event: APIGatewayProxyEventV2): Promise<DecodedIdToken> {
  const header = event.headers?.authorization ?? event.headers?.Authorization;
  const match = header?.match(/^Bearer (.+)$/);
  if (!match) {
    throw new UnauthorizedError('Missing or malformed Authorization header.');
  }

  // getAuth() returns a cached instance per app internally (the Admin
  // SDK's own doing, not something this file needs to memoize itself),
  // so calling it on every invocation carries no real cost beyond the
  // first one in a given execution environment.
  const { app } = await getFirebaseAdmin();
  const auth = getAuth(app);
  try {
    return await auth.verifyIdToken(match[1]);
  } catch {
    // The specific verification failure (expired, malformed, wrong
    // project, etc.) isn't distinguished here — every case maps to the
    // same 401, so there's nothing to do with the caught error itself.
    // Optional catch binding (no `(err)` at all) is the correct fix for
    // that: declaring a parameter no code path uses is what the
    // ESLint warning was correctly flagging.
    throw new UnauthorizedError('Invalid or expired authentication token.');
  }
}

async function getAdminRecord(uid: string): Promise<AdminRecord | null> {
  const { db } = await getFirebaseAdmin();
  const snap = await db.collection('admins').doc(uid).get();
  return snap.exists ? (snap.data() as AdminRecord) : null;
}

/**
 * Mirrors functions/src/utils/auth.ts's requireOwner() exactly — same
 * admins/{uid} document, same `active` + `role` fields — so "who
 * counts as an admin" stays identical across the frontend
 * (js/auth.js), firestore.rules, the Cloud Functions backend, and this
 * one. Verifies the ID token first, then checks the caller is an
 * active owner. Returns the caller's uid on success.
 */
export async function requireOwner(event: APIGatewayProxyEventV2): Promise<string> {
  const decoded = await verifyIdToken(event);
  const record = await getAdminRecord(decoded.uid);
  if (!record || record.active !== true || record.role !== 'owner') {
    throw new ForbiddenError('This action requires owner access.');
  }
  return decoded.uid;
}

/**
 * Mirrors functions/src/utils/auth.ts's requireStaff() exactly (any of
 * owner/manager/staff). Returns the caller's uid on success.
 */
export async function requireStaff(event: APIGatewayProxyEventV2): Promise<string> {
  const decoded = await verifyIdToken(event);
  const record = await getAdminRecord(decoded.uid);
  if (!record || record.active !== true || !['owner', 'manager', 'staff'].includes(record.role ?? '')) {
    throw new ForbiddenError('This action requires staff access.');
  }
  return decoded.uid;
}
