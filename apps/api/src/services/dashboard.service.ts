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
