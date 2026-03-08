/**
 * STORY-T1: Telegram instant reply path.
 * Tests webhook validation, deduplication, and orchestration flow.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import supertest from 'supertest';
import { env } from '@openclaw/config';
import {
  createTelegramTextUpdate,
  createTelegramPhotoUpdate,
  createTelegramEditedMessageUpdate,
  createTelegramChannelPostUpdate,
  TELEGRAM_WEBHOOK_SECRET,
} from '../fixtures/telegram.fixture.js';
import { createMockExecutionResult } from '../fixtures/orchestration.fixture.js';

// Mock all external dependencies
vi.mock('../../integrations/telegram/normalizer.js', () => ({
  normalizeTelegramUpdate: vi.fn().mockResolvedValue({
    channel: 'telegram',
    externalUserId: '12345678',
    externalUserName: 'John Doe',
    externalThreadId: '12345678',
    text: 'Hello, I need help with my account',
    attachments: [],
    timestamp: new Date().toISOString(),
    metadata: { telegramUpdateId: 100001, telegramMessageId: 501 },
  }),
}));

vi.mock('../../integrations/telegram/client.js', () => ({
  sendChatAction: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../../orchestration/index.js', () => ({
  executeEvent: vi.fn().mockResolvedValue(createMockExecutionResult()),
}));

vi.mock('../../services/channels/index.js', () => ({
  deliverToTelegram: vi.fn().mockResolvedValue({ success: true, externalMessageId: '601', error: null }),
}));

vi.mock('../../repositories/telegram-chat.repository.js', () => ({
  telegramChatRepository: {
    upsert: vi.fn().mockResolvedValue({}),
  },
}));

// Import after mocks
import { telegramWebhookRouter } from '../../routes/webhooks/telegram.js';
import { normalizeTelegramUpdate } from '../../integrations/telegram/normalizer.js';
import { executeEvent } from '../../orchestration/index.js';
import { deliverToTelegram } from '../../services/channels/index.js';
import { sendChatAction } from '../../integrations/telegram/client.js';
import express from 'express';

function createWebhookApp() {
  const app = express();
  app.use(express.json());
  app.use('/', telegramWebhookRouter);
  return app;
}

describe('Telegram Webhook', () => {
  let app: express.Express;

  beforeEach(() => {
    vi.clearAllMocks();
    app = createWebhookApp();
  });

  describe('STORY-T1: instant reply path', () => {
    it('processes a text message and returns ok', async () => {
      const update = createTelegramTextUpdate();

      const res = await supertest(app)
        .post('/')
        .set('x-telegram-bot-api-secret-token', TELEGRAM_WEBHOOK_SECRET)
        .send(update);

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ ok: true });
      expect(normalizeTelegramUpdate).toHaveBeenCalledWith(update);
      expect(sendChatAction).toHaveBeenCalled();
      expect(executeEvent).toHaveBeenCalled();
      expect(deliverToTelegram).toHaveBeenCalled();
    });
  });

  describe('Authentication', () => {
    it('rejects missing webhook secret', async () => {
      const res = await supertest(app)
        .post('/')
        .send(createTelegramTextUpdate());

      expect(res.status).toBe(401);
    });

    it('rejects wrong webhook secret', async () => {
      const res = await supertest(app)
        .post('/')
        .set('x-telegram-bot-api-secret-token', 'wrong-secret')
        .send(createTelegramTextUpdate());

      expect(res.status).toBe(401);
    });

    it('fails closed when webhook secret is not configured', async () => {
      const originalSecret = env.TELEGRAM_WEBHOOK_SECRET;
      try {
        env.TELEGRAM_WEBHOOK_SECRET = undefined;

        const res = await supertest(app)
          .post('/')
          .set('x-telegram-bot-api-secret-token', TELEGRAM_WEBHOOK_SECRET)
          .send(createTelegramTextUpdate());

        expect(res.status).toBe(503);
      } finally {
        env.TELEGRAM_WEBHOOK_SECRET = originalSecret;
      }
    });
  });

  describe('Validation', () => {
    it('rejects missing update_id', async () => {
      const res = await supertest(app)
        .post('/')
        .set('x-telegram-bot-api-secret-token', TELEGRAM_WEBHOOK_SECRET)
        .send({ message: { text: 'hello' } });

      expect(res.status).toBe(400);
    });

    it('rejects empty body', async () => {
      const res = await supertest(app)
        .post('/')
        .set('x-telegram-bot-api-secret-token', TELEGRAM_WEBHOOK_SECRET)
        .send({});

      expect(res.status).toBe(400);
    });
  });

  describe('Deduplication', () => {
    it('processes first update, skips duplicate', async () => {
      const update = createTelegramTextUpdate({ update_id: 999999 });

      // First request
      await supertest(app)
        .post('/')
        .set('x-telegram-bot-api-secret-token', TELEGRAM_WEBHOOK_SECRET)
        .send(update);

      expect(executeEvent).toHaveBeenCalledTimes(1);

      // Duplicate
      const res = await supertest(app)
        .post('/')
        .set('x-telegram-bot-api-secret-token', TELEGRAM_WEBHOOK_SECRET)
        .send(update);

      expect(res.status).toBe(200);
      expect(executeEvent).toHaveBeenCalledTimes(1); // Not called again
    });
  });

  describe('Unsupported updates', () => {
    it('silently accepts edited message (returns ok, no orchestration)', async () => {
      const update = createTelegramEditedMessageUpdate();
      (normalizeTelegramUpdate as any).mockResolvedValueOnce(null);

      const res = await supertest(app)
        .post('/')
        .set('x-telegram-bot-api-secret-token', TELEGRAM_WEBHOOK_SECRET)
        .send(update);

      expect(res.status).toBe(200);
      expect(executeEvent).not.toHaveBeenCalled();
    });
  });

  describe('Error resilience', () => {
    it('still returns 200 when orchestration fails (prevents Telegram retries)', async () => {
      (executeEvent as any).mockRejectedValueOnce(new Error('LLM provider down'));

      const update = createTelegramTextUpdate({ update_id: 888888 });
      const res = await supertest(app)
        .post('/')
        .set('x-telegram-bot-api-secret-token', TELEGRAM_WEBHOOK_SECRET)
        .send(update);

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ ok: true });
    });
  });
});
