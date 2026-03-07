/**
 * Orchestration and routing fixtures for integration tests.
 */
import type { InboundEvent, ExecutionResult, RoutingDecision, LlmUsage } from '@openclaw/shared';

export function createInboundEvent(overrides: Partial<InboundEvent> = {}): InboundEvent {
  return {
    channel: 'telegram',
    externalUserId: '12345678',
    externalUserName: 'John Doe',
    externalThreadId: '12345678',
    text: 'Hello, I need help with my account',
    attachments: [],
    timestamp: new Date().toISOString(),
    metadata: { telegramUpdateId: 100001, telegramMessageId: 501 },
    ...overrides,
  };
}

export function createSimpleInboundEvent(): InboundEvent {
  return createInboundEvent({ text: 'Hi' });
}

export function createComplexInboundEvent(): InboundEvent {
  return createInboundEvent({
    text: 'Can you analyze my monthly spending patterns, compare the last 3 months, and create a step-by-step plan to reduce unnecessary expenses? I need you to evaluate each category and explain why some items are higher than expected.',
  });
}

export function createVisionInboundEvent(): InboundEvent {
  return createInboundEvent({
    text: 'Here is my receipt',
    attachments: [
      {
        type: 'image',
        url: 'https://example.com/receipt.jpg',
        base64: null,
        mimeType: 'image/jpeg',
        fileName: 'receipt.jpg',
        sizeBytes: 45000,
      },
    ],
  });
}

export function createMockRoutingDecision(tier: 'cheap' | 'standard' | 'strong' = 'cheap'): RoutingDecision {
  const models = {
    cheap: 'google/gemini-2.5-flash',
    standard: 'anthropic/claude-sonnet-4',
    strong: 'anthropic/claude-opus-4',
  };
  return {
    model: models[tier],
    tier,
    provider: 'openrouter',
    reason: `tier=${tier}`,
    signals: {
      messageLength: 30,
      hasAttachments: false,
      requiresVision: false,
      requiresToolUse: false,
      estimatedComplexity: tier === 'cheap' ? 'low' : tier === 'standard' ? 'medium' : 'high',
      hasFollowUpNeed: false,
    },
    escalatedFrom: null,
  };
}

export function createMockUsage(): LlmUsage {
  return {
    promptTokens: 150,
    completionTokens: 80,
    totalTokens: 230,
    estimatedCostUsd: 0.002,
  };
}

export function createMockExecutionResult(overrides: Partial<ExecutionResult> = {}): ExecutionResult {
  return {
    reply: 'Hello! I can help you with your account. What specific issue are you experiencing?',
    memoryWrites: [],
    usage: createMockUsage(),
    routing: createMockRoutingDecision(),
    toolDispatches: [],
    subAgentDispatches: [],
    conversationId: 'conv-test-001',
    messageId: 'msg-test-001',
    warnings: [],
    ...overrides,
  };
}
