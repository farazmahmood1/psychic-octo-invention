import type { ChannelType } from './enums.js';

// ── Inbound Event (channel-agnostic normalized input) ────────

export interface InboundEvent {
  /** Source channel: telegram, email, admin_portal */
  channel: ChannelType;
  /** External user identifier on the source channel */
  externalUserId: string;
  /** Display name of the sender, if available */
  externalUserName: string | null;
  /** Thread/conversation identifier from the source channel */
  externalThreadId: string;
  /** Internal conversation ID if already resolved */
  conversationId?: string;
  /** Text content of the message */
  text: string;
  /** Attachments (images, files, etc.) */
  attachments: Attachment[];
  /** ISO timestamp of when the event occurred on the channel */
  timestamp: string;
  /** Channel-specific metadata (telegram update, email headers, etc.) */
  metadata: Record<string, unknown>;
}

export interface Attachment {
  type: 'image' | 'document' | 'audio' | 'video' | 'unknown';
  url: string | null;
  /** Base64-encoded content for inline data */
  base64: string | null;
  mimeType: string | null;
  fileName: string | null;
  sizeBytes: number | null;
}

// ── Model Routing ────────────────────────────────────────────

export type ModelTier = 'cheap' | 'standard' | 'strong';

export interface RoutingDecision {
  /** Selected model identifier (e.g. "google/gemini-2.5-flash") */
  model: string;
  /** The tier classification of the selected model */
  tier: ModelTier;
  /** Provider name (e.g. "openrouter") */
  provider: string;
  /** Why this model was selected */
  reason: string;
  /** Individual signal scores that informed the decision */
  signals: RoutingSignals;
  /** Whether this was an escalation from a cheaper model */
  escalatedFrom: string | null;
}

export interface RoutingSignals {
  messageLength: number;
  hasAttachments: boolean;
  requiresVision: boolean;
  requiresToolUse: boolean;
  estimatedComplexity: 'low' | 'medium' | 'high';
  hasFollowUpNeed: boolean;
}

// ── LLM Provider Abstraction ─────────────────────────────────

export interface LlmMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  /** For vision: inline image data */
  images?: LlmImage[];
  /** Tool call ID (for role=tool responses) */
  toolCallId?: string;
  /** Tool calls made by the assistant (for role=assistant with tool use) */
  toolCalls?: LlmToolCall[];
}

export interface LlmImage {
  url?: string;
  base64?: string;
  mimeType: string;
}

export interface LlmToolDefinition {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}

export interface LlmRequest {
  model: string;
  messages: LlmMessage[];
  tools?: LlmToolDefinition[];
  temperature?: number;
  maxTokens?: number;
  /** Provider-specific overrides */
  providerOptions?: Record<string, unknown>;
}

export interface LlmResponse {
  content: string;
  toolCalls: LlmToolCall[];
  usage: LlmUsage;
  model: string;
  finishReason: 'stop' | 'tool_calls' | 'length' | 'error';
  latencyMs: number;
}

export interface LlmToolCall {
  id: string;
  name: string;
  arguments: string;
}

export interface LlmUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  /** Estimated cost in USD, if computable */
  estimatedCostUsd: number | null;
}

// ── Memory Types ─────────────────────────────────────────────

export interface MemoryFact {
  id?: string;
  namespace: string;
  subjectKey: string;
  value: Record<string, unknown>;
  summary: string;
  /** Importance score: 0.0 (trivial) to 1.0 (critical) */
  importance: number;
  sourceConversationId?: string;
  sourceMessageId?: string;
  expiresAt?: string;
}

export interface MemorySnippet {
  id: string;
  namespace: string;
  subjectKey: string;
  summary: string;
  score: number;
  createdAt: string;
}

// ── Tool / Sub-Agent Dispatch ────────────────────────────────

export interface ToolDispatch {
  toolName: string;
  arguments: Record<string, unknown>;
  /** Result from tool execution, filled after dispatch */
  result?: string;
  status: 'pending' | 'completed' | 'failed';
  error?: string;
}

export interface SubAgentDispatch {
  agentName: string;
  taskType: string;
  input: Record<string, unknown>;
  status: 'queued' | 'completed' | 'failed';
  output?: Record<string, unknown>;
  error?: string;
}

// ── Execution Result ─────────────────────────────────────────

export interface ExecutionResult {
  /** The assistant's text reply to be sent back to the user */
  reply: string;
  /** Memory facts extracted and written during execution */
  memoryWrites: MemoryFact[];
  /** Usage metrics for this execution */
  usage: LlmUsage;
  /** The model routing decision that was made */
  routing: RoutingDecision;
  /** Tool calls dispatched during execution */
  toolDispatches: ToolDispatch[];
  /** Sub-agent tasks dispatched during execution */
  subAgentDispatches: SubAgentDispatch[];
  /** Internal conversation ID */
  conversationId: string;
  /** Internal message ID for the assistant's reply */
  messageId: string;
  /** Non-fatal warnings encountered during execution */
  warnings: string[];
}

// ── Prompt Composition ───────────────────────────────────────

export interface PromptContext {
  /** System/assistant instructions */
  systemPrompt: string;
  /** Channel-specific context (e.g., "This is a Telegram conversation") */
  channelContext: string;
  /** Retrieved memory snippets */
  memories: MemorySnippet[];
  /** Recent conversation messages (last N) */
  recentMessages: LlmMessage[];
  /** Available tool definitions */
  tools: LlmToolDefinition[];
  /** Security/compliance instructions appended to system prompt */
  complianceInstructions: string;
}
