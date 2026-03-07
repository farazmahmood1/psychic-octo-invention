import { Router } from 'express';
import type { Request, Response } from 'express';
import { env, logger } from '@openclaw/config';
import { HTTP_STATUS } from '@openclaw/shared';
import type { InboundEmailPayload } from '@openclaw/shared';
import { normalizeInboundEmail } from '../../integrations/email/normalizer.js';
import { emailThreadRepository } from '../../repositories/email-thread.repository.js';
import { executeEvent } from '../../orchestration/index.js';
import { deliverToEmail } from '../../services/channels/index.js';
import { ensureReplySubject, buildReferencesHeader } from '../../integrations/email/client.js';

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
    const secretHeader = req.headers['x-email-webhook-secret'];
    if (secretHeader !== env.INBOUND_EMAIL_WEBHOOK_SECRET) {
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

    // 6. Process the email asynchronously
    processInboundEmail(payload).catch((err) => {
      logger.error({ err, from: payload.from, subject: payload.subject }, 'Email webhook processing error');
    });
  },
);

/**
 * Async email processing pipeline.
 * Separated from the webhook handler to allow immediate 200 response.
 */
async function processInboundEmail(payload: InboundEmailPayload): Promise<void> {
  // 1. Normalize into InboundEvent
  const event = normalizeInboundEmail(payload);
  if (!event) {
    logger.debug({ from: payload.from, subject: payload.subject }, 'Email skipped: could not normalize');
    return;
  }

  try {
    // 2. Run orchestration pipeline
    const result = await executeEvent(event);

    // 3. Persist email thread mapping
    persistEmailThreadMapping(result.conversationId, payload, result.messageId).catch((err) => {
      logger.warn({ err, from: payload.from }, 'Failed to persist email thread mapping');
    });

    // 4. Deliver reply via SMTP
    if (result.reply) {
      const fromAddress = (event.metadata['emailFrom'] as string) ?? payload.from;
      const subject = ensureReplySubject(payload.subject ?? '(no subject)');
      const references = buildReferencesHeader(
        payload.references,
        payload.messageId,
      );

      const deliveryResult = await deliverToEmail(
        result.conversationId,
        result.messageId,
        result.reply,
        [fromAddress], // Reply to the sender
        undefined,     // No CC on auto-reply
        subject,
        payload.messageId, // In-Reply-To
        references,
      );

      if (!deliveryResult.success) {
        logger.error(
          { conversationId: result.conversationId, error: deliveryResult.error },
          'Email reply delivery failed',
        );
      }
    }

    if (result.warnings.length > 0) {
      logger.warn(
        { warnings: result.warnings, conversationId: result.conversationId },
        'Email orchestration completed with warnings',
      );
    }
  } catch (err) {
    logger.error(
      { err, from: payload.from, subject: payload.subject },
      'Email processing pipeline error',
    );
  }
}

/**
 * Persist the email thread mapping for the conversation.
 * Creates or updates the EmailThread and EmailMessage records.
 */
async function persistEmailThreadMapping(
  conversationId: string,
  payload: InboundEmailPayload,
  internalMessageId: string,
): Promise<void> {
  const fromAddress = payload.from.toLowerCase();
  const toAddresses = (payload.to ?? []).map((a) => a.toLowerCase());
  const ccAddresses = (payload.cc ?? []).map((a) => a.toLowerCase());
  const subject = payload.subject ?? '(no subject)';

  // Resolve thread ID from references chain
  const threadId = payload.references
    ? payload.references.split(/\s+/).filter(Boolean)[0]
    : payload.inReplyTo ?? payload.messageId;

  // Upsert the email thread
  const emailThread = await emailThreadRepository.upsert({
    conversationId,
    subject,
    threadId: threadId ?? undefined,
    fromAddress,
    toAddresses,
    lastMessageAt: new Date(),
    metadata: {
      ccAddresses,
    },
  });

  // Create the email message record
  await emailThreadRepository.createEmailMessage({
    emailThreadId: emailThread.id,
    messageId: internalMessageId,
    providerEmailId: payload.messageId ?? undefined,
    inReplyTo: payload.inReplyTo ?? undefined,
    fromAddress,
    toAddresses,
    ccAddresses,
    subject,
    bodyText: payload.textBody,
    bodyHtml: payload.htmlBody,
    headers: payload.headers as any,
  });
}

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
