# Deployment Guide

> Release note: for submission/demo operations, use [README.md](../README.md), [runbook.md](./runbook.md), and [demo-contingency.md](./demo-contingency.md) as the canonical operator guides.

## Architecture Overview

```
                    ┌──────────────┐
                    │  Cloudflare   │
                    │   (CDN/DNS)   │
                    └──────┬───────┘
                           │
         ┌─────────────────┼─────────────────┐
         │                 │                 │
┌────────▼────────┐ ┌─────▼──────┐ ┌────────▼────────┐
│ Admin Frontend   │ │ API Server │ │ Worker Process   │
│ (Render Static)  │ │ (Render)   │ │ (Render Worker)  │
│ Vite + React     │ │ Express    │ │ BullMQ Processor │
└─────────────────┘ └─────┬──────┘ └────────┬────────┘
                           │                 │
              ┌────────────┴─────────────────┘
              │                         │
    ┌─────────▼─────────┐   ┌──────────▼──────────┐
    │   Neon Postgres    │   │      Redis           │
    │   (Managed DB)     │   │   (BullMQ Queues)    │
    └───────────────────┘   └─────────────────────┘
```

### Service Roles

| Service | Role | Scales |
|---------|------|--------|
| **API** | HTTP endpoints, webhooks, health checks | Horizontally |
| **Worker** | Background job processing (orchestration, delivery, sub-agents) | Horizontally |
| **Admin** | Static SPA served via CDN | N/A (static) |
| **Postgres** | Persistent storage | Managed by Neon |
| **Redis** | Job queues, deduplication caches | Managed by Render |

## Prerequisites

- Node.js 20+, npm 10+
- Docker (for local Redis)
- Render.com account (for deployment)
- Neon Postgres database (or any Postgres 16+)
- Redis 7+ instance

## Environment Variables

See `.env.example` for the full list. All integration-specific variables are **optional** — the system boots in degraded mode when a provider is unconfigured.

The API, worker, seed script, and admin Vite config load the repository root `.env` automatically for local development. Render-managed env vars still override file values.

### Required (system will not start without these)

| Variable | Description | Example |
|----------|-------------|---------|
| `DATABASE_URL` | Postgres connection string | `postgresql://user:pass@host/db` |
| `SESSION_SECRET` | Min 32 chars, cryptographically random | `openssl rand -hex 32` |

### Optional Integration Variables

| Variable | Integration | Default |
|----------|------------|---------|
| `REDIS_URL` | BullMQ queues | *(sync mode if unset)* |
| `OPENROUTER_API_KEY` | LLM routing | *(no AI features)* |
| `TELEGRAM_BOT_TOKEN` + `TELEGRAM_WEBHOOK_SECRET` | Telegram bot | *(webhook disabled)* |
| `TELEGRAM_API_BASE_URL` | Telegram API base URL override | `https://api.telegram.org` |
| `SMTP_HOST` + `SMTP_USER` + `SMTP_PASS` + `SMTP_FROM` | Email | *(email disabled)* |
| `INBOUND_EMAIL_WEBHOOK_SECRET` | Inbound email | *(webhook disabled)* |
| `GHL_API_TOKEN` | GoHighLevel CRM | *(CRM disabled)* |
| `GOOGLE_SERVICE_ACCOUNT_JSON` + `GOOGLE_SHEETS_BOOKKEEPING_SPREADSHEET_ID` | Bookkeeping | *(sheets disabled)* |

### Frontend / Hosting Variables

| Variable | Purpose | Notes |
|----------|---------|-------|
| `VITE_DEV_PROXY_TARGET` | Admin Vite dev proxy target | Local dev only; not used in static production builds |
| `APP_BASE_URL` | Public API base used in provider/webhook metadata | Should be public HTTPS in production |
| `ADMIN_APP_URL` | Allowed admin origin for CORS | Must match deployed admin URL |
| `API_BASE_URL` | Preferred public API URL for webhook registration | Used before Render auto-discovery |
| `RENDER_EXTERNAL_URL` | Render-provided public API URL | Auto-injected by Render; used for Telegram webhook fallback |

