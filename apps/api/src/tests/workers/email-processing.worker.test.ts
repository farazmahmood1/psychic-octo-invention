import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createInboundEmailPayload } from '../fixtures/email.fixture.js';
import type { EmailProcessingJobPayload } from '../../jobs/email-processing.job.js';

const {
  createJobMock,
  findByQueueAndIdempotencyMock,
  claimForRunMock,
  markCompletedMock,
  markFailedMock,
  markRetryingMock,
  findByIdMock,
  listRecoverableMock,
} = vi.hoisted(() => ({
  createJobMock: vi.fn(),
  findByQueueAndIdempotencyMock: vi.fn(),
  claimForRunMock: vi.fn(),
  markCompletedMock: vi.fn(),
  markFailedMock: vi.fn(),
  markRetryingMock: vi.fn(),
  findByIdMock: vi.fn(),
  listRecoverableMock: vi.fn(),
}));

vi.mock('../../repositories/job.repository.js', () => ({
  jobRepository: {
    create: createJobMock,
    findByQueueAndIdempotency: findByQueueAndIdempotencyMock,
    claimForRun: claimForRunMock,
    markCompleted: markCompletedMock,
    markFailed: markFailedMock,
    markRetrying: markRetryingMock,
    findById: findByIdMock,
    listRecoverable: listRecoverableMock,
  },
}));

vi.mock('../../integrations/email/normalizer.js', () => ({
  normalizeInboundEmail: vi.fn(),
}));

vi.mock('../../orchestration/index.js', () => ({
  executeEvent: vi.fn(),
}));

vi.mock('../../services/channels/index.js', () => ({
  deliverToEmail: vi.fn(),
}));

vi.mock('../../repositories/email-thread.repository.js', () => ({
  emailThreadRepository: {
    upsert: vi.fn(),
    createEmailMessage: vi.fn(),
  },
}));

vi.mock('../../integrations/email/client.js', () => ({
  ensureReplySubject: vi.fn((subject: string) => `Re: ${subject}`),
  buildReferencesHeader: vi.fn(() => null),
}));

import { normalizeInboundEmail } from '../../integrations/email/normalizer.js';
import { deliverToEmail } from '../../services/channels/index.js';
import { enqueueEmailProcessing, resumePendingEmailJobs } from '../../workers/email-processing.worker.js';

