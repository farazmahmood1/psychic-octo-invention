/**
 * Centralized queue name constants.
 * Each queue processes a different type of job.
 */
export const QUEUES = {
  /** Main orchestration queue — processes inbound events */
  ORCHESTRATION: 'orchestration',
  /** Channel delivery queue — sends outbound replies to channels */
  CHANNEL_DELIVERY: 'channel-delivery',
  /** Email processing queue — inbound email parsing + orchestration */
  EMAIL_PROCESSING: 'email-processing',
  /** GHL sub-agent queue — CRM operations */
  GHL_SUB_AGENT: 'ghl-sub-agent',
  /** Bookkeeping queue — receipt processing and sheet append */
  BOOKKEEPING: 'bookkeeping',
  /** Follow-up queue — lead follow-up and appointment recovery */
  FOLLOWUP: 'followup',
  /** Memory extraction queue — async memory processing */
  MEMORY_EXTRACTION: 'memory-extraction',
} as const;

export type QueueName = (typeof QUEUES)[keyof typeof QUEUES];
