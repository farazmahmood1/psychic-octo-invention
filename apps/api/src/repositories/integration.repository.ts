import { BaseRepository } from '../db/repository.js';
import type { IntegrationStatus } from '@prisma/client';

export class IntegrationRepository extends BaseRepository {
  async listAll() {
    return this.db.integration.findMany({ orderBy: { name: 'asc' } });
  }

  async findByName(name: string) {
    return this.db.integration.findUnique({ where: { name } });
  }

  async upsert(name: string, data: { status: IntegrationStatus; lastError: string | null }) {
    return this.db.integration.upsert({
      where: { name },
      update: { status: data.status, lastError: data.lastError, lastSyncAt: new Date() },
      create: { name, type: name, status: data.status, lastError: data.lastError, lastSyncAt: new Date() },
    });
  }
}

export const integrationRepository = new IntegrationRepository();
