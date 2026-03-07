import { BaseRepository } from '../db/repository.js';
import type { MessageDirection, MessageStatus, Prisma } from '@prisma/client';

export class MessageRepository extends BaseRepository {
  async findById(id: string) {
    return this.db.message.findUnique({ where: { id } });
  }

  async listByConversation(filters: {
    conversationId: string;
    direction?: MessageDirection;
    status?: MessageStatus;
    page: number;
    pageSize: number;
  }) {
    const where: Prisma.MessageWhereInput = {
      conversationId: filters.conversationId,
      ...(filters.direction ? { direction: filters.direction } : {}),
      ...(filters.status ? { status: filters.status } : {}),
    };

    const [data, total] = await Promise.all([
      this.db.message.findMany({
        where,
        skip: (filters.page - 1) * filters.pageSize,
        take: filters.pageSize,
        orderBy: { createdAt: 'asc' },
      }),
      this.db.message.count({ where }),
    ]);
    return { data, total };
  }

  async getLatestByConversation(conversationId: string) {
    return this.db.message.findFirst({
      where: { conversationId },
      orderBy: { createdAt: 'desc' },
    });
  }
}

export const messageRepository = new MessageRepository();
