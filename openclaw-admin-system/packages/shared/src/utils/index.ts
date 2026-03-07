/** Generate a normalized error object */
export function createApiError(
  code: string,
  message: string,
  details?: Record<string, unknown>,
) {
  return {
    error: { code, message, ...(details ? { details } : {}) },
  };
}
