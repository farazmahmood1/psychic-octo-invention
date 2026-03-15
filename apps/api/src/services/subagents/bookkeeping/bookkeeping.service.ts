import { env, logger } from '@openclaw/config';
import type {
  BookkeepingSubAgentInput,
  BookkeepingSubAgentOutput,
  ReceiptExtractionData,
  BookkeepingSheetRow,
  SubAgentDispatch,
} from '@openclaw/shared';
import { BOOKKEEPING_CATEGORIES } from '@openclaw/shared';
import { receiptExtractionRepository } from '../../../repositories/receipt-extraction.repository.js';
import { extractReceiptData } from '../../vision/index.js';
import { appendBookkeepingRow } from '../../../integrations/google/index.js';
import {
  validateAmount,
  validateCategory,
  checkExtractionCompleteness,
} from '../../../validators/bookkeeping-fields.js';

/**
 * Bookkeeping Sub-Agent Service.
 *
 * Handles the multi-turn receipt processing flow:
 *   1. process_receipt: Extract data from receipt image via vision model
 *   2. set_category: User provides the missing category
 *   3. get_pending: Check if there's a pending receipt awaiting category
 *
 * The flow:
 *   User sends receipt → process_receipt → extract → ask for category (if missing)
 *   User replies with category → set_category → append to Google Sheet → confirm
 */
export async function executeBookkeepingTask(
  input: BookkeepingSubAgentInput,
  context?: {
    conversationId?: string;
    externalUserId?: string;
    sourceChannel?: string;
    sourceMessageId?: string;
  },
): Promise<BookkeepingSubAgentOutput> {
  switch (input.action) {
    case 'process_receipt':
      return handleProcessReceipt(input, context);
    case 'set_category':
      return handleSetCategory(input, context);
    case 'get_pending':
      return handleGetPending(context);
    case 'manual_entry':
      return handleManualEntry(input, context);
    default:
      return {
        success: false,
        action: input.action,
        summary: `Unsupported bookkeeping action: "${input.action}". Supported: process_receipt, set_category, get_pending, manual_entry.`,
        error: `Unsupported action: ${input.action}`,
      };
  }
}

/**
 * Process a SubAgentDispatch from the orchestrator.
 */
export async function processBookkeepingDispatch(
  dispatch: SubAgentDispatch,
): Promise<SubAgentDispatch> {
  const input = dispatch.input as unknown as BookkeepingSubAgentInput;
  const context = (dispatch.input as Record<string, unknown>)['_context'] as {
    conversationId?: string;
    externalUserId?: string;
    sourceChannel?: string;
    sourceMessageId?: string;
  } | undefined;

  try {
    const output = await executeBookkeepingTask(input, context);
    return {
      ...dispatch,
      status: output.success ? 'completed' : 'failed',
      output: output as unknown as Record<string, unknown>,
      error: output.error,
    };
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    return {
      ...dispatch,
      status: 'failed',
      error,
    };
  }
}

// ── Process Receipt ──────────────────────────────────────────

