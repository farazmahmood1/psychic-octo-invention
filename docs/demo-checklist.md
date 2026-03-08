# Demo Checklist

Use this checklist before live handoff.

## Pre-flight

- [ ] `npm run build` succeeds
- [ ] API process running
- [ ] Worker process running (when `REDIS_URL` is set)
- [ ] Admin portal loads and login works
- [ ] `/health` returns `ok`
- [ ] `/health/ready` returns `ready` (or expected degraded state documented)
- [ ] `/api/v1/integrations/health` reviewed for missing credentials

## Core Stories

- [ ] T1 Telegram: send a message and receive assistant response (typing feedback visible)
- [ ] T2 Email: submit inbound email webhook payload, verify job status and threaded reply path
- [ ] UI2 Usage: show token/cost metrics on Usage page
- [ ] UI3 Skills: disable a skill and confirm tool call is blocked
- [ ] SEC1: ingest malicious skill source and show blocked event in Security page
- [ ] T3 Memory: state a fact, run unrelated messages, request recall
- [ ] T4 Routing: show simple prompt (cheap model) vs complex prompt (escalated model) evidence in chat metadata
- [ ] G1 GHL: perform contact update command and show confirmation/log
- [ ] B1 Bookkeeping: process receipt image, set category, append to Google Sheets

## Admin Visibility

- [ ] Dashboard metrics + system health card are visible
- [ ] Jobs page shows status, attempts, last error, and email SLA badge
- [ ] Security page shows blocked events with reason text
- [ ] Conversation detail shows model/tier/tokens/tool/memory metadata badges

## Final Submission Evidence

- [ ] Save screenshots of Integrations, Jobs, Security, Usage, and one conversation with routing/memory badges
- [ ] Note any degraded integrations and why (credentials unavailable, provider outage, etc.)
- [ ] Keep a fallback script ready from `docs/demo-contingency.md`
