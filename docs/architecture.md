# Architecture

## Overview

NexClaw Admin System is a monorepo containing:

- **apps/api** — Express backend (REST API, webhooks, background jobs, orchestration)
- **apps/admin** — React admin portal (Vite + Tailwind + shadcn/ui)
- **packages/shared** — Shared types, schemas, constants
- **packages/config** — Environment validation, logger, auth config

## Key Design Decisions

- NexClaw is wrapped behind an internal orchestration layer to avoid tight coupling
- All AI calls are routed through OpenRouter for model flexibility
- BullMQ + Redis for reliable background job processing
- Neon Postgres with Prisma for type-safe database access
- Admin-only auth with session cookies (no public-facing auth)

---

## Orchestration Layer

### Pipeline

The orchestration layer sits between incoming channel events and LLM execution:

```
Inbound Event (Telegram / Email / Admin Portal)
  │
  ├─ 1. Resolve/create conversation + participant
  ├─ 2. Persist inbound message
  ├─ 3. Retrieve relevant memories
  ├─ 4. Resolve available tools from enabled skills
  ├─ 5. Route to model (cheap → standard → strong)
  ├─ 6. Compose prompt (system + memories + history + user message)
  ├─ 7. Call LLM via provider abstraction
  ├─ 8. Handle tool calls (dispatch hooks)
  ├─ 9. Persist assistant reply
  ├─ 10. Extract and store new memories
  ├─ 11. Log usage metrics
  └─ 12. Return ExecutionResult
```

### Key Abstractions

| Abstraction | Location | Purpose |
|---|---|---|
| `InboundEvent` | `shared/types/orchestration.ts` | Channel-agnostic normalized input |
| `ExecutionResult` | `shared/types/orchestration.ts` | Complete execution output |
| `LlmProvider` | `services/llm/provider.ts` | Interface for LLM backends |
| `OpenRouterProvider` | `integrations/openrouter/client.ts` | Concrete OpenRouter implementation |
| `ProviderRegistry` | `services/llm/registry.ts` | Provider discovery and fallback |
| `ModelRouter` | `services/routing/model-router.ts` | Signal-based model selection |
| `MemoryService` | `services/memory/memory.service.ts` | Retrieval-based long-term memory |
| `PromptComposer` | `orchestration/prompt-composer.ts` | Bounded prompt assembly |
| `Orchestrator` | `orchestration/orchestrator.ts` | Central execution pipeline |

### Model Routing

Three tiers of models, selected by signal analysis:

| Tier | Default Model | When Used |
|---|---|---|
| `cheap` | `google/gemini-2.5-flash` | Short, simple messages |
| `standard` | `anthropic/claude-sonnet-4` | Medium complexity, tool use |
| `strong` | `anthropic/claude-opus-4` | Complex reasoning, escalation |

Routing signals: message length, attachments, vision need, tool use, estimated complexity, follow-up detection.

Escalation: if the primary model fails, the router escalates once to a stronger tier. Max one escalation to prevent loops.

### Memory System

Retrieval-based long-term memory (not "put all history into prompt"):

- **Namespaces**: `user:{id}`, `conv:{id}`, `biz:{topic}`, `global`
- **Extraction**: Pattern-based extraction of durable facts (names, contacts, preferences, locations)
- **Scoring**: 0.0–1.0 importance scale; only facts ≥ 0.3 are retrieved
- **Deduplication**: Same namespace+subjectKey upserts; low-importance duplicates are skipped
- **Retrieval**: Top-N by score then recency, filtered by namespace relevance
- **Prompt budget**: Memory block capped at 2000 chars in system prompt

### Prompt Composition

Bounded prompt assembly with token budgets:

| Section | Max Budget |
|---|---|
| System prompt + channel context | 4000 chars |
| Memory block | 2000 chars |
| Recent messages | 20 messages / 12000 chars |
| Compliance instructions | Included in system prompt |

### Error Handling

- LLM provider failures: escalate model, then return graceful error reply
- Memory failures: log warning, proceed without memories
- Usage logging failures: log warning, don't block reply
- Tool resolution failures: proceed without tools

