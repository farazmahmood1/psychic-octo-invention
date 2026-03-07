/**
 * Email integration type definitions.
 * Used by the email adapter layer for inbound webhook parsing
 * and outbound threaded reply delivery.
 */

// ── Inbound Email Webhook Payload ─────────────────────────
// Shape expected from email provider webhooks (SendGrid, Mailgun, etc.)
// Providers vary — the normalizer handles provider-specific differences.

export interface InboundEmailPayload {
  /** Sender email address */
  from: string;
  /** Sender display name (if available) */
  fromName?: string;
  /** Recipient email addresses */
  to: string[];
  /** CC recipients */
  cc?: string[];
  /** Email subject line */
  subject: string;
  /** RFC 5322 Message-ID header */
  messageId?: string;
  /** In-Reply-To header (for thread tracking) */
  inReplyTo?: string;
  /** References header (full thread chain) */
  references?: string;
  /** Plain text body */
  textBody?: string;
  /** HTML body */
  htmlBody?: string;
  /** Received/sent timestamp (ISO 8601 or Unix seconds) */
  timestamp?: string | number;
  /** Attachments metadata */
  attachments?: InboundEmailAttachment[];
  /** Raw email headers (key-value pairs) */
  headers?: Record<string, string>;
  /** Provider-specific envelope data */
  envelope?: Record<string, unknown>;
  /** Raw provider payload (bounded — truncated if too large) */
  rawPayload?: Record<string, unknown>;
}

export interface InboundEmailAttachment {
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  /** URL to download the attachment (provider-hosted) */
  url?: string;
  /** Content ID for inline images */
  contentId?: string;
}

// ── Parsed Email Thread ───────────────────────────────────

export interface ParsedEmailThread {
  /** The current sender's new request/message */
  currentMessage: string;
  /** Forwarded/quoted thread context (chronological, oldest first) */
  threadHistory: ThreadSegment[];
  /** Whether the email contains forwarded content */
  isForwarded: boolean;
  /** Whether the email contains quoted reply content */
  isQuotedReply: boolean;
}

export interface ThreadSegment {
  /** Sender of this segment (email or name) */
  from: string | null;
  /** When this segment was sent */
  date: string | null;
  /** The text content of this segment */
  content: string;
  /** Whether this is a forwarded message vs quoted reply */
  type: 'forwarded' | 'quoted' | 'original';
}

// ── Outbound Email Options ────────────────────────────────

export interface OutboundEmailOptions {
  /** Recipient email address(es) */
  to: string[];
  /** CC recipients */
  cc?: string[];
  /** Email subject (with Re: threading prefix if reply) */
  subject: string;
  /** Plain text body */
  textBody: string;
  /** HTML body (optional — generated from text if absent) */
  htmlBody?: string;
  /** In-Reply-To header for threading */
  inReplyTo?: string;
  /** References header for threading (space-separated message IDs) */
  references?: string;
  /** Reply-To address */
  replyTo?: string;
}

export interface EmailSendResult {
  success: boolean;
  /** Provider message ID for tracking */
  providerMessageId: string | null;
  error: string | null;
}
