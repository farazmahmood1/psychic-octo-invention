# API Specification

## Base URL

All API routes are prefixed with `/api/v1`.

## Authentication

All endpoints (except `/health` and `/api/v1/auth/login`) require a valid session cookie.
State-changing requests (POST, PUT, PATCH, DELETE) also require a CSRF token via the `x-csrf-token` header.

## RBAC

| Role | Level | Permissions |
|------|-------|-------------|
| `super_admin` | 3 | All operations |
| `admin` | 2 | Settings, skill toggles, jobs, memory search |
| `viewer` | 1 | Read-only dashboards, conversations, usage, audit |

## Error Shape

All errors follow this shape:
```json
{
  "error": {
    "code": "ERROR_CODE",
    "message": "Human-readable message",
    "details": {}
  }
}
```

Common error codes: `VALIDATION_ERROR`, `UNAUTHORIZED`, `FORBIDDEN`, `NOT_FOUND`, `INTERNAL_ERROR`.

## Success Shape

Single resource:
```json
{ "data": { ... } }
```

Paginated list:
```json
{
  "data": [...],
  "meta": { "page": 1, "pageSize": 20, "total": 100, "totalPages": 5 }
}
```

## Pagination

All list endpoints accept `page` (default: 1) and `pageSize` (default: 20, max: 100) query params.

---

## Endpoints

### Health

- `GET /health` — Liveness probe
  - Response: `{ service, uptime, environment, timestamp }`
- `GET /health/ready` — Readiness probe with database check
  - Response: `{ status: "ok"|"degraded", checks: [...] }`

### Auth

- `POST /api/v1/auth/login` — Admin login (rate-limited: 10 attempts per 15min)
  - Body: `{ email: string, password: string }`
  - Response: `{ data: { user: { id, email, role, displayName } } }`
  - Sets cookies: `openclaw.sid` (httpOnly session), `openclaw.csrf` (JS-readable)
- `POST /api/v1/auth/logout` — Logout (clears session)
  - Response: `{ data: { message: "Logged out" } }`
- `GET /api/v1/auth/me` — Current user (requires auth)
  - Response: `{ data: { user: { id, email, role, displayName } } }`
- `POST /api/v1/auth/change-password` — Change password (requires auth)
  - Body: `{ currentPassword: string, newPassword: string }`
  - Password: 12-128 chars, upper + lower + number + symbol
  - Invalidates all sessions, clears cookies
  - Response: `{ data: { message: "Password changed. Please log in again." } }`

### Dashboard

- `GET /api/v1/dashboard/stats` — Aggregated dashboard stats (role: viewer+)
  - Response: `{ data: { activeConversations, messagesToday, apiCostsMtd, activeSkills } }`

### Conversations

- `GET /api/v1/conversations` — List conversations (role: viewer+)
  - Query: `page, pageSize, channel?, status?, participantExternalId?, dateFrom?, dateTo?`
  - Response: paginated `ConversationSummary[]`
  - Each summary includes `lastMessagePreview` and `lastMessageAt`
- `GET /api/v1/conversations/:id` — Single conversation detail (role: viewer+)
  - Response: `{ data: ConversationDetail }` (includes participants)
  - 404 if not found
- `GET /api/v1/conversations/:id/messages` — Messages in conversation (role: viewer+)
  - Query: `page, pageSize, direction?, status?`
  - Response: paginated `MessageRecord[]` ordered by createdAt ASC
  - 404 if conversation not found

### Usage

- `GET /api/v1/usage/summary` — Aggregated usage stats (role: viewer+)
  - Query: `dateFrom?, dateTo?, provider?, model?`
  - Response: `{ data: { totalRequests, totalTokens, totalCostUsd, averageLatencyMs, byModel: UsageAggregate[] } }`
  - Defaults to last 30 days if no date range
- `GET /api/v1/usage/timeseries` — Usage over time (role: viewer+)
  - Query: `dateFrom?, dateTo?, granularity? ("hour"|"day"|"week", default: "day"), provider?, model?`
  - Response: `{ data: UsageTimeseriesBucket[] }` with `{ period, requests, tokens, costUsd }`

