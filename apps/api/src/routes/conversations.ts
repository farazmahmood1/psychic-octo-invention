import { Router } from 'express';
import type { Request, Response, NextFunction } from 'express';
import { conversationListQuerySchema, messageListQuerySchema } from '@openclaw/shared';
import { requireAuth } from '../middleware/auth/require-auth.js';
import { requireRole } from '../middleware/auth/require-role.js';
import { validate } from '../utils/validate.js';
import { sendData, sendPaginated } from '../utils/respond.js';
import { listConversations, getConversation } from '../services/conversation.service.js';
import { listMessages } from '../services/message.service.js';

export const conversationsRouter = Router();

// GET /conversations — list with filters
conversationsRouter.get(
  '/',
  requireAuth,
  requireRole('viewer'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const query = validate(conversationListQuerySchema, req.query);
      const { data, total } = await listConversations(query);
      sendPaginated(res, data, { page: query.page, pageSize: query.pageSize, total });
    } catch (err) {
      next(err);
    }
  },
);

// GET /conversations/:id — single conversation detail
conversationsRouter.get(
  '/:id',
  requireAuth,
  requireRole('viewer'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const conversation = await getConversation(req.params['id']!);
      sendData(res, conversation);
    } catch (err) {
      next(err);
    }
  },
);

// GET /conversations/:id/messages — messages for a conversation
conversationsRouter.get(
  '/:id/messages',
  requireAuth,
  requireRole('viewer'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const query = validate(messageListQuerySchema, req.query);
      const { data, total } = await listMessages(req.params['id']!, query);
      sendPaginated(res, data, { page: query.page, pageSize: query.pageSize, total });
    } catch (err) {
      next(err);
    }
  },
);
