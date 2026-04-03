import type { FollowUpSubAgentInput, FollowUpSubAgentOutput } from '@nexclaw/shared';

/**
 * Job payload for the lead follow-up sub-agent queue.
 * Used when follow-up tasks are queued for async execution via BullMQ.
 */
export interface FollowUpJobPayload {
  input: FollowUpSubAgentInput;
  conversationId: string;
  messageId: string;
  externalUserId?: string;
  sourceChannel?: string;
  subAgentTaskId?: string;
}

export interface FollowUpJobResult {
  success: boolean;
  output: FollowUpSubAgentOutput | null;
  error: string | null;
}

export function toFollowUpJobResult(output: FollowUpSubAgentOutput): FollowUpJobResult {
  return {
    success: output.success,
    output,
    error: output.error ?? null,
  };
}

export function toFollowUpJobError(error: Error): FollowUpJobResult {
  return {
    success: false,
    output: null,
    error: error.message,
  };
}
