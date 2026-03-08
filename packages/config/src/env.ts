import { z } from 'zod';

/**
 * Environment variable schema.
 *
 * Core variables (DATABASE_URL, REDIS_URL, SESSION_SECRET) are required.
 * Integration-specific variables are optional — the system boots in
 * degraded mode when a provider is unconfigured rather than crashing.
 */
const envSchema = z.object({
  // Core
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().default(4000),

  // Database (required)
  DATABASE_URL: z.string().url(),
  REDIS_URL: z.string().url().optional(),

  // Auth (required)
  SESSION_SECRET: z.string().min(32),
  ADMIN_SEED_EMAIL: z.string().email().optional(),
  ADMIN_SEED_PASSWORD: z.string().min(8).optional(),

  // AI (optional — degraded without LLM)
  OPENROUTER_API_KEY: z.string().min(1).optional(),
  OPENROUTER_BASE_URL: z.string().url().default('https://openrouter.ai/api/v1'),

  // Telegram (optional — degraded without bot)
  TELEGRAM_BOT_TOKEN: z.string().min(1).optional(),
  TELEGRAM_WEBHOOK_SECRET: z.string().min(16).optional(),

  // Email (optional — degraded without SMTP)
  INBOUND_EMAIL_WEBHOOK_SECRET: z.string().min(16).optional(),
  SMTP_HOST: z.string().min(1).optional(),
  SMTP_PORT: z.coerce.number().default(587),
  SMTP_USER: z.string().min(1).optional(),
  SMTP_PASS: z.string().min(1).optional(),
  SMTP_FROM: z.string().min(1).optional(),

  // GHL (optional — degraded without CRM)
  GHL_API_BASE_URL: z.string().url().default('https://rest.gohighlevel.com/v1'),
  GHL_API_TOKEN: z.string().min(1).optional(),

  // Google Sheets (optional — degraded without bookkeeping)
  GOOGLE_SERVICE_ACCOUNT_JSON: z.string().min(1).optional(),
  GOOGLE_SHEETS_BOOKKEEPING_SPREADSHEET_ID: z.string().min(1).optional(),

  // URLs
  APP_BASE_URL: z.string().url().default('http://localhost:4000'),
  ADMIN_APP_URL: z.string().url().default('http://localhost:5173'),
  API_BASE_URL: z.string().url().default('http://localhost:4000'),

  // Worker
  WORKER_CONCURRENCY: z.coerce.number().min(1).max(50).default(5),

  // Request limits
  REQUEST_TIMEOUT_MS: z.coerce.number().default(30_000),
  MAX_PAYLOAD_SIZE: z.string().default('2mb'),
});

export type Env = z.infer<typeof envSchema>;

function loadEnv(): Env {
  // In test mode, skip validation — tests set their own env vars
  if (process.env['NODE_ENV'] === 'test') {
    return envSchema.parse(process.env);
  }

  const result = envSchema.safeParse(process.env);
  if (!result.success) {
    const formatted = result.error.flatten().fieldErrors;
    console.error('Invalid environment variables:', JSON.stringify(formatted, null, 2));
    process.exit(1);
  }
  return result.data;
}

export const env = loadEnv();

function hasConfiguredValue(value: string | undefined): boolean {
  if (!value) return false;
  const normalized = value.trim().toLowerCase();
  if (!normalized) return false;
  return !normalized.startsWith('change-me');
}

/** Check whether a specific integration has its required config */
export const integrationConfigured = {
  redis: () => !!env.REDIS_URL,
  openrouter: () => hasConfiguredValue(env.OPENROUTER_API_KEY),
  telegram: () => hasConfiguredValue(env.TELEGRAM_BOT_TOKEN) && hasConfiguredValue(env.TELEGRAM_WEBHOOK_SECRET),
  email: () => !!env.SMTP_HOST && !!env.SMTP_USER && !!env.SMTP_PASS && !!env.SMTP_FROM,
  emailWebhook: () => hasConfiguredValue(env.INBOUND_EMAIL_WEBHOOK_SECRET),
  ghl: () => hasConfiguredValue(env.GHL_API_TOKEN),
  googleSheets: () => !!env.GOOGLE_SERVICE_ACCOUNT_JSON && !!env.GOOGLE_SHEETS_BOOKKEEPING_SPREADSHEET_ID,
} as const;
