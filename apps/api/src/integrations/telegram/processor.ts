import { logger } from '@openclaw/config';
import type { TelegramUpdate } from '@openclaw/shared';
import { getRedis } from '../../db/redis.js';
import { executeEvent } from '../../orchestration/index.js';
import { telegramChatRepository } from '../../repositories/telegram-chat.repository.js';
import { deliverToTelegram } from '../../services/channels/index.js';
import { normalizeTelegramUpdate } from './normalizer.js';
import { sendChatAction, sendMessage } from './client.js';

const processedUpdateIds = new Set<number>();
const MAX_PROCESSED_IDS = 10_000;
const TELEGRAM_DEDUPE_TTL_SECONDS = 24 * 60 * 60;
const TELEGRAM_DEDUPE_KEY_PREFIX = 'dedupe:telegram:update';
const TELEGRAM_TYPING_KEEPALIVE_MS = 4_000;
const TELEGRAM_ERROR_FALLBACK_REPLY = 'Sorry, I ran into an internal error while processing that. Please try again.';

export async function processTelegramUpdate(update: TelegramUpdate): Promise<void> {
  const duplicate = await isDuplicateUpdate(update.update_id);
  if (duplicate) {
    logger.debug({ updateId: update.update_id }, 'Telegram update already processed, skipping');
    return;
  }

  let event;
  try {
    event = await normalizeTelegramUpdate(update);
  } catch (err) {
    logger.error({ err, updateId: update.update_id }, 'Failed to normalize Telegram update');
    return;
  }

  if (!event) {
    return;
  }

  const chatId = event.externalThreadId;
  const stopTypingKeepalive = startTypingKeepalive(chatId);

  try {
    const result = await executeEvent(event);

    persistTelegramChatMapping(result.conversationId, update).catch((err) => {
      logger.warn({ err, chatId }, 'Failed to persist Telegram chat mapping');
    });

    if (result.reply) {
      const inboundTgMessageId = (event.metadata['telegramMessageId'] as number) ?? undefined;

      const deliveryResult = await deliverToTelegram(
        result.conversationId,
        result.messageId,
        result.reply,
        chatId,
        inboundTgMessageId,
      );

      if (!deliveryResult.success) {
        logger.error(
          { conversationId: result.conversationId, error: deliveryResult.error },
          'Telegram reply delivery failed',
        );
      }
    }

    if (result.warnings.length > 0) {
      logger.warn(
        { warnings: result.warnings, conversationId: result.conversationId },
        'Telegram orchestration completed with warnings',
      );
    }
  } catch (err) {
    logger.error({ err, updateId: update.update_id, chatId }, 'Telegram update processing error');

    try {
      await sendMessage(chatId, TELEGRAM_ERROR_FALLBACK_REPLY);
    } catch (notifyErr) {
      logger.error({ err: notifyErr, chatId, updateId: update.update_id }, 'Failed to send Telegram fallback error reply');
    }
  } finally {
    stopTypingKeepalive();
  }
}

function trackUpdateId(updateId: number): void {
  processedUpdateIds.add(updateId);

  if (processedUpdateIds.size > MAX_PROCESSED_IDS) {
    const iterator = processedUpdateIds.values();
    const toRemove = processedUpdateIds.size - MAX_PROCESSED_IDS + 1000;
    for (let i = 0; i < toRemove; i++) {
      const value = iterator.next().value;
      if (value !== undefined) {
        processedUpdateIds.delete(value);
      }
    }
  }
}

async function isDuplicateUpdate(updateId: number): Promise<boolean> {
  const redis = getRedis();
  if (redis) {
    const key = `${TELEGRAM_DEDUPE_KEY_PREFIX}:${updateId}`;
    try {
      const setResult = await redis.set(key, '1', 'EX', TELEGRAM_DEDUPE_TTL_SECONDS, 'NX');
      return setResult !== 'OK';
    } catch (err) {
      logger.warn({ err, updateId }, 'Telegram dedupe Redis check failed, falling back to in-memory');
    }
  }

  if (processedUpdateIds.has(updateId)) {
    return true;
  }

  trackUpdateId(updateId);
  return false;
}

function startTypingKeepalive(chatId: string): () => void {
  sendChatAction(chatId).catch(() => {
    // Fire and forget.
  });

  const timer = setInterval(() => {
    void sendChatAction(chatId).catch(() => {
      // Fire and forget.
    });
  }, TELEGRAM_TYPING_KEEPALIVE_MS);
  timer.unref();

  return () => clearInterval(timer);
}

async function persistTelegramChatMapping(
  conversationId: string,
  update: TelegramUpdate,
): Promise<void> {
  const message = update.message;
  if (!message) return;

  await telegramChatRepository.upsert({
    conversationId,
    telegramChatId: String(message.chat.id),
    telegramUserId: message.from ? String(message.from.id) : undefined,
    username: message.from?.username,
    firstName: message.from?.first_name,
    lastName: message.from?.last_name,
    chatType: message.chat.type,
    metadata: {
      chatTitle: message.chat.title ?? null,
      languageCode: message.from?.language_code ?? null,
    },
  });
}
