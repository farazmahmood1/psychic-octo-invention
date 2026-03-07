import { Router } from 'express';
import type { Request, Response, NextFunction } from 'express';
import { authConfig } from '@openclaw/config';
import { HTTP_STATUS, loginRequestSchema, changePasswordSchema } from '@openclaw/shared';
import { login, logout, changePassword } from '../services/auth.service.js';
import { requireAuth } from '../middleware/auth/require-auth.js';
import { loginRateLimit } from '../middleware/auth/login-rate-limit.js';
import { AppError } from '../utils/app-error.js';

export const authRouter = Router();

function getClientIp(req: Request): string {
  return (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() ?? req.ip ?? 'unknown';
}

function setSessionCookies(res: Response, sessionToken: string, csrfToken: string): void {
  const { cookieName, csrfCookieName, maxAge, secure, sameSite } = authConfig.session;

  res.cookie(cookieName, sessionToken, {
    httpOnly: true,
    secure,
    sameSite,
    maxAge,
    path: '/',
  });

  // CSRF cookie must be readable by JS (not httpOnly)
  res.cookie(csrfCookieName, csrfToken, {
    httpOnly: false,
    secure,
    sameSite,
    maxAge,
    path: '/',
  });
}

function clearSessionCookies(res: Response): void {
  const { cookieName, csrfCookieName } = authConfig.session;
  res.clearCookie(cookieName, { path: '/' });
  res.clearCookie(csrfCookieName, { path: '/' });
}

// POST /auth/login
authRouter.post(
  '/login',
  loginRateLimit,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const parsed = loginRequestSchema.safeParse(req.body);
      if (!parsed.success) {
        throw new AppError(HTTP_STATUS.BAD_REQUEST, 'VALIDATION_ERROR', 'Invalid request', {
          issues: parsed.error.flatten().fieldErrors,
        });
      }

      const { email, password } = parsed.data;
      const ip = getClientIp(req);
      const userAgent = req.headers['user-agent'] ?? '';

      const result = await login(email, password, ip, userAgent);

      setSessionCookies(res, result.sessionToken, result.csrfToken);

      res.status(HTTP_STATUS.OK).json({ data: { user: result.user } });
    } catch (err) {
      next(err);
    }
  },
);

// POST /auth/logout
authRouter.post(
  '/logout',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const token = req.cookies?.[authConfig.session.cookieName] as string | undefined;
      if (token) {
        const ip = getClientIp(req);
        const userAgent = req.headers['user-agent'] ?? '';
        await logout(token, ip, userAgent);
      }

      clearSessionCookies(res);
      res.status(HTTP_STATUS.OK).json({ data: { message: 'Logged out' } });
    } catch (err) {
      next(err);
    }
  },
);

// GET /auth/me
authRouter.get(
  '/me',
  requireAuth,
  (req: Request, res: Response) => {
    res.status(HTTP_STATUS.OK).json({ data: { user: req.sessionUser } });
  },
);

// POST /auth/change-password
authRouter.post(
  '/change-password',
  requireAuth,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const parsed = changePasswordSchema.safeParse(req.body);
      if (!parsed.success) {
        throw new AppError(HTTP_STATUS.BAD_REQUEST, 'VALIDATION_ERROR', 'Invalid request', {
          issues: parsed.error.flatten().fieldErrors,
        });
      }

      const { currentPassword, newPassword } = parsed.data;
      const ip = getClientIp(req);
      const userAgent = req.headers['user-agent'] ?? '';

      await changePassword(req.sessionUser!.id, currentPassword, newPassword, ip, userAgent);

      // Clear cookies since all sessions were invalidated
      clearSessionCookies(res);

      res.status(HTTP_STATUS.OK).json({
        data: { message: 'Password changed. Please log in again.' },
      });
    } catch (err) {
      next(err);
    }
  },
);
