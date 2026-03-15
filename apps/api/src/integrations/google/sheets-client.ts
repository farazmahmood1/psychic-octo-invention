import { env, logger } from '@openclaw/config';
import type { BookkeepingSheetRow } from '@openclaw/shared';

// ── Types ────────────────────────────────────────────────────

interface ServiceAccountCredentials {
  client_email: string;
  private_key: string;
  token_uri?: string;
}

interface TokenCache {
  accessToken: string;
  expiresAt: number;
}

// ── Constants ────────────────────────────────────────────────

const SCOPES = 'https://www.googleapis.com/auth/spreadsheets';
const TOKEN_URI = 'https://oauth2.googleapis.com/token';
const SHEETS_API = 'https://sheets.googleapis.com/v4/spreadsheets';
const REQUEST_TIMEOUT = 30_000;
const MAX_RETRIES = 2;

// ── Token Management ─────────────────────────────────────────

let tokenCache: TokenCache | null = null;

function parseServiceAccount(): ServiceAccountCredentials {
  let parsed: unknown;
  try {
    parsed = JSON.parse(env.GOOGLE_SERVICE_ACCOUNT_JSON ?? '{}');
  } catch {
    throw new Error('Invalid GOOGLE_SERVICE_ACCOUNT_JSON — must be valid JSON');
  }

  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new Error('GOOGLE_SERVICE_ACCOUNT_JSON must be a JSON object');
  }

  const record = parsed as Record<string, unknown>;
  const clientEmail = typeof record['client_email'] === 'string' ? record['client_email'].trim() : '';
  const privateKeyRaw = typeof record['private_key'] === 'string' ? record['private_key'] : '';
  const tokenUri = typeof record['token_uri'] === 'string' ? record['token_uri'].trim() : undefined;

  if (!clientEmail || !privateKeyRaw) {
    throw new Error('GOOGLE_SERVICE_ACCOUNT_JSON must include client_email and private_key');
  }

  const privateKey = privateKeyRaw.replace(/\\n/g, '\n').trim();
  if (!privateKey.includes('BEGIN PRIVATE KEY')) {
    throw new Error('GOOGLE_SERVICE_ACCOUNT_JSON.private_key must be a PEM private key');
  }

  return {
    client_email: clientEmail,
    private_key: privateKey,
    token_uri: tokenUri,
  };
}

/**
 * Create a JWT and exchange it for a Google OAuth2 access token.
 * Uses the service account credentials from env.
 */
