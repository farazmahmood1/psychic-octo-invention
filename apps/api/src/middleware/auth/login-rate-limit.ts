import rateLimit from 'express-rate-limit';
import { authConfig } from '@nexclaw/config';

export const loginRateLimit = rateLimit({
  windowMs: authConfig.rateLimit.loginWindowMs,
  max: authConfig.rateLimit.loginMaxAttempts,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: {
      code: 'TOO_MANY_REQUESTS',
      message: 'Too many login attempts. Please try again later.',
    },
  },
  keyGenerator: (req) => {
    // Rate limit by IP + email to prevent distributed attacks on single account
    const email = (req.body as Record<string, unknown>)?.['email'];
    return typeof email === 'string'
      ? `${req.ip}:${email.toLowerCase()}`
      : req.ip ?? 'unknown';
  },
});
