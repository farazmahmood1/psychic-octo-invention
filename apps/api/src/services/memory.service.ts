import type { MemorySearchResult, MemorySearchQuery } from '@openclaw/shared';
import { memoryRepository } from '../repositories/memory.repository.js';

export async function searchMemory(query: MemorySearchQuery) {
  const result = await memoryRepository.search({
    namespace: query.namespace,
    subjectKey: query.subjectKey,
    q: query.q,
    page: query.page,
    pageSize: query.pageSize,
  });

  const data: MemorySearchResult[] = result.data.map((m) => ({
    id: m.id,
    namespace: m.namespace,
    subjectKey: m.subjectKey,
    summary: m.summary,
    score: m.score,
    sourceConversationId: m.sourceConversationId,
    createdAt: m.createdAt.toISOString(),
    updatedAt: m.updatedAt.toISOString(),
  }));

  return { data, total: result.total };
}
