import { Router } from 'express';
import type { Request, Response, NextFunction } from 'express';
import { bookkeepingListQuerySchema } from '@openclaw/shared';
import { requireAuth } from '../middleware/auth/require-auth.js';
import { requireRole } from '../middleware/auth/require-role.js';
import { validate } from '../utils/validate.js';
import { sendPaginated } from '../utils/respond.js';
import { listExtractions } from '../services/bookkeeping-admin.service.js';

export const bookkeepingRouter = Router();

// GET /bookkeeping — list receipt extractions
bookkeepingRouter.get(
  '/',
  requireAuth,
  requireRole('viewer'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const query = validate(bookkeepingListQuerySchema, req.query);
      const { data, total } = await listExtractions(query);
      sendPaginated(res, data, { page: query.page, pageSize: query.pageSize, total });
    } catch (err) {
      next(err);
    }
  },
);
