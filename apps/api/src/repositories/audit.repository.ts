import { BaseRepository } from '../db/repository.js';
import type { Prisma } from '@prisma/client';

export class AuditRepository extends BaseRepository {
  /** Append-only: audit logs are never updated or deleted */
  async create(data: Prisma.AuditLogUncheckedCreateInput) {
    return this.db.auditLog.create({ data });
  }

  async list(filters: {
    action?: string;
    actorId?: string;
    targetType?: string;
    page: number;
    pageSize: number;
  }) {
    const where: Prisma.AuditLogWhereInput = {
      ...(filters.action ? { action: filters.action } : {}),
      ...(filters.actorId ? { actorId: filters.actorId } : {}),
      ...(filters.targetType ? { targetType: filters.targetType } : {}),
    };

    const [data, total] = await Promise.all([
      this.db.auditLog.findMany({
        where,
        skip: (filters.page - 1) * filters.pageSize,
        take: filters.pageSize,
        orderBy: { createdAt: 'desc' },
      }),
      this.db.auditLog.count({ where }),
    ]);
    return { data, total };
  }
}

export const auditRepository = new AuditRepository();