async function getAccessToken(): Promise<string> {
  if (tokenCache && tokenCache.expiresAt > Date.now() + 60_000) {
    return tokenCache.accessToken;
  }

  const creds = parseServiceAccount();
  const now = Math.floor(Date.now() / 1000);
  const jwt = await createSignedJwt(creds, now);

  const res = await fetch(creds.token_uri ?? TOKEN_URI, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: jwt,
    }),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Google OAuth token exchange failed (${res.status}): ${text}`);
  }

  const data = (await res.json()) as { access_token: string; expires_in: number };
  tokenCache = {
    accessToken: data.access_token,
    expiresAt: Date.now() + data.expires_in * 1000,
  };

  return tokenCache.accessToken;
}

/**
 * Create a signed JWT for Google service account auth.
 * Uses Web Crypto API (available in Node 18+).
 */
async function createSignedJwt(creds: ServiceAccountCredentials, nowSec: number): Promise<string> {
  const header = base64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const payload = base64url(JSON.stringify({
    iss: creds.client_email,
    scope: SCOPES,
    aud: creds.token_uri ?? TOKEN_URI,
    iat: nowSec,
    exp: nowSec + 3600,
  }));

  const signingInput = `${header}.${payload}`;

  // Import the PEM private key
  const pemBody = creds.private_key
    .replace(/-----BEGIN (?:RSA )?PRIVATE KEY-----/g, '')
    .replace(/-----END (?:RSA )?PRIVATE KEY-----/g, '')
    .replace(/\s/g, '');

  const keyBuffer = Buffer.from(pemBody, 'base64');
  const cryptoKey = await crypto.subtle.importKey(
    'pkcs8',
    keyBuffer,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign'],
  );

  const signature = await crypto.subtle.sign(
    'RSASSA-PKCS1-v1_5',
    cryptoKey,
    new TextEncoder().encode(signingInput),
  );

  return `${signingInput}.${base64url(Buffer.from(signature))}`;
}

function base64url(input: string | Buffer): string {
  const buf = typeof input === 'string' ? Buffer.from(input) : input;
  return buf.toString('base64url');
}

// ── Sheets API Calls ─────────────────────────────────────────

async function sheetsRequest(
  path: string,
  options: RequestInit,
  retries = MAX_RETRIES,
): Promise<Response> {
  const token = await getAccessToken();
  const url = `${SHEETS_API}/${path}`;

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetch(url, {
        ...options,
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
          ...options.headers,
        },
        signal: AbortSignal.timeout(REQUEST_TIMEOUT),
      });

      if (res.ok) return res;

      // Don't retry on 4xx (except 429)
      if (res.status < 500 && res.status !== 429) {
        const text = await res.text().catch(() => '');
        throw new SheetsApiError(`Sheets API error (${res.status}): ${text}`, res.status);
      }

      if (attempt < retries) {
        const delay = (attempt + 1) * 1000;
        await new Promise((r) => setTimeout(r, delay));
      } else {
        const text = await res.text().catch(() => '');
        throw new SheetsApiError(`Sheets API error after retries (${res.status}): ${text}`, res.status);
      }
    } catch (err) {
      if (err instanceof SheetsApiError) throw err;
      if (attempt >= retries) throw err;
      await new Promise((r) => setTimeout(r, (attempt + 1) * 1000));
    }
  }

  throw new Error('Unreachable');
}

export class SheetsApiError extends Error {
  constructor(message: string, public readonly statusCode: number) {
    super(message);
    this.name = 'SheetsApiError';
  }
}

// ── Public API ───────────────────────────────────────────────

/**
 * Append a bookkeeping row to the configured Google Sheet.
 * Returns the updated range (e.g., "Sheet1!A25:L25").
 */
export async function appendBookkeepingRow(
  row: BookkeepingSheetRow,
  sheetName = 'Sheet1',
): Promise<{ updatedRange: string }> {
  const spreadsheetId = env.GOOGLE_SHEETS_BOOKKEEPING_SPREADSHEET_ID;
  const range = `${sheetName}!A:L`;

  const values = [
    [
      row.timestampProcessed,
      row.sourceChannel,
      row.userExternalId,
      row.vendor,
      row.transactionDate,
      row.amount,
      row.currency,
      row.tax ?? '',
      row.category,
      row.originalMessageId,
      row.receiptTaskId,
      row.notes,
    ],
  ];

  const res = await sheetsRequest(
    `${spreadsheetId}/values/${encodeURIComponent(range)}:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`,
    {
      method: 'POST',
      body: JSON.stringify({ values }),
    },
  );

  const data = (await res.json()) as { updates?: { updatedRange?: string } };
  const updatedRange = data.updates?.updatedRange ?? 'unknown';

  logger.info({ spreadsheetId, updatedRange }, 'Appended bookkeeping row to Google Sheet');
  return { updatedRange };
}

/**
 * Verify that the Google Sheets connection works and the spreadsheet is accessible.
 */
export async function verifySheetsConnection(): Promise<boolean> {
  try {
    const spreadsheetId = env.GOOGLE_SHEETS_BOOKKEEPING_SPREADSHEET_ID;
    const res = await sheetsRequest(
      `${spreadsheetId}?fields=properties.title`,
      { method: 'GET' },
    );
    const data = (await res.json()) as { properties?: { title?: string } };
    logger.info({ title: data.properties?.title }, 'Google Sheets connection verified');
    return true;
  } catch (err) {
    logger.error({ err }, 'Google Sheets connection verification failed');
    return false;
  }
}
