import { Request, Response, NextFunction } from 'express';
import { ApiError } from '../utils/ApiError.js';
import { logger } from '../utils/logger.js';
import { env } from '../config/env.js';

/**
 * Global error handler middleware — must be registered last
 */
export function errorHandler(
  err: Error,
  req: Request,
  res: Response,
  _next: NextFunction
): void {
  // Default to 500 Internal Server Error
  let statusCode = 500;
  let message = 'Internal server error';
  let details: unknown = undefined;

  if (err instanceof ApiError) {
    statusCode = err.statusCode;
    message = err.message;
    details = err.details;

    // Only log stack trace for non-operational (programming) errors
    if (!err.isOperational) {
      logger.error(`[${req.method}] ${req.path} — Unexpected error:`, err);
    } else {
      logger.warn(`[${req.method}] ${req.path} — ${statusCode}: ${message}`);
    }
  } else {
    // Unexpected error — always log full details
    logger.error(`[${req.method}] ${req.path} — Unhandled error:`, err);
  }

  const response: Record<string, unknown> = {
    success: false,
    error: {
      message,
      statusCode,
      ...(details !== undefined ? { details } : {}),
    },
  };

  // Include stack trace in development
  if (env.NODE_ENV === 'development' && err.stack) {
    response.stack = err.stack;
  }

  res.status(statusCode).json(response);
}

/**
 * 404 handler for undefined routes
 */
export function notFoundHandler(req: Request, _res: Response, next: NextFunction): void {
  next(ApiError.notFound(`Route ${req.method} ${req.path} not found`));
}
