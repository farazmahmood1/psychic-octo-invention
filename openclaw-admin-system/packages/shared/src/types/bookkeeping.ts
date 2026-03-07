// ── Bookkeeping Sub-Agent Types ──────────────────────────────

export const BOOKKEEPING_TOOL_NAME = 'bookkeeping_receipt' as const;

/**
 * Structured data extracted from a receipt image by the vision model.
 */
export interface ReceiptExtractionData {
  vendor: string | null;
  transactionDate: string | null;
  amount: number | null;
  currency: string | null;
  tax: number | null;
  suggestedCategory: string | null;
  confidence: number;
  notes: string | null;
}

/**
 * Input for the bookkeeping sub-agent tool call.
 */
export interface BookkeepingSubAgentInput {
  action: 'process_receipt' | 'set_category' | 'get_pending';
  /** Image URL for receipt processing */
  imageUrl?: string;
  /** Receipt task ID for category confirmation */
  receiptTaskId?: string;
  /** Category provided by user */
  category?: string;
  /** Additional notes */
  notes?: string;
}

/**
 * Output from the bookkeeping sub-agent.
 */
export interface BookkeepingSubAgentOutput {
  success: boolean;
  action: string;
  summary: string;
  receiptTaskId?: string;
  extractedData?: ReceiptExtractionData;
  error?: string;
  needsClarification?: boolean;
  clarificationQuestion?: string;
  sheetRowAppended?: boolean;
}

/**
 * Row schema for the Google Sheet bookkeeping ledger.
 */
export interface BookkeepingSheetRow {
  timestampProcessed: string;
  sourceChannel: string;
  userExternalId: string;
  vendor: string;
  transactionDate: string;
  amount: number;
  currency: string;
  tax: number | null;
  category: string;
  originalMessageId: string;
  receiptTaskId: string;
  notes: string;
}

/**
 * Categories commonly used for bookkeeping.
 * The LLM can suggest from these, but users can provide any category.
 */
export const BOOKKEEPING_CATEGORIES = [
  'Office Supplies',
  'Travel',
  'Client Meals',
  'Team Meals',
  'Software & Subscriptions',
  'Marketing',
  'Utilities',
  'Professional Services',
  'Equipment',
  'Shipping',
  'Miscellaneous',
] as const;
