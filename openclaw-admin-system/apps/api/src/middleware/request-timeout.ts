import type { Request, Response, NextFunction } from 'express';
import { env } from '@openclaw/config';

/** Set a per-request timeout. Responds 408 if exceeded. */
export function requestTimeout(req: Request, res: Response, next: NextFunction) {
  // Skip timeout for webhook routes (they may trigger long orchestration)
  if (req.path.startsWith('/webhooks')) {
    return next();
  }

  const timeoutMs = env.REQUEST_TIMEOUT_MS;

  req.setTimeout(timeoutMs, () => {
    if (!res.headersSent) {
      res.status(408).json({
        error: {
          code: 'REQUEST_TIMEOUT',
          message: 'Request processing timed out',
        },
      });
    }
  });

  next();
}
