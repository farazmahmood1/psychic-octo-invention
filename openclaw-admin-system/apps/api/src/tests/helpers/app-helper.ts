/**
 * Test helper: creates Express app for supertest integration tests.
 * Mocks session middleware to inject test users.
 */
import express from 'express';
import cookieParser from 'cookie-parser';
import type { SessionUser } from '@openclaw/shared';
import { API_PREFIX } from '@openclaw/shared';
import { globalErrorHandler } from '../../middleware/error-handler.js';
import { notFoundHandler } from '../../middleware/not-found.js';
import { createMockSessionUser } from './auth-helper.js';

interface TestAppOptions {
  /** Session user to inject (null = unauthenticated) */
  sessionUser?: SessionUser | null;
  /** CSRF token to set in cookies */
  csrfToken?: string;
}

/**
 * Build a minimal Express app with the given router and test auth context.
 * Does NOT include helmet/cors/pinoHttp to keep tests fast and quiet.
 */
export function createTestApp(
  mountPath: string,
  router: express.Router,
  options: TestAppOptions = {},
) {
  const app = express();
  app.use(express.json({ limit: '1mb' }));
  app.use(cookieParser());

  // Inject session user (mock session middleware)
  const user = options.sessionUser === null
    ? undefined
    : options.sessionUser ?? createMockSessionUser();

  app.use((req, _res, next) => {
    req.sessionUser = user;

    // Inject CSRF cookie for state-changing requests
    if (options.csrfToken) {
      req.cookies['openclaw.csrf'] = options.csrfToken;
    }

    next();
  });

  // Skip CSRF middleware in tests — we test it separately
  app.use(mountPath, router);

  app.use(notFoundHandler);
  app.use(globalErrorHandler);

  return app;
}

/**
 * Shortcut: mount a router under the API prefix with full auth.
 */
export function createAuthenticatedApp(
  routeSegment: string,
  router: express.Router,
  role: SessionUser['role'] = 'super_admin',
) {
  return createTestApp(
    `${API_PREFIX}/${routeSegment}`,
    router,
    { sessionUser: createMockSessionUser({ role }) },
  );
}

/**
 * Shortcut: mount a router without authentication.
 */
export function createUnauthenticatedApp(
  mountPath: string,
  router: express.Router,
) {
  return createTestApp(mountPath, router, { sessionUser: null });
}
