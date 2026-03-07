import { logger } from '@openclaw/config';
import type { OrchestrationJobPayload, OrchestrationJobResult } from '../jobs/index.js';
import { toJobResult, toJobError } from '../jobs/index.js';
import { executeEvent } from '../orchestration/index.js';

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
  // In production with BullMQ:
  //   await orchestrationQueue.add('process', { event, idempotencyKey });
  //   return { success: true, ... }; // result comes async
  //
  // For now, process synchronously:
  return processOrchestrationJob({ event, idempotencyKey });
}
