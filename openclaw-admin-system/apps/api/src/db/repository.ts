import { prisma } from './client.js';

/**
 * Base repository providing typed access to Prisma models.
 * Individual domain repositories extend this with domain-specific queries.
 */
export abstract class BaseRepository {
  protected get db() {
    return prisma;
  }
}
