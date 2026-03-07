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
    prisma.skill.count({ where: { enabled: true } }),
  ]);

  return {
    activeConversations,
    messagesToday,
    apiCostsMtd,
    activeSkills,
  };
}
