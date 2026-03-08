import { describe, it, expect, vi, beforeEach } from 'vitest';

const {
  findByIdempotencyKeyMock,
  createMock,
  updateExtractionMock,
  findPendingByConversationMock,
  findByIdMock,
  setCategoryMock,
  createLedgerExportMock,
  updateStatusMock,
  extractReceiptDataMock,
  appendBookkeepingRowMock,
} = vi.hoisted(() => ({
  findByIdempotencyKeyMock: vi.fn(),
  createMock: vi.fn(),
  updateExtractionMock: vi.fn(),
  findPendingByConversationMock: vi.fn(),
  findByIdMock: vi.fn(),
  setCategoryMock: vi.fn(),
  createLedgerExportMock: vi.fn(),
  updateStatusMock: vi.fn(),
  extractReceiptDataMock: vi.fn(),
  appendBookkeepingRowMock: vi.fn(),
}));

vi.mock('../../repositories/receipt-extraction.repository.js', () => ({
  receiptExtractionRepository: {
    findByIdempotencyKey: findByIdempotencyKeyMock,
    create: createMock,
    updateExtraction: updateExtractionMock,
    findPendingByConversation: findPendingByConversationMock,
    findById: findByIdMock,
    setCategory: setCategoryMock,
    createLedgerExport: createLedgerExportMock,
    updateStatus: updateStatusMock,
  },
}));

vi.mock('../../services/vision/index.js', () => ({
  extractReceiptData: extractReceiptDataMock,
}));

vi.mock('../../integrations/google/index.js', () => ({
  appendBookkeepingRow: appendBookkeepingRowMock,
}));

import { executeBookkeepingTask } from '../../services/subagents/bookkeeping/bookkeeping.service.js';

describe('Bookkeeping Service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    findByIdempotencyKeyMock.mockResolvedValue(null);
    createMock.mockResolvedValue({ id: 'receipt-1' });
    updateExtractionMock.mockResolvedValue({});
    findPendingByConversationMock.mockResolvedValue({ id: 'receipt-1' });
    setCategoryMock.mockResolvedValue({});
    createLedgerExportMock.mockResolvedValue({});
    updateStatusMock.mockResolvedValue({});
    appendBookkeepingRowMock.mockResolvedValue({ updatedRange: 'Bookkeeping!A2:L2' });
  });

  it('asks for category when extraction is otherwise complete but category is missing', async () => {
    extractReceiptDataMock.mockResolvedValueOnce({
      vendor: 'Starbucks',
      transactionDate: '2026-03-05',
      amount: 12.5,
      currency: 'USD',
      tax: 1.63,
      suggestedCategory: null,
      confidence: 0.82,
      notes: null,
    });

    const result = await executeBookkeepingTask(
      { action: 'process_receipt', imageUrl: 'https://example.com/receipt.jpg' },
      {
        conversationId: 'conv-1',
        externalUserId: 'user-1',
        sourceChannel: 'telegram',
        sourceMessageId: 'msg-1',
      },
    );

    expect(result.success).toBe(true);
    expect(result.needsClarification).toBe(true);
    expect(result.clarificationQuestion).toContain('What category should this expense be filed under?');
    expect(appendBookkeepingRowMock).not.toHaveBeenCalled();
  });

  it('finalizes and appends row when user sets category on a pending receipt', async () => {
    findByIdMock.mockResolvedValueOnce({
      id: 'receipt-1',
      status: 'extracted',
      extractedData: {
        vendor: 'Starbucks',
        transactionDate: '2026-03-05',
        amount: 12.5,
        currency: 'USD',
        tax: 1.63,
        suggestedCategory: null,
        confidence: 0.9,
        notes: null,
      },
    });

    const result = await executeBookkeepingTask(
      { action: 'set_category', category: 'Client Meals' },
      {
        conversationId: 'conv-1',
        externalUserId: 'user-1',
        sourceChannel: 'telegram',
        sourceMessageId: 'msg-2',
      },
    );

    expect(setCategoryMock).toHaveBeenCalledWith('receipt-1', 'Client Meals');
    expect(appendBookkeepingRowMock).toHaveBeenCalledTimes(1);
    expect(createLedgerExportMock).toHaveBeenCalledWith(
      expect.objectContaining({
        receiptExtractionId: 'receipt-1',
        rowRange: 'Bookkeeping!A2:L2',
      }),
    );
    expect(updateStatusMock).toHaveBeenCalledWith('receipt-1', 'exported');
    expect(result.success).toBe(true);
    expect(result.sheetRowAppended).toBe(true);
  });
});
