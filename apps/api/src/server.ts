import { env, integrationConfigured, logger } from '@openclaw/config';
import { createApp } from './app.js';
import { prisma } from './db/client.js';
import { closeRedis } from './db/redis.js';
import { closeQueues } from './queues/index.js';
import { resumePendingEmailJobs } from './workers/index.js';
import { logRuntimeWarnings } from './config/runtime-warnings.js';
import { setWebhook } from './integrations/telegram/client.js';

const PORT = env.PORT;
const SHUTDOWN_TIMEOUT_MS = 15_000;
const EMAIL_RECOVERY_INTERVAL_MS = 5 * 60 * 1000;
const TELEGRAM_WEBHOOK_PATH = '/webhooks/telegram';

const app = createApp();

const server = app.listen(PORT, () => {
  logger.info({ port: PORT, env: env.NODE_ENV }, `API server started on port ${PORT}`);
  logRuntimeWarnings('api');
  void ensureTelegramWebhookRegistered();
  void runEmailRecoverySweep();
});

const recoveryInterval = setInterval(() => {
  void runEmailRecoverySweep();
}, EMAIL_RECOVERY_INTERVAL_MS);
recoveryInterval.unref();

// Keep-alive and header timeouts for load balancer compatibility
server.keepAliveTimeout = 65_000;
server.headersTimeout = 66_000;

// ── Graceful shutdown ──────────────────────────────────
let isShuttingDown = false;

async function shutdown(signal: string) {
  if (isShuttingDown) return;
  isShuttingDown = true;
  clearInterval(recoveryInterval);

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

process.on('SIGTERM', () => {
  void shutdown('SIGTERM');
});
process.on('SIGINT', () => {
  void shutdown('SIGINT');
});

process.on('unhandledRejection', (reason) => {
  logger.fatal({ reason }, 'Unhandled promise rejection');
  if (!isShuttingDown) process.exit(1);
});

process.on('uncaughtException', (error) => {
  logger.fatal({ error }, 'Uncaught exception');
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

async function ensureTelegramWebhookRegistered(): Promise<void> {
  if (!integrationConfigured.telegram()) {
    return;
  }

  const baseUrl = resolveTelegramWebhookBaseUrl();
  if (!baseUrl) {
    logger.warn(
      'Skipping Telegram webhook auto-registration: no valid public base URL (set API_BASE_URL or use Render external URL).',
    );
    return;
  }

  const webhookUrl = `${baseUrl}${TELEGRAM_WEBHOOK_PATH}`;

  const registered = await setWebhook(webhookUrl, {
    secretToken: env.TELEGRAM_WEBHOOK_SECRET,
    allowedUpdates: ['message'],
  });

  if (registered) {
    logger.info({ webhookUrl }, 'Telegram webhook ensured on startup');
  } else {
    logger.error({ webhookUrl }, 'Failed to ensure Telegram webhook on startup');
  }
}

function resolveTelegramWebhookBaseUrl(): string | null {
  const candidates = [env.API_BASE_URL, env.RENDER_EXTERNAL_URL, env.APP_BASE_URL];

  for (const candidate of candidates) {
    if (!candidate) continue;
    const trimmed = candidate.trim();
    if (!trimmed) continue;

    const normalized = trimmed.replace(/\/+$/, '');
    const isHttps = normalized.startsWith('https://');
    const isLocal = normalized.includes('localhost') || normalized.includes('127.0.0.1');

    if (env.NODE_ENV === 'production') {
      if (isHttps && !isLocal) {
        return normalized;
      }
      continue;
    }

    return normalized;
  }

  return null;
}
