# Final Handoff Document

> Release note: use [handoff-summary.md](./handoff-summary.md) and [demo-checklist.md](./demo-checklist.md) for the final submission/handoff script. This document remains as extended reference material and may include historical test-count/lint assumptions.

## System Overview

OpenClaw Admin System is a production-ready AI-powered admin platform with:
- Multi-channel messaging (Telegram, Email)
- AI orchestration with model routing (cheap/standard/strong)
- Three sub-agents: GHL CRM, Bookkeeping, Lead Follow-Up
- Admin portal for monitoring and management
- Comprehensive security (skill vetting, RBAC, audit logging)

See `architecture.md` for detailed technical architecture.

---

## Quick Start

```bash
# 1. Clone and configure
git clone <repo-url> && cd openclaw-admin-system
cp .env.example .env    # Fill in values

# 2. Install and set up
npm install
npm run db:generate
npm run db:migrate
npm run seed:admin

# 3. Start Redis
docker compose up -d redis

# 4. Start development
npm run dev              # API (4000) + Admin (5173)
```

Docker alternative:
```bash
docker compose up        # All services including worker
```

---

## Running Tests

### Unit & Integration Tests (158 tests)

```bash
npm test                            # All workspaces
npm test -w packages/shared         # Shared schemas (50 tests)
npm test -w apps/api                # API middleware, webhooks, stories (94 tests)
npm test -w apps/admin              # Admin components (14 tests)
npm run test:watch -w apps/api      # Watch mode
```

### E2E Tests (Playwright)

```bash
npx playwright install chromium     # First time only
npm run seed:admin                  # Seed test user
npx playwright test                 # Run E2E suite
npx playwright test --ui            # Interactive mode
```

### Full Pre-deployment Check

```bash
npm run predeploy    # Lint + typecheck + test + build
```

### CI

GitHub Actions CI (`.github/workflows/ci.yml`) runs on every push/PR:
1. Lint + TypeScript type check
2. Unit & integration tests
3. Build all workspaces
4. Docker image build verification

---

## Test Coverage Matrix

### User Story to Test Mapping

| Story ID | Description | Test File(s) | Type |
|----------|-------------|-------------|------|
| STORY-T1 | Telegram instant reply path | `apps/api/src/tests/webhooks/telegram.test.ts` | Integration |
| STORY-T2 | Email thread parse and reply path | `apps/api/src/tests/webhooks/email.test.ts` | Integration |
| STORY-UI1 | Portal login / dashboard load | `apps/admin/src/tests/components/login-page.test.tsx`, `e2e/admin-login.spec.ts` | Unit + E2E |
| STORY-UI2 | Chat history and usage visibility | `apps/admin/src/tests/components/data-table.test.tsx`, `e2e/admin-login.spec.ts` | Unit + E2E |
| STORY-UI3 | Disabling a skill prevents its use | `apps/api/src/tests/security/scanner.test.ts`, `apps/api/src/tests/stories/story-sec1.test.ts` | Unit |
| STORY-SEC1 | Malicious skill (os.system) blocked and logged | `apps/api/src/tests/stories/story-sec1.test.ts`, `apps/api/src/tests/security/scanner.test.ts` | Unit |
| STORY-T3 | Memory survives 20+ unrelated turns | `apps/api/src/tests/stories/story-t3-memory.test.ts` | Unit |
| STORY-T4 | Simple task cheap model, complex escalates | `apps/api/src/tests/services/model-router.test.ts` | Unit |
| STORY-GHL1 | GHL contact update flow | `apps/api/src/tests/stories/story-ghl1.test.ts` | Unit |
| STORY-BKP1 | Receipt extraction + clarification + sheet append | `apps/api/src/tests/stories/story-bkp1.test.ts` | Unit |

### Edge Cases Covered

| Edge Case | Test Location | Assertion |
|-----------|--------------|-----------|
| Duplicate Telegram webhook | `webhooks/telegram.test.ts` | Second call skipped, executeEvent called once |
| Duplicate email (in-memory) | `webhooks/email.test.ts` | Duplicate skipped by message-id |
| Duplicate email (DB check) | `webhooks/email.test.ts` | Already-processed returns 200, no re-processing |
| Missing webhook secret | `webhooks/telegram.test.ts`, `webhooks/email.test.ts` | Returns 401 |
| Invalid login credentials | `login-page.test.tsx`, `e2e/admin-login.spec.ts` | Error message displayed |
| Stale session | `middleware/auth.test.ts`, `e2e/admin-login.spec.ts` | 401 / redirect to /login |
| Viewer accessing admin route | `middleware/auth.test.ts` | Returns 403 FORBIDDEN |
| Provider timeout | `webhooks/telegram.test.ts` | Still returns 200 (prevent retries) |
| Ambiguous GHL contact match | `stories/story-ghl1.test.ts` | Multiple candidates returned |
| Duplicate Sheets append | `stories/story-bkp1.test.ts` | Prevented by idempotency key |
| Blocked skill execution | `stories/story-sec1.test.ts` | Policy decision = 'blocked' |
| Non-editable GHL field | `stories/story-ghl1.test.ts` | Not in allowed list |
| Password complexity | `packages/shared/src/tests/schemas.test.ts` | All rules validated |
| CSRF token mismatch | `middleware/csrf.test.ts` | verifyCsrfToken returns false |
| Model escalation loop | `services/model-router.test.ts` | Returns null on double-escalation |
| Normalized error shape | `middleware/auth.test.ts` | All errors follow `{ error: { code, message } }` |
| Pagination boundary | `schemas.test.ts` | pageSize > 100 rejected |

