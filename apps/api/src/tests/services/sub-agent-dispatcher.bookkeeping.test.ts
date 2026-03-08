import { describe, it, expect, vi, beforeEach } from 'vitest';

const {
  processBookkeepingDispatchMock,
  createTaskMock,
  updateStatusMock,
} = vi.hoisted(() => ({
  processBookkeepingDispatchMock: vi.fn(),
  createTaskMock: vi.fn(),
  updateStatusMock: vi.fn(),
}));

vi.mock('../../services/subagents/index.js', () => ({
  processGhlDispatch: vi.fn(async (dispatch: unknown) => dispatch),
  processBookkeepingDispatch: processBookkeepingDispatchMock,
  processFollowUpDispatch: vi.fn(async (dispatch: unknown) => dispatch),
}));

vi.mock('../../repositories/sub-agent-task.repository.js', () => ({
  subAgentTaskRepository: {
    create: createTaskMock,
    updateStatus: updateStatusMock,
  },
}));

import { processSubAgentCalls } from '../../orchestration/sub-agent-dispatcher.js';

describe('Sub-Agent Dispatcher - Bookkeeping', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    createTaskMock.mockResolvedValue({ id: 'task-1' });
    updateStatusMock.mockResolvedValue({});
  });

  it('uses source image URL from context when bookkeeping tool call omits imageUrl', async () => {
    processBookkeepingDispatchMock.mockImplementationOnce(async (dispatch: any) => ({
      ...dispatch,
      status: 'completed',
      output: {
        summary: 'Receipt extracted.',
        needsClarification: true,
        clarificationQuestion: 'What category should this expense be filed under?',
      },
    }));

    const result = await processSubAgentCalls(
      [
        {
          id: 'tool-1',
          name: 'bookkeeping_receipt',
          arguments: JSON.stringify({ action: 'process_receipt' }),
        },
      ],
      {
        conversationId: 'conv-1',
        externalUserId: 'user-1',
        sourceChannel: 'telegram',
        sourceMessageId: 'msg-1',
        sourceImageUrl: 'https://example.com/receipt.jpg',
      },
    );

    expect(processBookkeepingDispatchMock).toHaveBeenCalledWith(
      expect.objectContaining({
        input: expect.objectContaining({
          action: 'process_receipt',
          imageUrl: 'https://example.com/receipt.jpg',
        }),
      }),
    );
    expect(result.toolResults[0]?.result).toContain('What category should this expense be filed under?');
  });

  it('maps set_category value fallback into category input', async () => {
    processBookkeepingDispatchMock.mockImplementationOnce(async (dispatch: any) => ({
      ...dispatch,
      status: 'completed',
      output: { summary: 'Category set.' },
    }));

    await processSubAgentCalls(
      [
        {
          id: 'tool-2',
          name: 'bookkeeping_receipt',
          arguments: JSON.stringify({ action: 'set_category', value: 'Client Meals' }),
        },
      ],
      { conversationId: 'conv-2' },
    );

    expect(processBookkeepingDispatchMock).toHaveBeenCalledWith(
      expect.objectContaining({
        input: expect.objectContaining({
          action: 'set_category',
          category: 'Client Meals',
        }),
      }),
    );
  });
});
