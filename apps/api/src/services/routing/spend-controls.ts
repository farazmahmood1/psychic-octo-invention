import { logger } from '@nexclaw/config';
import type {
  LlmMessage,
  LlmToolDefinition,
  ModelTier,
  RoutingDecision,
  RoutingSettings,
} from '@nexclaw/shared';
import {
  calculateAffordableMaxCompletionTokens,
  estimateCompletionTokens,
  estimateLlmCostUsd,
  estimatePromptTokens,
} from './model-pricing.js';
import { DEFAULT_MODELS, modelSupportsVision, resolveTierModel } from './model-router.js';

export interface SpendControlOutcome {
  routing: RoutingDecision;
  warnings: string[];
  blockedReply: string | null;
  maxTokens: number | null;
  estimatedCostUsd: number | null;
}

interface SpendControlParams {
  stage: 'initial' | 'follow_up';
  routing: RoutingDecision;
  settings: RoutingSettings;
  messages: LlmMessage[];
  tools?: LlmToolDefinition[];
  monthlyCostSoFarUsd?: number;
  requestCostSpentUsd?: number;
  allowDowngrade?: boolean;
}

interface CandidateSelection {
  model: string;
  tier: ModelTier;
  estimatedCostUsd: number | null;
}

const MIN_COMPLETION_TOKENS = 96;

export function enforceSpendControls(params: SpendControlParams): SpendControlOutcome {
  const warnings: string[] = [];
  const promptTokens = estimatePromptTokens(params.messages, params.tools);
  const completionTokens = estimateCompletionTokens(params.routing.signals, {
    followUp: params.stage === 'follow_up',
  });

  const requestCapRemainingUsd = normalizeRemainingBudget(
    params.settings.maxCostPerRequestUsd,
    params.requestCostSpentUsd,
  );
  const monthlyCapRemainingUsd = normalizeRemainingBudget(
    params.settings.maxMonthlyBudgetUsd,
    params.monthlyCostSoFarUsd,
  );
  const effectiveCapUsd = minDefined(requestCapRemainingUsd, monthlyCapRemainingUsd);

  const candidates = buildCandidateSelections(
    params.routing,
    params.settings,
    promptTokens,
    completionTokens,
    params.allowDowngrade ?? true,
  );

  const currentEstimate = candidates[0]?.estimatedCostUsd ?? null;

  if (effectiveCapUsd === null) {
    return {
      routing: params.routing,
      warnings,
      blockedReply: null,
      maxTokens: null,
      estimatedCostUsd: currentEstimate,
    };
  }

  const affordable = candidates.find((candidate) => {
    if (candidate.estimatedCostUsd === null) return false;
    return candidate.estimatedCostUsd <= effectiveCapUsd;
  });

  if (!affordable) {
    logger.warn({
      stage: params.stage,
      currentModel: params.routing.model,
      effectiveCapUsd,
      requestCapRemainingUsd,
      monthlyCapRemainingUsd,
      promptTokens,
      completionTokens,
    }, 'Spend controls blocked LLM execution');

    warnings.push(buildCapWarning(params.stage, requestCapRemainingUsd, monthlyCapRemainingUsd));

    return {
      routing: appendSpendReason(params.routing, params.routing.model, currentEstimate, effectiveCapUsd, params.stage),
      warnings,
      blockedReply: "I'm temporarily unable to process this request because the configured AI budget limit has been reached. Please try again later or ask an admin to adjust the budget settings.",
      maxTokens: null,
      estimatedCostUsd: currentEstimate,
    };
  }

  let routing = params.routing;
  if (affordable.model !== params.routing.model) {
    logger.info({
      stage: params.stage,
      fromModel: params.routing.model,
      toModel: affordable.model,
      fromTier: params.routing.tier,
      toTier: affordable.tier,
      currentEstimate,
      enforcedEstimate: affordable.estimatedCostUsd,
      effectiveCapUsd,
      requestCapRemainingUsd,
      monthlyCapRemainingUsd,
    }, 'Spend controls downgraded model selection');

    warnings.push(
      `Spend controls downgraded ${params.stage === 'follow_up' ? 'follow-up ' : ''}model from ${params.routing.model} to ${affordable.model}.`,
    );
    routing = appendSpendReason(params.routing, affordable.model, affordable.estimatedCostUsd, effectiveCapUsd, params.stage, affordable.tier);
  }

  const maxTokens = calculateAffordableMaxCompletionTokens(
    affordable.model,
    promptTokens,
    effectiveCapUsd,
  );

  if (maxTokens !== null && maxTokens < MIN_COMPLETION_TOKENS) {
    logger.warn({
      stage: params.stage,
      model: affordable.model,
      maxTokens,
      effectiveCapUsd,
      promptTokens,
    }, 'Spend controls blocked LLM execution because remaining budget is too small for a meaningful completion');

    warnings.push(buildCapWarning(params.stage, requestCapRemainingUsd, monthlyCapRemainingUsd));

    return {
      routing,
      warnings,
      blockedReply: "I'm temporarily unable to process this request because the configured AI budget limit has been reached. Please try again later or ask an admin to adjust the budget settings.",
      maxTokens,
      estimatedCostUsd: affordable.estimatedCostUsd,
    };
  }

  return {
    routing,
    warnings,
    blockedReply: null,
    maxTokens,
    estimatedCostUsd: affordable.estimatedCostUsd,
  };
}

