import { z } from 'zod';

export const paginationQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(20),
});

/** Password must be 12-128 chars with uppercase, lowercase, number, and symbol */
export const passwordSchema = z
  .string()
  .min(12, 'Password must be at least 12 characters')
  .max(128, 'Password must be at most 128 characters')
  .regex(/[A-Z]/, 'Password must contain at least one uppercase letter')
  .regex(/[a-z]/, 'Password must contain at least one lowercase letter')
  .regex(/[0-9]/, 'Password must contain at least one number')
  .regex(/[^A-Za-z0-9]/, 'Password must contain at least one symbol');

export const loginRequestSchema = z.object({
  email: z.string().email().transform((v) => v.toLowerCase()),
  password: z.string().min(1).max(128),
});

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1).max(128),
  newPassword: passwordSchema,
});

// ── Enum schemas for runtime validation ──────────────

export const channelTypeSchema = z.enum(['telegram', 'email', 'admin_portal']);
export const messageDirectionSchema = z.enum(['inbound', 'outbound']);
export const messageStatusSchema = z.enum(['pending', 'sent', 'delivered', 'failed', 'received']);
export const conversationStatusSchema = z.enum(['active', 'archived', 'closed']);
export const jobStatusSchema = z.enum(['pending', 'running', 'completed', 'failed', 'retrying', 'cancelled']);
export const adminRoleSchema = z.enum(['super_admin', 'admin', 'viewer']);
export const vettingResultSchema = z.enum(['passed', 'failed', 'warning', 'pending']);
export const subAgentTaskStatusSchema = z.enum(['queued', 'running', 'completed', 'failed', 'cancelled']);
export const integrationStatusSchema = z.enum(['active', 'inactive', 'error']);

// ── Query filter schemas ─────────────────────────────

export const conversationListQuerySchema = paginationQuerySchema.extend({
  channel: channelTypeSchema.optional(),
  status: conversationStatusSchema.optional(),
  participantExternalId: z.string().optional(),
  dateFrom: z.coerce.date().optional(),
  dateTo: z.coerce.date().optional(),
});

export const messageListQuerySchema = paginationQuerySchema.extend({
  direction: messageDirectionSchema.optional(),
  status: messageStatusSchema.optional(),
});

export const auditLogQuerySchema = paginationQuerySchema.extend({
  action: z.string().optional(),
  actorId: z.string().optional(),
  targetType: z.string().optional(),
});

export const usageLogQuerySchema = paginationQuerySchema.extend({
  provider: z.string().optional(),
  model: z.string().optional(),
});

export const usageSummaryQuerySchema = z.object({
  dateFrom: z.coerce.date().optional(),
  dateTo: z.coerce.date().optional(),
  provider: z.string().optional(),
  model: z.string().optional(),
});

export const usageTimeseriesQuerySchema = z.object({
  dateFrom: z.coerce.date().optional(),
  dateTo: z.coerce.date().optional(),
  granularity: z.enum(['hour', 'day', 'week']).default('day'),
  provider: z.string().optional(),
  model: z.string().optional(),
});

export const jobListQuerySchema = paginationQuerySchema.extend({
  status: jobStatusSchema.optional(),
  queueName: z.string().optional(),
});

export const memorySearchQuerySchema = paginationQuerySchema.extend({
  namespace: z.string().optional(),
  subjectKey: z.string().optional(),
  q: z.string().optional(),
});

export const skillToggleSchema = z.object({
  enabled: z.boolean(),
});

export const skillIngestSchema = z.object({
  slug: z.string().min(1).max(100).regex(/^[a-z0-9-]+$/, 'Slug must be lowercase alphanumeric with hyphens'),
  displayName: z.string().min(1).max(200),
  description: z.string().max(2000).optional(),
  sourceType: z.enum(['builtin', 'uploaded', 'git_repo', 'marketplace']),
  sourceUrl: z.string().url().max(2000).optional(),
  sourceRef: z.string().max(200).optional(),
  version: z.string().min(1).max(50),
  source: z.string().min(1).max(500000),
  metadata: z.record(z.unknown()).optional(),
});

export const skillManualOverrideSchema = z.object({
  result: z.enum(['passed', 'warning']),
  reason: z.string().min(10).max(2000),
});

export const routingSettingsSchema = z.object({
  primaryModel: z.string().min(1).max(200),
  fallbackModel: z.string().min(1).max(200).optional(),
  maxCostPerRequestUsd: z.number().positive().max(10).optional(),
  maxMonthlyBudgetUsd: z.number().positive().max(100000).optional(),
  routingRules: z.array(z.object({
    pattern: z.string(),
    model: z.string(),
    priority: z.number().int().min(0).max(100),
  })).optional(),
});

export const firstPartyToolSettingsSchema = z.object({
  ghlCrmEnabled: z.boolean(),
  bookkeepingReceiptEnabled: z.boolean(),
  leadFollowupEnabled: z.boolean(),
});

export type PaginationQuery = z.output<typeof paginationQuerySchema>;
export type ConversationListQuery = z.output<typeof conversationListQuerySchema>;
export type MessageListQuery = z.output<typeof messageListQuerySchema>;
export type AuditLogQuery = z.output<typeof auditLogQuerySchema>;
export type UsageLogQuery = z.output<typeof usageLogQuerySchema>;
export type UsageSummaryQuery = z.output<typeof usageSummaryQuerySchema>;
export type UsageTimeseriesQuery = z.output<typeof usageTimeseriesQuerySchema>;
export type JobListQuery = z.output<typeof jobListQuerySchema>;
export type MemorySearchQuery = z.output<typeof memorySearchQuerySchema>;
export type SkillToggleInput = z.output<typeof skillToggleSchema>;
export type SkillIngestInput = z.output<typeof skillIngestSchema>;
export type SkillManualOverrideInput = z.output<typeof skillManualOverrideSchema>;
export type RoutingSettingsInput = z.output<typeof routingSettingsSchema>;
export type FirstPartyToolSettingsInput = z.output<typeof firstPartyToolSettingsSchema>;
export type ChangePasswordInput = z.output<typeof changePasswordSchema>;

export const bookkeepingListQuerySchema = paginationQuerySchema.extend({
  status: z.enum(['pending', 'extracted', 'exported', 'failed']).optional(),
  category: z.string().optional(),
});
export type BookkeepingListQuery = z.output<typeof bookkeepingListQuerySchema>;

export const securityEventsQuerySchema = paginationQuerySchema.extend({
  action: z.string().optional(),
});
export type SecurityEventsQuery = z.output<typeof securityEventsQuerySchema>;