---

## Skill Security Layer

### Ingestion Pipeline

```
POST /api/v1/skills/ingest
  |
  +-- Zod validation (slug, source, version, metadata)
  +-- SHA-256 hash computation
  +-- Static analysis scan (30+ rules, 8 categories)
  +-- Policy evaluation (configurable allowlist/denylist)
  +-- Persist skill + version + vetting result
  +-- Audit log
  +-- Return: approved / warning / blocked
```

### Key Components

| Component | Location | Purpose |
|---|---|---|
| `Scanner` | `security/scanner.ts` | Pattern-based static analysis with 30+ rules |
| `PolicyEngine` | `security/policy-engine.ts` | Configurable allowlist/denylist evaluation |
| `CodeHash` | `security/hash.ts` | SHA-256 integrity verification |
| `ExecutionGuard` | `security/execution-guard.ts` | Runtime pre-execution checks |
| `IngestionService` | `services/skills/ingestion.service.ts` | Full ingestion pipeline |
| `OverrideService` | `services/skills/override.service.ts` | Manual super_admin override |

### Enforcement Points

1. **Ingestion** — blocked skills stored as `failed`, not set as current version
2. **Enable toggle** — rejects enabling unvetted/failed skills (422)
3. **Tool resolution** — execution guard filters blocked skills from orchestration
4. **Runtime** — hash verification before execution (tamper detection)

### Security Audit Actions

`skill.ingested`, `skill.ingestion_blocked`, `skill.enabled`, `skill.disabled`, `skill.manual_override`, `skill.execution_blocked`

---

## GHL CRM Sub-Agent

### Architecture

The GHL CRM sub-agent is a built-in tool that the LLM can invoke to perform CRM operations on GoHighLevel. It integrates through the orchestration layer's tool call mechanism — not via direct route coupling.

```
User: "Update John Doe's phone to 555-0199"
  │
  ├─ Orchestrator calls LLM with ghl_crm tool definition
  ├─ LLM returns tool_call: { action: "search_contact", query: "John Doe" }
  ├─ Sub-agent dispatcher executes GHL search
  ├─ Results fed back to LLM as tool results
  ├─ LLM returns tool_call: { action: "update_contact", contactId: "...", updates: { phone: "555-0199" } }
  ├─ Sub-agent validates fields, executes update
  ├─ Results fed back to LLM for final user-facing reply
  └─ LLM: "Done! Updated John Doe's phone from 555-0100 to 555-0199."
```

### Key Components

| Component | Location | Purpose |
|---|---|---|
| `GhlClient` | `integrations/ghl/client.ts` | Low-level GHL REST API with retry/timeout |
| `GhlCrmService` | `services/subagents/ghl-crm.service.ts` | Sub-agent logic: search, get, update with safeguards |
| `SubAgentDispatcher` | `orchestration/sub-agent-dispatcher.ts` | Routes LLM tool calls to sub-agents |
| `GhlFieldValidator` | `validators/ghl-fields.ts` | Phone/email normalization, editable field allowlist |
| `GhlActionLogRepo` | `repositories/ghl-action-log.repository.ts` | Append-only GHL operation audit trail |
| `SubAgentTaskRepo` | `repositories/sub-agent-task.repository.ts` | Sub-agent task status tracking |

### Safeguards

1. **Ambiguity protection**: Multiple contact matches trigger clarification, not update
2. **Field allowlist**: Only `firstName`, `lastName`, `email`, `phone`, `address1`, `city`, `state`, `postalCode`, `website`, `tags` are editable
3. **Validation**: Phone numbers normalized (7-15 digits), emails validated, empty values rejected
4. **Change detection**: Fetches current contact before update, skips unchanged fields
5. **Confirmation**: Reply always states exactly what changed (field: old → new)
6. **Audit trail**: Every GHL API call logged to `ghl_action_logs` with request/response payloads
7. **Sub-agent task tracking**: Each dispatch recorded in `sub_agent_tasks` for status visibility

### Multi-Turn Tool Flow

