/**
 * Cross-cutting Cloud Functions configuration — deliberately its own
 * module since every function in this codebase (payments, orders,
 * delivery, email, health) shares it, rather than any one feature
 * area owning it.
 *
 * REGION: confirmed against this project's actual Firestore database
 * location (europe-west1) — not the 'us-central1' default this file
 * originally shipped with. Cloud Functions that read/write Firestore
 * should run in the SAME region as the Firestore database itself, or
 * every call pays needless cross-region latency. Change it here (not
 * per-function) if the Firestore location is ever migrated.
 */
import { setGlobalOptions } from 'firebase-functions/v2';

export const REGION = 'europe-west1';

setGlobalOptions({
  region: REGION,
  // Conservative shared defaults. Individual functions can override
  // these by passing their own options — Paystack's webhook, for
  // instance, will likely want a longer timeout than this once it's
  // built (Step 4) — which take precedence over these per-function.
  maxInstances: 10,
});

