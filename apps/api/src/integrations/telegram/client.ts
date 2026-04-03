import { env, logger } from '@nexclaw/config';
import type { TelegramSendResult, TelegramUpdate } from '@nexclaw/shared';

const TELEGRAM_API_BASE_ROOT = env.TELEGRAM_API_BASE_URL.replace(/\/+$/, '');
const TELEGRAM_API_BASE = `${TELEGRAM_API_BASE_ROOT}/bot${env.TELEGRAM_BOT_TOKEN}`;
const TIMEOUT_MS = 30_000;
const MAX_RETRIES = 2;

interface TelegramCallOptions {
  timeoutMs?: number;
}

interface TelegramApiResult<T> {
  ok: boolean;
  result?: T;
  description?: string;
  error_code?: number;
}

/**
 * Low-level Telegram Bot API client.
 * Handles HTTP calls, retries on transient errors, and timeout management.
 */

async function callApi<T>(
  method: string,
  body: Record<string, unknown>,
  options?: TelegramCallOptions,
): Promise<T> {
  let lastError: Error | null = null;
  const timeoutMs = options?.timeoutMs ?? TIMEOUT_MS;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), timeoutMs);
      let res: Response;
      try {
        res = await fetch(`${TELEGRAM_API_BASE}/${method}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
          signal: controller.signal,
        });
      } finally {
        clearTimeout(timeout);
      }

      if (res.ok) {
        return (await res.json()) as T;
      }

      const errorBody = await res.text();

      // Don't retry client errors (4xx) except 429
      if (res.status >= 400 && res.status < 500 && res.status !== 429) {
        throw new Error(`Telegram API ${method} failed: ${res.status} ${errorBody}`);
      }

      // Retryable: 429 or 5xx
      lastError = new Error(`Telegram API ${method}: ${res.status} ${errorBody}`);

      if (res.status === 429) {
        const retryAfter = parseInt(res.headers.get('retry-after') ?? '2', 10);
        await delay(retryAfter * 1000);
      } else {
        await delay(1000 * (attempt + 1));
      }
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') {
        lastError = new Error(`Telegram API ${method} timed out after ${timeoutMs}ms`);
      } else {
        lastError = err instanceof Error ? err : new Error(String(err));
      }

      if (attempt < MAX_RETRIES) {
        await delay(1000 * (attempt + 1));
      }
    }
  }

  throw lastError ?? new Error(`Telegram API ${method} failed after retries`);
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ── Public API ──────────────────────────────────────────────

/**
 * Send a text message to a Telegram chat.
 */
export async function sendMessage(
  chatId: string | number,
  text: string,
  options?: {
    parseMode?: 'HTML' | 'Markdown' | 'MarkdownV2';
    replyToMessageId?: number;
    disableNotification?: boolean;
  },
): Promise<TelegramSendResult> {
  // Telegram max message length is 4096 characters
  const truncatedText = text.length > 4096 ? text.slice(0, 4093) + '...' : text;

  return callApi<TelegramSendResult>('sendMessage', {
    chat_id: chatId,
    text: truncatedText,
    parse_mode: options?.parseMode,
    reply_to_message_id: options?.replyToMessageId,
    disable_notification: options?.disableNotification,
  });
}

/**
 * Send a "typing" action indicator.
 */
export async function sendChatAction(
  chatId: string | number,
  action: 'typing' | 'upload_photo' | 'upload_document' = 'typing',
): Promise<void> {
  try {
    await callApi('sendChatAction', { chat_id: chatId, action });
  } catch (err) {
    // Non-critical: don't fail the pipeline for a typing indicator
    logger.debug({ err, chatId }, 'Failed to send chat action');
  }
}

/**
 * Get file download URL from Telegram servers.
 * Used to retrieve photos/documents for vision processing.
 */
export async function getFileUrl(fileId: string): Promise<string | null> {
  try {
    const result = await callApi<TelegramApiResult<{ file_path?: string }>>('getFile', {
      file_id: fileId,
    });

    if (result.ok && result.result?.file_path) {
      return `${TELEGRAM_API_BASE_ROOT}/file/bot${env.TELEGRAM_BOT_TOKEN}/${result.result.file_path}`;
    }
    return null;
  } catch (err) {
    logger.warn({ err, fileId }, 'Failed to get Telegram file URL');
    return null;
  }
}

/**
 * Register the webhook URL with Telegram.
 * Called during app startup or via admin action.
 */
export async function setWebhook(
  url: string,
  options?: { secretToken?: string; allowedUpdates?: string[] },
): Promise<boolean> {
  try {
    const result = await callApi<TelegramApiResult<true>>('setWebhook', {
      url,
      secret_token: options?.secretToken,
      allowed_updates: options?.allowedUpdates ?? ['message', 'edited_message'],
      max_connections: 40,
    });

    if (result.ok) {
      logger.info({ url }, 'Telegram webhook registered');
    } else {
      logger.error({ description: result.description }, 'Failed to set Telegram webhook');
    }

    return result.ok;
  } catch (err) {
    logger.error({ err, url }, 'Failed to set Telegram webhook');
    return false;
  }
}

/**
 * Remove the current webhook (useful for switching to polling in dev).
 */
export async function deleteWebhook(): Promise<boolean> {
  try {
    const result = await callApi<TelegramApiResult<true>>('deleteWebhook', {});
    return result.ok;
  } catch (err) {
    logger.error({ err }, 'Failed to delete Telegram webhook');
    return false;
  }
}

export async function getUpdates(
  offset?: number,
  options?: { timeoutSeconds?: number; allowedUpdates?: string[] },
): Promise<TelegramApiResult<TelegramUpdate[]>> {
  const timeoutSeconds = options?.timeoutSeconds ?? 10;

  return callApi<TelegramApiResult<TelegramUpdate[]>>(
    'getUpdates',
    {
      offset,
      timeout: timeoutSeconds,
      allowed_updates: options?.allowedUpdates ?? ['message'],
    },
    {
      timeoutMs: (timeoutSeconds + 5) * 1000,
    },
  );
}
