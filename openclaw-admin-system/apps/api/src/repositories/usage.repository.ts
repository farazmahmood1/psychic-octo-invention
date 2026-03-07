import { BaseRepository } from '../db/repository.js';
import type { Prisma } from '@prisma/client';

export class UsageRepository extends BaseRepository {
  async create(data: Prisma.UsageLogUncheckedCreateInput) {
    return this.db.usageLog.create({ data });
  }

  async aggregateCostsByPeriod(startDate: Date, endDate: Date, filters?: { provider?: string; model?: string }) {
    const where: Prisma.UsageLogWhereInput = {
      createdAt: { gte: startDate, lte: endDate },
      ...(filters?.provider ? { provider: filters.provider } : {}),
      ...(filters?.model ? { model: filters.model } : {}),
    };

    return this.db.usageLog.groupBy({
      by: ['provider', 'model'],
      where,
      _sum: { totalTokens: true, costUsd: true },
      _count: true,
    });
  }

  async getSummaryStats(filters?: { dateFrom?: Date; dateTo?: Date; provider?: string; model?: string }) {
    const where: Prisma.UsageLogWhereInput = {
      ...(filters?.dateFrom || filters?.dateTo ? {
        createdAt: {
          ...(filters?.dateFrom ? { gte: filters.dateFrom } : {}),
          ...(filters?.dateTo ? { lte: filters.dateTo } : {}),
        },
      } : {}),
      ...(filters?.provider ? { provider: filters.provider } : {}),
      ...(filters?.model ? { model: filters.model } : {}),
    };

    const result = await this.db.usageLog.aggregate({
      where,
      _count: true,
      _sum: { totalTokens: true, costUsd: true },
      _avg: { latencyMs: true },
    });

    return {
      totalRequests: result._count,
      totalTokens: result._sum.totalTokens ?? 0,
      totalCostUsd: result._sum.costUsd ? Number(result._sum.costUsd) : 0,
      averageLatencyMs: result._avg.latencyMs ?? null,
    };
  }

  async getTimeseries(filters: {
    dateFrom?: Date;
    dateTo?: Date;
    granularity: 'hour' | 'day' | 'week';
    provider?: string;
    model?: string;
  }) {
    const truncFn = filters.granularity === 'hour'
      ? `date_trunc('hour', created_at)`
      : filters.granularity === 'week'
        ? `date_trunc('week', created_at)`
        : `date_trunc('day', created_at)`;

    const conditions: string[] = [];
    const params: unknown[] = [];
    let paramIdx = 1;

    if (filters.dateFrom) {
      conditions.push(`created_at >= $${paramIdx++}`);
      params.push(filters.dateFrom);
    }
    if (filters.dateTo) {
      conditions.push(`created_at <= $${paramIdx++}`);
      params.push(filters.dateTo);
    }
    if (filters.provider) {
      conditions.push(`provider = $${paramIdx++}`);
      params.push(filters.provider);
    }
    if (filters.model) {
      conditions.push(`model = $${paramIdx++}`);
      params.push(filters.model);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const rows = await this.db.$queryRawUnsafe<Array<{
      period: Date;
      requests: bigint;
      tokens: bigint;
      cost_usd: number;
    }>>(
      `SELECT ${truncFn} as period,
              COUNT(*)::bigint as requests,
              COALESCE(SUM(total_tokens), 0)::bigint as tokens,
              COALESCE(SUM(cost_usd), 0)::float8 as cost_usd
       FROM usage_logs
       ${whereClause}
       GROUP BY period
       ORDER BY period ASC`,
      ...params,
    );

    return rows.map((r) => ({
      period: r.period.toISOString(),
      requests: Number(r.requests),
      tokens: Number(r.tokens),
      costUsd: Number(r.cost_usd),
    }));
  }

  async countToday() {
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);
    return this.db.usageLog.count({ where: { createdAt: { gte: startOfDay } } });
  }

  async sumCostCurrentMonth() {
    const startOfMonth = new Date();
    startOfMonth.setDate(1);
    startOfMonth.setHours(0, 0, 0, 0);
    const result = await this.db.usageLog.aggregate({
      where: { createdAt: { gte: startOfMonth } },
      _sum: { costUsd: true },
    });
    return result._sum.costUsd ? Number(result._sum.costUsd) : 0;
  }

  async list(filters: {
    provider?: string;
    model?: string;
    page: number;
    pageSize: number;
  }) {
    const where: Prisma.UsageLogWhereInput = {
      ...(filters.provider ? { provider: filters.provider } : {}),
      ...(filters.model ? { model: filters.model } : {}),
    };

    const [data, total] = await Promise.all([
      this.db.usageLog.findMany({
        where,
        skip: (filters.page - 1) * filters.pageSize,
        take: filters.pageSize,
        orderBy: { createdAt: 'desc' },
      }),
      this.db.usageLog.count({ where }),
    ]);
    return { data, total };
  }
}

export const usageRepository = new UsageRepository();
