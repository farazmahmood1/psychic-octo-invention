import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  processGhlDispatchMock,
  processBookkeepingDispatchMock,
  processFollowUpDispatchMock,
  createTaskMock,
  updateStatusMock,
  getFirstPartyToolSettingsMock,
} = vi.hoisted(() => ({
  processGhlDispatchMock: vi.fn(),
  processBookkeepingDispatchMock: vi.fn(),
  processFollowUpDispatchMock: vi.fn(),
  createTaskMock: vi.fn(),
  updateStatusMock: vi.fn(),
  getFirstPartyToolSettingsMock: vi.fn(),
}));

vi.mock('../../services/subagents/index.js', () => ({
  processGhlDispatch: processGhlDispatchMock,
  processBookkeepingDispatch: processBookkeepingDispatchMock,
  processFollowUpDispatch: processFollowUpDispatchMock,
}));

vi.mock('../../repositories/sub-agent-task.repository.js', () => ({
  subAgentTaskRepository: {
    create: createTaskMock,
    updateStatus: updateStatusMock,
  },
}));

vi.mock('../../services/settings.service.js', () => ({
  getFirstPartyToolSettings: getFirstPartyToolSettingsMock,
  isFirstPartyToolEnabled: (toolName: string, settings: {
    ghlCrmEnabled: boolean;
    bookkeepingReceiptEnabled: boolean;
    leadFollowupEnabled: boolean;
  }) => {
    if (toolName === 'ghl_crm') return settings.ghlCrmEnabled;
    if (toolName === 'bookkeeping_receipt') return settings.bookkeepingReceiptEnabled;
    if (toolName === 'lead_followup') return settings.leadFollowupEnabled;
    return true;
  },
}));

import { processSubAgentCalls } from '../../orchestration/sub-agent-dispatcher.js';

describe('Sub-Agent Dispatcher - runtime tool settings', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getFirstPartyToolSettingsMock.mockResolvedValue({
      ghlCrmEnabled: false,
      bookkeepingReceiptEnabled: false,
      leadFollowupEnabled: false,
    });
    createTaskMock.mockResolvedValue({ id: 'task-1' });
    updateStatusMock.mockResolvedValue({});
  });

  it.each([
    { toolName: 'ghl_crm', action: 'search_contact' },
    { toolName: 'bookkeeping_receipt', action: 'process_receipt' },
    { toolName: 'lead_followup', action: 'find_stale' },
  ])('blocks %s when disabled in runtime settings', async ({ toolName, action }) => {
    const result = await processSubAgentCalls([
      {
        id: `tool-${toolName}`,
        name: toolName,
        arguments: JSON.stringify({ action }),
      },
    ]);

    expect(result.subAgentDispatches[0]).toMatchObject({
      agentName: toolName,
      status: 'failed',
      error: `${toolName} is currently disabled in admin settings.`,
    });
    expect(result.toolResults[0]?.result).toContain('disabled in admin settings');
    expect(processGhlDispatchMock).not.toHaveBeenCalled();
    expect(processBookkeepingDispatchMock).not.toHaveBeenCalled();
    expect(processFollowUpDispatchMock).not.toHaveBeenCalled();
  });
});
