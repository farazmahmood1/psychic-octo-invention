import { BaseRepository } from '../db/repository.js';

export class SkillRepository extends BaseRepository {
  async findById(id: string) {
    return this.db.skill.findUnique({
      where: { id },
      include: {
        currentVersion: {
          include: {
            vettingResults: { orderBy: { createdAt: 'desc' }, take: 1 },
          },
        },
      },
    });
  }

  async list() {
    return this.db.skill.findMany({
      orderBy: { displayName: 'asc' },
      include: {
        currentVersion: {
          include: {
            vettingResults: { orderBy: { createdAt: 'desc' }, take: 1 },
          },
        },
      },
    });
  }

  async setEnabled(id: string, enabled: boolean) {
    return this.db.skill.update({
      where: { id },
      data: { enabled },
    });
  }

  async getVettingHistory(skillId: string, page: number, pageSize: number) {
    const versions = await this.db.skillVersion.findMany({
      where: { skillId },
      select: { id: true },
    });
    const versionIds = versions.map((v) => v.id);

    const where = { skillVersionId: { in: versionIds } };

    const [data, total] = await Promise.all([
      this.db.skillVettingResult.findMany({
        where,
        skip: (page - 1) * pageSize,
        take: pageSize,
        orderBy: { createdAt: 'desc' },
      }),
      this.db.skillVettingResult.count({ where }),
    ]);
    return { data, total };
  }
}

export const skillRepository = new SkillRepository();
