import { Router } from 'express';
import type { Request, Response } from 'express';
import { env, logger } from '@openclaw/config';
import { HTTP_STATUS } from '@openclaw/shared';
import type { TelegramUpdate } from '@openclaw/shared';
import { normalizeTelegramUpdate } from '../../integrations/telegram/normalizer.js';
import { sendChatAction, sendMessage } from '../../integrations/telegram/client.js';
import { telegramChatRepository } from '../../repositories/telegram-chat.repository.js';
import { executeEvent } from '../../orchestration/index.js';
import { deliverToTelegram } from '../../services/channels/index.js';
import { getRedis } from '../../db/redis.js';

export const telegramWebhookRouter = Router();

/**
 * In-memory fallback dedupe when Redis is unavailable.
 */
const processedUpdateIds = new Set<number>();
const MAX_PROCESSED_IDS = 10_000;
const TELEGRAM_DEDUPE_TTL_SECONDS = 24 * 60 * 60;
const TELEGRAM_DEDUPE_KEY_PREFIX = 'dedupe:telegram:update';
const TELEGRAM_TYPING_KEEPALIVE_MS = 4_000;
const TELEGRAM_ERROR_FALLBACK_REPLY = 'Sorry, I ran into an internal error while processing that. Please try again.';

telegramWebhookRouter.post('/', (req: Request, res: Response) => {
  void handleTelegramWebhook(req, res);
});

async function handleTelegramWebhook(req: Request, res: Response): Promise<void> {
  // 1. Validate webhook secret
  const expectedSecret = env.TELEGRAM_WEBHOOK_SECRET;
  if (!expectedSecret) {
    logger.error('Telegram webhook: TELEGRAM_WEBHOOK_SECRET is not configured');
    res.status(HTTP_STATUS.SERVICE_UNAVAILABLE).json({ error: 'Webhook not configured' });
    return;
  }

  const secretHeader = req.get('x-telegram-bot-api-secret-token');
  if (!secretHeader || secretHeader !== expectedSecret) {
    logger.warn({ ip: req.ip }, 'Telegram webhook: invalid secret token');
    res.status(HTTP_STATUS.UNAUTHORIZED).json({ error: 'Invalid webhook secret' });
    return;
  }

  const update = req.body as TelegramUpdate;

  // 2. Basic update validation
  if (!update || typeof update.update_id !== 'number') {
    logger.warn('Telegram webhook: invalid update structure');
    res.status(HTTP_STATUS.BAD_REQUEST).json({ error: 'Invalid update' });
    return;
  }

  // 3. Idempotency check
  const duplicate = await isDuplicateUpdate(update.update_id);
  if (duplicate) {
    logger.debug({ updateId: update.update_id }, 'Telegram webhook: duplicate update, skipping');
    res.status(HTTP_STATUS.OK).json({ ok: true });
    return;
  }

  // 4. Normalize into channel-agnostic InboundEvent
  let event;
  try {
    event = await normalizeTelegramUpdate(update);
  } catch (err) {
    logger.error({ err, updateId: update.update_id }, 'Failed to normalize Telegram update');
    res.status(HTTP_STATUS.OK).json({ ok: true });
    return;
  }

  if (!event) {
    res.status(HTTP_STATUS.OK).json({ ok: true });
    return;
  }

  const chatId = event.externalThreadId;

  // 5. Keep typing indicator active while orchestration runs.
  const stopTypingKeepalive = startTypingKeepalive(chatId);

  try {
    // 6. Run orchestration pipeline for instant replies
    const result = await executeEvent(event);

    // 7. Persist Telegram chat mapping
    persistTelegramChatMapping(result.conversationId, update).catch((err) => {
      logger.warn({ err, chatId }, 'Failed to persist Telegram chat mapping');
    });

    // 8. Deliver reply to Telegram
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

    res.status(HTTP_STATUS.OK).json({ ok: true });
  } catch (err) {
    logger.error({ err, updateId: update.update_id, chatId }, 'Telegram webhook processing error');

    // Best-effort fallback so users aren't left without any response.
    try {
      await sendMessage(chatId, TELEGRAM_ERROR_FALLBACK_REPLY);
    } catch (notifyErr) {
      logger.error({ err: notifyErr, chatId, updateId: update.update_id }, 'Failed to send Telegram fallback error reply');
    }

    // Return 200 to prevent runaway retries by Telegram
    res.status(HTTP_STATUS.OK).json({ ok: true });
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
    // Fire and forget
  });

  const timer = setInterval(() => {
    void sendChatAction(chatId).catch(() => {
      // Fire and forget
    });
  }, TELEGRAM_TYPING_KEEPALIVE_MS);
  timer.unref();

  return () => clearInterval(timer);
}

/**
 * Persist Telegram chat mapping after conversation creation.
 */
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
