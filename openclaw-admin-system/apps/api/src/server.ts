import { logger } from '@openclaw/config';
import { createApp } from './app.js';
import { prisma } from './db/client.js';
import { closeRedis } from './db/redis.js';
import { closeQueues } from './queues/index.js';

const PORT = Number(process.env['PORT']) || 4000;
const SHUTDOWN_TIMEOUT_MS = 15_000;

const app = createApp();

const server = app.listen(PORT, () => {
  logger.info({ port: PORT, env: process.env['NODE_ENV'] }, `API server started on port ${PORT}`);
});

// Keep-alive and header timeouts for load balancer compatibility
server.keepAliveTimeout = 65_000;
server.headersTimeout = 66_000;

// ── Graceful shutdown ──────────────────────────────────
let isShuttingDown = false;

async function shutdown(signal: string) {
  if (isShuttingDown) return;
  isShuttingDown = true;

  logger.info({ signal }, 'Received shutdown signal, closing gracefully...');

  // Force exit after timeout
  const forceTimer = setTimeout(() => {
    logger.error('Graceful shutdown timed out, forcing exit');
    process.exit(1);
  }, SHUTDOWN_TIMEOUT_MS);
  forceTimer.unref();

  try {
    // 1. Stop accepting new connections
    await new Promise<void>((resolve, reject) => {
      server.close((err) => (err ? reject(err) : resolve()));
    });
    logger.info('HTTP server closed');

    // 2. Close BullMQ queues
    await closeQueues();
    logger.info('Queues closed');

    // 3. Close Redis
    await closeRedis();
    logger.info('Redis closed');

    // 4. Close Prisma
    await prisma.$disconnect();
    logger.info('Database disconnected');

    process.exit(0);
  } catch (err) {
    logger.error({ err }, 'Error during graceful shutdown');
    process.exit(1);
  }
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

process.on('unhandledRejection', (reason) => {
  logger.fatal({ reason }, 'Unhandled promise rejection');
  if (!isShuttingDown) process.exit(1);
});

process.on('uncaughtException', (error) => {
  logger.fatal({ error }, 'Uncaught exception');
  if (!isShuttingDown) process.exit(1);
});
