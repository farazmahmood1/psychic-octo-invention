import { useState, useMemo } from 'react';
import type { BookkeepingExtractionSummary, PaginatedResponse } from '@nexclaw/shared';
import { PageHeader } from '@/components/page-header';
import { DataTable, type Column } from '@/components/data-table';
import { StatusBadge } from '@/components/status-badge';
import { Button } from '@/components/ui/button';
import { Select } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { useApiQuery } from '@/hooks/use-api-query';
import { Download } from 'lucide-react';
import { downloadCsv } from '@/lib/export';

const EMPTY_RESPONSE: PaginatedResponse<BookkeepingExtractionSummary> = {
  data: [],
  meta: { page: 1, pageSize: 20, total: 0, totalPages: 0 },
};

const STATUS_OPTIONS = [
  { value: '', label: 'All statuses' },
  { value: 'pending', label: 'Pending' },
  { value: 'extracted', label: 'Extracted' },
  { value: 'exported', label: 'Exported' },
  { value: 'failed', label: 'Failed' },
];

function formatCurrency(data: Record<string, unknown> | null): string {
  if (!data) return '-';
  const amount = data['amount'] as number | undefined;
  const currency = (data['currency'] as string) ?? 'USD';
  if (amount == null) return '-';
  return `${currency} ${amount.toFixed(2)}`;
}

function formatMoney(value: number | null | undefined, currency: string | undefined): string {
  if (value == null) return '-';
  return `${currency ?? 'USD'} ${value.toFixed(2)}`;
}

function ExtractionDetail({ extraction }: { extraction: BookkeepingExtractionSummary }) {
  const d = extraction.extractedData;
  if (!d) return <p className="text-sm text-muted-foreground">No extracted data available.</p>;

  return (
    <div className="grid gap-3 text-sm sm:grid-cols-2">
      {d['vendor'] != null && (
        <div>
          <span className="text-muted-foreground">Vendor</span>
          <p className="font-medium">{String(d['vendor'])}</p>
        </div>
      )}
      {d['transactionDate'] != null && (
        <div>
          <span className="text-muted-foreground">Date</span>
          <p className="font-medium">{String(d['transactionDate'])}</p>
        </div>
      )}
      {d['amount'] != null && (
        <div>
          <span className="text-muted-foreground">Amount</span>
          <p className="font-medium">{formatCurrency(d)}</p>
        </div>
      )}
      {d['tax'] != null && (
        <div>
          <span className="text-muted-foreground">Tax</span>
          <p className="font-medium">{formatMoney(d['tax'] as number, d['currency'] as string | undefined)}</p>
        </div>
      )}
    </div>
  );
}

export function BookkeepingPage() {
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState('');
  const [selected, setSelected] = useState<BookkeepingExtractionSummary | null>(null);

  const params = useMemo(() => {
    const p = new URLSearchParams();
    p.set('page', String(page));
    p.set('pageSize', '20');
    if (status) p.set('status', status);
    return p.toString();
  }, [page, status]);

  const { data, loading, error, refetch } = useApiQuery<PaginatedResponse<BookkeepingExtractionSummary>>(
    `/bookkeeping?${params}`,
    EMPTY_RESPONSE,
  );

  const extractions = data?.data ?? [];
  const meta = data?.meta ?? EMPTY_RESPONSE.meta;

  const columns: Column<BookkeepingExtractionSummary>[] = [
    {
      key: 'file',
      header: 'File',
      render: (row) => row.fileName ?? <span className="text-muted-foreground">Unnamed</span>,
    },
    {
      key: 'category',
      header: 'Category',
      render: (row) => row.category ?? '-',
      className: 'w-36',
    },
    {
      key: 'amount',
      header: 'Amount',
      render: (row) => formatCurrency(row.extractedData),
      className: 'w-28 text-right',
    },
    {
      key: 'confidence',
      header: 'Confidence',
      render: (row) => (
        row.confidence != null ? (
          <Badge variant={row.confidence >= 0.8 ? 'success' : row.confidence >= 0.5 ? 'warning' : 'destructive'}>
            {(row.confidence * 100).toFixed(0)}%
          </Badge>
        ) : '-'
      ),
      className: 'w-28 text-center',
      hideOnMobile: true,
    },
    {
      key: 'status',
      header: 'Status',
      render: (row) => <StatusBadge status={row.status} />,
      className: 'w-28',
    },
    {
      key: 'export',
      header: 'Export',
      render: (row) => row.exportStatus ? <StatusBadge status={row.exportStatus} /> : <span className="text-muted-foreground">-</span>,
      className: 'w-28',
      hideOnMobile: true,
    },
    {
      key: 'channel',
      header: 'Channel',
      render: (row) => row.sourceChannel,
      className: 'w-28',
      hideOnMobile: true,
    },
    {
      key: 'date',
      header: 'Date',
      render: (row) => new Date(row.createdAt).toLocaleDateString(),
      className: 'w-28',
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Bookkeeping"
        description="Track receipt extractions, clarifications, and ledger exports."
      />

      <div className="flex items-center gap-3">
        <Select value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }}>
          {STATUS_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </Select>
        <Button
          variant="outline"
          size="sm"
          className="ml-auto gap-1.5"
          onClick={() => {
            const p = new URLSearchParams();
            if (status) p.set('status', status);
            void downloadCsv(`/bookkeeping/export?${p.toString()}`, 'bookkeeping.csv');
          }}
        >
          <Download className="h-4 w-4" />
          Export CSV
        </Button>
      </div>

      <div className="flex gap-6">
        <div className="flex-1">
          <DataTable<BookkeepingExtractionSummary>
            columns={columns}
            data={extractions}
            loading={loading}
            error={error}
            onRetry={refetch}
            onRowClick={setSelected}
            emptyTitle="No receipt extractions"
            emptyDescription="Bookkeeping extractions will appear here as receipts are processed."
            page={meta.page}
            pageSize={meta.pageSize}
            total={meta.total}
            onPageChange={setPage}
          />
        </div>

        {selected && (
          <Card className="w-80 flex-shrink-0">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">Extraction Details</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <ExtractionDetail extraction={selected} />

              {selected.errorDetails && (
                <div>
                  <span className="text-sm text-muted-foreground">Error</span>
                  <p className="text-sm text-destructive">{selected.errorDetails}</p>
                </div>
              )}

              <div className="text-xs text-muted-foreground">
                ID: {selected.id}
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
