import { BaseRepository } from '../db/repository.js';

export class SettingRepository extends BaseRepository {
  async getByKey(key: string) {
    return this.db.systemSetting.findUnique({ where: { key } });
  }

  async upsert(key: string, value: unknown, updatedBy: string, description?: string) {
    return this.db.systemSetting.upsert({
      where: { key },
      create: {
        key,
        value: value as any,
        description: description ?? null,
        updatedBy,
      },
      update: {
        value: value as any,
        updatedBy,
      },
    });
  }
}

export const settingRepository = new SettingRepository();