function buildCandidateSelections(
  routing: RoutingDecision,
  settings: RoutingSettings,
  promptTokens: number,
  completionTokens: number,
  allowDowngrade: boolean,
): CandidateSelection[] {
  const candidates: CandidateSelection[] = [];
  if (!routing.signals.requiresVision || modelSupportsVision(routing.model)) {
    pushCandidate(candidates, routing.model, routing.tier, promptTokens, completionTokens);
  }

  if (!allowDowngrade) {
    return candidates;
  }

  const tierOrder: ModelTier[] = routing.tier === 'strong'
    ? ['strong', 'standard', 'cheap']
    : routing.tier === 'standard'
      ? ['standard', 'cheap']
      : ['cheap'];

  for (const tier of tierOrder) {
    const model = resolveTierModel(tier, routing.signals, settings);
    if (routing.signals.requiresVision && !modelSupportsVision(model)) {
      continue;
    }
    pushCandidate(candidates, model, tier, promptTokens, completionTokens);
  }

  if (routing.tier !== 'cheap') {
    if (!routing.signals.requiresVision || modelSupportsVision(DEFAULT_MODELS.cheap)) {
      pushCandidate(candidates, DEFAULT_MODELS.cheap, 'cheap', promptTokens, completionTokens);
    }
  }

  return candidates;
}

function pushCandidate(
  candidates: CandidateSelection[],
  model: string,
  tier: ModelTier,
  promptTokens: number,
  completionTokens: number,
): void {
  if (candidates.some((candidate) => candidate.model === model)) {
    return;
  }

  candidates.push({
    model,
    tier,
    estimatedCostUsd: estimateLlmCostUsd(model, promptTokens, completionTokens),
  });
}

function appendSpendReason(
  routing: RoutingDecision,
  model: string,
  estimatedCostUsd: number | null,
  effectiveCapUsd: number,
  stage: SpendControlParams['stage'],
  tier: ModelTier = routing.tier,
): RoutingDecision {
  const estimateLabel = estimatedCostUsd === null ? 'unknown' : `$${estimatedCostUsd.toFixed(4)}`;
  return {
    ...routing,
    model,
    tier,
    reason: `${routing.reason}; spend_cap_${stage}<=${effectiveCapUsd.toFixed(4)}; estimated_cost=${estimateLabel}`,
  };
}

function normalizeRemainingBudget(limitUsd: number | null, spentUsd = 0): number | null {
  if (limitUsd === null) {
    return null;
  }
  return Math.max(0, Number((limitUsd - spentUsd).toFixed(8)));
}

function minDefined(left: number | null, right: number | null): number | null {
  if (left === null) return right;
  if (right === null) return left;
  return Math.min(left, right);
}

function buildCapWarning(
  stage: SpendControlParams['stage'],
  requestCapRemainingUsd: number | null,
  monthlyCapRemainingUsd: number | null,
): string {
  const limits: string[] = [];
  if (requestCapRemainingUsd !== null) {
    limits.push(`per-request remaining $${requestCapRemainingUsd.toFixed(4)}`);
  }
  if (monthlyCapRemainingUsd !== null) {
    limits.push(`monthly remaining $${monthlyCapRemainingUsd.toFixed(4)}`);
  }
  const prefix = stage === 'follow_up' ? 'Follow-up LLM call blocked by spend controls' : 'LLM request blocked by spend controls';
  return `${prefix} (${limits.join(', ')})`;
}
