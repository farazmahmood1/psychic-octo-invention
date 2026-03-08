import { BaseRepository } from '../db/repository.js';
import type { JobStatus, Prisma } from '@prisma/client';

export class JobRepository extends BaseRepository {
  async findById(jobId: string) {
    return this.db.job.findUnique({ where: { id: jobId } });
  }

  async create(input: {
    queueName: string;
    jobType: string;
    payload?: Prisma.InputJsonValue;
    maxAttempts?: number;
  }) {
    return this.db.job.create({
      data: {
        queueName: input.queueName,
        jobType: input.jobType,
        payload: input.payload,
        status: 'pending',
        maxAttempts: input.maxAttempts ?? 3,
      },
    });
  }

  async markRunning(jobId: string) {
    return this.db.job.update({
      where: { id: jobId },
      data: {
        status: 'running',
        startedAt: new Date(),
        attempts: { increment: 1 },
      },
    });
  }

  /**
   * Atomically claim a job for execution.
   * Returns false when another process already claimed it.
   */
  async claimForRun(jobId: string, staleRunningAfterMinutes = 15): Promise<boolean> {
    const staleBefore = new Date(Date.now() - staleRunningAfterMinutes * 60 * 1000);
    const result = await this.db.job.updateMany({
      where: {
        id: jobId,
        OR: [
          { status: { in: ['pending', 'retrying'] } },
          { status: 'running', startedAt: { lt: staleBefore } },
        ],
      },
      data: {
        status: 'running',
        startedAt: new Date(),
        attempts: { increment: 1 },
      },
    });

    return result.count > 0;
  }

  async markCompleted(jobId: string, result?: Prisma.InputJsonValue) {
    return this.db.job.update({
      where: { id: jobId },
      data: {
        status: 'completed',
        completedAt: new Date(),
        result,
      },
    });
  }

  async markFailed(jobId: string, error: { message: string; stack?: string | null }) {
    return this.db.job.update({
      where: { id: jobId },
      data: {
        status: 'failed',
        completedAt: new Date(),
        errorDetails: {
          message: error.message,
          stack: error.stack ?? null,
        },
      },
    });
  }

  async markRetrying(jobId: string, error: { message: string; stack?: string | null }) {
    return this.db.job.update({
      where: { id: jobId },
      data: {
        status: 'retrying',
        errorDetails: {
          message: error.message,
          stack: error.stack ?? null,
        },
        startedAt: null,
        completedAt: null,
      },
    });
  }

  async listRecoverable(queueName: string, limit = 100, staleRunningAfterMinutes = 15) {
    const staleBefore = new Date(Date.now() - staleRunningAfterMinutes * 60 * 1000);
    return this.db.job.findMany({
      where: {
        queueName,
        OR: [
          { status: { in: ['pending', 'retrying'] } },
          { status: 'running', startedAt: { lt: staleBefore } },
        ],
      },
      orderBy: { createdAt: 'asc' },
      take: limit,
    });
  }

  async findByQueueAndIdempotency(queueName: string, idempotencyKey: string) {
    return this.db.job.findFirst({
      where: {
        queueName,
        payload: {
          path: ['idempotencyKey'],
          equals: idempotencyKey,
        },
        status: { in: ['pending', 'running', 'retrying', 'completed'] },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

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
