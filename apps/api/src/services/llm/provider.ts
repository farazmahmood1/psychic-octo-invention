import type { LlmRequest, LlmResponse } from '@nexclaw/shared';

/**
 * Abstract LLM provider interface.
 * Concrete implementations wrap specific APIs (OpenRouter, direct OpenAI, etc.).
 * Business logic never calls provider APIs directly — always through this interface.
 */
export interface LlmProvider {
  readonly name: string;

  /**
   * Send a chat completion request.
   * Implementations must normalize responses into the standard LlmResponse shape.
   * Must handle timeouts and transient errors internally with retries where appropriate.
   */
  complete(request: LlmRequest): Promise<LlmResponse>;

  /**
   * Check whether this provider supports a given model.
   */
  supportsModel(model: string): boolean;
}
