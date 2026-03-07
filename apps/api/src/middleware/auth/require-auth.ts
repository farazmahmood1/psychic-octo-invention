import type { Request, Response, NextFunction } from 'express';
import { HTTP_STATUS } from '@openclaw/shared';

/** Rejects requests without a valid session */
export function requireAuth(req: Request, res: Response, next: NextFunction) {
  if (!req.sessionUser) {
    res.status(HTTP_STATUS.UNAUTHORIZED).json({
      error: { code: 'UNAUTHORIZED', message: 'Authentication required' },
    });
    return;
  }
  next();
}
