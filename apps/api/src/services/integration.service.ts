import type { IntegrationHealth } from '@nexclaw/shared';
import { integrationConfigured } from '@nexclaw/config';
import { integrationRepository } from '../repositories/integration.repository.js';
import { checkDatabaseHealth } from '../db/health.js';
import { checkRedisHealth } from '../db/redis.js';
import { verifyGhlConnection } from '../integrations/ghl/index.js';
import { verifySheetsConnection } from '../integrations/google/index.js';
import { AppError } from '../utils/app-error.js';
import { HTTP_STATUS } from '@nexclaw/shared';

interface IntegrationDef {
  key: string;
  label: string;
  configured: () => boolean;
  liveCheck?: () => Promise<boolean>;
}

const INTEGRATION_DEFS: IntegrationDef[] = [
  {
    key: 'database',
    label: 'Database (Postgres)',
    configured: () => true,
    liveCheck: checkDatabaseHealth,
  },
  {
    key: 'redis',
    label: 'Redis',
    configured: integrationConfigured.redis,
    liveCheck: checkRedisHealth,
  },
  {
    key: 'openrouter',
    label: 'OpenRouter',
    configured: integrationConfigured.openrouter,
  },
  {
    key: 'telegram',
    label: 'Telegram',
    configured: integrationConfigured.telegram,
  },
  {
    key: 'email',
    label: 'Email (SMTP)',
    configured: integrationConfigured.email,
  },
  {
    key: 'ghl',
    label: 'GoHighLevel',
    configured: integrationConfigured.ghl,
    liveCheck: verifyGhlConnection,
  },
  {
    key: 'google_sheets',
    label: 'Google Sheets',
    configured: integrationConfigured.googleSheets,
    liveCheck: verifySheetsConnection,
  },
];

/** Field definitions for each integration's configuration wizard. */
const INTEGRATION_FIELDS: Record<string, Array<{ key: string; label: string; type: 'text' | 'password' | 'url'; required: boolean; envVar: string; helpText?: string }>> = {
  openrouter: [
    { key: 'apiKey', label: 'API Key', type: 'password', required: true, envVar: 'OPENROUTER_API_KEY', helpText: 'Your OpenRouter API key from https://openrouter.ai/keys' },
  ],
  telegram: [
    { key: 'botToken', label: 'Bot Token', type: 'password', required: true, envVar: 'TELEGRAM_BOT_TOKEN', helpText: 'Token from @BotFather' },
    { key: 'webhookUrl', label: 'Webhook URL', type: 'url', required: false, envVar: 'TELEGRAM_WEBHOOK_URL', helpText: 'Public URL for receiving updates' },
  ],
  email: [
    { key: 'smtpHost', label: 'SMTP Host', type: 'text', required: true, envVar: 'SMTP_HOST' },
    { key: 'smtpPort', label: 'SMTP Port', type: 'text', required: true, envVar: 'SMTP_PORT' },
    { key: 'smtpUser', label: 'SMTP Username', type: 'text', required: true, envVar: 'SMTP_USER' },
    { key: 'smtpPass', label: 'SMTP Password', type: 'password', required: true, envVar: 'SMTP_PASS' },
    { key: 'fromAddress', label: 'From Address', type: 'text', required: true, envVar: 'EMAIL_FROM', helpText: 'e.g. noreply@yourdomain.com' },
  ],
  ghl: [
    { key: 'apiKey', label: 'GHL API Key', type: 'password', required: true, envVar: 'GHL_API_KEY' },
    { key: 'locationId', label: 'Location ID', type: 'text', required: true, envVar: 'GHL_LOCATION_ID' },
  ],
  google_sheets: [
    { key: 'serviceAccountJson', label: 'Service Account JSON', type: 'password', required: true, envVar: 'GOOGLE_SERVICE_ACCOUNT_JSON', helpText: 'Paste the full JSON key file content' },
    { key: 'spreadsheetId', label: 'Spreadsheet ID', type: 'text', required: true, envVar: 'GOOGLE_SPREADSHEET_ID' },
  ],
  redis: [
    { key: 'url', label: 'Redis URL', type: 'url', required: true, envVar: 'REDIS_URL', helpText: 'e.g. redis://localhost:6379' },
  ],
  database: [
    { key: 'url', label: 'Database URL', type: 'url', required: true, envVar: 'DATABASE_URL', helpText: 'PostgreSQL connection string' },
  ],
};

