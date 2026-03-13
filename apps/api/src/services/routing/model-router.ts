import { logger } from '@openclaw/config';
import type {
  InboundEvent,
  RoutingDecision,
  RoutingSignals,
  ModelTier,
  RoutingSettings,
  LlmToolDefinition,
} from '@openclaw/shared';
import {
  GHL_CRM_TOOL_NAME,
  BOOKKEEPING_TOOL_NAME,
  BOOKKEEPING_CATEGORIES,
  FOLLOWUP_TOOL_NAME,
} from '@openclaw/shared';
import { getRoutingSettings } from '../settings.service.js';

// ── Model Catalog ────────────────────────────────────────────
// Maps tiers to default OpenRouter model identifiers.
// These serve as fallbacks when DB settings are absent.

export const DEFAULT_MODELS: Record<ModelTier, string> = {
  cheap: 'google/gemini-2.5-flash',
  standard: 'anthropic/claude-sonnet-4',
  strong: 'anthropic/claude-opus-4',
};

// Vision-capable models (must be in the strong/standard tier)
const VISION_MODELS = new Set([
  'anthropic/claude-sonnet-4',
  'anthropic/claude-opus-4',
  'google/gemini-2.5-flash',
  'google/gemini-2.5-pro',
  'openai/gpt-4o',
]);

// ── Complexity Thresholds ────────────────────────────────────
// These are starting heuristics, not hard rules. They can be tuned via DB settings.

const SHORT_MESSAGE_CHARS = 200;
const LONG_MESSAGE_CHARS = 1500;
const BOOKKEEPING_CATEGORY_PATTERN = new RegExp(
  `\\b(${BOOKKEEPING_CATEGORIES.map((c) => c.toLowerCase().replace(/[^\w\s]/g, '\\$&')).join('|')})\\b`,
);

/**
 * Analyze an inbound event and select the best model.
 * Uses signal-based heuristics combined with DB-backed routing config.
 */
export async function routeModel(
  event: InboundEvent,
  tools: LlmToolDefinition[],
  escalatedFrom: string | null = null,
  settingsOverride?: RoutingSettings,
): Promise<RoutingDecision> {
  const signals = analyzeSignals(event, tools);
  const tier = classifyTier(signals, escalatedFrom);
  const settings = settingsOverride ?? await getRoutingSettings();
  const model = selectModel(tier, signals, settings);
  const provider = 'openrouter';

  const reason = buildReason(tier, signals, escalatedFrom);

  logger.debug({ model, tier, signals, reason }, 'Model routing decision');

  return {
    model,
    tier,
    provider,
    reason,
    signals,
    escalatedFrom,
  };
}

/**
 * Re-route to a stronger model after the initial model proved insufficient.
 * Returns null if already at max escalation depth or strongest tier.
 */
export async function escalateModel(
  currentDecision: RoutingDecision,
  event: InboundEvent,
  tools: LlmToolDefinition[],
  settingsOverride?: RoutingSettings,
): Promise<RoutingDecision | null> {
  if (currentDecision.tier === 'strong') {
    return null; // Already at strongest tier
  }
  if (currentDecision.escalatedFrom !== null) {
    // Already escalated once — prevent looping
    return null;
  }

  return routeModel(event, tools, currentDecision.model, settingsOverride);
}

// ── Signal Analysis ──────────────────────────────────────────

function analyzeSignals(event: InboundEvent, tools: LlmToolDefinition[]): RoutingSignals {
  const messageLength = event.text.length;
  const hasAttachments = event.attachments.length > 0;
  const requiresVision = event.attachments.some(
    (a) => a.type === 'image' || (a.mimeType?.startsWith('image/') ?? false),
  );
  const requiresToolUse = detectToolUseNeed(event.text, tools, hasAttachments);
  const estimatedComplexity = estimateComplexity(event.text, hasAttachments);
  const hasFollowUpNeed = detectFollowUpNeed(event.text);

  return {
    messageLength,
    hasAttachments,
    requiresVision,
    requiresToolUse,
    estimatedComplexity,
    hasFollowUpNeed,
  };
}