async function handleProcessReceipt(
  input: BookkeepingSubAgentInput,
  context?: {
    conversationId?: string;
    externalUserId?: string;
    sourceChannel?: string;
    sourceMessageId?: string;
  },
): Promise<BookkeepingSubAgentOutput> {
  const imageUrl = input.imageUrl;
  if (!imageUrl) {
    return {
      success: false,
      action: 'process_receipt',
      summary: 'No receipt image provided. Please send a photo of the receipt.',
      error: 'Missing imageUrl',
    };
  }

  // Idempotency check — prevent duplicate processing of same image
  const idempotencyKey = `receipt:${context?.sourceMessageId ?? imageUrl}`;
  const existing = await receiptExtractionRepository.findByIdempotencyKey(idempotencyKey);
  if (existing) {
    const data = existing.extractedData as unknown as ReceiptExtractionData | null;
    if (existing.status === 'exported') {
      return {
        success: true,
        action: 'process_receipt',
        summary: 'This receipt has already been processed and exported.',
        receiptTaskId: existing.id,
        extractedData: data ?? undefined,
      };
    }
    if (existing.status === 'extracted' && !existing.category) {
      const categoryList = BOOKKEEPING_CATEGORIES.join(', ');
      return {
        success: true,
        action: 'process_receipt',
        summary: buildExtractionSummary(data, existing.id),
        receiptTaskId: existing.id,
        extractedData: data ?? undefined,
        needsClarification: true,
        clarificationQuestion: `What category should this expense be filed under? Common options: ${categoryList}`,
      };
    }
  }

  // Create receipt extraction record
  const record = await receiptExtractionRepository.create({
    conversationId: context?.conversationId,
    externalUserId: context?.externalUserId,
    sourceChannel: (context?.sourceChannel ?? 'telegram') as 'telegram' | 'email' | 'admin_portal',
    sourceMessageId: context?.sourceMessageId,
    idempotencyKey,
    fileUrl: imageUrl,
    fileType: 'image',
  });

  // Extract receipt data via vision model
  let extractedData: ReceiptExtractionData;
  try {
    extractedData = await extractReceiptData({ imageUrl });
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    logger.error({ err, receiptId: record.id }, 'Receipt extraction failed');
    await receiptExtractionRepository.updateStatus(record.id, 'failed', error);
    return {
      success: false,
      action: 'process_receipt',
      summary: 'Failed to extract data from the receipt image. The image may be too blurry or not a receipt.',
      receiptTaskId: record.id,
      error,
    };
  }

  // Check if this is actually a receipt
  if (extractedData.confidence < 0.2 && !extractedData.vendor && !extractedData.amount) {
    await receiptExtractionRepository.updateExtraction(record.id, {
      extractedData: extractedData as any,
      confidence: extractedData.confidence,
      status: 'failed',
      errorDetails: 'Image does not appear to be a receipt',
    });
    return {
      success: false,
      action: 'process_receipt',
      summary: "This doesn't appear to be a receipt. Please send a clear photo of a receipt.",
      receiptTaskId: record.id,
      extractedData,
      error: 'Not a receipt',
    };
  }

  // Persist extraction
  await receiptExtractionRepository.updateExtraction(record.id, {
    extractedData: extractedData as any,
    confidence: extractedData.confidence,
    status: 'extracted',
  });

  // If category is suggested with high confidence, use it directly
  const category = extractedData.suggestedCategory && extractedData.confidence >= 0.7
    ? extractedData.suggestedCategory
    : null;

  if (category) {
    await receiptExtractionRepository.setCategory(record.id, category);
  }

  // Check completeness
  const resolvedCategory = category ?? extractedData.suggestedCategory ?? null;
  const completeness = checkExtractionCompleteness(extractedData, resolvedCategory);
  if (completeness.complete && resolvedCategory) {
    // Everything present — append to sheet immediately
    return await finalizeAndAppend(record.id, extractedData, resolvedCategory, context);
  }

  // Need clarification (most commonly: category)
  const categoryList = BOOKKEEPING_CATEGORIES.join(', ');
  const missingFields = !completeness.complete ? completeness.missing : [];

  let question = '';
  if (missingFields.includes('category')) {
    question = `What category should this expense be filed under? Common options: ${categoryList}`;
  } else if (missingFields.includes('vendor')) {
    question = 'I couldn\'t determine the vendor/store name. What business is this receipt from?';
  } else if (missingFields.includes('amount')) {
    question = 'I couldn\'t read the total amount. What was the total on this receipt?';
  }

  return {
    success: true,
    action: 'process_receipt',
    summary: buildExtractionSummary(extractedData, record.id),
    receiptTaskId: record.id,
    extractedData,
    needsClarification: true,
    clarificationQuestion: question,
  };
}

// ── Set Category ─────────────────────────────────────────────

