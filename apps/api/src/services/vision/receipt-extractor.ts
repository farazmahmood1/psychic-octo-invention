import { logger } from '@openclaw/config';
import type { ReceiptExtractionData, LlmMessage } from '@openclaw/shared';
import { providerRegistry } from '../llm/index.js';
import { validateAmount, validateCurrency, normalizeDate } from '../../validators/bookkeeping-fields.js';

/** Vision model used for receipt extraction. Standard tier is sufficient. */
const EXTRACTION_MODEL = 'anthropic/claude-sonnet-4';

const EXTRACTION_PROMPT = `You are a receipt data extraction assistant. Analyze the receipt image and extract the following fields as JSON:

{
  "vendor": "store or business name",
  "transactionDate": "date of transaction (any format)",
  "amount": 123.45,
  "currency": "3-letter ISO code if visible or inferable",
  "tax": 12.34,
  "suggestedCategory": "best guess category from: Office Supplies, Travel, Client Meals, Team Meals, Software & Subscriptions, Marketing, Utilities, Professional Services, Equipment, Shipping, Miscellaneous",
  "confidence": 0.85,
  "notes": "any relevant notes, e.g. 'handwritten receipt' or 'multiple items'"
}

Rules:
- Return ONLY valid JSON, no markdown or explanation
- Use null for fields you cannot determine
- confidence: 0.0-1.0 reflecting how certain you are about the extraction
- If the image is not a receipt, return: {"vendor":null,"amount":null,"confidence":0,"notes":"Not a receipt"}
- For blurry/unclear images, extract what you can and note the issue
- If multiple amounts are visible, use the total/grand total
- Amount must be numeric (no currency symbols)`;

/**
 * Extract structured data from a receipt image using a vision-capable LLM.
 *
 * @param imageUrl - URL of the receipt image (e.g., from Telegram file API)
 * @param imageBase64 - Base64-encoded image data (alternative to URL)
 * @param mimeType - MIME type of the image
 */
export async function extractReceiptData(params: {
  imageUrl?: string;
  imageBase64?: string;
  mimeType?: string;
}): Promise<ReceiptExtractionData> {
  const { imageUrl, imageBase64, mimeType = 'image/jpeg' } = params;

  if (!imageUrl && !imageBase64) {
    throw new Error('Either imageUrl or imageBase64 must be provided');
  }

  const provider = providerRegistry.getDefault();

  const messages: LlmMessage[] = [
    { role: 'system', content: EXTRACTION_PROMPT },
    {
      role: 'user',
      content: 'Please extract the receipt data from this image.',
      images: [{
        url: imageUrl,
        base64: imageBase64,
        mimeType,
      }],
    },
  ];

  const response = await provider.complete({
    model: EXTRACTION_MODEL,
    messages,
    temperature: 0.1,
    maxTokens: 1000,
  });

  logger.info(
    { model: EXTRACTION_MODEL, latencyMs: response.latencyMs },
    'Receipt extraction LLM call completed',
  );

  return parseExtractionResponse(response.content);
}

/**
 * Parse the LLM's JSON response into validated ReceiptExtractionData.
 */
function parseExtractionResponse(content: string): ReceiptExtractionData {
  // Strip potential markdown code fences
  const cleaned = content
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();

  let raw: Record<string, unknown>;
  try {
    raw = JSON.parse(cleaned) as Record<string, unknown>;
  } catch {
    logger.warn({ content }, 'Failed to parse receipt extraction JSON');
    return {
      vendor: null,
      transactionDate: null,
      amount: null,
      currency: null,
      tax: null,
      suggestedCategory: null,
      confidence: 0,
      notes: 'Failed to parse extraction response',
    };
  }

  // Validate and normalize fields
  const amountResult = raw['amount'] != null ? validateAmount(raw['amount']) : null;
  const taxResult = raw['tax'] != null ? validateAmount(raw['tax']) : null;

  return {
    vendor: raw['vendor'] ? String(raw['vendor']) : null,
    transactionDate: normalizeDate(raw['transactionDate']),
    amount: amountResult?.valid ? amountResult.value : (typeof raw['amount'] === 'number' ? raw['amount'] : null),
    currency: validateCurrency(raw['currency']),
    tax: taxResult?.valid ? taxResult.value : null,
    suggestedCategory: raw['suggestedCategory'] ? String(raw['suggestedCategory']) : null,
    confidence: typeof raw['confidence'] === 'number' ? Math.min(1, Math.max(0, raw['confidence'])) : 0,
    notes: raw['notes'] ? String(raw['notes']) : null,
  };
}

/**
 * Check whether an image attachment is likely a receipt.
 * Uses a quick vision call with low token budget.
 */
export async function isLikelyReceipt(params: {
  imageUrl?: string;
  imageBase64?: string;
  mimeType?: string;
}): Promise<boolean> {
  const { imageUrl, imageBase64, mimeType = 'image/jpeg' } = params;

  if (!imageUrl && !imageBase64) return false;

  try {
    const provider = providerRegistry.getDefault();
    const response = await provider.complete({
      model: 'google/gemini-2.5-flash', // Use cheap model for classification
      messages: [
        {
          role: 'user',
          content: 'Is this image a receipt, invoice, or bill? Answer only "yes" or "no".',
          images: [{ url: imageUrl, base64: imageBase64, mimeType }],
        },
      ],
      temperature: 0,
      maxTokens: 10,
    });

    return response.content.toLowerCase().includes('yes');
  } catch (err) {
    logger.warn({ err }, 'Receipt classification failed, assuming not a receipt');
    return false;
  }
}
