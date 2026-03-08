import { describe, it, expect, vi, beforeEach } from 'vitest';

const { findManyMock, countMock } = vi.hoisted(() => ({
  findManyMock: vi.fn(),
  countMock: vi.fn(),
}));

vi.mock('../../db/client.js', () => ({
  prisma: {
    auditLog: {
      findMany: findManyMock,
      count: countMock,
    },
    skillVettingResult: {
      findMany: vi.fn(),
      count: vi.fn(),
    },
  },
}));

import { listBlockedAttempts } from '../../services/security-admin.service.js';

describe('Security Admin Service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    findManyMock.mockResolvedValue([]);
    countMock.mockResolvedValue(0);
  });

  it('includes skill.* blocked actions when no action filter is provided', async () => {
    await listBlockedAttempts({ page: 1, pageSize: 20 });

    const expectedWhere = {
      OR: [
        { action: { startsWith: 'security.' } },
        { action: { in: ['skill.ingestion_blocked', 'skill.execution_blocked'] } },
      ],
    };

    expect(findManyMock).toHaveBeenCalledWith(
      expect.objectContaining({ where: expectedWhere }),
    );
    expect(countMock).toHaveBeenCalledWith({ where: expectedWhere });
  });

  it('uses explicit action filter when provided', async () => {
    await listBlockedAttempts({ page: 1, pageSize: 20, action: 'skill.execution_blocked' });

    expect(findManyMock).toHaveBeenCalledWith(
      expect.objectContaining({ where: { action: 'skill.execution_blocked' } }),
    );
    expect(countMock).toHaveBeenCalledWith({ where: { action: 'skill.execution_blocked' } });
  });

  it('normalizes reason and slug fallback from metadata', async () => {
    const createdAt = new Date('2026-03-08T12:00:00.000Z');
    findManyMock.mockResolvedValue([
      {
        id: 'log_1',
        action: 'skill.ingestion_blocked',
        actorId: null,
        ipAddress: '127.0.0.1',
        metadata: {
          slug: 'dangerous-skill',
          blockReason: 'hash_mismatch',
        },
        createdAt,
      },
    ]);
    countMock.mockResolvedValue(1);

    const result = await listBlockedAttempts({ page: 1, pageSize: 20 });

    expect(result.data).toHaveLength(1);
    expect(result.data[0]).toMatchObject({
      action: 'skill.ingestion_blocked',
      skillSlug: 'dangerous-skill',
      reason: 'hash mismatch',
    });
  });
});