async function handleSetCategory(
  input: BookkeepingSubAgentInput,
  context?: {
    conversationId?: string;
    externalUserId?: string;
    sourceChannel?: string;
    sourceMessageId?: string;
  },
): Promise<BookkeepingSubAgentOutput> {
  const { receiptTaskId, category: rawCategory } = input;

  // If no task ID, look for pending receipt in this conversation
  let taskId = receiptTaskId;
  if (!taskId && context?.conversationId) {
    const pending = await receiptExtractionRepository.findPendingByConversation(context.conversationId);
    if (pending) {
      taskId = pending.id;
    }
  }

  if (!taskId) {
    return {
      success: false,
      action: 'set_category',
      summary: 'No pending receipt found to categorize. Please send a receipt image first.',
      error: 'No receipt task ID or pending receipt',
    };
  }

  // Validate category
  const catResult = validateCategory(rawCategory);
  if (!catResult.valid) {
    return {
      success: false,
      action: 'set_category',
      summary: catResult.error,
      receiptTaskId: taskId,
      error: catResult.error,
    };
  }

  const record = await receiptExtractionRepository.findById(taskId);
  if (!record) {
    return {
      success: false,
      action: 'set_category',
      summary: 'Receipt task not found.',
      error: 'Receipt not found',
    };
  }

  if (record.status === 'exported') {
    return {
      success: true,
      action: 'set_category',
      summary: 'This receipt has already been exported to the spreadsheet.',
      receiptTaskId: taskId,
    };
  }

  // Set category
  await receiptExtractionRepository.setCategory(taskId, catResult.value);

  const extractedData = record.extractedData as unknown as ReceiptExtractionData | null;
  if (!extractedData) {
    return {
      success: false,
      action: 'set_category',
      summary: 'Receipt extraction data is missing. Please resend the receipt.',
      receiptTaskId: taskId,
      error: 'No extraction data',
    };
  }

  // Try to finalize
  return await finalizeAndAppend(taskId, extractedData, catResult.value, context);
}

// ── Get Pending ──────────────────────────────────────────────

async function handleGetPending(
  context?: { conversationId?: string },
): Promise<BookkeepingSubAgentOutput> {
  if (!context?.conversationId) {
    return {
      success: false,
      action: 'get_pending',
      summary: 'Cannot check pending receipts without conversation context.',
      error: 'No conversation ID',
    };
  }

  const pending = await receiptExtractionRepository.findPendingByConversation(context.conversationId);
  if (!pending) {
    return {
      success: true,
      action: 'get_pending',
      summary: 'No pending receipts awaiting categorization.',
    };
  }

  const data = pending.extractedData as unknown as ReceiptExtractionData | null;
  const categoryList = BOOKKEEPING_CATEGORIES.join(', ');

  return {
    success: true,
    action: 'get_pending',
    summary: buildExtractionSummary(data, pending.id),
    receiptTaskId: pending.id,
    extractedData: data ?? undefined,
    needsClarification: true,
    clarificationQuestion: `What category should this expense be filed under? Common options: ${categoryList}`,
  };
}

// ── Manual Entry ─────────────────────────────────────────────

async function handleManualEntry(
  input: BookkeepingSubAgentInput,
  context?: {
    conversationId?: string;
    externalUserId?: string;
    sourceChannel?: string;
    sourceMessageId?: string;
  },
): Promise<BookkeepingSubAgentOutput> {
  const { vendor, amount, transactionDate, category, currency, notes } = input;

  // Validate required fields
  const missing: string[] = [];
  if (!vendor) missing.push('vendor');
  if (amount == null) missing.push('amount');
  if (!category) missing.push('category');

  if (missing.length > 0) {
    const categoryList = BOOKKEEPING_CATEGORIES.join(', ');
    return {
      success: false,
      action: 'manual_entry',
      summary: `Missing required fields: ${missing.join(', ')}. Please provide the vendor name, amount, and category.`,
      error: `Missing fields: ${missing.join(', ')}`,
      needsClarification: true,
      clarificationQuestion: missing.includes('category')
        ? `Please provide the missing details. Common categories: ${categoryList}`
        : `Please provide: ${missing.join(', ')}`,
    };
  }

  // Validate amount
  const amountResult = validateAmount(amount);
  if (!amountResult.valid) {
    return {
      success: false,
      action: 'manual_entry',
      summary: `Invalid amount: ${amountResult.error}`,
      error: amountResult.error,
    };
  }

  // Validate category
  const catResult = validateCategory(category);
  if (!catResult.valid) {
    return {
      success: false,
      action: 'manual_entry',
      summary: catResult.error,
      error: catResult.error,
    };
  }

  // Create a receipt extraction record for manual entries too (for audit trail)
  const idempotencyKey = `manual:${context?.sourceMessageId ?? Date.now()}`;
  const record = await receiptExtractionRepository.create({
    conversationId: context?.conversationId,
    externalUserId: context?.externalUserId,
    sourceChannel: (context?.sourceChannel ?? 'telegram') as 'telegram' | 'email' | 'admin_portal',
    sourceMessageId: context?.sourceMessageId,
    idempotencyKey,
    fileUrl: undefined,
    fileType: 'manual',
  });

  const extractedData: ReceiptExtractionData = {
    vendor: vendor!,
    transactionDate: transactionDate ?? new Date().toISOString().split('T')[0]!,
    amount: amountResult.value,
    currency: currency ?? 'USD',
    tax: null,
    suggestedCategory: catResult.value,
    confidence: 1.0,
    notes: notes ?? null,
  };

  // Persist extraction data
  await receiptExtractionRepository.updateExtraction(record.id, {
    extractedData: extractedData as any,
    confidence: 1.0,
    status: 'extracted',
  });
  await receiptExtractionRepository.setCategory(record.id, catResult.value);

  // Go straight to finalize and append
  return await finalizeAndAppend(record.id, extractedData, catResult.value, context);
}

