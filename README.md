# OpenClaw Admin System

OpenClaw Admin System is a monorepo for a multi-channel AI assistant with:
- Telegram + Email channels
- OpenRouter model routing
- Persistent memory
- Security-vetted skill execution
- Sub-agents (GHL CRM, Bookkeeping, Follow-Up)
- Admin portal for operations, usage, skills, jobs, and security events

Runtime source of truth:
- `apps/api` = active backend/API runtime
- `apps/admin` = active admin portal runtime
- `packages/shared` + `packages/config` = active shared contracts/config
- Top-level `backend/` and `frontend/` are legacy reference folders and are not used by the current workspace scripts, Docker targets, or Render deployment.

## 1) Quick Start (Local)

```bash
npm install
cp .env.example .env
# fill required values in .env

npm run db:generate
npm run db:migrate
npm run seed:admin
```

The API, worker, seed script, and admin Vite config all load the repository root `.env` automatically. Existing shell env vars still take precedence.

Start Redis (recommended for reliable queue behavior):

```bash
docker compose up -d redis
```

Run processes:

```bash
# API
npm run dev:api

# Admin portal
npm run dev:admin

# Worker (recommended whenever REDIS_URL is configured)
npm run dev:worker
```

Admin UI: `http://localhost:5173` (`http://127.0.0.1:4173` on Windows by default)  
API: `http://localhost:4000`

## 2) Build and Run (Production-style)

```bash
npm run build
npm run start:api
npm run start:worker
```

## 3) Environment Variables

Use `.env.example` as the canonical list.

Required for startup:
- `DATABASE_URL`
- `SESSION_SECRET`

Strongly recommended for demo reliability:
- `REDIS_URL` (enables BullMQ durability + shared dedupe)
- `OPENROUTER_API_KEY` (AI responses/routing)

Integration-specific credentials:
- Telegram: `TELEGRAM_BOT_TOKEN` (required), `TELEGRAM_WEBHOOK_SECRET` for webhook mode (optional `TELEGRAM_API_BASE_URL`, default `https://api.telegram.org`)
- Email: `INBOUND_EMAIL_WEBHOOK_SECRET`, `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM`
- GHL: `GHL_API_TOKEN` (+ optional `GHL_API_BASE_URL`)
- Google Sheets: `GOOGLE_SERVICE_ACCOUNT_JSON`, `GOOGLE_SHEETS_BOOKKEEPING_SPREADSHEET_ID`

Frontend / hosting / tuning:
- Frontend dev proxy: `VITE_DEV_PROXY_TARGET` (dev server only)
- Frontend dev bind overrides: `VITE_DEV_HOST`, `VITE_DEV_PORT` (dev server only)
- Hosting: `APP_BASE_URL`, `ADMIN_APP_URL`, `API_BASE_URL`, optional `RENDER_EXTERNAL_URL` (Render injects this automatically)
- Tuning: `WORKER_CONCURRENCY`, `REQUEST_TIMEOUT_MS`, `MAX_PAYLOAD_SIZE`
- Admin seed: `ADMIN_SEED_EMAIL`, `ADMIN_SEED_PASSWORD`

## 4) API + Worker Runbook

- API process handles HTTP routes/webhooks and includes fallback async behavior.
- Worker process handles BullMQ queue processing and should be run when `REDIS_URL` is set.
- If Redis is configured but worker is not running, some flows can still run via API fallback paths, but queue durability/retry robustness is reduced.

Health endpoints:
- `GET /health` (liveness)
- `GET /health/ready` (database + redis readiness)
- `GET /api/v1/integrations/health` (integration visibility)

Telegram memory verifier:

```bash
npm run demo:telegram-memory
```

Fast local fallback that skips Telegram delivery:

```bash
npm run demo:telegram-memory -- --internal
```

Optional real-delivery mode for a clean test chat:

```bash
npm run demo:telegram-memory -- --chat-id <telegram_chat_id> --user-id <telegram_user_id> --require-delivery
```

Notes:
- Default mode uses synthetic ids, which gives deterministic memory verification but can log Telegram delivery failure because the chat is not real.
- `--internal` keeps the LLM + orchestration + persistence path but skips webhook ingress and Telegram delivery.
- Real chat mode should only be used with a clean test chat because it updates that user's persisted memory.

## 5) Webhook Setup

Telegram webhook:

```bash
curl -X POST "https://api.telegram.org/bot<TOKEN>/setWebhook" \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://<api-domain>/webhooks/telegram",
    "secret_token": "<TELEGRAM_WEBHOOK_SECRET>",
    "allowed_updates": ["message"]
  }'
```

Local development note:
- If `API_BASE_URL`/`APP_BASE_URL` only point to `localhost`, the API now falls back to Telegram long polling in development.
- To use webhook mode locally, provide a public HTTPS URL (for example, a tunnel) plus `TELEGRAM_WEBHOOK_SECRET`.

Inbound email webhook target:
- `POST https://<api-domain>/webhooks/email`
- Header: `X-Email-Webhook-Secret: <INBOUND_EMAIL_WEBHOOK_SECRET>`

## 6) Submission Artifacts

- Demo checklist: [docs/demo-checklist.md](docs/demo-checklist.md)
- Final deployment checklist: [docs/final-deployment-checklist.md](docs/final-deployment-checklist.md)
- Operator runbook: [docs/runbook.md](docs/runbook.md)
- Handoff summary: [docs/handoff-summary.md](docs/handoff-summary.md)
- Demo contingencies: [docs/demo-contingency.md](docs/demo-contingency.md)
- Deployment guide: [docs/deployment.md](docs/deployment.md)

## 7) Known Release Notes

- Global lint debt exists in untouched legacy files; release pass keeps touched files lint-clean.
- Queue reliability is strongest with Redis + worker process running.
- External integrations require real credentials for live demo proof.
