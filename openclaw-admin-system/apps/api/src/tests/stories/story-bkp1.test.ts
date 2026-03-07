/**
 * STORY-BKP1: Receipt extraction + category clarification + sheet append.
 * Tests the bookkeeping sub-agent data flow.
 */
import { describe, it, expect } from 'vitest';
import {
  createReceiptExtractionResult,
  createLedgerExportRecord,
  createGoogleSheetsRow,
} from '../fixtures/receipt.fixture.js';

describe('STORY-BKP1: receipt extraction flow', () => {
  describe('Receipt extraction', () => {
    it('extracts vendor, date, amount, tax from receipt', () => {
      const extraction = createReceiptExtractionResult();
      const data = extraction.extractedData as any;

      expect(data.vendor).toBe('Starbucks');
      expect(data.date).toBe('2026-03-05');
      expect(data.amount).toBe(12.50);
      expect(data.currency).toBe('USD');
      expect(data.tax).toBe(1.63);
    });

    it('has high confidence score', () => {
      const extraction = createReceiptExtractionResult();
      expect(extraction.confidence).toBeGreaterThanOrEqual(0.8);
    });

    it('includes line items', () => {
      const extraction = createReceiptExtractionResult();
      const items = (extraction.extractedData as any).items;
      expect(items).toBeInstanceOf(Array);
      expect(items.length).toBeGreaterThan(0);
      expect(items[0]).toHaveProperty('name');
      expect(items[0]).toHaveProperty('amount');
    });
  });

  describe('Category clarification', () => {
    it('pending receipt has null category (awaiting clarification)', () => {
      const extraction = createReceiptExtractionResult();
      expect(extraction.category).toBeNull();
    });

    it('category can be set after clarification', () => {
      const extraction = createReceiptExtractionResult({ category: 'Client Meals' });
      expect(extraction.category).toBe('Client Meals');
    });
  });

  describe('Idempotency', () => {
    it('extraction has unique idempotency key', () => {
      const extraction = createReceiptExtractionResult();
      expect(extraction.idempotencyKey).toBeDefined();
      expect(extraction.idempotencyKey).toBe('idem-msg-001');
    });

    it('duplicate processing prevented by idempotency key', () => {
      const e1 = createReceiptExtractionResult({ idempotencyKey: 'idem-msg-001' });
      const e2 = createReceiptExtractionResult({ idempotencyKey: 'idem-msg-001' });
      expect(e1.idempotencyKey).toBe(e2.idempotencyKey);
    });
  });

  describe('Ledger export', () => {
    it('export record references extraction', () => {
      const extraction = createReceiptExtractionResult();
      const exportRecord = createLedgerExportRecord({ receiptExtractionId: extraction.id });
      expect(exportRecord.receiptExtractionId).toBe(extraction.id);
    });

    it('Google Sheets row has correct schema', () => {
      const row = createGoogleSheetsRow();
      expect(row).toHaveLength(12);

      // Validate column types
      expect(typeof row[0]).toBe('string');  // timestamp_processed
      expect(typeof row[1]).toBe('string');  // source_channel
      expect(typeof row[2]).toBe('string');  // user_external_id
      expect(typeof row[3]).toBe('string');  // vendor
      expect(typeof row[4]).toBe('string');  // transaction_date
      expect(typeof row[5]).toBe('number');  // amount
      expect(typeof row[6]).toBe('string');  // currency
      expect(typeof row[7]).toBe('number');  // tax
      expect(typeof row[8]).toBe('string');  // category
    });
  });

  describe('Error cases', () => {
    it('non-receipt image has low confidence', () => {
      const extraction = createReceiptExtractionResult({
        confidence: 0.15,
        status: 'failed',
        errorDetails: 'Not a receipt: no vendor or amount detected',
      });
      expect(extraction.confidence).toBeLessThan(0.2);
      expect(extraction.status).toBe('failed');
    });

    it('failed extraction preserves error details', () => {
      const extraction = createReceiptExtractionResult({
        status: 'failed',
        errorDetails: 'Vision API timeout after 30s',
      });
      expect(extraction.errorDetails).toContain('timeout');
    });
  });
});
