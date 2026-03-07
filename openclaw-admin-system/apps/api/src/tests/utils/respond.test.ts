/**
 * Response helper unit tests.
 */
import { describe, it, expect } from 'vitest';
import { sendData, sendPaginated } from '../../utils/respond.js';
import { createMockResponse } from '../helpers/auth-helper.js';

describe('sendData', () => {
  it('wraps data in { data } envelope', () => {
    const { res, getStatus, getJson } = createMockResponse();
    sendData(res as any, { id: '1', name: 'test' });

    expect(getStatus()).toBe(200);
    expect(getJson()).toEqual({ data: { id: '1', name: 'test' } });
  });

  it('respects custom status code', () => {
    const { res, getStatus } = createMockResponse();
    sendData(res as any, { created: true }, 201);

    expect(getStatus()).toBe(201);
  });
});

describe('sendPaginated', () => {
  it('returns data + meta with computed totalPages', () => {
    const { res, getJson } = createMockResponse();
    sendPaginated(res as any, [{ id: '1' }, { id: '2' }], {
      page: 1,
      pageSize: 20,
      total: 50,
    });

    const body = getJson() as any;
    expect(body.data).toHaveLength(2);
    expect(body.meta).toEqual({
      page: 1,
      pageSize: 20,
      total: 50,
      totalPages: 3,
    });
  });

  it('computes totalPages correctly for exact division', () => {
    const { res, getJson } = createMockResponse();
    sendPaginated(res as any, [], { page: 1, pageSize: 10, total: 30 });

    expect((getJson() as any).meta.totalPages).toBe(3);
  });

  it('computes totalPages = 0 for empty results', () => {
    const { res, getJson } = createMockResponse();
    sendPaginated(res as any, [], { page: 1, pageSize: 20, total: 0 });

    expect((getJson() as any).meta.totalPages).toBe(0);
  });
});
