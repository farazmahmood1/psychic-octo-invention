import { Router } from 'express';
import type { Request, Response, NextFunction } from 'express';
import { routingSettingsSchema, firstPartyToolSettingsSchema } from '@nexclaw/shared';
import { requireAuth } from '../middleware/auth/require-auth.js';
import { requireRole } from '../middleware/auth/require-role.js';
import { validate } from '../utils/validate.js';
import { sendData } from '../utils/respond.js';
import { getClientIp } from '../utils/request.js';
import {
  getRoutingSettings,
  updateRoutingSettings,
  getFirstPartyToolSettings,
  updateFirstPartyToolSettings,
} from '../services/settings.service.js';

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

// GET /settings/tools — current first-party tool runtime config
settingsRouter.get(
  '/tools',
  requireAuth,
  requireRole('viewer'),
  async (_req: Request, res: Response, next: NextFunction) => {
    try {
      const settings = await getFirstPartyToolSettings();
      sendData(res, settings);
    } catch (err) {
      next(err);
    }
  },
);

// PATCH /settings/tools — update built-in tool runtime config
settingsRouter.patch(
  '/tools',
  requireAuth,
  requireRole('admin'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const input = validate(firstPartyToolSettingsSchema, req.body);
      const settings = await updateFirstPartyToolSettings(
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
