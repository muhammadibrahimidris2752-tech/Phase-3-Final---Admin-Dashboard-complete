/**
 * GET /health/{zoneId} — Phase 4 Step 2.5 proof-of-concept.
 *
 * Reads one document from Firestore's deliveryZones collection and
 * returns it as JSON. This is the one real endpoint this step ships:
 * it proves the whole cross-cloud pipeline works — API Gateway routes
 * to Lambda, Lambda loads the Firebase service account from Secrets
 * Manager, initializes the Admin SDK, and reads real Firestore data —
 * before any payment, order, or checkout logic is migrated here.
 *
 * Deliberately unauthenticated for this step: deliveryZones data is
 * already public-read in firestore.rules, so there's nothing this
 * specific endpoint needs to protect. lambda/auth/verify-token.ts
 * already has requireOwner()/requireStaff() ready for whichever real
 * endpoint needs them next.
 */
import type { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from 'aws-lambda';
import { getDeliveryZoneById } from '../delivery';
import { successResponse, errorResponse, BadRequestError, NotFoundError, logger } from '../shared';

export async function handler(event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> {
  try {
    const zoneId = event.pathParameters?.zoneId;
    if (!zoneId) {
      throw new BadRequestError('A zoneId path parameter is required, e.g. GET /health/sample-zone-within-city.');
    }

    logger.info('Reading delivery zone', { zoneId });
    const zone = await getDeliveryZoneById(zoneId);

    if (!zone) {
      throw new NotFoundError(`No delivery zone found with id "${zoneId}".`);
    }

    return successResponse(200, zone);
  } catch (error) {
    return errorResponse(error);
  }
}
