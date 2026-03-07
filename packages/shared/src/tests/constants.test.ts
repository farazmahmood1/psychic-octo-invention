/**
 * Unit tests for shared constants and enums.
 */
import { describe, it, expect } from 'vitest';
import {
  API_PREFIX,
  HTTP_STATUS,
  ADMIN_ROLES,
  ROLE_HIERARCHY,
} from '../index.js';

describe('Constants', () => {
  it('API_PREFIX is /api/v1', () => {
    expect(API_PREFIX).toBe('/api/v1');
  });

  it('HTTP_STATUS has standard codes', () => {
    expect(HTTP_STATUS.OK).toBe(200);
    expect(HTTP_STATUS.BAD_REQUEST).toBe(400);
    expect(HTTP_STATUS.UNAUTHORIZED).toBe(401);
    expect(HTTP_STATUS.FORBIDDEN).toBe(403);
    expect(HTTP_STATUS.NOT_FOUND).toBe(404);
    expect(HTTP_STATUS.INTERNAL_SERVER_ERROR).toBe(500);
  });

  it('ADMIN_ROLES contains 3 roles', () => {
    expect(ADMIN_ROLES).toEqual(['super_admin', 'admin', 'viewer']);
  });

  it('ROLE_HIERARCHY has correct ordering', () => {
    expect(ROLE_HIERARCHY.super_admin).toBeGreaterThan(ROLE_HIERARCHY.admin);
    expect(ROLE_HIERARCHY.admin).toBeGreaterThan(ROLE_HIERARCHY.viewer);
    expect(ROLE_HIERARCHY.viewer).toBe(1);
  });
});
