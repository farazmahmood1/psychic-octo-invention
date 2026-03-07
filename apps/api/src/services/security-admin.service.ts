import type { SecurityEvent, SkillOverrideRecord, SecurityEventsQuery } from '@openclaw/shared';
import { prisma } from '../db/client.js';

export async function listBlockedAttempts(query: SecurityEventsQuery) {
  const where: Record<string, unknown> = {
    action: { startsWith: 'security.' },
  };
  if (query.action) {
    where['action'] = query.action;
  }

  const [rows, total] = await Promise.all([
    prisma.auditLog.findMany({
      where: {
        action: query.action ? query.action : { startsWith: 'security.' },
      },
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
      orderBy: { createdAt: 'desc' },
    }),
    prisma.auditLog.count({
      where: {
        action: query.action ? query.action : { startsWith: 'security.' },
      },
    }),
  ]);

  const data: SecurityEvent[] = rows.map((r) => {
    const meta = r.metadata as Record<string, unknown> | null;
    return {
      id: r.id,
      action: r.action,
      skillSlug: (meta?.['skillSlug'] as string) ?? null,
      skillName: (meta?.['skillName'] as string) ?? null,
      reason: (meta?.['reason'] as string) ?? r.action,
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
