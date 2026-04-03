import { Router } from 'express';
import type { Request, Response, NextFunction } from 'express';
import { auditLogQuerySchema } from '@nexclaw/shared';
import { requireAuth } from '../middleware/auth/require-auth.js';
import { requireRole } from '../middleware/auth/require-role.js';
import { validate } from '../utils/validate.js';
import { sendPaginated } from '../utils/respond.js';
import { listAuditLogs } from '../services/audit.service.js';
import { toCsv } from '../utils/csv-export.js';

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

// GET /audit/export — CSV export of audit logs
auditRouter.get(
  '/export',
  requireAuth,
  requireRole('admin'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const query = validate(auditLogQuerySchema, req.query);
      // Fetch up to 5000 rows for export
      const { data } = await listAuditLogs({ ...query, page: 1, pageSize: 5000 });
      const rows = data.map((entry) => ({
        time: entry.createdAt,
        action: entry.action,
        actorId: entry.actorId ?? 'System',
        actorType: entry.actorType,
        targetType: entry.targetType ?? '',
        targetId: entry.targetId ?? '',
        ipAddress: entry.ipAddress ?? '',
      }));
      const csv = toCsv(rows, ['time', 'action', 'actorId', 'actorType', 'targetType', 'targetId', 'ipAddress']);
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', 'attachment; filename="audit-log.csv"');
      res.send(csv);
    } catch (err) {
      next(err);
    }
  },
);
