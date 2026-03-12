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
const FACT_BOUNDARY =
  String.raw`(?=$|[.!?;]|\s+(?:and|but)\s+(?:my|i|we|the|please|thanks)\b|,\s*(?:my|i|we)\b)`;
const NAME_STOP_WORDS = new Set([
  'and',
  'at',
  'based',
  'because',
  'but',
  'for',
  'founder',
  'from',
  'in',
  'located',
  'need',
  'owner',
  'please',
  'prefer',
  'thanks',
  'the',
  'want',
  'with',
]);

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
  const text = event.text.replace(/\s+/g, ' ').trim();
  const userId = event.externalUserId;

  for (const name of extractMatches(
    text,
    new RegExp(String.raw`\b(?:my name is|i(?:'m| am))\s+(.+?)${FACT_BOUNDARY}`, 'gi'),
    sanitizeName,
  )) {
    facts.push({
      namespace: `user:${userId}`,
      subjectKey: 'name',
      value: { name },
      summary: `User's name is ${name}`,
      importance: 0.9,
      sourceConversationId: conversationId,
      sourceMessageId: messageId,
    });
  }

  for (const location of extractMatches(
    text,
    new RegExp(String.raw`\b(?:i live in|i(?:'m| am) from|i(?:'m| am) in)\s+(.+?)${FACT_BOUNDARY}`, 'gi'),
    sanitizeLocation,
  )) {
    facts.push({
      namespace: `user:${userId}`,
      subjectKey: 'location',
      value: { location },
      summary: `User is in/from ${location}`,
      importance: 0.7,
      sourceConversationId: conversationId,
      sourceMessageId: messageId,
    });
  }

  for (const company of extractMatches(
    text,
    new RegExp(String.raw`\b(?:my (?:company|business) is|i work (?:at|for))\s+(.+?)${FACT_BOUNDARY}`, 'gi'),
    sanitizeEntity,
  )) {
    facts.push({
      namespace: `user:${userId}`,
      subjectKey: 'company',
      value: { company },
      summary: `User works at ${company}`,
      importance: 0.8,
      sourceConversationId: conversationId,
      sourceMessageId: messageId,
    });
  }

  for (const pref of extractMatches(
    text,
    new RegExp(String.raw`\bi (?:prefer|like|want|need)\s+(.+?)${FACT_BOUNDARY}`, 'gi'),
    sanitizePreference,
  )) {
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

  return dedupeFacts(facts);
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

function extractMatches(
  text: string,
  pattern: RegExp,
  sanitizer: (value: string) => string | undefined,
): string[] {
  const values: string[] = [];

  for (const match of text.matchAll(pattern)) {
    const cleaned = sanitizer(match[1] ?? '');
    if (cleaned) {
      values.push(cleaned);
    }
  }

  return values;
}

function sanitizeName(value: string): string | undefined {
  const tokens = cleanCapturedValue(value)
    .split(/\s+/)
    .map((token) => token.replace(/^[^a-z]+|[^a-z'.-]+$/gi, ''))
    .filter(Boolean);

  if (tokens.length === 0) {
    return undefined;
  }

  const nameTokens: string[] = [];
  for (const token of tokens) {
    const lower = token.toLowerCase();
    if (NAME_STOP_WORDS.has(lower)) {
      break;
    }

    if (!/^[a-z][a-z'.-]*$/i.test(token)) {
      break;
    }

    nameTokens.push(token);
    if (nameTokens.length === 4) {
      break;
    }
  }

  if (nameTokens.length === 0) {
    return undefined;
  }

  const first = nameTokens[0]?.toLowerCase();
  if (!first || NAME_STOP_WORDS.has(first)) {
    return undefined;
  }

  return nameTokens.join(' ');
}

function sanitizeLocation(value: string): string | undefined {
  return sanitizeEntity(
    cleanCapturedValue(value).replace(/\s+(?:with|because|since|while)\b.*$/i, ''),
  );
}

function sanitizeEntity(value: string): string | undefined {
  const cleaned = cleanCapturedValue(value).replace(/\s+(?:because|since|while)\b.*$/i, '');
  return cleaned.length >= 2 ? cleaned : undefined;
}

function sanitizePreference(value: string): string | undefined {
  const cleaned = cleanCapturedValue(value);
  return cleaned.length >= 3 ? cleaned : undefined;
}

function cleanCapturedValue(value: string): string {
  return value
    .replace(/^[\s,;:.-]+/, '')
    .replace(/[\s,;:.-]+$/, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function dedupeFacts(facts: MemoryFact[]): MemoryFact[] {
  const uniqueFacts = new Map<string, MemoryFact>();

  for (const fact of facts) {
    const key = `${fact.namespace}:${fact.subjectKey}`;
    const existing = uniqueFacts.get(key);
    if (!existing || fact.importance >= existing.importance) {
      uniqueFacts.set(key, fact);
    }
  }

  return [...uniqueFacts.values()];
}
