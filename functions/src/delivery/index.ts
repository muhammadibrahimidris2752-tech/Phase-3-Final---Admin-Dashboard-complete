/**
 * Delivery — server-side delivery fee calculation.
 *
 * Planned for Phase 4 Step 3, per the approved design: the browser
 * sends only a deliveryZoneId it explicitly asked the customer to
 * choose (loaded dynamically from Firestore's deliveryZones
 * collection — see js/delivery-zones.js) — never a fee, never
 * coordinates, never anything geolocation- or IP-derived. This module
 * re-reads the real deliveryZones/{zoneId} document (fee, active
 * status) plus each cart line's product doc (for the optional
 * per-line extraDeliveryFee, multiplied by quantity, per the approved
 * decision) and computes the official delivery fee entirely
 * server-side. Pickup stays a fixed \u20a60, also decided server-side
 * rather than trusted from the browser. Called from src/payments as
 * part of initializeCheckout's price computation.
 *
 * Empty for now — Step 2 only scaffolds the Cloud Functions project
 * structure and ships one unrelated proof-of-pipeline function
 * (src/health).
 */
export {};
