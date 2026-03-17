import { Router } from 'express';
import type { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { requireAuth } from '../middleware/auth/require-auth.js';
import { requireRole } from '../middleware/auth/require-role.js';
import { sendData } from '../utils/respond.js';
import { validate } from '../utils/validate.js';
import { getIntegrationHealth, getIntegrationConfig, saveIntegrationConfig } from '../services/integration.service.js';

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

// GET /integrations/:key/config — get current config (masked) for an integration
integrationsRouter.get(
  '/:key/config',
  requireAuth,
  requireRole('admin'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const config = await getIntegrationConfig(req.params['key']!);
      sendData(res, config);
    } catch (err) {
      next(err);
    }
  },
);

const saveConfigSchema = z.object({
  fields: z.record(z.string()),
});

// POST /integrations/:key/config — save configuration for an integration
integrationsRouter.post(
  '/:key/config',
  requireAuth,
  requireRole('admin'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { fields } = validate(saveConfigSchema, req.body);
      const result = await saveIntegrationConfig(req.params['key']!, fields);
      sendData(res, result);
    } catch (err) {
      next(err);
    }
  },
);
