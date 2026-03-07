/**
 * Realistic receipt extraction and bookkeeping fixtures.
 */

export function createReceiptExtractionResult(overrides: Record<string, unknown> = {}) {
  return {
    id: 'receipt-001',
    fileName: 'receipt-starbucks.jpg',
    status: 'extracted',
    confidence: 0.92,
    sourceChannel: 'telegram',
    sourceMessageId: 'msg-001',
    idempotencyKey: 'idem-msg-001',
    extractedData: {
      vendor: 'Starbucks',
      date: '2026-03-05',
      amount: 12.50,
      currency: 'USD',
      tax: 1.63,
      items: [
        { name: 'Latte', amount: 5.50 },
        { name: 'Croissant', amount: 3.75 },
        { name: 'Bottled Water', amount: 1.62 },
      ],
    },
    category: null, // Awaiting clarification
    errorDetails: null,
    createdAt: new Date('2026-03-05T10:00:00Z'),
    updatedAt: new Date('2026-03-05T10:00:00Z'),
    ...overrides,
  };
}

export function createLedgerExportRecord(overrides: Record<string, unknown> = {}) {
  return {
    id: 'export-001',
    receiptExtractionId: 'receipt-001',
    status: 'exported',
    sheetRowNumber: 42,
    exportedAt: new Date('2026-03-05T10:05:00Z'),
    createdAt: new Date('2026-03-05T10:05:00Z'),
    ...overrides,
  };
}

export function createGoogleSheetsRow() {
  return [
    new Date().toISOString(), // timestamp_processed
    'telegram',              // source_channel
    '12345678',              // user_external_id
    'Starbucks',             // vendor
    '2026-03-05',            // transaction_date
    12.50,                   // amount
    'USD',                   // currency
    1.63,                    // tax
    'Client Meals',          // category
    'msg-001',               // original_message_id
    'receipt-001',           // receipt_task_id
    '',                      // notes
  ];
}
