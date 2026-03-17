import type { ConversationSummary, ConversationDetail, ConversationListQuery } from '@openclaw/shared';
import { conversationRepository } from '../repositories/conversation.repository.js';
import { AppError } from '../utils/app-error.js';
import { HTTP_STATUS } from '@openclaw/shared';

export async function listConversations(query: ConversationListQuery) {
  const result = await conversationRepository.list({
    channel: query.channel as any,
    status: query.status as any,
    participantExternalId: query.participantExternalId,
    dateFrom: query.dateFrom,
    dateTo: query.dateTo,
    search: query.search,
    page: query.page,
    pageSize: query.pageSize,
  });

  const data: ConversationSummary[] = result.data.map((c) => {
    const lastMsg = c.messages[0] ?? null;
    return {
      id: c.id,
      channel: c.channel,
      title: c.title,
      status: c.status,
      messageCount: c._count.messages,
      lastMessagePreview: lastMsg ? truncate(lastMsg.content, 120) : null,
      lastMessageAt: lastMsg ? lastMsg.createdAt.toISOString() : null,
      createdAt: c.createdAt.toISOString(),
      updatedAt: c.updatedAt.toISOString(),
    };
  });

  return { data, total: result.total };
}

export async function getConversation(id: string): Promise<ConversationDetail> {
  const c = await conversationRepository.findById(id);
  if (!c) {
    throw new AppError(HTTP_STATUS.NOT_FOUND, 'NOT_FOUND', 'Conversation not found');
  }

  return {
    id: c.id,
    channel: c.channel,
    title: c.title,
    status: c.status,
    messageCount: c._count.messages,
    lastMessagePreview: null,
    lastMessageAt: null,
    metadata: c.metadata as Record<string, unknown> | null,
    participants: c.participants.map((p) => ({
      id: p.id,
      externalId: p.externalId,
      channel: p.channel,
      displayName: p.displayName,
    })),
    createdAt: c.createdAt.toISOString(),
    updatedAt: c.updatedAt.toISOString(),
  };
}

function truncate(str: string, maxLen: number): string {
  return str.length > maxLen ? str.slice(0, maxLen - 1) + '\u2026' : str;
}
