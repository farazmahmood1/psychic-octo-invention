# Demo Contingency Plan

Use this during live handoff if an external dependency fails.

## 1) Redis unavailable

Symptoms:
- `/health/ready` shows Redis `unconfigured` or `unavailable`
- Worker cannot start (fatal on startup)

Action:
1. Continue with API-only fallback mode for basic flows.
2. Explicitly state queue durability is reduced in fallback mode.
3. Demo UI observability pages (Conversations, Usage, Security) and non-queue-dependent flows.

## 2) Worker not running

Symptoms:
- Jobs remain pending/retrying longer than expected
- Queue throughput is poor

Action:
1. Start worker process immediately (`npm run start:worker` or `npm run dev:worker`).
2. Confirm worker startup logs and retry pending flow.
3. Use Jobs page to show retries/status transitions.

## 3) GHL credentials invalid

Symptoms:
- GHL sub-agent returns auth/connection error summary
- Integrations page shows GHL degraded/error

Action:
1. Show graceful failure message and action logging.
2. Continue by demonstrating GHL path with mocked/test fixture narrative if live creds are unavailable.
3. Emphasize credential-dependent behavior is isolated to integration layer.

## 4) Google Sheets unavailable

Symptoms:
- Receipt extraction succeeds but export fails
- Bookkeeping flow reports extraction saved but append failed

Action:
1. Show that extraction and category flow still works.
2. Show error surfaced in assistant response and bookkeeping admin/job records.
3. Continue with fallback explanation: export retry after credentials/network recovery.

## 5) Email provider delay/failure

Symptoms:
- Email send fails or retries
- Jobs page shows retrying/failed with last error

Action:
1. Demonstrate observability (attempts, last error, SLA badge).
2. Explain retry/backoff behavior and persisted job state.
3. Continue demo on Telegram/UI/security/routing/memory stories.

## 6) Telegram webhook issue

Symptoms:
- No inbound webhook traffic
- Telegram API webhook info shows wrong URL/secret

Action:
1. Re-register webhook with correct URL/secret.
2. Verify with `getWebhookInfo`.
3. If still blocked, show API-side webhook endpoint and use email/admin stories for remaining demo.

## 7) Malicious skill test not reproducible live

Symptoms:
- Cannot run ingestion endpoint during session

Action:
1. Use Security page historical blocked event evidence.
2. Use existing test output or scripted payload example to explain exact block behavior.
3. Highlight execution guard and audit trail layers.

## 8) Model provider rate-limit/failure

Symptoms:
- LLM calls fail/escalate with warnings
- OpenRouter errors in API logs

Action:
1. Show safe error response path and warning capture.
2. Demonstrate non-LLM admin capabilities (security logs, jobs, integrations, usage history).
3. Retry with lower traffic or alternate model configuration if available.

## Operator Notes

- Always narrate the degraded mode honestly.
- Use admin observability pages as proof of control and transparency.
- Keep at least one end-to-end path ready that does not depend on the failing provider.
