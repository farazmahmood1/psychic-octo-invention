import { logger } from '@nexclaw/config';
import { GHL_CRM_TOOL_NAME } from '@nexclaw/shared';
import type { GhlSubAgentJobPayload, GhlSubAgentJobResult } from '../jobs/ghl-sub-agent.job.js';
import { toGhlJobResult, toGhlJobError } from '../jobs/ghl-sub-agent.job.js';
import { executeGhlTask } from '../services/subagents/index.js';
import { subAgentTaskRepository } from '../repositories/sub-agent-task.repository.js';
import { getFirstPartyToolSettings, isFirstPartyToolEnabled } from '../services/settings.service.js';

/**
 * Process a GHL sub-agent job.
 *
 * In BullMQ integration phase:
 *   const worker = new Worker(QUEUES.GHL_SUB_AGENT, processGhlSubAgentJob, { connection });
 */
export async function processGhlSubAgentJob(
  payload: GhlSubAgentJobPayload,
): Promise<GhlSubAgentJobResult> {
  const disabledError = await resolveDisabledToolError(GHL_CRM_TOOL_NAME, payload.subAgentTaskId);
  if (disabledError) {
    return disabledError;
  }

  logger.info(
    { action: payload.input.action, conversationId: payload.conversationId },
    'Processing GHL sub-agent job',
  );

  // Update task status to running
  if (payload.subAgentTaskId) {
    await subAgentTaskRepository.updateStatus(payload.subAgentTaskId, 'running').catch((err) => {
      logger.warn({ err }, 'Failed to update sub-agent task to running');
    });
  }

  try {
    const output = await executeGhlTask(payload.input);

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
        logger.warn({ err }, 'Failed to update sub-agent task status');
      });
    }

    return toGhlJobResult(output);
  } catch (err) {
    const error = err instanceof Error ? err : new Error(String(err));
    logger.error(
      { err: error, action: payload.input.action, conversationId: payload.conversationId },
      'GHL sub-agent job failed',
    );

    if (payload.subAgentTaskId) {
      subAgentTaskRepository.updateStatus(payload.subAgentTaskId, 'failed', {
        errorDetails: { message: error.message },
      }).catch((logErr) => {
        logger.warn({ err: logErr }, 'Failed to update sub-agent task to failed');
      });
    }

    return toGhlJobError(error);
  }
}

/**
 * Enqueue a GHL sub-agent job.
 * Currently processes synchronously. When BullMQ is wired:
 *   await ghlQueue.add('process', payload);
 */
export async function enqueueGhlSubAgentJob(
  payload: GhlSubAgentJobPayload,
): Promise<GhlSubAgentJobResult> {
  return processGhlSubAgentJob(payload);
}

async function resolveDisabledToolError(
  toolName: string,
  subAgentTaskId?: string,
): Promise<GhlSubAgentJobResult | null> {
  const settings = await getFirstPartyToolSettings();
  if (isFirstPartyToolEnabled(toolName, settings)) {
    return null;
  }

  const error = new Error(`${toolName} is currently disabled in admin settings.`);
  logger.warn({ toolName }, 'Blocked queued first-party tool because it is disabled in runtime settings');

  if (subAgentTaskId) {
    await subAgentTaskRepository.updateStatus(subAgentTaskId, 'failed', {
      errorDetails: { message: error.message },
    }).catch((err) => {
      logger.warn({ err, subAgentTaskId }, 'Failed to update disabled queued task status');
    });
  }

  return toGhlJobError(error);
}
