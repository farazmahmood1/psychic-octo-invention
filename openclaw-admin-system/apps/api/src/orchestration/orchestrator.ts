import { logger } from '@openclaw/config';
import type {
  InboundEvent,
  ExecutionResult,
  MemoryFact,
  ToolDispatch,
  SubAgentDispatch,
} from '@openclaw/shared';
import { providerRegistry } from '../services/llm/index.js';
import { routeModel, escalateModel } from '../services/routing/index.js';
import { retrieveMemories, extractAndStoreMemories } from '../services/memory/index.js';
import { composePrompt, contextToMessages } from './prompt-composer.js';
import { resolveConversation, persistMessages, loadRecentMessages } from './conversation-manager.js';
import { persistUsageLog } from './usage-tracker.js';
import { resolveTools } from './tool-resolver.js';
import { processSubAgentCalls, isSubAgentToolCall } from './sub-agent-dispatcher.js';

/**
 * Orchestrator — the central execution pipeline for processing inbound events.
 *
 * Pipeline steps:
 *   1. Resolve or create conversation
 *   2. Persist the inbound message
 *   3. Retrieve relevant memories
 *   4. Resolve available tools/skills
 *   5. Route to the appropriate model
 *   6. Compose prompt (system + memories + history + user message)
 *   7. Call the LLM provider
 *   8. Handle tool calls — execute sub-agent dispatches, collect results
 *   8b. If sub-agent calls were executed, follow up with LLM for final reply
 *   9. Persist the assistant reply
 *  10. Extract and store new memories
 *  11. Log usage metrics
 *  12. Return ExecutionResult
 *
 * Design principles:
 * - Provider failures return a graceful error reply, never crash the pipeline
 * - Memory/usage logging failures are warnings, not blockers
 * - Sub-agent tool calls are executed synchronously and their results fed back to the LLM
 * - The pipeline is synchronous per-event (async orchestration via job queue wraps this)
 */
