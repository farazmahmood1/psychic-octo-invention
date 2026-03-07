import type { SessionUser } from '@openclaw/shared';

declare global {
  namespace Express {
    interface Request {
      sessionUser?: SessionUser;
    }
  }
}
