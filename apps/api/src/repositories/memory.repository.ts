import { BaseRepository } from '../db/repository.js';
import type { Prisma } from '@prisma/client';

export class MemoryRepository extends BaseRepository {
  /** Admin search (for the admin API) */
  async search(filters: {
    namespace?: string;
    subjectKey?: string;
    q?: string;
    page: number;
    pageSize: number;
  }) {
    const where: Prisma.MemoryRecordWhereInput = {
      ...(filters.namespace ? { namespace: filters.namespace } : {}),
      ...(filters.subjectKey ? { subjectKey: { contains: filters.subjectKey, mode: 'insensitive' as const } } : {}),
      ...(filters.q ? {
        OR: [
          { subjectKey: { contains: filters.q, mode: 'insensitive' as const } },
          { summary: { contains: filters.q, mode: 'insensitive' as const } },
        ],
      } : {}),
    };

    const [data, total] = await Promise.all([
      this.db.memoryRecord.findMany({
        where,
        skip: (filters.page - 1) * filters.pageSize,
        take: filters.pageSize,
        orderBy: { updatedAt: 'desc' },
        select: {
          id: true,
          namespace: true,
          subjectKey: true,
          summary: true,
          score: true,
          sourceConversationId: true,
          createdAt: true,
          updatedAt: true,
        },
      }),
      this.db.memoryRecord.count({ where }),
    ]);
    return { data, total };
  }

  /**
   * Retrieve relevant memories for a given namespace and subject keys.
   * Filters out expired records. Orders by score DESC, then recency.
   */
  async retrieveRelevant(filters: {
    namespace: string;
    subjectKeys: string[];
    limit: number;
  }) {
    const now = new Date();
    return this.db.memoryRecord.findMany({
      where: {
        namespace: filters.namespace,
        subjectKey: { in: filters.subjectKeys },
        OR: [
          { expiresAt: null },
          { expiresAt: { gt: now } },
        ],
      },
      take: filters.limit,
      orderBy: [{ score: 'desc' }, { updatedAt: 'desc' }],
      select: {
        id: true,
        namespace: true,
        subjectKey: true,
        summary: true,
        score: true,
        createdAt: true,
      },
    });
  }

  /**
   * Retrieve memories for a conversation context.
   * Searches by namespace prefix + conversation-related keys.
   */
  async retrieveForContext(filters: {
    namespaces: string[];
    limit: number;
  }) {
    const now = new Date();
    return this.db.memoryRecord.findMany({
      where: {
        namespace: { in: filters.namespaces },
        OR: [
          { expiresAt: null },
          { expiresAt: { gt: now } },
        ],
      },
      take: filters.limit,
      orderBy: [{ score: 'desc' }, { updatedAt: 'desc' }],
      select: {
        id: true,
        namespace: true,
        subjectKey: true,
        summary: true,
        score: true,
        createdAt: true,
      },
    });
  }

  /** Upsert a memory record — update if same namespace+subjectKey exists */
  async upsert(data: {
    namespace: string;
    subjectKey: string;
    value: unknown;
    summary: string;
    score: number;
    sourceConversationId?: string;
    sourceMessageId?: string;
    expiresAt?: Date;
  }) {
    // Check for existing record with same namespace+subjectKey
    const existing = await this.db.memoryRecord.findFirst({
      where: { namespace: data.namespace, subjectKey: data.subjectKey },
    });

    if (existing) {
      // Update existing — only if new score >= existing (don't downgrade important facts)
      if (data.score >= (existing.score ?? 0)) {
        return this.db.memoryRecord.update({
          where: { id: existing.id },
          data: {
            value: data.value as any,
            summary: data.summary,
            score: data.score,
            sourceConversationId: data.sourceConversationId,
            sourceMessageId: data.sourceMessageId,
            expiresAt: data.expiresAt,
          },
        });
      }
      return existing;
    }

    return this.db.memoryRecord.create({
      data: {
        namespace: data.namespace,
        subjectKey: data.subjectKey,
        value: data.value as any,
        summary: data.summary,
        score: data.score,
        sourceConversationId: data.sourceConversationId,
        sourceMessageId: data.sourceMessageId,
        expiresAt: data.expiresAt,
      },
    });
  }

  /** Check if a memory with same namespace+subjectKey already exists */
  async exists(namespace: string, subjectKey: string): Promise<boolean> {
    const count = await this.db.memoryRecord.count({
      where: { namespace, subjectKey },
    });
    return count > 0;
  }
}

export const memoryRepository = new MemoryRepository();
