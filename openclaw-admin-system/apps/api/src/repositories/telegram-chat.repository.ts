import { BaseRepository } from '../db/repository.js';
import type { Prisma } from '@prisma/client';

export class TelegramChatRepository extends BaseRepository {
  /**
   * Find or create a TelegramChat record linked to a conversation.
   * Ensures the Telegram-specific metadata is persisted alongside
   * the channel-agnostic Conversation record.
   */
  async upsert(data: {
    conversationId: string;
    telegramChatId: string;
    telegramUserId?: string;
    username?: string;
    firstName?: string;
    lastName?: string;
    chatType: string;
    metadata?: Prisma.InputJsonValue;
  }) {
    return this.db.telegramChat.upsert({
      where: { telegramChatId: data.telegramChatId },
      update: {
        telegramUserId: data.telegramUserId,
        username: data.username,
        firstName: data.firstName,
        lastName: data.lastName,
        chatType: data.chatType,
        metadata: data.metadata,
      },
      create: {
        conversationId: data.conversationId,
        telegramChatId: data.telegramChatId,
        telegramUserId: data.telegramUserId,
        username: data.username,
        firstName: data.firstName,
        lastName: data.lastName,
        chatType: data.chatType,
        metadata: data.metadata,
      },
    });
  }

  async findByTelegramChatId(telegramChatId: string) {
    return this.db.telegramChat.findUnique({
      where: { telegramChatId },
      include: { conversation: true },
    });
  }

  async findByConversationId(conversationId: string) {
    return this.db.telegramChat.findUnique({
      where: { conversationId },
    });
  }
}

export const telegramChatRepository = new TelegramChatRepository();
