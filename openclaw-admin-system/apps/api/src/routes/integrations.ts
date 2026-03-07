import { Router } from 'express';
import type { Request, Response, NextFunction } from 'express';
import { requireAuth } from '../middleware/auth/require-auth.js';
import { requireRole } from '../middleware/auth/require-role.js';
import { sendData } from '../utils/respond.js';
import { getIntegrationHealth } from '../services/integration.service.js';

export const integrationsRouter = Router();

// GET /integrations/health — health status of all integrations
integrationsRouter.get(
  '/health',
  requireAuth,
  requireRole('viewer'),
  async (_req: Request, res: Response, next: NextFunction) => {
    try {
      const health = await getIntegrationHealth();
      sendData(res, health);
    } catch (err) {
      next(err);
    }
  },
);
