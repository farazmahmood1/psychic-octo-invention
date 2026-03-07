import { Redis } from 'ioredis';
import { env, logger, integrationConfigured } from '@openclaw/config';

let redis: Redis | null = null;

/** Get or create the Redis singleton connection. Returns null if unconfigured. */
export function getRedis(): Redis | null {
  if (!integrationConfigured.redis()) return null;

  if (!redis) {
    redis = new Redis(env.REDIS_URL!, {
      maxRetriesPerRequest: null, // required by BullMQ
      enableReadyCheck: true,
      retryStrategy(times) {
        const delay = Math.min(times * 200, 5000);
        return delay;
      },
    });

    redis.on('connect', () => logger.info('Redis connected'));
    redis.on('error', (err) => logger.error({ err }, 'Redis connection error'));
    redis.on('close', () => logger.warn('Redis connection closed'));
  }

  return redis;
}

/** Check Redis connectivity. Returns false if unconfigured or unreachable. */
export async function checkRedisHealth(): Promise<boolean> {
  const client = getRedis();
  if (!client) return false;

  try {
    const result = await Promise.race([
      client.ping(),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('Redis health check timed out')), 3000),
      ),
    ]);
    return result === 'PONG';
  } catch {
    return false;
  }
}

/** Gracefully close Redis connection. */
export async function closeRedis(): Promise<void> {
  if (redis) {
    await redis.quit().catch(() => {});
    redis = null;
  }
}
