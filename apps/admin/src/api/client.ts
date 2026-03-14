const BASE_URL = import.meta.env.VITE_API_BASE_URL
  ? `${import.meta.env.VITE_API_BASE_URL}/api/v1`
  : '/api/v1';
const CSRF_COOKIE_NAME = 'openclaw.csrf';

interface RequestOptions {
  method?: string;
  body?: unknown;
  headers?: Record<string, string>;
}

interface ApiError {
  error?: { code: string; message: string; details?: Record<string, unknown> };
  data?: unknown;
}

class ApiClientError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public data?: unknown,
  ) {
    super(message);
    this.name = 'ApiClientError';
  }
}

function getCsrfToken(): string | undefined {
  const match = document.cookie
    .split('; ')
    .find((c) => c.startsWith(`${CSRF_COOKIE_NAME}=`));
  return match?.split('=')[1];
}

/** Typed API client that handles JSON serialization, CSRF, and error normalization */
async function request<T>(endpoint: string, options: RequestOptions = {}): Promise<T> {
  const { method = 'GET', body, headers = {} } = options;

  const csrfToken = getCsrfToken();
  const allHeaders: Record<string, string> = {
    'Content-Type': 'application/json',
    ...headers,
  };
  if (csrfToken && method !== 'GET') {
    allHeaders['x-csrf-token'] = csrfToken;
  }

  const res = await fetch(`${BASE_URL}${endpoint}`, {
    method,
    credentials: 'include',
    headers: allHeaders,
    ...(body ? { body: JSON.stringify(body) } : {}),
  });

  if (!res.ok) {
    const err = (await res.json().catch(() => ({
      error: { code: 'UNKNOWN', message: 'Request failed' },
    }))) as ApiError;
    throw new ApiClientError(
      res.status,
      err.error?.code ?? 'REQUEST_FAILED',
      err.error?.message ?? 'Request failed',
      err.data,
    );
  }

  return res.json() as Promise<T>;
}

export const apiClient = {
  get: <T>(endpoint: string) => request<T>(endpoint),
  post: <T>(endpoint: string, body: unknown) => request<T>(endpoint, { method: 'POST', body }),
  put: <T>(endpoint: string, body: unknown) => request<T>(endpoint, { method: 'PUT', body }),
  patch: <T>(endpoint: string, body: unknown) => request<T>(endpoint, { method: 'PATCH', body }),
  delete: <T>(endpoint: string) => request<T>(endpoint, { method: 'DELETE' }),
};

export { ApiClientError };
