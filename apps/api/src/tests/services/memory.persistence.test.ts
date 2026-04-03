import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { InboundEvent, LlmResponse } from '@nexclaw/shared';

interface StoredMemory {
  id: string;
  namespace: string;
  subjectKey: string;
  summary: string;
  score: number;
  createdAt: Date;
  updatedAt: Date;
  expiresAt: Date | null;
}

const { memoryStore } = vi.hoisted(() => ({
  memoryStore: [] as StoredMemory[],
}));

vi.mock('../../repositories/memory.repository.js', () => ({
  memoryRepository: {
    retrieveForContext: vi.fn(async ({ namespaces, limit }: { namespaces: string[]; limit: number }) => {
      const now = new Date();
      return memoryStore
        .filter((m) => namespaces.includes(m.namespace) && (!m.expiresAt || m.expiresAt > now))
        .sort((a, b) => (b.score - a.score) || (b.updatedAt.getTime() - a.updatedAt.getTime()))
        .slice(0, limit);
    }),
    exists: vi.fn(async (namespace: string, subjectKey: string) => {
      return memoryStore.some((m) => m.namespace === namespace && m.subjectKey === subjectKey);
    }),
    upsert: vi.fn(async (data: {
      namespace: string;
      subjectKey: string;
      summary: string;
      score: number;
      expiresAt?: Date;
    }) => {
      const existing = memoryStore.find((m) => m.namespace === data.namespace && m.subjectKey === data.subjectKey);
      if (existing) {
        existing.summary = data.summary;
        existing.score = data.score;
        existing.updatedAt = new Date();
        existing.expiresAt = data.expiresAt ?? null;
        return existing;
      }

      const record: StoredMemory = {
        id: `mem-${memoryStore.length + 1}`,
        namespace: data.namespace,
        subjectKey: data.subjectKey,
        summary: data.summary,
        score: data.score,
        createdAt: new Date(),
        updatedAt: new Date(),
        expiresAt: data.expiresAt ?? null,
      };
      memoryStore.push(record);
      return record;
    }),
  },
}));

import { extractAndStoreMemories, retrieveMemories } from '../../services/memory/index.js';

function createEvent(text: string, conversationId = 'conv-1'): InboundEvent {
  return {
    channel: 'telegram',
    externalUserId: 'user-1',
    externalUserName: 'User One',
    externalThreadId: conversationId,
    text,
    attachments: [],
    timestamp: new Date().toISOString(),
    metadata: {},
  };
}

const dummyResponse: LlmResponse = {
  content: 'ok',
  toolCalls: [],
  usage: { promptTokens: 1, completionTokens: 1, totalTokens: 2, estimatedCostUsd: null },
  model: 'google/gemini-2.5-flash',
  finishReason: 'stop',
  latencyMs: 10,
};

describe('Memory Service - T3 persistence behavior', () => {
  beforeEach(() => {
    memoryStore.length = 0;
  });

  it('stores durable facts from short messages and retrieves them later', async () => {
    await extractAndStoreMemories(
      createEvent('My name is John Doe.'),
      dummyResponse,
      'conv-1',
      'msg-1',
    );

    const snippets = await retrieveMemories(createEvent('What did I tell you earlier?', 'conv-2'), 'conv-2');

    expect(snippets.some((s) => s.subjectKey === 'name')).toBe(true);
    expect(snippets.some((s) => s.summary.toLowerCase().includes('john doe'))).toBe(true);
  });

  it('retains user memory across 20+ unrelated turns', async () => {
    await extractAndStoreMemories(
      createEvent('I am Alice and my company is Blue Harbor LLC.'),
      dummyResponse,
      'conv-1',
      'msg-seed',
    );

    for (let i = 0; i < 22; i++) {
      await extractAndStoreMemories(
        createEvent(`ok ${i}`),
        dummyResponse,
        'conv-1',
        `msg-${i}`,
      );
    }

    const snippets = await retrieveMemories(createEvent('Remind me what you know about me.'), 'conv-1');

    expect(snippets.some((s) => s.subjectKey === 'name')).toBe(true);
    expect(snippets.some((s) => s.subjectKey === 'company')).toBe(true);
  });

  it('extracts compound facts without bleeding text across summaries', async () => {
    await extractAndStoreMemories(
      createEvent('My name is Alice Johnson and my company is Blue Harbor LLC. I prefer short replies.'),
      dummyResponse,
      'conv-1',
      'msg-compound',
    );

    expect(memoryStore).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          subjectKey: 'name',
          summary: "User's name is Alice Johnson",
        }),
        expect.objectContaining({
          subjectKey: 'company',
          summary: 'User works at Blue Harbor LLC',
        }),
        expect.objectContaining({
          subjectKey: 'preference:short_replies',
          summary: 'User prefers: short replies',
        }),
      ]),
    );
  });

  it('does not misclassify location statements as names', async () => {
    await extractAndStoreMemories(
      createEvent("I'm in Boston and I prefer email follow-ups."),
      dummyResponse,
      'conv-1',
      'msg-location',
    );

    expect(memoryStore.some((m) => m.subjectKey === 'name')).toBe(false);
    expect(memoryStore).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          subjectKey: 'location',
          summary: 'User is in/from Boston',
        }),
        expect.objectContaining({
          subjectKey: 'preference:email_follow_ups',
          summary: 'User prefers: email follow-ups',
        }),
      ]),
    );
  });
});
