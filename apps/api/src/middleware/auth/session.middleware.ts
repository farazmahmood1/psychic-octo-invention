import type { Request, Response, NextFunction } from 'express';
import { authConfig } from '@nexclaw/config';
import { validateSession } from '../../services/auth.service.js';

/**
 * Loads the session user from the session cookie on every request.
 * Does NOT enforce authentication — use requireAuth for that.
 */
export async function sessionMiddleware(req: Request, _res: Response, next: NextFunction) {
  const token = req.cookies?.[authConfig.session.cookieName] as string | undefined;

  if (token) {
    try {
      req.sessionUser = (await validateSession(token)) ?? undefined;
    } catch {
      req.sessionUser = undefined;
    }
  }

  next();
}
