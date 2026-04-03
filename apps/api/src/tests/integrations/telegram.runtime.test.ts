import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { env } from '@nexclaw/config';

vi.mock('../../integrations/telegram/client.js', () => ({
  deleteWebhook: vi.fn().mockResolvedValue(true),
  getUpdates: vi.fn().mockResolvedValue({ ok: true, result: [] }),
  setWebhook: vi.fn().mockResolvedValue(true),
}));

vi.mock('../../integrations/telegram/processor.js', () => ({
  processTelegramUpdate: vi.fn().mockResolvedValue(undefined),
}));

import { deleteWebhook, getUpdates, setWebhook } from '../../integrations/telegram/client.js';
import { resolveTelegramIngressMode, startTelegramRuntime } from '../../integrations/telegram/runtime.js';

const originalEnv = {
  NODE_ENV: env.NODE_ENV,
  TELEGRAM_BOT_TOKEN: env.TELEGRAM_BOT_TOKEN,
  TELEGRAM_WEBHOOK_SECRET: env.TELEGRAM_WEBHOOK_SECRET,
  API_BASE_URL: env.API_BASE_URL,
  APP_BASE_URL: env.APP_BASE_URL,
  RENDER_EXTERNAL_URL: env.RENDER_EXTERNAL_URL,
};

describe('Telegram runtime', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    env.NODE_ENV = originalEnv.NODE_ENV;
    env.TELEGRAM_BOT_TOKEN = originalEnv.TELEGRAM_BOT_TOKEN;
    env.TELEGRAM_WEBHOOK_SECRET = originalEnv.TELEGRAM_WEBHOOK_SECRET;
    env.API_BASE_URL = originalEnv.API_BASE_URL;
    env.APP_BASE_URL = originalEnv.APP_BASE_URL;
    env.RENDER_EXTERNAL_URL = originalEnv.RENDER_EXTERNAL_URL;
  });

  it('resolves to polling when only localhost URLs are configured', () => {
    const resolution = resolveTelegramIngressMode({
      nodeEnv: 'development',
      botToken: 'telegram-token',
      webhookSecret: '1234567890123456',
      apiBaseUrl: 'http://localhost:4000',
      appBaseUrl: 'http://localhost:4000',
      renderExternalUrl: undefined,
    });

    expect(resolution.mode).toBe('polling');
    expect(resolution.reason).toBe('no_public_https_base_url');
    expect(resolution.webhookUrl).toBeNull();
  });

  it('resolves to webhook when a public https URL and webhook secret are available', () => {
    const resolution = resolveTelegramIngressMode({
      nodeEnv: 'development',
      botToken: 'telegram-token',
      webhookSecret: '1234567890123456',
      apiBaseUrl: 'https://bot.example.com',
      appBaseUrl: 'http://localhost:4000',
      renderExternalUrl: undefined,
    });

    expect(resolution.mode).toBe('webhook');
    expect(resolution.reason).toBe('webhook_ready');
    expect(resolution.webhookUrl).toBe('https://bot.example.com/webhooks/telegram');
  });

  it('starts polling instead of webhook mode for localhost development config', async () => {
    env.NODE_ENV = 'development';
    env.TELEGRAM_BOT_TOKEN = 'telegram-token';
    env.TELEGRAM_WEBHOOK_SECRET = '1234567890123456';
    env.API_BASE_URL = 'http://localhost:4000';
    env.APP_BASE_URL = 'http://localhost:4000';
    env.RENDER_EXTERNAL_URL = undefined;

    let releasePoll: (() => void) | null = null;
    vi.mocked(getUpdates).mockImplementationOnce(
      () => new Promise((resolve) => {
        releasePoll = () => resolve({ ok: true, result: [] });
      }),
    );

    const runtime = await startTelegramRuntime();

    expect(runtime.mode).toBe('polling');
    expect(deleteWebhook).toHaveBeenCalledTimes(1);
    expect(setWebhook).not.toHaveBeenCalled();

    const stopPromise = runtime.stop();
    releasePoll?.();
    await stopPromise;
  });

  it('registers a webhook when a public https URL is available', async () => {
    env.NODE_ENV = 'development';
    env.TELEGRAM_BOT_TOKEN = 'telegram-token';
    env.TELEGRAM_WEBHOOK_SECRET = '1234567890123456';
    env.API_BASE_URL = 'https://bot.example.com';
    env.APP_BASE_URL = 'http://localhost:4000';
    env.RENDER_EXTERNAL_URL = undefined;

    const runtime = await startTelegramRuntime();

    expect(runtime.mode).toBe('webhook');
    expect(setWebhook).toHaveBeenCalledWith(
      'https://bot.example.com/webhooks/telegram',
      expect.objectContaining({
        secretToken: '1234567890123456',
        allowedUpdates: ['message'],
      }),
    );
    expect(deleteWebhook).not.toHaveBeenCalled();

    await runtime.stop();
  });
});
