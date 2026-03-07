import type { LlmProvider } from './provider.js';
import { openRouterProvider } from '../../integrations/openrouter/client.js';

/**
 * Provider registry.
 * Currently only OpenRouter is registered; additional providers (e.g., direct
 * OpenAI/Anthropic for ChatGPT 5.2 fallback) can be added by calling register().
 */
class ProviderRegistry {
  private providers = new Map<string, LlmProvider>();
  private defaultProvider: string;

  constructor() {
    this.defaultProvider = 'openrouter';
    this.register(openRouterProvider);
  }

  register(provider: LlmProvider): void {
    this.providers.set(provider.name, provider);
  }

  get(name: string): LlmProvider | undefined {
    return this.providers.get(name);
  }

  getDefault(): LlmProvider {
    const provider = this.providers.get(this.defaultProvider);
    if (!provider) {
      throw new Error(`Default LLM provider "${this.defaultProvider}" not registered`);
    }
    return provider;
  }

  /** Find any provider that supports the given model */
  findForModel(model: string): LlmProvider | undefined {
    for (const provider of this.providers.values()) {
      if (provider.supportsModel(model)) {
        return provider;
      }
    }
    return undefined;
  }
}

export const providerRegistry = new ProviderRegistry();
