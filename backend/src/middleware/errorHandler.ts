import { Request, Response, NextFunction } from 'express';
import { logger } from '../config/logger';

/** Error shape flowing through Express; `statusCode` is set by route handlers. */
interface AppError extends Error {
  statusCode?: number;
}

export const globalErrorHandler = (
  err: AppError,
  req: Request,
  res: Response,
  _next: NextFunction,
) => {
  const statusCode = err.statusCode || 500;
  // Never leak internal error details to the client for server-side (5xx) errors;
  // the full message and stack are still recorded in the server log below.
  const message =
    statusCode >= 500 ? 'Internal server error' : err.message || 'Internal Server Error';

  logger.error(
    {
      method: req.method,
      url: req.url,
      err: {
        message: err.message,
        stack: err.stack,
        statusCode,
      },
    },
    `[ERROR] ${req.method} ${req.url}`,
  );

  res.status(statusCode).json({
    status: 'error',
    statusCode,
    message,
  });
};
