import { Router } from 'express';
import { telegramWebhookRouter } from './telegram.js';
import { emailWebhookRouter } from './email.js';

export const webhooksRouter = Router();

// Telegram webhook — POST /webhooks/telegram
webhooksRouter.use('/telegram', telegramWebhookRouter);

// Email webhook — POST /webhooks/email
webhooksRouter.use('/email', emailWebhookRouter);
