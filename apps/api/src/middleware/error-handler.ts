import type { Request, Response, NextFunction } from 'express';
import { logger } from '@openclaw/config';
import { HTTP_STATUS } from '@openclaw/shared';
import { AppError } from '../utils/app-error.js';

interface HttpLikeError extends Error {
  status?: number;
  statusCode?: number;
  type?: string;
}

function getHttpStatus(err: HttpLikeError): number | undefined {
  const status = err.statusCode ?? err.status;
  if (typeof status !== 'number') return undefined;
  return status >= 400 && status < 600 ? status : undefined;
}

/** Centralized error handler - returns normalized API error shape */
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

  const httpErr = err as HttpLikeError;
  const status = getHttpStatus(httpErr);
  if (status && status < 500) {
    // body-parser marks malformed JSON payloads with this error type
    if (httpErr.type === 'entity.parse.failed') {
      logger.warn({ requestId, status, type: httpErr.type }, 'Malformed JSON request body');
      res.status(HTTP_STATUS.BAD_REQUEST).json({
        error: {
          code: 'INVALID_JSON',
          message: 'Malformed JSON request body',
        },
      });
      return;
    }

    logger.warn({ requestId, status, message: err.message }, 'Handled HTTP error');
    res.status(status).json({
      error: {
        code: 'BAD_REQUEST',
        message: err.message || 'Invalid request',
      },
    });
    return;
  }

  // Unexpected errors
  logger.error({ requestId, err }, 'Unhandled error');
  console.error('UNHANDLED ERROR DETAILS:', err);
  res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
    error: {
      code: 'INTERNAL_ERROR',
      message: 'An unexpected error occurred',
      ...(process.env['NODE_ENV'] === 'development' ? { debug: { name: err.name, message: err.message, stack: err.stack } } : {}),
    },
  });
}
