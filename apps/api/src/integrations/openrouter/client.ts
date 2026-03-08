import { env } from '@openclaw/config';
import { logger } from '@openclaw/config';
import type {
  LlmRequest,
  LlmResponse,
  LlmToolCall,
  LlmUsage,
  LlmMessage,
  LlmImage,
} from '@openclaw/shared';
import type { LlmProvider } from '../../services/llm/provider.js';

const REQUEST_TIMEOUT_MS = 60_000;
const MAX_RETRIES = 2;
const RETRY_DELAY_MS = 1_000;

interface ModelPricing {
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

/**
 * OpenRouter LLM provider.
 * Wraps the OpenRouter chat completions API (OpenAI-compatible).
 * All provider-specific logic is isolated here.
 */
export class OpenRouterProvider implements LlmProvider {
  readonly name = 'openrouter';
  private readonly baseUrl: string;
  private readonly apiKey: string;

  constructor() {
    this.baseUrl = env.OPENROUTER_BASE_URL;
    this.apiKey = env.OPENROUTER_API_KEY ?? '';
  }

  supportsModel(_model: string): boolean {
    // OpenRouter supports virtually all models via routing
    return true;
  }

  async complete(request: LlmRequest): Promise<LlmResponse> {
    const startTime = Date.now();
    const body = this.buildRequestBody(request);

    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      try {
        if (attempt > 0) {
          await sleep(RETRY_DELAY_MS * attempt);
        }

        const response = await fetch(`${this.baseUrl}/chat/completions`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${this.apiKey}`,
            'HTTP-Referer': env.APP_BASE_URL,
            'X-Title': 'OpenClaw Admin System',
          },
          body: JSON.stringify(body),
          signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        });

        if (!response.ok) {
          const errorBody = await response.text().catch(() => 'unknown');
          const err = new Error(`OpenRouter HTTP ${response.status}: ${errorBody}`);

          // Don't retry 4xx (client errors) except 429 (rate limit)
          if (response.status >= 400 && response.status < 500 && response.status !== 429) {
            throw err;
          }
          lastError = err;
          logger.warn({ attempt, status: response.status }, 'OpenRouter transient error, retrying');
          continue;
        }

        const data = await response.json() as OpenRouterResponse;
        const latencyMs = Date.now() - startTime;

        return this.parseResponse(data, request.model, latencyMs);
      } catch (err) {
        lastError = err instanceof Error ? err : new Error(String(err));

        // AbortError = timeout, retry
        if (lastError.name === 'AbortError' || lastError.name === 'TimeoutError') {
          logger.warn({ attempt }, 'OpenRouter request timed out, retrying');
          continue;
        }

        // Non-retryable errors
        if (attempt === MAX_RETRIES || (lastError.message.includes('HTTP 4') && !lastError.message.includes('429'))) {
          break;
        }
      }
    }

    throw lastError ?? new Error('OpenRouter request failed after retries');
  }

  private buildRequestBody(request: LlmRequest): Record<string, unknown> {
    const messages = request.messages.map((msg) => this.formatMessage(msg));

    const body: Record<string, unknown> = {
      model: request.model,
      messages,
      ...(request.temperature != null ? { temperature: request.temperature } : {}),
      ...(request.maxTokens != null ? { max_tokens: request.maxTokens } : {}),
      ...(request.providerOptions ?? {}),
    };

    if (request.tools && request.tools.length > 0) {
      body['tools'] = request.tools.map((t) => ({
        type: 'function',
        function: {
          name: t.name,
          description: t.description,
          parameters: t.parameters,
        },
      }));
    }

    return body;
  }

  private formatMessage(msg: LlmMessage): Record<string, unknown> {
    // Vision: multipart content with images
    if (msg.images && msg.images.length > 0) {
      const parts: unknown[] = [{ type: 'text', text: msg.content }];
      for (const img of msg.images) {
        parts.push(this.formatImage(img));
      }
      return { role: msg.role, content: parts };
    }

    const result: Record<string, unknown> = { role: msg.role, content: msg.content };
    if (msg.toolCallId) {
      result['tool_call_id'] = msg.toolCallId;
    }
    return result;
  }

  private formatImage(img: LlmImage): Record<string, unknown> {
    if (img.base64) {
      return {
        type: 'image_url',
        image_url: { url: `data:${img.mimeType};base64,${img.base64}` },
      };
    }
    return {
      type: 'image_url',
      image_url: { url: img.url },
    };
  }

  private parseResponse(data: OpenRouterResponse, requestModel: string, latencyMs: number): LlmResponse {
    const choice = data.choices?.[0];
    const message = choice?.message;

    const content = message?.content ?? '';
    const toolCalls: LlmToolCall[] = (message?.tool_calls ?? []).map((tc) => ({
      id: tc.id,
      name: tc.function.name,
      arguments: tc.function.arguments,
    }));

    const finishReason = choice?.finish_reason === 'tool_calls' ? 'tool_calls'
      : choice?.finish_reason === 'length' ? 'length'
        : toolCalls.length > 0 ? 'tool_calls'
          : 'stop';

    const usage: LlmUsage = {
      promptTokens: data.usage?.prompt_tokens ?? 0,
      completionTokens: data.usage?.completion_tokens ?? 0,
      totalTokens: data.usage?.total_tokens ?? 0,
      estimatedCostUsd: estimateCostUsd(
        data.model ?? requestModel,
        data.usage?.prompt_tokens ?? 0,
        data.usage?.completion_tokens ?? 0,
      ),
    };

    return {
      content,
      toolCalls,
      usage,
      model: data.model ?? requestModel,
      finishReason,
      latencyMs,
    };
  }
}

// ── OpenRouter Response Types (private to this module) ───────

interface OpenRouterResponse {
  id?: string;
  model?: string;
  choices?: Array<{
    message?: {
      role?: string;
      content?: string | null;
      tool_calls?: Array<{
        id: string;
        type: string;
        function: { name: string; arguments: string };
      }>;
    };
    finish_reason?: string;
  }>;
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    total_tokens?: number;
  };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function estimateCostUsd(
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

function resolveModelPricing(model: string): ModelPricing | null {
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

function normalizeModelName(model: string): string {
  return model.trim().toLowerCase().replace(/:free$/, '');
}

/** Singleton OpenRouter provider instance */
export const openRouterProvider = new OpenRouterProvider();