// ── Finalize & Append ────────────────────────────────────────

async function finalizeAndAppend(
  receiptId: string,
  data: ReceiptExtractionData,
  category: string,
  context?: {
    conversationId?: string;
    externalUserId?: string;
    sourceChannel?: string;
    sourceMessageId?: string;
  },
): Promise<BookkeepingSubAgentOutput> {
  // Validate amount one more time
  const amountResult = validateAmount(data.amount);
  if (!amountResult.valid) {
    return {
      success: false,
      action: 'process_receipt',
      summary: `Cannot append: ${amountResult.error}`,
      receiptTaskId: receiptId,
      error: amountResult.error,
    };
  }

  const row: BookkeepingSheetRow = {
    timestampProcessed: new Date().toISOString(),
    sourceChannel: context?.sourceChannel ?? 'unknown',
    userExternalId: context?.externalUserId ?? 'unknown',
    vendor: data.vendor ?? 'Unknown Vendor',
    transactionDate: data.transactionDate ?? new Date().toISOString().split('T')[0]!,
    amount: amountResult.value,
    currency: data.currency ?? 'USD',
    tax: data.tax,
    category,
    originalMessageId: context?.sourceMessageId ?? '',
    receiptTaskId: receiptId,
    notes: data.notes ?? '',
  };

  try {
    const spreadsheetId = env.GOOGLE_SHEETS_BOOKKEEPING_SPREADSHEET_ID ?? '';
    const { updatedRange } = await appendBookkeepingRow(row);

    // Record the export
    await receiptExtractionRepository.createLedgerExport({
      receiptExtractionId: receiptId,
      spreadsheetId,
      rowRange: updatedRange,
      exportedData: row as any,
    });

    await receiptExtractionRepository.updateStatus(receiptId, 'exported');

    logger.info({ receiptId, updatedRange }, 'Receipt bookkeeping row appended');

    return {
      success: true,
      action: 'process_receipt',
      summary: `Receipt recorded! ${data.vendor ?? 'Unknown'} — ${row.currency} ${amountResult.value.toFixed(2)} — Category: ${category}. Row appended to bookkeeping sheet.`,
      receiptTaskId: receiptId,
      extractedData: data,
      sheetRowAppended: true,
    };
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    logger.error({ err, receiptId }, 'Failed to append bookkeeping row to Google Sheet');

    return {
      success: false,
      action: 'process_receipt',
      summary: 'Extracted the receipt data but failed to append to the Google Sheet. The data has been saved and can be retried.',
      receiptTaskId: receiptId,
      extractedData: data,
      error,
    };
  }
}

// ── Helpers ──────────────────────────────────────────────────

function buildExtractionSummary(data: ReceiptExtractionData | null, taskId: string): string {
  if (!data) return `Receipt task ${taskId} — no extraction data available.`;

  const parts: string[] = [];
  if (data.vendor) parts.push(`Vendor: ${data.vendor}`);
  if (data.amount != null) parts.push(`Amount: ${data.currency ?? '$'}${data.amount.toFixed(2)}`);
  if (data.transactionDate) parts.push(`Date: ${data.transactionDate}`);
  if (data.tax != null) parts.push(`Tax: ${data.currency ?? '$'}${data.tax.toFixed(2)}`);
  if (data.suggestedCategory) parts.push(`Suggested category: ${data.suggestedCategory}`);
  if (data.confidence < 0.5) parts.push('(low confidence — please verify)');

  return parts.length > 0
    ? `Receipt extracted:\n${parts.join('\n')}`
    : `Receipt task ${taskId} — extraction returned minimal data.`;
}
