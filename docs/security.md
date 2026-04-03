# Security

## Principles

- Admin-only access — no public-facing auth
- Session cookies with HttpOnly, Secure, SameSite=Lax
- CSRF protection via double-submit cookie pattern
- Rate limiting on login endpoint
- Skill vetting before execution (Phase 6)
- Audit logging for all auth events
- Secrets never hardcoded — env vars only

## Authentication

### Session Management

- Sessions are stored in the `admin_sessions` Postgres table via Prisma.
- Session tokens are 32-byte random hex strings (via `crypto.randomBytes`).
- Tokens are SHA-256 hashed before storage — a DB leak does not expose valid tokens.
- Session cookie (`nexclaw.sid`): HttpOnly, Secure (production), SameSite=Lax, 24h max age.
- Session is validated on every request via `sessionMiddleware`.
- Expired sessions are rejected and cleaned up.

### Password Security

- Passwords hashed with Argon2id (via the `argon2` npm package).
- Password policy: minimum 12 characters, at least 1 uppercase, 1 lowercase, 1 number, 1 symbol.
- Passwords are never logged or returned in API responses.
- On password change, all sessions for the admin are invalidated.

### CSRF Protection

- Double-submit cookie pattern.
- On login, a CSRF token cookie (`nexclaw.csrf`) is set — readable by JS (not HttpOnly).
- State-changing requests (POST/PUT/PATCH/DELETE) must include `x-csrf-token` header matching the cookie.
- Comparison uses `crypto.timingSafeEqual` to prevent timing attacks.
- SameSite=Lax provides additional defense against cross-origin form submissions.

### Rate Limiting

- Login endpoint is rate-limited to 10 attempts per 15-minute window.
- Rate limit key combines IP address and email to prevent distributed attacks on a single account.

## RBAC

Three roles with hierarchical permissions:

| Role | Level | Description |
|---|---|---|
| `super_admin` | 3 | Full system access, manages other admins |
| `admin` | 2 | Full operational access |
| `viewer` | 1 | Read-only access |

Use `requireRole('admin')` middleware to gate endpoints by minimum role level.

## Audit Logging

Auth events are logged to the `audit_logs` table:

- `auth.login_success` — successful login
- `auth.login_failed` — failed login attempt (with reason)
- `auth.logout` — session logout
- `auth.password_changed` — password change
- `auth.password_change_failed` — failed password change attempt

All audit entries include IP address and user agent.

## Error Handling

Auth error responses use generic messages to avoid leaking information:
- Login failure always returns "Invalid email or password" regardless of whether the email exists.
- Rate limit responses indicate "Too many login attempts" without specifics.

---

## Skill Security System

### Vetting Pipeline

Every skill passes through a multi-layered vetting pipeline before execution:

```
Skill Ingestion (POST /api/v1/skills/ingest)
  |
  +-- 1. Validate metadata (Zod schema)
  +-- 2. Compute SHA-256 code hash
  +-- 3. Static analysis scan (pattern matching)
  +-- 4. Policy evaluation (allowlist/denylist rules)
  +-- 5. Persist skill + version + vetting result
  +-- 6. Audit log entry
  |
  +-- Result: approved / warning / blocked
```

### Static Analysis Scanner

30+ built-in rules across 8 categories:

| Category | Examples | Severity |
|---|---|---|
| `os_command` | `os.system()`, `os.popen()`, `os.exec*()` | Critical |
| `shell_exec` | `child_process`, `exec()`, `spawn()`, `fork()` | Critical |
| `subprocess` | `subprocess.call()`, `subprocess.Popen()` | Critical |
| `dynamic_code` | `eval()`, `new Function()`, `exec('...')` | Critical |
| `filesystem` | `writeFileSync()`, `unlinkSync()`, path traversal | High |
| `env_access` | `process.env`, `os.environ`, `os.getenv()` | High |
| `import_risk` | `require('child_process')`, `import os` | High-Critical |
| `network` | `fetch()`, `axios()`, `WebSocket` | Medium |

### Policy Engine

Configurable policy with allowlist/denylist:

