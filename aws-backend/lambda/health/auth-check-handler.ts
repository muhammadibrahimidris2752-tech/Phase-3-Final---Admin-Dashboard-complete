/**
 * GET /health/auth-check — Phase 4 Step 2.8.
 *
 * The trivial authenticated endpoint Step 2.7's own writeup called for:
 * verifies a real Firebase ID token via requireOwner(), and returns
 * nothing beyond { ok: true, uid }. No business data, no writes — its
 * only purpose is to be small enough that a clean response means
 * exactly one thing: this Lambda's bundle survived cold start with
 * lambda/auth (and therefore firebase-admin/auth, and therefore the
 * jose/jwks-rsa dependency chain Step 2.7 fixed) actually imported and
 * exercised for real, on the real nodejs22.x runtime — not simulated
 * locally with a strict Node flag standing in for it.
 *
 * A 200 here proves three things at once, in order: the bundle loaded
 * (Step 2.7's fix works on the real runtime, not just locally),
 * verifyIdToken() correctly validated a real token against this
 * project's real Firebase project, and the admins/{uid} Firestore
 * lookup requireOwner() depends on succeeded too — so this is also the
 * first real confirmation that the Lambda's Firestore access (proven
 * for public data by /health/{zoneId} in Step 2.5) also works for a
 * read gated by which user is asking, not just what's being read.
 *
 * Deliberately its own file, not a second export added to
 * health/handler.ts: NodejsFunction bundles an entry file's full
 * module graph, not just whichever export Lambda's `handler` setting
 * names at runtime — so importing lambda/auth from the same file
 * /health/{zoneId} uses would have pulled jwks-rsa/jose into THAT
 * endpoint's bundle too, the exact outcome keeping the import isolated
 * in lambda/auth/verify-token.ts (see that file, and Step 2.5's
 * writeup) was always meant to prevent. Two files, two NodejsFunctions
 * — see lib/aws-backend-stack.ts — keeps that isolation intact:
 * /health/{zoneId}'s bundle is exactly what it was before this step.
 */
import type { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from 'aws-lambda';
import { requireOwner } from '../auth';
import { successResponse, errorResponse, logger } from '../shared';

export async function handler(event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> {
  try {
    const uid = await requireOwner(event);
    logger.info('Owner auth check succeeded', { uid });
    return successResponse(200, { ok: true, uid });
  } catch (error) {
    return errorResponse(error);
  }
}
