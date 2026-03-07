import type { Request, Response, NextFunction } from 'express';
import { logger } from '@openclaw/config';
import { HTTP_STATUS } from '@openclaw/shared';
import { AppError } from '../utils/app-error.js';

/** Centralized error handler — returns normalized API error shape */
export function globalErrorHandler(
  err: Error,
  req: Request,
  res: Response,
  _next: NextFunction,
) {
  const requestId = req.requestId;

  if (err instanceof AppError) {
    logger.warn({ requestId, code: err.code, message: err.message }, 'Handled application error');
    res.status(err.statusCode).json({
      error: {
        code: err.code,
        message: err.message,
        ...(err.details ? { details: err.details } : {}),
      },
    });
    return;
  }

  // Unexpected errors
  logger.error({ requestId, err }, 'Unhandled error');
  res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
    error: {
      code: 'INTERNAL_ERROR',
      message: 'An unexpected error occurred',
    },
  });
}