- **allowedRuleIds**: Suppress specific rules (false positive handling)
- **allowedCategories**: Suppress entire categories
- **customDenyRules**: Add custom detection rules
- **blockThreshold**: Minimum severity to block (`critical`, `high`, `medium`, `low`)
- **allowWarnings**: Whether medium/low risks are permitted

### Enforcement Points

1. **Ingestion**: Failed skills are stored but not set as current version
2. **Enable toggle**: Rejects enabling skills without passed vetting (422)
3. **Runtime guard**: `SkillExecutionGuard` checks enabled + vetted + hash match before execution
4. **Tool resolution**: Orchestration `resolveTools()` filters out blocked skills

### Manual Override

Only `super_admin` can override vetting results. Overrides:
- Require a reason (min 10 chars)
- Create a new audit record with `reviewerType: 'manual'`
- Allow `passed` or `warning` only (not `failed`)

### Hash Integrity

- SHA-256 computed at ingestion, stored on version and vetting record
- Verified at runtime before execution
- Mismatch triggers block + audit entry

### Skill Security Audit Actions

| Action | When |
|---|---|
| `skill.ingested` | Skill passes vetting |
| `skill.ingestion_blocked` | Skill fails vetting |
| `skill.enabled` / `skill.disabled` | Enable/disable toggle |
| `skill.manual_override` | Super admin overrides vetting |
| `skill.execution_blocked` | Runtime execution prevented |

---

## Production Hardening

### HTTP Security Headers

Managed via `helmet` middleware:
- `Content-Security-Policy`: Restrictive CSP with `default-src 'self'`
- `X-Frame-Options`: `DENY` (no iframe embedding)
- `X-Content-Type-Options`: `nosniff`
- `Referrer-Policy`: `strict-origin-when-cross-origin`
- `Strict-Transport-Security`: HSTS enabled in production

### CORS

- Origin restricted to `ADMIN_APP_URL` only
- Credentials enabled for cookie-based sessions
- Explicit method and header allowlists
- Preflight cache: 24 hours

### Rate Limiting

| Endpoint | Limit | Window |
|----------|-------|--------|
| Login (`POST /auth/login`) | 10 requests | 15 minutes |
| Global API | 200 requests | 1 minute |

Rate limit key for login combines IP + email to prevent distributed brute force attacks.

### Request Limits

- **Body size**: Configurable via `MAX_PAYLOAD_SIZE` (default: 2MB)
- **Request timeout**: Configurable via `REQUEST_TIMEOUT_MS` (default: 30s)
- **Webhook routes**: Exempt from request timeout (may trigger long orchestration)

### Secret Redaction

All log output automatically redacts:
- `authorization` headers
- `cookie` headers
- CSRF tokens
- Password fields
- Session tokens
- API keys

### Docker Security

- Production containers run as non-root user (`appuser`)
- Minimal base image (`node:20-slim`)
- No dev dependencies in production images
- OpenSSL installed for Prisma TLS connections

### Graceful Degradation

The system boots safely when optional integrations are unconfigured:
- Missing `OPENROUTER_API_KEY` → AI features disabled, health shows "unconfigured"
- Missing `TELEGRAM_BOT_TOKEN` → Telegram webhook disabled
- Missing `SMTP_*` → Email delivery disabled
- Missing `GHL_API_TOKEN` → CRM sub-agent disabled
- Missing `GOOGLE_SERVICE_ACCOUNT_JSON` → Bookkeeping disabled
- Missing `REDIS_URL` → Jobs process synchronously (no queue)

Integration status is visible in the admin portal via `/api/v1/integrations/health`.

---

## First Admin Bootstrap

The initial super_admin account is created via the `scripts/seed-admin.ts` script using env vars (`ADMIN_SEED_EMAIL`, `ADMIN_SEED_PASSWORD`). This is intentionally not exposed as an API endpoint to prevent it from becoming a security hole in production. The script is idempotent — it skips if the admin already exists.

A `/auth/bootstrap-first-admin` endpoint was omitted because:
1. It would need complex guards (check if any admin exists, disable after first use).
2. Race conditions could allow multiple admins to be created.
3. The seed script approach is simpler, more secure, and sufficient for deployment pipelines.