### Performance Tuning

| Variable | Description | Default |
|----------|-------------|---------|
| `WORKER_CONCURRENCY` | Jobs processed in parallel per worker | `5` |
| `REQUEST_TIMEOUT_MS` | API request timeout (ms) | `30000` |
| `MAX_PAYLOAD_SIZE` | Max request body size | `2mb` |

## Local Development

```bash
# 1. Install dependencies
npm install

# 2. Generate Prisma client
npm run db:generate

# 3. Run database migrations
npm run db:migrate

# 4. Seed initial admin user
npm run seed:admin

# 5. Start Redis (Docker)
docker compose up -d redis

# 6. Start processes
npm run dev:api     # API at http://localhost:4000
npm run dev:admin   # Admin at http://localhost:5173
npm run dev:worker  # Worker (recommended when REDIS_URL is set)

# `npm run dev` starts workspace dev scripts (API + Admin), but does not start worker.
```

### Docker Development

```bash
docker compose up         # All services (API, Worker, Admin, Redis)
docker compose up -d      # Detached mode
docker compose logs -f    # Follow logs
```

## Database Management

```bash
npm run db:generate      # Generate Prisma client after schema changes
npm run db:migrate       # Create and apply migration (development)
npm run db:migrate:prod  # Apply pending migrations (production)
npm run db:studio        # Open Prisma Studio (DB GUI)
npm run seed:admin       # Seed initial admin user
```

## Building for Production

```bash
npm run build            # Build all workspaces
npm run build:api        # TypeScript compilation (API)
npm run build:admin      # Vite production build (Admin)
```

### Docker Images

```bash
# Build all targets
docker build --target api -t openclaw-api .
docker build --target worker -t openclaw-worker .
docker build --target admin -t openclaw-admin .
docker build --target migrate -t openclaw-migrate .

# Run migration
docker run --rm -e DATABASE_URL="..." openclaw-migrate

# Run API
docker run -p 4000:4000 --env-file .env openclaw-api

# Run Worker
docker run --env-file .env openclaw-worker
```

## Testing

```bash
npm test                 # All unit & integration tests (158 tests)
npm run typecheck        # Type check all workspaces
npm run lint             # Lint all files
npm run predeploy        # Full pre-deployment check (lint + typecheck + test + build)

# E2E tests
npx playwright install chromium
npx playwright test
```

See `docs/handoff.md` for detailed test coverage matrix.

## Render.com Deployment

The `render.yaml` blueprint defines all services. Deploy via Render Dashboard > New > Blueprint.

### Services

| Service | Type | Docker Target | Health Check |
|---------|------|---------------|-------------|
| `openclaw-api` | Web Service | `api` | `GET /health` |
| `openclaw-worker` | Worker | `worker` | *(process health)* |
| `openclaw-admin` | Static Site | *(npm build)* | N/A |
| `openclaw-redis` | Redis | N/A | Built-in |
| `openclaw-db` | Postgres 16 | N/A | Built-in |

### Pre-deploy

Database migrations run automatically via `preDeployCommand` in `render.yaml`:
```
npx prisma migrate deploy --schema=prisma/schema.prisma
```

### First Deployment

1. Push code to GitHub
2. Connect repo in Render Dashboard > New > Blueprint
3. Set manual env vars (marked `sync: false` in render.yaml)
4. Deploy
5. Run admin seed: `npm run seed:admin` (via Render shell)
6. Register Telegram webhook (see below)
7. Configure email provider forwarding (see below)

## Telegram Bot Setup

