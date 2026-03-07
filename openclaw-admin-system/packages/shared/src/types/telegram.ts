/**
 * Telegram Bot API type definitions.
 * Subset of the Telegram Bot API types needed for webhook processing.
 * These are channel-specific types used by the Telegram adapter layer only.
 */

export interface TelegramUpdate {
  update_id: number;
  message?: TelegramMessage;
  edited_message?: TelegramMessage;
  channel_post?: TelegramMessage;
}

export interface TelegramMessage {
  message_id: number;
  from?: TelegramUser;
  chat: TelegramChat;
  date: number;
  text?: string;
  caption?: string;
  photo?: TelegramPhotoSize[];
  document?: TelegramDocument;
  audio?: TelegramAudio;
  video?: TelegramVideo;
  voice?: TelegramVoice;
  reply_to_message?: TelegramMessage;
}

export interface TelegramUser {
  id: number;
  is_bot: boolean;
  first_name: string;
  last_name?: string;
  username?: string;
  language_code?: string;
}

export interface TelegramChat {
  id: number;
  type: 'private' | 'group' | 'supergroup' | 'channel';
  title?: string;
  username?: string;
  first_name?: string;
  last_name?: string;
}

export interface TelegramPhotoSize {
  file_id: string;
  file_unique_id: string;
  width: number;
  height: number;
  file_size?: number;
}

export interface TelegramDocument {
  file_id: string;
  file_unique_id: string;
  file_name?: string;
  mime_type?: string;
  file_size?: number;
}

export interface TelegramAudio {
  file_id: string;
  file_unique_id: string;
  duration: number;
  file_name?: string;
  mime_type?: string;
  file_size?: number;
}

export interface TelegramVideo {
  file_id: string;
  file_unique_id: string;
  width: number;
  height: number;
  duration: number;
  file_name?: string;
  mime_type?: string;
  file_size?: number;
}

export interface TelegramVoice {
  file_id: string;
  file_unique_id: string;
  duration: number;
  mime_type?: string;
  file_size?: number;
}

/** Telegram sendMessage API response */
export interface TelegramSendResult {
  ok: boolean;
  result?: TelegramMessage;
  description?: string;
  error_code?: number;
}

/** Channel delivery job payload for outbound messages */
export interface ChannelDeliveryPayload {
  channel: 'telegram' | 'email';
  conversationId: string;
  messageId: string;
  content: string;
  /** Telegram-specific: the chat ID to send to */
  telegramChatId?: string;
  /** Optional: reply to a specific Telegram message */
  telegramReplyToMessageId?: number;
  /** Email-specific: recipient addresses */
  emailTo?: string[];
  /** Email-specific: CC recipients */
  emailCc?: string[];
  /** Email-specific: subject line (with Re: prefix for replies) */
  emailSubject?: string;
  /** Email-specific: In-Reply-To header for threading */
  emailInReplyTo?: string;
  /** Email-specific: References header for threading */
  emailReferences?: string;
  /** Metadata for delivery tracking */
  metadata?: Record<string, unknown>;
}

export interface ChannelDeliveryResult {
  success: boolean;
  /** External provider message ID (e.g. Telegram message_id) */
  externalMessageId: string | null;
  error: string | null;
}
