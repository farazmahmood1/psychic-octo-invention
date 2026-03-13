/**
 * Shared enum types mirroring Prisma schema enums.
 * These are safe to use in both frontend and backend without importing Prisma.
 */

export type ChannelType = 'telegram' | 'email' | 'admin_portal';

export type MessageDirection = 'inbound' | 'outbound';

export type MessageStatus = 'pending' | 'sent' | 'delivered' | 'failed' | 'received';

export type ConversationStatus = 'active' | 'archived' | 'closed';

export type SkillSourceType = 'builtin' | 'uploaded' | 'git_repo' | 'marketplace';

export type VettingResult = 'passed' | 'failed' | 'warning' | 'pending';

export type VettingReviewerType = 'system' | 'manual';

export type JobStatus = 'pending' | 'running' | 'completed' | 'failed' | 'retrying' | 'cancelled';

export type IntegrationStatus = 'active' | 'inactive' | 'error';

export type ReceiptStatus = 'pending' | 'extracted' | 'exported' | 'failed';

export type LedgerExportStatus = 'pending' | 'exported' | 'failed';

export type GhlActionType =
  | 'search_contact'
  | 'get_contact'
  | 'create_contact'
  | 'update_contact'
  | 'create_opportunity'
  | 'add_note'
  | 'send_sms'
  | 'custom';

export type SubAgentTaskStatus = 'queued' | 'running' | 'completed' | 'failed' | 'cancelled';
