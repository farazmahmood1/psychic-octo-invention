import { useState, useMemo } from 'react';
import type { UsageSummaryResponse, UsageTimeseriesBucket } from '@openclaw/shared';
import { DollarSign, Cpu, Zap, TrendingUp, Clock } from 'lucide-react';
import { PageHeader } from '@/components/page-header';
import { MetricCard } from '@/components/metric-card';
import { Select } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { useApiQuery } from '@/hooks/use-api-query';

const EMPTY_SUMMARY: { data: UsageSummaryResponse } = {
  data: { totalCostUsd: 0, totalTokens: 0, totalRequests: 0, averageLatencyMs: null, byModel: [] },
};

const EMPTY_TIMESERIES: { data: UsageTimeseriesBucket[] } = { data: [] };

function dateRangeParams(range: string) {
  const now = new Date();
  const from = new Date();
  if (range === '7d') from.setDate(now.getDate() - 7);
  else if (range === '30d') from.setDate(now.getDate() - 30);
  else from.setDate(now.getDate() - 90);
  return { dateFrom: from.toISOString(), dateTo: now.toISOString() };
}

function TimeseriesChart({ buckets, loading }: { buckets: UsageTimeseriesBucket[]; loading: boolean }) {
  if (loading) {
    return (
      <div className="flex h-48 items-center justify-center">
        <div className="h-32 w-full animate-pulse rounded bg-muted" />
      </div>
    );
  }

  if (buckets.length === 0) {
    return (
      <div className="flex h-48 items-center justify-center text-sm text-muted-foreground">
        No usage data in this period.
      </div>
    );
  }

  const maxCost = Math.max(...buckets.map((b) => b.costUsd), 0.001);
  const maxRequests = Math.max(...buckets.map((b) => b.requests), 1);

  return (
    <div className="space-y-2">
      {/* Cost bars */}
      <div className="flex items-end gap-1" style={{ height: 120 }}>
        {buckets.map((b, i) => {
          const height = Math.max((b.costUsd / maxCost) * 100, 2);
          return (
            <div
              key={i}
              className="group relative flex-1 cursor-default"
              title={`${new Date(b.period).toLocaleDateString()}\n$${b.costUsd.toFixed(4)} | ${b.requests} reqs | ${b.tokens.toLocaleString()} tokens`}
            >
              <div
                className="w-full rounded-t bg-primary transition-colors hover:bg-primary/80"
                style={{ height: `${height}%` }}
              />
            </div>
          );
        })}
      </div>
      <div className="flex justify-between text-[10px] text-muted-foreground">
        <span>{new Date(buckets[0]!.period).toLocaleDateString()}</span>
        <span>Cost per day (hover for details)</span>
        <span>{new Date(buckets[buckets.length - 1]!.period).toLocaleDateString()}</span>
      </div>
      {/* Requests bars */}
      <div className="mt-4">
        <p className="mb-1 text-xs font-medium text-muted-foreground">Requests per day</p>
        <div className="flex items-end gap-1" style={{ height: 60 }}>
          {buckets.map((b, i) => {
            const height = Math.max((b.requests / maxRequests) * 100, 2);
            return (
              <div
                key={i}
                className="flex-1"
                title={`${new Date(b.period).toLocaleDateString()}: ${b.requests} requests`}
              >
                <div
                  className="w-full rounded-t bg-blue-500/60 transition-colors hover:bg-blue-500/80"
                  style={{ height: `${height}%` }}
                />
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

export function UsagePage() {
  const [dateRange, setDateRange] = useState('30d');
  const [provider, setProvider] = useState('');

  const { dateFrom, dateTo } = useMemo(() => dateRangeParams(dateRange), [dateRange]);

  const summaryUrl = useMemo(() => {
    const p = new URLSearchParams({ dateFrom, dateTo });
    if (provider) p.set('provider', provider);
    return `/usage/summary?${p.toString()}`;
  }, [dateFrom, dateTo, provider]);

  const timeseriesUrl = useMemo(() => {
    const p = new URLSearchParams({ dateFrom, dateTo, granularity: 'day' });
    if (provider) p.set('provider', provider);
    return `/usage/timeseries?${p.toString()}`;
  }, [dateFrom, dateTo, provider]);

  const summary = useApiQuery<{ data: UsageSummaryResponse }>(summaryUrl, EMPTY_SUMMARY);
  const timeseries = useApiQuery<{ data: UsageTimeseriesBucket[] }>(timeseriesUrl, EMPTY_TIMESERIES);

  const s = summary.data?.data ?? EMPTY_SUMMARY.data;
  const buckets = timeseries.data?.data ?? [];

  return (
    <div className="space-y-8">
      <PageHeader
        title="API Usage"
        description="Monitor AI model usage, costs, and performance."
      />

      <div className="flex items-center gap-3">
        <Select value={dateRange} onChange={(e) => setDateRange(e.target.value)} className="w-40">
          <option value="7d">Last 7 days</option>
          <option value="30d">Last 30 days</option>
          <option value="90d">Last 90 days</option>
        </Select>
        <Input
          placeholder="Filter by provider..."
          value={provider}
          onChange={(e) => setProvider(e.target.value)}
          className="w-48"
        />
      </div>

      {/* Summary metrics */}
      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-5">
        <MetricCard title="Total Cost" value={`$${s.totalCostUsd.toFixed(2)}`} icon={<DollarSign className="h-4 w-4" />} loading={summary.loading} />
        <MetricCard title="Total Tokens" value={s.totalTokens.toLocaleString()} icon={<Cpu className="h-4 w-4" />} loading={summary.loading} />
        <MetricCard title="Total Requests" value={s.totalRequests.toLocaleString()} icon={<Zap className="h-4 w-4" />} loading={summary.loading} />
        <MetricCard title="Avg Latency" value={s.averageLatencyMs != null ? `${Math.round(s.averageLatencyMs)}ms` : '-'} icon={<Clock className="h-4 w-4" />} loading={summary.loading} />
        <MetricCard title="Avg Cost / Request" value={s.totalRequests > 0 ? `$${(s.totalCostUsd / s.totalRequests).toFixed(4)}` : '-'} icon={<TrendingUp className="h-4 w-4" />} loading={summary.loading} />
      </div>

      {/* Timeseries chart */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Usage Over Time</CardTitle>
        </CardHeader>
        <CardContent>
          <TimeseriesChart buckets={buckets} loading={timeseries.loading} />
        </CardContent>
      </Card>

      {/* Model breakdown */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Model Breakdown</CardTitle>
        </CardHeader>
        <CardContent>
          {s.byModel.length === 0 ? (
            <p className="py-4 text-center text-sm text-muted-foreground">
              Usage breakdown will appear once API calls are made.
            </p>
          ) : (
            <div className="space-y-3">
              {s.byModel.map((agg) => {
                const maxCost = Math.max(...s.byModel.map((a) => a.totalCostUsd), 1);
                const pct = (agg.totalCostUsd / maxCost) * 100;
                return (
                  <div key={`${agg.provider}-${agg.model}`} className="space-y-1">
                    <div className="flex items-center justify-between text-sm">
                      <span>
                        <span className="font-medium">{agg.provider}</span>
                        <span className="text-muted-foreground"> / {agg.model}</span>
                      </span>
                      <span className="font-mono">${agg.totalCostUsd.toFixed(4)}</span>
                    </div>
                    <div className="h-2 rounded-full bg-muted">
                      <div className="h-2 rounded-full bg-primary transition-all" style={{ width: `${pct}%` }} />
                    </div>
                    <div className="flex justify-between text-xs text-muted-foreground">
                      <span>{agg.requestCount} requests</span>
                      <span>{agg.totalTokens.toLocaleString()} tokens</span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
