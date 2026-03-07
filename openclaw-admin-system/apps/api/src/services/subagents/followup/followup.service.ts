import { logger } from '@openclaw/config';
import type {
  FollowUpSubAgentInput,
  FollowUpSubAgentOutput,
  FollowUpRecommendation as FollowUpRec,
  SubAgentDispatch,
} from '@openclaw/shared';
import { FOLLOWUP_DEFAULT_STALE_DAYS } from '@openclaw/shared';
import { followUpRecommendationRepository } from '../../../repositories/followup-recommendation.repository.js';
import { providerRegistry } from '../../llm/index.js';

/** Cheap model for drafting follow-up messages. */
const DRAFT_MODEL = 'google/gemini-2.5-flash';

/**
 * Lead Follow-Up Sub-Agent Service.
 *
 * Handles the review-first follow-up workflow:
 *   1. find_stale: Identify conversations with no reply past a threshold
 *   2. draft_followup: Generate a follow-up message for a specific contact
 *   3. list_pending: List pending recommendations for this conversation
 *   4. approve_send: Mark a recommendation as approved (actual sending is deferred)
 *   5. dismiss: Dismiss a recommendation
 *
 * Safety: No messages are auto-sent. All follow-ups require explicit approval.
 */
export async function executeFollowUpTask(
  input: FollowUpSubAgentInput,
  context?: {
    conversationId?: string;
    externalUserId?: string;
    sourceChannel?: string;
    sourceMessageId?: string;
  },
): Promise<FollowUpSubAgentOutput> {
  switch (input.action) {
    case 'find_stale':
      return handleFindStale(input, context);
    case 'draft_followup':
      return handleDraftFollowUp(input, context);
    case 'list_pending':
      return handleListPending(context);
    case 'approve_send':
      return handleApproveSend(input);
    case 'dismiss':
      return handleDismiss(input);
    default:
      return {
        success: false,
        action: input.action,
        summary: `Unsupported follow-up action: "${input.action}". Supported: find_stale, draft_followup, list_pending, approve_send, dismiss.`,
        error: `Unsupported action: ${input.action}`,
      };
  }
}

/**
 * Process a SubAgentDispatch from the orchestrator.
 */
export async function processFollowUpDispatch(
  dispatch: SubAgentDispatch,
): Promise<SubAgentDispatch> {
  const input = dispatch.input as unknown as FollowUpSubAgentInput;
  const context = (dispatch.input as Record<string, unknown>)['_context'] as {
    conversationId?: string;
    externalUserId?: string;
    sourceChannel?: string;
    sourceMessageId?: string;
  } | undefined;

  try {
    const output = await executeFollowUpTask(input, context);
    return {
      ...dispatch,
      status: output.success ? 'completed' : 'failed',
      output: output as unknown as Record<string, unknown>,
      error: output.error,
    };
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    return {
      ...dispatch,
      status: 'failed',
      error,
    };
  }
}

// ── Find Stale Leads ─────────────────────────────────────────

async function handleFindStale(
  input: FollowUpSubAgentInput,
  _context?: { conversationId?: string; externalUserId?: string },
): Promise<FollowUpSubAgentOutput> {
  const staleDays = input.staleDays ?? FOLLOWUP_DEFAULT_STALE_DAYS;

  try {
    const staleConversations = await followUpRecommendationRepository.findStaleContacts(staleDays);

    if (staleConversations.length === 0) {
      return {
        success: true,
        action: 'find_stale',
        summary: `No stale leads found in the last ${staleDays} days. All conversations appear to be up to date.`,
        recommendations: [],
      };
    }

    const summaryLines = staleConversations.map((conv, i) => {
      const lastMsg = conv.messages[0];
      const participant = conv.participants[0];
      const name = participant?.displayName ?? participant?.externalId ?? conv.externalId ?? 'Unknown';
      const daysSince = lastMsg
        ? Math.floor((Date.now() - lastMsg.createdAt.getTime()) / (1000 * 60 * 60 * 24))
        : staleDays;
      const snippet = lastMsg?.content?.slice(0, 80) ?? 'No message content';
      return `${i + 1}. ${name} (${conv.channel}) — ${daysSince} days ago — "${snippet}..."`;
    });

    return {
      success: true,
      action: 'find_stale',
      summary: `Found ${staleConversations.length} stale lead(s) with no reply in ${staleDays}+ days:\n${summaryLines.join('\n')}\n\nWould you like me to draft a follow-up for any of these?`,
      recommendations: [],
    };
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    logger.error({ err, staleDays }, 'Failed to find stale contacts');
    return {
      success: false,
      action: 'find_stale',
      summary: 'Failed to search for stale leads. Please try again.',
      error,
    };
  }
}

// ── Draft Follow-Up ──────────────────────────────────────────

