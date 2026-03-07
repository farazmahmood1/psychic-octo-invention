import { BaseRepository } from '../db/repository.js';
import type { FollowUpPriority, FollowUpRecommendationStatus, Prisma } from '@prisma/client';

export class FollowUpRecommendationRepository extends BaseRepository {
  async create(data: {
    conversationId?: string;
    externalUserId?: string;
    contactIdentifier: string;
    contactName?: string;
    reason: string;
    reasonDetail: string;
    suggestedMessage: string;
    priority?: FollowUpPriority;
    nextActionDate: Date;
    channel?: string;
    metadata?: Prisma.InputJsonValue;
  }) {
    return this.db.followUpRecommendation.create({
      data: {
        conversationId: data.conversationId,
        externalUserId: data.externalUserId,
        contactIdentifier: data.contactIdentifier,
        contactName: data.contactName,
        reason: data.reason,
        reasonDetail: data.reasonDetail,
        suggestedMessage: data.suggestedMessage,
        priority: data.priority ?? 'medium',
        nextActionDate: data.nextActionDate,
        channel: data.channel,
        status: 'draft',
        metadata: data.metadata,
      },
    });
  }

  async findById(id: string) {
    return this.db.followUpRecommendation.findUnique({ where: { id } });
  }

  async findPendingByConversation(conversationId: string) {
    return this.db.followUpRecommendation.findMany({
      where: {
        conversationId,
        status: { in: ['draft', 'pending_review'] },
      },
      orderBy: [{ priority: 'desc' }, { nextActionDate: 'asc' }],
      take: 20,
    });
  }

  async findStaleContacts(staleDays: number, limit = 10) {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - staleDays);

    // Find conversations with no outbound messages after the cutoff date
    const staleConversations = await this.db.conversation.findMany({
      where: {
        status: 'active',
        messages: {
          some: {
            direction: 'inbound',
            createdAt: { lt: cutoff },
          },
        },
      },
      include: {
        messages: {
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
        participants: {
          take: 1,
        },
      },
      take: limit,
      orderBy: { updatedAt: 'asc' },
    });

    // Filter to conversations where the most recent message is inbound (no reply sent)
    return staleConversations.filter((conv) => {
      const lastMsg = conv.messages[0];
      return lastMsg && lastMsg.direction === 'inbound' && lastMsg.createdAt < cutoff;
    });
  }

  async updateStatus(
    id: string,
    status: FollowUpRecommendationStatus,
  ) {
    const now = new Date();
    return this.db.followUpRecommendation.update({
      where: { id },
      data: {
        status,
        ...(status === 'approved' ? { approvedAt: now } : {}),
        ...(status === 'sent' ? { sentAt: now } : {}),
        ...(status === 'dismissed' ? { dismissedAt: now } : {}),
      },
    });
  }

  async findDuplicateRecommendation(contactIdentifier: string, reason: string) {
    const recentCutoff = new Date();
    recentCutoff.setDate(recentCutoff.getDate() - 1);

    return this.db.followUpRecommendation.findFirst({
      where: {
        contactIdentifier,
        reason,
        status: { in: ['draft', 'pending_review', 'approved'] },
        createdAt: { gt: recentCutoff },
      },
    });
  }
}

export const followUpRecommendationRepository = new FollowUpRecommendationRepository();
