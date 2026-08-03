/**
 * Firebase Admin SDK singleton for this AWS backend — the direct
 * counterpart to functions/src/admin.ts, adapted for running outside
 * Google Cloud.
 *
 * Cloud Functions gets its identity automatically (Application
 * Default Credentials, because the function IS Google infrastructure).
 * A Lambda does not run inside Google's trust boundary, so it must
 * present an explicit Firebase service account key instead. That key
 * is fetched from AWS Secrets Manager here — never from an
 * environment variable, never from a committed file (see README.md
 * for how the secret itself is created; that's the one manual AWS
 * step this proof-of-concept still requires).
 *
 * getFirebaseAdmin() is safe to call from every handler on every
 * invocation: the actual work (the Secrets Manager call and
 * admin.initializeApp()) only happens once per warm execution
 * environment. cachedHandle/initPromise below are what make every
 * call after the first one a cache hit — the same "initialize once,
 * reuse on warm invocations" rule functions/src/admin.ts already
 * follows for Cloud Functions, just made explicit here since Lambda
 * doesn't do this for you automatically the way Cloud Functions does.
 *
 * DELIBERATELY DOES NOT initialize firebase-admin/auth here. That
 * module transitively depends on `jwks-rsa`, which (in the versions
 * currently resolved through firebase-admin's own dependency tree)
 * requires `jose` — a package that dropped CommonJS support entirely
 * from v6 onward. Importing firebase-admin/auth anywhere reachable by
 * this file would pull that broken require() chain into every
 * handler's bundle, including /health, which never authenticates
 * anyone. Auth initialization lives in lambda/auth/verify-token.ts
 * instead, imported only by whichever handler actually needs it — see
 * that file's header comment and README.md for the full explanation.
 */
import { App, getApps, initializeApp, cert } from 'firebase-admin/app';
import { getFirestore, Firestore } from 'firebase-admin/firestore';
import { SecretsManagerClient, GetSecretValueCommand } from '@aws-sdk/client-secrets-manager';
import { FIREBASE_SERVICE_ACCOUNT_SECRET_NAME } from './config';
import { logger } from './shared/logger';

interface FirebaseServiceAccountKey {
  project_id: string;
  client_email: string;
  private_key: string;
}

export interface FirebaseAdminHandle {
  app: App;
  db: Firestore;
}

// Module-level state persists across warm invocations of the same
// execution environment and resets only on a fresh cold start — this
// is the cache. secretsClient is created once for the same reason:
// the AWS SDK v3 client itself is safe and cheap to reuse across
// invocations, so it's constructed at module load, not inside the
// handler.
let cachedHandle: FirebaseAdminHandle | undefined;
let initPromise: Promise<FirebaseAdminHandle> | undefined;
const secretsClient = new SecretsManagerClient({});

async function fetchServiceAccountKey(): Promise<FirebaseServiceAccountKey> {
  const result = await secretsClient.send(
    new GetSecretValueCommand({ SecretId: FIREBASE_SERVICE_ACCOUNT_SECRET_NAME })
  );
  if (!result.SecretString) {
    throw new Error(`Secret "${FIREBASE_SERVICE_ACCOUNT_SECRET_NAME}" has no string value.`);
  }
  // The secret's value is expected to be the *entire, unmodified*
  // downloaded Firebase service account JSON file content — see
  // README.md. Parsing it as JSON here (rather than reading individual
  // fields out of separate secrets/env vars) is what correctly
  // preserves the private key's embedded newlines.
  return JSON.parse(result.SecretString) as FirebaseServiceAccountKey;
}

async function initialize(): Promise<FirebaseAdminHandle> {
  const key = await fetchServiceAccountKey();

  const app: App =
    getApps().length > 0
      ? getApps()[0]
      : initializeApp({
          credential: cert({
            projectId: key.project_id,
            clientEmail: key.client_email,
            privateKey: key.private_key,
          }),
        });

  logger.info('Firebase Admin SDK initialized', { projectId: key.project_id });

  return { app, db: getFirestore(app) };
}

/**
 * Returns the shared Firebase Admin SDK handle (app, db). Initializes
 * it on the first call in a given execution environment and reuses
 * that same instance on every call after that. Concurrent calls
 * during a cold start all await the same in-flight initialization
 * instead of triggering it multiple times, and a failed
 * initialization is not cached — the next invocation gets a clean
 * retry rather than a poisoned cache.
 */
export async function getFirebaseAdmin(): Promise<FirebaseAdminHandle> {
  if (cachedHandle) return cachedHandle;

  if (!initPromise) {
    initPromise = initialize()
      .then((handle) => {
        cachedHandle = handle;
        return handle;
      })
      .catch((error: unknown) => {
        initPromise = undefined;
        throw error;
      });
  }

  return initPromise;
}
