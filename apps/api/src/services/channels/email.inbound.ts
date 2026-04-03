import { HTTP_STATUS } from '@nexclaw/shared';
import type { InboundEmailPayload } from '@nexclaw/shared';
import { logger } from '@nexclaw/config';
import { emailThreadRepository } from '../../repositories/email-thread.repository.js';
import { enqueueEmailProcessing } from '../../workers/email-processing.worker.js';

export interface InboundEmailAcceptanceResult {
  statusCode: number;
  body: { ok: true } | { error: string };
}

const processedEmailIds = new Set<string>();
const MAX_PROCESSED_IDS = 10_000;

export async function acceptInboundEmailPayload(
  payload: InboundEmailPayload,
): Promise<InboundEmailAcceptanceResult> {
  if (!payload || !payload.from || !payload.to?.length) {
    logger.warn('Email webhook: invalid payload structure');
    return {
      statusCode: HTTP_STATUS.BAD_REQUEST,
      body: { error: 'Invalid email payload' },
    };
  }

  const dedupeKey = payload.messageId ?? `${payload.from}:${payload.subject}:${payload.timestamp}`;
  if (processedEmailIds.has(dedupeKey)) {
    logger.debug({ dedupeKey }, 'Email webhook: duplicate email, skipping');
    return {
      statusCode: HTTP_STATUS.OK,
      body: { ok: true },
    };
  }

  trackEmailId(dedupeKey);

  if (payload.messageId) {
    const existing = await emailThreadRepository.findEmailMessageByProviderEmailId(payload.messageId);
    if (existing) {
      logger.debug({ messageId: payload.messageId }, 'Email webhook: already processed (DB match)');
      return {
        statusCode: HTTP_STATUS.OK,
        body: { ok: true },
      };
    }
  }

  enqueueEmailProcessing({
    payload,
    idempotencyKey: dedupeKey,
    receivedAt: new Date().toISOString(),
  }).catch((err) => {
    logger.error({ err, from: payload.from, subject: payload.subject }, 'Email webhook processing error');
  });

  return {
    statusCode: HTTP_STATUS.OK,
    body: { ok: true },
  };
}

export function resetInboundEmailIdCacheForTest(): void {
  processedEmailIds.clear();
}

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
