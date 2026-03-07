import type { GhlSubAgentInput, GhlSubAgentOutput } from '@openclaw/shared';

/**
 * Job payload for the GHL sub-agent queue.
 * Used when sub-agent tasks are queued for async execution via BullMQ.
 */
export interface GhlSubAgentJobPayload {
  input: GhlSubAgentInput;
  conversationId: string;
  messageId: string;
  subAgentTaskId?: string;
}

export interface GhlSubAgentJobResult {
  success: boolean;
  output: GhlSubAgentOutput | null;
  error: string | null;
}

export function toGhlJobResult(output: GhlSubAgentOutput): GhlSubAgentJobResult {
  return {
    success: output.success,
    output,
    error: output.error ?? null,
  };
}

export function toGhlJobError(error: Error): GhlSubAgentJobResult {
  return {
    success: false,
    output: null,
    error: error.message,
  };
}