async function handleDraftFollowUp(
  input: FollowUpSubAgentInput,
  context?: {
    conversationId?: string;
    externalUserId?: string;
    sourceChannel?: string;
  },
): Promise<FollowUpSubAgentOutput> {
  const contactQuery = input.contactQuery?.trim();
  if (!contactQuery) {
    return {
      success: false,
      action: 'draft_followup',
      summary: 'Please specify who to follow up with (name, email, or phone).',
      error: 'Missing contactQuery',
    };
  }

  // Check for duplicate recent recommendation
  const duplicate = await followUpRecommendationRepository.findDuplicateRecommendation(
    contactQuery,
    input.context ?? 'no_reply',
  );
  if (duplicate) {
    return {
      success: true,
      action: 'draft_followup',
      summary: `A follow-up recommendation for "${contactQuery}" was already created recently. Use list_pending to see it, or dismiss it to create a new one.`,
      recommendation: mapToOutput(duplicate),
    };
  }

  // Generate the follow-up message using an LLM
  const reason = input.context ?? 'No reply received — following up to keep the conversation going.';
  const suggestedMessage = await generateFollowUpDraft(contactQuery, reason);

  // Determine priority based on stale days
  const staleDays = input.staleDays ?? FOLLOWUP_DEFAULT_STALE_DAYS;
  const priority = staleDays >= 14 ? 'high' : staleDays >= 7 ? 'medium' : 'low';

  // Persist the recommendation
  const nextActionDate = new Date();
  nextActionDate.setDate(nextActionDate.getDate() + 1); // suggest following up tomorrow

  try {
    const record = await followUpRecommendationRepository.create({
      conversationId: context?.conversationId,
      externalUserId: context?.externalUserId,
      contactIdentifier: contactQuery,
      contactName: contactQuery,
      reason: input.context ? 'custom' : 'no_reply',
      reasonDetail: reason,
      suggestedMessage,
      priority: priority as 'low' | 'medium' | 'high',
      nextActionDate,
      channel: context?.sourceChannel,
    });

    await followUpRecommendationRepository.updateStatus(record.id, 'pending_review');

    const recommendation = mapToOutput(record);
    recommendation.status = 'pending_review';
    recommendation.suggestedMessage = suggestedMessage;

    return {
      success: true,
      action: 'draft_followup',
      summary: `Here's a draft follow-up for ${contactQuery}:\n\n"${suggestedMessage}"\n\nPriority: ${priority} | Suggested send date: ${nextActionDate.toISOString().split('T')[0]}\n\nSay "approve" to mark this for sending, or "dismiss" to discard it.`,
      recommendation,
      needsApproval: true,
      approvalQuestion: 'Would you like to approve this follow-up for sending, edit it, or dismiss it?',
    };
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    logger.error({ err, contactQuery }, 'Failed to create follow-up recommendation');
    return {
      success: false,
      action: 'draft_followup',
      summary: 'Failed to create follow-up recommendation.',
      error,
    };
  }
}

// ── List Pending ─────────────────────────────────────────────

async function handleListPending(
  context?: { conversationId?: string },
): Promise<FollowUpSubAgentOutput> {
  if (!context?.conversationId) {
    return {
      success: false,
      action: 'list_pending',
      summary: 'Cannot list pending follow-ups without conversation context.',
      error: 'No conversation ID',
    };
  }

  const pending = await followUpRecommendationRepository.findPendingByConversation(
    context.conversationId,
  );

  if (pending.length === 0) {
    return {
      success: true,
      action: 'list_pending',
      summary: 'No pending follow-up recommendations.',
      recommendations: [],
    };
  }

  const lines = pending.map((rec, i) => {
    const date = rec.nextActionDate.toISOString().split('T')[0];
    return `${i + 1}. [${rec.priority.toUpperCase()}] ${rec.contactName ?? rec.contactIdentifier} — ${rec.reasonDetail.slice(0, 60)} — Send by: ${date} (ID: ${rec.id})`;
  });

  return {
    success: true,
    action: 'list_pending',
    summary: `${pending.length} pending follow-up(s):\n${lines.join('\n')}`,
    recommendations: pending.map(mapToOutput),
  };
}

// ── Approve / Send ───────────────────────────────────────────

