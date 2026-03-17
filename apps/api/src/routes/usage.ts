import { Router } from 'express';
import type { Request, Response, NextFunction } from 'express';
import { usageSummaryQuerySchema, usageTimeseriesQuerySchema } from '@openclaw/shared';
import { requireAuth } from '../middleware/auth/require-auth.js';
import { requireRole } from '../middleware/auth/require-role.js';
import { validate } from '../utils/validate.js';
import { sendData } from '../utils/respond.js';
import { getUsageSummary, getUsageTimeseries } from '../services/usage.service.js';
import { toCsv } from '../utils/csv-export.js';

export const usageRouter = Router();

// GET /usage/summary — aggregated usage stats
usageRouter.get(
  '/summary',
  requireAuth,
  requireRole('viewer'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const query = validate(usageSummaryQuerySchema, req.query);
      const summary = await getUsageSummary(query);
      sendData(res, summary);
    } catch (err) {
      next(err);
    }
  },
);

// GET /usage/summary/export — CSV export of usage summary
usageRouter.get(
  '/summary/export',
  requireAuth,
  requireRole('viewer'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const query = validate(usageSummaryQuerySchema, req.query);
      const summary = await getUsageSummary(query);
      const rows = summary.byModel.map((m) => ({
        provider: m.provider,
        model: m.model,
        requests: m.requestCount,
        totalTokens: m.totalTokens,
        costUsd: m.totalCostUsd.toFixed(6),
      }));
      const csv = toCsv(rows, ['provider', 'model', 'requests', 'totalTokens', 'costUsd']);
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', 'attachment; filename="usage-summary.csv"');
      res.send(csv);
    } catch (err) {
      next(err);
    }
  },
);

// GET /usage/timeseries — usage over time
usageRouter.get(
  '/timeseries',
  requireAuth,
  requireRole('viewer'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const query = validate(usageTimeseriesQuerySchema, req.query);
      const timeseries = await getUsageTimeseries(query);
      sendData(res, timeseries);
    } catch (err) {
      next(err);
    }
  },
);
