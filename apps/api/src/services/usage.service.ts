import type { UsageSummaryResponse, UsageSummaryQuery, UsageTimeseriesQuery, UsageTimeseriesBucket } from '@openclaw/shared';
import { usageRepository } from '../repositories/usage.repository.js';

export async function getUsageSummary(query: UsageSummaryQuery): Promise<UsageSummaryResponse> {
  const dateFrom = query.dateFrom ?? defaultStartDate();
  const dateTo = query.dateTo ?? new Date();

  const [stats, byModel] = await Promise.all([
    usageRepository.getSummaryStats({
      dateFrom,
      dateTo,
      provider: query.provider,
      model: query.model,
    }),
    usageRepository.aggregateCostsByPeriod(dateFrom, dateTo, {
      provider: query.provider,
      model: query.model,
    }),
  ]);

  return {
    totalRequests: stats.totalRequests,
    totalTokens: stats.totalTokens,
    totalCostUsd: stats.totalCostUsd,
    averageLatencyMs: stats.averageLatencyMs,
    byModel: byModel.map((row) => ({
      provider: row.provider,
      model: row.model,
      totalTokens: row._sum.totalTokens ?? 0,
      totalCostUsd: row._sum.costUsd ? Number(row._sum.costUsd) : 0,
      requestCount: row._count,
    })),
  };
}

export async function getUsageTimeseries(query: UsageTimeseriesQuery): Promise<UsageTimeseriesBucket[]> {
  return usageRepository.getTimeseries({
    dateFrom: query.dateFrom ?? defaultStartDate(),
    dateTo: query.dateTo ?? new Date(),
    granularity: query.granularity,
    provider: query.provider,
    model: query.model,
  });
}

function defaultStartDate(): Date {
  const d = new Date();
  d.setDate(d.getDate() - 30);
  return d;
}
