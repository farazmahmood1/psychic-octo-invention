import { Router } from 'express';
import type { Request, Response, NextFunction } from 'express';
import { routingSettingsSchema } from '@openclaw/shared';
import { requireAuth } from '../middleware/auth/require-auth.js';
import { requireRole } from '../middleware/auth/require-role.js';
import { validate } from '../utils/validate.js';
import { sendData } from '../utils/respond.js';
import { getClientIp } from '../utils/request.js';
import { getRoutingSettings, updateRoutingSettings } from '../services/settings.service.js';

export const settingsRouter = Router();

// GET /settings/routing — current routing config
settingsRouter.get(
  '/routing',
  requireAuth,
  requireRole('viewer'),
  async (_req: Request, res: Response, next: NextFunction) => {
    try {
      const settings = await getRoutingSettings();
      sendData(res, settings);
    } catch (err) {
      next(err);
    }
  },
);

// PATCH /settings/routing — update routing config
settingsRouter.patch(
  '/routing',
  requireAuth,
  requireRole('admin'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const input = validate(routingSettingsSchema, req.body);
      const settings = await updateRoutingSettings(
        input,
        req.sessionUser!.id,
        getClientIp(req),
      );
      sendData(res, settings);
    } catch (err) {
      next(err);
    }
  },
);
