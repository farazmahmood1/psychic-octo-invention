import { Router } from 'express';
import type { Request, Response, NextFunction } from 'express';
import { requireAuth } from '../middleware/auth/require-auth.js';
import { requireRole } from '../middleware/auth/require-role.js';
import { sendData } from '../utils/respond.js';
import { getDashboardStats, getRecentActivity } from '../services/dashboard.service.js';

export const dashboardRouter = Router();

// GET /dashboard/stats — aggregated stats for the dashboard
dashboardRouter.get(
  '/stats',
  requireAuth,
  requireRole('viewer'),
  async (_req: Request, res: Response, next: NextFunction) => {
    try {
      const stats = await getDashboardStats();
      sendData(res, stats);
    } catch (err) {
      next(err);
    }
  },
);

// GET /dashboard/recent-activity — latest audit log entries
dashboardRouter.get(
  '/recent-activity',
  requireAuth,
  requireRole('viewer'),
  async (_req: Request, res: Response, next: NextFunction) => {
    try {
      const activity = await getRecentActivity();
      sendData(res, activity);
    } catch (err) {
      next(err);
    }
  },
);
