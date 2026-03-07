import { env, logger } from '@openclaw/config';
import type {
  GhlContact,
  GhlContactSearchResult,
  GhlApiContactResponse,
  GhlApiSearchResponse,
} from '@openclaw/shared';

const TIMEOUT_MS = 30_000;
const MAX_RETRIES = 2;

/**
 * Low-level GoHighLevel CRM API client.
 * Handles HTTP calls, retries on transient errors, and timeout management.
 *
 * GHL v1 REST API:
 * - GET  /contacts/lookup?email=...&phone=...
 * - GET  /contacts/{id}
 * - PUT  /contacts/{id}
 * - POST /contacts/
 * - GET  /contacts/?query=...
 */

async function callApi<T>(
  method: 'GET' | 'POST' | 'PUT',
  path: string,
  body?: Record<string, unknown>,
): Promise<{ data: T; statusCode: number; latencyMs: number }> {
  let lastError: Error | null = null;
  const startTime = Date.now();

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);

      const url = `${env.GHL_API_BASE_URL}${path}`;
      const headers: Record<string, string> = {
        Authorization: `Bearer ${env.GHL_API_TOKEN}`,
        'Content-Type': 'application/json',
      };

      const res = await fetch(url, {
        method,
        headers,
        body: body ? JSON.stringify(body) : undefined,
        signal: controller.signal,
      });

      clearTimeout(timeout);
      const latencyMs = Date.now() - startTime;

      if (res.ok) {
        const data = (await res.json()) as T;
        return { data, statusCode: res.status, latencyMs };
      }

      const errorBody = await res.text();

      // Don't retry client errors (4xx) except 429
      if (res.status >= 400 && res.status < 500 && res.status !== 429) {
        throw new GhlApiError(
          `GHL API ${method} ${path}: ${res.status} ${errorBody}`,
          res.status,
          latencyMs,
        );
      }

      // Retryable: 429 or 5xx
      lastError = new GhlApiError(
        `GHL API ${method} ${path}: ${res.status} ${errorBody}`,
        res.status,
        latencyMs,
      );

      if (res.status === 429) {
        const retryAfter = parseInt(res.headers.get('retry-after') ?? '3', 10);
        await delay(retryAfter * 1000);
      } else {
        await delay(1000 * (attempt + 1));
      }
    } catch (err) {
      if (err instanceof GhlApiError) throw err;

      if (err instanceof Error && err.name === 'AbortError') {
        lastError = new GhlApiError(
          `GHL API ${method} ${path} timed out after ${TIMEOUT_MS}ms`,
          0,
          Date.now() - startTime,
        );
      } else {
        lastError = err instanceof Error ? err : new Error(String(err));
      }

      if (attempt < MAX_RETRIES) {
        await delay(1000 * (attempt + 1));
      }
    }
  }

  throw lastError ?? new Error(`GHL API ${method} ${path} failed after retries`);
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export class GhlApiError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number,
    public readonly latencyMs: number,
  ) {
    super(message);
    this.name = 'GhlApiError';
  }
}

// ── Public API ──────────────────────────────────────────────

/**
 * Search contacts by name, email, or phone.
 * Uses the GHL v1 contacts query parameter.
 */
export async function searchContacts(query: string): Promise<GhlContactSearchResult & { latencyMs: number }> {
  const encodedQuery = encodeURIComponent(query);
  const { data, latencyMs } = await callApi<GhlApiSearchResponse>(
    'GET',
    `/contacts/?query=${encodedQuery}&limit=10`,
  );

  return {
    contacts: data.contacts ?? [],
    total: data.total ?? 0,
    latencyMs,
  };
}

/**
 * Get a single contact by ID.
 */
export async function getContact(contactId: string): Promise<GhlContact & { _latencyMs: number }> {
  const { data, latencyMs } = await callApi<GhlApiContactResponse>(
    'GET',
    `/contacts/${contactId}`,
  );

  return { ...data.contact, _latencyMs: latencyMs };
}

/**
 * Update a contact's fields.
 * Only sends the fields being changed.
 */
export async function updateContact(
  contactId: string,
  updates: Record<string, unknown>,
): Promise<{ contact: GhlContact; latencyMs: number; statusCode: number }> {
  const { data, latencyMs, statusCode } = await callApi<GhlApiContactResponse>(
    'PUT',
    `/contacts/${contactId}`,
    updates,
  );

  return { contact: data.contact, latencyMs, statusCode };
}

/**
 * Lookup a contact by email or phone (exact match).
 * GHL provides a dedicated lookup endpoint.
 */
export async function lookupContact(params: {
  email?: string;
  phone?: string;
}): Promise<GhlContactSearchResult & { latencyMs: number }> {
  const queryParts: string[] = [];
  if (params.email) queryParts.push(`email=${encodeURIComponent(params.email)}`);
  if (params.phone) queryParts.push(`phone=${encodeURIComponent(params.phone)}`);

  if (queryParts.length === 0) {
    return { contacts: [], total: 0, latencyMs: 0 };
  }

  try {
    const { data, latencyMs } = await callApi<GhlApiSearchResponse>(
      'GET',
      `/contacts/lookup?${queryParts.join('&')}`,
    );

    return {
      contacts: data.contacts ?? [],
      total: data.total ?? 0,
      latencyMs,
    };
  } catch (err) {
    // Lookup endpoint may not exist in all GHL versions — fall back to search
    if (err instanceof GhlApiError && err.statusCode === 404) {
      logger.debug('GHL lookup endpoint not available, falling back to search');
      const query = params.email ?? params.phone ?? '';
      return searchContacts(query);
    }
    throw err;
  }
}

/**
 * Verify GHL API connection health.
 */
export async function verifyGhlConnection(): Promise<boolean> {
  try {
    await callApi('GET', '/contacts/?limit=1');
    return true;
  } catch (err) {
    logger.warn({ err }, 'GHL API connection verification failed');
    return false;
  }
}
