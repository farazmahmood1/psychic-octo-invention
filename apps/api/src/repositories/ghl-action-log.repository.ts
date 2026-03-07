import { BaseRepository } from '../db/repository.js';
import type { GhlActionType, Prisma } from '@prisma/client';

export class GhlActionLogRepository extends BaseRepository {
  /**
   * Log a GHL API action (append-only audit trail).
   */
  async create(data: {
    actionType: GhlActionType;
    contactId?: string;
    opportunityId?: string;
    requestPayload?: Prisma.InputJsonValue;
    responsePayload?: Prisma.InputJsonValue;
    statusCode?: number;
    success: boolean;
    errorMessage?: string;
    latencyMs?: number;
  }) {
    return this.db.ghlActionLog.create({
      data: {
        actionType: data.actionType,
        contactId: data.contactId,
        opportunityId: data.opportunityId,
        requestPayload: data.requestPayload,
        responsePayload: data.responsePayload,
        statusCode: data.statusCode,
        success: data.success,
        errorMessage: data.errorMessage,
        latencyMs: data.latencyMs,
      },
    });
  }

  async findByContactId(contactId: string, limit = 20) {
    return this.db.ghlActionLog.findMany({
      where: { contactId },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
  }

  async listRecent(filters: {
    actionType?: GhlActionType;
    success?: boolean;
    page: number;
    pageSize: number;
  }) {
    const where: Prisma.GhlActionLogWhereInput = {
      ...(filters.actionType ? { actionType: filters.actionType } : {}),
      ...(filters.success !== undefined ? { success: filters.success } : {}),
    };

    const [data, total] = await Promise.all([
      this.db.ghlActionLog.findMany({
        where,
        skip: (filters.page - 1) * filters.pageSize,
        take: filters.pageSize,
        orderBy: { createdAt: 'desc' },
      }),
      this.db.ghlActionLog.count({ where }),
    ]);

    return { data, total };
  }
}

export const ghlActionLogRepository = new GhlActionLogRepository();
