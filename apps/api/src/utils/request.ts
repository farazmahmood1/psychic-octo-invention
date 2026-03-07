import type { Request } from 'express';

/** Extract client IP from request, respecting proxy headers */
export function getClientIp(req: Request): string {
  return (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() ?? req.ip ?? 'unknown';
}

/** Extract user agent string from request */
export function getUserAgent(req: Request): string {
  return req.headers['user-agent'] ?? '';
}
