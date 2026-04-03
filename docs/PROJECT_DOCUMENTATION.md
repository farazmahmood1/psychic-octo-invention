# NexClaw Admin System - Comprehensive Project Documentation

## Table of Contents

1. [Project Overview](#1-project-overview)
2. [Core Features](#2-core-features)
3. [Technology Stack](#3-technology-stack)
4. [Third-Party Libraries & Dependencies](#4-third-party-libraries--dependencies)
5. [Project Architecture](#5-project-architecture)
6. [Environment Configuration](#6-environment-configuration)
7. [Database Overview](#7-database-overview)
8. [Setup & Installation Guide](#8-setup--installation-guide)
9. [Deployment Notes](#9-deployment-notes)
10. [Additional Important Information](#10-additional-important-information)

---

## 1. Project Overview

### What Is NexClaw Admin System?

NexClaw Admin System is a **production-ready, AI-powered admin platform** designed to serve as a centralized command center for managing multi-channel customer communications, AI-driven automation, and business operations. It enables a team to interact with customers through Telegram and Email, with an AI orchestration layer that intelligently routes messages, processes receipts, manages CRM contacts, and follows up on stale leads -- all monitored through a secure admin portal.

### What Problem Does It Solve?

Businesses that communicate with clients across multiple channels (Telegram, email) face several challenges:

- **Fragmented conversations**: Messages spread across platforms with no unified view.
- **Manual follow-ups**: Leads go cold because no one tracks unanswered messages.
- **Repetitive tasks**: Bookkeeping receipts, CRM updates, and data entry consume hours of manual work.
- **No AI governance**: Running AI skills without security vetting introduces risk.
- **Lack of visibility**: No centralized dashboard for usage metrics, costs, or audit trails.

NexClaw solves all of these by providing:

- A **unified AI orchestration layer** that receives messages from any channel, routes them to the appropriate LLM model, and dispatches tasks to specialized sub-agents.
- An **admin portal** for monitoring conversations, viewing analytics, managing AI skills, and tracking system health.
- **Three purpose-built sub-agents**: CRM management (GoHighLevel), bookkeeping (receipt extraction to Google Sheets), and automated lead follow-up.
- A **skill vetting pipeline** that scans and blocks malicious code before any AI skill can execute.

### How the Platform Works (High-Level)

```
                         Inbound Messages
                    (Telegram / Email Webhooks)
                              |
                              v
                    +-------------------+
                    |   API Server      |
                    |   (Express.js)    |
                    +--------+----------+
                             |
                    +--------v----------+
                    |  BullMQ Queue     |
                    |   (Redis)         |
                    +--------+----------+
                             |
                    +--------v----------+
                    |  Worker Process   |
                    |  (Orchestration)  |
                    +--------+----------+
                             |
              +--------------+--------------+
              |              |              |
     +--------v---+  +------v------+  +----v--------+
     | Model      |  | Sub-Agent   |  | Memory      |
     | Router     |  | Dispatcher  |  | System      |
     | (LLM pick) |  | (GHL/BKP/  |  | (Facts DB)  |
     +--------+---+  | FollowUp)  |  +-------------+
              |       +------+------+
              v              v
     +--------+---+  +------+------+
     | OpenRouter |  | External    |
     | (LLM API)  |  | APIs (GHL,  |
     +-----------+   | Sheets,etc) |
                     +-------------+
              |
              v
     Reply delivered back via original channel
              |
              v
     +-------------------+
     |  Admin Portal     |
     |  (React SPA)      |
     |  Monitors all     |
     |  activity         |
     +-------------------+
```

**Flow Summary:**

1. A message arrives via Telegram webhook or Email webhook.
2. The API server validates the webhook secret and enqueues a job.
3. The worker picks up the job and runs the orchestration pipeline.
4. The orchestrator resolves conversation context, retrieves memories, routes to the appropriate LLM model, and calls the AI.
5. If the AI invokes tools (CRM lookup, receipt processing, follow-up scan), the sub-agent dispatcher handles them.
6. The AI's reply is delivered back through the original channel.
7. Usage, costs, and audit events are logged.
8. Admins monitor everything through the React admin portal.

---

## 2. Core Features

### 2.1 Multi-Channel Messaging

| Channel | Direction | Description |
|---------|-----------|-------------|
| **Telegram** | Inbound + Outbound | Bot receives messages via webhook, replies via Telegram Bot API |
| **Email** | Inbound + Outbound | Receives via inbound webhook (SendGrid/Mailgun), replies via SMTP with proper threading |

Both channels are normalized into a unified `InboundEvent` format before entering the orchestration pipeline. Conversations are tracked per-channel with deduplication to prevent double-processing.

### 2.2 AI Orchestration with Model Routing

The system uses **OpenRouter** as its LLM gateway, enabling access to multiple AI models. A model router automatically selects the appropriate model based on message complexity:

| Tier | Model Example | Used For |
|------|---------------|----------|
| **Cheap** | `google/gemini-2.5-flash` | Simple greetings, quick answers |
| **Standard** | Default model | Regular conversations, moderate complexity |
| **Strong** | `anthropic/claude-opus-4` | Complex analysis, multi-step reasoning |

The routing decision considers: message length, attachment presence, vision requirements, tool use needs, and estimated complexity. If a model fails, the system escalates to the next tier automatically.

### 2.3 Three Specialized Sub-Agents

#### GHL CRM Sub-Agent
- **Search contacts** by name, email, or phone in GoHighLevel CRM
- **View contact details** with full profile information
- **Update contact fields** with validation (only allowed fields: email, phone, firstName, lastName, customFields)
- Handles ambiguous matches by asking for clarification
- All operations are logged to `ghl_action_logs` for audit

#### Bookkeeping Sub-Agent
- **Process receipt images** sent via Telegram using vision capabilities
- **Extract data**: vendor, amount, date, currency, tax, suggested category
- **Clarification flow**: If category is unclear, asks user to confirm
- **Append to Google Sheets** with idempotency keys to prevent duplicates
- Tracks confidence scores on extractions

#### Lead Follow-Up Sub-Agent
- **Detect stale leads**: Scans conversations for unanswered messages older than 5 days (configurable)
- **Draft follow-up messages**: Generates contextual follow-up drafts for review
- **Human-in-the-loop approval**: Messages require explicit approval before sending
- Supports multiple tones: friendly, professional, gentle reminder, urgent
- Tracks follow-up outcomes and history

### 2.4 Admin Portal

The admin portal is a React single-page application with 11 feature pages:

| Page | Purpose |
|------|---------|
| **Dashboard** | KPI metrics (active chats, messages today, API cost MTD, active skills) + recent activity feed |
| **Conversations** | Filterable list of all conversations with search, channel/status filters, pagination |
| **Conversation Detail** | Message thread view with inbound/outbound bubbles, timestamps, attachments |
| **Usage** | Token/cost analytics with timeseries charts, model breakdown, provider stats |
| **Skills** | Grid of AI skills with enable/disable toggle, vetting status, source info |
| **Jobs** | Background job monitoring with queue/status filters, attempt tracking |
| **Bookkeeping** | Receipt extraction tracking with status, confidence, category, export info |
| **Audit** | Append-only audit log with action/actor/target filters, metadata details |
| **Security** | Blocked skill attempts and manual vetting override history |
| **Integrations** | Health status of all 7 external integrations |
| **Settings** | Profile management, password change, model routing configuration |

### 2.5 Security & Skill Vetting

Every AI skill passes through a multi-layered security pipeline before execution:

1. **Static Analysis Scanner**: 71 built-in rules across 8 categories detect dangerous patterns (OS commands, shell execution, dynamic code eval, filesystem access, environment access, risky imports, network access).
2. **Policy Engine**: Configurable allowlists/denylists with severity thresholds determine if a skill is approved, warned, or blocked.
3. **Runtime Execution Guard**: Before any skill runs, the guard verifies it is enabled, has passed vetting, and its code hash hasn't changed since vetting.
4. **Audit Trail**: Every ingestion, block, override, and execution event is logged.

### 2.6 Role-Based Access Control (RBAC)

Three admin roles with hierarchical permissions:

| Role | Level | Access |
|------|-------|--------|
| `super_admin` | 3 | Full system access + manual vetting overrides + admin management |
| `admin` | 2 | Full operational access (skills, jobs, security, bookkeeping) |
| `viewer` | 1 | Read-only access (conversations, usage, audit, integrations) |

### 2.7 Memory System

The orchestration layer extracts and stores facts from conversations as `MemoryRecord` entries. When composing prompts for subsequent messages, relevant memories are retrieved and injected into the system prompt, allowing the AI to recall user preferences and context across 20+ turns of unrelated conversation.

### 2.8 Comprehensive Audit Logging

All significant system events are logged to an append-only `audit_logs` table:

- Authentication events (login success/failure, logout, password change)
- Skill lifecycle (ingestion, blocking, enabling, disabling, manual overrides)
- Admin actions with IP address and user agent tracking

### 2.9 Integration Health Monitoring

The system monitors the health of all 7 external integrations and reports their status through a dedicated API endpoint and admin portal page:

- **Database** (Postgres) -- live connectivity check
- **Redis** -- ping health check
- **OpenRouter** (LLM) -- API key configured check
- **Telegram** -- bot token configured check
- **Email** (SMTP) -- credentials configured check
- **GoHighLevel CRM** -- API token configured check
- **Google Sheets** -- service account configured check

Unconfigured integrations report `unconfigured` status; the system continues operating in degraded mode rather than crashing.

---

## 3. Technology Stack

### Frontend

| Technology | Version | Purpose |
|-----------|---------|---------|
| **React** | ^18.3 | UI component library |
| **TypeScript** | ^5.4 | Static typing for JavaScript |
| **Vite** | ^5.2 | Build tool and dev server |
| **Tailwind CSS** | ^3.4 | Utility-first CSS framework |
| **shadcn/ui** | (components) | Pre-built accessible UI components (Button, Badge, Card, Input, Select, Skeleton) |
| **React Router** | ^6.22 | Client-side routing with nested layouts |
| **Lucide React** | ^0.344 | Icon library (24+ icons used) |

### Backend

| Technology | Version | Purpose |
|-----------|---------|---------|
| **Node.js** | 20+ | JavaScript runtime |
| **Express** | ^4.21 | HTTP framework |
| **TypeScript** | ^5.4 | Static typing |
| **Prisma** | ^5.12 | ORM and database toolkit |
| **BullMQ** | ^5.70 | Redis-backed job queue system |
| **Pino** | ^9.0 | Structured JSON logging |
| **Zod** | ^3.22 | Runtime schema validation |
| **Argon2** | ^0.44 | Password hashing (Argon2id algorithm) |

### Database & Infrastructure

| Technology | Version | Purpose |
|-----------|---------|---------|
| **PostgreSQL** | 16+ | Primary database (Neon managed recommended) |
| **Redis** | 7+ | Job queues, deduplication caches |
| **Docker** | -- | Containerization (multi-stage builds) |
| **Render.com** | -- | Cloud deployment platform |
| **GitHub Actions** | -- | CI/CD pipeline |

### External Services

| Service | Purpose |
|---------|---------|
| **OpenRouter** | LLM gateway for multi-model AI access |
| **Telegram Bot API** | Bot messaging channel |
| **SMTP (any provider)** | Outbound email delivery |
| **SendGrid/Mailgun** | Inbound email webhook forwarding |
| **GoHighLevel (GHL)** | CRM contact management |
| **Google Sheets API** | Bookkeeping ledger export |

---

## 4. Third-Party Libraries & Dependencies

### Backend (apps/api)

| Library | Purpose | Why Chosen |
|---------|---------|------------|
| `express` | HTTP framework | Industry standard, extensive middleware ecosystem, well-documented |
| `@prisma/client` | Database ORM | Type-safe queries, auto-generated from schema, excellent migration system |
| `bullmq` | Job queue | Redis-backed, supports retry/backoff, concurrency control, job prioritization |
| `pino` + `pino-http` | Structured logging | Fastest Node.js logger, JSON output compatible with any log aggregator |
| `argon2` | Password hashing | Memory-hard algorithm resistant to GPU/ASIC attacks, recommended by OWASP |
| `helmet` | Security headers | Sets CSP, X-Frame-Options, HSTS, and other HTTP security headers |
| `cors` | CORS handling | Configurable origin/credentials/methods allowlists |
| `cookie-parser` | Cookie parsing | Required for session cookie authentication |
| `express-rate-limit` | Rate limiting | Protects login and API endpoints from brute force |
| `nodemailer` | SMTP client | Most popular Node.js email library with full SMTP support |
| `zod` | Schema validation | TypeScript-first validation with excellent type inference |
| `uuid` | UUID generation | RFC-compliant unique ID generation for request tracking |

### Frontend (apps/admin)

| Library | Purpose | Why Chosen |
|---------|---------|------------|
| `react` + `react-dom` | UI framework | Component-based architecture, large ecosystem |
| `react-router-dom` | Client routing | Declarative routing with nested layouts and protected routes |
| `@radix-ui/react-slot` | Component composition | Used by shadcn/ui for slot-based component composition |
| `class-variance-authority` | Component variants | Type-safe component variant definitions (e.g., button sizes/colors) |
| `clsx` + `tailwind-merge` | Class management | Merge Tailwind classes without conflicts |
| `lucide-react` | Icons | Tree-shakable, consistent icon set |
| `tailwindcss-animate` | Animations | Tailwind plugin for CSS animations (skeleton loading, etc.) |

### Shared Packages

| Library | Package | Purpose |
|---------|---------|---------|
| `zod` | @nexclaw/shared | Request/response validation schemas shared between frontend and backend |
| `pino` | @nexclaw/config | Structured logger configuration |

### Development Tools

| Tool | Purpose |
|------|---------|
| `typescript` ^5.4 | Static type checking across all workspaces |
| `eslint` ^8.57 | Code linting with TypeScript and React rules |
| `prettier` ^3.2 | Code formatting |
| `vitest` ^4.0 | Unit and integration testing (fast, Vite-native) |
| `@testing-library/react` | React component testing utilities |
| `@playwright/test` ^1.58 | End-to-end browser testing |
| `tsx` ^4.7 | TypeScript execution without compilation (dev mode) |
| `supertest` ^7.2 | HTTP assertion library for API testing |

---

## 5. Project Architecture

### 5.1 Monorepo Structure

The project uses **npm workspaces** to manage a monorepo with 4 packages:

```
nexclaw-admin-system/
|
+-- apps/
|   +-- api/                    # Backend: Express REST API + webhooks + workers
|   +-- admin/                  # Frontend: React admin portal (Vite SPA)
|
+-- packages/
|   +-- shared/                 # Shared types, Zod schemas, constants
|   +-- config/                 # Environment validation, logger, auth config
|
+-- prisma/
|   +-- schema.prisma           # Database schema (24 models, 23 enums)
|   +-- migrations/             # Database migration history
|
+-- scripts/
|   +-- seed-admin.ts           # Initial admin user creation
|   +-- pre-deploy.sh           # Pre-deployment validation
|   +-- healthcheck.sh          # Post-deploy health verification
|   +-- build.sh                # Build all workspaces
|   +-- dev.sh                  # Start development environment
|   +-- migrate.sh              # Run database migrations
|
+-- e2e/                        # Playwright end-to-end tests
+-- docs/                       # Project documentation
+-- .github/workflows/ci.yml    # GitHub Actions CI pipeline
+-- Dockerfile                  # Multi-stage Docker build (6 targets)
+-- docker-compose.yml          # Local development services
+-- render.yaml                 # Render.com deployment blueprint
+-- package.json                # Root workspace configuration
+-- tsconfig.base.json          # Shared TypeScript configuration
+-- .eslintrc.json              # Shared ESLint configuration
```

**Why this structure?**

- **Shared packages** (`@nexclaw/shared`, `@nexclaw/config`) prevent code duplication between frontend and backend. Type definitions, validation schemas, and constants are defined once and imported everywhere.
- **Workspace separation** keeps the API, admin UI, and shared libraries independently buildable and testable.
- **Monorepo** simplifies dependency management, ensures consistent versions, and enables atomic changes across packages.

---

### 5.2 Frontend Architecture (apps/admin)

#### Folder Structure

```
apps/admin/src/
+-- api/
|   +-- client.ts               # Typed API client with CSRF + error handling
|
+-- components/
|   +-- ui/                     # shadcn/ui primitives (Button, Badge, Card, Input, Select, Skeleton)
|   +-- data-table.tsx          # Reusable paginated table
|   +-- metric-card.tsx         # KPI metric display card
|   +-- page-header.tsx         # Page title + actions
|   +-- status-badge.tsx        # Status-to-color badge mapper (30+ statuses)
|   +-- confirm-dialog.tsx      # Modal confirmation dialog
|   +-- toast.tsx               # Toast notification system
|   +-- empty-state.tsx         # Empty state placeholder
|   +-- error-panel.tsx         # Error display with retry
|
+-- hooks/
|   +-- use-api-query.ts        # GET request hook with loading/error/refetch
|
+-- layouts/
|   +-- DashboardLayout.tsx     # Sidebar navigation + top bar + content outlet
|
+-- lib/
|   +-- auth-context.tsx        # React Context for authentication state
|   +-- protected-route.tsx     # RBAC wrapper for route protection
|   +-- utils.ts                # Tailwind class merge utility (cn)
|
+-- pages/                      # 11 page components (see Section 2.4)
+-- styles/globals.css          # Tailwind layers + CSS variables (light/dark mode)
+-- App.tsx                     # Route definitions
+-- main.tsx                    # React DOM render + providers
```

#### State Management

The frontend uses **React Context + Custom Hooks** (no Redux or external state library):

- **AuthContext**: Manages `user`, `isAuthenticated`, `isLoading`, `login()`, `logout()`. Checks `/auth/me` on app mount to restore sessions.
- **ToastContext**: Manages toast notification queue with 4-second auto-dismiss.
- **useApiQuery(endpoint, defaultValue)**: Custom hook for GET requests with loading/error/refetch states. Handles 404 and 501 gracefully as empty data rather than errors.
- **Local useState**: All pages use local state for filters, pagination, forms, and selected items.

#### Routing Structure

React Router v6 with nested layouts:

```
/login                          -> LoginPage (public, redirects if authenticated)
/dashboard                      -> DashboardLayout (protected wrapper)
  /                             -> DashboardPage
  /chats                        -> ChatsPage
  /chats/:id                    -> ConversationDetailPage
  /usage                        -> UsagePage
  /skills                       -> SkillsPage (minRole: admin)
  /jobs                         -> JobsPage (minRole: admin)
  /bookkeeping                  -> BookkeepingPage (minRole: admin)
  /audit                        -> AuditPage (minRole: admin)
  /security                     -> SecurityPage (minRole: admin)
  /integrations                 -> IntegrationsPage (minRole: admin)
  /settings                     -> SettingsPage
*                               -> Redirect to /dashboard
```

#### API Communication

The frontend communicates with the backend through a typed API client (`api/client.ts`):

- **Base URL**: `/api/v1` (proxied to `localhost:4000` in development via Vite)
- **Methods**: `apiClient.get<T>()`, `.post<T>()`, `.put<T>()`, `.patch<T>()`, `.delete<T>()`
- **CSRF Protection**: Reads token from `nexclaw.csrf` cookie, attaches as `x-csrf-token` header on non-GET requests
- **Credentials**: `credentials: 'include'` sends session cookies with every request
- **Error Handling**: Custom `ApiClientError` class with `{ status, code, message }` structure

---

### 5.3 Backend Architecture (apps/api)

#### Folder Structure

```
apps/api/src/
+-- server.ts                   # HTTP server startup + graceful shutdown
+-- worker.ts                   # Background worker entry point (BullMQ)
+-- app.ts                      # Express app factory (middleware stack + routes)
|
+-- routes/                     # Route handlers (controllers)
|   +-- health.ts               # GET /health, GET /health/ready
|   +-- auth.ts                 # POST login/logout/change-password, GET /me
|   +-- conversations.ts        # GET conversations + messages
|   +-- dashboard.ts            # GET dashboard stats
|   +-- usage.ts                # GET usage summary + timeseries
|   +-- skills.ts               # GET/POST/PATCH skill management
|   +-- audit.ts                # GET audit logs
|   +-- settings.ts             # GET/PATCH routing settings
|   +-- integrations.ts         # GET integration health
|   +-- jobs.ts                 # GET background jobs
|   +-- memory.ts               # GET memory search
|   +-- security.ts             # GET blocked attempts + overrides
|   +-- bookkeeping.ts          # GET receipt extractions
|   +-- webhooks/
|       +-- telegram.ts         # POST /webhooks/telegram
|       +-- email.ts            # POST /webhooks/email
|
+-- middleware/                  # Express middleware
|   +-- auth/
|   |   +-- session.middleware.ts   # Load session from cookie (no enforce)
|   |   +-- require-auth.ts         # Enforce authentication
|   |   +-- require-role.ts         # RBAC enforcement
|   |   +-- csrf.middleware.ts       # CSRF double-submit cookie validation
|   |   +-- login-rate-limit.ts     # Rate limiting on login (10/15min)
|   +-- request-id.ts           # Generate unique request ID
|   +-- request-timeout.ts      # Request timeout (30s default, skips webhooks)
|   +-- pino-http.ts            # HTTP request/response logging
|   +-- error-handler.ts        # Global error normalization
|   +-- not-found.ts            # 404 handler
|
+-- services/                   # Business logic layer
|   +-- auth.service.ts         # Login, session validation, password change
|   +-- conversation.service.ts # Conversation queries
|   +-- message.service.ts      # Message queries
|   +-- usage.service.ts        # Usage analytics
|   +-- audit.service.ts        # Audit log queries
|   +-- dashboard.service.ts    # Dashboard aggregation
|   +-- settings.service.ts     # Routing config CRUD
|   +-- job.service.ts          # Job listing
|   +-- integration.service.ts  # Integration health checks
|   +-- memory.service.ts       # Memory search
|   +-- security-admin.service.ts   # Security event queries
|   +-- bookkeeping-admin.service.ts # Bookkeeping queries
|   +-- skills/                 # Skill ingestion + vetting + override
|   +-- routing/                # Model router (cheap/standard/strong)
|   +-- memory/                 # Memory extraction + retrieval
|   +-- llm/                    # LLM provider interface + registry
|   +-- channels/               # Telegram + Email delivery
|   +-- subagents/
|       +-- ghl-crm.service.ts      # GHL CRM operations
|       +-- bookkeeping/             # Receipt extraction + Sheets
|       +-- followup/                # Lead follow-up automation
|
+-- repositories/               # Data access layer (17 repository files)
|   +-- admin.repository.ts     # Admin users
|   +-- session.repository.ts   # Sessions
|   +-- conversation.repository.ts  # Conversations
|   +-- message.repository.ts   # Messages
|   +-- usage.repository.ts     # Usage logs
|   +-- audit.repository.ts     # Audit logs
|   +-- skill.repository.ts     # Skills + vetting results
|   +-- memory.repository.ts    # Memory records
|   +-- job.repository.ts       # Background jobs
|   +-- ... (10 more)
|
+-- orchestration/              # AI pipeline
|   +-- orchestrator.ts         # Main pipeline executor
|   +-- prompt-composer.ts      # System prompt + context building
|   +-- conversation-manager.ts # Conversation CRUD + history
|   +-- sub-agent-dispatcher.ts # Sub-agent tool execution
|   +-- tool-resolver.ts        # Available tools from vetted skills
|   +-- usage-tracker.ts        # Usage metric logging
|
+-- security/                   # Skill vetting system
|   +-- scanner.ts              # Static code analysis (71 rules, 8 categories)
|   +-- policy-engine.ts        # Allow/deny policy evaluation
|   +-- execution-guard.ts      # Runtime skill execution check
|   +-- hash.ts                 # SHA-256 code hash utilities
|
+-- integrations/               # External service clients
|   +-- openrouter/client.ts    # OpenRouter LLM API
|   +-- telegram/client.ts      # Telegram Bot API
|   +-- email/client.ts         # SMTP email client
|   +-- email/thread-parser.ts  # Email thread parsing
|   +-- ghl/client.ts           # GoHighLevel CRM API
|   +-- google/sheets-client.ts # Google Sheets API
|
+-- jobs/                       # Job type definitions (6 queues)
+-- workers/                    # Job processors
+-- queues/                     # BullMQ queue registry
+-- db/
|   +-- client.ts               # Prisma client singleton
|   +-- redis.ts                # Redis connection singleton
|   +-- health.ts               # Database health check
+-- utils/                      # Error classes, response helpers, validation
+-- types/                      # Express augmentation types
```

#### Layered Architecture

The backend follows a strict **layered architecture**:

```
Routes (Controllers)  ->  Validate request, call service, format response
         |
    Services          ->  Business logic, orchestration, coordination
         |
    Repositories      ->  Data access via Prisma, query building
         |
    Prisma Client     ->  Database communication
```

**Why this structure?**

- **Separation of concerns**: Each layer has a single responsibility. Routes handle HTTP, services handle logic, repositories handle data.
- **Testability**: Services can be unit-tested by mocking repositories. Routes can be integration-tested with supertest.
- **Maintainability**: Changes to database queries don't affect business logic or HTTP handling.
- **Scalability**: New features follow the established pattern: add route -> service -> repository.

#### Middleware Stack (in order)

```
1. helmet           -> Security headers (CSP, X-Frame-Options, HSTS)
2. cors             -> CORS (origin: ADMIN_APP_URL only, credentials: true)
3. cookie-parser    -> Parse cookies from requests
4. express.json     -> Parse JSON body (limit: MAX_PAYLOAD_SIZE)
5. express.urlencoded -> Parse URL-encoded body
6. request-id       -> Generate unique request ID
7. pino-http        -> Log request/response with context
8. request-timeout  -> Enforce timeout (30s, skips webhooks)
9. global-rate-limit -> 200 requests/minute per IP
10. session-loader   -> Load session user from cookie (no enforcement)
11. csrf-validator   -> Validate CSRF token on POST/PATCH/DELETE
12. routes           -> Route handlers
13. not-found        -> 404 for unmatched routes
14. error-handler    -> Normalize all errors to { error: { code, message } }
```

#### API Endpoints

| Method | Path | Min Role | Description |
|--------|------|----------|-------------|
| **Authentication** | | | |
| `POST` | `/api/v1/auth/login` | Public | Login with email + password |
| `POST` | `/api/v1/auth/logout` | Auth | Invalidate session |
| `GET` | `/api/v1/auth/me` | Auth | Get current user profile |
| `POST` | `/api/v1/auth/change-password` | Auth | Change password (invalidates all sessions) |
| **Conversations** | | | |
| `GET` | `/api/v1/conversations` | Viewer | List conversations with filters/pagination |
| `GET` | `/api/v1/conversations/:id` | Viewer | Get conversation details |
| `GET` | `/api/v1/conversations/:id/messages` | Viewer | Get messages in conversation |
| **Dashboard** | | | |
| `GET` | `/api/v1/dashboard/stats` | Viewer | Aggregated system metrics |
| **Usage Analytics** | | | |
| `GET` | `/api/v1/usage/summary` | Viewer | Token/cost summary by model/provider |
| `GET` | `/api/v1/usage/timeseries` | Viewer | Usage over time (daily buckets) |
| **Skills** | | | |
| `GET` | `/api/v1/skills` | Viewer | List all skills with vetting status |
| `POST` | `/api/v1/skills/ingest` | Admin | Ingest + vet a new skill |
| `PATCH` | `/api/v1/skills/:id/enabled` | Admin | Toggle skill enabled state |
| `POST` | `/api/v1/skills/:id/manual-override` | Super Admin | Override vetting result |
| `GET` | `/api/v1/skills/:id/vetting-history` | Viewer | Vetting result history |
| **Audit** | | | |
| `GET` | `/api/v1/audit` | Viewer | Query audit logs |
| **Settings** | | | |
| `GET` | `/api/v1/settings/routing` | Viewer | Get model routing config |
| `PATCH` | `/api/v1/settings/routing` | Admin | Update routing config |
| **Integrations** | | | |
| `GET` | `/api/v1/integrations/health` | Viewer | Health of all integrations |
| **Jobs** | | | |
| `GET` | `/api/v1/jobs` | Admin | List background jobs |
| **Memory** | | | |
| `GET` | `/api/v1/memory/search` | Admin | Search memory records |
| **Security** | | | |
| `GET` | `/api/v1/security/blocked` | Admin | Blocked skill attempts |
| `GET` | `/api/v1/security/overrides` | Admin | Manual override history |
| **Bookkeeping** | | | |
| `GET` | `/api/v1/bookkeeping` | Viewer | Receipt extraction list |
| **Webhooks** | | | |
| `POST` | `/webhooks/telegram` | External | Telegram bot webhook |
| `POST` | `/webhooks/email` | External | Inbound email webhook |
| **Health** | | | |
| `GET` | `/health` | Public | Liveness check |
| `GET` | `/health/ready` | Public | Readiness check (DB + Redis) |

#### Orchestration Pipeline (AI Processing)

When a message is received, the orchestrator executes these steps:

1. **Resolve Conversation** -- Get or create conversation from the inbound event
2. **Persist Inbound Message** -- Store the incoming message in the database
3. **Retrieve Memories** -- Fetch relevant past facts for prompt context
4. **Resolve Tools** -- Load enabled, vetted skills + built-in sub-agent tools
5. **Route Model** -- Select appropriate LLM (cheap/standard/strong) based on complexity signals
6. **Compose Prompt** -- Build system prompt with memories, recent history, tools, and compliance instructions
7. **Call LLM** -- Execute chat completion via OpenRouter
8. **Handle Tool Calls** -- If the AI invokes tools, dispatch to sub-agents, feed results back
9. **Persist Assistant Reply** -- Store the AI response
10. **Extract & Store Memories** -- Parse response for new factual information
11. **Log Usage** -- Record token count, cost, latency, routing decision
12. **Return Result** -- Deliver reply through original channel

#### Job Queue System

6 BullMQ queues process background work:

| Queue | Purpose | Retry |
|-------|---------|-------|
| `orchestration` | Main AI pipeline execution | 3 attempts, exponential backoff |
| `channel-delivery` | Send replies to Telegram/Email | 3 attempts |
| `email-processing` | Inbound email parsing + orchestration | 3 attempts |
| `ghl-sub-agent` | GHL CRM operations | 3 attempts |
| `bookkeeping` | Receipt extraction + sheet append | 3 attempts |
| `followup` | Follow-up campaign execution | 3 attempts |

Default job options: 3 attempts with exponential backoff (2s base), retain last 1000 completed and 5000 failed jobs.

#### Error Handling

All errors follow a consistent format:

```json
{
  "error": {
    "code": "ERROR_CODE",
    "message": "Human-readable description",
    "details": {}
  }
}
```

Error codes map to HTTP statuses: `VALIDATION_ERROR` (400), `UNAUTHORIZED` (401), `FORBIDDEN` (403), `NOT_FOUND` (404), `TOO_MANY_REQUESTS` (429), `INTERNAL_SERVER_ERROR` (500).

---

### 5.4 Shared Packages

#### @nexclaw/shared

Provides types, schemas, and constants shared between frontend and backend:

- **90+ TypeScript types**: API responses, domain models, orchestration types, channel types, sub-agent I/O types
- **20+ Zod validation schemas**: Request validation (pagination, login, password, skill ingestion, routing settings, etc.)
- **Constants**: `SERVICE_NAME`, `API_PREFIX`, `ADMIN_ROLES`, `HTTP_STATUS` codes
- **Enums**: 14 string union types for channel, message, skill, job, and integration statuses

#### @nexclaw/config

Provides centralized configuration consumed by the API:

- **`env`**: Parsed and validated environment object (Zod schema with defaults)
- **`integrationConfigured`**: Helper functions to check if each integration has required env vars
- **`logger`**: Pino structured logger with secret redaction and pretty printing in dev
- **`authConfig`**: Session cookie settings, password policy, rate limit configuration

---

## 6. Environment Configuration

### The .env.example File

Create a `.env` file by copying `.env.example` and filling in the values. The system validates all environment variables on startup via Zod.

#### Required Variables (system will not start without these)

| Variable | Description | Example |
|----------|-------------|---------|
| `DATABASE_URL` | PostgreSQL connection string. Neon, Supabase, or any Postgres 16+ provider. | `postgresql://user:pass@host:5432/dbname` |
| `SESSION_SECRET` | Cryptographically random string, minimum 32 characters. Used to sign session tokens. Generate with `openssl rand -hex 32`. | `a1b2c3d4e5f6...` (64 hex chars) |

#### Auth / Seed Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `ADMIN_SEED_EMAIL` | Email for the initial super_admin account created by `npm run seed:admin`. | (none) |
| `ADMIN_SEED_PASSWORD` | Password for the initial admin (min 12 chars, must include uppercase, lowercase, number, symbol). | (none) |

#### AI / Model Routing

| Variable | Description | Default |
|----------|-------------|---------|
| `OPENROUTER_API_KEY` | API key from OpenRouter for LLM access. If unset, AI features are disabled. | (none - AI disabled) |
| `OPENROUTER_BASE_URL` | OpenRouter API endpoint. | `https://openrouter.ai/api/v1` |

#### Telegram Integration

| Variable | Description | Default |
|----------|-------------|---------|
| `TELEGRAM_BOT_TOKEN` | Bot token from @BotFather. If unset, Telegram webhook is disabled. | (none - disabled) |
| `TELEGRAM_WEBHOOK_SECRET` | Secret token for webhook validation (min 16 chars). | (none) |

#### Email Integration

| Variable | Description | Default |
|----------|-------------|---------|
| `INBOUND_EMAIL_WEBHOOK_SECRET` | Secret for inbound email webhook validation (min 16 chars). | (none - disabled) |
| `SMTP_HOST` | SMTP server hostname. | (none - disabled) |
| `SMTP_PORT` | SMTP server port. | `587` |
| `SMTP_USER` | SMTP authentication username. | (none) |
| `SMTP_PASS` | SMTP authentication password. | (none) |
| `SMTP_FROM` | Sender address for outbound emails. | (none) |

#### GoHighLevel CRM

| Variable | Description | Default |
|----------|-------------|---------|
| `GHL_API_BASE_URL` | GHL REST API base URL. | `https://rest.gohighlevel.com/v1` |
| `GHL_API_TOKEN` | API token from GHL dashboard. If unset, CRM sub-agent is disabled. | (none - disabled) |

#### Google Sheets (Bookkeeping)

| Variable | Description | Default |
|----------|-------------|---------|
| `GOOGLE_SERVICE_ACCOUNT_JSON` | Full JSON of a Google Cloud service account with Sheets API enabled. | (none - disabled) |
| `GOOGLE_SHEETS_BOOKKEEPING_SPREADSHEET_ID` | ID of the Google Sheet to append bookkeeping rows to. | (none) |

#### Application URLs

| Variable | Description | Default |
|----------|-------------|---------|
| `APP_BASE_URL` | Public URL of the API server. | `http://localhost:4000` |
| `ADMIN_APP_URL` | Public URL of the admin frontend. Used for CORS origin restriction. | `http://localhost:5173` |
| `API_BASE_URL` | Internal API URL (used in workers). | `http://localhost:4000` |

#### Redis / Queue

| Variable | Description | Default |
|----------|-------------|---------|
| `REDIS_URL` | Redis connection URL. If unset, jobs process synchronously (no queue). | (none - sync mode) |

#### Worker / Performance Tuning

| Variable | Description | Default |
|----------|-------------|---------|
| `WORKER_CONCURRENCY` | Number of jobs processed in parallel per worker instance. Range: 1-50. | `5` |
| `REQUEST_TIMEOUT_MS` | API request timeout in milliseconds. Webhook routes are exempt. | `30000` (30s) |
| `MAX_PAYLOAD_SIZE` | Maximum request body size. | `2mb` |

#### Environment

| Variable | Description | Default |
|----------|-------------|---------|
| `NODE_ENV` | Runtime environment. `development`, `production`, or `test`. | `development` |
| `PORT` | API server port. | `4000` |

### Configuration for Local Development

1. Copy `.env.example` to `.env`
2. Set `DATABASE_URL` to a local or cloud Postgres instance
3. Set `SESSION_SECRET` to any 32+ character string
4. Set `ADMIN_SEED_EMAIL` and `ADMIN_SEED_PASSWORD` for the initial admin
5. Optionally set `REDIS_URL` to `redis://localhost:6379` if running Redis locally
6. All integration variables (OpenRouter, Telegram, SMTP, GHL, Google) can be left unset -- the system will run in degraded mode

---

## 7. Database Overview

### Database Engine

**PostgreSQL 16+** via Prisma ORM. Recommended managed provider: **Neon** (serverless Postgres).

### Entity-Relationship Overview

The database contains **24 models** organized into these functional groups:

#### Admin & Authentication (3 tables)

| Table | Purpose | Key Fields |
|-------|---------|------------|
| `admins` | Admin user accounts | email (unique), passwordHash (Argon2id), role (super_admin/admin/viewer), isActive |
| `admin_sessions` | Active login sessions | token (unique, SHA-256 hashed), adminId (FK), expiresAt, ipAddress |
| `audit_logs` | Append-only event log | action, actorId, targetType, targetId, metadata (JSON), ipAddress |

**Relationships**: Admin -> many Sessions; Admin -> many AuditLogs

#### Conversations & Messaging (6 tables)

| Table | Purpose | Key Fields |
|-------|---------|------------|
| `conversations` | Unified conversation threads | channel (telegram/email/admin_portal), status, externalId (unique per channel) |
| `participants` | Users in conversations | conversationId (FK), externalId, channel, displayName |
| `messages` | Individual messages | conversationId (FK), direction (inbound/outbound), content, status, attachments (JSON) |
| `telegram_chats` | Telegram-specific metadata | conversationId (unique FK), telegramChatId (unique), username |
| `email_threads` | Email thread metadata | conversationId (unique FK), subject, threadId (unique), fromAddress |
| `email_messages` | Individual email messages | emailThreadId (FK), providerEmailId (unique), inReplyTo, bodyText, bodyHtml |

**Relationships**: Conversation -> many Messages, many Participants; Conversation -> one TelegramChat or EmailThread; EmailThread -> many EmailMessages

#### AI & Skills (3 tables)

| Table | Purpose | Key Fields |
|-------|---------|------------|
| `skills` | AI skill definitions | slug (unique), sourceType, enabled, currentVersionId (FK) |
| `skill_versions` | Versioned skill code | skillId (FK), version, codeHash (SHA-256), config (JSON) |
| `skill_vetting_results` | Security scan results | skillVersionId (FK), result (passed/failed/warning), detectedRisks (JSON) |

**Relationships**: Skill -> many Versions; Version -> many VettingResults; Skill -> one currentVersion

#### Memory System (1 table)

| Table | Purpose | Key Fields |
|-------|---------|------------|
| `memory_records` | Persistent AI memory facts | namespace, subjectKey, value (JSON), summary, score, sourceConversationId (FK) |

**Indexed on**: (namespace, subjectKey), (namespace, createdAt), expiresAt

#### Usage & Monitoring (2 tables)

| Table | Purpose | Key Fields |
|-------|---------|------------|
| `usage_logs` | Per-request LLM metrics | provider, model, promptTokens, completionTokens, costUsd (Decimal), latencyMs, routingDecision (JSON) |
| `jobs` | Background job tracking | queueName, jobType, status, attempts, payload (JSON), result (JSON) |

#### Sub-Agents (4 tables)

| Table | Purpose | Key Fields |
|-------|---------|------------|
| `sub_agent_tasks` | Task execution records | agentName, taskType, status, input/output (JSON), attempts |
| `ghl_action_logs` | GHL CRM operation audit | actionType, contactId, requestPayload (JSON), success, latencyMs |
| `receipt_extractions` | Bookkeeping receipts | sourceChannel, extractedData (JSON), category, confidence, status |
| `ledger_exports` | Google Sheets exports | receiptExtractionId (unique FK), spreadsheetId, status, exportedData (JSON) |

#### Follow-Up System (1 table)

| Table | Purpose | Key Fields |
|-------|---------|------------|
| `followup_recommendations` | Lead follow-up drafts | contactIdentifier, reason, suggestedMessage, priority, status, channel |

#### Configuration (2 tables)

| Table | Purpose | Key Fields |
|-------|---------|------------|
| `system_settings` | Key-value settings store | key (unique), value (JSON) -- stores routing config, feature flags |
| `integrations` | Integration configurations | name (unique), type, config (JSON), status |

---

## 8. Setup & Installation Guide

### Prerequisites

- **Node.js** 20 or later
- **npm** 10 or later
- **Docker** (for local Redis, or use a cloud Redis instance)
- **PostgreSQL 16+** (local or cloud -- Neon recommended)
- **Git**

### Step-by-Step Installation

#### 1. Clone the Repository

```bash
git clone <repo-url>
cd nexclaw-admin-system
```

#### 2. Install Dependencies

```bash
npm install
```

This installs dependencies for all 4 workspace packages (api, admin, shared, config).

#### 3. Configure Environment

```bash
cp .env.example .env
```

Edit `.env` and set at minimum:
- `DATABASE_URL` -- your Postgres connection string
- `SESSION_SECRET` -- run `openssl rand -hex 32` to generate
- `ADMIN_SEED_EMAIL` -- email for the first admin user
- `ADMIN_SEED_PASSWORD` -- password (min 12 chars, 1 uppercase, 1 lowercase, 1 number, 1 symbol)

#### 4. Generate Prisma Client

```bash
npm run db:generate
```

This generates the TypeScript Prisma client from `prisma/schema.prisma`.

#### 5. Run Database Migrations

```bash
npm run db:migrate
```

This creates all 24 tables and indexes in your Postgres database.

#### 6. Seed Initial Admin User

```bash
npm run seed:admin
```

Creates the first `super_admin` user using `ADMIN_SEED_EMAIL` and `ADMIN_SEED_PASSWORD` from `.env`. The script is idempotent -- it skips if the user already exists.

#### 7. Start Redis (Optional but Recommended)

```bash
docker compose up -d redis
```

If you skip this step, background jobs will process synchronously (no queue).

#### 8. Start Development Servers

```bash
npm run dev
```

This starts both servers simultaneously:
- **API**: `http://localhost:4000`
- **Admin Portal**: `http://localhost:5173`

Or start them individually:

```bash
npm run dev:api     # API only
npm run dev:admin   # Admin UI only
```

#### 9. Open the Admin Portal

Navigate to `http://localhost:5173` and log in with your seeded admin credentials.

### Running Tests

```bash
# All tests (158 total)
npm test

# Individual workspaces
npm test -w packages/shared      # 50 schema/validation tests
npm test -w apps/api             # 94 API tests
npm test -w apps/admin           # 14 component tests

# Watch mode
npm run test:watch -w apps/api

# E2E tests (requires running servers)
npx playwright install chromium  # First time only
npx playwright test

# Full pre-deployment validation
npm run predeploy                # Lint + typecheck + test + build
```

### Useful Commands

| Command | Description |
|---------|-------------|
| `npm run dev` | Start all dev servers |
| `npm run build` | Build all workspaces for production |
| `npm run lint` | Run ESLint across all files |
| `npm run typecheck` | TypeScript type checking |
| `npm test` | Run all unit/integration tests |
| `npm run db:studio` | Open Prisma Studio (visual DB browser) |
| `npm run db:migrate` | Create and apply a new migration |
| `npm run seed:admin` | Seed initial admin user |
| `npm run predeploy` | Full pre-deployment check |

### Docker Development (Alternative)

To run everything in Docker:

```bash
docker compose up
```

This starts: API (port 4000), Worker, Admin (port 5173), and Redis, with hot-reload via volume mounts.

---

## 9. Deployment Notes

### Production Architecture

```
                    +------------------+
                    |    Cloudflare    |
                    |    (CDN/DNS)     |
                    +--------+---------+
                             |
          +------------------+------------------+
          |                  |                  |
+---------v--------+ +------v-------+ +--------v---------+
| Admin Frontend   | | API Server   | | Worker Process   |
| (Static Site)    | | (Docker)     | | (Docker)         |
| Vite build       | | Express      | | BullMQ Processor |
+------------------+ +------+-------+ +--------+---------+
                            |                  |
               +------------+------------------+
               |                         |
     +---------v---------+   +-----------v-----------+
     |   PostgreSQL      |   |       Redis           |
     |   (Neon Managed)  |   |   (BullMQ Queues)     |
     +-------------------+   +-----------------------+
```

### Docker Build Targets

The `Dockerfile` uses a 6-stage multi-stage build:

| Target | Base Image | Purpose |
|--------|-----------|---------|
| `builder` | node:20-slim | Install deps, generate Prisma client, compile TypeScript |
| `api-base` | node:20-slim | Production deps only, non-root user (`appuser`), OpenSSL |
| `api` | api-base | Express HTTP server (port 4000), health check |
| `worker` | api-base | BullMQ background worker (no port) |
| `migrate` | api-base | Database migration runner |
| `admin` | nginx:alpine | Static SPA with security headers and asset caching |

Build commands:

```bash
docker build --target api -t nexclaw-api .
docker build --target worker -t nexclaw-worker .
docker build --target admin -t nexclaw-admin .
docker build --target migrate -t nexclaw-migrate .
```

### Render.com Deployment (Recommended)

The project includes a `render.yaml` blueprint that defines all services:

| Service | Type | Details |
|---------|------|---------|
| `nexclaw-api` | Web Service (Docker) | Target: `api`, health check: `GET /health` |
| `nexclaw-worker` | Worker (Docker) | Target: `worker`, shares env vars with API |
| `nexclaw-admin` | Static Site | Built from `apps/admin/dist`, SPA rewrite rules |
| `nexclaw-redis` | Redis | Managed Redis instance |
| `nexclaw-db` | PostgreSQL 16 | Managed database |

**First Deployment Steps:**

1. Push code to GitHub
2. Render Dashboard > New > Blueprint > Select your repo
3. Set manual environment variables (API keys, tokens, secrets)
4. Deploy
5. Run `npm run seed:admin` via Render Shell
6. Register Telegram webhook (see `docs/deployment.md`)
7. Configure email provider forwarding
8. Verify: `GET https://your-api.onrender.com/health`

### Required Production Environment Variables

At minimum, these must be set in production:

- `DATABASE_URL` -- Postgres connection string (from Render DB)
- `SESSION_SECRET` -- 32+ character random secret
- `REDIS_URL` -- Redis connection string (from Render Redis)
- `ADMIN_APP_URL` -- Exact URL of your admin frontend (for CORS)
- `APP_BASE_URL` -- Public API URL
- `API_BASE_URL` -- Internal API URL

All integration variables (`OPENROUTER_API_KEY`, `TELEGRAM_BOT_TOKEN`, `SMTP_*`, `GHL_API_TOKEN`, `GOOGLE_*`) are optional -- the system operates in degraded mode without them.

### CI/CD Pipeline

GitHub Actions (`.github/workflows/ci.yml`) runs on every push/PR to `main`:

1. **Lint + Typecheck** -- ESLint and TypeScript validation
2. **Test** -- All 158 unit/integration tests
3. **Build** -- Compile all workspaces
4. **Docker** -- Build API, worker, and admin images (verification only)

### Graceful Shutdown

Both API and Worker handle `SIGTERM`/`SIGINT` signals for zero-downtime deployments:

**API (15s timeout):**
1. Stop accepting new HTTP connections
2. Drain in-flight requests
3. Close BullMQ queues
4. Close Redis connection
5. Disconnect Prisma
6. Exit

**Worker (30s timeout):**
1. Stop accepting new jobs
2. Wait for running jobs to complete
3. Close Redis connection
4. Disconnect Prisma
5. Exit

---

## 10. Additional Important Information

### Security Considerations

#### Authentication & Sessions
- Passwords are hashed with **Argon2id** (memory-hard, resistant to GPU attacks)
- Session tokens are 32-byte random hex strings, **SHA-256 hashed** before database storage
- Session cookies: `HttpOnly`, `Secure` (production), `SameSite=Lax`, 24-hour max age
- On password change, all sessions for the user are invalidated

#### CSRF Protection
- **Double-submit cookie** pattern: `nexclaw.csrf` cookie readable by JavaScript, matched against `x-csrf-token` header
- Comparison uses `crypto.timingSafeEqual` to prevent timing attacks
- Required on all state-changing requests (POST, PUT, PATCH, DELETE)

#### Rate Limiting
- Login: 10 attempts per 15 minutes (key: IP + email)
- Global API: 200 requests per minute per IP

#### HTTP Security Headers (via Helmet)
- Content-Security-Policy: `default-src 'self'`
- X-Frame-Options: `DENY`
- X-Content-Type-Options: `nosniff`
- Strict-Transport-Security: Enabled in production
- Referrer-Policy: `strict-origin-when-cross-origin`

#### Secret Redaction
All log output automatically redacts: authorization headers, cookies, CSRF tokens, passwords, session tokens, and API keys.

#### Docker Security
- Production containers run as non-root user (`appuser`)
- Minimal base image (`node:20-slim`)
- No dev dependencies in production images

#### Skill Security Pipeline
Every AI skill undergoes static analysis (71 rules across 8 categories) before execution is permitted. The policy engine supports configurable allowlists/denylists, and the runtime execution guard performs a final check with code hash verification.

### Performance Optimizations

- **Pagination caps**: All list endpoints enforce a maximum page size of 100 items
- **Request timeout**: Configurable per-request timeout (default 30s), webhook routes exempt
- **Payload limits**: Configurable maximum request body size (default 2MB)
- **Worker concurrency**: Configurable parallel job processing (default 5, max 50)
- **Keep-alive**: HTTP keep-alive timeout set to 65s (above typical proxy timeout of 60s)
- **Job retention**: Completed jobs auto-removed after 1000 entries, failed jobs after 5000
- **Redis connection pooling**: Single connection singleton with auto-reconnect
- **Prisma connection pooling**: Managed by Prisma client with environment-based pool size

### Known Limitations

1. **Memory extraction**: Currently pattern-based; a future enhancement could use LLM-based extraction for higher accuracy
2. **No WebSocket**: Admin portal uses polling for data refresh, not real-time push
3. **Single-region**: Render deployment is single-region (Oregon); sufficient for demo/MVP
4. **No CDN for API**: API responses are not edge-cached; consider Cloudflare Workers for high-traffic scenarios
5. **No email attachment support**: Inbound email handles text/HTML only; file attachments are not processed
6. **Follow-up delivery**: Approved follow-ups are marked for delivery but the actual send channel integration is a future enhancement

### Intentionally Deferred Items

These items are documented but not blocking production readiness:

| Item | Status | Notes |
|------|--------|-------|
| OpenTelemetry tracing | Deferred | Logger is OTel-friendly; trace/span injection ready |
| Scheduled follow-up delivery | Deferred | Recommendations created; actual scheduled send is future |
| Multi-region deployment | Deferred | Single Render region is sufficient |
| Email attachment processing | Deferred | Text/HTML emails fully supported |
| Admin portal real-time updates | Deferred | Polling works; WebSocket is a future enhancement |
| Automated session cleanup cron | Deferred | Sessions expire naturally; batch cleanup is nice-to-have |

### Future Improvement Possibilities

1. **WebSocket integration** for real-time admin portal updates (conversation activity, job progress)
2. **LLM-based memory extraction** to replace pattern matching with semantic understanding
3. **Email attachment processing** for receipt images sent via email (currently Telegram only)
4. **Multi-region deployment** with database read replicas for global latency reduction
5. **OpenTelemetry tracing** for distributed request tracing across API, workers, and external services
6. **Scheduled follow-up delivery** to automatically send approved follow-up messages at optimal times
7. **Additional messaging channels** (WhatsApp, SMS via Twilio)
8. **Admin user management UI** for creating/editing admin accounts from the portal
9. **Dashboard charts** with more granular time filtering (hourly, weekly)
10. **Skill marketplace** for discovering and installing community-built AI skills

### Test Coverage Summary

| Package | Test Files | Tests | Coverage |
|---------|-----------|-------|----------|
| `packages/shared` | 2 | 50 | Zod schemas, constants, enums, password validation |
| `apps/api` | 12 | 94 | Middleware, security scanner, model router, webhooks, user stories |
| `apps/admin` | 3 | 14 | Login page, DataTable, StatusBadge components |
| `e2e/` | 1 | 6 | Login, navigation, logout, auth redirect |
| **Total** | **18** | **164** | |

### Monitoring & Observability

- **Structured logs**: JSON format via Pino, compatible with any log aggregator (Datadog, Grafana, CloudWatch)
- **Health endpoints**: `/health` (liveness), `/health/ready` (readiness with DB + Redis checks)
- **Integration health**: `/api/v1/integrations/health` reports status of all 7 external integrations
- **Audit trail**: All admin actions, security events, and system operations in `audit_logs`
- **Usage tracking**: Per-request token count, cost, latency, and model routing decision in `usage_logs`
- **Job monitoring**: Background job status, attempts, and errors via `/api/v1/jobs`

---

*This document was generated from a comprehensive analysis of the NexClaw Admin System codebase. For specific deployment instructions, see `docs/deployment.md`. For security details, see `docs/security.md`. For test coverage mapping, see `docs/handoff.md`.*
