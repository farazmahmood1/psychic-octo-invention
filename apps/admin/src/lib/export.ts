const BASE_URL = '/api/v1';

/**
 * Download a CSV file from a backend export endpoint.
 * Opens the URL in a new way that preserves cookies for auth.
 */
export async function downloadCsv(endpoint: string, filename: string): Promise<void> {
  const res = await fetch(`${BASE_URL}${endpoint}`, {
    credentials: 'include',
  });

  if (!res.ok) {
    throw new Error(`Export failed: ${res.statusText}`);
  }

  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * Export data as CSV from client-side data (for pages without backend export).
 */
export function exportClientCsv(
  rows: Record<string, unknown>[],
  columns: string[],
  filename: string,
): void {
  if (rows.length === 0) return;

  const lines: string[] = [columns.join(',')];
  for (const row of rows) {
    const values = columns.map((col) => {
      const val = row[col];
      if (val === null || val === undefined) return '';
      const str = String(val);
      if (str.includes(',') || str.includes('"') || str.includes('\n')) {
        return `"${str.replace(/"/g, '""')}"`;
      }
      return str;
    });
    lines.push(values.join(','));
  }

  const csv = lines.join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
