import { logger } from '@nexclaw/config';
import type { ChannelDeliveryPayload } from '../jobs/channel-delivery.job.js';
import type { ChannelDeliveryJobResult } from '../jobs/channel-delivery.job.js';
import { toDeliveryResult, toDeliveryError } from '../jobs/channel-delivery.job.js';
import { deliverToTelegram, deliverToEmail } from '../services/channels/index.js';
import { QUEUES } from '../jobs/index.js';
import { getQueue } from '../queues/index.js';

/**
 * Process a channel delivery job.
 *
 * Routes to the appropriate channel sender based on the payload.
 * In BullMQ integration phase:
 *   const worker = new Worker(QUEUES.CHANNEL_DELIVERY, processDeliveryJob, { connection });
 */
export async function processDeliveryJob(
  payload: ChannelDeliveryPayload,
): Promise<ChannelDeliveryJobResult> {
  logger.info(
    { channel: payload.channel, conversationId: payload.conversationId, messageId: payload.messageId },
    'Processing channel delivery job',
  );

  try {
    switch (payload.channel) {
      case 'telegram': {
        const result = await deliverToTelegram(
          payload.conversationId,
          payload.messageId,
          payload.content,
          payload.telegramChatId,
          payload.telegramReplyToMessageId,
        );
        return toDeliveryResult(result);
      }

      case 'email': {
        const result = await deliverToEmail(
          payload.conversationId,
          payload.messageId,
          payload.content,
          payload.emailTo,
          payload.emailCc,
          payload.emailSubject,
          payload.emailInReplyTo,
          payload.emailReferences,
        );
        return toDeliveryResult(result);
      }

      default:
        return { success: false, externalMessageId: null, error: 'Unknown channel' };
    }
  } catch (err) {
    const error = err instanceof Error ? err : new Error(String(err));
    logger.error(
      { err: error, channel: payload.channel, conversationId: payload.conversationId },
      'Channel delivery job failed',
    );
    return toDeliveryError(error);
  }
}

/**
 * Enqueue a channel delivery job.
 * Currently processes synchronously. When BullMQ is wired:
 *   await deliveryQueue.add('deliver', payload);
 */
export async function enqueueDelivery(
  payload: ChannelDeliveryPayload,
  options?: { waitForResult?: boolean },
): Promise<ChannelDeliveryJobResult> {
  const waitForResult = options?.waitForResult === true;
  const queue = getQueue(QUEUES.CHANNEL_DELIVERY);

  if (queue && !waitForResult) {
    const dedupeKey = `${payload.channel}:${payload.conversationId}:${payload.messageId}`;
    await queue.add(
      'deliver',
      payload,
      {
        jobId: `delivery:${dedupeKey}`,
      },
    );

    return {
      success: true,
      externalMessageId: null,
      error: null,
    };
  }

  return processDeliveryJob(payload);
}
