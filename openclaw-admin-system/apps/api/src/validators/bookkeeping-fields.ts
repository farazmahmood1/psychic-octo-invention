import type { ReceiptExtractionData } from '@openclaw/shared';

/**
 * Validate and normalize an extracted receipt amount.
 * Must be numeric and non-negative.
 */
export function validateAmount(raw: unknown): { valid: true; value: number } | { valid: false; error: string } {
  if (raw === null || raw === undefined) {
    return { valid: false, error: 'Amount is required' };
  }

  const num = typeof raw === 'number' ? raw : Number(raw);

  if (isNaN(num)) {
    return { valid: false, error: `Invalid amount: "${raw}" is not a number` };
  }

  if (num < 0) {
    return { valid: false, error: `Amount must be non-negative, got ${num}` };
  }

  // Round to 2 decimal places
  return { valid: true, value: Math.round(num * 100) / 100 };
}

/**
 * Validate currency code. Should be ISO-like (2-4 uppercase letters).
 * Returns null if not inferable.
 */
export function validateCurrency(raw: unknown): string | null {
  if (raw === null || raw === undefined || raw === '') return null;
  const str = String(raw).trim().toUpperCase();
  if (/^[A-Z]{2,4}$/.test(str)) return str;
  // Common symbols → codes
  if (str === '$' || str === 'USD' || str === 'US$') return 'USD';
  if (str === '€' || str === 'EUR') return 'EUR';
  if (str === '£' || str === 'GBP') return 'GBP';
  if (str === '¥' || str === 'JPY') return 'JPY';
  if (str === 'RS' || str === 'RS.' || str === 'PKR') return 'PKR';
  return str.length <= 4 ? str : null;
}

/**
 * Validate a category string. Must be non-empty.
 */
export function validateCategory(raw: unknown): { valid: true; value: string } | { valid: false; error: string } {
  if (raw === null || raw === undefined || raw === '') {
    return { valid: false, error: 'Category is required' };
  }
  const str = String(raw).trim();
  if (str.length === 0) {
    return { valid: false, error: 'Category cannot be empty' };
  }
  if (str.length > 100) {
    return { valid: false, error: 'Category too long (max 100 characters)' };
  }
  return { valid: true, value: str };
}

/**
 * Validate the date string from extraction.
 * Attempts to parse into YYYY-MM-DD format.
 */
export function normalizeDate(raw: unknown): string | null {
  if (raw === null || raw === undefined || raw === '') return null;
  const str = String(raw).trim();

  // Try direct ISO parse
  const d = new Date(str);
  if (!isNaN(d.getTime())) {
    return d.toISOString().split('T')[0]!;
  }

  // Try common formats: DD/MM/YYYY, MM/DD/YYYY
  const slashMatch = str.match(/^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{2,4})$/);
  if (slashMatch) {
    const [, a, b, yearStr] = slashMatch;
    const year = yearStr!.length === 2 ? 2000 + Number(yearStr) : Number(yearStr);
    // Try MM/DD/YYYY first (US format)
    const usDate = new Date(year, Number(a) - 1, Number(b));
    if (!isNaN(usDate.getTime()) && usDate.getMonth() === Number(a) - 1) {
      return usDate.toISOString().split('T')[0]!;
    }
    // Try DD/MM/YYYY
    const euDate = new Date(year, Number(b) - 1, Number(a));
    if (!isNaN(euDate.getTime())) {
      return euDate.toISOString().split('T')[0]!;
    }
  }

  return null;
}

/**
 * Check whether extraction data is complete enough to append to the sheet.
 * Returns missing fields if not ready.
 */
export function checkExtractionCompleteness(
  data: ReceiptExtractionData,
  category: string | null,
): { complete: true } | { complete: false; missing: string[] } {
  const missing: string[] = [];

  if (!data.vendor) missing.push('vendor');
  if (data.amount === null || data.amount === undefined) missing.push('amount');
  if (!category && !data.suggestedCategory) missing.push('category');

  if (missing.length > 0) {
    return { complete: false, missing };
  }
  return { complete: true };
}
