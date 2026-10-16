import { Request, Response, NextFunction } from 'express';
import { randomUUID } from 'node:crypto';
import { logger } from '../config/logger';

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

  if (IGNORED_PATHS.has(req.path)) return next();

  const startedAt = process.hrtime.bigint();

  res.on('finish', () => {
    const durationMs = Number(process.hrtime.bigint() - startedAt) / 1e6;
    const level = res.statusCode >= 500 ? 'error' : res.statusCode >= 400 ? 'warn' : 'info';

    logger[level](
      {
        requestId,
        method: req.method,
        path: req.path,
        status: res.statusCode,
        durationMs: Math.round(durationMs * 10) / 10,
        ip: req.ip,
        userAgent: req.get('user-agent'),
      },
      `${req.method} ${req.path} ${res.statusCode}`,
    );
  });

  next();
};