### External Provider Mocking

| Provider | Mock Strategy | Location |
|----------|--------------|----------|
| OpenRouter | `vi.mock()` on orchestration | Test files |
| Telegram Bot API | `vi.mock()` on telegram/client | `webhooks/telegram.test.ts` |
| Email SMTP | `vi.mock()` on channels/deliverToEmail | `webhooks/email.test.ts` |
| GHL CRM | Fixture-based factories | `fixtures/ghl.fixture.ts` |
| Google Sheets | Fixture-based row validation | `fixtures/receipt.fixture.ts` |
| Prisma (DB) | Global mock in `tests/setup.ts` | All API tests |

### Test Suites Summary

| Package | Files | Tests | Covers |
|---------|-------|-------|--------|
| `packages/shared` | 2 | 50 | Zod schemas, constants, enums, password validation |
| `apps/api` | 12 | 94 | Middleware, utils, security scanner, model router, webhooks, user stories |
| `apps/admin` | 3 | 14 | Login page, DataTable, StatusBadge |
| `e2e/` | 1 | 6 | Login, navigation, logout, auth redirect |

---

## Manual Verification Guide

### How to Verify Each User Story

**STORY-T1 — Telegram Reply**
1. Register the Telegram webhook (see `deployment.md`)
2. Send a text message to the bot via Telegram
3. Verify the bot responds within seconds
4. Check admin portal > Conversations for the new conversation

**STORY-T2 — Email Thread**
1. Configure email provider inbound forwarding
2. Send an email to the configured inbound address
3. Verify a threaded reply is sent back via SMTP
4. Reply to the reply — verify thread context is maintained

**STORY-UI1 — Portal Login**
1. Navigate to the admin URL
2. Login with seeded admin credentials
3. Verify dashboard loads with metrics
4. Verify logout works and redirects to login

**STORY-UI2 — Chat History / Usage**
1. After some conversations exist, check Conversations page
2. Verify message history is visible
3. Check Usage page for token/cost metrics
4. Verify pagination works on large datasets

**STORY-UI3 — Skill Disable**
1. Ingest a skill via `POST /api/v1/skills/ingest`
2. Disable it via `PATCH /api/v1/skills/:id` with `enabled: false`
3. Verify the skill is excluded from orchestration tool resolution

**STORY-SEC1 — Malicious Skill Blocked**
1. Ingest a skill containing `os.system('rm -rf /')` or `subprocess.call([...])`
2. Verify ingestion returns `blocked` status
3. Check audit logs for `skill.ingestion_blocked` entry

**STORY-T3 — Memory Persistence**
1. Have a multi-turn conversation mentioning user preferences/facts
2. After 20+ unrelated messages, ask the bot about the earlier fact
3. Verify the bot recalls the information

**STORY-T4 — Model Routing**
1. Send "Hi" → verify cheap model (gemini-2.5-flash) in usage logs
2. Send a complex analysis request → verify strong model (claude-opus-4) in usage logs
3. Check admin portal > Usage for model distribution

**STORY-GHL1 — GHL Contact Update**
1. Ask the bot: "Update John Doe's phone to 555-0199"
2. Verify the bot searches GHL, shows matching contact
3. Verify the update is applied and confirmed
4. Check `ghl_action_logs` for the operation record

**STORY-BKP1 — Receipt Extraction**
1. Send a receipt photo via Telegram
2. Bot extracts vendor, amount, date, and asks for category
3. Reply with category (e.g., "Client Meals")
4. Verify row is appended to Google Sheet
5. Check `receipt_extractions` + `ledger_exports` tables

### Third Sub-Agent — Lead Follow-Up

The Lead Follow-Up sub-agent is fully implemented and documented:
- Architecture and workflow: `docs/subagent-3-proposal.md`
- Types: `packages/shared/src/types/followup.ts`
- Service: `apps/api/src/services/subagents/followup/`
- Job/Worker: `apps/api/src/jobs/followup.job.ts`, `apps/api/src/workers/followup.worker.ts`

Manual verification:
1. Ask the bot: "Show me stale leads"
2. Bot scans conversations for unanswered messages (5+ days)
3. Ask: "Draft a follow-up for Sarah"
4. Bot generates a message draft (status: `pending_review`)
5. Review and approve or dismiss

