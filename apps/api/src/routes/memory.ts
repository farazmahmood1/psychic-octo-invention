import { Router } from 'express';
import type { Request, Response, NextFunction } from 'express';
import { memorySearchQuerySchema } from '@openclaw/shared';
import { requireAuth } from '../middleware/auth/require-auth.js';
import { requireRole } from '../middleware/auth/require-role.js';
import { validate } from '../utils/validate.js';
import { sendPaginated } from '../utils/respond.js';
import { searchMemory } from '../services/memory.service.js';

export const memoryRouter = Router();

// GET /memory/search — search memory records
memoryRouter.get(
  '/search',
  requireAuth,
  requireRole('admin'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const query = validate(memorySearchQuerySchema, req.query);
      const { data, total } = await searchMemory(query);
      sendPaginated(res, data, { page: query.page, pageSize: query.pageSize, total });
    } catch (err) {
      next(err);
    }
  },
);
