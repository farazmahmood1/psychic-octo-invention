import type { SessionUser } from '@nexclaw/shared';

declare global {
  namespace Express {
    interface Request {
      sessionUser?: SessionUser;
    }
  }
}
