import { logger } from '@openclaw/config';
import type { ChannelDeliveryResult } from '@openclaw/shared';
import { prisma } from '../../db/client.js';
import { sendMessage } from '../../integrations/telegram/index.js';
import { telegramChatRepository } from '../../repositories/telegram-chat.repository.js';

/**
 * Deliver an outbound message to a Telegram chat.
 *
 * Flow:
 * 1. Resolve the Telegram chat ID from conversation
 * 2. Send via Telegram Bot API
 * 3. Update message status (pending → sent or failed)
 * 4. Store external message ID for tracking
 */
export async function deliverToTelegram(
  conversationId: string,
  messageId: string,
  content: string,
  telegramChatId?: string,
  replyToMessageId?: number,
): Promise<ChannelDeliveryResult> {
  // Resolve Telegram chat ID if not provided
  let chatId = telegramChatId;
  if (!chatId) {
    const telegramChat = await telegramChatRepository.findByConversationId(conversationId);
    if (!telegramChat) {
      logger.error({ conversationId }, 'No Telegram chat found for conversation');
      await updateMessageStatus(messageId, 'failed');
      return { success: false, externalMessageId: null, error: 'No Telegram chat mapping found' };
    }
    chatId = telegramChat.telegramChatId;
  }

  try {
    const result = await sendMessage(chatId, content, {
      replyToMessageId,
    });

    if (result.ok && result.result) {
      const externalMessageId = String(result.result.message_id);

      // Update message status to 'sent' and store external ID
      await updateMessageStatus(messageId, 'sent', {
        telegramMessageId: result.result.message_id,
      });

      logger.info(
        { conversationId, messageId, telegramMessageId: result.result.message_id },
        'Message delivered to Telegram',
      );

      return { success: true, externalMessageId, error: null };
    }

    // API returned ok=false
    const errorMsg = result.description ?? 'Unknown Telegram API error';
    logger.error({ conversationId, messageId, error: errorMsg }, 'Telegram delivery failed');
    await updateMessageStatus(messageId, 'failed');
    return { success: false, externalMessageId: null, error: errorMsg };
  } catch (err) {
    const error = err instanceof Error ? err : new Error(String(err));
    logger.error({ err: error, conversationId, messageId }, 'Telegram delivery error');
    await updateMessageStatus(messageId, 'failed');
    return { success: false, externalMessageId: null, error: error.message };
  }
}

async function updateMessageStatus(
  messageId: string,
  status: 'sent' | 'delivered' | 'failed',
  metadata?: Record<string, unknown>,
): Promise<void> {
  try {
    await prisma.message.update({
      where: { id: messageId },
      data: {
        status,
        ...(metadata ? { metadata: metadata as any } : {}),
      },
    });
  } catch (err) {
    logger.warn({ err, messageId, status }, 'Failed to update message delivery status');
  }
}
