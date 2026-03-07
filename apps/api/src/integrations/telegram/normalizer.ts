import type {
  TelegramUpdate,
  TelegramMessage,
  InboundEvent,
  Attachment,
} from '@openclaw/shared';
import { logger } from '@openclaw/config';
import { getFileUrl } from './client.js';

/**
 * Normalize a Telegram Update into a channel-agnostic InboundEvent.
 *
 * Handles:
 * - Text messages
 * - Photos (picks largest resolution)
 * - Documents, audio, video, voice
 * - Captions on media messages
 * - Group chats vs direct chats
 * - Empty text + attachment (uses caption or empty string)
 *
 * Returns null for unsupported update types (edits, channel posts, etc.)
 * so the webhook can safely ignore them.
 */
export async function normalizeTelegramUpdate(
  update: TelegramUpdate,
): Promise<InboundEvent | null> {
  const message = update.message;

  // Only process new messages (not edits, channel posts, etc.)
  if (!message) {
    logger.debug({ updateId: update.update_id }, 'Ignoring non-message Telegram update');
    return null;
  }

  // Must have a sender (from field is optional for channel posts)
  if (!message.from) {
    logger.debug({ updateId: update.update_id }, 'Ignoring Telegram message without sender');
    return null;
  }

  const text = extractText(message);
  const attachments = await extractAttachments(message);

  // Skip if no text and no attachments (e.g., service messages)
  if (!text && attachments.length === 0) {
    logger.debug({ updateId: update.update_id }, 'Ignoring Telegram message with no content');
    return null;
  }

  const displayName = buildDisplayName(message.from.first_name, message.from.last_name, message.from.username);

  return {
    channel: 'telegram',
    externalUserId: String(message.from.id),
    externalUserName: displayName,
    externalThreadId: String(message.chat.id),
    text: text || '',
    attachments,
    timestamp: new Date(message.date * 1000).toISOString(),
    metadata: {
      telegramUpdateId: update.update_id,
      telegramMessageId: message.message_id,
      telegramChatType: message.chat.type,
      telegramChatTitle: message.chat.title ?? null,
      telegramUserId: message.from.id,
      telegramUsername: message.from.username ?? null,
      telegramLanguageCode: message.from.language_code ?? null,
    },
  };
}

function extractText(message: TelegramMessage): string {
  // Prefer text, fall back to caption for media messages
  return message.text ?? message.caption ?? '';
}

async function extractAttachments(message: TelegramMessage): Promise<Attachment[]> {
  const attachments: Attachment[] = [];

  // Photo — pick the largest resolution (last in array)
  if (message.photo && message.photo.length > 0) {
    const best = message.photo[message.photo.length - 1]!;
    const url = await getFileUrl(best.file_id);
    attachments.push({
      type: 'image',
      url,
      base64: null,
      mimeType: 'image/jpeg', // Telegram photos are always JPEG
      fileName: null,
      sizeBytes: best.file_size ?? null,
    });
  }

  // Document
  if (message.document) {
    const url = await getFileUrl(message.document.file_id);
    attachments.push({
      type: 'document',
      url,
      base64: null,
      mimeType: message.document.mime_type ?? null,
      fileName: message.document.file_name ?? null,
      sizeBytes: message.document.file_size ?? null,
    });
  }

  // Audio
  if (message.audio) {
    const url = await getFileUrl(message.audio.file_id);
    attachments.push({
      type: 'audio',
      url,
      base64: null,
      mimeType: message.audio.mime_type ?? null,
      fileName: message.audio.file_name ?? null,
      sizeBytes: message.audio.file_size ?? null,
    });
  }

  // Video
  if (message.video) {
    const url = await getFileUrl(message.video.file_id);
    attachments.push({
      type: 'video',
      url,
      base64: null,
      mimeType: message.video.mime_type ?? null,
      fileName: message.video.file_name ?? null,
      sizeBytes: message.video.file_size ?? null,
    });
  }

  // Voice
  if (message.voice) {
    const url = await getFileUrl(message.voice.file_id);
    attachments.push({
      type: 'audio',
      url,
      base64: null,
      mimeType: message.voice.mime_type ?? null,
      fileName: null,
      sizeBytes: message.voice.file_size ?? null,
    });
  }

  return attachments;
}

function buildDisplayName(
  firstName: string,
  lastName?: string,
  username?: string,
): string {
  if (lastName) return `${firstName} ${lastName}`;
  if (username) return `${firstName} (@${username})`;
  return firstName;
}
