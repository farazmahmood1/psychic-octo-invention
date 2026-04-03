import { Router } from 'express';
import type { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { conversationListQuerySchema, messageListQuerySchema } from '@nexclaw/shared';
import { requireAuth } from '../middleware/auth/require-auth.js';
import { requireRole } from '../middleware/auth/require-role.js';
import { validate } from '../utils/validate.js';
import { sendData, sendPaginated } from '../utils/respond.js';
import { listConversations, getConversation } from '../services/conversation.service.js';
import { listMessages } from '../services/message.service.js';
import { sendAdminMessage } from '../services/admin-chat.service.js';

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

const adminSendMessageSchema = z.object({
  text: z.string().min(1).max(10_000),
});

// POST /conversations/:id/send — send a message from the admin portal
conversationsRouter.post(
  '/:id/send',
  requireAuth,
  requireRole('admin'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { text } = validate(adminSendMessageSchema, req.body);
      const sessionUser = (req as any).sessionUser;
      const result = await sendAdminMessage({
        conversationId: req.params['id']!,
        text,
        adminId: sessionUser?.id ?? 'unknown',
        adminName: sessionUser?.displayName ?? sessionUser?.email ?? 'Admin',
      });
      sendData(res, result, 201);
    } catch (err) {
      next(err);
    }
  },
);

// POST /conversations/new — start a new conversation from the admin portal
conversationsRouter.post(
  '/new',
  requireAuth,
  requireRole('admin'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { text } = validate(adminSendMessageSchema, req.body);
      const sessionUser = (req as any).sessionUser;
      const result = await sendAdminMessage({
        text,
        adminId: sessionUser?.id ?? 'unknown',
        adminName: sessionUser?.displayName ?? sessionUser?.email ?? 'Admin',
      });
      sendData(res, result, 201);
    } catch (err) {
      next(err);
    }
  },
);
