/**
 * Reads one document from Firestore's deliveryZones collection — the
 * same collection js/delivery-zones.js and the Admin Dashboard's
 * Delivery Zones page already manage, and the same collection
 * functions/src/delivery (Cloud Functions side, still a placeholder)
 * is meant to read from too.
 *
 * Kept as its own small function, separate from the HTTP handler in
 * lambda/health/, specifically so the real delivery-fee-calculation
 * logic planned for a later migration step can reuse this exact read
 * instead of duplicating it — the same reasoning functions/src/delivery
 * exists as its own module rather than being inlined into a handler.
 */
import { getFirebaseAdmin } from '../admin';
import { DELIVERY_ZONES_COLLECTION } from '../config';

export interface DeliveryZone {
  id: string;
  name?: string;
  fee?: number;
  description?: string;
  active?: boolean;
  sortOrder?: number;
}

/**
 * Returns the delivery zone document, or null if it doesn't exist —
 * same "null means not found, let the caller decide the response"
 * convention js/firestore.js already uses throughout.
 */
export async function getDeliveryZoneById(zoneId: string): Promise<DeliveryZone | null> {
  const { db } = await getFirebaseAdmin();
  const snap = await db.collection(DELIVERY_ZONES_COLLECTION).doc(zoneId).get();
  if (!snap.exists) return null;
  return { id: snap.id, ...snap.data() } as DeliveryZone;
}
