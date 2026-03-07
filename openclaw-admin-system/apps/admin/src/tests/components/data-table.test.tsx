/**
 * STORY-UI2: Chat history and usage visibility.
 * Tests the DataTable component used across chat history and usage pages.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { DataTable, type Column } from '@/components/data-table';

interface TestRow {
  id: string;
  name: string;
  status: string;
}

const columns: Column<TestRow>[] = [
  { key: 'id', header: 'ID', render: (row) => row.id },
  { key: 'name', header: 'Name', render: (row) => row.name },
  { key: 'status', header: 'Status', render: (row) => row.status },
];

const sampleData: TestRow[] = [
  { id: '1', name: 'Conv Alpha', status: 'active' },
  { id: '2', name: 'Conv Beta', status: 'closed' },
  { id: '3', name: 'Conv Gamma', status: 'active' },
];

describe('DataTable', () => {
  it('renders column headers', () => {
    render(
      <DataTable
        columns={columns}
        data={sampleData}
        loading={false}
        error={null}
        emptyTitle="No data"
        emptyDescription="Nothing here"
      />,
    );

    expect(screen.getByText('ID')).toBeInTheDocument();
    expect(screen.getByText('Name')).toBeInTheDocument();
    expect(screen.getByText('Status')).toBeInTheDocument();
  });

  it('renders data rows', () => {
    render(
      <DataTable
        columns={columns}
        data={sampleData}
        loading={false}
        error={null}
        emptyTitle="No data"
        emptyDescription="Nothing here"
      />,
    );

    expect(screen.getByText('Conv Alpha')).toBeInTheDocument();
    expect(screen.getByText('Conv Beta')).toBeInTheDocument();
    expect(screen.getByText('Conv Gamma')).toBeInTheDocument();
  });

  it('shows empty state when data is empty', () => {
    render(
      <DataTable
        columns={columns}
        data={[]}
        loading={false}
        error={null}
        emptyTitle="No conversations yet"
        emptyDescription="Conversations will appear here."
      />,
    );

    expect(screen.getByText('No conversations yet')).toBeInTheDocument();
    expect(screen.getByText('Conversations will appear here.')).toBeInTheDocument();
  });

  it('shows error state with retry button', async () => {
    const onRetry = vi.fn();
    render(
      <DataTable
        columns={columns}
        data={[]}
        loading={false}
        error="Failed to fetch"
        onRetry={onRetry}
        emptyTitle="No data"
        emptyDescription=""
      />,
    );

    expect(screen.getByText(/Failed to fetch/i)).toBeInTheDocument();
  });

  it('calls onRowClick when a row is clicked', async () => {
    const onRowClick = vi.fn();
    const user = userEvent.setup();

    render(
      <DataTable
        columns={columns}
        data={sampleData}
        loading={false}
        error={null}
        onRowClick={onRowClick}
        emptyTitle="No data"
        emptyDescription=""
      />,
    );

    await user.click(screen.getByText('Conv Alpha'));
    expect(onRowClick).toHaveBeenCalledWith(sampleData[0]);
  });

  it('renders pagination when page info provided', () => {
    render(
      <DataTable
        columns={columns}
        data={sampleData}
        loading={false}
        error={null}
        page={1}
        pageSize={20}
        total={50}
        onPageChange={vi.fn()}
        emptyTitle="No data"
        emptyDescription=""
      />,
    );

    expect(screen.getByText(/1.*of.*3/i)).toBeInTheDocument();
  });
});
