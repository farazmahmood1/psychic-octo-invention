import { Router } from 'express';
import type { Request, Response } from 'express';
import { env, logger } from '@openclaw/config';
import { HTTP_STATUS } from '@openclaw/shared';
import type { TelegramUpdate } from '@openclaw/shared';
import { normalizeTelegramUpdate } from '../../integrations/telegram/normalizer.js';
import { sendChatAction } from '../../integrations/telegram/client.js';
import { telegramChatRepository } from '../../repositories/telegram-chat.repository.js';
import { executeEvent } from '../../orchestration/index.js';
import { deliverToTelegram } from '../../services/channels/index.js';

export const telegramWebhookRouter = Router();

/**
 * Processed update IDs for idempotency within the process lifetime.
 * In production with BullMQ, idempotency is handled by the job queue.
 * This Set provides a lightweight guard against duplicate webhook deliveries.
 */
const processedUpdateIds = new Set<number>();
const MAX_PROCESSED_IDS = 10_000;

/**
 * POST /webhooks/telegram
 *
 * Telegram webhook endpoint. Handles incoming updates from Telegram Bot API.
 *
 * Security:
 * - Validates X-Telegram-Bot-Api-Secret-Token header against TELEGRAM_WEBHOOK_SECRET
 * - No session/CSRF required (external webhook)
 *
 * Fast-path design:
 * - Validates and normalizes the update
 * - Sends "typing" indicator immediately
 * - Runs full orchestration pipeline synchronously (for instant replies)
 * - Delivers reply back to the same Telegram chat
 * - Responds 200 to Telegram after processing
 * - Memory/usage logging failures don't block the reply
 */
telegramWebhookRouter.post(
  '/',
  async (req: Request, res: Response) => {
    // 1. Validate webhook secret
    const secretHeader = req.headers['x-telegram-bot-api-secret-token'];
    if (secretHeader !== env.TELEGRAM_WEBHOOK_SECRET) {
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

    // 3. Idempotency check — prevent duplicate processing
    if (processedUpdateIds.has(update.update_id)) {
      logger.debug({ updateId: update.update_id }, 'Telegram webhook: duplicate update, skipping');
      res.status(HTTP_STATUS.OK).json({ ok: true });
      return;
    }

    // Mark as processed immediately (before async work)
    trackUpdateId(update.update_id);

    // 4. Normalize the update into a channel-agnostic InboundEvent
    let event;
    try {
      event = await normalizeTelegramUpdate(update);
    } catch (err) {
      logger.error({ err, updateId: update.update_id }, 'Failed to normalize Telegram update');
      res.status(HTTP_STATUS.OK).json({ ok: true });
      return;
    }

    if (!event) {
      // Unsupported update type — acknowledge silently
      res.status(HTTP_STATUS.OK).json({ ok: true });
      return;
    }

    const chatId = event.externalThreadId;

    // 5. Send typing indicator immediately (non-blocking)
    sendChatAction(chatId).catch(() => { /* fire-and-forget */ });

    try {
      // 6. Run full orchestration pipeline (fast-path for instant replies)
      const result = await executeEvent(event);

      // 7. Persist Telegram chat mapping (after conversation is created)
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
      // Still respond 200 to prevent Telegram from retrying endlessly
      res.status(HTTP_STATUS.OK).json({ ok: true });
    }
  },
);

/**
 * Track processed update IDs with bounded memory.
 * Evicts oldest entries when the set exceeds MAX_PROCESSED_IDS.
 */
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

/**
 * Persist the Telegram chat mapping for the conversation.
 * Creates or updates the TelegramChat record with user/chat metadata.
 * Runs as fire-and-forget after orchestration creates the conversation.
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
      chatTitle: message.chat.title,
      languageCode: message.from?.language_code,
    } as any,
  });
}
