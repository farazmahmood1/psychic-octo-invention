import { logger } from '@nexclaw/config';
import type { Prisma } from '@prisma/client';
import type { EmailProcessingJobPayload, EmailProcessingJobResult } from '../jobs/email-processing.job.js';
import { toEmailJobResult, toEmailJobError } from '../jobs/email-processing.job.js';
import { normalizeInboundEmail } from '../integrations/email/normalizer.js';
import { normalizeMailboxAddress, normalizeMailboxList } from '../integrations/email/address.js';
import { executeEvent } from '../orchestration/index.js';
import { deliverToEmail } from '../services/channels/index.js';
import { emailThreadRepository } from '../repositories/email-thread.repository.js';
import { ensureReplySubject, buildReferencesHeader } from '../integrations/email/client.js';
import { jobRepository } from '../repositories/job.repository.js';
import { QUEUES } from '../jobs/index.js';

const EMAIL_SLA_MS = 15 * 60 * 1000;
const RETRY_BASE_DELAY_MS = 60 * 1000;
const RETRY_MAX_DELAY_MS = 10 * 60 * 1000;

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
  const { payload, idempotencyKey, receivedAt } = jobPayload;
  const latencyMs = Date.now() - new Date(receivedAt).getTime();

  logger.info(
    { from: payload.from, subject: payload.subject, idempotencyKey, queueLatencyMs: latencyMs },
    'Processing email job',
  );

  if (Number.isFinite(latencyMs) && latencyMs > EMAIL_SLA_MS) {
    logger.warn(
      { idempotencyKey, queueLatencyMs: latencyMs, receivedAt },
      'Email processing started after SLA window',
    );
  }

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
      const fromAddress = normalizeMailboxAddress(payload.from) ?? payload.from.trim().toLowerCase();
      const replyToAddress = normalizeMailboxList(payload.to)[0];
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
        replyToAddress,
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
 * Persists a Job record and schedules immediate in-process execution.
 * A startup recovery sweep replays pending jobs after restarts.
 * When BullMQ is fully wired:
 *   await emailQueue.add('process', payload, { jobId: idempotencyKey });
 */
export async function enqueueEmailProcessing(
  payload: EmailProcessingJobPayload,
): Promise<EmailProcessingJobResult> {
  const existing = await jobRepository.findByQueueAndIdempotency(
    QUEUES.EMAIL_PROCESSING,
    payload.idempotencyKey,
  );
  if (existing) {
    logger.debug(
      { idempotencyKey: payload.idempotencyKey, existingJobId: existing.id, status: existing.status },
      'Skipping duplicate email enqueue due to existing persisted job',
    );
    return {
      success: true,
      conversationId: null,
      messageId: null,
      replySent: false,
      error: null,
    };
  }

  const job = await jobRepository.create({
    queueName: QUEUES.EMAIL_PROCESSING,
    jobType: 'process_inbound_email',
    payload: payload as unknown as Prisma.InputJsonValue,
  });

  void runPersistedEmailJob(job.id, payload);

  return {
    success: true,
    conversationId: null,
    messageId: null,
    replySent: false,
    error: null,
  };
}

export async function resumePendingEmailJobs(limit = 100): Promise<number> {
  const recoverable = await jobRepository.listRecoverable(QUEUES.EMAIL_PROCESSING, limit);
  let resumed = 0;

  for (const job of recoverable) {
    const payload = parsePersistedPayload(job.payload);
    if (!payload) {
      await jobRepository.markFailed(job.id, {
        message: 'Invalid persisted email job payload',
      }).catch((err) => {
        logger.error({ err, jobId: job.id }, 'Failed to mark invalid persisted email job');
      });
      continue;
    }

    resumed += 1;
    void runPersistedEmailJob(job.id, payload);
  }

  return resumed;
}

async function runPersistedEmailJob(jobId: string, payload: EmailProcessingJobPayload): Promise<void> {
  try {
    const claimed = await jobRepository.claimForRun(jobId);
    if (!claimed) {
      logger.debug({ jobId }, 'Email job was already claimed by another worker');
      return;
    }
  } catch (err) {
    logger.error({ err, jobId }, 'Failed to claim email job for running');
    return;
  }

  const result = await processEmailJob(payload);

  if (result.success) {
    await jobRepository.markCompleted(jobId, result as unknown as Prisma.InputJsonValue).catch((err) => {
      logger.error({ err, jobId }, 'Failed to mark email job as completed');
    });
    return;
  }

  const latest = await jobRepository.findById(jobId).catch((err) => {
    logger.error({ err, jobId }, 'Failed to fetch email job state for retry decision');
    return null;
  });

  const errorMessage = result.error ?? 'Unknown email processing failure';
  if (latest && latest.attempts < latest.maxAttempts) {
    const retryDelayMs = computeRetryDelayMs(latest.attempts);
    await jobRepository.markRetrying(jobId, { message: errorMessage }).catch((err) => {
      logger.error({ err, jobId }, 'Failed to mark email job as retrying');
    });

    logger.warn(
      {
        jobId,
        attempts: latest.attempts,
        maxAttempts: latest.maxAttempts,
        retryDelayMs,
      },
      'Email job failed and will be retried',
    );

    scheduleEmailRetry(jobId, payload, retryDelayMs);
    return;
  }

  await jobRepository.markFailed(jobId, {
    message: errorMessage,
  }).catch((err) => {
    logger.error({ err, jobId }, 'Failed to mark email job as failed');
  });
}

function parsePersistedPayload(payload: unknown): EmailProcessingJobPayload | null {
  if (!payload || typeof payload !== 'object') return null;

  const candidate = payload as Record<string, unknown>;
  const message = candidate['payload'];
  const idempotencyKey = candidate['idempotencyKey'];
  const receivedAt = candidate['receivedAt'];

  if (!message || typeof message !== 'object') return null;
  if (typeof idempotencyKey !== 'string' || idempotencyKey.length === 0) return null;
  if (typeof receivedAt !== 'string' || receivedAt.length === 0) return null;

  return {
    payload: message as EmailProcessingJobPayload['payload'],
    idempotencyKey,
    receivedAt,
  };
}

async function persistEmailThread(
  conversationId: string,
  payload: EmailProcessingJobPayload['payload'],
  internalMessageId: string,
): Promise<void> {
  const fromAddress = normalizeMailboxAddress(payload.from) ?? payload.from.trim().toLowerCase();
  const toAddresses = normalizeMailboxList(payload.to);
  const ccAddresses = normalizeMailboxList(payload.cc);
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
    headers: (payload.headers ?? null) as Prisma.InputJsonValue,
  });
}

function computeRetryDelayMs(attempts: number): number {
  const exponent = Math.max(0, attempts - 1);
  const delay = RETRY_BASE_DELAY_MS * (2 ** exponent);
  return Math.min(delay, RETRY_MAX_DELAY_MS);
}

function scheduleEmailRetry(
  jobId: string,
  payload: EmailProcessingJobPayload,
  delayMs: number,
): void {
  const timer = setTimeout(() => {
    void runPersistedEmailJob(jobId, payload);
  }, delayMs);
  timer.unref();
}
