import type { InboundEvent, ExecutionResult } from '@openclaw/shared';

/**
 * Job payload for the orchestration queue.
 * Wraps an InboundEvent with job metadata.
 */
export interface OrchestrationJobPayload {
  event: InboundEvent;
  /** Optional: caller-provided idempotency key to prevent duplicate processing */
  idempotencyKey?: string;
}

/**
 * Job result stored after orchestration completes.
 */
export interface OrchestrationJobResult {
  success: boolean;
  conversationId: string | null;
  messageId: string | null;
  model: string | null;
  warnings: string[];
  error: string | null;
}

/** Convert an ExecutionResult to a storable job result */
export function toJobResult(result: ExecutionResult): OrchestrationJobResult {
  return {
    success: true,
    conversationId: result.conversationId,
    messageId: result.messageId,
    model: result.routing.model,
    warnings: result.warnings,
    error: null,
  };
}

export function toJobError(error: Error): OrchestrationJobResult {
  return {
    success: false,
    conversationId: null,
    messageId: null,
    model: null,
    warnings: [],
    error: error.message,
  };
}
