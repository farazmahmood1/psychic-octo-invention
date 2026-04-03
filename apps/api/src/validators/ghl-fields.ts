import { z } from 'zod';
import { GHL_EDITABLE_FIELDS } from '@nexclaw/shared';
import type { GhlEditableField } from '@nexclaw/shared';

/**
 * Phone number normalization.
 * Strips non-digit characters except leading +, validates reasonable length.
 * Does not enforce specific country format — GHL handles international numbers.
 */
export function normalizePhone(raw: string): string | null {
  // Strip everything except digits and leading +
  const cleaned = raw.replace(/[^\d+]/g, '');

  // Must start with + or digit
  if (!cleaned || !/^[+\d]/.test(cleaned)) return null;

  // Strip leading + for length check
  const digits = cleaned.replace(/^\+/, '');

  // Reasonable phone number: 7-15 digits
  if (digits.length < 7 || digits.length > 15) return null;

  // If input had no + but is long enough for international, keep as-is
  // Otherwise preserve the cleaned format
  return cleaned;
}

/**
 * Validate and normalize an email address.
 */
export function normalizeEmail(raw: string): string | null {
  const trimmed = raw.trim().toLowerCase();
  // Basic email validation — delegate detailed RFC compliance to the schema
  const emailResult = z.string().email().safeParse(trimmed);
  return emailResult.success ? emailResult.data : null;
}

/**
 * Validate that a field name is in the editable allowlist.
 */
export function isEditableField(field: string): field is GhlEditableField {
  return (GHL_EDITABLE_FIELDS as readonly string[]).includes(field);
}

/**
 * Validate and normalize a field value based on its field name.
 * Returns { valid: true, value } or { valid: false, reason }.
 */
export function validateFieldValue(
  field: GhlEditableField,
  value: unknown,
): { valid: true; value: unknown } | { valid: false; reason: string } {
  if (value === null || value === undefined || value === '') {
    return { valid: false, reason: `Empty value for field "${field}"` };
  }

  switch (field) {
    case 'phone': {
      if (typeof value !== 'string') return { valid: false, reason: 'Phone must be a string' };
      const normalized = normalizePhone(value);
      if (!normalized) return { valid: false, reason: `Invalid phone number: "${value}"` };
      return { valid: true, value: normalized };
    }

    case 'email': {
      if (typeof value !== 'string') return { valid: false, reason: 'Email must be a string' };
      const normalized = normalizeEmail(value);
      if (!normalized) return { valid: false, reason: `Invalid email address: "${value}"` };
      return { valid: true, value: normalized };
    }

    case 'firstName':
    case 'lastName':
    case 'address1':
    case 'city':
    case 'state':
    case 'website': {
      if (typeof value !== 'string') return { valid: false, reason: `${field} must be a string` };
      const trimmed = value.trim();
      if (!trimmed) return { valid: false, reason: `Empty value for field "${field}"` };
      if (trimmed.length > 500) return { valid: false, reason: `${field} too long (max 500 chars)` };
      return { valid: true, value: trimmed };
    }

    case 'postalCode': {
      if (typeof value !== 'string') return { valid: false, reason: 'Postal code must be a string' };
      const trimmed = value.trim();
      if (!trimmed) return { valid: false, reason: 'Empty postal code' };
      if (trimmed.length > 20) return { valid: false, reason: 'Postal code too long' };
      return { valid: true, value: trimmed };
    }

    case 'tags': {
      if (!Array.isArray(value)) return { valid: false, reason: 'Tags must be an array of strings' };
      const validTags = value.filter((t) => typeof t === 'string' && t.trim());
      if (validTags.length === 0) return { valid: false, reason: 'No valid tags provided' };
      return { valid: true, value: validTags.map((t: string) => t.trim()) };
    }

    default:
      return { valid: false, reason: `Field "${field}" is not supported for updates` };
  }
}

/**
 * Validate a complete update payload.
 * Returns validated updates or an array of errors.
 */
export function validateUpdates(
  updates: Record<string, unknown>,
): { valid: true; validated: Record<string, unknown> } | { valid: false; errors: string[] } {
  const errors: string[] = [];
  const validated: Record<string, unknown> = {};

  const entries = Object.entries(updates);
  if (entries.length === 0) {
    return { valid: false, errors: ['No fields to update'] };
  }

  for (const [field, value] of entries) {
    if (!isEditableField(field)) {
      errors.push(`Field "${field}" is not supported for updates. Supported fields: ${GHL_EDITABLE_FIELDS.join(', ')}`);
      continue;
    }

    const result = validateFieldValue(field, value);
    if (result.valid) {
      validated[field] = result.value;
    } else {
      errors.push(result.reason);
    }
  }

  if (errors.length > 0) {
    return { valid: false, errors };
  }

  if (Object.keys(validated).length === 0) {
    return { valid: false, errors: ['No valid field updates after validation'] };
  }

  return { valid: true, validated };
}
