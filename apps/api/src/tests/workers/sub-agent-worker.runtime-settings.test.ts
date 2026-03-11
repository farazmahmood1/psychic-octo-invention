import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  getFirstPartyToolSettingsMock,
  executeGhlTaskMock,
  executeBookkeepingTaskMock,
  executeFollowUpTaskMock,
  updateStatusMock,
} = vi.hoisted(() => ({
  getFirstPartyToolSettingsMock: vi.fn(),
  executeGhlTaskMock: vi.fn(),
  executeBookkeepingTaskMock: vi.fn(),
  executeFollowUpTaskMock: vi.fn(),
  updateStatusMock: vi.fn(),
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

vi.mock('../../services/subagents/index.js', () => ({
  executeGhlTask: executeGhlTaskMock,
  executeBookkeepingTask: executeBookkeepingTaskMock,
  executeFollowUpTask: executeFollowUpTaskMock,
}));

vi.mock('../../services/subagents/bookkeeping/index.js', () => ({
  executeBookkeepingTask: executeBookkeepingTaskMock,
}));

vi.mock('../../repositories/sub-agent-task.repository.js', () => ({
  subAgentTaskRepository: {
    updateStatus: updateStatusMock,
  },
}));

import { processGhlSubAgentJob } from '../../workers/ghl-sub-agent.worker.js';
import { processBookkeepingJob } from '../../workers/bookkeeping.worker.js';
import { processFollowUpJob } from '../../workers/followup.worker.js';

describe('Sub-agent workers - runtime tool settings', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    updateStatusMock.mockResolvedValue({});
  });

  it('blocks queued GHL jobs when the tool is disabled', async () => {
    getFirstPartyToolSettingsMock.mockResolvedValueOnce({
      ghlCrmEnabled: false,
      bookkeepingReceiptEnabled: true,
      leadFollowupEnabled: true,
    });

    const result = await processGhlSubAgentJob({
      input: { action: 'search_contact', query: 'Jane' },
      conversationId: 'conv-1',
      messageId: 'msg-1',
      subAgentTaskId: 'task-1',
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain('disabled in admin settings');
    expect(executeGhlTaskMock).not.toHaveBeenCalled();
    expect(updateStatusMock).toHaveBeenCalledWith('task-1', 'failed', expect.any(Object));
  });

  it('blocks queued bookkeeping jobs when the tool is disabled', async () => {
    getFirstPartyToolSettingsMock.mockResolvedValueOnce({
      ghlCrmEnabled: true,
      bookkeepingReceiptEnabled: false,
      leadFollowupEnabled: true,
    });

    const result = await processBookkeepingJob({
      input: { action: 'get_pending' },
      conversationId: 'conv-2',
      messageId: 'msg-2',
      subAgentTaskId: 'task-2',
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain('disabled in admin settings');
    expect(executeBookkeepingTaskMock).not.toHaveBeenCalled();
  });

  it('blocks queued follow-up jobs when the tool is disabled', async () => {
    getFirstPartyToolSettingsMock.mockResolvedValueOnce({
      ghlCrmEnabled: true,
      bookkeepingReceiptEnabled: true,
      leadFollowupEnabled: false,
    });

    const result = await processFollowUpJob({
      input: { action: 'find_stale' },
      conversationId: 'conv-3',
      messageId: 'msg-3',
      subAgentTaskId: 'task-3',
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain('disabled in admin settings');
    expect(executeFollowUpTaskMock).not.toHaveBeenCalled();
  });
});
