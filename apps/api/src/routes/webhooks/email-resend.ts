import { Router } from 'express';
import type { Request, Response } from 'express';
import { env, logger } from '@openclaw/config';
import { HTTP_STATUS } from '@openclaw/shared';
import {
  getResendReceivingEmail,
  mapResendEmailToInboundPayload,
  verifyResendWebhook,
} from '../../integrations/email/resend.js';
import { acceptInboundEmailPayload } from '../../services/channels/email.inbound.js';

export const resendEmailWebhookRouter = Router();

resendEmailWebhookRouter.post('/', async (req: Request, res: Response) => {
  const resendApiKey = env.RESEND_API_KEY;
  const resendWebhookSecret = env.RESEND_WEBHOOK_SECRET;
  if (!resendApiKey || !resendWebhookSecret) {
    logger.error('Resend email webhook: RESEND_API_KEY or RESEND_WEBHOOK_SECRET is not configured');
    res.status(HTTP_STATUS.SERVICE_UNAVAILABLE).json({ error: 'Webhook not configured' });
    return;
  }

  const rawBody = (req as Request & { rawBody?: string }).rawBody;
  if (!rawBody) {
    logger.warn('Resend email webhook: missing raw request body');
    res.status(HTTP_STATUS.BAD_REQUEST).json({ error: 'Invalid webhook payload' });
    return;
  }

  const svixId = req.get('svix-id');
  const svixTimestamp = req.get('svix-timestamp');
  const svixSignature = req.get('svix-signature');

  if (!svixId || !svixTimestamp || !svixSignature) {
    logger.warn({ ip: req.ip }, 'Resend email webhook: missing Svix signature headers');
    res.status(HTTP_STATUS.UNAUTHORIZED).json({ error: 'Invalid webhook signature' });
    return;
  }

  let event;
  try {
    event = verifyResendWebhook(rawBody, {
      id: svixId,
      timestamp: svixTimestamp,
      signature: svixSignature,
    });
  } catch (err) {
    logger.warn({ err, ip: req.ip }, 'Resend email webhook: invalid Svix signature');
    res.status(HTTP_STATUS.UNAUTHORIZED).json({ error: 'Invalid webhook signature' });
    return;
  }

  try {
    if (!event) {
      res.status(HTTP_STATUS.OK).json({ ok: true });
      return;
    }

    const resendEmail = await getResendReceivingEmail(event.data.email_id);
    const payload = mapResendEmailToInboundPayload(resendEmail);
    const result = await acceptInboundEmailPayload(payload);

    res.status(result.statusCode).json(result.body);
  } catch (err) {
    logger.error({ err }, 'Resend email webhook processing error');
    res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({ error: 'Email webhook processing failed' });
  }
});
