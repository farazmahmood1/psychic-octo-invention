import type { ZodTypeAny, output } from 'zod';
import { AppError } from './app-error.js';
import { HTTP_STATUS } from '@openclaw/shared';

/**
 * Parse and validate data against a Zod schema.
 * Returns the output type (with defaults applied).
 * Throws AppError with flattened field errors on failure.
 */
export function validate<T extends ZodTypeAny>(schema: T, data: unknown): output<T> {
  const result = schema.safeParse(data);
  if (!result.success) {
    throw new AppError(HTTP_STATUS.BAD_REQUEST, 'VALIDATION_ERROR', 'Invalid request parameters', {
      issues: result.error.flatten().fieldErrors,
    });
  }
  return result.data as output<T>;
}
