import { useState, useMemo } from 'react';
import type { JobSummary, PaginatedResponse } from '@openclaw/shared';
import { PageHeader } from '@/components/page-header';
import { DataTable, type Column } from '@/components/data-table';
import { StatusBadge } from '@/components/status-badge';
import { Select } from '@/components/ui/select';
import { MetricCard } from '@/components/metric-card';
import { Badge } from '@/components/ui/badge';
import { useApiQuery } from '@/hooks/use-api-query';
import { Activity, CheckCircle, XCircle, Clock } from 'lucide-react';

const EMPTY_RESPONSE: PaginatedResponse<JobSummary> = {
  data: [],
  meta: { page: 1, pageSize: 20, total: 0, totalPages: 0 },
};

const STATUS_OPTIONS = [
  { value: '', label: 'All statuses' },
  { value: 'pending', label: 'Pending' },
  { value: 'running', label: 'Running' },
  { value: 'completed', label: 'Completed' },
  { value: 'failed', label: 'Failed' },
  { value: 'retrying', label: 'Retrying' },
  { value: 'cancelled', label: 'Cancelled' },
];

const QUEUE_OPTIONS = [
  { value: '', label: 'All queues' },
  { value: 'orchestration', label: 'Orchestration' },
  { value: 'channel-delivery', label: 'Channel Delivery' },
  { value: 'email-processing', label: 'Email Processing' },
  { value: 'ghl-sub-agent', label: 'GHL CRM' },
  { value: 'bookkeeping', label: 'Bookkeeping' },
  { value: 'followup', label: 'Follow-Up' },
  { value: 'memory-extraction', label: 'Memory Extraction' },
];

function formatQueue(queue: string): string {
  const map: Record<string, string> = {
    orchestration: 'Orchestration',
    'channel-delivery': 'Delivery',
    'email-processing': 'Email',
    'ghl-sub-agent': 'GHL CRM',
    bookkeeping: 'Bookkeeping',
    followup: 'Follow-Up',
    'memory-extraction': 'Memory',
  };
  return map[queue] ?? queue;
}

function renderEmailSlaBadge(job: JobSummary) {
  if (job.queueName !== 'email-processing') {
    return <span className="text-muted-foreground">-</span>;
  }

  const createdAtMs = new Date(job.createdAt).getTime();
  const endMs = job.completedAt ? new Date(job.completedAt).getTime() : Date.now();
  const elapsedMs = Math.max(0, endMs - createdAtMs);
  const elapsedMinutes = elapsedMs / (1000 * 60);

  if (job.status === 'completed') {
    if (elapsedMinutes <= 15) {
      return <Badge variant="success">within SLA</Badge>;
    }
    return <Badge variant="warning">completed late</Badge>;
  }

  if (job.status === 'failed' || job.status === 'cancelled') {
    return <Badge variant="destructive">not met</Badge>;
  }

  if (elapsedMinutes >= 15) {
    return <Badge variant="destructive">late</Badge>;
  }
  if (elapsedMinutes >= 10) {
    return <Badge variant="warning">at risk</Badge>;
  }

  return <Badge variant="info">on track</Badge>;
}

export function JobsPage() {
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState('');
  const [queue, setQueue] = useState('');

  const params = useMemo(() => {
    const p = new URLSearchParams();
    p.set('page', String(page));
    p.set('pageSize', '20');
    if (status) p.set('status', status);
    if (queue) p.set('queueName', queue);
    return p.toString();
  }, [page, status, queue]);

  const { data, loading, error, refetch } = useApiQuery<PaginatedResponse<JobSummary>>(
    `/jobs?${params}`,
    EMPTY_RESPONSE,
  );

  const jobs = data?.data ?? [];
  const meta = data?.meta ?? EMPTY_RESPONSE.meta;

  const pendingCount = jobs.filter((j) => j.status === 'pending').length;
  const runningCount = jobs.filter((j) => j.status === 'running').length;
  const failedCount = jobs.filter((j) => j.status === 'failed').length;
  const completedCount = jobs.filter((j) => j.status === 'completed').length;

  const columns: Column<JobSummary>[] = [
    {
      key: 'id',
      header: 'ID',
      render: (row) => (
        <div className="space-y-1">
          <span className="font-mono text-xs">{row.id.slice(0, 8)}...</span>
          {row.idempotencyKey && (
            <p className="font-mono text-[10px] text-muted-foreground" title={row.idempotencyKey}>
              key: {row.idempotencyKey.slice(0, 16)}...
            </p>
          )}
        </div>
      ),
      className: 'w-28',
    },
    {
      key: 'queue',
      header: 'Queue',
      render: (row) => formatQueue(row.queueName),
      className: 'w-32',
    },
    {
      key: 'type',
      header: 'Type',
      render: (row) => <span className="font-mono text-xs">{row.jobType}</span>,
    },
    {
      key: 'status',
      header: 'Status',
      render: (row) => <StatusBadge status={row.status} />,
      className: 'w-28',
    },
    {
      key: 'sla',
      header: 'Email SLA',
      render: (row) => renderEmailSlaBadge(row),
      className: 'w-28',
    },
    {
      key: 'attempts',
      header: 'Attempts',
      render: (row) => `${row.attempts}/${row.maxAttempts}`,
      className: 'w-24 text-center',
    },
    {
      key: 'error',
      header: 'Last Error',
      render: (row) => {
        if (!row.lastError) {
          return <span className="text-muted-foreground">-</span>;
        }
        const shortened = row.lastError.length > 90
          ? `${row.lastError.slice(0, 87)}...`
          : row.lastError;
        return (
          <span className="text-xs text-destructive" title={row.lastError}>
            {shortened}
          </span>
        );
      },
    },
    {
      key: 'created',
      header: 'Created',
      render: (row) => new Date(row.createdAt).toLocaleString(),
      className: 'w-40',
    },
    {
      key: 'updated',
      header: 'Updated',
      render: (row) => new Date(row.updatedAt).toLocaleString(),
      className: 'w-40',
    },
    {
      key: 'duration',
      header: 'Duration',
      render: (row) => {
        if (!row.startedAt) return '-';
        const end = row.completedAt ? new Date(row.completedAt) : new Date();
        const start = new Date(row.startedAt);
        const ms = end.getTime() - start.getTime();
        if (ms < 1000) return `${ms}ms`;
        return `${(ms / 1000).toFixed(1)}s`;
      },
      className: 'w-24 text-right',
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Jobs & Tasks"
        description="Monitor background jobs across all queues."
      />

      <div className="grid gap-4 md:grid-cols-4">
        <MetricCard title="Pending" value={pendingCount} icon={<Clock className="h-4 w-4" />} loading={loading} />
        <MetricCard title="Running" value={runningCount} icon={<Activity className="h-4 w-4" />} loading={loading} />
        <MetricCard title="Completed" value={completedCount} icon={<CheckCircle className="h-4 w-4" />} loading={loading} />
        <MetricCard title="Failed" value={failedCount} icon={<XCircle className="h-4 w-4" />} loading={loading} />
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Select value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }}>
          {STATUS_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </Select>
        <Select value={queue} onChange={(e) => { setQueue(e.target.value); setPage(1); }}>
          {QUEUE_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </Select>
      </div>

      <DataTable<JobSummary>
        columns={columns}
        data={jobs}
        loading={loading}
        error={error}
        onRetry={refetch}
        emptyTitle="No jobs found"
        emptyDescription="Background jobs will appear here as the system processes requests."
        page={meta.page}
        pageSize={meta.pageSize}
        total={meta.total}
        onPageChange={setPage}
      />
    </div>
  );
}
