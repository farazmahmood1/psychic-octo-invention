import type {
  InboundEmailPayload,
  InboundEvent,
  Attachment,
} from '@openclaw/shared';
import { logger } from '@openclaw/config';
import { parseEmailThread } from './thread-parser.js';
import { stripHtml, truncateToBytes } from './thread-parser.js';

/** Max body size stored in metadata (100 KB) */
const MAX_BODY_BYTES = 100_000;
/** Max raw payload size stored (50 KB) */
const MAX_RAW_PAYLOAD_BYTES = 50_000;

/**
 * Normalize an inbound email webhook payload into a channel-agnostic InboundEvent.
 *
 * Handles:
 * - Email address normalization (lowercase)
 * - Thread parsing (forwarded messages, quoted replies)
 * - Attachment metadata extraction (no binary content stored)
 * - HTML-only emails (text extracted via stripping)
 * - Missing message-id generation
 * - Body size bounding
 *
 * Returns null for malformed payloads that cannot be processed.
 */
export function normalizeInboundEmail(
  payload: InboundEmailPayload,
): InboundEvent | null {
  // Must have a sender
  const from = normalizeEmail(payload.from);
  if (!from) {
    logger.warn('Email normalizer: missing or invalid sender address');
    return null;
  }

  // Must have at least one recipient
  // Coerce to array — some providers send a single string instead of string[]
  const rawTo = Array.isArray(payload.to) ? payload.to : payload.to ? [payload.to] : [];
  const to = rawTo.map(normalizeEmail).filter(Boolean) as string[];
  if (to.length === 0) {
    logger.warn({ from }, 'Email normalizer: no valid recipients');
    return null;
  }

  // Extract text content — prefer text body, fall back to stripping HTML
  const textBody = payload.textBody?.trim() || stripHtml(payload.htmlBody ?? '');
  const subject = payload.subject?.trim() || '(no subject)';

  // Parse thread structure
  const threadResult = parseEmailThread(payload.textBody, payload.htmlBody);

  // The text for orchestration is the current message (not quoted history)
  // But we include thread context in metadata for the LLM
  const orchestrationText = buildOrchestrationText(
    subject,
    threadResult.currentMessage || textBody,
    threadResult,
  );

  if (!orchestrationText.trim() && (!payload.attachments || payload.attachments.length === 0)) {
    logger.debug({ from, subject }, 'Email normalizer: empty email with no attachments');
    return null;
  }

  // Build thread ID for conversation mapping
  // Use In-Reply-To or References to find existing thread, or generate from message-id
  const threadId = resolveThreadId(payload);

  // Normalize attachments (metadata only — no binary content)
  const attachments: Attachment[] = (payload.attachments ?? []).map((att) => ({
    type: inferAttachmentType(att.mimeType),
    url: att.url ?? null,
    base64: null, // Never store binary content from email
    mimeType: att.mimeType,
    fileName: att.fileName,
    sizeBytes: att.sizeBytes,
  }));

  // Parse timestamp
  const timestamp = parseTimestamp(payload.timestamp);

  const rawCc = Array.isArray(payload.cc) ? payload.cc : payload.cc ? [payload.cc] : [];
  const cc = rawCc.map(normalizeEmail).filter(Boolean) as string[];

  return {
    channel: 'email',
    externalUserId: from,
    externalUserName: payload.fromName ?? extractNameFromEmail(from),
    externalThreadId: threadId,
    text: orchestrationText,
    attachments,
    timestamp,
    metadata: {
      emailFrom: from,
      emailTo: to,
      emailCc: cc,
      emailSubject: subject,
      emailMessageId: payload.messageId ?? null,
      emailInReplyTo: payload.inReplyTo ?? null,
      emailReferences: payload.references ?? null,
      emailThreadParsed: {
        isForwarded: threadResult.isForwarded,
        isQuotedReply: threadResult.isQuotedReply,
        historySegments: threadResult.threadHistory.length,
      },
      emailBodyText: truncateToBytes(textBody, MAX_BODY_BYTES),
      emailBodyHtml: payload.htmlBody
        ? truncateToBytes(payload.htmlBody, MAX_BODY_BYTES)
        : null,
      emailHeaders: payload.headers ?? null,
      emailRawPayload: payload.rawPayload
        ? truncateToBytes(JSON.stringify(payload.rawPayload), MAX_RAW_PAYLOAD_BYTES)
        : null,
    },
  };
}

