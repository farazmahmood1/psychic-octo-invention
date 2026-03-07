import { logger } from '@openclaw/config';
import type { FollowUpJobPayload, FollowUpJobResult } from '../jobs/followup.job.js';
import { toFollowUpJobResult, toFollowUpJobError } from '../jobs/followup.job.js';
import { executeFollowUpTask } from '../services/subagents/index.js';
import { subAgentTaskRepository } from '../repositories/sub-agent-task.repository.js';

/**
 * Process a lead follow-up sub-agent job.
 *
 * In BullMQ integration phase:
 *   const worker = new Worker(QUEUES.FOLLOWUP, processFollowUpJob, { connection });
 */
export async function processFollowUpJob(
  payload: FollowUpJobPayload,
): Promise<FollowUpJobResult> {
  logger.info(
    { action: payload.input.action, conversationId: payload.conversationId },
    'Processing follow-up job',
  );

  // Update task status to running
  if (payload.subAgentTaskId) {
    await subAgentTaskRepository.updateStatus(payload.subAgentTaskId, 'running').catch((err) => {
      logger.warn({ err }, 'Failed to update follow-up task to running');
    });
  }

  try {
    const output = await executeFollowUpTask(payload.input, {
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
        logger.warn({ err }, 'Failed to update follow-up task status');
      });
    }

    return toFollowUpJobResult(output);
  } catch (err) {
    const error = err instanceof Error ? err : new Error(String(err));
    logger.error(
      { err: error, action: payload.input.action, conversationId: payload.conversationId },
      'Follow-up job failed',
    );

    if (payload.subAgentTaskId) {
      subAgentTaskRepository.updateStatus(payload.subAgentTaskId, 'failed', {
        errorDetails: { message: error.message },
      }).catch((logErr) => {
        logger.warn({ err: logErr }, 'Failed to update follow-up task to failed');
      });
    }

    return toFollowUpJobError(error);
  }
}

/**
 * Enqueue a follow-up job.
 * Currently processes synchronously. When BullMQ is wired:
 *   await followUpQueue.add('process', payload);
 */
export async function enqueueFollowUpJob(
  payload: FollowUpJobPayload,
): Promise<FollowUpJobResult> {
  return processFollowUpJob(payload);
}
