import { BaseRepository } from '../db/repository.js';
import type { JobStatus, Prisma } from '@prisma/client';

export class JobRepository extends BaseRepository {
  async list(filters: {
    status?: JobStatus;
    queueName?: string;
    page: number;
    pageSize: number;
  }) {
    const where: Prisma.JobWhereInput = {
      ...(filters.status ? { status: filters.status } : {}),
      ...(filters.queueName ? { queueName: filters.queueName } : {}),
    };

    const [data, total] = await Promise.all([
      this.db.job.findMany({
        where,
        skip: (filters.page - 1) * filters.pageSize,
        take: filters.pageSize,
        orderBy: { createdAt: 'desc' },
      }),
      this.db.job.count({ where }),
    ]);
    return { data, total };
  }
}

export const jobRepository = new JobRepository();
