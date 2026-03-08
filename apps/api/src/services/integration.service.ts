import type { IntegrationHealth } from '@openclaw/shared';
import { integrationConfigured } from '@openclaw/config';
import { integrationRepository } from '../repositories/integration.repository.js';
import { checkDatabaseHealth } from '../db/health.js';
import { checkRedisHealth } from '../db/redis.js';

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
  },
  {
    key: 'google_sheets',
    label: 'Google Sheets',
    configured: integrationConfigured.googleSheets,
  },
];

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
