/**
 * Generate a CSV string from an array of objects.
 * Handles quoting/escaping and nested values.
 */
export function toCsv(rows: Record<string, unknown>[], columns?: string[]): string {
  if (rows.length === 0) return '';

  const headers = columns ?? Object.keys(rows[0]!);
  const lines: string[] = [headers.map(escapeField).join(',')];

  for (const row of rows) {
    const values = headers.map((h) => {
      const val = row[h];
      if (val === null || val === undefined) return '';
      if (typeof val === 'object') return escapeField(JSON.stringify(val));
      return escapeField(String(val));
    });
    lines.push(values.join(','));
  }

  return lines.join('\n');
}

function escapeField(value: string): string {
  if (value.includes(',') || value.includes('"') || value.includes('\n')) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}
