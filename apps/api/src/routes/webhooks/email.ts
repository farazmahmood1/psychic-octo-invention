import { Router } from 'express';
import type { Request, Response } from 'express';
import { env, logger } from '@openclaw/config';
import { HTTP_STATUS } from '@openclaw/shared';
import type { InboundEmailPayload } from '@openclaw/shared';
import { emailThreadRepository } from '../../repositories/email-thread.repository.js';
import { enqueueEmailProcessing } from '../../workers/email-processing.worker.js';

export const emailWebhookRouter = Router();

/**
 * Processed inbound email IDs for idempotency within the process lifetime.
 * In production with BullMQ, idempotency is handled by the job queue.
 */
const processedEmailIds = new Set<string>();
const MAX_PROCESSED_IDS = 10_000;

/**
 * POST /webhooks/email
 *
 * Inbound email webhook endpoint. Handles parsed emails from providers
 * (SendGrid Inbound Parse, Mailgun, etc.).
 *
 * Security:
 * - Validates X-Email-Webhook-Secret header against INBOUND_EMAIL_WEBHOOK_SECRET
 * - No session/CSRF required (external webhook)
 *
 * Design:
 * - Validates and normalizes the email payload
 * - Runs orchestration pipeline asynchronously (reliable, not instant)
 * - Persists email thread mapping
 * - Delivers reply back via SMTP
 * - Responds 200 to provider immediately to prevent retries
 * - SLA target: reply within 15 minutes
 */
emailWebhookRouter.post(
  '/',
  async (req: Request, res: Response) => {
    // 1. Validate webhook secret
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

    // 2. Basic payload validation
    if (!payload || !payload.from || !payload.to?.length) {
      logger.warn('Email webhook: invalid payload structure');
      res.status(HTTP_STATUS.BAD_REQUEST).json({ error: 'Invalid email payload' });
      return;
    }

    // 3. Idempotency check — prevent duplicate processing
    const dedupeKey = payload.messageId ?? `${payload.from}:${payload.subject}:${payload.timestamp}`;
    if (processedEmailIds.has(dedupeKey)) {
      logger.debug({ dedupeKey }, 'Email webhook: duplicate email, skipping');
      res.status(HTTP_STATUS.OK).json({ ok: true });
      return;
    }

    // Mark as processed immediately
    trackEmailId(dedupeKey);

    // 4. Check for duplicate by provider email ID
    if (payload.messageId) {
      const existing = await emailThreadRepository.findEmailMessageByProviderEmailId(payload.messageId);
      if (existing) {
        logger.debug({ messageId: payload.messageId }, 'Email webhook: already processed (DB match)');
        res.status(HTTP_STATUS.OK).json({ ok: true });
        return;
      }
    }

    // 5. Respond 200 immediately — process asynchronously
    // This ensures the provider doesn't retry while we process
    res.status(HTTP_STATUS.OK).json({ ok: true });

    // 6. Enqueue for async worker processing
    enqueueEmailProcessing({
      payload,
      idempotencyKey: dedupeKey,
      receivedAt: new Date().toISOString(),
    }).catch((err) => {
      logger.error({ err, from: payload.from, subject: payload.subject }, 'Email webhook processing error');
    });
  },
);

/**
 * Track processed email IDs with bounded memory.
 */
function trackEmailId(emailId: string): void {
  processedEmailIds.add(emailId);

  if (processedEmailIds.size > MAX_PROCESSED_IDS) {
    const iterator = processedEmailIds.values();
    const toRemove = processedEmailIds.size - MAX_PROCESSED_IDS + 1000;
    for (let i = 0; i < toRemove; i++) {
      const value = iterator.next().value;
      if (value !== undefined) {
        processedEmailIds.delete(value);
      }
    }
  }
}