// ── Helpers ────────────────────────────────────────────────

function normalizeEmail(email: string | undefined | null): string | null {
  if (!email) return null;

  // Extract email from "Name <email@example.com>" format
  const match = /<([^>]+)>/.exec(email);
  const addr = match ? match[1]! : email.trim();

  // Basic email validation
  if (!addr.includes('@') || addr.length > 254) return null;

  return addr.toLowerCase();
}

function extractNameFromEmail(email: string): string {
  const [local] = email.split('@');
  if (!local) return email;
  // "john.doe" → "John Doe"
  return local
    .split(/[._-]/)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

/**
 * Resolve a thread ID from email headers.
 * Priority: References chain → In-Reply-To → subject-based match → Message-ID → generated
 *
 * Many email providers (Resend, SendGrid) strip threading headers from inbound
 * webhook payloads. When headers are absent, fall back to a deterministic
 * subject-based thread ID so that replies with "Re: <subject>" map to the
 * original conversation.
 */
function resolveThreadId(payload: InboundEmailPayload): string {
  // Use the first message-id in the References chain (root of thread)
  if (payload.references) {
    const refs = payload.references.split(/\s+/).filter(Boolean);
    if (refs.length > 0) return refs[0]!;
  }

  // Fall back to In-Reply-To
  if (payload.inReplyTo) return payload.inReplyTo;

  // Fall back to subject-based thread matching.
  // Strip "Re:", "Fwd:", etc. prefixes so replies group with the original.
  const subject = payload.subject?.trim() ?? '';
  if (subject) {
    const normalizedSubject = normalizeSubjectForThreading(subject);
    // Use only normalized subject as the key so both sender and receiver
    // replies land in the same conversation thread.
    const key = `subject:${normalizedSubject}`;
    return `generated:${simpleHash(key)}`;
  }

  // Fall back to this message's own ID (new thread)
  if (payload.messageId) return payload.messageId;

  // Generate a deterministic thread ID from sender + subject
  const key = `${payload.from}:${payload.subject ?? ''}`.toLowerCase();
  return `generated:${simpleHash(key)}`;
}

/**
 * Strip common reply/forward prefixes and normalize whitespace
 * so that "Re: Re: Fwd: Hello" → "hello".
 */
function normalizeSubjectForThreading(subject: string): string {
  return subject
    .replace(/^(\s*(re|fwd?|fw)\s*:\s*)+/i, '')
    .trim()
    .toLowerCase();
}

function simpleHash(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash + char) | 0;
  }
  return Math.abs(hash).toString(36);
}

/**
 * Build orchestration text that includes thread context.
 * Gives the LLM both the current request and relevant history.
 */
function buildOrchestrationText(
  subject: string,
  currentMessage: string,
  threadResult: ReturnType<typeof parseEmailThread>,
): string {
  const parts: string[] = [];

  parts.push(`Subject: ${subject}`);
  parts.push('');
  parts.push(currentMessage);

  // Include thread history as context (bounded)
  if (threadResult.threadHistory.length > 0) {
    parts.push('');
    parts.push('--- Thread history ---');

    for (const seg of threadResult.threadHistory) {
      const header = [seg.from, seg.date].filter(Boolean).join(' | ');
      if (header) parts.push(`[${header}]`);
      // Limit each segment to ~2000 chars
      const content = seg.content.length > 2000
        ? seg.content.slice(0, 1997) + '...'
        : seg.content;
      parts.push(content);
      parts.push('');
    }
  }

  return parts.join('\n').trim();
}

function inferAttachmentType(mimeType: string): Attachment['type'] {
  if (mimeType.startsWith('image/')) return 'image';
  if (mimeType.startsWith('audio/')) return 'audio';
  if (mimeType.startsWith('video/')) return 'video';
  return 'document';
}

function parseTimestamp(ts: string | number | undefined): string {
  if (!ts) return new Date().toISOString();
  if (typeof ts === 'number') {
    // Unix seconds or milliseconds
    const ms = ts > 1e12 ? ts : ts * 1000;
    return new Date(ms).toISOString();
  }
  const parsed = new Date(ts);
  return isNaN(parsed.getTime()) ? new Date().toISOString() : parsed.toISOString();
}
