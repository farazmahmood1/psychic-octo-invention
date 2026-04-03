import type { InboundEmailPayload } from '@nexclaw/shared';

/**
 * Job payload for the email processing queue.
 * Wraps an InboundEmailPayload with job metadata.
 */
export interface EmailProcessingJobPayload {
  payload: InboundEmailPayload;
  /** Deduplication key (message-id or composite) */
  idempotencyKey: string;
  /** When the email was received by our webhook */
  receivedAt: string;
}

export interface EmailProcessingJobResult {
  success: boolean;
  conversationId: string | null;
  messageId: string | null;
  replySent: boolean;
  error: string | null;
}

export function toEmailJobResult(data: {
  conversationId: string;
  messageId: string;
  replySent: boolean;
}): EmailProcessingJobResult {
  return {
    success: true,
    conversationId: data.conversationId,
    messageId: data.messageId,
    replySent: data.replySent,
    error: null,
  };
}

export function toEmailJobError(error: Error): EmailProcessingJobResult {
  return {
    success: false,
    conversationId: null,
    messageId: null,
    replySent: false,
    error: error.message,
  };
}
