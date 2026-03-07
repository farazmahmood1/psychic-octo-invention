import { logger } from '@openclaw/config';
import type { EmailProcessingJobPayload, EmailProcessingJobResult } from '../jobs/email-processing.job.js';
import { toEmailJobResult, toEmailJobError } from '../jobs/email-processing.job.js';
import { normalizeInboundEmail } from '../integrations/email/normalizer.js';
import { executeEvent } from '../orchestration/index.js';
import { deliverToEmail } from '../services/channels/index.js';
import { emailThreadRepository } from '../repositories/email-thread.repository.js';
import { ensureReplySubject, buildReferencesHeader } from '../integrations/email/client.js';

/**
 * Process an email processing job.
 *
 * Full pipeline: normalize → orchestrate → persist thread → deliver reply.
 *
 * In BullMQ integration phase:
 *   const worker = new Worker(QUEUES.EMAIL_PROCESSING, processEmailJob, { connection });
 */
export async function processEmailJob(
  jobPayload: EmailProcessingJobPayload,
): Promise<EmailProcessingJobResult> {
  const { payload, idempotencyKey } = jobPayload;

  logger.info(
    { from: payload.from, subject: payload.subject, idempotencyKey },
    'Processing email job',
  );

  try {
    // 1. Normalize into InboundEvent
    const event = normalizeInboundEmail(payload);
    if (!event) {
      logger.debug({ from: payload.from }, 'Email job: could not normalize payload');
      return { success: true, conversationId: null, messageId: null, replySent: false, error: null };
    }

    // 2. Run orchestration pipeline
    const result = await executeEvent(event);

    // 3. Persist email thread mapping (fire-and-forget for non-blocking)
    persistEmailThread(result.conversationId, payload, result.messageId).catch((err) => {
      logger.warn({ err, from: payload.from }, 'Failed to persist email thread mapping');
    });

    // 4. Deliver reply via SMTP
    let replySent = false;
    if (result.reply) {
      const fromAddress = payload.from.toLowerCase();
      const subject = ensureReplySubject(payload.subject ?? '(no subject)');
      const references = buildReferencesHeader(payload.references, payload.messageId);

      const deliveryResult = await deliverToEmail(
        result.conversationId,
        result.messageId,
        result.reply,
        [fromAddress],
        undefined,
        subject,
        payload.messageId,
        references,
      );

      replySent = deliveryResult.success;

      if (!deliveryResult.success) {
        logger.error(
          { conversationId: result.conversationId, error: deliveryResult.error },
          'Email reply delivery failed in job',
        );
      }
    }

    if (result.warnings.length > 0) {
      logger.warn(
        { warnings: result.warnings, conversationId: result.conversationId },
        'Email job orchestration completed with warnings',
      );
    }

    return toEmailJobResult({
      conversationId: result.conversationId,
      messageId: result.messageId,
      replySent,
    });
  } catch (err) {
    const error = err instanceof Error ? err : new Error(String(err));
    logger.error(
      { err: error, from: payload.from, subject: payload.subject },
      'Email processing job failed',
    );
    return toEmailJobError(error);
  }
}

/**
 * Enqueue an email for processing.
 * Currently processes synchronously. When BullMQ is wired:
 *   await emailQueue.add('process', payload, { jobId: idempotencyKey });
 */
export async function enqueueEmailProcessing(
  payload: EmailProcessingJobPayload,
): Promise<EmailProcessingJobResult> {
  return processEmailJob(payload);
}

async function persistEmailThread(
  conversationId: string,
  payload: EmailProcessingJobPayload['payload'],
  internalMessageId: string,
): Promise<void> {
  const fromAddress = payload.from.toLowerCase();
  const toAddresses = (payload.to ?? []).map((a) => a.toLowerCase());
  const ccAddresses = (payload.cc ?? []).map((a) => a.toLowerCase());
  const subject = payload.subject ?? '(no subject)';

  const threadId = payload.references
    ? payload.references.split(/\s+/).filter(Boolean)[0]
    : payload.inReplyTo ?? payload.messageId;

  const emailThread = await emailThreadRepository.upsert({
    conversationId,
    subject,
    threadId: threadId ?? undefined,
    fromAddress,
    toAddresses,
    lastMessageAt: new Date(),
    metadata: { ccAddresses },
  });

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
