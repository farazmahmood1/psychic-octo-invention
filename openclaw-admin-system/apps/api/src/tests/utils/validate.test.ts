/**
 * Validate utility unit tests.
 */
import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import { validate } from '../../utils/validate.js';
import { AppError } from '../../utils/app-error.js';

describe('validate', () => {
  const schema = z.object({
    name: z.string().min(1),
    age: z.number().int().positive(),
  });

  it('returns parsed data for valid input', () => {
    const result = validate(schema, { name: 'John', age: 30 });
    expect(result).toEqual({ name: 'John', age: 30 });
  });

  it('throws AppError for invalid input', () => {
    try {
      validate(schema, { name: '', age: -1 });
      expect.unreachable('should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(AppError);
      expect((err as AppError).statusCode).toBe(400);
      expect((err as AppError).code).toBe('VALIDATION_ERROR');
      expect((err as AppError).details).toHaveProperty('issues');
    }
  });

  it('applies schema defaults', () => {
    const withDefault = z.object({
      page: z.number().default(1),
      pageSize: z.number().default(20),
    });
    const result = validate(withDefault, {});
    expect(result).toEqual({ page: 1, pageSize: 20 });
  });
});
