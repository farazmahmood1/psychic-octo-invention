// ── Lead Follow-Up Sub-Agent Types ──────────────────────────

export const FOLLOWUP_TOOL_NAME = 'lead_followup' as const;

/**
 * Priority level for follow-up recommendations.
 */
export type FollowUpPriority = 'low' | 'medium' | 'high' | 'urgent';

/**
 * Reason category for why a follow-up is recommended.
 */
export type FollowUpReason =
  | 'stale_lead'
  | 'missed_appointment'
  | 'no_reply'
  | 're_engagement'
  | 'custom';

/**
 * Status of a follow-up recommendation lifecycle.
 */
export type FollowUpStatus =
  | 'draft'
  | 'pending_review'
  | 'approved'
  | 'sent'
  | 'dismissed'
  | 'expired';

/**
 * A single lead/contact follow-up recommendation.
 */
export interface FollowUpRecommendation {
  id: string;
  contactIdentifier: string;
  contactName: string | null;
  reason: FollowUpReason;
  reasonDetail: string;
  suggestedMessage: string;
  priority: FollowUpPriority;
  nextActionDate: string;
  channel: string | null;
  status: FollowUpStatus;
  createdAt: string;
}

/**
 * Input for the lead follow-up sub-agent tool call.
 */
export interface FollowUpSubAgentInput {
  action: 'find_stale' | 'draft_followup' | 'approve_send' | 'list_pending' | 'dismiss';
  /** Contact name, email, phone, or ID for targeted follow-up */
  contactQuery?: string;
  /** Number of days since last contact to consider "stale" (default: 5) */
  staleDays?: number;
  /** Custom context or reason for follow-up */
  context?: string;
  /** Follow-up recommendation ID — used with approve_send, dismiss */
  recommendationId?: string;
  /** Preferred channel to send via (telegram, email) — used with approve_send */
  sendChannel?: string;
}

/**
 * Output from the lead follow-up sub-agent.
 */
export interface FollowUpSubAgentOutput {
  success: boolean;
  action: string;
  summary: string;
  recommendations?: FollowUpRecommendation[];
  recommendation?: FollowUpRecommendation;
  error?: string;
  needsApproval?: boolean;
  approvalQuestion?: string;
}

/**
 * Default stale threshold in days.
 */
export const FOLLOWUP_DEFAULT_STALE_DAYS = 5;

/**
 * Tone options for generated follow-up messages.
 */
export const FOLLOWUP_TONES = [
  'friendly',
  'professional',
  'gentle_reminder',
  'urgent',
] as const;