describe('Email Processing Worker', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    createJobMock.mockResolvedValue({ id: 'job-1' });
    findByQueueAndIdempotencyMock.mockResolvedValue(null);
    claimForRunMock.mockResolvedValue(true);
    markCompletedMock.mockResolvedValue({});
    markFailedMock.mockResolvedValue({});
    markRetryingMock.mockResolvedValue({});
    findByIdMock.mockResolvedValue({ id: 'job-1', attempts: 1, maxAttempts: 3 });
    listRecoverableMock.mockResolvedValue([]);
  });

  it('creates a persisted job and marks it completed', async () => {
    vi.mocked(normalizeInboundEmail).mockReturnValue(null);

    const result = await enqueueEmailProcessing({
      payload: createInboundEmailPayload(),
      idempotencyKey: 'email-job-1',
      receivedAt: new Date().toISOString(),
    });

    expect(result.success).toBe(true);
    expect(createJobMock).toHaveBeenCalledWith(
      expect.objectContaining({
        queueName: 'email-processing',
        jobType: 'process_inbound_email',
      }),
    );

    await new Promise((resolve) => setTimeout(resolve, 20));

    expect(claimForRunMock).toHaveBeenCalledWith('job-1');
    expect(markCompletedMock).toHaveBeenCalledWith('job-1', expect.any(Object));
    expect(markFailedMock).not.toHaveBeenCalled();
  });

  it('marks persisted job failed when processing returns an error', async () => {
    vi.mocked(normalizeInboundEmail).mockImplementation(() => {
      throw new Error('normalization failed');
    });

    await enqueueEmailProcessing({
      payload: createInboundEmailPayload(),
      idempotencyKey: 'email-job-2',
      receivedAt: new Date().toISOString(),
    });

    await new Promise((resolve) => setTimeout(resolve, 20));

    expect(claimForRunMock).toHaveBeenCalledWith('job-1');
    expect(markRetryingMock).toHaveBeenCalledWith(
      'job-1',
      { message: 'normalization failed' },
    );
    expect(markFailedMock).not.toHaveBeenCalled();
    expect(markCompletedMock).not.toHaveBeenCalled();
  });

  it('marks persisted job failed when retries are exhausted', async () => {
    vi.mocked(normalizeInboundEmail).mockImplementation(() => {
      throw new Error('normalization failed');
    });
    findByIdMock.mockResolvedValueOnce({ id: 'job-1', attempts: 3, maxAttempts: 3 });

    await enqueueEmailProcessing({
      payload: createInboundEmailPayload(),
      idempotencyKey: 'email-job-2b',
      receivedAt: new Date().toISOString(),
    });

    await new Promise((resolve) => setTimeout(resolve, 20));

    expect(claimForRunMock).toHaveBeenCalledWith('job-1');
    expect(markFailedMock).toHaveBeenCalledWith(
      'job-1',
      { message: 'normalization failed' },
    );
    expect(markRetryingMock).not.toHaveBeenCalled();
    expect(markCompletedMock).not.toHaveBeenCalled();
  });

  it('resumes persisted pending jobs on startup', async () => {
    vi.mocked(normalizeInboundEmail).mockReturnValue(null);
    const payload: EmailProcessingJobPayload = {
      payload: createInboundEmailPayload(),
      idempotencyKey: 'recoverable-1',
      receivedAt: new Date().toISOString(),
    };

    listRecoverableMock.mockResolvedValueOnce([
      { id: 'job-recover-1', payload },
    ]);

    const resumed = await resumePendingEmailJobs();
    expect(resumed).toBe(1);

    await new Promise((resolve) => setTimeout(resolve, 20));

    expect(claimForRunMock).toHaveBeenCalledWith('job-recover-1');
    expect(markCompletedMock).toHaveBeenCalledWith('job-recover-1', expect.any(Object));
  });

  it('passes the original inbound alias as reply-to when sending an email reply', async () => {
    vi.mocked(normalizeInboundEmail).mockReturnValue({
      channel: 'email',
      externalUserId: 'client@example.com',
      externalUserName: 'Jane Client',
      externalThreadId: '<msg-001@example.com>',
      text: 'Need help',
      attachments: [],
      timestamp: new Date().toISOString(),
      metadata: {},
    });

    const { executeEvent } = await import('../../orchestration/index.js');
    vi.mocked(executeEvent).mockResolvedValue({
      reply: 'Here is the breakdown.',
      memoryWrites: [],
      usage: { promptTokens: 1, completionTokens: 1, totalTokens: 2, estimatedCostUsd: null },
      routing: {
        provider: 'openrouter',
        model: 'google/gemini-2.5-flash',
        tier: 'cheap',
        reason: 'test',
        escalatedFrom: null,
        signals: {
          messageLength: 10,
          hasAttachments: false,
          requiresVision: false,
          requiresToolUse: false,
          estimatedComplexity: 'low',
          hasFollowUpNeed: false,
        },
      },
      toolDispatches: [],
      subAgentDispatches: [],
      conversationId: 'conv-1',
      messageId: 'msg-1',
      warnings: [],
    });

    vi.mocked(deliverToEmail).mockResolvedValue({
      success: true,
      externalMessageId: 'provider-1',
      error: null,
    });

    await enqueueEmailProcessing({
      payload: createInboundEmailPayload({
        from: 'Jane Client <client@example.com>',
        to: ['resend@forrof.io'],
      }),
      idempotencyKey: 'email-job-reply-to',
      receivedAt: new Date().toISOString(),
    });

    await new Promise((resolve) => setTimeout(resolve, 20));

    expect(deliverToEmail).toHaveBeenCalledWith(
      'conv-1',
      'msg-1',
      'Here is the breakdown.',
      ['client@example.com'],
      undefined,
      'Re: Need help with my invoice',
      '<msg-001@example.com>',
      null,
      'resend@forrof.io',
    );
  });

  it('marks invalid persisted payload as failed during recovery', async () => {
    listRecoverableMock.mockResolvedValueOnce([
      { id: 'job-bad-1', payload: { invalid: true } as Record<string, unknown> },
    ]);

    const resumed = await resumePendingEmailJobs();
    expect(resumed).toBe(0);
    expect(markFailedMock).toHaveBeenCalledWith(
      'job-bad-1',
      expect.objectContaining({ message: 'Invalid persisted email job payload' }),
    );
  });

  it('skips enqueue when an existing persisted job has the same idempotency key', async () => {
    findByQueueAndIdempotencyMock.mockResolvedValueOnce({
      id: 'job-existing',
      status: 'pending',
    });

    const result = await enqueueEmailProcessing({
      payload: createInboundEmailPayload(),
      idempotencyKey: 'email-job-duplicate',
      receivedAt: new Date().toISOString(),
    });

    expect(result.success).toBe(true);
    expect(createJobMock).not.toHaveBeenCalled();
    expect(claimForRunMock).not.toHaveBeenCalled();
  });

  it('does not process a job when it cannot claim execution ownership', async () => {
    vi.mocked(normalizeInboundEmail).mockReturnValue(null);
    claimForRunMock.mockResolvedValueOnce(false);

    await enqueueEmailProcessing({
      payload: createInboundEmailPayload(),
      idempotencyKey: 'email-job-unclaimed',
      receivedAt: new Date().toISOString(),
    });

    await new Promise((resolve) => setTimeout(resolve, 20));

    expect(claimForRunMock).toHaveBeenCalledWith('job-1');
    expect(markCompletedMock).not.toHaveBeenCalled();
    expect(markFailedMock).not.toHaveBeenCalled();
  });
});
