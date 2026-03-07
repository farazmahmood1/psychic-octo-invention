import { BaseRepository } from '../db/repository.js';
import type { SubAgentTaskStatus, Prisma } from '@prisma/client';

export class SubAgentTaskRepository extends BaseRepository {
  async create(data: {
    agentName: string;
    taskType: string;
    input?: Prisma.InputJsonValue;
    parentJobId?: string;
  }) {
    return this.db.subAgentTask.create({
      data: {
        agentName: data.agentName,
        taskType: data.taskType,
        input: data.input,
        parentJobId: data.parentJobId,
        status: 'queued',
      },
    });
  }

  async updateStatus(
    id: string,
    status: SubAgentTaskStatus,
    result?: { output?: Prisma.InputJsonValue; errorDetails?: Prisma.InputJsonValue },
  ) {
    const now = new Date();
    return this.db.subAgentTask.update({
      where: { id },
      data: {
        status,
        ...(status === 'running' ? { startedAt: now } : {}),
        ...(status === 'completed' || status === 'failed' ? { completedAt: now } : {}),
        ...(result?.output ? { output: result.output } : {}),
        ...(result?.errorDetails ? { errorDetails: result.errorDetails } : {}),
        attempts: { increment: status === 'running' ? 1 : 0 },
      },
    });
  }

  async findById(id: string) {
    return this.db.subAgentTask.findUnique({ where: { id } });
  }
}

export const subAgentTaskRepository = new SubAgentTaskRepository();
