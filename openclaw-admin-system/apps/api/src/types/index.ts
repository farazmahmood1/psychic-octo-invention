import type { Request } from 'express';
import type { SessionUser } from '@openclaw/shared';

/** Authenticated request — available after auth middleware */
export interface AuthenticatedRequest extends Request {
  user: SessionUser;
}
