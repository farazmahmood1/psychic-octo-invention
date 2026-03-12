import { Router } from 'express';
import type { Request, Response } from 'express';
import { env, logger } from '@openclaw/config';
import { HTTP_STATUS } from '@openclaw/shared';
import type { InboundEmailPayload } from '@openclaw/shared';
import { acceptInboundEmailPayload } from '../../services/channels/email.inbound.js';

export const emailWebhookRouter = Router();

emailWebhookRouter.post('/', async (req: Request, res: Response) => {
  const expectedSecret = env.INBOUND_EMAIL_WEBHOOK_SECRET;
  if (!expectedSecret) {
    logger.error('Email webhook: INBOUND_EMAIL_WEBHOOK_SECRET is not configured');
    res.status(HTTP_STATUS.SERVICE_UNAVAILABLE).json({ error: 'Webhook not configured' });
    return;
  }

  const secretHeader = req.get('x-email-webhook-secret');
  if (!secretHeader || secretHeader !== expectedSecret) {
    logger.warn({ ip: req.ip }, 'Email webhook: invalid secret token');
    res.status(HTTP_STATUS.UNAUTHORIZED).json({ error: 'Invalid webhook secret' });
    return;
  }

  const payload = req.body as InboundEmailPayload;

  try {
    const result = await acceptInboundEmailPayload(payload);
    res.status(result.statusCode).json(result.body);
  } catch (err) {
    logger.error({ err }, 'Email webhook processing error');
    res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({ error: 'Email webhook processing failed' });
  }
});
