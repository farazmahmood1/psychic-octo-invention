import { useState, type FormEvent } from 'react';
import type { MemorySearchResult, PaginatedResponse } from '@nexclaw/shared';
import { Search } from 'lucide-react';
import { PageHeader } from '@/components/page-header';
import { DataTable, type Column } from '@/components/data-table';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { useApiQuery } from '@/hooks/use-api-query';

const EMPTY_MEMORY_RESULTS: PaginatedResponse<MemorySearchResult> = {
  data: [],
  meta: {
    page: 1,
    pageSize: 20,
    total: 0,
    totalPages: 0,
  },
};

const columns: Column<MemorySearchResult>[] = [
  {
    key: 'namespace',
    header: 'Namespace',
    render: (row) => <span className="font-medium">{row.namespace}</span>,
  },
  {
    key: 'subjectKey',
    header: 'Subject Key',
    render: (row) => <span className="font-mono text-xs">{row.subjectKey}</span>,
  },
  {
    key: 'summary',
    header: 'Summary',
    render: (row) => (
      <div className="max-w-xl">
        <div>{row.summary ?? 'No summary'}</div>
        {row.sourceConversationId && (
          <div className="mt-1 text-xs text-muted-foreground">
            Source conversation: {row.sourceConversationId}
          </div>
        )}
      </div>
    ),
  },
  {
    key: 'score',
    header: 'Score',
    render: (row) => row.score?.toFixed(2) ?? '-',
    className: 'w-24',
  },
  {
    key: 'updatedAt',
    header: 'Updated',
    render: (row) => new Date(row.updatedAt).toLocaleString(),
    className: 'w-48',
  },
];

function buildEndpoint(filters: { q: string; namespace: string; subjectKey: string }, page: number): string {
  const params = new URLSearchParams({
    page: page.toString(),
    pageSize: '20',
  });

  if (filters.q.trim()) params.set('q', filters.q.trim());
  if (filters.namespace.trim()) params.set('namespace', filters.namespace.trim());
  if (filters.subjectKey.trim()) params.set('subjectKey', filters.subjectKey.trim());

  return `/memory/search?${params.toString()}`;
}

export function MemoryPage() {
  const [queryInput, setQueryInput] = useState('');
  const [namespaceInput, setNamespaceInput] = useState('');
  const [subjectKeyInput, setSubjectKeyInput] = useState('');
  const [filters, setFilters] = useState({ q: '', namespace: '', subjectKey: '' });
  const [page, setPage] = useState(1);

  const endpoint = buildEndpoint(filters, page);
  const { data, loading, error, refetch } = useApiQuery<PaginatedResponse<MemorySearchResult>>(
    endpoint,
    EMPTY_MEMORY_RESULTS,
  );

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    setPage(1);
    setFilters({
      q: queryInput,
      namespace: namespaceInput,
      subjectKey: subjectKeyInput,
    });
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Memory"
        description="Browse durable long-term memory records stored from conversations."
      />

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Search Memory</CardTitle>
          <CardDescription>
            Filter by namespace, subject key, or free-text summary content.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="grid gap-3 md:grid-cols-4">
            <Input
              value={queryInput}
              onChange={(e) => setQueryInput(e.target.value)}
              placeholder="Free-text search"
            />
            <Input
              value={namespaceInput}
              onChange={(e) => setNamespaceInput(e.target.value)}
              placeholder="Namespace"
            />
            <Input
              value={subjectKeyInput}
              onChange={(e) => setSubjectKeyInput(e.target.value)}
              placeholder="Subject key"
            />
            <div className="flex gap-2">
              <Button type="submit" className="gap-2">
                <Search className="h-4 w-4" />
                Search
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setQueryInput('');
                  setNamespaceInput('');
                  setSubjectKeyInput('');
                  setPage(1);
                  setFilters({ q: '', namespace: '', subjectKey: '' });
                }}
              >
                Reset
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <DataTable<MemorySearchResult>
        columns={columns}
        data={data?.data ?? []}
        loading={loading}
        error={error}
        onRetry={refetch}
        emptyTitle="No memory records found"
        emptyDescription="Memory records will appear here once conversations write durable facts."
        page={data?.meta.page ?? page}
        pageSize={data?.meta.pageSize ?? 20}
        total={data?.meta.total ?? 0}
        onPageChange={setPage}
      />
    </div>
  );
}
