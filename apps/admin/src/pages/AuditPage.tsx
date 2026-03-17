import { useState, useMemo } from 'react';
import type { AuditLogEntry, PaginatedResponse } from '@openclaw/shared';
import { PageHeader } from '@/components/page-header';
import { DataTable, type Column } from '@/components/data-table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Select } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { useApiQuery } from '@/hooks/use-api-query';
import { X, Download } from 'lucide-react';
import { downloadCsv } from '@/lib/export';

const EMPTY_RESPONSE: PaginatedResponse<AuditLogEntry> = {
  data: [],
  meta: { page: 1, pageSize: 20, total: 0, totalPages: 0 },
};

const ACTION_OPTIONS = [
  { value: '', label: 'All actions' },
  { value: 'auth.login_success', label: 'Login' },
  { value: 'auth.login_failed', label: 'Login Failed' },
  { value: 'auth.logout', label: 'Logout' },
  { value: 'auth.password_changed', label: 'Password Changed' },
  { value: 'skill.enabled', label: 'Skill Enabled' },
  { value: 'skill.disabled', label: 'Skill Disabled' },
  { value: 'skill.ingested', label: 'Skill Ingested' },
  { value: 'skill.ingestion_blocked', label: 'Skill Ingestion Blocked' },
  { value: 'skill.execution_blocked', label: 'Skill Execution Blocked' },
  { value: 'settings.routing_updated', label: 'Routing Updated' },
];

const TARGET_TYPE_OPTIONS = [
  { value: '', label: 'All targets' },
  { value: 'auth', label: 'Auth' },
  { value: 'skill', label: 'Skill' },
  { value: 'conversation', label: 'Conversation' },
  { value: 'setting', label: 'Setting' },
];

function formatAction(action: string): string {
  return action.replace(/\./g, ' ').replace(/_/g, ' ');
}

function actionVariant(action: string) {
  if (action.includes('fail') || action.includes('block')) return 'destructive' as const;
  if (action.includes('login_success')) return 'success' as const;
  if (action.includes('logout')) return 'secondary' as const;
  if (action.includes('password') || action.includes('toggled')) return 'warning' as const;
  return 'outline' as const;
}

function DetailPanel({ entry, onClose }: { entry: AuditLogEntry; onClose: () => void }) {
  return (
    <Card className="w-80 flex-shrink-0">
      <CardHeader className="flex flex-row items-center justify-between pb-3">
        <CardTitle className="text-sm">Event Details</CardTitle>
        <Button variant="ghost" size="sm" onClick={onClose}>
          <X className="h-4 w-4" />
        </Button>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        <div>
          <span className="text-muted-foreground">Action</span>
          <p>
            <Badge variant={actionVariant(entry.action)}>{formatAction(entry.action)}</Badge>
          </p>
        </div>
        <div>
          <span className="text-muted-foreground">Time</span>
          <p>{new Date(entry.createdAt).toLocaleString()}</p>
        </div>
        <div>
          <span className="text-muted-foreground">Actor</span>
          <p className="font-mono text-xs">{entry.actorId ?? 'System'}</p>
          <p className="text-xs text-muted-foreground">{entry.actorType}</p>
        </div>
        {entry.targetType && (
          <div>
            <span className="text-muted-foreground">Target</span>
            <p>{entry.targetType}{entry.targetId ? ` (${entry.targetId})` : ''}</p>
          </div>
        )}
        {entry.ipAddress && (
          <div>
            <span className="text-muted-foreground">IP Address</span>
            <p className="font-mono text-xs">{entry.ipAddress}</p>
          </div>
        )}
        {entry.metadata && Object.keys(entry.metadata).length > 0 && (
          <div>
            <span className="text-muted-foreground">Metadata</span>
            <pre className="mt-1 max-h-40 overflow-auto rounded bg-muted p-2 text-xs">
              {JSON.stringify(entry.metadata, null, 2)}
            </pre>
          </div>
        )}
        <div className="text-[10px] text-muted-foreground">
          ID: {entry.id}
        </div>
      </CardContent>
    </Card>
  );
}

