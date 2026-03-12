import { Router } from 'express';
import { telegramWebhookRouter } from './telegram.js';
import { resendEmailWebhookRouter } from './email-resend.js';
import { emailWebhookRouter } from './email.js';

export const webhooksRouter = Router();

webhooksRouter.use('/telegram', telegramWebhookRouter);
webhooksRouter.use('/email/resend', resendEmailWebhookRouter);
webhooksRouter.use('/email', emailWebhookRouter);
