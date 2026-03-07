import { BaseRepository } from '../db/repository.js';
import type { AdminRole } from '@prisma/client';

export class AdminRepository extends BaseRepository {
  async findById(id: string) {
    return this.db.admin.findUnique({ where: { id } });
  }

  async findByEmail(email: string) {
    return this.db.admin.findUnique({ where: { email: email.toLowerCase() } });
  }

  async create(data: { email: string; passwordHash: string; role?: AdminRole; displayName?: string }) {
    return this.db.admin.create({
      data: {
        email: data.email.toLowerCase(),
        passwordHash: data.passwordHash,
        role: data.role ?? 'admin',
        displayName: data.displayName,
      },
    });
  }

  async updateLastLogin(id: string, ip: string) {
    return this.db.admin.update({
      where: { id },
      data: { lastLoginAt: new Date(), lastLoginIp: ip },
    });
  }

  async updatePasswordHash(id: string, passwordHash: string) {
    return this.db.admin.update({
      where: { id },
      data: { passwordHash },
    });
  }

  async list(page: number, pageSize: number) {
    const [data, total] = await Promise.all([
      this.db.admin.findMany({
        skip: (page - 1) * pageSize,
        take: pageSize,
        orderBy: { createdAt: 'desc' },
        select: { id: true, email: true, displayName: true, role: true, isActive: true, lastLoginAt: true, createdAt: true },
      }),
      this.db.admin.count(),
    ]);
    return { data, total };
  }
}

export const adminRepository = new AdminRepository();
