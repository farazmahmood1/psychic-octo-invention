import { logger } from '@openclaw/config';
import {
  FOLLOWUP_DEFAULT_STALE_DAYS,
  type ChannelDeliveryPayload,
  type FollowUpSubAgentInput,
  type FollowUpSubAgentOutput,
  type FollowUpRecommendation as FollowUpRec,
  type SubAgentDispatch,
} from '@openclaw/shared';
import { followUpRecommendationRepository } from '../../../repositories/followup-recommendation.repository.js';
import { providerRegistry } from '../../llm/index.js';
import { prisma } from '../../../db/client.js';
import { enqueueDelivery } from '../../../workers/channel-delivery.worker.js';

/** Cheap model for drafting follow-up messages. */
const DRAFT_MODEL = 'google/gemini-2.5-flash';

/**
 * Lead Follow-Up Sub-Agent Service.
 *
 * Handles the review-first follow-up workflow:
 *   1. find_stale: Identify conversations with no reply past a threshold
 *   2. draft_followup: Generate a follow-up message for a specific contact
 *   3. list_pending: List pending recommendations for this conversation
 *   4. approve_send: Approve and send a recommendation through channel delivery
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
        action: 'unsupported',
        summary: 'Unsupported follow-up action. Supported: find_stale, draft_followup, list_pending, approve_send, dismiss.',
        error: 'Unsupported action',
      };
  }
}

/**
 * Process a SubAgentDispatch from the orchestrator.
 */
export async function processFollowUpDispatch(
  dispatch: SubAgentDispatch,
): Promise<SubAgentDispatch> {
  const rawInput = dispatch.input;
  const input = toFollowUpInput(rawInput);
  const contextValue = rawInput['_context'];
  const context = isFollowUpContext(contextValue) ? contextValue : undefined;

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
      priority,
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

  if (!record.conversationId) {
    return {
      success: false,
      action: 'approve_send',
      summary: 'Cannot send this follow-up because it is not linked to a conversation.',
      error: 'Missing conversationId on recommendation',
    };
  }

  const conversation = await prisma.conversation.findUnique({
    where: { id: record.conversationId },
    select: { channel: true },
  });

  if (!conversation) {
    return {
      success: false,
      action: 'approve_send',
      summary: 'Cannot send this follow-up because the source conversation was not found.',
      error: 'Conversation not found',
    };
  }

  const deliveryChannel = resolveDeliveryChannel(input.sendChannel, record.channel, conversation.channel);
  if (!deliveryChannel) {
    return {
      success: false,
      action: 'approve_send',
      summary: 'This follow-up can only be sent through Telegram or email.',
      error: 'Unsupported delivery channel',
    };
  }

  const outboundMessage = await prisma.message.create({
    data: {
      conversationId: record.conversationId,
      direction: 'outbound',
      status: 'pending',
      content: record.suggestedMessage,
      metadata: {
        followUpRecommendationId: record.id,
        followUpAction: 'approve_send',
      },
    },
  });

  await followUpRecommendationRepository.updateStatus(record.id, 'approved');

  const payload: ChannelDeliveryPayload = {
    channel: deliveryChannel,
    conversationId: record.conversationId,
    messageId: outboundMessage.id,
    content: record.suggestedMessage,
    metadata: {
      followUpRecommendationId: record.id,
      followUpAction: 'approve_send',
    },
  };

  const deliveryResult = await enqueueDelivery(payload, { waitForResult: true });
  if (!deliveryResult.success) {
    await prisma.message.update({
      where: { id: outboundMessage.id },
      data: { status: 'failed' },
    }).catch((err) => {
      logger.warn({ err, recommendationId: record.id }, 'Failed to set follow-up message status to failed');
    });

    return {
      success: false,
      action: 'approve_send',
      summary: 'Follow-up was approved but failed to send. Please retry.',
      error: deliveryResult.error ?? 'Delivery failed',
      recommendation: { ...mapToOutput(record), status: 'approved' },
    };
  }

  // Update message status to 'sent'
  await prisma.message.update({
    where: { id: outboundMessage.id },
    data: { status: 'sent' },
  }).catch((err) => {
    logger.warn({ err, messageId: outboundMessage.id }, 'Failed to set follow-up message status to sent');
  });

  const sentRecord = await followUpRecommendationRepository.updateStatus(record.id, 'sent');

  logger.info(
    {
      recommendationId,
      contactIdentifier: record.contactIdentifier,
      channel: deliveryChannel,
      messageId: outboundMessage.id,
      externalMessageId: deliveryResult.externalMessageId,
    },
    'Follow-up recommendation approved and sent',
  );

  return {
    success: true,
    action: 'approve_send',
    summary: `Follow-up for ${record.contactName ?? record.contactIdentifier} was sent via ${deliveryChannel}.\n\nMessage: "${record.suggestedMessage}"`,
    recommendation: mapToOutput(sentRecord),
  };
}
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

function resolveDeliveryChannel(
  requested: string | undefined,
  recommendationChannel: string | null,
  conversationChannel: string,
): 'telegram' | 'email' | null {
  const requestedChannel = normalizeChannel(requested);
  if (requestedChannel) {
    return requestedChannel;
  }

  const recommendationPreferred = normalizeChannel(recommendationChannel ?? undefined);
  if (recommendationPreferred) {
    return recommendationPreferred;
  }

  return normalizeChannel(conversationChannel);
}

function normalizeChannel(value: string | undefined): 'telegram' | 'email' | null {
  if (!value) return null;
  const normalized = value.trim().toLowerCase();
  if (normalized === 'telegram' || normalized === 'email') {
    return normalized;
  }
  return null;
}

function isFollowUpContext(value: unknown): value is {
  conversationId?: string;
  externalUserId?: string;
  sourceChannel?: string;
  sourceMessageId?: string;
} {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return false;
  }
  return true;
}

function toFollowUpInput(rawInput: Record<string, unknown>): FollowUpSubAgentInput {
  const actionRaw = rawInput['action'];
  const action = typeof actionRaw === 'string'
    && ['find_stale', 'draft_followup', 'approve_send', 'list_pending', 'dismiss'].includes(actionRaw)
    ? actionRaw as FollowUpSubAgentInput['action']
    : 'find_stale';

  const staleDaysValue = rawInput['staleDays'];
  const staleDays = typeof staleDaysValue === 'number' ? staleDaysValue : undefined;

  const contactQuery = typeof rawInput['contactQuery'] === 'string' ? rawInput['contactQuery'] : undefined;
  const context = typeof rawInput['context'] === 'string' ? rawInput['context'] : undefined;
  const recommendationId =
    typeof rawInput['recommendationId'] === 'string' ? rawInput['recommendationId'] : undefined;
  const sendChannel = typeof rawInput['sendChannel'] === 'string' ? rawInput['sendChannel'] : undefined;

  return {
    action,
    contactQuery,
    staleDays,
    context,
    recommendationId,
    sendChannel,
  };
}