async function handleApproveSend(
  input: FollowUpSubAgentInput,
): Promise<FollowUpSubAgentOutput> {
  const { recommendationId } = input;

  if (!recommendationId) {
    return {
      success: false,
      action: 'approve_send',
      summary: 'No recommendation ID provided. Use list_pending to find the recommendation to approve.',
      error: 'Missing recommendationId',
    };
  }

  const record = await followUpRecommendationRepository.findById(recommendationId);
  if (!record) {
    return {
      success: false,
      action: 'approve_send',
      summary: 'Follow-up recommendation not found.',
      error: 'Recommendation not found',
    };
  }

  if (record.status === 'sent') {
    return {
      success: true,
      action: 'approve_send',
      summary: 'This follow-up has already been sent.',
      recommendation: mapToOutput(record),
    };
  }

  if (record.status === 'dismissed') {
    return {
      success: false,
      action: 'approve_send',
      summary: 'This follow-up was previously dismissed. Create a new one if needed.',
      error: 'Recommendation dismissed',
    };
  }

  // Mark as approved — actual sending is handled by a future delivery integration
  await followUpRecommendationRepository.updateStatus(record.id, 'approved');

  logger.info(
    { recommendationId, contactIdentifier: record.contactIdentifier },
    'Follow-up recommendation approved',
  );

  return {
    success: true,
    action: 'approve_send',
    summary: `Follow-up for ${record.contactName ?? record.contactIdentifier} has been approved. It will be sent via ${input.sendChannel ?? record.channel ?? 'the original channel'} when delivery is next processed.\n\nMessage: "${record.suggestedMessage}"`,
    recommendation: { ...mapToOutput(record), status: 'approved' },
  };
}

// ── Dismiss ──────────────────────────────────────────────────

async function handleDismiss(
  input: FollowUpSubAgentInput,
): Promise<FollowUpSubAgentOutput> {
  const { recommendationId } = input;

  if (!recommendationId) {
    return {
      success: false,
      action: 'dismiss',
      summary: 'No recommendation ID provided.',
      error: 'Missing recommendationId',
    };
  }

  const record = await followUpRecommendationRepository.findById(recommendationId);
  if (!record) {
    return {
      success: false,
      action: 'dismiss',
      summary: 'Follow-up recommendation not found.',
      error: 'Recommendation not found',
    };
  }

  if (record.status === 'dismissed') {
    return {
      success: true,
      action: 'dismiss',
      summary: 'This follow-up was already dismissed.',
    };
  }

  await followUpRecommendationRepository.updateStatus(record.id, 'dismissed');

  return {
    success: true,
    action: 'dismiss',
    summary: `Follow-up for ${record.contactName ?? record.contactIdentifier} has been dismissed.`,
  };
}

// ── Message Generation ───────────────────────────────────────

async function generateFollowUpDraft(
  contactName: string,
  reason: string,
): Promise<string> {
  const provider = providerRegistry.getDefault();

  const prompt = `You are a friendly business assistant drafting a follow-up message for a small business owner.

Contact: ${contactName}
Reason for follow-up: ${reason}

Write a short, warm, professional follow-up message (2-4 sentences). The tone should be:
- Friendly but not pushy
- Genuine interest, not salesy
- Brief and easy to reply to
- Include a soft call-to-action (e.g. "Would you like to reschedule?" or "Just checking in")

Return ONLY the message text. No greetings like "Dear" — start naturally. No subject line, no signature.`;

  try {
    const response = await provider.complete({
      model: DRAFT_MODEL,
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.8,
    });
    return sanitizeDraft(response.content);
  } catch (err) {
    logger.warn({ err, contactName }, 'LLM draft generation failed, using template');
    return `Hi ${contactName}, I wanted to follow up on our last conversation. I hope everything is going well. Would you like to continue where we left off? Let me know if there's anything I can help with.`;
  }
}

/**
 * Sanitize a generated draft: trim, remove quotes, limit length.
 */
function sanitizeDraft(raw: string): string {
  let msg = raw.trim();
  // Remove surrounding quotes if LLM wrapped them
  if ((msg.startsWith('"') && msg.endsWith('"')) || (msg.startsWith("'") && msg.endsWith("'"))) {
    msg = msg.slice(1, -1);
  }
  // Cap at 500 characters
  if (msg.length > 500) {
    msg = msg.slice(0, 497) + '...';
  }
  return msg;
}

// ── Helpers ──────────────────────────────────────────────────

function mapToOutput(record: {
  id: string;
  contactIdentifier: string;
  contactName: string | null;
  reason: string;
  reasonDetail: string;
  suggestedMessage: string;
  priority: string;
  nextActionDate: Date;
  channel: string | null;
  status: string;
  createdAt: Date;
}): FollowUpRec {
  return {
    id: record.id,
    contactIdentifier: record.contactIdentifier,
    contactName: record.contactName,
    reason: record.reason as FollowUpRec['reason'],
    reasonDetail: record.reasonDetail,
    suggestedMessage: record.suggestedMessage,
    priority: record.priority as FollowUpRec['priority'],
    nextActionDate: record.nextActionDate.toISOString().split('T')[0]!,
    channel: record.channel,
    status: record.status as FollowUpRec['status'],
    createdAt: record.createdAt.toISOString(),
  };
}
