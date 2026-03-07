/**
 * Middleware unit tests: auth, RBAC, CSRF, error handling.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { NextFunction } from 'express';
import { requireAuth } from '../../middleware/auth/require-auth.js';
import { requireRole } from '../../middleware/auth/require-role.js';
import { globalErrorHandler } from '../../middleware/error-handler.js';
import { AppError } from '../../utils/app-error.js';
import { createMockRequest, createMockResponse, createMockSessionUser } from '../helpers/auth-helper.js';

// ── requireAuth ─────────────────────────────────────────

describe('requireAuth', () => {
  it('calls next when session user exists', () => {
    const req = createMockRequest({ sessionUser: createMockSessionUser() });
    const { res } = createMockResponse();
    const next = vi.fn();

    requireAuth(req as any, res as any, next);

    expect(next).toHaveBeenCalled();
  });

  it('returns 401 when no session user', () => {
    const req = createMockRequest({ sessionUser: undefined });
    const { res, getStatus, getJson } = createMockResponse();
    const next = vi.fn();

    requireAuth(req as any, res as any, next);

    expect(next).not.toHaveBeenCalled();
    expect(getStatus()).toBe(401);
    expect(getJson()).toEqual({
      error: { code: 'UNAUTHORIZED', message: 'Authentication required' },
    });
  });
});

// ── requireRole ─────────────────────────────────────────

describe('requireRole', () => {
  it('allows super_admin to access admin-level routes', () => {
    const middleware = requireRole('admin');
    const req = createMockRequest({ sessionUser: createMockSessionUser({ role: 'super_admin' }) });
    const { res } = createMockResponse();
    const next = vi.fn();

    middleware(req as any, res as any, next);

    expect(next).toHaveBeenCalled();
  });

  it('allows admin to access admin-level routes', () => {
    const middleware = requireRole('admin');
    const req = createMockRequest({ sessionUser: createMockSessionUser({ role: 'admin' }) });
    const { res } = createMockResponse();
    const next = vi.fn();

    middleware(req as any, res as any, next);

    expect(next).toHaveBeenCalled();
  });

  it('blocks viewer from admin-level routes', () => {
    const middleware = requireRole('admin');
    const req = createMockRequest({ sessionUser: createMockSessionUser({ role: 'viewer' }) });
    const { res, getStatus, getJson } = createMockResponse();
    const next = vi.fn();

    middleware(req as any, res as any, next);

    expect(next).not.toHaveBeenCalled();
    expect(getStatus()).toBe(403);
    expect(getJson()).toEqual({
      error: { code: 'FORBIDDEN', message: 'Insufficient permissions' },
    });
  });

  it('returns 401 for unauthenticated request', () => {
    const middleware = requireRole('viewer');
    const req = createMockRequest({ sessionUser: undefined });
    const { res, getStatus } = createMockResponse();
    const next = vi.fn();

    middleware(req as any, res as any, next);

    expect(getStatus()).toBe(401);
  });

  it('allows viewer to access viewer-level routes', () => {
    const middleware = requireRole('viewer');
    const req = createMockRequest({ sessionUser: createMockSessionUser({ role: 'viewer' }) });
    const { res } = createMockResponse();
    const next = vi.fn();

    middleware(req as any, res as any, next);

    expect(next).toHaveBeenCalled();
  });
});

// ── globalErrorHandler ──────────────────────────────────

describe('globalErrorHandler', () => {
  it('returns normalized error shape for AppError', () => {
    const err = new AppError(400, 'VALIDATION_ERROR', 'Bad input', { field: 'email' });
    const req = createMockRequest();
    const { res, getStatus, getJson } = createMockResponse();
    const next = vi.fn();

    globalErrorHandler(err, req as any, res as any, next);

    expect(getStatus()).toBe(400);
    expect(getJson()).toEqual({
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Bad input',
        details: { field: 'email' },
      },
    });
  });

  it('returns generic 500 for unexpected errors', () => {
    const err = new Error('Something broke');
    const req = createMockRequest();
    const { res, getStatus, getJson } = createMockResponse();
    const next = vi.fn();

    globalErrorHandler(err, req as any, res as any, next);

    expect(getStatus()).toBe(500);
    expect(getJson()).toEqual({
      error: {
        code: 'INTERNAL_ERROR',
        message: 'An unexpected error occurred',
      },
    });
  });

  it('does not leak stack traces in error response', () => {
    const err = new Error('DB connection failed');
    const req = createMockRequest();
    const { res, getJson } = createMockResponse();
    const next = vi.fn();

    globalErrorHandler(err, req as any, res as any, next);

    const body = getJson() as any;
    expect(body.error.stack).toBeUndefined();
    expect(body.error.message).not.toContain('DB connection');
  });
});

// ── Regression: normalized error shape ──────────────────

describe('Normalized error shape regression', () => {
  it('all AppErrors have code + message', () => {
    const errors = [
      new AppError(400, 'VALIDATION_ERROR', 'Invalid input'),
      new AppError(401, 'UNAUTHORIZED', 'Not authenticated'),
      new AppError(403, 'FORBIDDEN', 'Access denied'),
      new AppError(404, 'NOT_FOUND', 'Resource not found'),
      new AppError(409, 'CONFLICT', 'Already exists'),
    ];

    for (const err of errors) {
      const req = createMockRequest();
      const { res, getJson } = createMockResponse();
      globalErrorHandler(err, req as any, res as any, vi.fn());

      const body = getJson() as any;
      expect(body).toHaveProperty('error.code');
      expect(body).toHaveProperty('error.message');
      expect(typeof body.error.code).toBe('string');
      expect(typeof body.error.message).toBe('string');
    }
  });
});