1. Create bot via [@BotFather](https://t.me/BotFather)
2. Set `TELEGRAM_BOT_TOKEN` and `TELEGRAM_WEBHOOK_SECRET` env vars
3. Register webhook after deployment:
   ```bash
   curl -X POST "https://api.telegram.org/bot<TOKEN>/setWebhook" \
     -H "Content-Type: application/json" \
     -d '{
       "url": "https://<your-api-domain>/webhooks/telegram",
       "secret_token": "<your-webhook-secret>",
       "allowed_updates": ["message"],
       "max_connections": 40
     }'
   ```
4. Verify: `curl "https://api.telegram.org/bot<TOKEN>/getWebhookInfo"`

## Email Integration Setup

1. Configure SMTP credentials (`SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM`)
2. Set `INBOUND_EMAIL_WEBHOOK_SECRET`
3. Configure email provider (SendGrid Inbound Parse, Mailgun) to forward to:
   ```
   POST https://<your-api-domain>/webhooks/email
   Header: X-Email-Webhook-Secret: <your-webhook-secret>
   ```
4. Expected payload format: see `docs/api-spec.md` > Webhooks > Email

## GHL CRM Setup

1. Obtain GHL API token from GoHighLevel dashboard
2. Set `GHL_API_TOKEN` env var
3. Optionally set `GHL_API_BASE_URL` (defaults to `https://rest.gohighlevel.com/v1`)
4. Verify via admin portal > Integrations > Health

## Google Sheets Setup

1. Create a Google Cloud service account with Sheets API enabled
2. Share the target spreadsheet with the service account email
3. Set `GOOGLE_SERVICE_ACCOUNT_JSON` (full JSON) and `GOOGLE_SHEETS_BOOKKEEPING_SPREADSHEET_ID`

## Post-Deployment Checklist

1. `GET /health` returns 200 with `status: "ok"`
2. `GET /health/ready` returns `status: "ready"` with database + redis checks
3. Admin user seeded (`npm run seed:admin`)
4. Admin portal accessible and login works
5. Telegram webhook registered and receiving
6. Email provider forwarding configured
7. `GET /api/v1/integrations/health` shows integration statuses
8. Worker process running (check Render worker logs)
9. Send test Telegram message — verify response
10. Send test email — verify threaded reply

## Graceful Shutdown

Both API and Worker handle `SIGTERM`/`SIGINT` gracefully:
1. Stop accepting new connections/jobs
2. Drain in-flight requests/jobs (15s API, 30s Worker)
3. Close Redis connections
4. Disconnect Prisma
5. Exit cleanly

This ensures zero-downtime deployments on Render.

## Monitoring

- **Logs**: Structured JSON via pino (any log aggregator compatible)
- **Health**: `/health` (liveness), `/health/ready` (readiness + DB + Redis)
- **Integration Health**: `/api/v1/integrations/health` (all providers)
- **Audit**: All admin actions in `audit_logs` table
- **Usage**: Per-request token/cost tracking in `usage_logs` table
- **Jobs**: Background job status via `/api/v1/jobs`
- **Secret Redaction**: Passwords, tokens, and API keys are automatically redacted in logs

## Troubleshooting

| Issue | Check |
|-------|-------|
| 502 Bad Gateway | API health endpoint, startup logs, Render service status |
| DB connection error | `DATABASE_URL`, Neon dashboard, connection pool limits |
| Redis connection error | `REDIS_URL`, Redis instance status |
| Worker not processing | Worker service running, Redis connectivity, worker logs |
| Telegram not receiving | Webhook URL correct, `TELEGRAM_WEBHOOK_SECRET` match, bot token valid |
| Email not processing | `INBOUND_EMAIL_WEBHOOK_SECRET`, provider config, SMTP credentials |
| CORS errors | `ADMIN_APP_URL` matches actual frontend URL exactly |
| Session not persisting | `SESSION_SECRET` length (min 32), cookie `Secure` flag in prod |
| 408 Request Timeout | Increase `REQUEST_TIMEOUT_MS`, check slow DB queries |
| 429 Too Many Requests | Global rate limit (200/min), login rate limit (10/15min) |
| Degraded health | Check `/health/ready` — individual check statuses shown |
| Integration unconfigured | Set required env vars — system runs in degraded mode without them |
