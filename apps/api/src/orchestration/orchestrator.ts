import { logger } from '@nexclaw/config';
import type {
  InboundEvent,
  ExecutionResult,
  MemoryFact,
  ToolDispatch,
  SubAgentDispatch,
} from '@nexclaw/shared';
import { providerRegistry } from '../services/llm/index.js';
import { routeModel, escalateModel, enforceSpendControls } from '../services/routing/index.js';
import { retrieveMemories, extractAndStoreMemories } from '../services/memory/index.js';
import { composePrompt, contextToMessages } from './prompt-composer.js';
import { resolveConversation, persistMessages, loadRecentMessages } from './conversation-manager.js';
import { persistUsageLog } from './usage-tracker.js';
import { resolveToolCatalog } from './tool-resolver.js';
import { processSubAgentCalls, isSubAgentToolCall } from './sub-agent-dispatcher.js';
import { executeExternalToolCalls } from './external-tool-executor.js';
import { getRoutingSettings } from '../services/settings.service.js';
import { usageRepository } from '../repositories/usage.repository.js';
import { maybeGenerateTitle, maybeCloseConversation } from './post-processing.js';
import { sseHub } from '../services/sse.service.js';

/**
 * Central execution pipeline for processing one inbound event.
 */
export async function executeEvent(event: InboundEvent): Promise<ExecutionResult> {
  const warnings: string[] = [];

  // 1. Resolve or create conversation
  const { conversationId, participantId } = await resolveConversation(event);

  // 2. Persist inbound message
  const inboundMessageId = await persistMessages.inbound(event, conversationId, participantId);

  // 3. Retrieve memories
  const memories = await retrieveMemories(event, conversationId);

  // 4. Resolve available tools
  const toolCatalog = await resolveToolCatalog();
  const tools = toolCatalog.tools;
  const routingSettings = await getRoutingSettings();

  // 5. Route to model
  let routing = await routeModel(event, tools, null, routingSettings);

  // 6. Compose prompt (exclude the just-persisted inbound message to avoid duplication)
  const recentMessages = await loadRecentMessages(conversationId, 20, inboundMessageId);
  const promptContext = composePrompt({
    event,
    memories,
    recentMessages,
    tools,
  });
  const messages = contextToMessages(promptContext);
  const monthlyCostSoFarUsd = routingSettings.maxMonthlyBudgetUsd !== null
    ? await usageRepository.sumCostCurrentMonth()
    : 0;
  let activeRequestCostUsd = 0;

  const initialSpendControl = enforceSpendControls({
    stage: 'initial',
    routing,
    settings: routingSettings,
    messages,
    tools,
    monthlyCostSoFarUsd,
  });
  warnings.push(...initialSpendControl.warnings);
  routing = initialSpendControl.routing;

  if (initialSpendControl.blockedReply) {
    return buildSpendLimitedResult(
      conversationId,
      inboundMessageId,
      routing,
      initialSpendControl.blockedReply,
      warnings,
      initialSpendControl.estimatedCostUsd,
    );
  }

  // 7. Call LLM
  const provider = providerRegistry.getDefault();
  let response;
  try {
    response = await provider.complete({
      model: routing.model,
      messages,
      tools: tools.length > 0 ? tools : undefined,
      temperature: 0.7,
      maxTokens: initialSpendControl.maxTokens ?? undefined,
    });
    activeRequestCostUsd = response.usage.estimatedCostUsd ?? 0;
  } catch (err) {
    logger.error({ err, model: routing.model }, 'LLM provider failed');

    const escalated = await escalateModel(routing, event, tools, routingSettings);
    if (escalated) {
      const escalatedSpendControl = enforceSpendControls({
        stage: 'initial',
        routing: escalated,
        settings: routingSettings,
        messages,
        tools,
        monthlyCostSoFarUsd,
      });
      warnings.push(`Primary model failed, escalated to ${escalated.model}`);
      warnings.push(...escalatedSpendControl.warnings);
      routing = escalatedSpendControl.routing;

      if (escalatedSpendControl.blockedReply) {
        return buildSpendLimitedResult(
          conversationId,
          inboundMessageId,
          routing,
          escalatedSpendControl.blockedReply,
          warnings,
          escalatedSpendControl.estimatedCostUsd,
        );
      }

      try {
        response = await provider.complete({
          model: routing.model,
          messages,
          tools: tools.length > 0 ? tools : undefined,
          temperature: 0.7,
          maxTokens: escalatedSpendControl.maxTokens ?? undefined,
        });
        activeRequestCostUsd = response.usage.estimatedCostUsd ?? 0;
      } catch (retryErr) {
        logger.error({ err: retryErr, model: routing.model }, 'Escalated model also failed');
        return buildErrorResult(conversationId, inboundMessageId, routing, retryErr as Error);
      }
    } else {
      return buildErrorResult(conversationId, inboundMessageId, routing, err as Error);
    }
  }

  // 8. Handle tool calls: external tools + sub-agents
  const allToolDispatches: ToolDispatch[] = [];
  const allSubAgentDispatches: SubAgentDispatch[] = [];
  const allToolResults: Array<{ toolCallId: string; result: string }> = [];

  const subAgentToolCalls = response.toolCalls.filter((tc) => isSubAgentToolCall(tc.name));
  const externalToolCalls = response.toolCalls.filter((tc) => !isSubAgentToolCall(tc.name));

  if (externalToolCalls.length > 0) {
    try {
      const externalResults = await executeExternalToolCalls(
        externalToolCalls,
        toolCatalog.externalToolsByName,
        {
          conversationId,
          externalUserId: event.externalUserId,
          sourceChannel: event.channel,
          sourceMessageId: inboundMessageId,
        },
      );

      allToolDispatches.push(...externalResults.toolDispatches);
      allToolResults.push(...externalResults.toolResults);
    } catch (err) {
      logger.error({ err }, 'External skill execution failed');
      warnings.push('External skill execution failed');
    }
  }

  if (subAgentToolCalls.length > 0) {
    try {
      const subAgentResults = await processSubAgentCalls(subAgentToolCalls, {
        conversationId,
        externalUserId: event.externalUserId,
        sourceChannel: event.channel,
        sourceMessageId: inboundMessageId,
        sourceImageUrl: event.attachments.find((a) => a.type === 'image')?.url ?? undefined,
      });

      allToolDispatches.push(...subAgentResults.toolDispatches);
      allSubAgentDispatches.push(...subAgentResults.subAgentDispatches);
      allToolResults.push(...subAgentResults.toolResults);
    } catch (err) {
      logger.error({ err }, 'Sub-agent dispatch failed');
      warnings.push('Sub-agent dispatch failed');
    }
  }

  let finalReply = response.content;

  // 8b. Follow up with LLM using tool outputs
  if (allToolResults.length > 0) {
    const followUpMessages = [
      ...messages,
      { role: 'assistant' as const, content: response.content || '', toolCalls: response.toolCalls },
      ...allToolResults.map((tr) => ({
        role: 'tool' as const,
        content: tr.result,
        toolCallId: tr.toolCallId,
      })),
    ];

    const followUpSpendControl = enforceSpendControls({
      stage: 'follow_up',
      routing,
      settings: routingSettings,
      messages: followUpMessages,
      monthlyCostSoFarUsd: monthlyCostSoFarUsd + activeRequestCostUsd,
      requestCostSpentUsd: activeRequestCostUsd,
      allowDowngrade: false,
    });
    warnings.push(...followUpSpendControl.warnings);

    if (followUpSpendControl.blockedReply) {
      warnings.push('Follow-up LLM synthesis skipped due to spend controls');
      finalReply = allToolResults.map((tr) => tr.result).join('\n\n');
    } else {
      try {
        const followUp = await provider.complete({
          model: routing.model,
          messages: followUpMessages,
          temperature: 0.7,
          maxTokens: followUpSpendControl.maxTokens ?? undefined,
        });

        finalReply = followUp.content;

        response.usage.promptTokens += followUp.usage.promptTokens;
        response.usage.completionTokens += followUp.usage.completionTokens;
        response.usage.totalTokens += followUp.usage.totalTokens;
        if (response.usage.estimatedCostUsd !== null && followUp.usage.estimatedCostUsd !== null) {
          response.usage.estimatedCostUsd += followUp.usage.estimatedCostUsd;
        }
        activeRequestCostUsd = response.usage.estimatedCostUsd ?? activeRequestCostUsd;
        response.latencyMs += followUp.latencyMs;
      } catch (followUpErr) {
        logger.warn({ err: followUpErr }, 'Follow-up LLM call after tool execution failed');
        warnings.push('Follow-up LLM call failed, using tool results directly');
        finalReply = allToolResults.map((tr) => tr.result).join('\n\n');
      }
    }
  }

  // 9. Persist assistant reply
  const initialRuntimeMetadata = {
    routing: {
      provider: routing.provider,
      model: response.model,
      tier: routing.tier,
      reason: routing.reason,
      escalatedFrom: routing.escalatedFrom,
      signals: routing.signals,
    },
    execution: {
      toolCallsRequested: response.toolCalls.length,
      externalToolCalls: externalToolCalls.length,
      subAgentToolCalls: subAgentToolCalls.length,
      externalToolsExecuted: allToolDispatches.filter(
        (d) => !isSubAgentToolCall(d.toolName) && d.status === 'completed',
      ).length,
      subAgentDispatches: allSubAgentDispatches.length,
      warningsCount: warnings.length,
    },
    memory: {
      retrievedCount: memories.length,
    },
  };

  const replyMessageId = await persistMessages.outbound(
    finalReply,
    conversationId,
    inboundMessageId,
    {
      metadata: initialRuntimeMetadata,
      tokenUsage: response.usage.totalTokens,
    },
  );

  // 10. Extract and store memories
  let memoryWrites: MemoryFact[] = [];
  try {
    memoryWrites = await extractAndStoreMemories(
      event,
      response,
      conversationId,
      inboundMessageId,
    );
  } catch (err) {
    warnings.push('Memory extraction failed');
    logger.warn({ err }, 'Memory extraction failed');
  }

  // 11. Persist usage
  try {
    await persistUsageLog({
      messageId: replyMessageId,
      provider: routing.provider,
      model: response.model,
      requestType: response.toolCalls.length > 0 ? 'chat_completion_with_tools' : 'chat_completion',
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

  // 11b. Attach finalized runtime metadata for admin traceability.
  try {
    await persistMessages.mergeMetadata(replyMessageId, {
      usage: {
        promptTokens: response.usage.promptTokens,
        completionTokens: response.usage.completionTokens,
        totalTokens: response.usage.totalTokens,
        estimatedCostUsd: response.usage.estimatedCostUsd,
        latencyMs: response.latencyMs,
      },
      memory: {
        retrievedCount: memories.length,
        writtenCount: memoryWrites.length,
      },
      execution: {
        toolCallsRequested: response.toolCalls.length,
        externalToolCalls: externalToolCalls.length,
        subAgentToolCalls: subAgentToolCalls.length,
        externalToolsCompleted: allToolDispatches.filter(
          (d) => !isSubAgentToolCall(d.toolName) && d.status === 'completed',
        ).length,
        subAgentDispatches: allSubAgentDispatches.length,
      },
      warnings,
    }, response.usage.totalTokens);
  } catch (err) {
    warnings.push('Message metadata update failed');
    logger.warn({ err, replyMessageId }, 'Failed to update message runtime metadata');
  }

  // 11c. Emit real-time SSE events for admin portal
  try {
    sseHub.emit('conversation:message', {
      conversationId,
      messageId: replyMessageId,
      direction: 'outbound',
      contentPreview: finalReply.slice(0, 200),
      model: response.model,
      tier: routing.tier,
      tokens: response.usage.totalTokens,
      costUsd: response.usage.estimatedCostUsd,
      timestamp: new Date().toISOString(),
    });
    sseHub.emit('usage:updated', {
      model: response.model,
      tokens: response.usage.totalTokens,
      costUsd: response.usage.estimatedCostUsd,
      timestamp: new Date().toISOString(),
    });
  } catch {
    // SSE emission is non-critical
  }

  // 12. Post-processing: title generation + close detection (fire-and-forget)
  maybeGenerateTitle(conversationId, event.text, finalReply).catch((err) => {
    logger.warn({ err, conversationId }, 'Post-processing: title generation failed');
  });
  maybeCloseConversation(conversationId, finalReply).catch((err) => {
    logger.warn({ err, conversationId }, 'Post-processing: close detection failed');
  });

  // 13. Return result
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

async function buildErrorResult(
  conversationId: string,
  inboundMessageId: string,
  routing: ExecutionResult['routing'],
  error: Error,
): Promise<ExecutionResult> {
  const reply = "I'm sorry, I'm having trouble processing your request right now. Please try again in a moment.";
  let replyMessageId = inboundMessageId;
  try {
    replyMessageId = await persistMessages.outbound(reply, conversationId, inboundMessageId);
  } catch (persistErr) {
    logger.error({ err: persistErr, conversationId }, 'Failed to persist provider error reply');
  }

  return {
    reply,
    memoryWrites: [],
    usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0, estimatedCostUsd: null },
    routing,
    toolDispatches: [],
    subAgentDispatches: [],
    conversationId,
    messageId: replyMessageId,
    warnings: [`Provider error: ${error.message}`],
  };
}

async function buildSpendLimitedResult(
  conversationId: string,
  inboundMessageId: string,
  routing: ExecutionResult['routing'],
  reply: string,
  warnings: string[],
  estimatedCostUsd: number | null,
): Promise<ExecutionResult> {
  let replyMessageId = inboundMessageId;
  try {
    replyMessageId = await persistMessages.outbound(reply, conversationId, inboundMessageId, {
      metadata: {
        routing: {
          provider: routing.provider,
          model: routing.model,
          tier: routing.tier,
          reason: routing.reason,
          escalatedFrom: routing.escalatedFrom,
          signals: routing.signals,
        },
        usage: {
          estimatedCostUsd,
        },
        warnings,
      },
      tokenUsage: 0,
    });
  } catch (persistErr) {
    logger.error({ err: persistErr, conversationId }, 'Failed to persist spend-limited reply');
  }

  return {
    reply,
    memoryWrites: [],
    usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0, estimatedCostUsd: estimatedCostUsd ?? null },
    routing,
    toolDispatches: [],
    subAgentDispatches: [],
    conversationId,
    messageId: replyMessageId,
    warnings,
  };
}
