import { randomUUID } from 'node:crypto';
import { logger } from '@nexclaw/config';
import type { InboundEvent } from '@nexclaw/shared';
import { executeEvent } from '../orchestration/orchestrator.js';
import { conversationRepository } from '../repositories/conversation.repository.js';
import { AppError } from '../utils/app-error.js';
import { HTTP_STATUS } from '@nexclaw/shared';

interface SendAdminMessageInput {
  conversationId?: string;
  text: string;
  adminId: string;
  adminName: string;
}

interface SendAdminMessageResult {
  conversationId: string;
  messageId: string;
  reply: string;
  model: string;
  tier: string;
  tokens: number;
  costUsd: number | null;
}

/**
 * Send a message from the admin portal and get an AI response.
 * Creates a new conversation if conversationId is not provided.
 */
export async function sendAdminMessage(input: SendAdminMessageInput): Promise<SendAdminMessageResult> {
  const { text, adminId, adminName } = input;
  let conversationId = input.conversationId;

  // Verify conversation exists if ID provided
  if (conversationId) {
    const conversation = await conversationRepository.findById(conversationId);
    if (!conversation) {
      throw new AppError(HTTP_STATUS.NOT_FOUND, 'NOT_FOUND', 'Conversation not found');
    }
  }

  // Build an InboundEvent for the orchestrator
  const event: InboundEvent = {
    channel: 'admin_portal',
    externalUserId: `admin:${adminId}`,
    externalUserName: adminName,
    externalThreadId: conversationId ?? `admin-${randomUUID()}`,
    conversationId: conversationId ?? undefined,
    text,
    attachments: [],
    timestamp: new Date().toISOString(),
    metadata: {
      source: 'admin_portal',
      adminId,
      adminName,
    },
  };

  logger.info({ adminId, conversationId, textLength: text.length }, 'Admin portal message');

  const result = await executeEvent(event);

  return {
    conversationId: result.conversationId,
    messageId: result.messageId,
    reply: result.reply,
    model: result.routing.model,
    tier: result.routing.tier,
    tokens: result.usage.totalTokens,
    costUsd: result.usage.estimatedCostUsd,
  };
}
