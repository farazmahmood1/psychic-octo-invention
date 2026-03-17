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

const CHART_HEIGHT = 200;
const CHART_PADDING = { top: 20, right: 16, bottom: 30, left: 50 };

function TimeseriesChart({ buckets, loading }: { buckets: UsageTimeseriesBucket[]; loading: boolean }) {
  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="h-48 w-full animate-pulse rounded bg-muted" />
      </div>
    );
  }

  if (buckets.length === 0) {
    return (
      <div className="flex h-64 items-center justify-center text-sm text-muted-foreground">
        No usage data in this period.
      </div>
    );
  }

  const maxCost = Math.max(...buckets.map((b) => b.costUsd), 0.001);
  const maxRequests = Math.max(...buckets.map((b) => b.requests), 1);

  const innerHeight = CHART_HEIGHT - CHART_PADDING.top - CHART_PADDING.bottom;

  function buildPath(values: number[], maxVal: number): string {
    if (values.length === 0) return '';
    const step = 100 / Math.max(values.length - 1, 1);
    return values
      .map((v, i) => {
        const x = i * step;
        const y = 100 - (v / maxVal) * 100;
        return `${i === 0 ? 'M' : 'L'} ${x} ${y}`;
      })
      .join(' ');
  }

  function buildAreaPath(values: number[], maxVal: number): string {
    if (values.length === 0) return '';
    const linePath = buildPath(values, maxVal);
    const step = 100 / Math.max(values.length - 1, 1);
    const lastX = (values.length - 1) * step;
    return `${linePath} L ${lastX} 100 L 0 100 Z`;
  }

  const costValues = buckets.map((b) => b.costUsd);
  const requestValues = buckets.map((b) => b.requests);

  const costLinePath = buildPath(costValues, maxCost);
  const costAreaPath = buildAreaPath(costValues, maxCost);
  const reqLinePath = buildPath(requestValues, maxRequests);
  const reqAreaPath = buildAreaPath(requestValues, maxRequests);

  // Y-axis ticks (5 ticks)
  const costTicks = Array.from({ length: 5 }, (_, i) => (maxCost / 4) * i);
  const reqTicks = Array.from({ length: 5 }, (_, i) => Math.round((maxRequests / 4) * i));

  // X-axis labels — show ~5 evenly spaced dates
  const labelCount = Math.min(buckets.length, 5);
  const xLabels = Array.from({ length: labelCount }, (_, i) => {
    const idx = Math.round((i / Math.max(labelCount - 1, 1)) * (buckets.length - 1));
    return { idx, label: new Date(buckets[idx]!.period).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) };
  });

  return (
    <div className="space-y-8">
      {/* Cost line chart */}
      <div>
        <p className="mb-2 text-xs font-medium text-muted-foreground">Cost per day (USD)</p>
        <div className="relative" style={{ height: CHART_HEIGHT }}>
          {/* Y-axis labels */}
          <div className="absolute left-0 top-0 flex h-full flex-col justify-between pr-2 text-right" style={{ width: CHART_PADDING.left - 4 }}>
            {[...costTicks].reverse().map((tick, i) => (
              <span key={i} className="text-[10px] text-muted-foreground">${tick.toFixed(3)}</span>
            ))}
          </div>

          {/* Chart area */}
          <div className="absolute" style={{ left: CHART_PADDING.left, right: CHART_PADDING.right, top: CHART_PADDING.top, height: innerHeight }}>
            {/* Grid lines */}
            <svg className="absolute inset-0 h-full w-full" preserveAspectRatio="none">
              {costTicks.map((_, i) => {
                const y = (i / (costTicks.length - 1)) * 100;
                return <line key={i} x1="0%" y1={`${y}%`} x2="100%" y2={`${y}%`} stroke="currentColor" className="text-muted/30" strokeWidth="1" strokeDasharray="4 4" />;
              })}
            </svg>

            {/* Line + area */}
            <svg className="absolute inset-0 h-full w-full" viewBox="0 0 100 100" preserveAspectRatio="none">
              <path d={costAreaPath} fill="hsl(var(--primary) / 0.1)" />
              <path d={costLinePath} fill="none" stroke="hsl(var(--primary))" strokeWidth="2" vectorEffect="non-scaling-stroke" />
            </svg>

            {/* Hover dots */}
            <svg className="absolute inset-0 h-full w-full" viewBox="0 0 100 100" preserveAspectRatio="none">
              {costValues.map((v, i) => {
                const step = 100 / Math.max(costValues.length - 1, 1);
                const x = i * step;
                const y = 100 - (v / maxCost) * 100;
                return (
                  <circle
                    key={i}
                    cx={x}
                    cy={y}
                    r="1.5"
                    fill="hsl(var(--primary))"
                    className="transition-all hover:r-[3]"
                  >
                    <title>{`${new Date(buckets[i]!.period).toLocaleDateString()}: $${v.toFixed(4)}`}</title>
                  </circle>
                );
              })}
            </svg>
          </div>

          {/* X-axis labels */}
          <div className="absolute flex justify-between" style={{ left: CHART_PADDING.left, right: CHART_PADDING.right, bottom: 0 }}>
            {xLabels.map(({ idx, label }) => (
              <span key={idx} className="text-[10px] text-muted-foreground">{label}</span>
            ))}
          </div>
        </div>
      </div>

      {/* Requests line chart */}
      <div>
        <p className="mb-2 text-xs font-medium text-muted-foreground">Requests per day</p>
        <div className="relative" style={{ height: CHART_HEIGHT }}>
          {/* Y-axis labels */}
          <div className="absolute left-0 top-0 flex h-full flex-col justify-between pr-2 text-right" style={{ width: CHART_PADDING.left - 4 }}>
            {[...reqTicks].reverse().map((tick, i) => (
              <span key={i} className="text-[10px] text-muted-foreground">{tick}</span>
            ))}
          </div>

          {/* Chart area */}
          <div className="absolute" style={{ left: CHART_PADDING.left, right: CHART_PADDING.right, top: CHART_PADDING.top, height: innerHeight }}>
            {/* Grid lines */}
            <svg className="absolute inset-0 h-full w-full" preserveAspectRatio="none">
              {reqTicks.map((_, i) => {
                const y = (i / (reqTicks.length - 1)) * 100;
                return <line key={i} x1="0%" y1={`${y}%`} x2="100%" y2={`${y}%`} stroke="currentColor" className="text-muted/30" strokeWidth="1" strokeDasharray="4 4" />;
              })}
            </svg>

            {/* Line + area */}
            <svg className="absolute inset-0 h-full w-full" viewBox="0 0 100 100" preserveAspectRatio="none">
              <path d={reqAreaPath} fill="hsl(210 100% 50% / 0.08)" />
              <path d={reqLinePath} fill="none" stroke="hsl(210 100% 50%)" strokeWidth="2" vectorEffect="non-scaling-stroke" />
            </svg>

            {/* Hover dots */}
            <svg className="absolute inset-0 h-full w-full" viewBox="0 0 100 100" preserveAspectRatio="none">
              {requestValues.map((v, i) => {
                const step = 100 / Math.max(requestValues.length - 1, 1);
                const x = i * step;
                const y = 100 - (v / maxRequests) * 100;
                return (
                  <circle
                    key={i}
                    cx={x}
                    cy={y}
                    r="1.5"
                    fill="hsl(210 100% 50%)"
                    className="transition-all hover:r-[3]"
                  >
                    <title>{`${new Date(buckets[i]!.period).toLocaleDateString()}: ${v} requests`}</title>
                  </circle>
                );
              })}
            </svg>
          </div>

          {/* X-axis labels */}
          <div className="absolute flex justify-between" style={{ left: CHART_PADDING.left, right: CHART_PADDING.right, bottom: 0 }}>
            {xLabels.map(({ idx, label }) => (
              <span key={idx} className="text-[10px] text-muted-foreground">{label}</span>
            ))}
          </div>
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
