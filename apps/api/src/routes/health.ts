import { Router } from 'express';
import type { Response } from 'express';
import { SERVICE_NAME } from '@openclaw/shared';
import { integrationConfigured } from '@openclaw/config';
import { checkDatabaseHealth, checkRedisHealth } from '../db/index.js';

export const healthRouter = Router();

const startTime = Date.now();

/** Liveness probe: confirms the process is running */
healthRouter.get('/', (_req, res) => {
  res.json({
    status: 'ok',
    service: SERVICE_NAME,
    uptime: Math.floor((Date.now() - startTime) / 1000),
    environment: process.env['NODE_ENV'] || 'development',
    timestamp: new Date().toISOString(),
  });
});

/** Readiness probe: includes database and Redis connectivity checks */
healthRouter.get('/ready', (_req, res) => {
  void handleReadiness(res);
});

async function handleReadiness(res: Response): Promise<void> {
  const checks: Record<string, 'ok' | 'unavailable' | 'unconfigured'> = {};
  const queueMode = integrationConfigured.redis() ? 'redis_queue' : 'fallback_in_process';

  checks['database'] = (await checkDatabaseHealth()) ? 'ok' : 'unavailable';

  if (integrationConfigured.redis()) {
    checks['redis'] = (await checkRedisHealth()) ? 'ok' : 'unavailable';
  } else {
    checks['redis'] = 'unconfigured';
  }

  const critical = [checks['database'], checks['redis']];
  const allHealthy = critical.every((value) => value === 'ok' || value === 'unconfigured');

  res.status(allHealthy ? 200 : 503).json({
    status: allHealthy ? 'ready' : 'degraded',
    service: SERVICE_NAME,
    queueMode,
    checks,
    notes: queueMode === 'fallback_in_process'
      ? ['Redis is not configured. API fallback mode is active; run Redis + worker for strongest reliability.']
      : [],
    timestamp: new Date().toISOString(),
  });
}
