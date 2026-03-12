import { Router } from 'express';
import type { Request, Response } from 'express';
import { env, logger } from '@openclaw/config';
import { HTTP_STATUS } from '@openclaw/shared';
import type { TelegramUpdate } from '@openclaw/shared';
import { processTelegramUpdate } from '../../integrations/telegram/processor.js';

export const telegramWebhookRouter = Router();

telegramWebhookRouter.post('/', (req: Request, res: Response) => {
  void handleTelegramWebhook(req, res);
});

async function handleTelegramWebhook(req: Request, res: Response): Promise<void> {
  // 1. Validate webhook secret
  const expectedSecret = env.TELEGRAM_WEBHOOK_SECRET;
  if (!expectedSecret) {
    logger.error('Telegram webhook: TELEGRAM_WEBHOOK_SECRET is not configured');
    res.status(HTTP_STATUS.SERVICE_UNAVAILABLE).json({ error: 'Webhook not configured' });
    return;
  }

  const secretHeader = req.get('x-telegram-bot-api-secret-token');
  if (!secretHeader || secretHeader !== expectedSecret) {
    logger.warn({ ip: req.ip }, 'Telegram webhook: invalid secret token');
    res.status(HTTP_STATUS.UNAUTHORIZED).json({ error: 'Invalid webhook secret' });
    return;
  }

  const update = req.body as TelegramUpdate;

  // 2. Basic update validation
  if (!update || typeof update.update_id !== 'number') {
    logger.warn('Telegram webhook: invalid update structure');
    res.status(HTTP_STATUS.BAD_REQUEST).json({ error: 'Invalid update' });
    return;
  }

  try {
    await processTelegramUpdate(update);
    res.status(HTTP_STATUS.OK).json({ ok: true });
  } catch (err) {
    logger.error({ err, updateId: update.update_id }, 'Telegram webhook processing error');
    res.status(HTTP_STATUS.OK).json({ ok: true });
  }
}
