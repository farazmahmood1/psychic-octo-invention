import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  BOOKKEEPING_TOOL_NAME,
  FOLLOWUP_TOOL_NAME,
  GHL_CRM_TOOL_NAME,
} from '@nexclaw/shared';

const {
  skillFindManyMock,
  getFirstPartyToolSettingsMock,
} = vi.hoisted(() => ({
  skillFindManyMock: vi.fn(),
  getFirstPartyToolSettingsMock: vi.fn(),
}));

vi.mock('../../db/client.js', () => ({
  prisma: {
    skill: {
      findMany: skillFindManyMock,
    },
  },
}));

vi.mock('../../security/execution-guard.js', () => ({
  skillExecutionGuard: {
    canExecute: vi.fn(async () => ({ approved: true, skillId: 'skill-1' })),
  },
}));

vi.mock('../../services/settings.service.js', () => ({
  getFirstPartyToolSettings: getFirstPartyToolSettingsMock,
  isFirstPartyToolEnabled: (toolName: string, settings: {
    ghlCrmEnabled: boolean;
    bookkeepingReceiptEnabled: boolean;
    leadFollowupEnabled: boolean;
  }) => {
    if (toolName === GHL_CRM_TOOL_NAME) return settings.ghlCrmEnabled;
    if (toolName === BOOKKEEPING_TOOL_NAME) return settings.bookkeepingReceiptEnabled;
    if (toolName === FOLLOWUP_TOOL_NAME) return settings.leadFollowupEnabled;
    return true;
  },
}));

import { resolveToolCatalog } from '../../orchestration/tool-resolver.js';

describe('Tool Resolver - first-party tool settings', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    skillFindManyMock.mockResolvedValue([]);
    getFirstPartyToolSettingsMock.mockResolvedValue({
      ghlCrmEnabled: true,
      bookkeepingReceiptEnabled: true,
      leadFollowupEnabled: true,
    });
  });

  it('filters disabled built-in tools out of the resolved catalog', async () => {
    getFirstPartyToolSettingsMock.mockResolvedValueOnce({
      ghlCrmEnabled: false,
      bookkeepingReceiptEnabled: true,
      leadFollowupEnabled: false,
    });

    const catalog = await resolveToolCatalog();
    const names = catalog.tools.map((tool) => tool.name);

    expect(names).not.toContain(GHL_CRM_TOOL_NAME);
    expect(names).toContain(BOOKKEEPING_TOOL_NAME);
    expect(names).not.toContain(FOLLOWUP_TOOL_NAME);
  });
});
