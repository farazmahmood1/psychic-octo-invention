import { Router } from 'express';
import type { Request, Response, NextFunction } from 'express';
import { jobListQuerySchema } from '@openclaw/shared';
import { requireAuth } from '../middleware/auth/require-auth.js';
import { requireRole } from '../middleware/auth/require-role.js';
import { validate } from '../utils/validate.js';
import { sendPaginated } from '../utils/respond.js';
import { listJobs } from '../services/job.service.js';

export const jobsRouter = Router();

// GET /jobs — list jobs with filters
jobsRouter.get(
  '/',
  requireAuth,
  requireRole('admin'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const query = validate(jobListQuerySchema, req.query);
      const { data, total } = await listJobs(query);
      sendPaginated(res, data, { page: query.page, pageSize: query.pageSize, total });
    } catch (err) {
      next(err);
    }
  },
);
