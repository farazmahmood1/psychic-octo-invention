import { describe, it, expect, vi, beforeEach } from 'vitest';

const { completeMock } = vi.hoisted(() => ({
  completeMock: vi.fn(),
}));

vi.mock('../../services/llm/index.js', () => ({
  providerRegistry: {
    getDefault: () => ({
      complete: completeMock,
    }),
  },
}));

import { extractReceiptData } from '../../services/vision/receipt-extractor.js';

describe('Receipt Extractor', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('parses and normalizes structured extraction JSON from vision model', async () => {
    completeMock.mockResolvedValueOnce({
      content: JSON.stringify({
        vendor: 'Starbucks',
        transactionDate: '03/05/2026',
        amount: 12.5,
        currency: 'usd',
        tax: 1.63,
        suggestedCategory: 'Client Meals',
        confidence: 0.9,
        notes: 'clear receipt',
      }),
      toolCalls: [],
      usage: { promptTokens: 1, completionTokens: 1, totalTokens: 2, estimatedCostUsd: null },
      model: 'anthropic/claude-sonnet-4',
      finishReason: 'stop',
      latencyMs: 120,
    });

    const result = await extractReceiptData({ imageUrl: 'https://example.com/receipt.jpg' });

    expect(result.vendor).toBe('Starbucks');
    expect(result.transactionDate).toBe('2026-03-05');
    expect(result.amount).toBe(12.5);
    expect(result.currency).toBe('USD');
    expect(result.tax).toBe(1.63);
    expect(result.suggestedCategory).toBe('Client Meals');
    expect(result.confidence).toBe(0.9);
  });

  it('returns safe fallback structure when model response is not valid JSON', async () => {
    completeMock.mockResolvedValueOnce({
      content: 'not-json',
      toolCalls: [],
      usage: { promptTokens: 1, completionTokens: 1, totalTokens: 2, estimatedCostUsd: null },
      model: 'anthropic/claude-sonnet-4',
      finishReason: 'stop',
      latencyMs: 80,
    });

    const result = await extractReceiptData({ imageUrl: 'https://example.com/receipt.jpg' });

    expect(result.vendor).toBeNull();
    expect(result.amount).toBeNull();
    expect(result.confidence).toBe(0);
    expect(result.notes).toContain('Failed to parse');
  });
});
