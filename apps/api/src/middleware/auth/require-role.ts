import type { Request, Response, NextFunction } from 'express';
import { HTTP_STATUS, ROLE_HIERARCHY, type AdminRole } from '@nexclaw/shared';

/**
 * Factory that returns middleware requiring at least the given role level.
 * Role hierarchy: super_admin (3) > admin (2) > viewer (1)
 */
export function requireRole(minimumRole: AdminRole) {
  return (req: Request, res: Response, next: NextFunction) => {
    const user = req.sessionUser;
    if (!user) {
      res.status(HTTP_STATUS.UNAUTHORIZED).json({
        error: { code: 'UNAUTHORIZED', message: 'Authentication required' },
      });
      return;
    }

    const userLevel = ROLE_HIERARCHY[user.role] ?? 0;
    const requiredLevel = ROLE_HIERARCHY[minimumRole];

    if (userLevel < requiredLevel) {
      res.status(HTTP_STATUS.FORBIDDEN).json({
        error: { code: 'FORBIDDEN', message: 'Insufficient permissions' },
      });
      return;
    }

    next();
  };
}
