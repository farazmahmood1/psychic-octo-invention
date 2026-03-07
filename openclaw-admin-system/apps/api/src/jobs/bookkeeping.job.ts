import type { BookkeepingSubAgentInput, BookkeepingSubAgentOutput } from '@openclaw/shared';

/**
 * Job payload for the bookkeeping sub-agent queue.
 * Used when receipt processing is queued for async execution via BullMQ.
 */
export interface BookkeepingJobPayload {
  input: BookkeepingSubAgentInput;
  conversationId: string;
  messageId: string;
  externalUserId?: string;
  sourceChannel?: string;
  subAgentTaskId?: string;
}

export interface BookkeepingJobResult {
  success: boolean;
  output: BookkeepingSubAgentOutput | null;
  error: string | null;
}

export function toBookkeepingJobResult(output: BookkeepingSubAgentOutput): BookkeepingJobResult {
  return {
    success: output.success,
    output,
    error: output.error ?? null,
  };
}

export function toBookkeepingJobError(error: Error): BookkeepingJobResult {
  return {
    success: false,
    output: null,
    error: error.message,
  };
}
