/**
 * Centralized configuration for the AWS backend.
 *
 * Every Lambda handler and helper reads settings from here rather
 * than scattering literals across files — the same "one place, not
 * repeated per function" reasoning functions/src/config.ts already
 * established on the Cloud Functions side. lib/aws-backend-stack.ts
 * (the CDK infrastructure code) imports these same constants too, so
 * there is exactly one place the secret's name or the Firestore
 * collection name is written down — not one copy for the Lambda code
 * and a second, driftable copy in the CDK stack.
 */

/**
 * Name of the AWS Secrets Manager secret holding the Firebase service
 * account JSON key. The secret itself is created once, manually, with
 * the real key pasted in as its value — see README.md's "Create the
 * Firebase service account secret" section. This constant is just the
 * secret's NAME/identifier, not the credential itself, so it's safe
 * to have in source control; nothing here grants access to the secret
 * without the matching IAM permission the CDK stack also provisions.
 */
export const FIREBASE_SERVICE_ACCOUNT_SECRET_NAME = 'kitchen-home-by-noor/firebase-service-account';

/** Firestore collection this proof-of-concept reads from — the same
    collection js/delivery-zones.js and the Admin Dashboard's Delivery
    Zones page already manage. */
export const DELIVERY_ZONES_COLLECTION = 'deliveryZones';

/** Minimum log level the shared logger emits — see lambda/shared/logger.ts. */
export const LOG_LEVEL: 'debug' | 'info' | 'warn' | 'error' = 'info';
