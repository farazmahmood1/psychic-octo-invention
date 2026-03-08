import { logger } from '@openclaw/config';
import { QUEUES, toJobResult, toJobError, type OrchestrationJobPayload, type OrchestrationJobResult } from '../jobs/index.js';
import { executeEvent } from '../orchestration/index.js';
import { getQueue } from '../queues/index.js';

/**
 * Process an orchestration job.
 *
 * This function is the worker handler for the orchestration queue.
 * In the BullMQ integration phase, this will be called by a Bull worker:
 *
 *   const worker = new Worker(QUEUES.ORCHESTRATION, processOrchestrationJob, { connection });
 *
 * For now, it can also be called directly for synchronous processing.
 */
export async function processOrchestrationJob(
  payload: OrchestrationJobPayload,
): Promise<OrchestrationJobResult> {
  const { event } = payload;

  logger.info(
    { channel: event.channel, threadId: event.externalThreadId, userId: event.externalUserId },
    'Processing orchestration job',
  );

  try {
    const result = await executeEvent(event);

    if (result.warnings.length > 0) {
      logger.warn({ warnings: result.warnings, conversationId: result.conversationId }, 'Orchestration completed with warnings');
    }

    logger.info(
      { conversationId: result.conversationId, model: result.routing.model, tier: result.routing.tier },
      'Orchestration completed',
    );

    return toJobResult(result);
  } catch (err) {
    const error = err instanceof Error ? err : new Error(String(err));
    logger.error(
      { err: error, channel: event.channel, threadId: event.externalThreadId },
      'Orchestration job failed',
    );
    return toJobError(error);
  }
}

/**
 * Enqueue an inbound event for async processing.
 * This is a placeholder — actual queue integration happens when BullMQ is wired.
 * For now, it processes synchronously (suitable for development/testing).
 */
export async function enqueueOrchestration(
  event: OrchestrationJobPayload['event'],
  idempotencyKey?: string,
): Promise<OrchestrationJobResult> {
  const queue = getQueue(QUEUES.ORCHESTRATION);
  if (queue) {
    await queue.add(
      'process',
      { event, idempotencyKey },
      {
        ...(idempotencyKey ? { jobId: `orchestration:${idempotencyKey}` } : {}),
      },
    );

    return {
      success: true,
      conversationId: null,
      messageId: null,
      model: null,
      warnings: [],
      error: null,
    };
  }

  return processOrchestrationJob({ event, idempotencyKey });
}
