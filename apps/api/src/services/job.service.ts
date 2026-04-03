import type { JobSummary, JobListQuery } from '@nexclaw/shared';
import type { JobStatus } from '@prisma/client';
import { jobRepository } from '../repositories/job.repository.js';

export async function listJobs(query: JobListQuery) {
  const result = await jobRepository.list({
    status: query.status as JobStatus | undefined,
    queueName: query.queueName,
    page: query.page,
    pageSize: query.pageSize,
  });

  const data: JobSummary[] = result.data.map((j) => {
    const errorDetails = (j.errorDetails as Record<string, unknown> | null) ?? null;
    const payload = (j.payload as Record<string, unknown> | null) ?? null;

    return {
      id: j.id,
      queueName: j.queueName,
      jobType: j.jobType,
      status: j.status,
      attempts: j.attempts,
      maxAttempts: j.maxAttempts,
      lastError: typeof errorDetails?.['message'] === 'string' ? errorDetails['message'] : null,
      idempotencyKey: typeof payload?.['idempotencyKey'] === 'string' ? payload['idempotencyKey'] : null,
      updatedAt: j.updatedAt.toISOString(),
      createdAt: j.createdAt.toISOString(),
      startedAt: j.startedAt?.toISOString() ?? null,
      completedAt: j.completedAt?.toISOString() ?? null,
    };
  });

  return { data, total: result.total };
}
