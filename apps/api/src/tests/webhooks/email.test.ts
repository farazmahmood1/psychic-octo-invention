/**
 * STORY-T2: Email thread parse and reply path.
 * Tests webhook validation, deduplication, and async queue handoff.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import supertest from 'supertest';
import { env } from '@openclaw/config';
import {
  createInboundEmailPayload,
  createThreadedEmailPayload,
  EMAIL_WEBHOOK_SECRET,
} from '../fixtures/email.fixture.js';

vi.mock('../../repositories/email-thread.repository.js', () => ({
  emailThreadRepository: {
    findEmailMessageByProviderEmailId: vi.fn().mockResolvedValue(null),
  },
}));

vi.mock('../../workers/email-processing.worker.js', () => ({
  enqueueEmailProcessing: vi.fn().mockResolvedValue({
    success: true,
    conversationId: null,
    messageId: null,
    replySent: false,
    error: null,
  }),
}));

import { emailWebhookRouter } from '../../routes/webhooks/email.js';
import { emailThreadRepository } from '../../repositories/email-thread.repository.js';
import { enqueueEmailProcessing } from '../../workers/email-processing.worker.js';
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
      expect(enqueueEmailProcessing).toHaveBeenCalledTimes(1);
    });

    it('enqueues threaded email payload for worker processing', async () => {
      const payload = createThreadedEmailPayload();

      const res = await supertest(app)
        .post('/')
        .set('x-email-webhook-secret', EMAIL_WEBHOOK_SECRET)
        .send(payload);

      expect(res.status).toBe(200);
      expect(enqueueEmailProcessing).toHaveBeenCalledWith(
        expect.objectContaining({
          payload,
          idempotencyKey: payload.messageId,
        }),
      );
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

    it('fails closed when webhook secret is not configured', async () => {
      const originalSecret = env.INBOUND_EMAIL_WEBHOOK_SECRET;
      try {
        env.INBOUND_EMAIL_WEBHOOK_SECRET = undefined;

        const res = await supertest(app)
          .post('/')
          .set('x-email-webhook-secret', EMAIL_WEBHOOK_SECRET)
          .send(createInboundEmailPayload());

        expect(res.status).toBe(503);
      } finally {
        env.INBOUND_EMAIL_WEBHOOK_SECRET = originalSecret;
      }
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

      await supertest(app)
        .post('/')
        .set('x-email-webhook-secret', EMAIL_WEBHOOK_SECRET)
        .send(payload);

      const res = await supertest(app)
        .post('/')
        .set('x-email-webhook-secret', EMAIL_WEBHOOK_SECRET)
        .send(payload);

      expect(res.status).toBe(200);
      expect(enqueueEmailProcessing).toHaveBeenCalledTimes(1);
    });

    it('skips duplicate by DB check', async () => {
      vi.mocked(emailThreadRepository.findEmailMessageByProviderEmailId)
        .mockResolvedValueOnce({ id: 'existing-msg' } as never);

      const payload = createInboundEmailPayload({ messageId: '<db-dedup@example.com>' });

      const res = await supertest(app)
        .post('/')
        .set('x-email-webhook-secret', EMAIL_WEBHOOK_SECRET)
        .send(payload);

      expect(res.status).toBe(200);
      expect(enqueueEmailProcessing).not.toHaveBeenCalled();
    });
  });
});
