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
  _next: NextFunction,
) => {
  const proposedStatus = err.statusCode ?? err.status ?? 500;
  const statusCode =
    Number.isInteger(proposedStatus) && proposedStatus >= 400 && proposedStatus <= 599
      ? proposedStatus
      : 500;
  // Never leak internal error details to the client for server-side (5xx) errors;
  // the full message and stack are still recorded in the server log below.
  const message =
    err.type === 'entity.parse.failed'
      ? 'Некорректный JSON в запросе'
      : statusCode >= 500
        ? 'Internal server error'
        : err.message || 'Invalid request';

  logger.error(
    {
      requestId: req.id,
      method: req.method,
      url: req.url,
      err: {
        // JSON parser errors can embed raw request bodies, including passwords.
        message: err.type === 'entity.parse.failed' ? 'Invalid JSON body' : err.message,
        stack: err.type === 'entity.parse.failed' ? undefined : err.stack,
        statusCode,
      },
    },
    `${req.method} ${req.url} failed`,
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
