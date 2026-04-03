import { logger } from '@nexclaw/config';
import type {
  LlmMessage,
  LlmToolDefinition,
  RoutingSignals,
} from '@nexclaw/shared';

export interface ModelPricing {
  model: string;
  inputPerMillionUsd: number;
  outputPerMillionUsd: number;
}

const MODEL_PRICING_TABLE: ModelPricing[] = [
  { model: 'google/gemini-2.5-flash', inputPerMillionUsd: 0.1, outputPerMillionUsd: 0.4 },
  { model: 'google/gemini-2.5-pro', inputPerMillionUsd: 1.25, outputPerMillionUsd: 5 },
  { model: 'anthropic/claude-sonnet-4', inputPerMillionUsd: 3, outputPerMillionUsd: 15 },
  { model: 'anthropic/claude-opus-4', inputPerMillionUsd: 15, outputPerMillionUsd: 75 },
  { model: 'openai/gpt-4o', inputPerMillionUsd: 5, outputPerMillionUsd: 15 },
];

const CHARS_PER_TOKEN = 4;
const BASE_PROMPT_TOKENS = 250;
const TOOL_SCHEMA_TOKENS_FLOOR = 40;
const IMAGE_ATTACHMENT_TOKEN_OVERHEAD = 850;

export function estimateLlmCostUsd(
  model: string,
  promptTokens: number,
  completionTokens: number,
): number | null {
  const pricing = resolveModelPricing(model);
  if (!pricing) return null;

  const promptCost = (promptTokens / 1_000_000) * pricing.inputPerMillionUsd;
  const completionCost = (completionTokens / 1_000_000) * pricing.outputPerMillionUsd;
  return Number((promptCost + completionCost).toFixed(8));
}

export function resolveModelPricing(model: string): ModelPricing | null {
  const normalized = normalizeModelName(model);

  const exact = MODEL_PRICING_TABLE.find((entry) => normalizeModelName(entry.model) === normalized);
  if (exact) {
    return exact;
  }

  if (normalized.includes('claude-opus')) {
    return MODEL_PRICING_TABLE.find((entry) => entry.model === 'anthropic/claude-opus-4') ?? null;
  }
  if (normalized.includes('claude-sonnet')) {
    return MODEL_PRICING_TABLE.find((entry) => entry.model === 'anthropic/claude-sonnet-4') ?? null;
  }
  if (normalized.includes('gemini-2.5-flash')) {
    return MODEL_PRICING_TABLE.find((entry) => entry.model === 'google/gemini-2.5-flash') ?? null;
  }
  if (normalized.includes('gemini-2.5-pro')) {
    return MODEL_PRICING_TABLE.find((entry) => entry.model === 'google/gemini-2.5-pro') ?? null;
  }
  if (normalized.includes('gpt-4o')) {
    return MODEL_PRICING_TABLE.find((entry) => entry.model === 'openai/gpt-4o') ?? null;
  }

  logger.warn({ model }, 'No pricing entry for model, cost estimation unavailable');
  return null;
}

export function estimatePromptTokens(
  messages: LlmMessage[],
  tools: LlmToolDefinition[] = [],
): number {
  const messageTokens = messages.reduce((total, message) => {
    let nextTotal = total + Math.ceil(message.content.length / CHARS_PER_TOKEN);
    if (message.images && message.images.length > 0) {
      nextTotal += message.images.length * IMAGE_ATTACHMENT_TOKEN_OVERHEAD;
    }
    return nextTotal;
  }, BASE_PROMPT_TOKENS);

  const toolTokens = tools.reduce((total, tool) => {
    const toolShape = JSON.stringify({
      name: tool.name,
      description: tool.description,
      parameters: tool.parameters,
    });
    return total + Math.max(TOOL_SCHEMA_TOKENS_FLOOR, Math.ceil(toolShape.length / CHARS_PER_TOKEN));
  }, 0);

  return messageTokens + toolTokens;
}

export function estimateCompletionTokens(
  signals: RoutingSignals,
  options?: { followUp?: boolean },
): number {
  let tokens = signals.estimatedComplexity === 'high'
    ? 900
    : signals.estimatedComplexity === 'medium'
      ? 450
      : 220;

  if (signals.requiresToolUse) tokens += 180;
  if (signals.requiresVision) tokens += 160;
  if (signals.hasFollowUpNeed) tokens += 120;
  if (options?.followUp) {
    tokens = Math.max(180, Math.round(tokens * 0.6));
  }

  return tokens;
}

export function estimateRequestCostUsd(
  model: string,
  params: {
    messages: LlmMessage[];
    tools?: LlmToolDefinition[];
    signals: RoutingSignals;
    followUp?: boolean;
  },
): number | null {
  return estimateLlmCostUsd(
    model,
    estimatePromptTokens(params.messages, params.tools),
    estimateCompletionTokens(params.signals, { followUp: params.followUp }),
  );
}

export function calculateAffordableMaxCompletionTokens(
  model: string,
  promptTokens: number,
  maxCostUsd: number,
): number | null {
  const pricing = resolveModelPricing(model);
  if (!pricing) return null;

  const promptCostUsd = estimateLlmCostUsd(model, promptTokens, 0);
  if (promptCostUsd === null || promptCostUsd >= maxCostUsd) {
    return 0;
  }

  const outputBudgetUsd = maxCostUsd - promptCostUsd;
  const costPerOutputTokenUsd = pricing.outputPerMillionUsd / 1_000_000;
  if (costPerOutputTokenUsd <= 0) {
    return null;
  }

  return Math.max(0, Math.floor(outputBudgetUsd / costPerOutputTokenUsd));
}

function normalizeModelName(model: string): string {
  return model.trim().toLowerCase().replace(/:free$/, '');
}
