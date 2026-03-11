# Handoff Summary

## Architecture Snapshot

- `apps/api`: Express API, webhooks, orchestration, security, sub-agent services, queue integration.
- `apps/api/src/worker.ts`: standalone worker entry for BullMQ queue processing.
- `apps/admin`: React admin portal (conversations, usage, skills, security, jobs, integrations).
- `packages/shared`: shared types/schemas/constants.
- `packages/config`: env validation + logger config.
- Top-level `backend/` and `frontend/` are legacy reference directories only; current runtime, tests, Docker targets, and Render deploys use the `apps/*` workspace paths above.

## Request Flow (Telegram/Email)

1. Webhook receives inbound payload
2. Event normalization
3. Orchestration pipeline:
   - conversation/message persistence
   - memory retrieval
   - model routing
   - LLM call + tool/sub-agent dispatch
   - follow-up LLM synthesis
4. Outbound message persistence + usage logging
5. Channel delivery and status updates
6. Admin observability via Conversations/Jobs/Usage/Security pages

## Security Model

- Skill ingestion static scan + policy decision
- Vetting status enforcement before enablement
- Execution-time integrity checks (source/hash)
- Disabled/unvetted/unapproved skills blocked at runtime
- Audit events for blocked/failed execution and ingestion

## Reliability Model

- Strongest mode: Redis + worker process + API process
- Fallback mode exists when Redis is missing, but durability and cross-instance guarantees are reduced
- Email processing includes retry/backoff and persisted job states

## What to Tell Reviewers

- The system prioritizes safe failure over silent behavior.
- Integrations can run in degraded mode, and the admin UI surfaces that state.
- Routing and memory behavior are demonstrable directly in conversation detail metadata.
- Queue-backed reliability requires worker + Redis to be fully effective.
