import type { JobSummary, JobListQuery } from '@openclaw/shared';
import { jobRepository } from '../repositories/job.repository.js';

export async function listJobs(query: JobListQuery) {
  const result = await jobRepository.list({
    status: query.status as any,
    queueName: query.queueName,
    page: query.page,
    pageSize: query.pageSize,
  });

  const data: JobSummary[] = result.data.map((j) => ({
    id: j.id,
    queueName: j.queueName,
    jobType: j.jobType,
    status: j.status,
    attempts: j.attempts,
    maxAttempts: j.maxAttempts,
    createdAt: j.createdAt.toISOString(),
    startedAt: j.startedAt?.toISOString() ?? null,
    completedAt: j.completedAt?.toISOString() ?? null,
  }));

  return { data, total: result.total };
}
