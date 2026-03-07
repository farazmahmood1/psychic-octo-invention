import { Queue, Worker, type ConnectionOptions, type WorkerOptions } from 'bullmq';
import { logger, integrationConfigured } from '@openclaw/config';
import { env } from '@openclaw/config';
import { QUEUES, type QueueName } from '../jobs/index.js';
import { processOrchestrationJob } from '../workers/orchestration.worker.js';
import { processDeliveryJob } from '../workers/channel-delivery.worker.js';
import { processEmailJob } from '../workers/email-processing.worker.js';
import { processGhlSubAgentJob } from '../workers/ghl-sub-agent.worker.js';
import { processBookkeepingJob } from '../workers/bookkeeping.worker.js';
import { processFollowUpJob } from '../workers/followup.worker.js';

const queues = new Map<string, Queue>();
const workers: Worker[] = [];

/** Default job options applied to all queues */
const DEFAULT_JOB_OPTIONS = {
  attempts: 3,
  backoff: { type: 'exponential' as const, delay: 2000 },
  removeOnComplete: { count: 1000 },
  removeOnFail: { count: 5000 },
};

function getConnection(): ConnectionOptions | undefined {
  if (!integrationConfigured.redis()) return undefined;
  return { url: env.REDIS_URL! };
}

/** Get or create a named queue. Returns null if Redis is unconfigured. */
export function getQueue(name: QueueName): Queue | null {
  const connection = getConnection();
  if (!connection) return null;

  if (!queues.has(name)) {
    queues.set(name, new Queue(name, {
      connection,
      defaultJobOptions: DEFAULT_JOB_OPTIONS,
    }));
  }
  return queues.get(name)!;
}

/** Start all BullMQ workers. Called from worker.ts entry point. */
export function startWorkers(): Worker[] {
  const connection = getConnection();
  if (!connection) {
    logger.warn('Redis not configured — workers will not start');
    return [];
  }

  const concurrency = env.WORKER_CONCURRENCY;

  const workerDefs: Array<{ queue: string; processor: (job: any) => Promise<any> }> = [
    { queue: QUEUES.ORCHESTRATION, processor: (job) => processOrchestrationJob(job.data) },
    { queue: QUEUES.CHANNEL_DELIVERY, processor: (job) => processDeliveryJob(job.data) },
    { queue: QUEUES.EMAIL_PROCESSING, processor: (job) => processEmailJob(job.data) },
    { queue: QUEUES.GHL_SUB_AGENT, processor: (job) => processGhlSubAgentJob(job.data) },
    { queue: QUEUES.BOOKKEEPING, processor: (job) => processBookkeepingJob(job.data) },
    { queue: QUEUES.FOLLOWUP, processor: (job) => processFollowUpJob(job.data) },
  ];

  const opts: WorkerOptions = {
    connection,
    concurrency,
    limiter: { max: concurrency * 2, duration: 1000 },
  };

  for (const def of workerDefs) {
    const worker = new Worker(def.queue, def.processor, opts);

    worker.on('completed', (job) => {
      logger.info({ queue: def.queue, jobId: job?.id }, 'Job completed');
    });

    worker.on('failed', (job, err) => {
      logger.error({ queue: def.queue, jobId: job?.id, err }, 'Job failed');
    });

    worker.on('error', (err) => {
      logger.error({ queue: def.queue, err }, 'Worker error');
    });

    workers.push(worker);
  }

  logger.info({ workerCount: workers.length, concurrency }, 'BullMQ workers started');
  return workers;
}

/** Gracefully close all queues and workers. */
export async function closeQueues(): Promise<void> {
  const closePromises: Promise<void>[] = [];

  for (const worker of workers) {
    closePromises.push(worker.close());
  }
  for (const queue of queues.values()) {
    closePromises.push(queue.close());
  }

  await Promise.allSettled(closePromises);
  workers.length = 0;
  queues.clear();
}
