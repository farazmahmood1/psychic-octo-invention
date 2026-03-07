import { logger } from '@openclaw/config';
import type { RoutingDecision } from '@openclaw/shared';
import { usageRepository } from '../repositories/usage.repository.js';

/**
 * Persist a usage log entry for an LLM call.
 * This is fire-and-forget from the orchestrator's perspective —
 * failures here must not block the user's reply.
 */
export async function persistUsageLog(params: {
  messageId: string;
  provider: string;
  model: string;
  requestType: string;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  costUsd: number | null;
  latencyMs: number;
  routingDecision: RoutingDecision;
}): Promise<void> {
  try {
    await usageRepository.create({
      messageId: params.messageId,
      provider: params.provider,
      model: params.model,
      requestType: params.requestType,
      promptTokens: params.promptTokens,
      completionTokens: params.completionTokens,
      totalTokens: params.totalTokens,
      costUsd: params.costUsd ?? 0,
      latencyMs: params.latencyMs,
      routingDecision: params.routingDecision as any,
    });
  } catch (err) {
    // Usage logging should never crash the pipeline
    logger.error({ err, messageId: params.messageId }, 'Failed to persist usage log');
    throw err; // Re-throw so orchestrator can catch and add warning
  }
}
