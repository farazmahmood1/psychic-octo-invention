import { Router } from 'express';
import type { Request, Response, NextFunction } from 'express';
import {
  paginationQuerySchema,
  skillToggleSchema,
  skillIngestSchema,
  skillManualOverrideSchema,
  HTTP_STATUS,
} from '@openclaw/shared';
import { requireAuth } from '../middleware/auth/require-auth.js';
import { requireRole } from '../middleware/auth/require-role.js';
import { validate } from '../utils/validate.js';
import { sendData, sendPaginated } from '../utils/respond.js';
import { getClientIp } from '../utils/request.js';
import {
  listSkills,
  toggleSkill,
  getVettingHistory,
  ingestSkill,
  manualOverride,
} from '../services/skills/index.js';

export const skillsRouter = Router();

// GET /skills — list all skills
skillsRouter.get(
  '/',
  requireAuth,
  requireRole('viewer'),
  async (_req: Request, res: Response, next: NextFunction) => {
    try {
      const skills = await listSkills();
      sendData(res, skills);
    } catch (err) {
      next(err);
    }
  },
);

// POST /skills/ingest — ingest a new skill (runs vetting pipeline)
skillsRouter.post(
  '/ingest',
  requireAuth,
  requireRole('admin'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const input = validate(skillIngestSchema, req.body);
      const result = await ingestSkill(input, req.sessionUser!.id, getClientIp(req));

      const status = result.vettingResult === 'failed'
        ? HTTP_STATUS.UNPROCESSABLE_ENTITY
        : HTTP_STATUS.CREATED;

      sendData(res, result, status);
    } catch (err) {
      next(err);
    }
  },
);

// PATCH /skills/:id/enabled — toggle skill enabled state (enforces vetting)
skillsRouter.patch(
  '/:id/enabled',
  requireAuth,
  requireRole('admin'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { enabled } = validate(skillToggleSchema, req.body);
      const skill = await toggleSkill(
        req.params['id']!,
        enabled,
        req.sessionUser!.id,
        getClientIp(req),
      );
      sendData(res, skill);
    } catch (err) {
      next(err);
    }
  },
);

// POST /skills/:id/manual-override — super_admin only manual vetting override
skillsRouter.post(
  '/:id/manual-override',
  requireAuth,
  requireRole('super_admin'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { result, reason } = validate(skillManualOverrideSchema, req.body);
      const record = await manualOverride(
        req.params['id']!,
        result,
        reason,
        req.sessionUser!.id,
        getClientIp(req),
      );
      sendData(res, record, HTTP_STATUS.CREATED);
    } catch (err) {
      next(err);
    }
  },
);

// GET /skills/:id/vetting-history — vetting results for a skill
skillsRouter.get(
  '/:id/vetting-history',
  requireAuth,
  requireRole('viewer'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const query = validate(paginationQuerySchema, req.query);
      const { data, total } = await getVettingHistory(req.params['id']!, query.page, query.pageSize);
      sendPaginated(res, data, { page: query.page, pageSize: query.pageSize, total });
    } catch (err) {
      next(err);
    }
  },
);
