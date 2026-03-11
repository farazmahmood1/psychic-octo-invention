import { describe, expect, it } from 'vitest';
import type { LlmMessage, RoutingDecision, RoutingSettings } from '@openclaw/shared';
import { enforceSpendControls } from '../../services/routing/spend-controls.js';

function createRouting(overrides: Partial<RoutingDecision> = {}): RoutingDecision {
  return {
    model: 'anthropic/claude-opus-4',
    tier: 'strong',
    provider: 'openrouter',
    reason: 'tier=strong',
    escalatedFrom: null,
    signals: {
      messageLength: 180,
      hasAttachments: false,
      requiresVision: false,
      requiresToolUse: false,
      estimatedComplexity: 'high',
      hasFollowUpNeed: false,
    },
    ...overrides,
  };
}

function createSettings(overrides: Partial<RoutingSettings> = {}): RoutingSettings {
  return {
    primaryModel: 'anthropic/claude-sonnet-4',
    fallbackModel: 'anthropic/claude-opus-4',
    maxCostPerRequestUsd: null,
    maxMonthlyBudgetUsd: null,
    routingRules: [],
    ...overrides,
  };
}

const messages: LlmMessage[] = [
  { role: 'system', content: 'You are a helpful assistant.' },
  { role: 'user', content: 'Analyze my last quarter and recommend how to reduce spending.' },
];

describe('Spend Controls', () => {
  it('downgrades the selected model when the per-request cap disallows the routed model', () => {
    const outcome = enforceSpendControls({
      stage: 'initial',
      routing: createRouting(),
      settings: createSettings({ maxCostPerRequestUsd: 0.001 }),
      messages,
      monthlyCostSoFarUsd: 0,
    });

    expect(outcome.blockedReply).toBeNull();
    expect(outcome.routing.model).toBe('google/gemini-2.5-flash');
    expect(outcome.routing.reason).toContain('spend_cap_initial');
    expect(outcome.warnings[0]).toContain('downgraded');
  });

  it('blocks execution when the monthly budget has already been exhausted', () => {
    const outcome = enforceSpendControls({
      stage: 'initial',
      routing: createRouting(),
      settings: createSettings({ maxMonthlyBudgetUsd: 1 }),
      messages,
      monthlyCostSoFarUsd: 1,
    });

    expect(outcome.blockedReply).toContain('AI budget limit has been reached');
    expect(outcome.warnings[0]).toContain('LLM request blocked by spend controls');
  });

  it('blocks follow-up synthesis when no meaningful completion budget remains', () => {
    const outcome = enforceSpendControls({
      stage: 'follow_up',
      routing: createRouting({
        model: 'google/gemini-2.5-flash',
        tier: 'cheap',
        signals: {
          messageLength: 40,
          hasAttachments: false,
          requiresVision: false,
          requiresToolUse: false,
          estimatedComplexity: 'low',
          hasFollowUpNeed: false,
        },
      }),
      settings: createSettings({ maxCostPerRequestUsd: 0.0002 }),
      messages,
      requestCostSpentUsd: 0.00018,
      monthlyCostSoFarUsd: 0,
      allowDowngrade: false,
    });

    expect(outcome.blockedReply).toContain('AI budget limit has been reached');
    expect(outcome.warnings[0]).toContain('Follow-up LLM call blocked by spend controls');
  });

  it('blocks when the selected model is already the cheapest valid option and still exceeds the cap', () => {
    const outcome = enforceSpendControls({
      stage: 'initial',
      routing: createRouting({
        model: 'google/gemini-2.5-flash',
        tier: 'cheap',
        signals: {
          messageLength: 60,
          hasAttachments: false,
          requiresVision: false,
          requiresToolUse: false,
          estimatedComplexity: 'low',
          hasFollowUpNeed: false,
        },
      }),
      settings: createSettings({ maxCostPerRequestUsd: 0.00001 }),
      messages,
      monthlyCostSoFarUsd: 0,
    });

    expect(outcome.routing.model).toBe('google/gemini-2.5-flash');
    expect(outcome.blockedReply).toContain('AI budget limit has been reached');
  });

  it('never chooses a non-vision model for a vision-required request', () => {
    const outcome = enforceSpendControls({
      stage: 'initial',
      routing: createRouting({
        model: 'example/non-vision-model',
        tier: 'strong',
        signals: {
          messageLength: 120,
          hasAttachments: true,
          requiresVision: true,
          requiresToolUse: false,
          estimatedComplexity: 'medium',
          hasFollowUpNeed: false,
        },
      }),
      settings: createSettings({
        primaryModel: 'example/non-vision-standard',
        fallbackModel: 'example/non-vision-strong',
        maxCostPerRequestUsd: 0.01,
      }),
      messages,
      monthlyCostSoFarUsd: 0,
    });

    expect(outcome.blockedReply).toBeNull();
    expect(outcome.routing.model).not.toBe('example/non-vision-model');
    expect(['anthropic/claude-sonnet-4', 'google/gemini-2.5-flash']).toContain(outcome.routing.model);
  });

  it('can still downgrade tool-using requests without blocking them when budget allows', () => {
    const outcome = enforceSpendControls({
      stage: 'initial',
      routing: createRouting({
        model: 'anthropic/claude-sonnet-4',
        tier: 'standard',
        signals: {
          messageLength: 140,
          hasAttachments: false,
          requiresVision: false,
          requiresToolUse: true,
          estimatedComplexity: 'medium',
          hasFollowUpNeed: false,
        },
      }),
      settings: createSettings({ maxCostPerRequestUsd: 0.0008 }),
      messages,
      monthlyCostSoFarUsd: 0,
    });

    expect(outcome.blockedReply).toBeNull();
    expect(outcome.routing.model).toBe('google/gemini-2.5-flash');
  });
});
