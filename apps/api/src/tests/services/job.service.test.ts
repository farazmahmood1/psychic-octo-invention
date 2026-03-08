import { beforeEach, describe, expect, it, vi } from 'vitest';

const { listMock } = vi.hoisted(() => ({
  listMock: vi.fn(),
}));

vi.mock('../../repositories/job.repository.js', () => ({
  jobRepository: {
    list: listMock,
  },
}));

import { listJobs } from '../../services/job.service.js';

describe('Job Service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('maps idempotency key and last error for admin observability', async () => {
    listMock.mockResolvedValue({
      data: [
        {
          id: 'job_1',
          queueName: 'email-processing',
          jobType: 'process_inbound_email',
          status: 'retrying',
          attempts: 2,
          maxAttempts: 3,
          payload: { idempotencyKey: 'msg-123' },
          errorDetails: { message: 'SMTP timeout' },
          createdAt: new Date('2026-03-08T00:00:00.000Z'),
          updatedAt: new Date('2026-03-08T00:05:00.000Z'),
          startedAt: null,
          completedAt: null,
        },
      ],
      total: 1,
    });

    const result = await listJobs({ page: 1, pageSize: 20 });

    expect(result.total).toBe(1);
    expect(result.data[0]).toMatchObject({
      id: 'job_1',
      idempotencyKey: 'msg-123',
      lastError: 'SMTP timeout',
      updatedAt: '2026-03-08T00:05:00.000Z',
    });
  });
});
