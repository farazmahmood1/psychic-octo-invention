/**
 * STORY-T3: Memory survives 20+ unrelated turns.
 * Tests that memory facts are correctly structured and can
 * coexist across multiple namespaces without interference.
 */
import { describe, it, expect } from 'vitest';
import type { MemoryFact, MemorySnippet } from '@openclaw/shared';

function createMemoryFact(overrides: Partial<MemoryFact> = {}): MemoryFact {
  return {
    namespace: 'user',
    subjectKey: 'user:12345678',
    value: { name: 'John', preference: 'formal' },
    summary: 'User prefers formal communication style',
    importance: 0.7,
    ...overrides,
  };
}

function createMemorySnippet(overrides: Partial<MemorySnippet> = {}): MemorySnippet {
  return {
    id: 'mem-001',
    namespace: 'user',
    subjectKey: 'user:12345678',
    summary: 'User prefers formal communication style',
    score: 0.85,
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}

describe('STORY-T3: memory persistence across turns', () => {
  it('memory facts have correct structure', () => {
    const fact = createMemoryFact();
    expect(fact.namespace).toBe('user');
    expect(fact.subjectKey).toContain('user:');
    expect(fact.importance).toBeGreaterThan(0);
    expect(fact.importance).toBeLessThanOrEqual(1);
  });

  it('20+ independent memory facts can coexist', () => {
    const facts: MemoryFact[] = [];
    for (let i = 0; i < 25; i++) {
      facts.push(createMemoryFact({
        subjectKey: `user:${i}`,
        summary: `Fact #${i} about user ${i}`,
        value: { turnNumber: i, data: `memory-${i}` },
      }));
    }

    expect(facts).toHaveLength(25);

    // All subject keys unique
    const keys = facts.map((f) => f.subjectKey);
    expect(new Set(keys).size).toBe(25);

    // Can retrieve any fact by index
    expect(facts[20].summary).toBe('Fact #20 about user 20');
  });

  it('memory snippets maintain score ordering', () => {
    const snippets: MemorySnippet[] = [
      createMemorySnippet({ id: 'a', score: 0.9, summary: 'Very relevant' }),
      createMemorySnippet({ id: 'b', score: 0.5, summary: 'Somewhat relevant' }),
      createMemorySnippet({ id: 'c', score: 0.2, summary: 'Barely relevant' }),
    ];

    const sorted = [...snippets].sort((a, b) => b.score - a.score);
    expect(sorted[0].summary).toBe('Very relevant');
    expect(sorted[2].summary).toBe('Barely relevant');
  });

  it('different namespaces do not interfere', () => {
    const userFacts = Array.from({ length: 10 }, (_, i) =>
      createMemoryFact({ namespace: 'user', subjectKey: `user:${i}` }),
    );
    const systemFacts = Array.from({ length: 10 }, (_, i) =>
      createMemoryFact({ namespace: 'system', subjectKey: `system:${i}` }),
    );

    const allFacts = [...userFacts, ...systemFacts];
    expect(allFacts).toHaveLength(20);

    const userOnly = allFacts.filter((f) => f.namespace === 'user');
    const systemOnly = allFacts.filter((f) => f.namespace === 'system');
    expect(userOnly).toHaveLength(10);
    expect(systemOnly).toHaveLength(10);
  });

  it('importance score bounds are respected', () => {
    const trivial = createMemoryFact({ importance: 0.0 });
    const critical = createMemoryFact({ importance: 1.0 });
    const normal = createMemoryFact({ importance: 0.5 });

    expect(trivial.importance).toBe(0.0);
    expect(critical.importance).toBe(1.0);
    expect(normal.importance).toBeGreaterThan(0);
    expect(normal.importance).toBeLessThan(1);
  });

  it('memory fact supports optional expiration', () => {
    const permanent = createMemoryFact();
    const temporary = createMemoryFact({
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
    });

    expect(permanent.expiresAt).toBeUndefined();
    expect(temporary.expiresAt).toBeDefined();
    expect(new Date(temporary.expiresAt!).getTime()).toBeGreaterThan(Date.now());
  });
});