function maskValue(value: string): string {
  if (value.length <= 8) return '****';
  return value.slice(0, 4) + '****' + value.slice(-4);
}

export async function getIntegrationConfig(key: string) {
  const fields = INTEGRATION_FIELDS[key];
  if (!fields) {
    throw new AppError(HTTP_STATUS.NOT_FOUND, 'NOT_FOUND', `Integration "${key}" not found`);
  }

  return {
    key,
    fields: fields.map((f) => {
      const envValue = process.env[f.envVar];
      return {
        key: f.key,
        label: f.label,
        type: f.type,
        required: f.required,
        helpText: f.helpText ?? null,
        configured: !!envValue,
        maskedValue: envValue ? maskValue(envValue) : null,
      };
    }),
  };
}

export async function saveIntegrationConfig(key: string, values: Record<string, string>) {
  const fieldDefs = INTEGRATION_FIELDS[key];
  if (!fieldDefs) {
    throw new AppError(HTTP_STATUS.NOT_FOUND, 'NOT_FOUND', `Integration "${key}" not found`);
  }

  // Validate required fields
  for (const f of fieldDefs) {
    if (f.required && !values[f.key] && !process.env[f.envVar]) {
      throw new AppError(HTTP_STATUS.BAD_REQUEST, 'VALIDATION_ERROR', `Field "${f.label}" is required`);
    }
  }

  // Set environment variables (runtime only — restart will lose these)
  for (const f of fieldDefs) {
    const val = values[f.key];
    if (val !== undefined && val !== '') {
      process.env[f.envVar] = val;
    }
  }

  // Update DB integration record if it exists
  try {
    await integrationRepository.upsert(key, { status: 'active' as const, lastError: null });
  } catch {
    // Repository may not support upsert for all keys — that's fine
  }

  return { success: true, message: `Configuration for "${key}" saved. Note: these settings are applied at runtime and will reset on server restart. For persistence, update your .env file.` };
}

export async function getIntegrationHealth(): Promise<IntegrationHealth[]> {
  const now = new Date().toISOString();
  const dbIntegrations = await integrationRepository.listAll();
  const dbMap = new Map(dbIntegrations.map((i) => [i.name, i]));

  const results: IntegrationHealth[] = [];

  for (const def of INTEGRATION_DEFS) {
    if (!def.configured()) {
      results.push({
        key: def.key,
        label: def.label,
        status: 'unconfigured',
        message: 'Required environment variables are not set.',
        checkedAt: now,
      });
      continue;
    }

    // Run live check if available
    if (def.liveCheck) {
      try {
        const ok = await def.liveCheck();
        results.push({
          key: def.key,
          label: def.label,
          status: ok ? 'healthy' : 'error',
          message: ok ? `${def.label} connection is active.` : `${def.label} connection failed.`,
          checkedAt: now,
        });
      } catch {
        results.push({
          key: def.key,
          label: def.label,
          status: 'error',
          message: `${def.label} connection failed.`,
          checkedAt: now,
        });
      }
      continue;
    }

    // Use DB integration record if available
    const dbRecord = dbMap.get(def.key);
    if (dbRecord) {
      const status = dbRecord.status === 'active' ? 'healthy'
        : dbRecord.status === 'error' ? 'error'
          : 'degraded';
      results.push({
        key: def.key,
        label: def.label,
        status,
        message: dbRecord.lastError ?? null,
        checkedAt: dbRecord.lastSyncAt?.toISOString() ?? now,
      });
      continue;
    }

    // Configured but no DB record — assume healthy (credentials present)
    results.push({
      key: def.key,
      label: def.label,
      status: 'healthy',
      message: 'Configured (credential presence check). Live connectivity is validated during runtime calls.',
      checkedAt: now,
    });
  }

  return results;
}
