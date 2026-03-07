import { Router } from 'express';
import { SERVICE_NAME } from '@openclaw/shared';
import { integrationConfigured } from '@openclaw/config';
import { checkDatabaseHealth, checkRedisHealth } from '../db/index.js';

export const healthRouter = Router();

const startTime = Date.now();

/** Liveness probe — confirms the process is running */
healthRouter.get('/', (_req, res) => {
  res.json({
    status: 'ok',
    service: SERVICE_NAME,
    uptime: Math.floor((Date.now() - startTime) / 1000),
    environment: process.env['NODE_ENV'] || 'development',
    timestamp: new Date().toISOString(),
  });
});

/** Readiness probe — includes database and Redis connectivity checks */
healthRouter.get('/ready', async (_req, res) => {
  const checks: Record<string, 'ok' | 'unavailable' | 'unconfigured'> = {};

  checks['database'] = (await checkDatabaseHealth()) ? 'ok' : 'unavailable';

  if (integrationConfigured.redis()) {
    checks['redis'] = (await checkRedisHealth()) ? 'ok' : 'unavailable';
  } else {
    checks['redis'] = 'unconfigured';
  }

  // Only database and redis are critical for readiness
  const critical = [checks['database'], checks['redis']];
  const allHealthy = critical.every((v) => v === 'ok' || v === 'unconfigured');

  res.status(allHealthy ? 200 : 503).json({
    status: allHealthy ? 'ready' : 'degraded',
    service: SERVICE_NAME,
    checks,
    timestamp: new Date().toISOString(),
  });
});