### Skills

- `GET /api/v1/skills` — List all skills (role: viewer+)
  - Response: `{ data: SkillSummary[] }`
  - Each includes `currentVersion`, `latestVetting`, `enabled`
- `PATCH /api/v1/skills/:id/enabled` — Toggle skill (role: admin+)
  - Body: `{ enabled: boolean }`
  - Response: `{ data: SkillSummary }`
  - Logs audit event
  - 404 if skill not found
- `GET /api/v1/skills/:id/vetting-history` — Vetting results (role: viewer+)
  - Query: `page, pageSize`
  - Response: paginated `VettingRecord[]`
  - 404 if skill not found

### Audit

- `GET /api/v1/audit` — List audit logs (role: viewer+)
  - Query: `page, pageSize, action?, actorId?, targetType?`
  - Response: paginated `AuditLogEntry[]`
  - Append-only: no create/update/delete endpoints

### Settings

- `GET /api/v1/settings/routing` — Current routing config (role: viewer+)
  - Response: `{ data: RoutingSettings }`
  - Returns defaults if not configured
- `PATCH /api/v1/settings/routing` — Update routing config (role: admin+)
  - Body: `{ primaryModel, fallbackModel?, maxCostPerRequestUsd?, maxMonthlyBudgetUsd?, routingRules? }`
  - Validates model identifiers (1-200 chars), cost thresholds (positive, max 10/100000)
  - Logs audit event
  - Response: `{ data: RoutingSettings }`

### Integrations

- `GET /api/v1/integrations/health` — Health status of all integrations (role: viewer+)
  - Response: `{ data: IntegrationHealth[] }`
  - Each: `{ key, label, status: "healthy"|"degraded"|"unconfigured"|"error", message, checkedAt }`
  - Checks: OpenRouter, Telegram, Email, GHL, Google Sheets, Redis, Database

### Jobs

- `GET /api/v1/jobs` — List background jobs (role: admin+)
  - Query: `page, pageSize, status?, queueName?`
  - Response: paginated `JobSummary[]`

### Memory

- `GET /api/v1/memory/search` — Search memory records (role: admin+)
  - Query: `page, pageSize, namespace?, subjectKey?, q?`
  - `q` performs case-insensitive search across `subjectKey` and `summary`
  - Response: paginated `MemorySearchResult[]`

### Bookkeeping (Admin)

- `GET /api/v1/bookkeeping` — List receipt extractions (role: viewer+)
  - Query: `page, pageSize, status? ("pending"|"extracted"|"exported"|"failed"), category?`
  - Response: paginated `BookkeepingExtractionSummary[]`
  - Each includes `extractedData`, `confidence`, `exportStatus` from linked ledger export

### Security

- `GET /api/v1/security/blocked` — Blocked skill execution attempts (role: admin+)
  - Query: `page, pageSize, action?`
  - Response: paginated `SecurityEvent[]` (audit logs with `security.*` action prefix)
  - Each includes `skillSlug`, `skillName`, `reason` extracted from metadata
- `GET /api/v1/security/overrides` — Manual vetting override history (role: admin+)
  - Query: `page, pageSize`
  - Response: paginated `SkillOverrideRecord[]`
  - Each includes `skillName`, `previousResult`, `newResult`, `reason`

---

## Webhooks (External — No Session/CSRF)

### Telegram

