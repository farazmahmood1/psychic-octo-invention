import { describe, it, expect, vi, beforeEach } from 'vitest';
import { HTTP_STATUS } from '@nexclaw/shared';

const { findByIdMock, listMock, setEnabledMock, auditCreateMock } = vi.hoisted(() => ({
  findByIdMock: vi.fn(),
  listMock: vi.fn(),
  setEnabledMock: vi.fn(),
  auditCreateMock: vi.fn(),
}));

vi.mock('../../repositories/skill.repository.js', () => ({
  skillRepository: {
    findById: findByIdMock,
    list: listMock,
    setEnabled: setEnabledMock,
  },
}));

vi.mock('../../repositories/audit.repository.js', () => ({
  auditRepository: {
    create: auditCreateMock,
  },
}));

import { listSkills, toggleSkill } from '../../services/skills/skill.service.js';
import { AppError } from '../../utils/app-error.js';

function createSkill(
  vettingResult: 'passed' | 'failed' | 'warning' | 'pending' | null = 'passed',
  options: { useCurrentVersion?: boolean } = {},
) {
  const latestVersion = vettingResult === null
    ? null
    : {
      version: '1.0.0',
      vettingResults: [
        {
          result: vettingResult,
          createdAt: new Date(),
        },
      ],
    };

  return {
    id: 'skill-1',
    slug: 'sample-skill',
    displayName: 'Sample Skill',
    description: 'Sample description',
    sourceType: 'uploaded',
    enabled: false,
    currentVersion: options.useCurrentVersion === false ? null : latestVersion,
    versions: latestVersion && options.useCurrentVersion === false ? [latestVersion] : [],
  };
}

describe('Skill Service - listSkills', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('uses current version vetting when available', async () => {
    listMock.mockResolvedValueOnce([createSkill('passed')]);

    const result = await listSkills();

    expect(result).toEqual([
      expect.objectContaining({
        slug: 'sample-skill',
        currentVersion: '1.0.0',
        latestVetting: 'passed',
      }),
    ]);
  });

  it('falls back to latest uploaded version when currentVersion is missing', async () => {
    listMock.mockResolvedValueOnce([createSkill('failed', { useCurrentVersion: false })]);

    const result = await listSkills();

    expect(result).toEqual([
      expect.objectContaining({
        slug: 'sample-skill',
        currentVersion: '1.0.0',
        latestVetting: 'failed',
      }),
    ]);
  });
});

describe('Skill Service - toggleSkill', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setEnabledMock.mockResolvedValue({
      id: 'skill-1',
      slug: 'sample-skill',
      displayName: 'Sample Skill',
      description: 'Sample description',
      sourceType: 'uploaded',
      enabled: true,
    });
    auditCreateMock.mockResolvedValue({});
  });

  it('blocks enabling when skill is not found', async () => {
    findByIdMock.mockResolvedValueOnce(null);

    await expect(toggleSkill('missing', true, 'admin-1', '127.0.0.1')).rejects.toMatchObject({
      statusCode: HTTP_STATUS.NOT_FOUND,
      code: 'NOT_FOUND',
    } satisfies Partial<AppError>);
  });

  it('blocks enabling when vetting does not exist', async () => {
    findByIdMock.mockResolvedValueOnce(createSkill(null));

    await expect(toggleSkill('skill-1', true, 'admin-1', '127.0.0.1')).rejects.toMatchObject({
      statusCode: HTTP_STATUS.UNPROCESSABLE_ENTITY,
      code: 'VETTING_REQUIRED',
    } satisfies Partial<AppError>);
  });

  it('blocks enabling when vetting failed', async () => {
    findByIdMock.mockResolvedValueOnce(createSkill('failed'));

    await expect(toggleSkill('skill-1', true, 'admin-1', '127.0.0.1')).rejects.toMatchObject({
      statusCode: HTTP_STATUS.UNPROCESSABLE_ENTITY,
      code: 'VETTING_FAILED',
    } satisfies Partial<AppError>);
  });

  it('blocks enabling when vetting is pending', async () => {
    findByIdMock.mockResolvedValueOnce(createSkill('pending'));

    await expect(toggleSkill('skill-1', true, 'admin-1', '127.0.0.1')).rejects.toMatchObject({
      statusCode: HTTP_STATUS.UNPROCESSABLE_ENTITY,
      code: 'VETTING_PENDING',
    } satisfies Partial<AppError>);
  });

  it('uses the latest uploaded version when the current version pointer is missing', async () => {
    findByIdMock.mockResolvedValueOnce(createSkill('failed', { useCurrentVersion: false }));

    await expect(toggleSkill('skill-1', true, 'admin-1', '127.0.0.1')).rejects.toMatchObject({
      statusCode: HTTP_STATUS.UNPROCESSABLE_ENTITY,
      code: 'VETTING_FAILED',
    } satisfies Partial<AppError>);
  });

  it('allows enabling when vetting is warning/passed and writes audit', async () => {
    findByIdMock.mockResolvedValueOnce(createSkill('warning'));

    const updated = await toggleSkill('skill-1', true, 'admin-1', '127.0.0.1');

    expect(setEnabledMock).toHaveBeenCalledWith('skill-1', true);
    expect(auditCreateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'skill.enabled',
        targetId: 'skill-1',
      }),
    );
    expect(updated.enabled).toBe(true);
  });

  it('allows disabling without vetting checks and writes audit', async () => {
    findByIdMock.mockResolvedValueOnce(createSkill('failed'));
    setEnabledMock.mockResolvedValueOnce({
      id: 'skill-1',
      slug: 'sample-skill',
      displayName: 'Sample Skill',
      description: 'Sample description',
      sourceType: 'uploaded',
      enabled: false,
    });

    const updated = await toggleSkill('skill-1', false, 'admin-1', '127.0.0.1');

    expect(setEnabledMock).toHaveBeenCalledWith('skill-1', false);
    expect(auditCreateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'skill.disabled',
        targetId: 'skill-1',
      }),
    );
    expect(updated.enabled).toBe(false);
  });
});
