import { logger } from '@openclaw/config';
import { prisma } from '../db/client.js';
import { providerRegistry } from '../services/llm/index.js';

const TITLE_MODEL = 'google/gemini-2.5-flash';
const CLOSE_INTENT_PATTERNS = [
  /\bclose\s+this\s+conversation\b/i,
  /\bclosing\s+this\s+conversation\b/i,
  /\bi'?ll\s+close\s+this\b/i,
  /\bconversation\s+(is\s+)?(now\s+)?closed\b/i,
  /\bmarking\s+(this\s+)?(as\s+)?closed\b/i,
  /\bclose\s+this\s+ticket\b/i,
];

/**
 * Generate a short conversation title using a cheap LLM call.
 * Only runs when the conversation has no title yet.
 */
export async function maybeGenerateTitle(
  conversationId: string,
  userMessage: string,
  assistantReply: string,
): Promise<void> {
  try {
    const conversation = await prisma.conversation.findUnique({
      where: { id: conversationId },
      select: { title: true, _count: { select: { messages: true } } },
    });

    // Only generate title for conversations without one and with at least 2 messages (first exchange)
    if (!conversation || conversation.title) return;
    if (conversation._count.messages < 2) return;

    const provider = providerRegistry.getDefault();
    const response = await provider.complete({
      model: TITLE_MODEL,
      messages: [
        {
          role: 'system',
          content: 'Generate a very short title (max 6 words) summarizing this conversation. Return ONLY the title text, no quotes, no punctuation at the end.',
        },
        {
          role: 'user',
          content: `User: ${userMessage.slice(0, 500)}\n\nAssistant: ${assistantReply.slice(0, 500)}`,
        },
      ],
      temperature: 0.3,
      maxTokens: 30,
    });

    const title = response.content?.trim().replace(/^["']|["']$/g, '').slice(0, 100);
    if (title) {
      await prisma.conversation.update({
        where: { id: conversationId },
        data: { title },
      });
      logger.debug({ conversationId, title }, 'Auto-generated conversation title');
    }
  } catch (err) {
    // Non-critical — don't fail the pipeline
    logger.warn({ err, conversationId }, 'Failed to auto-generate conversation title');
  }
}

/**
 * Detect if the assistant reply indicates the conversation should be closed.
 * Checks for common close-intent phrases in the reply text.
 */
export async function maybeCloseConversation(
  conversationId: string,
  assistantReply: string,
): Promise<boolean> {
  try {
    const hasCloseIntent = CLOSE_INTENT_PATTERNS.some((p) => p.test(assistantReply));
    if (!hasCloseIntent) return false;

    const conversation = await prisma.conversation.findUnique({
      where: { id: conversationId },
      select: { status: true },
    });

    if (!conversation || conversation.status === 'closed') return false;

    await prisma.conversation.update({
      where: { id: conversationId },
      data: { status: 'closed' },
    });

    logger.info({ conversationId }, 'Conversation auto-closed based on assistant reply');
    return true;
  } catch (err) {
    logger.warn({ err, conversationId }, 'Failed to auto-close conversation');
    return false;
  }
}
