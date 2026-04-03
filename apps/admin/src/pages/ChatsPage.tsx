import { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import type { ConversationSummary, PaginatedResponse } from '@nexclaw/shared';
import { PageHeader } from '@/components/page-header';
import { DataTable, type Column } from '@/components/data-table';
import { StatusBadge } from '@/components/status-badge';
import { Select } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { useApiQuery } from '@/hooks/use-api-query';
import { Search } from 'lucide-react';

const EMPTY_RESPONSE: PaginatedResponse<ConversationSummary> = {
  data: [],
  meta: { page: 1, pageSize: 20, total: 0, totalPages: 0 },
};

const CHANNEL_OPTIONS = [
  { value: '', label: 'All channels' },
  { value: 'telegram', label: 'Telegram' },
  { value: 'email', label: 'Email' },
  { value: 'admin_portal', label: 'Admin Portal' },
];

const STATUS_OPTIONS = [
  { value: '', label: 'All statuses' },
  { value: 'active', label: 'Active' },
  { value: 'closed', label: 'Closed' },
];

function formatChannel(channel: string): string {
  const map: Record<string, string> = {
    telegram: 'Telegram',
    email: 'Email',
    admin_portal: 'Admin Portal',
  };
  return map[channel] ?? channel;
}

export function ChatsPage() {
  const navigate = useNavigate();
  const [page, setPage] = useState(1);
  const [channel, setChannel] = useState('');
  const [status, setStatus] = useState('');
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();

  // Debounce search input (400ms)
  useEffect(() => {
    debounceRef.current = setTimeout(() => {
      setDebouncedSearch(search);
      setPage(1);
    }, 400);
    return () => clearTimeout(debounceRef.current);
  }, [search]);

  const params = useMemo(() => {
    const p = new URLSearchParams();
    p.set('page', String(page));
    p.set('pageSize', '20');
    if (channel) p.set('channel', channel);
    if (status) p.set('status', status);
    if (debouncedSearch) p.set('search', debouncedSearch);
    return p.toString();
  }, [page, channel, status, debouncedSearch]);

  const { data, loading, error, refetch } = useApiQuery<PaginatedResponse<ConversationSummary>>(
    `/conversations?${params}`,
    EMPTY_RESPONSE,
  );

  const filtered = data?.data ?? [];
  const meta = data?.meta ?? EMPTY_RESPONSE.meta;

  const handleRowClick = useCallback(
    (row: ConversationSummary) => {
      navigate(`/dashboard/chats/${row.id}`);
    },
    [navigate],
  );

  const columns: Column<ConversationSummary>[] = [
    {
      key: 'id',
      header: 'ID',
      render: (row) => <span className="font-mono text-xs">{row.id.slice(0, 8)}...</span>,
      className: 'w-28',
    },
    {
      key: 'channel',
      header: 'Channel',
      render: (row) => formatChannel(row.channel),
      className: 'w-32',
    },
    {
      key: 'title',
      header: 'Title',
      render: (row) => row.title ?? <span className="text-muted-foreground">Untitled</span>,
    },
    {
      key: 'preview',
      header: 'Last Message',
      render: (row) =>
        row.lastMessagePreview ? (
          <span className="text-muted-foreground line-clamp-1">{row.lastMessagePreview}</span>
        ) : (
          <span className="text-muted-foreground">-</span>
        ),
    },
    {
      key: 'messages',
      header: 'Messages',
      render: (row) => row.messageCount,
      className: 'w-24 text-right',
    },
    {
      key: 'status',
      header: 'Status',
      render: (row) => <StatusBadge status={row.status} />,
      className: 'w-28',
    },
    {
      key: 'updatedAt',
      header: 'Last Activity',
      render: (row) => new Date(row.updatedAt).toLocaleDateString(),
      className: 'w-36',
    },
  ];

  const handleChannelChange = (val: string) => {
    setChannel(val);
    setPage(1);
  };

  const handleStatusChange = (val: string) => {
    setStatus(val);
    setPage(1);
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Chat History"
        description="View and search all conversations across channels. Click a row to see the full message timeline."
      />

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search messages, titles..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-72 pl-9"
          />
        </div>
        <Select value={channel} onChange={(e) => handleChannelChange(e.target.value)}>
          {CHANNEL_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </Select>
        <Select value={status} onChange={(e) => handleStatusChange(e.target.value)}>
          {STATUS_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </Select>
      </div>

      {/* Table */}
      <DataTable<ConversationSummary>
        columns={columns}
        data={filtered}
        loading={loading}
        error={error}
        onRetry={refetch}
        onRowClick={handleRowClick}
        emptyTitle="No conversations yet"
        emptyDescription="Conversations will appear here once users start chatting."
        page={meta.page}
        pageSize={meta.pageSize}
        total={meta.total}
        onPageChange={setPage}
      />
    </div>
  );
}
