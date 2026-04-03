/**
 * Standalone worker process entry point.
 * Runs BullMQ workers independently from the API server.
 *
 * Usage: node dist/worker.js
 */
import { logger, integrationConfigured } from '@nexclaw/config';
import { prisma } from './db/client.js';
import { closeRedis } from './db/redis.js';
import { startWorkers, closeQueues } from './queues/index.js';
import { resumePendingEmailJobs } from './workers/index.js';
import { logRuntimeWarnings } from './config/runtime-warnings.js';

const EMAIL_RECOVERY_INTERVAL_MS = 5 * 60 * 1000;

if (!integrationConfigured.redis()) {
  logger.fatal('REDIS_URL is required for the worker process');
  process.exit(1);
}

logger.info({ env: process.env['NODE_ENV'] }, 'Starting worker process...');
logRuntimeWarnings('worker');

const workers = startWorkers();

if (workers.length === 0) {
  logger.fatal('No workers started - check Redis configuration');
  process.exit(1);
}

void runEmailRecoverySweep();
const recoveryInterval = setInterval(() => {
  void runEmailRecoverySweep();
}, EMAIL_RECOVERY_INTERVAL_MS);
recoveryInterval.unref();

// Graceful shutdown
const SHUTDOWN_TIMEOUT_MS = 30_000;
let isShuttingDown = false;

async function shutdown(signal: string) {
  if (isShuttingDown) return;
  isShuttingDown = true;
  clearInterval(recoveryInterval);

  logger.info({ signal }, 'Worker received shutdown signal, draining jobs...');

  const forceTimer = setTimeout(() => {
    logger.error('Worker graceful shutdown timed out, forcing exit');
    process.exit(1);
  }, SHUTDOWN_TIMEOUT_MS);
  forceTimer.unref();

  try {
    await closeQueues();
    logger.info('Workers drained and closed');

    await closeRedis();
    logger.info('Redis closed');

    await prisma.$disconnect();
    logger.info('Database disconnected');

    process.exit(0);
  } catch (err) {
    logger.error({ err }, 'Error during worker shutdown');
    process.exit(1);
  }
}

process.on('SIGTERM', () => {
  void shutdown('SIGTERM');
});
process.on('SIGINT', () => {
  void shutdown('SIGINT');
});

process.on('unhandledRejection', (reason) => {
  logger.fatal({ reason }, 'Unhandled promise rejection in worker');
  if (!isShuttingDown) process.exit(1);
});

process.on('uncaughtException', (error) => {
  logger.fatal({ error }, 'Uncaught exception in worker');
  if (!isShuttingDown) process.exit(1);
});

async function runEmailRecoverySweep(): Promise<void> {
  try {
    const resumedCount = await resumePendingEmailJobs();
    if (resumedCount > 0) {
      logger.info({ resumedCount }, 'Resumed pending email jobs from persistent store');
    }
  } catch (err) {
    logger.error({ err }, 'Failed to resume pending email jobs');
  }
}
