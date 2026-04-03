import { Resend } from 'resend';
import type {
  EmailReceivedEvent,
  GetReceivingEmailResponseSuccess,
} from 'resend';
import type { InboundEmailPayload } from '@nexclaw/shared';
import { env } from '@nexclaw/config';
import { normalizeMailboxList, parseMailbox } from './address.js';

interface ResendWebhookHeaders {
  id: string;
  timestamp: string;
  signature: string;
}

export function verifyResendWebhook(
  payload: string,
  headers: ResendWebhookHeaders,
): EmailReceivedEvent | null {
  const webhookSecret = env.RESEND_WEBHOOK_SECRET;
  if (!webhookSecret) {
    return null;
  }

  const resend = new Resend(env.RESEND_API_KEY);
  const event = resend.webhooks.verify({
    payload,
    headers,
    webhookSecret,
  });

  return event.type === 'email.received' ? event : null;
}

export async function getResendReceivingEmail(
  emailId: string,
): Promise<GetReceivingEmailResponseSuccess> {
  const resend = new Resend(env.RESEND_API_KEY);
  const response = await resend.emails.receiving.get(emailId);

  if (response.error || !response.data) {
    throw new Error(response.error?.message ?? 'Failed to fetch receiving email from Resend');
  }

  return response.data;
}

export function mapResendEmailToInboundPayload(
  email: GetReceivingEmailResponseSuccess,
): InboundEmailPayload {
  const headers = email.headers ?? undefined;
  const fromMailbox = parseMailbox(email.from);

  return {
    from: fromMailbox.address ?? email.from.trim().toLowerCase(),
    fromName: fromMailbox.displayName ?? undefined,
    to: normalizeMailboxList(email.to),
    cc: normalizeMailboxList(email.cc ?? []),
    subject: email.subject,
    messageId: email.message_id,
    inReplyTo: getHeader(headers, 'in-reply-to'),
    references: getHeader(headers, 'references'),
    textBody: email.text ?? undefined,
    htmlBody: email.html ?? undefined,
    timestamp: email.created_at,
    attachments: email.attachments.map((attachment) => ({
      fileName: attachment.filename ?? attachment.id,
      mimeType: attachment.content_type,
      sizeBytes: attachment.size,
      contentId: attachment.content_id ?? undefined,
    })),
    headers,
    rawPayload: {
      bcc: email.bcc ?? [],
      replyTo: normalizeMailboxList(email.reply_to ?? []),
      raw: email.raw ?? null,
    },
  };
}

function getHeader(
  headers: Record<string, string> | undefined,
  name: string,
): string | undefined {
  if (!headers) return undefined;

  const target = name.toLowerCase();
  for (const [key, value] of Object.entries(headers)) {
    if (key.toLowerCase() === target) {
      return value;
    }
  }

  return undefined;
}
