import { Router } from 'express';
import type { Request, Response, NextFunction } from 'express';
import { auditLogQuerySchema } from '@openclaw/shared';
import { requireAuth } from '../middleware/auth/require-auth.js';
import { requireRole } from '../middleware/auth/require-role.js';
import { validate } from '../utils/validate.js';
import { sendPaginated } from '../utils/respond.js';
import { listAuditLogs } from '../services/audit.service.js';

export const auditRouter = Router();

// GET /audit — list audit logs with filters
auditRouter.get(
  '/',
  requireAuth,
  requireRole('viewer'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const query = validate(auditLogQuerySchema, req.query);
      const { data, total } = await listAuditLogs(query);
      sendPaginated(res, data, { page: query.page, pageSize: query.pageSize, total });
    } catch (err) {
      next(err);
    }
  },
);
