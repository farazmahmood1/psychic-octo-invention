import { describe, it, expect } from 'vitest';
import { appendBookkeepingRow } from '../../integrations/google/sheets-client.js';

describe('Google Sheets Client', () => {
  it('fails fast with clear error when service account JSON is missing required keys', async () => {
    await expect(
      appendBookkeepingRow({
        timestampProcessed: new Date().toISOString(),
        sourceChannel: 'telegram',
        userExternalId: 'user-1',
        vendor: 'Starbucks',
        transactionDate: '2026-03-08',
        amount: 12.5,
        currency: 'USD',
        tax: 1.5,
        category: 'Client Meals',
        originalMessageId: 'msg-1',
        receiptTaskId: 'receipt-1',
        notes: '',
      }),
    ).rejects.toThrow('GOOGLE_SERVICE_ACCOUNT_JSON must include client_email and private_key');
  });
});