The orchestrator supports multi-turn tool calling:
1. LLM produces `tool_calls` in response
2. Sub-agent tool calls are identified and executed synchronously
3. Tool results are appended as `tool` role messages
4. A follow-up LLM call generates the final user-facing reply
5. If follow-up fails, sub-agent summaries are used directly as the reply

### GHL API Integration

- Base URL: `GHL_API_BASE_URL` (default: `https://rest.gohighlevel.com/v1`)
- Auth: Bearer token via `GHL_API_TOKEN`
- Retry: 2 retries on 429/5xx, exponential backoff
- Timeout: 30 seconds
- Rate limit handling: respects Retry-After header

---

## Email Integration Layer

### Inbound Flow

```
Email Provider (SendGrid/Mailgun) → POST /webhooks/email
  │
  ├─ 1. Validate X-Email-Webhook-Secret header
  ├─ 2. Deduplicate by message-id (in-memory Set + DB lookup)
  ├─ 3. Respond 200 immediately (async processing)
  ├─ 4. Normalize InboundEmailPayload → InboundEvent
  │     ├─ Parse thread structure (forwarded chains, quoted replies)
  │     ├─ Separate current message from thread history
  │     ├─ Normalize email addresses (lowercase)
  │     └─ Bound body size (100KB text, 50KB raw payload)
  ├─ 5. Run orchestration pipeline (executeEvent)
  ├─ 6. Persist EmailThread + EmailMessage records
  └─ 7. Deliver reply via SMTP with threading headers
```

### Outbound Flow

```
Orchestration result.reply
  │
  ├─ Build threading headers (In-Reply-To, References)
  ├─ Ensure Re: subject prefix
  ├─ Send via SMTP (nodemailer, 2 retries, 30s timeout)
  ├─ Persist outbound EmailMessage record
  └─ Update Message status (pending → sent/failed)
```

### Key Components

| Component | Location | Purpose |
|---|---|---|
| `EmailClient` | `integrations/email/client.ts` | SMTP outbound + threading header helpers |
| `ThreadParser` | `integrations/email/thread-parser.ts` | Parse forwarded/quoted email threads |
| `EmailNormalizer` | `integrations/email/normalizer.ts` | InboundEmailPayload → InboundEvent |
| `EmailDelivery` | `services/channels/email.delivery.ts` | Outbound reply delivery via SMTP |
| `EmailThreadRepo` | `repositories/email-thread.repository.ts` | EmailThread + EmailMessage persistence |
| `EmailWebhook` | `routes/webhooks/email.ts` | Inbound webhook endpoint |
| `EmailWorker` | `workers/email-processing.worker.ts` | BullMQ-ready job processor |

### Thread Parsing

The thread parser handles realistic email content:
- **Quoted replies**: `On <date>, <name> wrote:` + `>` prefixed lines
- **Forwarded messages**: `---------- Forwarded message ----------`
- **Outlook format**: `From: ... Sent: ... Subject: ...` blocks
- **Nested chains**: Multiple forwarded/quoted levels
- **HTML-only emails**: Stripped to text with entity decoding

The parser separates the sender's current message from thread history, giving the orchestration layer focused context.

### SLA Design

Email processing targets replies within 15 minutes:
- Webhook responds 200 immediately (no provider timeout risk)
- Processing runs asynchronously
- BullMQ queue (when wired) provides retry with backoff
- Dead-letter recording for failed jobs
- Job status visible in admin UI via Jobs endpoint

---

## Database Architecture

### Technology

- **Neon Postgres** — Serverless Postgres with branching support
- **Prisma ORM** — Type-safe queries, migrations, and schema management
- Schema defined in `prisma/schema.prisma`

### Entity Relationship Summary

```
Admin ──< AdminSession
Admin ──< AuditLog

Conversation ──< Message
Conversation ──< Participant
Conversation ──1 TelegramChat
Conversation ──1 EmailThread
Conversation ──< MemoryRecord (via sourceConversationId)

Participant ──< Message

EmailThread ──< EmailMessage
EmailMessage ──? Message (optional link)

Message ──? UsageLog (1:1 optional)

Skill ──< SkillVersion
Skill ──? SkillVersion (currentVersion pointer)
SkillVersion ──< SkillVettingResult

ReceiptExtraction ──1 LedgerExport

Job (standalone)
SubAgentTask (standalone, links to Job via parentJobId)
GhlActionLog (standalone)
Integration (standalone)
SystemSetting (standalone, key-value)
```

