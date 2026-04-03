import { beforeEach, describe, expect, it, vi } from 'vitest';
import express from 'express';
import supertest from 'supertest';
import { env } from '@nexclaw/config';
import { createResendEmailReceivedEvent, createResendReceivingEmail } from '../fixtures/resend.fixture.js';

const mocks = vi.hoisted(() => ({
  verifyWebhook: vi.fn(),
  getReceivingEmail: vi.fn(),
}));

vi.mock('resend', () => ({
  Resend: class {
    webhooks = {
      verify: mocks.verifyWebhook,
    };
    emails = {
      receiving: {
        get: mocks.getReceivingEmail,
      },
    };
  },
}));

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

import { resendEmailWebhookRouter } from '../../routes/webhooks/email-resend.js';
import { enqueueEmailProcessing } from '../../workers/email-processing.worker.js';
import { resetInboundEmailIdCacheForTest } from '../../services/channels/email.inbound.js';

function createWebhookApp() {
  const app = express();
  app.use(express.json({
    verify: (req, _res, buf, encoding) => {
      (req as express.Request & { rawBody?: string }).rawBody =
        buf.toString((encoding as BufferEncoding | undefined) ?? 'utf8');
    },
  }));
  app.use('/', resendEmailWebhookRouter);
  return app;
}

describe('Resend Email Webhook', () => {
  let app: express.Express;

  beforeEach(() => {
    vi.clearAllMocks();
    resetInboundEmailIdCacheForTest();
    app = createWebhookApp();
  });

  it('accepts a valid email.received webhook and enqueues the normalized payload', async () => {
    const event = createResendEmailReceivedEvent();
    const receivingEmail = createResendReceivingEmail(event.data.email_id);
    mocks.verifyWebhook.mockReturnValue(event);
    mocks.getReceivingEmail.mockResolvedValue({ data: receivingEmail, error: null, headers: null });

    const res = await supertest(app)
      .post('/')
      .set('svix-id', 'msg_test_123')
      .set('svix-timestamp', '1700000000')
      .set('svix-signature', 'v1,test')
      .send(event);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });
    expect(mocks.verifyWebhook).toHaveBeenCalledTimes(1);
    expect(mocks.getReceivingEmail).toHaveBeenCalledWith(event.data.email_id);
    expect(enqueueEmailProcessing).toHaveBeenCalledWith(expect.objectContaining({
      payload: expect.objectContaining({
        from: 'client@example.com',
        fromName: 'Jane Client',
        to: ['support@forrof.io'],
        cc: ['billing@example.com'],
        subject: 'Need help with my invoice',
        messageId: '<resend-msg-001@example.com>',
        inReplyTo: '<prior-msg@example.com>',
        references: '<root-msg@example.com> <prior-msg@example.com>',
        textBody: 'Hi, I need help understanding my latest invoice.',
        htmlBody: '<p>Hi, I need help understanding my latest invoice.</p>',
      }),
      idempotencyKey: '<resend-msg-001@example.com>',
    }));
  });

  it('returns 200 and ignores non-email.received events', async () => {
    mocks.verifyWebhook.mockReturnValue({
      type: 'email.delivered',
      created_at: new Date().toISOString(),
      data: {
        email_id: 're_email_456',
        created_at: new Date().toISOString(),
        from: 'support@forrof.io',
        to: ['client@example.com'],
        subject: 'Delivered',
      },
    });

    const res = await supertest(app)
      .post('/')
      .set('svix-id', 'msg_test_124')
      .set('svix-timestamp', '1700000001')
      .set('svix-signature', 'v1,test')
      .send({ ok: true });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });
    expect(enqueueEmailProcessing).not.toHaveBeenCalled();
  });

  it('returns 401 when Svix signature headers are missing', async () => {
    const res = await supertest(app)
      .post('/')
      .send({ hello: 'world' });

    expect(res.status).toBe(401);
    expect(enqueueEmailProcessing).not.toHaveBeenCalled();
  });

  it('returns 401 when webhook verification fails', async () => {
    mocks.verifyWebhook.mockImplementation(() => {
      throw new Error('Invalid signature');
    });

    const res = await supertest(app)
      .post('/')
      .set('svix-id', 'msg_test_125')
      .set('svix-timestamp', '1700000002')
      .set('svix-signature', 'v1,invalid')
      .send({ hello: 'world' });

    expect(res.status).toBe(401);
    expect(enqueueEmailProcessing).not.toHaveBeenCalled();
  });

  it('fails closed when Resend config is missing', async () => {
    const originalApiKey = env.RESEND_API_KEY;
    try {
      env.RESEND_API_KEY = undefined;

      const res = await supertest(app)
        .post('/')
        .set('svix-id', 'msg_test_126')
        .set('svix-timestamp', '1700000003')
        .set('svix-signature', 'v1,test')
        .send({ hello: 'world' });

      expect(res.status).toBe(503);
    } finally {
      env.RESEND_API_KEY = originalApiKey;
    }
  });
});
