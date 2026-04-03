import { Router } from 'express';
import type { Request, Response, NextFunction } from 'express';
import { securityEventsQuerySchema, paginationQuerySchema } from '@nexclaw/shared';
import { requireAuth } from '../middleware/auth/require-auth.js';
import { requireRole } from '../middleware/auth/require-role.js';
import { validate } from '../utils/validate.js';
import { sendPaginated } from '../utils/respond.js';
import { listBlockedAttempts, listOverrideHistory } from '../services/security-admin.service.js';

export const securityRouter = Router();

// GET /security/blocked — blocked skill execution attempts
securityRouter.get(
  '/blocked',
  requireAuth,
  requireRole('admin'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const query = validate(securityEventsQuerySchema, req.query);
      const { data, total } = await listBlockedAttempts(query);
      sendPaginated(res, data, { page: query.page, pageSize: query.pageSize, total });
    } catch (err) {
      next(err);
    }
  },
);

// GET /security/overrides — manual vetting override history
securityRouter.get(
  '/overrides',
  requireAuth,
  requireRole('admin'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const query = validate(paginationQuerySchema, req.query);
      const { data, total } = await listOverrideHistory(query.page, query.pageSize);
      sendPaginated(res, data, { page: query.page, pageSize: query.pageSize, total });
    } catch (err) {
      next(err);
    }
  },
);
