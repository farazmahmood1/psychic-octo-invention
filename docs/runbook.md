# Operator Runbook (API + Worker)

## Runtime Model

- `API`: serves HTTP routes, webhooks, auth/admin APIs, health checks.
- `Worker`: processes BullMQ jobs (orchestration, delivery, email processing, sub-agent jobs).
- `Redis`: required for strongest queue reliability and shared idempotency.

## Start Order

1. Start Postgres
2. Start Redis
3. Run DB migrations
4. Start API process
5. Start Worker process
6. Start Admin frontend/static site

## Local Commands

```bash
npm run db:generate
npm run db:migrate
npm run seed:admin

docker compose up -d redis
npm run dev:api
npm run dev:worker
npm run dev:admin
```

## Production Commands

```bash
npm run build
npm run start:api
npm run start:worker
```

## Health and Checks

- Liveness: `GET /health`
- Readiness: `GET /health/ready`
- Integration status: `GET /api/v1/integrations/health`
- Background jobs: Admin portal `Jobs` page or `GET /api/v1/jobs`

## Expected Warnings

At startup, the API/worker logs integration warnings when critical env vars are missing or placeholder values are detected. Treat these warnings as real operational gaps for demo/production.

## Degraded Modes

- No `REDIS_URL`: API fallback mode only; worker process exits.
- Missing `OPENROUTER_API_KEY`: AI responses/tool orchestration fail.
- Missing SMTP vars: outbound email disabled.
- Missing inbound email webhook secret: inbound email endpoint rejects requests.
- Missing Telegram vars: Telegram webhook unusable.
- Missing GHL/Google credentials: related sub-agent actions fail safely and return error summaries.

## Incident Triage Sequence

1. Check `/health` and `/health/ready`
2. Check API logs for startup warnings or provider errors
3. Check worker logs for queue failures
4. Check `Jobs` page for retries/failures
5. Check `Integrations` page for unconfigured/error state
6. Apply contingency from `docs/demo-contingency.md`
