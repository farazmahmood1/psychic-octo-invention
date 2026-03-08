import type { SecurityEvent, SkillOverrideRecord, SecurityEventsQuery } from '@openclaw/shared';
import { prisma } from '../db/client.js';

export async function listBlockedAttempts(query: SecurityEventsQuery) {
  const blockedActionFilter = query.action
    ? { action: query.action }
    : {
      OR: [
        { action: { startsWith: 'security.' } },
        { action: { in: ['skill.ingestion_blocked', 'skill.execution_blocked'] } },
      ],
    };

  const [rows, total] = await Promise.all([
    prisma.auditLog.findMany({
      where: blockedActionFilter,
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
      orderBy: { createdAt: 'desc' },
    }),
    prisma.auditLog.count({
      where: blockedActionFilter,
    }),
  ]);

  const data: SecurityEvent[] = rows.map((r) => {
    const meta = r.metadata as Record<string, unknown> | null;
    const reasonCandidate =
      meta?.['reason']
      ?? meta?.['blockReason']
      ?? meta?.['message']
      ?? r.action;
    const reason = typeof reasonCandidate === 'string'
      ? reasonCandidate.replace(/_/g, ' ')
      : r.action;

    return {
      id: r.id,
      action: r.action,
      skillSlug: (meta?.['skillSlug'] as string) ?? (meta?.['slug'] as string) ?? null,
      skillName: (meta?.['skillName'] as string) ?? null,
      reason,
      details: meta,
      actorId: r.actorId,
      ipAddress: r.ipAddress,
      createdAt: r.createdAt.toISOString(),
    };
  });

  return { data, total };
}

export async function listOverrideHistory(page: number, pageSize: number) {
  const [rows, total] = await Promise.all([
    prisma.skillVettingResult.findMany({
      where: { reviewerType: 'manual' },
      include: {
        skillVersion: {
          include: {
            skill: { select: { id: true, displayName: true } },
          },
        },
      },
      skip: (page - 1) * pageSize,
      take: pageSize,
      orderBy: { createdAt: 'desc' },
    }),
    prisma.skillVettingResult.count({ where: { reviewerType: 'manual' } }),
  ]);

  const data: SkillOverrideRecord[] = rows.map((r) => ({
    id: r.id,
    skillId: r.skillVersion.skill.id,
    skillName: r.skillVersion.skill.displayName,
    previousResult: 'failed',
    newResult: r.result,
    reason: r.reviewerNote ?? 'No reason provided',
    overriddenBy: null,
    createdAt: r.createdAt.toISOString(),
  }));

  return { data, total };
}