export function AuditPage() {
  const [page, setPage] = useState(1);
  const [action, setAction] = useState('');
  const [targetType, setTargetType] = useState('');
  const [actorSearch, setActorSearch] = useState('');
  const [selected, setSelected] = useState<AuditLogEntry | null>(null);

  const params = useMemo(() => {
    const p = new URLSearchParams();
    p.set('page', String(page));
    p.set('pageSize', '20');
    if (action) p.set('action', action);
    if (targetType) p.set('targetType', targetType);
    if (actorSearch) p.set('actorId', actorSearch);
    return p.toString();
  }, [page, action, targetType, actorSearch]);

  const { data, loading, error, refetch } = useApiQuery<PaginatedResponse<AuditLogEntry>>(
    `/audit?${params}`,
    EMPTY_RESPONSE,
  );

  const logs = data?.data ?? [];
  const meta = data?.meta ?? EMPTY_RESPONSE.meta;

  const columns: Column<AuditLogEntry>[] = [
    {
      key: 'time',
      header: 'Time',
      render: (row) => (
        <span className="text-xs">{new Date(row.createdAt).toLocaleString()}</span>
      ),
      className: 'w-44',
    },
    {
      key: 'action',
      header: 'Action',
      render: (row) => (
        <Badge variant={actionVariant(row.action)}>
          {formatAction(row.action)}
        </Badge>
      ),
      className: 'w-40',
    },
    {
      key: 'actor',
      header: 'Actor',
      render: (row) => (
        <span className="font-mono text-xs">
          {row.actorId ? `${row.actorId.slice(0, 8)}...` : <span className="text-muted-foreground">System</span>}
        </span>
      ),
      className: 'w-28',
      hideOnMobile: true,
    },
    {
      key: 'target',
      header: 'Target',
      render: (row) =>
        row.targetType ? (
          <span>
            {row.targetType}
            {row.targetId && (
              <span className="ml-1 font-mono text-xs text-muted-foreground">
                {row.targetId.slice(0, 8)}
              </span>
            )}
          </span>
        ) : (
          <span className="text-muted-foreground">-</span>
        ),
      hideOnMobile: true,
    },
    {
      key: 'ip',
      header: 'IP Address',
      render: (row) => (
        <span className="font-mono text-xs text-muted-foreground">
          {row.ipAddress ?? '-'}
        </span>
      ),
      className: 'w-32',
      hideOnMobile: true,
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Audit Log"
        description="Chronological record of all system events. Logs are append-only and cannot be modified."
      />

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <Select value={action} onChange={(e) => { setAction(e.target.value); setPage(1); }}>
          {ACTION_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </Select>
        <Select value={targetType} onChange={(e) => { setTargetType(e.target.value); setPage(1); }}>
          {TARGET_TYPE_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </Select>
        <Input
          placeholder="Filter by actor ID..."
          value={actorSearch}
          onChange={(e) => { setActorSearch(e.target.value); setPage(1); }}
          className="w-48"
        />
        <Button
          variant="outline"
          size="sm"
          className="ml-auto gap-1.5"
          onClick={() => {
            const p = new URLSearchParams();
            if (action) p.set('action', action);
            if (targetType) p.set('targetType', targetType);
            if (actorSearch) p.set('actorId', actorSearch);
            void downloadCsv(`/audit/export?${p.toString()}`, 'audit-log.csv');
          }}
        >
          <Download className="h-4 w-4" />
          Export CSV
        </Button>
      </div>

      {/* Table + Detail panel */}
      <div className="flex gap-6">
        <div className="flex-1 min-w-0">
          <DataTable<AuditLogEntry>
            columns={columns}
            data={logs}
            loading={loading}
            error={error}
            onRetry={refetch}
            onRowClick={setSelected}
            emptyTitle="No audit events yet"
            emptyDescription="System events will be logged here as users interact with the platform."
            page={meta.page}
            pageSize={meta.pageSize}
            total={meta.total}
            onPageChange={setPage}
          />
        </div>

        {selected && (
          <DetailPanel entry={selected} onClose={() => setSelected(null)} />
        )}
      </div>
    </div>
  );
}
