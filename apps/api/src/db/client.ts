import { PrismaClient } from '@prisma/client';
import { logger } from '@openclaw/config';

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient | undefined };

/** Singleton Prisma client — reused across hot reloads in development */
export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log:
      process.env['NODE_ENV'] === 'development'
        ? ['query', 'warn', 'error']
        : ['error'],
  });

if (process.env['NODE_ENV'] !== 'production') {
  globalForPrisma.prisma = prisma;
}

/** Log connection lifecycle events */
prisma.$connect()
  .then(() => logger.info('Prisma client connected'))
  .catch((err: unknown) => logger.error({ err }, 'Prisma client connection failed'));

export type { PrismaClient };