---

## Deployment

See `deployment.md` for full deployment instructions.

### Quick Deploy to Render

1. Push to GitHub
2. Render Dashboard > New > Blueprint > select repo
3. Fill in manual env vars
4. Deploy
5. Run `npm run seed:admin` via Render shell
6. Register Telegram webhook
7. Run `npm run healthcheck -- https://your-api.onrender.com`

### Docker Deploy

```bash
# Build images
docker build --target api -t openclaw-api .
docker build --target worker -t openclaw-worker .
docker build --target admin -t openclaw-admin .
docker build --target migrate -t openclaw-migrate .

# Run migration
docker run --rm --env-file .env openclaw-migrate

# Start services
docker run -d -p 4000:4000 --env-file .env openclaw-api
docker run -d --env-file .env openclaw-worker
docker run -d -p 80:80 openclaw-admin
```

---

## Architecture Summary

```
apps/api/                 Express REST API + webhooks
  src/server.ts           HTTP server entry point (graceful shutdown)
  src/worker.ts           Background worker entry point (BullMQ)
  src/app.ts              Express app factory (middleware + routes)
  src/orchestration/      AI pipeline (prompt compose → LLM → tool dispatch)
  src/services/           Business logic layer
  src/repositories/       Database access (Prisma)
  src/integrations/       External service clients
  src/middleware/          Express middleware (auth, rate limit, CSRF)
  src/security/           Skill vetting scanner + policy engine
  src/jobs/               Job type definitions
  src/workers/            Job processors
  src/queues/             BullMQ queue registry
  src/db/                 Prisma client + Redis connection

apps/admin/               React admin portal (Vite + Tailwind + shadcn/ui)

packages/shared/          Shared types, schemas, constants
packages/config/          Environment validation, logger, auth config
```

### Key Patterns

- **Layered architecture**: Controllers → Services → Repositories → Prisma
- **Provider abstraction**: LLM interface with OpenRouter implementation
- **Event-driven processing**: Webhooks → BullMQ queues → Workers
- **Safe degradation**: Missing integrations = degraded mode, not crash
- **Append-only audit**: All admin and security actions are logged
- **Skill versioning**: Full version history with per-version vetting

---

## Known Limitations

1. **Memory extraction**: Currently pattern-based; future enhancement could use LLM-based extraction
2. **No WebSocket**: Admin portal uses polling, not real-time push
3. **Single-region**: Render deployment is single-region (oregon)
4. **No CDN for API**: API responses are not cached; consider Cloudflare Workers for edge caching
5. **No email attachment support**: Inbound email handles text/HTML only; attachments are not processed
6. **Follow-up delivery**: Approved follow-ups are marked for delivery but the send channel integration is a future enhancement

## Intentionally Deferred Items

These items are documented but not blocking demo readiness:

| Item | Status | Notes |
|------|--------|-------|
| OpenTelemetry tracing | Deferred | Logger is OTel-friendly; trace/span injection ready |
| Scheduled follow-up delivery | Deferred | Recommendations created; actual scheduled send is future |
| Multi-region deployment | Deferred | Single Render region is sufficient for demo |
| Email attachment processing | Deferred | Text/HTML emails fully supported |
| Admin portal real-time updates | Deferred | Polling works; WebSocket is a future enhancement |
| Automated session cleanup cron | Deferred | Sessions expire naturally; batch cleanup is a nice-to-have |

## Acceptance Checklist

### Automated

- [ ] `npm test` passes all workspaces (158 tests)
- [ ] `npx playwright test` passes E2E suite (6 tests)
- [ ] `npm run build` succeeds across all packages
- [ ] `npm run typecheck` reports no errors
- [ ] `npm run lint` reports no warnings
- [ ] `docker build --target api .` succeeds
- [ ] `docker build --target worker .` succeeds

### Manual Verification

- [ ] Admin login and dashboard navigation works end-to-end
- [ ] Telegram webhook validates secret and processes messages
- [ ] Email webhook handles inbound emails with thread parsing
- [ ] Security scanner blocks malicious skills (os.system, subprocess, eval)
- [ ] Model router selects cheap for simple, strong for complex
- [ ] Receipt extraction handles category clarification flow
- [ ] GHL sub-agent validates editable fields and confirms changes
- [ ] Memory facts persist across 20+ turns
- [ ] Lead follow-up agent finds stale leads and drafts messages
- [ ] All API errors follow `{ error: { code, message } }` shape
- [ ] RBAC: viewer blocked from admin routes
- [ ] CSRF protection enforced on state-changing requests
- [ ] Health endpoints report correct status
- [ ] Integration health shows degraded for unconfigured providers
- [ ] Graceful shutdown drains connections on restart
- [ ] Worker processes jobs from Redis queues

---

## Key Contacts

TBD
