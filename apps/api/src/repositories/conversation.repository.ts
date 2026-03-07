import { BaseRepository } from '../db/repository.js';
import type { ChannelType, ConversationStatus, Prisma } from '@prisma/client';

export class ConversationRepository extends BaseRepository {
  async findById(id: string) {
    return this.db.conversation.findUnique({
      where: { id },
      include: {
        participants: true,
        _count: { select: { messages: true } },
      },
    });
  }

  async findByChannelAndExternalId(channel: ChannelType, externalId: string) {
    return this.db.conversation.findUnique({
      where: { channel_externalId: { channel, externalId } },
    });
  }

  async create(data: Prisma.ConversationUncheckedCreateInput) {
    return this.db.conversation.create({ data });
  }

  async updateStatus(id: string, status: ConversationStatus) {
    return this.db.conversation.update({ where: { id }, data: { status } });
  }

  async list(filters: {
    channel?: ChannelType;
    status?: ConversationStatus;
    participantExternalId?: string;
    dateFrom?: Date;
    dateTo?: Date;
    page: number;
    pageSize: number;
  }) {
    const where: Prisma.ConversationWhereInput = {
      ...(filters.channel ? { channel: filters.channel } : {}),
      ...(filters.status ? { status: filters.status } : {}),
      ...(filters.dateFrom || filters.dateTo ? {
        createdAt: {
          ...(filters.dateFrom ? { gte: filters.dateFrom } : {}),
          ...(filters.dateTo ? { lte: filters.dateTo } : {}),
        },
      } : {}),
      ...(filters.participantExternalId ? {
        participants: {
          some: { externalId: filters.participantExternalId },
        },
      } : {}),
    };

    const [data, total] = await Promise.all([
      this.db.conversation.findMany({
        where,
        skip: (filters.page - 1) * filters.pageSize,
        take: filters.pageSize,
        orderBy: { updatedAt: 'desc' },
        include: {
          _count: { select: { messages: true } },
          messages: {
            orderBy: { createdAt: 'desc' },
            take: 1,
            select: { content: true, createdAt: true },
          },
        },
      }),
      this.db.conversation.count({ where }),
    ]);
    return { data, total };
  }

  async countByStatus(status: ConversationStatus) {
    return this.db.conversation.count({ where: { status } });
  }
}

export const conversationRepository = new ConversationRepository();
