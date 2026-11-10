import { Request, Response, NextFunction } from 'express';
import { randomUUID } from 'node:crypto';
import { logger, requestContext } from '../config/logger';

declare module 'express-serve-static-core' {
  interface Request {
    /** Correlation id for this request; also returned as the `X-Request-Id` header. */
    id?: string;
  }
}

/** Paths that would otherwise flood the log with container/orchestrator probes. */
const IGNORED_PATHS = new Set(['/health', '/health/ready', '/favicon.ico']);

/**
 * Logs one line per completed request. The request body is deliberately never
 * logged — it routinely carries diary text, chat messages and credentials.
 *
 * Level is chosen by status code so that production can run at `warn` and still
 * capture every failing request: 5xx → error, 4xx → warn, everything else → info.
 */
export const requestLogger = (req: Request, res: Response, next: NextFunction) => {
  const suppliedId = req.get('x-request-id');
  const requestId =
    suppliedId && /^[A-Za-z0-9._-]{1,128}$/.test(suppliedId) ? suppliedId : randomUUID();
  req.id = requestId;
  res.setHeader('X-Request-Id', requestId);

  const startedAt = process.hrtime.bigint();
  let recorded = false;
  const record = (aborted = false) => {
    if (recorded) return;
    recorded = true;
    if (!aborted && res.statusCode < 400 && IGNORED_PATHS.has(req.path)) return;
    const durationMs = Number(process.hrtime.bigint() - startedAt) / 1e6;
    const level =
      res.statusCode >= 500 ? 'error' : aborted || res.statusCode >= 400 ? 'warn' : 'info';
    const path = typeof req.route?.path === 'string' ? req.route.path : '[unmatched]';

    logger[level](
      {
        requestId,
        method: req.method,
        path,
        status: res.statusCode,
        aborted,
        durationMs: Math.round(durationMs * 10) / 10,
      },
      'HTTP request completed',
    );
  };
  res.once('finish', () => record());
  res.once('close', () => record(!res.writableFinished));

  requestContext.run({ requestId }, next);
};