### Entity Categories

| Category | Tables |
|---|---|
| Auth & Admin | `admins`, `admin_sessions` |
| Conversations | `conversations`, `participants`, `messages` |
| Channel Mapping | `telegram_chats`, `email_threads`, `email_messages` |
| Memory | `memory_records` |
| Skills & Vetting | `skills`, `skill_versions`, `skill_vetting_results` |
| Observability | `audit_logs`, `usage_logs` |
| Job Processing | `jobs`, `sub_agent_tasks` |
| Integrations | `integrations`, `ghl_action_logs` |
| Bookkeeping | `receipt_extractions`, `ledger_exports` |
| Config | `system_settings` |

### Design Rationale

**Identity separation**: Participants are per-conversation, not global. The same real person contacting via Telegram and email creates separate Participant records tied to their respective conversations. This avoids premature identity merging.

**Channel mapping**: TelegramChat and EmailThread are 1:1 extensions of Conversation. Each stores channel-specific metadata (Telegram user IDs, email threading headers) without polluting the core conversation model.

**Memory independence**: MemoryRecord links to source conversation/message via nullable FKs with `onDelete: SetNull`. Memory persists even if source messages are deleted.

**Skill versioning**: Skills have a `currentVersionId` pointer and a versions list. Vetting results are per-version, preserving full audit history. Enabled skills must point to an existing version.

**Audit immutability**: AuditLog has no `updatedAt` and no update/delete repository methods. Append-only by design.

**JSON columns**: Used sparingly for truly flexible payloads (attachments, metadata, routing decisions, extracted receipt data). Structured fields use proper columns with enums.

**Cost tracking**: UsageLog.costUsd uses `Decimal(12,8)` for precision. Linked 1:1 to messages where applicable. Routing decisions are persisted as JSON on each usage record.

---

## Bookkeeping Sub-Agent

### Overview

The bookkeeping sub-agent processes receipt images sent via Telegram (or email), extracts structured data using a vision-capable LLM, asks for a category if needed, and appends the result to a Google Sheet.

### Architecture

```
User sends receipt photo
    ↓
Telegram Webhook → InboundEvent (with image attachment)
    ↓
Orchestrator → LLM (sees image + tools)
    ↓
LLM calls bookkeeping_receipt tool (process_receipt)
    ↓
Sub-Agent Dispatcher → Bookkeeping Service
    ↓
Vision Model (claude-sonnet-4) → ReceiptExtractionData
    ↓
Persist ReceiptExtraction record
    ↓
If category missing → return clarification question
    ↓
User replies "Client Meals"
    ↓
LLM calls bookkeeping_receipt (set_category)
    ↓
Google Sheets Client → append row
    ↓
Persist LedgerExport record → confirm to user
```

### Key Components

| Component | Path | Responsibility |
|-----------|------|---------------|
| Shared Types | `packages/shared/src/types/bookkeeping.ts` | BookkeepingSubAgentInput/Output, SheetRow, ExtractionData |
| Google Sheets Client | `apps/api/src/integrations/google/sheets-client.ts` | Service account auth (JWT), Sheets API v4, row append |
| Vision Extractor | `apps/api/src/services/vision/receipt-extractor.ts` | Send image to vision LLM, parse structured JSON |
| Bookkeeping Service | `apps/api/src/services/subagents/bookkeeping/` | Multi-turn flow: extract → clarify → append |
| Receipt Repository | `apps/api/src/repositories/receipt-extraction.repository.ts` | ReceiptExtraction + LedgerExport CRUD |
| Field Validators | `apps/api/src/validators/bookkeeping-fields.ts` | Amount, currency, category, date validation |
| Tool Definition | `apps/api/src/orchestration/tool-resolver.ts` | LLM tool definition for bookkeeping_receipt |
| Dispatcher | `apps/api/src/orchestration/sub-agent-dispatcher.ts` | Routes bookkeeping tool calls to service |

