# Final Deployment Checklist

Use this checklist for final handoff and live credential verification. Active runtime code is in `apps/api`, `apps/admin`, `packages/shared`, and `packages/config`. Top-level `backend/` and `frontend/` are legacy reference folders only.

## 1. Environment Setup

- Copy `.env.example` to `.env`.
- Fill required core values: `DATABASE_URL`, `SESSION_SECRET`.
- Fill admin seed values: `ADMIN_SEED_EMAIL`, `ADMIN_SEED_PASSWORD`.
- Fill integration values as available:
  - Telegram: `TELEGRAM_BOT_TOKEN`, `TELEGRAM_WEBHOOK_SECRET`
  - Email: `INBOUND_EMAIL_WEBHOOK_SECRET`, `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM`
  - OpenRouter: `OPENROUTER_API_KEY`
  - GHL: `GHL_API_TOKEN`
  - Google Sheets: `GOOGLE_SERVICE_ACCOUNT_JSON`, `GOOGLE_SHEETS_BOOKKEEPING_SPREADSHEET_ID`
- Set public URLs:
  - Local dev: `APP_BASE_URL`, `API_BASE_URL`, `ADMIN_APP_URL`
  - Render: `PORT=4000`; `RENDER_EXTERNAL_URL` is injected automatically by Render

## 2. Database + Seed

Run in this order:

```bash
npm install
npm run db:generate
npm run db:migrate
npm run seed:admin
```

## 3. Start Runtime Processes

Local:

```bash
docker compose up -d redis
npm run dev:api
npm run dev:worker
npm run dev:admin
```

Production-style:

```bash
npm run build
npm run start:api
npm run start:worker
```

## 4. Verify Base Health

- `GET /health`
- `GET /health/ready`
- `GET /api/v1/integrations/health`
- Admin login at `apps/admin` runtime URL

## 5. Integration Setup

Telegram:
- Confirm `API_BASE_URL` or Render public URL is correct.
- Verify startup log shows webhook ensure attempt.
- Optional manual check:

```bash
curl -X POST "https://api.telegram.org/bot<TOKEN>/setWebhook" \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://<api-domain>/webhooks/telegram",
    "secret_token": "<TELEGRAM_WEBHOOK_SECRET>",
    "allowed_updates": ["message"]
  }'
```

Email:
- Point provider/webhook source to `POST /webhooks/email`
- Send header `X-Email-Webhook-Secret: <INBOUND_EMAIL_WEBHOOK_SECRET>`
- Verify SMTP account can send from `SMTP_FROM`

GHL:
- Validate `GHL_API_TOKEN`
- Use admin conversation flow to search a contact before update

Google Sheets:
- Validate service account JSON shape and spreadsheet sharing
- Confirm target sheet is writable by the service account

## 6. Smoke-Test Order

Run in this order so failures are easier to isolate:

1. Admin login and `/health` / `/health/ready`
2. Telegram instant reply
3. Email inbound webhook + threaded reply
4. Usage page cost/token update
5. Skill disable + blocked malicious skill event
6. Memory persistence and Memory page visibility
7. OpenRouter cheap-vs-strong routing and spend-control behavior
8. GHL lookup/update
9. Receipt extraction + category clarification + Google Sheets append
10. Jobs / Security / Integrations page review

## 7. Demo Walkthrough Order

1. Dashboard and Integrations page
2. Chats conversation detail showing routing / memory / tool metadata
3. Usage page with model/cost breakdown
4. Settings page showing routing controls and built-in tool toggles
5. Skills and Security pages showing runtime blocking
6. Memory page showing durable records
7. GHL or Bookkeeping live flow
8. Jobs page for async visibility

## 8. Final Proof Pack

- Screenshot Integrations page
- Screenshot one conversation with routing + memory metadata
- Screenshot Usage page
- Screenshot Security page
- Screenshot Jobs page
- Note any integrations that remain unverified due to missing credentials
