import type {
  ChannelType,
  MessageDirection,
  MessageStatus,
  ConversationStatus,
  JobStatus,
  SubAgentTaskStatus,
  VettingResult,
  VettingReviewerType,
  SkillSourceType,
} from './enums.js';

/** Conversation summary for list views */
export interface ConversationSummary {
  id: string;
  channel: ChannelType;
  title: string | null;
  status: ConversationStatus;
  messageCount: number;
  lastMessagePreview: string | null;
  lastMessageAt: string | null;
  createdAt: string;
  updatedAt: string;
}

/** Conversation detail with participants */
export interface ConversationDetail extends ConversationSummary {
  metadata: Record<string, unknown> | null;
  participants: ParticipantSummary[];
}

/** Participant summary */
export interface ParticipantSummary {
  id: string;
  externalId: string | null;
  channel: ChannelType;
  displayName: string | null;
}

/** Message record for display */
export interface MessageRecord {
  id: string;
  conversationId: string;
  direction: MessageDirection;
  status: MessageStatus;
  content: string;
  attachments: unknown[] | null;
  metadata: Record<string, unknown> | null;
  tokenUsage: number | null;
  createdAt: string;
}

/** Skill summary for admin views */
export interface SkillSummary {
  id: string;
  slug: string;
  displayName: string;
  description: string | null;
  sourceType: SkillSourceType;
  enabled: boolean;
  currentVersion: string | null;
  latestVetting: VettingResult | null;
}

/** Skill vetting record */
export interface VettingRecord {
  id: string;
  result: VettingResult;
  reviewerType: VettingReviewerType;
  reasons: unknown;
  detectedRisks: unknown;
  codeHash: string;
  reviewerNote: string | null;
  createdAt: string;
}

/** Detected risk from static analysis */
export interface DetectedRisk {
  rule: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
  description: string;
  location: string | null;
  line: number | null;
  snippet: string | null;
}

/** Skill ingestion result */
export interface SkillIngestionResult {
  skillId: string;
  versionId: string;
  codeHash: string;
  vettingResult: VettingResult;
  detectedRisks: DetectedRisk[];
  reasons: string[];
}

/** Skill detail with version and vetting info */
export interface SkillDetail extends SkillSummary {
  sourceUrl: string | null;
  sourceRef: string | null;
  currentVersionId: string | null;
  codeHash: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: string;
  updatedAt: string;
}

/** Job summary for monitoring */
export interface JobSummary {
  id: string;
  queueName: string;
  jobType: string;
  status: JobStatus;
  attempts: number;
  maxAttempts: number;
  lastError: string | null;
  idempotencyKey: string | null;
  updatedAt: string;
  createdAt: string;
  startedAt: string | null;
  completedAt: string | null;
}

/** Sub-agent task summary */
export interface SubAgentTaskSummary {
  id: string;
  agentName: string;
  taskType: string;
  status: SubAgentTaskStatus;
  attempts: number;
  createdAt: string;
}

/** Usage/cost aggregation for dashboard */
export interface UsageAggregate {
  provider: string;
  model: string;
  totalTokens: number;
  totalCostUsd: number;
  requestCount: number;
}

/** Usage summary for the usage dashboard */
export interface UsageSummaryResponse {
  totalRequests: number;
  totalTokens: number;
  totalCostUsd: number;
  averageLatencyMs: number | null;
  byModel: UsageAggregate[];
}

/** Single timeseries bucket */
export interface UsageTimeseriesBucket {
  period: string;
  requests: number;
  tokens: number;
  costUsd: number;
}

/** Audit log entry for display */
export interface AuditLogEntry {
  id: string;
  actorType: string;
  actorId: string | null;
  action: string;
  targetType: string | null;
  targetId: string | null;
  metadata: Record<string, unknown> | null;
  ipAddress: string | null;
  createdAt: string;
}

/** Integration health status */
export interface IntegrationHealth {
  key: string;
  label: string;
  status: 'healthy' | 'degraded' | 'unconfigured' | 'error';
  message: string | null;
  checkedAt: string;
}

/** Memory record for search results */
export interface MemorySearchResult {
  id: string;
  namespace: string;
  subjectKey: string;
  summary: string | null;
  score: number | null;
  sourceConversationId: string | null;
  createdAt: string;
  updatedAt: string;
}

/** Bookkeeping extraction summary for admin view */
export interface BookkeepingExtractionSummary {
  id: string;
  fileName: string | null;
  category: string | null;
  status: string;
  confidence: number | null;
  extractedData: Record<string, unknown> | null;
  sourceChannel: string;
  errorDetails: string | null;
  exportStatus: string | null;
  createdAt: string;
  updatedAt: string;
}

/** Security event for blocked skill attempts */
export interface SecurityEvent {
  id: string;
  action: string;
  skillSlug: string | null;
  skillName: string | null;
  reason: string;
  details: Record<string, unknown> | null;
  actorId: string | null;
  ipAddress: string | null;
  createdAt: string;
}

/** Skill override history record */
export interface SkillOverrideRecord {
  id: string;
  skillId: string;
  skillName: string;
  previousResult: string;
  newResult: string;
  reason: string;
  overriddenBy: string | null;
  createdAt: string;
}

/** Model routing settings */
export interface RoutingSettings {
  primaryModel: string;
  fallbackModel: string | null;
  maxCostPerRequestUsd: number | null;
  maxMonthlyBudgetUsd: number | null;
  routingRules: RoutingRule[];
}

/** Single routing rule */
export interface RoutingRule {
  pattern: string;
  model: string;
  priority: number;
}

/** Dashboard stats */
export interface DashboardStats {
  activeConversations: number;
  messagesToday: number;
  apiCostsMtd: number;
  activeSkills: number;
}

/** Dashboard recent activity entry */
export interface RecentActivityEntry {
  id: string;
  type: string;
  description: string;
  timestamp: string;
  status: string | null;
}
