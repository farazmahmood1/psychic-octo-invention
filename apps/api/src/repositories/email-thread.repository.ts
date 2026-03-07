import { BaseRepository } from '../db/repository.js';
import type { Prisma } from '@prisma/client';

export class EmailThreadRepository extends BaseRepository {
  /**
   * Find or create an EmailThread record linked to a conversation.
   * Ensures email-specific metadata is persisted alongside
   * the channel-agnostic Conversation record.
   */
  async upsert(data: {
    conversationId: string;
    subject: string;
    threadId?: string;
    fromAddress: string;
    toAddresses: string[];
    lastMessageAt: Date;
    metadata?: Prisma.InputJsonValue;
  }) {
    const where = data.threadId
      ? { threadId: data.threadId }
      : { conversationId: data.conversationId };

    return this.db.emailThread.upsert({
      where,
      update: {
        subject: data.subject,
        lastMessageAt: data.lastMessageAt,
        metadata: data.metadata,
      },
      create: {
        conversationId: data.conversationId,
        subject: data.subject,
        threadId: data.threadId,
        fromAddress: data.fromAddress,
        toAddresses: data.toAddresses as unknown as Prisma.InputJsonValue,
        lastMessageAt: data.lastMessageAt,
        metadata: data.metadata,
      },
    });
  }

  /**
   * Persist an individual email message record.
   * Links to the EmailThread and optionally to a Message.
   */
  async createEmailMessage(data: {
    emailThreadId: string;
    messageId?: string;
    providerEmailId?: string;
    inReplyTo?: string;
    fromAddress: string;
    toAddresses: string[];
    ccAddresses?: string[];
    subject?: string;
    bodyText?: string;
    bodyHtml?: string;
    headers?: Prisma.InputJsonValue;
  }) {
    return this.db.emailMessage.create({
      data: {
        emailThreadId: data.emailThreadId,
        messageId: data.messageId,
        providerEmailId: data.providerEmailId,
        inReplyTo: data.inReplyTo,
        fromAddress: data.fromAddress,
        toAddresses: data.toAddresses as unknown as Prisma.InputJsonValue,
        ccAddresses: data.ccAddresses
          ? (data.ccAddresses as unknown as Prisma.InputJsonValue)
          : undefined,
        subject: data.subject,
        bodyText: data.bodyText,
        bodyHtml: data.bodyHtml,
        headers: data.headers,
      },
    });
  }

  async findByThreadId(threadId: string) {
    return this.db.emailThread.findUnique({
      where: { threadId },
      include: { conversation: true },
    });
  }

  async findByConversationId(conversationId: string) {
    return this.db.emailThread.findUnique({
      where: { conversationId },
      include: { emailMessages: { orderBy: { createdAt: 'desc' }, take: 1 } },
    });
  }

  /**
   * Find email message by provider email ID (for deduplication).
   */
  async findEmailMessageByProviderEmailId(providerEmailId: string) {
    return this.db.emailMessage.findUnique({
      where: { providerEmailId },
    });
  }

  /**
   * Get the most recent email message in a thread (for reply-to headers).
   */
  async getLatestEmailMessage(emailThreadId: string) {
    return this.db.emailMessage.findFirst({
      where: { emailThreadId },
      orderBy: { createdAt: 'desc' },
    });
  }
}

export const emailThreadRepository = new EmailThreadRepository();
