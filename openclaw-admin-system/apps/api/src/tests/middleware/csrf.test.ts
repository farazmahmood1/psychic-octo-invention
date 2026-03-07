/**
 * CSRF middleware tests.
 */
import { describe, it, expect, vi } from 'vitest';
import { verifyCsrfToken } from '../../services/auth.service.js';

describe('verifyCsrfToken', () => {
  it('returns true for matching tokens', () => {
    const token = 'abcdef1234567890abcdef1234567890abcdef1234567890';
    expect(verifyCsrfToken(token, token)).toBe(true);
  });

  it('returns false for mismatched tokens', () => {
    const token1 = 'abcdef1234567890abcdef1234567890abcdef1234567890';
    const token2 = 'xxxxxx1234567890abcdef1234567890abcdef1234567890';
    expect(verifyCsrfToken(token1, token2)).toBe(false);
  });

  it('returns false for empty cookie token', () => {
    expect(verifyCsrfToken('', 'some-token')).toBe(false);
  });

  it('returns false for empty header token', () => {
    expect(verifyCsrfToken('some-token', '')).toBe(false);
  });

  it('returns false for different length tokens', () => {
    expect(verifyCsrfToken('short', 'longertokenvalue')).toBe(false);
  });
});
