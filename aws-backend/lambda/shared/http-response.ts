/**
 * Centralized HTTP response shaping for API Gateway's Lambda proxy
 * integration. Every handler returns through successResponse() or
 * errorResponse() rather than building its own { statusCode, headers,
 * body } object — one place owns the response envelope, so every
 * endpoint returns JSON the same way as this backend grows.
 */
import type { APIGatewayProxyResultV2 } from 'aws-lambda';
import { AppError } from './errors';
import { logger } from './logger';

const JSON_HEADERS = { 'Content-Type': 'application/json' } as const;

/** Successful responses: caller-supplied status code and JSON body. */
export function successResponse(statusCode: number, data: unknown): APIGatewayProxyResultV2 {
  return {
    statusCode,
    headers: JSON_HEADERS,
    body: JSON.stringify(data),
  };
}

/**
 * Error responses. A known AppError maps to its declared status code
 * and a structured { error: { code, message } } body. Anything else
 * (a genuine bug, a Firestore call failing, etc.) maps to a generic
 * 500 that never leaks internal details to the caller — the real
 * error is still logged in full via lambda/shared/logger.ts, which is
 * what CloudWatch Logs captures for debugging.
 */
export function errorResponse(error: unknown): APIGatewayProxyResultV2 {
  if (error instanceof AppError) {
    logger.warn(error.message, { code: error.code, statusCode: error.statusCode });
    return {
      statusCode: error.statusCode,
      headers: JSON_HEADERS,
      body: JSON.stringify({ error: { code: error.code, message: error.message } }),
    };
  }

  logger.error('Unhandled error', {
    message: error instanceof Error ? error.message : String(error),
    stack: error instanceof Error ? error.stack : undefined,
  });
  return {
    statusCode: 500,
    headers: JSON_HEADERS,
    body: JSON.stringify({
      error: { code: 'INTERNAL_ERROR', message: 'Something went wrong. Please try again.' },
    }),
  };
}
