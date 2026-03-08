import { logger } from '@openclaw/config';
import type { ChannelDeliveryResult } from '@openclaw/shared';
import type { Prisma } from '@prisma/client';
import { prisma } from '../../db/client.js';
import { sendEmail, buildReferencesHeader, ensureReplySubject } from '../../integrations/email/index.js';
import { emailThreadRepository } from '../../repositories/email-thread.repository.js';

/**
 * Deliver an outbound message to an email recipient.
 *
 * Flow:
 * 1. Resolve email thread details from conversation
 * 2. Build threading headers (In-Reply-To, References, Subject)
 * 3. Send via SMTP
 * 4. Persist outbound EmailMessage record
 * 5. Update message status (pending -> sent or failed)
 */
export async function deliverToEmail(
  conversationId: string,
  messageId: string,
  content: string,
  emailTo?: string[],
  emailCc?: string[],
  emailSubject?: string,
  emailInReplyTo?: string,
  emailReferences?: string,
): Promise<ChannelDeliveryResult> {
  // Resolve email thread to get threading context
  const emailThread = await emailThreadRepository.findByConversationId(conversationId);

  if (!emailThread && !emailTo?.length) {
    logger.error({ conversationId }, 'No email thread or recipients found for conversation');
    await updateMessageStatus(messageId, 'failed');
    return { success: false, externalMessageId: null, error: 'No email thread mapping found' };
  }

  // Resolve delivery parameters from thread or explicit values
  const to = emailTo ?? [emailThread!.fromAddress];
  const subject = emailSubject ?? ensureReplySubject(emailThread!.subject);

  // Build threading headers from the latest message in the thread
  let inReplyTo = emailInReplyTo;
  let references = emailReferences;

  if (emailThread && !inReplyTo) {
    const latestMessage = emailThread.emailMessages?.[0];
    if (latestMessage) {
      inReplyTo = latestMessage.providerEmailId ?? undefined;
      references = buildReferencesHeader(
        emailThread.threadId,
        latestMessage.providerEmailId,
      );
    }
  }

  try {
    const result = await sendEmail({
      to,
      cc: emailCc,
      subject,
      textBody: content,
      inReplyTo,
      references,
    });

    if (result.success) {
      // Update message status to 'sent' and store provider message ID
      await updateMessageStatus(messageId, 'sent', {
        emailProviderMessageId: result.providerMessageId,
      });

      // Persist outbound email message record
      if (emailThread) {
        emailThreadRepository.createEmailMessage({
          emailThreadId: emailThread.id,
          messageId,
          providerEmailId: result.providerMessageId ?? undefined,
          inReplyTo,
          fromAddress: to[0]!, // We're sending TO the original sender
          toAddresses: to,
          ccAddresses: emailCc,
          subject,
          bodyText: content,
        }).catch((err) => {
          logger.warn({ err, conversationId }, 'Failed to persist outbound email message record');
        });

        // Update thread lastMessageAt
        emailThreadRepository.upsert({
          conversationId,
          subject,
          threadId: emailThread.threadId ?? undefined,
          fromAddress: emailThread.fromAddress,
          toAddresses: to,
          lastMessageAt: new Date(),
        }).catch((err) => {
          logger.warn({ err, conversationId }, 'Failed to update email thread lastMessageAt');
        });
      }

      logger.info(
        { conversationId, messageId, providerMessageId: result.providerMessageId },
        'Email delivered successfully',
      );

      return { success: true, externalMessageId: result.providerMessageId, error: null };
    }

    logger.error({ conversationId, messageId, error: result.error }, 'Email delivery failed');
    await updateMessageStatus(messageId, 'failed');
    return { success: false, externalMessageId: null, error: result.error };
  } catch (err) {
    const error = err instanceof Error ? err : new Error(String(err));
    logger.error({ err: error, conversationId, messageId }, 'Email delivery error');
    await updateMessageStatus(messageId, 'failed');
    return { success: false, externalMessageId: null, error: error.message };
  }
}

async function updateMessageStatus(
  messageId: string,
  status: 'sent' | 'delivered' | 'failed',
  metadata?: Record<string, unknown>,
): Promise<void> {
  try {
    const existing = await prisma.message.findUnique({
      where: { id: messageId },
      select: { metadata: true },
    });

    const mergedMetadata: Prisma.InputJsonValue | undefined = metadata
      ? ({
        ...((existing?.metadata as Record<string, unknown> | null) ?? {}),
        ...metadata,
      } as Prisma.InputJsonValue)
      : (existing?.metadata as Prisma.InputJsonValue | null) ?? undefined;

    await prisma.message.update({
      where: { id: messageId },
      data: {
        status,
        ...(mergedMetadata !== undefined ? { metadata: mergedMetadata } : {}),
      },
    });
  } catch (err) {
    logger.warn({ err, messageId, status }, 'Failed to update email message delivery status');
  }
}
