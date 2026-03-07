import { logger } from '@openclaw/config';
import type { MemoryFact, MemorySnippet, InboundEvent, LlmResponse } from '@openclaw/shared';
import { memoryRepository } from '../../repositories/memory.repository.js';

// ── Memory Namespace Conventions ─────────────────────────────
// Namespaces segment memory for retrieval efficiency:
//   "user:{externalUserId}"        — facts about a specific person
//   "conv:{conversationId}"        — facts specific to a conversation thread
//   "biz:{topic}"                  — general business knowledge
//   "global"                       — system-wide facts

const MAX_RETRIEVAL_SNIPPETS = 15;
const MIN_IMPORTANCE_THRESHOLD = 0.3;

/**
 * Retrieve relevant memory snippets for an inbound event.
 * Searches across user, conversation, and global namespaces.
 */
export async function retrieveMemories(
  event: InboundEvent,
  conversationId: string,
): Promise<MemorySnippet[]> {
  const namespaces = buildNamespaces(event.externalUserId, conversationId);

  try {
    const records = await memoryRepository.retrieveForContext({
      namespaces,
      limit: MAX_RETRIEVAL_SNIPPETS,
    });

    return records
      .filter((r) => (r.score ?? 0) >= MIN_IMPORTANCE_THRESHOLD)
      .map((r) => ({
        id: r.id,
        namespace: r.namespace,
        subjectKey: r.subjectKey,
        summary: r.summary ?? '',
        score: r.score ?? 0,
        createdAt: r.createdAt.toISOString(),
      }));
  } catch (err) {
    // Memory retrieval failure must not block the reply path
    logger.error({ err }, 'Memory retrieval failed, proceeding without memories');
    return [];
  }
}

/**
 * Extract durable facts from an exchange and persist them.
 *
 * Memory extraction criteria — only store facts that are:
 * 1. Durable: true beyond this single conversation turn
 * 2. Specific: contains concrete names, numbers, preferences, decisions
 * 3. Non-obvious: not something trivially re-derivable from context
 *
 * Does NOT store:
 * - Transient conversational filler ("ok", "thanks", greetings)
 * - The full message text (that's in the messages table)
 * - Speculative or uncertain information
 */
export async function extractAndStoreMemories(
  event: InboundEvent,
  response: LlmResponse,
  conversationId: string,
  messageId: string,
): Promise<MemoryFact[]> {
  const facts = extractFacts(event, response, conversationId, messageId);

  const stored: MemoryFact[] = [];

  for (const fact of facts) {
    try {
      // Skip duplicates — same namespace+subjectKey already exists with equal or higher score
      const exists = await memoryRepository.exists(fact.namespace, fact.subjectKey);
      if (exists && fact.importance < 0.7) {
        // Low-importance duplicates are skipped; high-importance ones update
        continue;
      }

      await memoryRepository.upsert({
        namespace: fact.namespace,
        subjectKey: fact.subjectKey,
        value: fact.value,
        summary: fact.summary,
        score: fact.importance,
        sourceConversationId: fact.sourceConversationId,
        sourceMessageId: fact.sourceMessageId,
        expiresAt: fact.expiresAt ? new Date(fact.expiresAt) : undefined,
      });

      stored.push(fact);
    } catch (err) {
      // Individual memory write failure should not break the pipeline
      logger.warn({ err, fact: fact.subjectKey }, 'Memory write failed for individual fact');
    }
  }

  return stored;
}

// ── Fact Extraction Heuristics ───────────────────────────────

/**
 * Extract structured facts from the user message and assistant response.
 *
 * Current implementation uses pattern-based extraction. In a future phase,
 * this can be replaced with an LLM-based extraction step using a cheap model.
 */
function extractFacts(
  event: InboundEvent,
  _response: LlmResponse,
  conversationId: string,
  messageId: string,
): MemoryFact[] {
  const facts: MemoryFact[] = [];
  const text = event.text;
  const userId = event.externalUserId;

  // Skip very short messages — unlikely to contain durable facts
  if (text.length < 20) return facts;

  // Pattern: Personal identification ("my name is X", "I am X")
  const nameMatch = text.match(/\b(?:my name is|i(?:'m| am)) (\w[\w\s]{1,30})/i);
  if (nameMatch?.[1]) {
    facts.push({
      namespace: `user:${userId}`,
      subjectKey: 'name',
      value: { name: nameMatch[1].trim() },
      summary: `User's name is ${nameMatch[1].trim()}`,
      importance: 0.9,
      sourceConversationId: conversationId,
      sourceMessageId: messageId,
    });
  }

  // Pattern: Location/city ("I live in X", "I'm from X", "I'm in X")
  const locationMatch = text.match(/\b(?:i (?:live|am|'m) (?:in|from)) (\w[\w\s]{1,40})/i);
  if (locationMatch?.[1]) {
    facts.push({
      namespace: `user:${userId}`,
      subjectKey: 'location',
      value: { location: locationMatch[1].trim() },
      summary: `User is in/from ${locationMatch[1].trim()}`,
      importance: 0.7,
      sourceConversationId: conversationId,
      sourceMessageId: messageId,
    });
  }

  // Pattern: Business/company mentions ("my company is X", "I work at X")
  const companyMatch = text.match(/\b(?:my (?:company|business) is|i work (?:at|for)) (\w[\w\s&.]{1,50})/i);
  if (companyMatch?.[1]) {
    facts.push({
      namespace: `user:${userId}`,
      subjectKey: 'company',
      value: { company: companyMatch[1].trim() },
      summary: `User works at ${companyMatch[1].trim()}`,
      importance: 0.8,
      sourceConversationId: conversationId,
      sourceMessageId: messageId,
    });
  }

  // Pattern: Preferences ("I prefer X", "I like X", "I want X")
  const preferenceMatch = text.match(/\bi (?:prefer|like|want|need) (.{5,80}?)(?:\.|!|\?|$)/i);
  if (preferenceMatch?.[1]) {
    const pref = preferenceMatch[1].trim();
    facts.push({
      namespace: `user:${userId}`,
      subjectKey: `preference:${normalizeKey(pref.slice(0, 40))}`,
      value: { preference: pref },
      summary: `User prefers: ${pref}`,
      importance: 0.6,
      sourceConversationId: conversationId,
      sourceMessageId: messageId,
    });
  }

  // Pattern: Phone/email explicitly shared
  const phoneMatch = text.match(/\b(\+?\d[\d\s\-()]{7,18}\d)\b/);
  if (phoneMatch?.[1]) {
    facts.push({
      namespace: `user:${userId}`,
      subjectKey: 'phone',
      value: { phone: phoneMatch[1].trim() },
      summary: `User's phone: ${phoneMatch[1].trim()}`,
      importance: 0.9,
      sourceConversationId: conversationId,
      sourceMessageId: messageId,
    });
  }

  const emailMatch = text.match(/\b([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})\b/);
  if (emailMatch?.[1]) {
    facts.push({
      namespace: `user:${userId}`,
      subjectKey: 'email',
      value: { email: emailMatch[1].toLowerCase() },
      summary: `User's email: ${emailMatch[1].toLowerCase()}`,
      importance: 0.9,
      sourceConversationId: conversationId,
      sourceMessageId: messageId,
    });
  }

  return facts;
}

function buildNamespaces(externalUserId: string, conversationId: string): string[] {
  return [
    `user:${externalUserId}`,
    `conv:${conversationId}`,
    'global',
  ];
}

function normalizeKey(str: string): string {
  return str
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '');
}
