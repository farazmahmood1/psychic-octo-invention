import { logger } from '@openclaw/config';
import type { BookkeepingJobPayload, BookkeepingJobResult } from '../jobs/bookkeeping.job.js';
import { toBookkeepingJobResult, toBookkeepingJobError } from '../jobs/bookkeeping.job.js';
import { executeBookkeepingTask } from '../services/subagents/bookkeeping/index.js';
import { subAgentTaskRepository } from '../repositories/sub-agent-task.repository.js';

/**
 * Process a bookkeeping sub-agent job.
 *
 * In BullMQ integration phase:
 *   const worker = new Worker(QUEUES.BOOKKEEPING, processBookkeepingJob, { connection });
 */
export async function processBookkeepingJob(
  payload: BookkeepingJobPayload,
): Promise<BookkeepingJobResult> {
  logger.info(
    { action: payload.input.action, conversationId: payload.conversationId },
    'Processing bookkeeping job',
  );

  // Update task status to running
  if (payload.subAgentTaskId) {
    await subAgentTaskRepository.updateStatus(payload.subAgentTaskId, 'running').catch((err) => {
      logger.warn({ err }, 'Failed to update bookkeeping task to running');
    });
  }

  try {
    const output = await executeBookkeepingTask(payload.input, {
      conversationId: payload.conversationId,
      externalUserId: payload.externalUserId,
      sourceChannel: payload.sourceChannel,
      sourceMessageId: payload.messageId,
    });

    // Update task status
    if (payload.subAgentTaskId) {
      subAgentTaskRepository.updateStatus(
        payload.subAgentTaskId,
        output.success ? 'completed' : 'failed',
        {
          output: output as any,
          errorDetails: output.error ? { message: output.error } : undefined,
        },
      ).catch((err) => {
        logger.warn({ err }, 'Failed to update bookkeeping task status');
      });
    }

    return toBookkeepingJobResult(output);
  } catch (err) {
    const error = err instanceof Error ? err : new Error(String(err));
    logger.error(
      { err: error, action: payload.input.action, conversationId: payload.conversationId },
      'Bookkeeping job failed',
    );

    if (payload.subAgentTaskId) {
      subAgentTaskRepository.updateStatus(payload.subAgentTaskId, 'failed', {
        errorDetails: { message: error.message },
      }).catch((logErr) => {
        logger.warn({ err: logErr }, 'Failed to update bookkeeping task to failed');
      });
    }

    return toBookkeepingJobError(error);
  }
}

/**
 * Enqueue a bookkeeping job.
 * Currently processes synchronously. When BullMQ is wired:
 *   await bookkeepingQueue.add('process', payload);
 */
export async function enqueueBookkeepingJob(
  payload: BookkeepingJobPayload,
): Promise<BookkeepingJobResult> {
  return processBookkeepingJob(payload);
}