/**
 * Heuristic complexity estimation based on message content.
 *
 * High complexity indicators:
 * - Long messages (>1500 chars) often contain multi-step instructions
 * - Keywords suggesting reasoning/analysis/comparison tasks
 * - Attachments requiring interpretation
 *
 * Low complexity indicators:
 * - Short messages (<200 chars)
 * - Simple greetings, acknowledgements, yes/no answers
 */
function estimateComplexity(text: string, hasAttachments: boolean): 'low' | 'medium' | 'high' {
  const lower = text.toLowerCase();

  // High-complexity keywords: multi-step reasoning, analysis, comparison
  const highComplexityPatterns = [
    /\b(analyze|compare|explain why|step[- ]by[- ]step|reasoning|calculate|evaluate)\b/,
    /\b(pros and cons|trade[- ]?offs|implications|consequences)\b/,
    /\b(write a|draft a|create a|design a|plan for)\b/,
    /\b(code|function|algorithm|debug|refactor)\b/,
  ];

  const isHighKeyword = highComplexityPatterns.some((p) => p.test(lower));

  if (text.length > LONG_MESSAGE_CHARS || (isHighKeyword && text.length > SHORT_MESSAGE_CHARS)) {
    return 'high';
  }

  if (hasAttachments || text.length > SHORT_MESSAGE_CHARS || isHighKeyword) {
    return 'medium';
  }

  return 'low';
}

/** Detect if the message likely needs iterative follow-up */
function detectFollowUpNeed(text: string): boolean {
  const lower = text.toLowerCase();
  return /\b(help me|walk me through|can you|how do i|what should)\b/.test(lower);
}

function detectToolUseNeed(
  text: string,
  tools: LlmToolDefinition[],
  hasAttachments: boolean,
): boolean {
  if (tools.length === 0) return false;

  const lower = text.toLowerCase();
  const hasTool = (name: string) => tools.some((tool) => tool.name === name);

  // Receipt processing usually starts with an image upload.
  if (hasAttachments && hasTool(BOOKKEEPING_TOOL_NAME)) {
    return true;
  }

  if (
    hasTool(GHL_CRM_TOOL_NAME)
    && (
      /\b(crm|contact|lead|pipeline|opportunity|update contact|search contact)\b/.test(lower)
      || /\b(update|change|set)\b.*\b(phone|phone number|email|address|city|state|postal code|zip|website|tag)\b/.test(lower)
    )
  ) {
    return true;
  }

  if (
    hasTool(BOOKKEEPING_TOOL_NAME)
    && (
      /\b(receipt|bookkeeping|expense|categorize|category|invoice)\b/.test(lower)
      || BOOKKEEPING_CATEGORY_PATTERN.test(lower)
    )
  ) {
    return true;
  }

  if (
    hasTool(FOLLOWUP_TOOL_NAME)
    && /\b(follow[- ]?up|stale lead|check[- ]?in|remind|reschedule)\b/.test(lower)
  ) {
    return true;
  }

  if (/\b(use tool|run tool|call tool)\b/.test(lower)) {
    return true;
  }

  return tools.some((tool) => lower.includes(tool.name.toLowerCase()));
}

// ── Tier Classification ──────────────────────────────────────

function classifyTier(signals: RoutingSignals, escalatedFrom: string | null): ModelTier {
  // If escalating, move up one tier: cheap→standard, standard→strong
  if (escalatedFrom !== null) {
    // Determine original tier from the model that failed
    if (escalatedFrom === DEFAULT_MODELS.cheap || escalatedFrom.includes('gemini')) {
      return 'standard';
    }
    return 'strong';
  }

  // Vision always requires at least standard (most vision models are standard+)
  if (signals.requiresVision) {
    return signals.estimatedComplexity === 'high' ? 'strong' : 'standard';
  }

  // High complexity → strong model
  if (signals.estimatedComplexity === 'high') {
    return 'strong';
  }

  // Tool use or medium complexity → standard
  if (signals.requiresToolUse || signals.estimatedComplexity === 'medium') {
    return 'standard';
  }

  // Default: cheap model for simple messages
  return 'cheap';
}

