import type { MessageRecord, MessageListQuery } from '@nexclaw/shared';
import type { MessageDirection, MessageStatus } from '@prisma/client';
import { messageRepository } from '../repositories/message.repository.js';
import { conversationRepository } from '../repositories/conversation.repository.js';
import { AppError } from '../utils/app-error.js';
import { HTTP_STATUS } from '@nexclaw/shared';

export async function listMessages(conversationId: string, query: MessageListQuery) {
  const conversation = await conversationRepository.findById(conversationId);
  if (!conversation) {
    throw new AppError(HTTP_STATUS.NOT_FOUND, 'NOT_FOUND', 'Conversation not found');
  }

  const result = await messageRepository.listByConversation({
    conversationId,
    direction: query.direction as MessageDirection | undefined,
    status: query.status as MessageStatus | undefined,
    page: query.page,
    pageSize: query.pageSize,
  });

  const data: MessageRecord[] = result.data.map((m) => ({
    id: m.id,
    conversationId: m.conversationId,
    direction: m.direction,
    status: m.status,
    content: m.content,
    attachments: m.attachments as unknown[] | null,
    metadata: (m.metadata as Record<string, unknown> | null) ?? null,
    tokenUsage: m.tokenUsage ?? null,
    createdAt: m.createdAt.toISOString(),
  }));

  return { data, total: result.total };
}
