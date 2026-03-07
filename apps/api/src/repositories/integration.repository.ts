import { BaseRepository } from '../db/repository.js';

export class IntegrationRepository extends BaseRepository {
  async listAll() {
    return this.db.integration.findMany({ orderBy: { name: 'asc' } });
  }

  async findByName(name: string) {
    return this.db.integration.findUnique({ where: { name } });
  }
}

export const integrationRepository = new IntegrationRepository();