- `POST /webhooks/telegram` — Telegram Bot API webhook endpoint
  - **Auth**: `X-Telegram-Bot-Api-Secret-Token` header must match `TELEGRAM_WEBHOOK_SECRET`
  - **No session/CSRF required** (mounted before session middleware)
  - Body: Telegram Update JSON (validated for `update_id` presence)
  - Response: Always `{ ok: true }` with 200 (to prevent Telegram retries)
  - Errors: 401 for invalid secret, 400 for malformed update

  **Processing flow:**
  1. Validate webhook secret header
  2. Deduplicate by `update_id` (in-memory bounded set)
  3. Normalize Telegram Update into InboundEvent (text, photos, documents, audio, video, captions)
  4. Send "typing" indicator immediately
  5. Run full orchestration pipeline (model routing, memory, LLM call)
  6. Deliver reply to same Telegram chat via Bot API
  7. Persist Telegram chat mapping (fire-and-forget)

  **Supported content types:** text, photo, document, audio, video, voice, captioned media

  **Ignored updates:** edited messages, channel posts, messages without sender, service messages

  **Edge cases:** Duplicate webhooks deduplicated by update_id. Telegram API timeouts retried 2x. Outbound failures mark message as 'failed'. Provider outage returns graceful error. Long messages truncated to 4096 chars.

### Email

- `POST /webhooks/email` — Inbound email webhook endpoint (SendGrid, Mailgun, etc.)
  - **Auth**: `X-Email-Webhook-Secret` header must match `INBOUND_EMAIL_WEBHOOK_SECRET`
  - **No session/CSRF required** (mounted before session middleware)
  - Body: `InboundEmailPayload` JSON (from, to, subject, textBody, htmlBody, attachments, headers)
  - Response: Always `{ ok: true }` with 200 (immediate — processing is async)
  - Errors: 401 for invalid secret, 400 for malformed payload

  **Processing flow (async after 200 response):**
  1. Validate webhook secret header
  2. Deduplicate by message-id (in-memory bounded set + DB check)
  3. Normalize email into InboundEvent (parse thread structure, extract current message)
  4. Run full orchestration pipeline (model routing, memory, LLM call)
  5. Persist EmailThread + EmailMessage records
  6. Deliver reply via SMTP with proper threading headers (In-Reply-To, References, Re: subject)
  7. SLA target: reply within 15 minutes

  **Supported content:** Plain text and HTML bodies, forwarded email chains, quoted reply threads, attachment metadata, CC recipients.

  **Thread mapping:** Threads linked via References/In-Reply-To headers. Missing message-id generated deterministically. Outbound replies include proper threading headers.

  **Edge cases:** Duplicate emails deduplicated by message-id (in-memory + DB). HTML-only emails stripped to text. Forwarded chains parsed robustly. Body size bounded (100KB text, 50KB raw). SMTP failures retried 2x. Circular references tolerated.

---

## Internal Contracts

### GHL CRM Sub-Agent (Built-in Tool)

The GHL CRM sub-agent is a built-in LLM tool (`ghl_crm`) available in all orchestration contexts. It is not exposed as an HTTP endpoint — the LLM invokes it via tool calls during conversation.

**Tool name**: `ghl_crm`

**Supported actions**:
- `search_contact` — Search contacts by name, email, or phone
- `get_contact` — Get contact details by ID
- `update_contact` — Update contact fields (requires contactId + updates)

**Editable fields**: `firstName`, `lastName`, `email`, `phone`, `address1`, `city`, `state`, `postalCode`, `website`, `tags`

**Safeguards**:
- Ambiguous matches (multiple contacts) require user clarification
- Invalid field values are rejected with explanation
- Empty updates are rejected
- Unchanged fields are skipped with notification
- All operations logged to `ghl_action_logs`

**Multi-turn flow**: The LLM typically makes 2 tool calls — first `search_contact` to find the contact, then `update_contact` with the resolved ID. The orchestrator handles the tool result → LLM follow-up loop automatically.

---

## Internal Contracts (Not HTTP — used by channel adapters)

### Orchestration

Channel adapters (Telegram webhook, email inbound, admin portal) call the orchestrator internally:

```typescript
import { enqueueOrchestration } from './workers';

const result = await enqueueOrchestration({
  channel: 'telegram',
  externalUserId: '123456',
  externalUserName: 'John',
  externalThreadId: '123456',
  text: 'Hello, I need help',
  attachments: [],
  timestamp: new Date().toISOString(),
  metadata: { telegramUpdateId: 789 },
});
```

