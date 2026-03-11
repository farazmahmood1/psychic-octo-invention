import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  getByKeyMock,
  upsertMock,
  auditCreateMock,
} = vi.hoisted(() => ({
  getByKeyMock: vi.fn(),
  upsertMock: vi.fn(),
  auditCreateMock: vi.fn(),
}));

vi.mock('../../repositories/setting.repository.js', () => ({
  settingRepository: {
    getByKey: getByKeyMock,
    upsert: upsertMock,
  },
}));

vi.mock('../../repositories/audit.repository.js', () => ({
  auditRepository: {
    create: auditCreateMock,
  },
}));

import {
  getFirstPartyToolSettings,
  updateFirstPartyToolSettings,
} from '../../services/settings.service.js';

describe('Settings Service - first-party tools', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    upsertMock.mockResolvedValue({});
    auditCreateMock.mockResolvedValue({});
  });

  it('returns enabled defaults when the setting does not exist yet', async () => {
    getByKeyMock.mockResolvedValueOnce(null);

    const result = await getFirstPartyToolSettings();

    expect(result).toEqual({
      ghlCrmEnabled: true,
      bookkeepingReceiptEnabled: true,
      leadFollowupEnabled: true,
    });
  });

  it('normalizes partial stored settings with enabled defaults', async () => {
    getByKeyMock.mockResolvedValueOnce({
      key: 'first_party_tools',
      value: {
        ghlCrmEnabled: false,
      },
    });

    const result = await getFirstPartyToolSettings();

    expect(result).toEqual({
      ghlCrmEnabled: false,
      bookkeepingReceiptEnabled: true,
      leadFollowupEnabled: true,
    });
  });

  it('persists updated tool toggles and writes an audit log', async () => {
    const result = await updateFirstPartyToolSettings(
      {
        ghlCrmEnabled: false,
        bookkeepingReceiptEnabled: true,
        leadFollowupEnabled: false,
      },
      'admin-1',
      '127.0.0.1',
    );

    expect(upsertMock).toHaveBeenCalledWith(
      'first_party_tools',
      {
        ghlCrmEnabled: false,
        bookkeepingReceiptEnabled: true,
        leadFollowupEnabled: false,
      },
      'admin-1',
      'Runtime enablement for first-party tools and sub-agents',
    );
    expect(auditCreateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'settings.tools_updated',
        targetId: 'first_party_tools',
      }),
    );
    expect(result.leadFollowupEnabled).toBe(false);
  });
});
