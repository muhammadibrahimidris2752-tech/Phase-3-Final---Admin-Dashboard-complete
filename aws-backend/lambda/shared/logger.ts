/**
 * Centralized structured logging. CloudWatch Logs captures whatever a
 * Lambda writes to stdout/stderr as-is — emitting one JSON object per
 * line (rather than free-text messages) is what makes CloudWatch Logs
 * Insights queries (filter/aggregate by field) possible later, instead
 * of grepping through unstructured text. Every handler and helper logs
 * through this, not console.log directly, so that shape is consistent
 * everywhere.
 */
import { LOG_LEVEL } from '../config';

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const LEVEL_WEIGHT: Record<LogLevel, number> = { debug: 10, info: 20, warn: 30, error: 40 };

function write(level: LogLevel, message: string, meta?: Record<string, unknown>): void {
  if (LEVEL_WEIGHT[level] < LEVEL_WEIGHT[LOG_LEVEL]) return;

  const line = {
    level,
    message,
    timestamp: new Date().toISOString(),
    ...meta,
  };

  // warn/error go to stderr so they're easy to isolate in CloudWatch
  // Logs filters; everything else goes to stdout.
  const write_ = level === 'error' || level === 'warn' ? console.error : console.log;
  write_(JSON.stringify(line));
}

export const logger = {
  debug: (message: string, meta?: Record<string, unknown>): void => write('debug', message, meta),
  info: (message: string, meta?: Record<string, unknown>): void => write('info', message, meta),
  warn: (message: string, meta?: Record<string, unknown>): void => write('warn', message, meta),
  error: (message: string, meta?: Record<string, unknown>): void => write('error', message, meta),
};
