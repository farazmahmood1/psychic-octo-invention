import type { InboundEvent } from '@openclaw/shared';
import type { Prisma } from '@prisma/client';
import { prisma } from '../db/client.js';

/**
 * Resolve or create a conversation and participant for an inbound event.
 * Uses channel + externalThreadId as the unique key.
 */
export async function resolveConversation(event: InboundEvent): Promise<{
  conversationId: string;
  participantId: string;
}> {
  // If caller already resolved the conversation, use it
  if (event.conversationId) {
    const participant = await ensureParticipant(event.conversationId, event);
    return { conversationId: event.conversationId, participantId: participant.id };
  }

  // Find existing conversation by channel + external thread ID
  let conversation = await prisma.conversation.findUnique({
    where: {
      channel_externalId: {
        channel: event.channel,
        externalId: event.externalThreadId,
      },
    },
  });

  if (!conversation) {
    conversation = await prisma.conversation.create({
      data: {
        channel: event.channel,
        externalId: event.externalThreadId,
        status: 'active',
        metadata: event.metadata as unknown as Prisma.InputJsonValue,
      },
    });
  }

  const participant = await ensureParticipant(conversation.id, event);
  return { conversationId: conversation.id, participantId: participant.id };
}

async function ensureParticipant(conversationId: string, event: InboundEvent) {
  const existing = await prisma.participant.findUnique({
    where: {
      conversationId_channel_externalId: {
        conversationId,
        channel: event.channel,
        externalId: event.externalUserId,
      },
    },
  });

  if (existing) return existing;

  return prisma.participant.create({
    data: {
      conversationId,
      channel: event.channel,
      externalId: event.externalUserId,
      displayName: event.externalUserName,
    },
  });
}

/**
 * Persist inbound and outbound messages.
 */
export const persistMessages = {
  async inbound(
    event: InboundEvent,
    conversationId: string,
    participantId: string,
  ): Promise<string> {
    const message = await prisma.message.create({
      data: {
        conversationId,
        participantId,
        direction: 'inbound',
        status: 'received',
        content: event.text,
        rawContent: event.text,
        attachments: event.attachments.length > 0
          ? event.attachments as unknown as Prisma.InputJsonValue
          : undefined,
        metadata: event.metadata as unknown as Prisma.InputJsonValue,
      },
    });
    return message.id;
  },

  async outbound(
    content: string,
    conversationId: string,
    _inReplyToMessageId: string,
    options?: {
      metadata?: Record<string, unknown>;
      tokenUsage?: number | null;
    },
  ): Promise<string> {
    const message = await prisma.message.create({
      data: {
        conversationId,
        direction: 'outbound',
        status: 'pending',
        content,
        metadata: (options?.metadata ?? null) as Prisma.InputJsonValue,
        tokenUsage: options?.tokenUsage ?? null,
      },
    });
    return message.id;
  },

  async mergeMetadata(
    messageId: string,
    patch: Record<string, unknown>,
    tokenUsage?: number | null,
  ): Promise<void> {
    const existing = await prisma.message.findUnique({
      where: { id: messageId },
      select: { metadata: true },
    });

    const merged: Record<string, unknown> = {
      ...((existing?.metadata as Record<string, unknown> | null) ?? {}),
      ...patch,
    };

    await prisma.message.update({
      where: { id: messageId },
      data: {
        metadata: merged as Prisma.InputJsonValue,
        ...(tokenUsage !== undefined ? { tokenUsage } : {}),
      },
    });
  },
};

/**
 * Load recent messages for prompt context.
 * Returns last N messages in chronological order.
 */
export async function loadRecentMessages(
  conversationId: string,
  limit = 20,
): Promise<Array<{ role: 'user' | 'assistant'; content: string }>> {
  const messages = await prisma.message.findMany({
    where: { conversationId },
    orderBy: { createdAt: 'desc' },
    take: limit,
    select: { direction: true, content: true },
  });

  // Reverse to chronological order
  return messages.reverse().map((m) => ({
    role: m.direction === 'inbound' ? 'user' as const : 'assistant' as const,
    content: m.content,
  }));
}
