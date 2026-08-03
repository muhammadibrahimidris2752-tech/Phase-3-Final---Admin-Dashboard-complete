/**
 * Cloud Functions entry point — Kitchen & Home By Noor, Phase 4
 * (Secure Checkout & Paystack Integration).
 *
 * This file only re-exports; it holds no logic of its own. A function
 * is deployed under whatever name it's exported as from here. Each
 * feature area lives in its own folder under src/ so the codebase
 * stays organized as more functions are added, rather than one
 * growing index.ts:
 *
 *   src/admin.ts      Shared Firebase Admin SDK singleton (db, auth) —
 *                      imported by every module below, initialized
 *                      exactly once no matter how many modules import it.
 *   src/config.ts      Cross-cutting settings (region, global options)
 *                      shared by every function.
 *   src/utils/         Small helpers shared across feature modules —
 *                      currently requireOwner()/requireStaff(), the
 *                      Cloud Functions mirror of js/auth.js's
 *                      isAdmin()/isWorker() checks.
 *   src/payments/      Paystack transaction init + verification
 *                      (Steps 3\u20134). Empty so far.
 *   src/orders/        Server-side order creation/finalization
 *                      (Step 4). Empty so far.
 *   src/delivery/      Server-side delivery fee calculation from
 *                      deliveryZones + product surcharges (Step 3).
 *                      Empty so far.
 *   src/email/         Transactional emails, moved server-side per the
 *                      approved Phase 4 decisions (Step 4). Empty so
 *                      far.
 *   src/health/         healthCheck \u2014 Step 2's one real function, see
 *                      that file for what it's for.
 */
import './config'; // registers setGlobalOptions() before any function below is defined \u2014 must run first

export { healthCheck } from './health';

// Later steps add their exports here as each module gains real
// functions to deploy, e.g.:
//   export { initializeCheckout, verifyAndFinalizeOrder, paystackWebhook } from './payments';
//   export { finalizeOrder } from './orders';
//   export { calculateDeliveryFee } from './delivery';
//   export { sendOrderEmails } from './email';