// ── Model Selection ──────────────────────────────────────────

function selectModel(tier: ModelTier, signals: RoutingSignals, settings: RoutingSettings): string {
  // Check DB-configured routing rules first (highest priority wins)
  const matchedRule = settings.routingRules
    .filter((rule) => matchesRoutingRule(rule.pattern, tier, signals))
    .sort((a, b) => b.priority - a.priority)[0];

  if (matchedRule) {
    if (signals.requiresVision && !modelSupportsVision(matchedRule.model)) {
      logger.warn(
        { model: matchedRule.model, tier, pattern: matchedRule.pattern },
        'Routing rule matched a non-vision model for a vision request; falling back to tier-compatible model',
      );
    } else {
    return matchedRule.model;
    }
  }

  return resolveTierModel(tier, signals, settings);
}

export function resolveTierModel(
  tier: ModelTier,
  signals: RoutingSignals,
  settings: RoutingSettings,
): string {
  const standardModel = settings.primaryModel || DEFAULT_MODELS.standard;
  const strongModel = settings.fallbackModel || DEFAULT_MODELS.strong;

  // If vision is needed, ensure the selected model supports it
  if (signals.requiresVision) {
    const candidate = tier === 'strong'
      ? strongModel
      : tier === 'cheap'
        ? DEFAULT_MODELS.standard
        : standardModel;

    if (VISION_MODELS.has(candidate)) {
      return candidate;
    }
    if (VISION_MODELS.has(standardModel)) {
      return standardModel;
    }
    if (VISION_MODELS.has(strongModel)) {
      return strongModel;
    }
    return DEFAULT_MODELS.standard;
  }

  // Use DB-configured primary model if it fits the tier
  if (tier === 'cheap') {
    return DEFAULT_MODELS.cheap;
  }

  if (tier === 'standard' && settings.primaryModel) {
    return standardModel;
  }

  if (tier === 'strong') {
    return strongModel;
  }

  return DEFAULT_MODELS[tier];
}

export function modelSupportsVision(model: string): boolean {
  return VISION_MODELS.has(model);
}

function matchesRoutingRule(
  pattern: string,
  tier: ModelTier,
  signals: RoutingSignals,
): boolean {
  // Simple pattern matching: "tier:strong", "vision:true", "tools:true"
  const lower = pattern.toLowerCase().trim();
  if (lower === `tier:${tier}`) return true;
  if (lower === 'vision:true' && signals.requiresVision) return true;
  if (lower === 'tools:true' && signals.requiresToolUse) return true;
  if (lower === 'complexity:high' && signals.estimatedComplexity === 'high') return true;
  return false;
}

// ── Reason Building ──────────────────────────────────────────

function buildReason(tier: ModelTier, signals: RoutingSignals, escalatedFrom: string | null): string {
  const parts: string[] = [];

  if (escalatedFrom) {
    parts.push(`Escalated from ${escalatedFrom}`);
  }

  if (signals.requiresVision) parts.push('vision required');
  if (signals.requiresToolUse) parts.push('tool use available');
  if (signals.estimatedComplexity === 'high') parts.push('high-complexity request');
  if (signals.estimatedComplexity === 'low' && tier === 'cheap') parts.push('simple message');
  if (signals.hasFollowUpNeed) parts.push('conversational follow-up detected');

  parts.push(`tier=${tier}`);
  parts.push(`msg_len=${signals.messageLength}`);

  return parts.join('; ');
}