### Safeguards

- **Receipt detection**: Low-confidence extractions (< 0.2 with no vendor/amount) are rejected
- **Idempotency**: Unique `idempotencyKey` prevents duplicate processing of same image
- **Amount validation**: Must be numeric and non-negative
- **Category required**: Cannot append to sheet without a category
- **Pending task state**: ReceiptExtraction with status=extracted + no category tracks awaiting-clarification state
- **Sheet failure recovery**: Extraction data persisted even if Sheet append fails — can be retried

### Google Sheets Authentication

Uses service account JWT:
1. Parse `GOOGLE_SERVICE_ACCOUNT_JSON` from env
2. Create RS256-signed JWT with sheets scope
3. Exchange JWT for access token via Google OAuth2
4. Cache token until near-expiry (60s buffer)
5. Use token for Sheets API v4 calls

---

## Lead Follow-Up Sub-Agent

### Overview

The lead follow-up sub-agent helps small business owners recover lost leads and missed appointments by identifying stale conversations, drafting follow-up messages, and managing a review-first approval workflow. No messages are auto-sent.

### Architecture

```
User: "Show me stale leads"
  |
  +-- Orchestrator calls LLM with lead_followup tool definition
  +-- LLM returns tool_call: { action: "find_stale", staleDays: 7 }
  +-- Sub-agent dispatcher executes follow-up service
  +-- Service queries conversations for unanswered inbound messages
  +-- Results fed back to LLM for user-facing summary
  |
User: "Draft a follow-up for Sarah"
  |
  +-- LLM returns tool_call: { action: "draft_followup", contactQuery: "Sarah" }
  +-- Service generates message via cheap LLM (gemini-2.5-flash)
  +-- Persists FollowUpRecommendation record (status: pending_review)
  +-- Results fed back to LLM with approval prompt
  |
User: "Approve it"
  |
  +-- LLM returns tool_call: { action: "approve_send", recommendationId: "..." }
  +-- Service marks recommendation as approved
  +-- Future delivery layer sends the message
```

### Key Components

| Component | Path | Responsibility |
|-----------|------|---------------|
| Shared Types | `packages/shared/src/types/followup.ts` | FollowUpSubAgentInput/Output, Recommendation types |
| Follow-Up Service | `apps/api/src/services/subagents/followup/` | Core logic: find stale, draft, approve, dismiss |
| Repository | `apps/api/src/repositories/followup-recommendation.repository.ts` | FollowUpRecommendation CRUD + stale contact queries |
| Tool Definition | `apps/api/src/orchestration/tool-resolver.ts` | LLM tool definition for lead_followup |
| Dispatcher | `apps/api/src/orchestration/sub-agent-dispatcher.ts` | Routes follow-up tool calls to service |
| Job/Worker | `apps/api/src/jobs/followup.job.ts`, `workers/followup.worker.ts` | BullMQ-ready async processing |

### Safeguards

1. **Review-first**: All follow-ups require explicit human approval before sending
2. **Duplicate prevention**: Same contact + reason cannot have duplicate active recommendations within 24h
3. **Tone enforcement**: LLM prompt requires friendly, non-pushy language
4. **Message sanitization**: Drafts are trimmed, length-capped (500 chars), and cleaned
5. **Fallback template**: If LLM generation fails, a safe template is used
6. **Full audit**: All recommendations tracked via FollowUpRecommendation + SubAgentTask records

### Recommendation Lifecycle

```
draft -> pending_review -> approved -> sent
                       \-> dismissed
                       \-> expired
```

### Indexes

Indexes are tuned for the primary query patterns:
- Conversation lookup by channel + external ID (unique composite)
- Message listing by conversation + createdAt
- Skill lookup by slug (unique)
- Audit log filtering by action + createdAt
- Usage log aggregation by provider + model + createdAt
- Job monitoring by status and queue
- Memory retrieval by namespace + subject key
- Telegram chat lookup by telegram_chat_id (unique)
- Email thread lookup by thread_id (unique)
