import type { Request, Response, NextFunction } from 'express';
import { authConfig } from '@openclaw/config';
import { HTTP_STATUS } from '@openclaw/shared';
import { verifyCsrfToken } from '../../services/auth.service.js';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);
const CSRF_HEADER = 'x-csrf-token';

/**
 * Double-submit cookie CSRF protection.
 * For state-changing requests, verifies that the x-csrf-token header
 * matches the CSRF cookie value. Both are set on login.
 */
export function csrfMiddleware(req: Request, res: Response, next: NextFunction) {
  if (SAFE_METHODS.has(req.method)) {
    next();
    return;
  }

  // Only enforce CSRF for authenticated sessions
  if (!req.sessionUser) {
    next();
    return;
  }

  const cookieToken = req.cookies?.[authConfig.session.csrfCookieName] as string | undefined;
  const headerToken = req.headers[CSRF_HEADER] as string | undefined;

  if (!cookieToken || !headerToken || !verifyCsrfToken(cookieToken, headerToken)) {
    res.status(HTTP_STATUS.FORBIDDEN).json({
      error: { code: 'CSRF_VALIDATION_FAILED', message: 'Invalid CSRF token' },
    });
    return;
  }

  next();
}
