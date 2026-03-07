/**
 * Realistic Telegram webhook payload fixtures.
 */
import type { TelegramUpdate } from '@openclaw/shared';

export function createTelegramTextUpdate(overrides: Partial<TelegramUpdate> = {}): TelegramUpdate {
  return {
    update_id: 100001,
    message: {
      message_id: 501,
      from: {
        id: 12345678,
        is_bot: false,
        first_name: 'John',
        last_name: 'Doe',
        username: 'johndoe',
        language_code: 'en',
      },
      chat: {
        id: 12345678,
        type: 'private',
        first_name: 'John',
        last_name: 'Doe',
        username: 'johndoe',
      },
      date: Math.floor(Date.now() / 1000),
      text: 'Hello, I need help with my account',
    },
    ...overrides,
  };
}

export function createTelegramPhotoUpdate(): TelegramUpdate {
  return {
    update_id: 100002,
    message: {
      message_id: 502,
      from: {
        id: 12345678,
        is_bot: false,
        first_name: 'John',
        username: 'johndoe',
      },
      chat: {
        id: 12345678,
        type: 'private',
      },
      date: Math.floor(Date.now() / 1000),
      caption: 'Here is my receipt',
      photo: [
        { file_id: 'photo_small_id', file_unique_id: 'photo_small_uid', width: 90, height: 90 },
        { file_id: 'photo_large_id', file_unique_id: 'photo_large_uid', width: 800, height: 600, file_size: 45000 },
      ],
    },
  };
}

export function createTelegramEditedMessageUpdate(): TelegramUpdate {
  return {
    update_id: 100003,
    edited_message: {
      message_id: 501,
      from: { id: 12345678, is_bot: false, first_name: 'John' },
      chat: { id: 12345678, type: 'private' },
      date: Math.floor(Date.now() / 1000),
      text: 'Edited message content',
    },
  };
}

export function createTelegramChannelPostUpdate(): TelegramUpdate {
  return {
    update_id: 100004,
    channel_post: {
      message_id: 600,
      chat: { id: -1001234567, type: 'channel', title: 'Test Channel' },
      date: Math.floor(Date.now() / 1000),
      text: 'Channel announcement',
    },
  };
}

export const TELEGRAM_WEBHOOK_SECRET = 'test-telegram-webhook-secret';
