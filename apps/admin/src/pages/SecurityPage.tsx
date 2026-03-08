import { useState, useMemo } from 'react';
import type { SecurityEvent, SkillOverrideRecord, PaginatedResponse } from '@openclaw/shared';
import { PageHeader } from '@/components/page-header';
import { DataTable, type Column } from '@/components/data-table';
import { Badge } from '@/components/ui/badge';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { useApiQuery } from '@/hooks/use-api-query';
import { ShieldAlert, ShieldCheck } from 'lucide-react';

const EMPTY_EVENTS: PaginatedResponse<SecurityEvent> = {
  data: [],
  meta: { page: 1, pageSize: 20, total: 0, totalPages: 0 },
};

const EMPTY_OVERRIDES: PaginatedResponse<SkillOverrideRecord> = {
  data: [],
  meta: { page: 1, pageSize: 20, total: 0, totalPages: 0 },
};

export function SecurityPage() {
  const [eventsPage, setEventsPage] = useState(1);
  const [overridesPage, setOverridesPage] = useState(1);
  const [activeTab, setActiveTab] = useState<'blocked' | 'overrides'>('blocked');

  const eventsParams = useMemo(() => {
    const p = new URLSearchParams();
    p.set('page', String(eventsPage));
    p.set('pageSize', '20');
    return p.toString();
  }, [eventsPage]);

  const overridesParams = useMemo(() => {
    const p = new URLSearchParams();
    p.set('page', String(overridesPage));
    p.set('pageSize', '20');
    return p.toString();
  }, [overridesPage]);

  const events = useApiQuery<PaginatedResponse<SecurityEvent>>(
    `/security/blocked?${eventsParams}`,
    EMPTY_EVENTS,
  );

  const overrides = useApiQuery<PaginatedResponse<SkillOverrideRecord>>(
    `/security/overrides?${overridesParams}`,
    EMPTY_OVERRIDES,
  );

  const eventColumns: Column<SecurityEvent>[] = [
    {
      key: 'time',
      header: 'Time',
      render: (row) => <span className="text-xs">{new Date(row.createdAt).toLocaleString()}</span>,
      className: 'w-40',
    },
    {
      key: 'action',
      header: 'Action',
      render: (row) => (
        <Badge variant="destructive">
          {row.action.replace('security.', '').replace(/\./g, ' ').replace(/_/g, ' ')}
        </Badge>
      ),
    },
    {
      key: 'skill',
      header: 'Skill',
      render: (row) => row.skillName ?? row.skillSlug ?? <span className="text-muted-foreground">-</span>,
      className: 'w-40',
    },
    {
      key: 'reason',
      header: 'Reason',
      render: (row) => <span className="text-sm">{row.reason}</span>,
    },
    {
      key: 'ip',
      header: 'IP',
      render: (row) => <span className="font-mono text-xs">{row.ipAddress ?? '-'}</span>,
      className: 'w-32',
    },
  ];

  const overrideColumns: Column<SkillOverrideRecord>[] = [
    {
      key: 'time',
      header: 'Time',
      render: (row) => <span className="text-xs">{new Date(row.createdAt).toLocaleString()}</span>,
      className: 'w-40',
    },
    {
      key: 'skill',
      header: 'Skill',
      render: (row) => row.skillName,
      className: 'w-40',
    },
    {
      key: 'change',
      header: 'Change',
      render: (row) => (
        <span className="text-sm">
          <Badge variant="destructive" className="mr-1">{row.previousResult}</Badge>
          {' -> '}
          <Badge variant="success">{row.newResult}</Badge>
        </span>
      ),
    },
    {
      key: 'reason',
      header: 'Reason',
      render: (row) => <span className="text-sm">{row.reason}</span>,
    },
  ];

  const blockedMeta = events.data?.meta ?? EMPTY_EVENTS.meta;
  const overrideMeta = overrides.data?.meta ?? EMPTY_OVERRIDES.meta;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Security"
        description="Monitor blocked skill attempts and vetting override history."
      />

      {/* Summary cards */}
      <div className="grid gap-4 md:grid-cols-2">
        <Card
          className={`cursor-pointer transition-colors ${activeTab === 'blocked' ? 'ring-2 ring-primary' : ''}`}
          onClick={() => setActiveTab('blocked')}
        >
          <CardHeader className="flex flex-row items-center gap-3 pb-2">
            <ShieldAlert className="h-5 w-5 text-destructive" />
            <CardTitle className="text-sm">Blocked Attempts</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{blockedMeta.total}</div>
            <p className="text-xs text-muted-foreground">Skills blocked from executing</p>
          </CardContent>
        </Card>

        <Card
          className={`cursor-pointer transition-colors ${activeTab === 'overrides' ? 'ring-2 ring-primary' : ''}`}
          onClick={() => setActiveTab('overrides')}
        >
          <CardHeader className="flex flex-row items-center gap-3 pb-2">
            <ShieldCheck className="h-5 w-5 text-green-500" />
            <CardTitle className="text-sm">Manual Overrides</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{overrideMeta.total}</div>
            <p className="text-xs text-muted-foreground">Vetting results manually overridden</p>
          </CardContent>
        </Card>
      </div>

      {activeTab === 'blocked' ? (
        <DataTable<SecurityEvent>
          columns={eventColumns}
          data={events.data?.data ?? []}
          loading={events.loading}
          error={events.error}
          onRetry={events.refetch}
          emptyTitle="No blocked attempts"
          emptyDescription="When a skill is blocked from executing, it will be logged here."
          page={blockedMeta.page}
          pageSize={blockedMeta.pageSize}
          total={blockedMeta.total}
          onPageChange={setEventsPage}
        />
      ) : (
        <DataTable<SkillOverrideRecord>
          columns={overrideColumns}
          data={overrides.data?.data ?? []}
          loading={overrides.loading}
          error={overrides.error}
          onRetry={overrides.refetch}
          emptyTitle="No overrides"
          emptyDescription="Manual vetting overrides will appear here when a super admin approves a blocked skill."
          page={overrideMeta.page}
          pageSize={overrideMeta.pageSize}
          total={overrideMeta.total}
          onPageChange={setOverridesPage}
        />
      )}
    </div>
  );
}