**InboundEvent shape:**
```typescript
{
  channel: ChannelType,
  externalUserId: string,
  externalUserName: string | null,
  externalThreadId: string,
  text: string,
  attachments: Attachment[],
  timestamp: string,
  metadata: Record<string, unknown>
}
```

**ExecutionResult shape:**
```typescript
{
  reply: string,
  memoryWrites: MemoryFact[],
  usage: LlmUsage,
  routing: RoutingDecision,
  toolDispatches: ToolDispatch[],
  subAgentDispatches: SubAgentDispatch[],
  conversationId: string,
  messageId: string,
  warnings: string[]
}
```

### Model Routing

Routing decisions are persisted on each `UsageLog.routingDecision` JSON column:

```typescript
{
  model: string,           // e.g. "google/gemini-2.5-flash"
  tier: "cheap" | "standard" | "strong",
  provider: string,        // e.g. "openrouter"
  reason: string,          // human-readable explanation
  signals: RoutingSignals, // what informed the decision
  escalatedFrom: string | null
}
```

---

## Enums

| Enum | Values |
|------|--------|
| AdminRole | `super_admin`, `admin`, `viewer` |
| ChannelType | `telegram`, `email`, `admin_portal` |
| MessageDirection | `inbound`, `outbound` |
| MessageStatus | `pending`, `sent`, `delivered`, `failed`, `received` |
| ConversationStatus | `active`, `archived`, `closed` |
| JobStatus | `pending`, `running`, `completed`, `failed`, `retrying`, `cancelled` |
| VettingResult | `passed`, `failed`, `warning`, `pending` |
| IntegrationStatus | `active`, `inactive`, `error` |
| SubAgentTaskStatus | `queued`, `running`, `completed`, `failed`, `cancelled` |
| SkillSourceType | `builtin`, `uploaded`, `git_repo`, `marketplace` |

---

## Bookkeeping Sub-Agent (Internal Contract)

The bookkeeping sub-agent processes receipt images and appends structured rows to Google Sheets.

### Tool Name: `bookkeeping_receipt`

**Actions:**

| Action | Description | Required Fields |
|--------|-------------|-----------------|
| `process_receipt` | Extract data from receipt image via vision model | `imageUrl` |
| `set_category` | Set category for a pending receipt | `category` (optionally `receiptTaskId`) |
| `get_pending` | Check for pending receipts in this conversation | — |

### Multi-Turn Flow

1. User sends receipt photo → LLM calls `bookkeeping_receipt` with `action: process_receipt, imageUrl: <url>`
2. Sub-agent extracts data, persists ReceiptExtraction record
3. If category is missing/low-confidence → returns `needsClarification: true` with question
4. User replies with category → LLM calls `bookkeeping_receipt` with `action: set_category, category: "Client Meals"`
5. Sub-agent sets category, appends row to Google Sheet, confirms

### Google Sheet Row Schema

| Column | Type | Description |
|--------|------|-------------|
| timestamp_processed | ISO string | When the row was appended |
| source_channel | string | telegram, email, admin_portal |
| user_external_id | string | User ID on the source channel |
| vendor | string | Business/store name |
| transaction_date | YYYY-MM-DD | Date on the receipt |
| amount | number | Total amount |
| currency | string | ISO currency code |
| tax | number/null | Tax amount if visible |
| category | string | Expense category |
| original_message_id | string | Internal message ID |
| receipt_task_id | string | ReceiptExtraction record ID |
| notes | string | Extraction notes |

### Idempotency

Duplicate processing is prevented via `idempotencyKey` (unique) on ReceiptExtraction, derived from source message ID.

### Error Cases

- Not a receipt → confidence < 0.2, no vendor/amount → returns error
- Blurry/unclear → extracts what possible, low confidence noted
- Sheet append failure → extraction saved, can be retried
- Duplicate image → returns existing extraction result

## Database Entities

See `architecture.md` for the full entity relationship diagram and design rationale.
