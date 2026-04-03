/**
 * Test helper: creates an Express Request mock with an authenticated session.
 */
import type { Request, Response } from 'express';
import type { SessionUser } from '@nexclaw/shared';

export function createMockSessionUser(overrides: Partial<SessionUser> = {}): SessionUser {
  return {
    id: 'admin-test-001',
    email: 'admin@nexclaw.dev',
    role: 'super_admin',
    displayName: 'Test Admin',
    ...overrides,
  };
}

export function createMockRequest(overrides: Partial<Request> = {}): Partial<Request> {
  return {
    body: {},
    query: {},
    params: {},
    cookies: {},
    headers: {},
    ip: '127.0.0.1',
    method: 'GET',
    sessionUser: undefined,
    ...overrides,
  };
}

export function createMockResponse(): {
  res: Partial<Response>;
  getStatus: () => number;
  getJson: () => unknown;
  getCookies: () => Record<string, unknown>;
} {
  let statusCode = 200;
  let jsonBody: unknown = null;
  const cookies: Record<string, unknown> = {};

  const res: Partial<Response> = {
    status: ((code: number) => {
      statusCode = code;
      return res;
    }) as any,
    json: ((body: unknown) => {
      jsonBody = body;
      return res;
    }) as any,
    cookie: ((name: string, value: unknown, _options?: unknown) => {
      cookies[name] = value;
      return res;
    }) as any,
    clearCookie: ((name: string) => {
      delete cookies[name];
      return res;
    }) as any,
  };

  return {
    res,
    getStatus: () => statusCode,
    getJson: () => jsonBody,
    getCookies: () => cookies,
  };
}

/**
 * Creates a supertest-compatible auth cookie header for authenticated requests.
 * Since we mock the session middleware, we attach sessionUser directly.
 */
export function withAuth(sessionUser?: SessionUser) {
  return (req: any) => {
    // For supertest: we rely on the session middleware being mocked
    // to load this user. For direct handler testing, attach to req.
    req.sessionUser = sessionUser ?? createMockSessionUser();
    return req;
  };
}
