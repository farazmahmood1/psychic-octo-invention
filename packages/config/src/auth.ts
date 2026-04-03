/** Centralized auth configuration constants */
export const authConfig = {
  session: {
    cookieName: 'nexclaw.sid',
    csrfCookieName: 'nexclaw.csrf',
    maxAge: 24 * 60 * 60 * 1000, // 24 hours
    secure: process.env['NODE_ENV'] === 'production',
    httpOnly: true,
    sameSite: 'lax' as const,
  },
  password: {
    minLength: 12,
    maxLength: 128,
  },
  rateLimit: {
    loginWindowMs: 15 * 60 * 1000, // 15 minutes
    loginMaxAttempts: 10,
  },
} as const;