export async function executeEvent(event: InboundEvent): Promise<ExecutionResult> {
  const warnings: string[] = [];

  // 1. Resolve or create conversation
  const { conversationId, participantId } = await resolveConversation(event);

  // 2. Persist inbound message
  const inboundMessageId = await persistMessages.inbound(event, conversationId, participantId);

  // 3. Retrieve memories (failure = warning, not error)
  const memories = await retrieveMemories(event, conversationId);

  // 4. Resolve available tools
  const tools = await resolveTools();

  // 5. Route to model
  let routing = await routeModel(event, tools);

  // 6. Compose prompt
  const recentMessages = await loadRecentMessages(conversationId);
  const promptContext = composePrompt({
    event,
    memories,
    recentMessages,
    tools,
  });
  const messages = contextToMessages(promptContext);

  // 7. Call LLM
  const provider = providerRegistry.getDefault();
  let response;
  try {
    response = await provider.complete({
      model: routing.model,
      messages,
      tools: tools.length > 0 ? tools : undefined,
      temperature: 0.7,
    });
  } catch (err) {
    // Try escalation on provider failure if not already at strongest
    logger.error({ err, model: routing.model }, 'LLM provider failed');

    const escalated = await escalateModel(routing, event, tools);
    if (escalated) {
      routing = escalated;
      warnings.push(`Primary model failed, escalated to ${routing.model}`);
      try {
        response = await provider.complete({
          model: routing.model,
          messages,
          tools: tools.length > 0 ? tools : undefined,
          temperature: 0.7,
        });
      } catch (retryErr) {
        logger.error({ err: retryErr, model: routing.model }, 'Escalated model also failed');
        return buildErrorResult(conversationId, inboundMessageId, routing, err as Error);
      }
    } else {
      return buildErrorResult(conversationId, inboundMessageId, routing, err as Error);
    }
  }

  // 8. Handle tool calls — execute sub-agent dispatches
  const allToolDispatches: ToolDispatch[] = [];
  const allSubAgentDispatches: SubAgentDispatch[] = [];

  const subAgentToolCalls = response.toolCalls.filter((tc) => isSubAgentToolCall(tc.name));
  const externalToolCalls = response.toolCalls.filter((tc) => !isSubAgentToolCall(tc.name));

  // Mark external tool calls as pending (handled by future skill execution layer)
  for (const tc of externalToolCalls) {
    allToolDispatches.push({
      toolName: tc.name,
      arguments: safeParseJson(tc.arguments),
      status: 'pending',
    });
  }

  // Execute sub-agent tool calls synchronously
  let finalReply = response.content;
  if (subAgentToolCalls.length > 0) {
    try {
      const subAgentResults = await processSubAgentCalls(subAgentToolCalls, {
        conversationId,
        externalUserId: event.externalUserId,
        sourceChannel: event.channel,
        sourceMessageId: inboundMessageId,
      });
      allToolDispatches.push(...subAgentResults.toolDispatches);
      allSubAgentDispatches.push(...subAgentResults.subAgentDispatches);

      // 8b. Follow up with LLM — feed tool results back for the final user-facing reply
      if (subAgentResults.toolResults.length > 0) {
        const followUpMessages = [
          ...messages,
          // The assistant's tool-calling message
          { role: 'assistant' as const, content: response.content || '' },
          // Tool result messages
          ...subAgentResults.toolResults.map((tr) => ({
            role: 'tool' as const,
            content: tr.result,
            toolCallId: tr.toolCallId,
          })),
        ];

        try {
          const followUp = await provider.complete({
            model: routing.model,
            messages: followUpMessages,
            temperature: 0.7,
          });
          finalReply = followUp.content;

          // Accumulate usage from follow-up call
          response.usage.promptTokens += followUp.usage.promptTokens;
          response.usage.completionTokens += followUp.usage.completionTokens;
          response.usage.totalTokens += followUp.usage.totalTokens;
          if (response.usage.estimatedCostUsd !== null && followUp.usage.estimatedCostUsd !== null) {
            response.usage.estimatedCostUsd += followUp.usage.estimatedCostUsd;
          }
          response.latencyMs += followUp.latencyMs;
        } catch (followUpErr) {
          // If follow-up fails, use the sub-agent summary directly
          logger.warn({ err: followUpErr }, 'Follow-up LLM call after sub-agent failed');
          warnings.push('Follow-up LLM call failed, using sub-agent result directly');
          const summaries = subAgentResults.toolResults.map((tr) => tr.result);
          finalReply = summaries.join('\n\n');
        }
      }
    } catch (err) {
      logger.error({ err }, 'Sub-agent dispatch failed');
      warnings.push('Sub-agent dispatch failed');
    }
  }

  // 9. Persist assistant reply
  const replyMessageId = await persistMessages.outbound(
    finalReply,
    conversationId,
    inboundMessageId,
  );

  // 10. Extract and store memories (failure = warning)
  let memoryWrites: MemoryFact[] = [];
  try {
    memoryWrites = await extractAndStoreMemories(
      event,
      response,
      conversationId,
      replyMessageId,
    );
  } catch (err) {
    warnings.push('Memory extraction failed');
    logger.warn({ err }, 'Memory extraction failed');
  }

  // 11. Log usage (failure = warning, must not break reply path)
  try {
    await persistUsageLog({
      messageId: replyMessageId,
      provider: routing.provider,
      model: response.model,
      requestType: subAgentToolCalls.length > 0 ? 'chat_completion_with_tools' : 'chat_completion',
      promptTokens: response.usage.promptTokens,
      completionTokens: response.usage.completionTokens,
      totalTokens: response.usage.totalTokens,
      costUsd: response.usage.estimatedCostUsd,
      latencyMs: response.latencyMs,
      routingDecision: routing,
    });
  } catch (err) {
    warnings.push('Usage logging failed');
    logger.warn({ err }, 'Usage logging failed');
  }

  // 12. Return result
  return {
    reply: finalReply,
    memoryWrites,
    usage: response.usage,
    routing,
    toolDispatches: allToolDispatches,
    subAgentDispatches: allSubAgentDispatches,
    conversationId,
    messageId: replyMessageId,
    warnings,
  };
}

function buildErrorResult(
  conversationId: string,
  messageId: string,
  routing: ExecutionResult['routing'],
  error: Error,
): ExecutionResult {
  return {
    reply: "I'm sorry, I'm having trouble processing your request right now. Please try again in a moment.",
    memoryWrites: [],
    usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0, estimatedCostUsd: null },
    routing,
    toolDispatches: [],
    subAgentDispatches: [],
    conversationId,
    messageId,
    warnings: [`Provider error: ${error.message}`],
  };
}

function safeParseJson(str: string): Record<string, unknown> {
  try {
    return JSON.parse(str) as Record<string, unknown>;
  } catch {
    return { raw: str };
  }
}
