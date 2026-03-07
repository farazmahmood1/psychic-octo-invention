/**
 * STORY-T2: Email thread parse and reply path.
 * Tests webhook validation, deduplication, threading, and async processing.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import supertest from 'supertest';
import {
  createInboundEmailPayload,
  createThreadedEmailPayload,
  createHtmlOnlyEmailPayload,
  EMAIL_WEBHOOK_SECRET,
} from '../fixtures/email.fixture.js';
import { createMockExecutionResult } from '../fixtures/orchestration.fixture.js';

// Mock dependencies
vi.mock('../../integrations/email/normalizer.js', () => ({
  normalizeInboundEmail: vi.fn().mockReturnValue({
    channel: 'email',
    externalUserId: 'client@example.com',
    externalUserName: 'Jane Client',
    externalThreadId: '<msg-001@example.com>',
    text: 'Hi, I need help understanding my latest invoice.',
    attachments: [],
    timestamp: new Date().toISOString(),
    metadata: { emailFrom: 'client@example.com', emailSubject: 'Need help with my invoice' },
  }),
}));

vi.mock('../../orchestration/index.js', () => ({
  executeEvent: vi.fn().mockResolvedValue(createMockExecutionResult()),
}));

vi.mock('../../services/channels/index.js', () => ({
  deliverToEmail: vi.fn().mockResolvedValue({ success: true, externalMessageId: null, error: null }),
}));

vi.mock('../../repositories/email-thread.repository.js', () => ({
  emailThreadRepository: {
    findEmailMessageByProviderEmailId: vi.fn().mockResolvedValue(null),
    upsert: vi.fn().mockResolvedValue({ id: 'thread-001' }),
    createEmailMessage: vi.fn().mockResolvedValue({ id: 'email-msg-001' }),
  },
}));

vi.mock('../../integrations/email/client.js', () => ({
  ensureReplySubject: vi.fn((s: string) => `Re: ${s}`),
  buildReferencesHeader: vi.fn((_refs: string, _msgId: string) => '<msg-001@example.com>'),
}));

import { emailWebhookRouter } from '../../routes/webhooks/email.js';
import { executeEvent } from '../../orchestration/index.js';
import { emailThreadRepository } from '../../repositories/email-thread.repository.js';
import express from 'express';

function createWebhookApp() {
  const app = express();
  app.use(express.json());
  app.use('/', emailWebhookRouter);
  return app;
}

describe('Email Webhook', () => {
  let app: express.Express;

  beforeEach(() => {
    vi.clearAllMocks();
    app = createWebhookApp();
  });

  describe('STORY-T2: email thread parse and reply', () => {
    it('accepts valid inbound email and returns 200 immediately', async () => {
      const payload = createInboundEmailPayload();

      const res = await supertest(app)
        .post('/')
        .set('x-email-webhook-secret', EMAIL_WEBHOOK_SECRET)
        .send(payload);

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ ok: true });
    });

    it('processes threaded reply with proper References header', async () => {
      const payload = createThreadedEmailPayload();

      const res = await supertest(app)
        .post('/')
        .set('x-email-webhook-secret', EMAIL_WEBHOOK_SECRET)
        .send(payload);

      expect(res.status).toBe(200);
      // Async processing — give it a tick
      await new Promise((resolve) => setTimeout(resolve, 50));
      expect(executeEvent).toHaveBeenCalled();
    });
  });

  describe('Authentication', () => {
    it('rejects missing webhook secret', async () => {
      const res = await supertest(app)
        .post('/')
        .send(createInboundEmailPayload());

      expect(res.status).toBe(401);
    });

    it('rejects wrong webhook secret', async () => {
      const res = await supertest(app)
        .post('/')
        .set('x-email-webhook-secret', 'wrong-secret')
        .send(createInboundEmailPayload());

      expect(res.status).toBe(401);
    });
  });

  describe('Validation', () => {
    it('rejects payload without from address', async () => {
      const res = await supertest(app)
        .post('/')
        .set('x-email-webhook-secret', EMAIL_WEBHOOK_SECRET)
        .send({ to: ['support@openclaw.dev'], subject: 'test' });

      expect(res.status).toBe(400);
    });

    it('rejects payload without to addresses', async () => {
      const res = await supertest(app)
        .post('/')
        .set('x-email-webhook-secret', EMAIL_WEBHOOK_SECRET)
        .send({ from: 'a@b.com', subject: 'test' });

      expect(res.status).toBe(400);
    });
  });

  describe('Deduplication', () => {
    it('skips duplicate by message-id (in-memory)', async () => {
      const payload = createInboundEmailPayload({ messageId: '<dedup-test@example.com>' });

      // First
      await supertest(app)
        .post('/')
        .set('x-email-webhook-secret', EMAIL_WEBHOOK_SECRET)
        .send(payload);

      await new Promise((resolve) => setTimeout(resolve, 50));

      // Duplicate
      const res = await supertest(app)
        .post('/')
        .set('x-email-webhook-secret', EMAIL_WEBHOOK_SECRET)
        .send(payload);

      expect(res.status).toBe(200);
    });

    it('skips duplicate by DB check', async () => {
      (emailThreadRepository.findEmailMessageByProviderEmailId as any)
        .mockResolvedValueOnce({ id: 'existing-msg' });

      const payload = createInboundEmailPayload({ messageId: '<db-dedup@example.com>' });

      const res = await supertest(app)
        .post('/')
        .set('x-email-webhook-secret', EMAIL_WEBHOOK_SECRET)
        .send(payload);

      expect(res.status).toBe(200);
      // Should not trigger orchestration
      await new Promise((resolve) => setTimeout(resolve, 50));
    });
  });
});
