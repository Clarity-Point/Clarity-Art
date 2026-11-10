import { Request, Response, NextFunction } from 'express';
import { logger } from '../config/logger';

/** Error shape flowing through Express; `statusCode` is set by route handlers. */
interface AppError extends Error {
  statusCode?: number;
  status?: number;
  type?: string;
}

export const globalErrorHandler = (
  err: AppError,
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  if (res.headersSent) return next(err);
  const proposedStatus = err.statusCode ?? err.status ?? 500;
  const statusCode =
    Number.isInteger(proposedStatus) && proposedStatus >= 400 && proposedStatus <= 599
      ? proposedStatus
      : 500;
  const message =
    err.type === 'entity.parse.failed'
      ? 'Некорректный JSON в запросе'
      : statusCode >= 500
        ? 'Internal server error'
        : err.message || 'Invalid request';

  logger[statusCode >= 500 ? 'error' : 'warn'](
    {
      requestId: req.id,
      method: req.method,
      path: typeof req.route?.path === 'string' ? req.route.path : '[unmatched]',
      statusCode,
      err,
    },
    'HTTP request failed',
  );

  res.status(statusCode).json({
    status: 'error',
    statusCode,
    message,
    // Lets a user quote one id that pins the exact server-side log entry, without
    // exposing anything about the failure itself.
    requestId: req.id,
  });
};
