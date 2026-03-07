import { BaseRepository } from '../db/repository.js';

export class SessionRepository extends BaseRepository {
  async create(data: {
    adminId: string;
    token: string;
    ipAddress?: string;
    userAgent?: string;
    expiresAt: Date;
  }) {
    return this.db.adminSession.create({ data });
  }

  async findByToken(token: string) {
    return this.db.adminSession.findUnique({
      where: { token },
      include: { admin: true },
    });
  }

  async deleteByToken(token: string) {
    return this.db.adminSession.deleteMany({ where: { token } });
  }

  async deleteAllForAdmin(adminId: string) {
    return this.db.adminSession.deleteMany({ where: { adminId } });
  }

  async deleteExpired() {
    return this.db.adminSession.deleteMany({
      where: { expiresAt: { lt: new Date() } },
    });
  }
}

export const sessionRepository = new SessionRepository();
