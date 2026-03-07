import type { AuditLogEntry, AuditLogQuery } from '@openclaw/shared';
import { auditRepository } from '../repositories/audit.repository.js';

export async function listAuditLogs(query: AuditLogQuery) {
  const result = await auditRepository.list({
    action: query.action,
    actorId: query.actorId,
    targetType: query.targetType,
    page: query.page,
    pageSize: query.pageSize,
  });

  const data: AuditLogEntry[] = result.data.map((log) => ({
    id: log.id,
    actorType: log.actorType,
    actorId: log.actorId,
    action: log.action,
    targetType: log.targetType,
    targetId: log.targetId,
    metadata: log.metadata as Record<string, unknown> | null,
    ipAddress: log.ipAddress,
    createdAt: log.createdAt.toISOString(),
  }));

  return { data, total: result.total };
}
