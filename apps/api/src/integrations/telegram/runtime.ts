import { env, logger } from '@nexclaw/config';
import { deleteWebhook, getUpdates, setWebhook } from './client.js';
import { processTelegramUpdate } from './processor.js';

const TELEGRAM_WEBHOOK_PATH = '/webhooks/telegram';
const TELEGRAM_POLL_TIMEOUT_SECONDS = 10;
const TELEGRAM_POLL_RETRY_DELAY_MS = 2_000;

export type TelegramIngressMode = 'disabled' | 'webhook' | 'polling';

export interface TelegramRuntimeHandle {
  mode: TelegramIngressMode;
  stop: () => Promise<void>;
}

interface TelegramIngressConfig {
  nodeEnv: 'development' | 'production' | 'test';
  botToken?: string;
  webhookSecret?: string;
  apiBaseUrl?: string;
  appBaseUrl?: string;
  renderExternalUrl?: string;
}

interface TelegramIngressResolution {
  mode: TelegramIngressMode;
  reason: 'missing_bot_token' | 'missing_webhook_secret' | 'no_public_https_base_url' | 'webhook_ready';
  webhookUrl: string | null;
}

export function resolveTelegramIngressMode(
  config: TelegramIngressConfig = createIngressConfigFromEnv(),
): TelegramIngressResolution {
  if (!hasConfiguredValue(config.botToken)) {
    return { mode: 'disabled', reason: 'missing_bot_token', webhookUrl: null };
  }

  const publicBaseUrl = resolveTelegramPublicBaseUrl(config);
  if (publicBaseUrl && hasConfiguredValue(config.webhookSecret)) {
    return {
      mode: 'webhook',
      reason: 'webhook_ready',
      webhookUrl: `${publicBaseUrl}${TELEGRAM_WEBHOOK_PATH}`,
    };
  }

  return {
    mode: 'polling',
    reason: publicBaseUrl ? 'missing_webhook_secret' : 'no_public_https_base_url',
    webhookUrl: null,
  };
}

export async function startTelegramRuntime(): Promise<TelegramRuntimeHandle> {
  const resolution = resolveTelegramIngressMode();

  if (resolution.mode === 'disabled') {
    return createIdleHandle('disabled');
  }

  if (resolution.mode === 'webhook' && resolution.webhookUrl) {
    const registered = await setWebhook(resolution.webhookUrl, {
      secretToken: env.TELEGRAM_WEBHOOK_SECRET,
      allowedUpdates: ['message'],
    });

    if (registered) {
      logger.info({ webhookUrl: resolution.webhookUrl }, 'Telegram webhook ensured on startup');
      return createIdleHandle('webhook');
    }

    if (env.NODE_ENV === 'production') {
      logger.error(
        { webhookUrl: resolution.webhookUrl },
        'Failed to ensure Telegram webhook on startup; polling fallback is disabled in production',
      );
      return createIdleHandle('disabled');
    }

    logger.warn(
      { webhookUrl: resolution.webhookUrl },
      'Failed to ensure Telegram webhook on startup; falling back to polling',
    );
  } else if (resolution.reason === 'missing_webhook_secret') {
    logger.warn(
      'Telegram bot token is configured but TELEGRAM_WEBHOOK_SECRET is missing. Falling back to polling in development.',
    );
  } else if (resolution.reason === 'no_public_https_base_url') {
    logger.info(
      'Telegram webhook auto-registration skipped: no public HTTPS API base URL is configured. Falling back to polling in development.',
    );
  }

  if (env.NODE_ENV === 'production') {
    logger.warn('Telegram polling fallback is disabled in production.');
    return createIdleHandle('disabled');
  }

  return startTelegramPollingRuntime();
}

function createIngressConfigFromEnv(): TelegramIngressConfig {
  return {
    nodeEnv: env.NODE_ENV,
    botToken: env.TELEGRAM_BOT_TOKEN,
    webhookSecret: env.TELEGRAM_WEBHOOK_SECRET,
    apiBaseUrl: env.API_BASE_URL,
    appBaseUrl: env.APP_BASE_URL,
    renderExternalUrl: env.RENDER_EXTERNAL_URL,
  };
}

function resolveTelegramPublicBaseUrl(config: TelegramIngressConfig): string | null {
  const candidates = [config.apiBaseUrl, config.renderExternalUrl, config.appBaseUrl];

  for (const candidate of candidates) {
    const normalized = normalizePublicHttpsUrl(candidate);
    if (normalized) {
      return normalized;
    }
  }

  return null;
}

function normalizePublicHttpsUrl(value: string | undefined): string | null {
  if (!value) return null;

  const trimmed = value.trim();
  if (!trimmed) return null;

  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    return null;
  }

  if (url.protocol !== 'https:') {
    return null;
  }

  const hostname = url.hostname.toLowerCase();
  if (
    hostname === 'localhost'
    || hostname === '127.0.0.1'
    || hostname === '::1'
    || hostname.endsWith('.local')
    || isPrivateIpv4(hostname)
  ) {
    return null;
  }

  return trimmed.replace(/\/+$/, '');
}

function isPrivateIpv4(hostname: string): boolean {
  const parts = hostname.split('.');
  if (parts.length !== 4 || !parts.every((part) => /^\d{1,3}$/.test(part))) {
    return false;
  }

  const first = Number(parts[0]);
  const second = Number(parts[1]);
  if (Number.isNaN(first) || Number.isNaN(second)) {
    return false;
  }

  return first === 10
    || first === 127
    || (first === 172 && second >= 16 && second <= 31)
    || (first === 192 && second === 168);
}

function hasConfiguredValue(value: string | undefined): boolean {
  if (!value) return false;
  const normalized = value.trim().toLowerCase();
  if (!normalized) return false;
  return !normalized.startsWith('change-me');
}

function createIdleHandle(mode: TelegramIngressMode): TelegramRuntimeHandle {
  return {
    mode,
    stop: async () => {},
  };
}

async function startTelegramPollingRuntime(): Promise<TelegramRuntimeHandle> {
  const clearedWebhook = await deleteWebhook();
  if (!clearedWebhook) {
    logger.warn('Telegram polling startup could not clear an existing webhook. Polling may fail until the webhook is removed.');
  }

  const state = { stopped: false };
  const loopPromise = runTelegramPollingLoop(state);

  logger.info('Telegram polling started');

  return {
    mode: 'polling',
    stop: async () => {
      state.stopped = true;
      await loopPromise;
    },
  };
}

async function runTelegramPollingLoop(state: { stopped: boolean }): Promise<void> {
  let offset: number | undefined;

  while (!state.stopped) {
    try {
      const response = await getUpdates(offset, {
        timeoutSeconds: TELEGRAM_POLL_TIMEOUT_SECONDS,
        allowedUpdates: ['message'],
      });

      if (!response.ok) {
        throw new Error(response.description ?? 'Telegram getUpdates returned ok=false');
      }

      for (const update of response.result ?? []) {
        await processTelegramUpdate(update);
        offset = update.update_id + 1;

        if (state.stopped) {
          break;
        }
      }
    } catch (err) {
      if (state.stopped) {
        break;
      }

      logger.error({ err }, 'Telegram polling loop error');
      await delay(TELEGRAM_POLL_RETRY_DELAY_MS);
    }
  }
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
