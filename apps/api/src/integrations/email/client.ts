import { createTransport } from 'nodemailer';
import type { Transporter } from 'nodemailer';
import { env, logger } from '@openclaw/config';
import type { OutboundEmailOptions, EmailSendResult } from '@openclaw/shared';

const TIMEOUT_MS = 30_000;
const MAX_RETRIES = 2;

let transporter: Transporter | null = null;

/**
 * Get or create the SMTP transporter singleton.
 * Lazy initialization — only connects when first email is sent.
 */
function getTransporter(): Transporter {
  if (!transporter) {
    transporter = createTransport({
      host: env.SMTP_HOST,
      port: env.SMTP_PORT,
      secure: env.SMTP_PORT === 465,
      auth: {
        user: env.SMTP_USER,
        pass: env.SMTP_PASS,
      },
      connectionTimeout: TIMEOUT_MS,
      socketTimeout: TIMEOUT_MS,
    });
  }
  return transporter;
}

/**
 * Send an email via SMTP with retry logic.
 *
 * Handles:
 * - Proper threading headers (In-Reply-To, References)
 * - Retry on transient SMTP errors
 * - Timeout management
 */
export async function sendEmail(options: OutboundEmailOptions): Promise<EmailSendResult> {
  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const smtp = getTransporter();

      const info = await smtp.sendMail({
        from: env.SMTP_FROM,
        to: options.to.join(', '),
        cc: options.cc?.join(', '),
        subject: options.subject,
        text: options.textBody,
        html: options.htmlBody,
        replyTo: options.replyTo,
        inReplyTo: options.inReplyTo,
        references: options.references,
      });

      const providerMessageId = info.messageId ?? null;

      logger.info(
        { messageId: providerMessageId, to: options.to },
        'Email sent successfully',
      );

      return { success: true, providerMessageId, error: null };
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));

      // Don't retry on auth or permanent failures
      if (isNonRetryableError(lastError)) {
        logger.error({ err: lastError, to: options.to }, 'Email send failed (non-retryable)');
        return { success: false, providerMessageId: null, error: lastError.message };
      }

      logger.warn(
        { err: lastError, attempt, to: options.to },
        'Email send failed, retrying',
      );

      if (attempt < MAX_RETRIES) {
        await delay(1000 * (attempt + 1));
      }
    }
  }

  const errorMsg = lastError?.message ?? 'Email send failed after retries';
  logger.error({ to: options.to, error: errorMsg }, 'Email send exhausted retries');
  return { success: false, providerMessageId: null, error: errorMsg };
}

/**
 * Verify SMTP connection health.
 * Used by integration health checks.
 */
export async function verifySmtpConnection(): Promise<boolean> {
  try {
    const smtp = getTransporter();
    await smtp.verify();
    return true;
  } catch (err) {
    logger.warn({ err }, 'SMTP connection verification failed');
    return false;
  }
}

// ── Thread Header Helpers ──────────────────────────────────

/**
 * Build the References header for a reply email.
 * Appends the inbound message-id to the existing reference chain.
 */
export function buildReferencesHeader(
  existingReferences: string | null | undefined,
  inReplyToMessageId: string | null | undefined,
): string | undefined {
  const refs: string[] = [];

  if (existingReferences) {
    refs.push(...existingReferences.split(/\s+/).filter(Boolean));
  }

  if (inReplyToMessageId && !refs.includes(inReplyToMessageId)) {
    refs.push(inReplyToMessageId);
  }

  return refs.length > 0 ? refs.join(' ') : undefined;
}

/**
 * Ensure subject line has "Re:" prefix for replies.
 */
export function ensureReplySubject(subject: string): string {
  if (/^re:\s/i.test(subject)) return subject;
  return `Re: ${subject}`;
}

// ── Helpers ────────────────────────────────────────────────

function isNonRetryableError(err: Error): boolean {
  const msg = err.message.toLowerCase();
  return (
    msg.includes('authentication') ||
    msg.includes('invalid login') ||
    msg.includes('5.7.') || // SMTP auth failures
    msg.includes('550') || // Permanent rejection
    msg.includes('553') || // Mailbox not allowed
    msg.includes('invalid address')
  );
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
