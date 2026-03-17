import type { DashboardStats } from '@openclaw/shared';
import { conversationRepository } from '../repositories/conversation.repository.js';
import { usageRepository } from '../repositories/usage.repository.js';
import { prisma } from '../db/client.js';

export async function getDashboardStats(): Promise<DashboardStats> {
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);

  const [activeConversations, messagesToday, apiCostsMtd, activeSkills] = await Promise.all([
    conversationRepository.countByStatus('active'),
    prisma.message.count({ where: { createdAt: { gte: startOfDay } } }),
    usageRepository.sumCostCurrentMonth(),
    prisma.skill.count({
      where: {
        enabled: true,
        currentVersion: {
          vettingResults: {
            some: { result: { in: ['passed', 'warning'] } },
          },
        },
      },
    }),
  ]);

  return {
    activeConversations,
    messagesToday,
    apiCostsMtd,
    activeSkills,
  };
}

export async function getConversationTrend(days = 14) {
  const since = new Date();
  since.setDate(since.getDate() - days);
  since.setHours(0, 0, 0, 0);

  const conversations = await prisma.conversation.findMany({
    where: { createdAt: { gte: since } },
    select: { createdAt: true },
  });

  // Build a map of date string → count
  const buckets = new Map<string, number>();
  for (let i = 0; i < days; i++) {
    const d = new Date(since);
    d.setDate(d.getDate() + i);
    buckets.set(d.toISOString().slice(0, 10), 0);
  }

  for (const c of conversations) {
    const key = c.createdAt.toISOString().slice(0, 10);
    if (buckets.has(key)) {
      buckets.set(key, (buckets.get(key) ?? 0) + 1);
    }
  }

  return Array.from(buckets.entries()).map(([date, count]) => ({ date, count }));
}

export async function getCostTrend(days = 14) {
  const since = new Date();
  since.setDate(since.getDate() - days);
  since.setHours(0, 0, 0, 0);

  const logs = await prisma.usageLog.findMany({
    where: { createdAt: { gte: since } },
    select: { createdAt: true, costUsd: true },
  });

  const buckets = new Map<string, number>();
  for (let i = 0; i < days; i++) {
    const d = new Date(since);
    d.setDate(d.getDate() + i);
    buckets.set(d.toISOString().slice(0, 10), 0);
  }

  for (const l of logs) {
    const key = l.createdAt.toISOString().slice(0, 10);
    if (buckets.has(key)) {
      buckets.set(key, (buckets.get(key) ?? 0) + Number(l.costUsd));
    }
  }

  return Array.from(buckets.entries()).map(([date, cost]) => ({ date, cost: Math.round(cost * 10000) / 10000 }));
}

export async function getRecentActivity(limit = 10) {
  const logs = await prisma.auditLog.findMany({
    take: limit,
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      action: true,
      targetType: true,
      createdAt: true,
    },
  });

  return logs.map((log) => ({
    id: log.id,
    action: log.action,
    targetType: log.targetType,
    createdAt: log.createdAt.toISOString(),
  }));
}
