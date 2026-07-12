# Spec Template Reference

Templates for each spec section. Adapt depth to project complexity — personal tools get lighter treatment than SaaS products. Each template is copy-paste ready; replace bracketed placeholders.

---

## 00 — Project Overview

```markdown
# [App Name] — Project Specification

## Problem Statement
[2-3 sentences. Who feels this pain, when, and what it costs them (time, money, frustration).]

## Solution Summary
[2-3 sentences. "Users go from [painful state] to [better state] by [mechanism]."]

## Prior Art & Competitive Analysis
| Existing Solution | What It Gets Right | What It Gets Wrong | Our Differentiator |
|---|---|---|---|
| [Competitor/tool] | [Strength] | [Gap we fill] | [How we're better] |
| [Prior approach] | [What worked] | [What failed] | [Our improvement] |

## Target Users

### [Persona 1 Name] — [Role]
**Profile:** [Age/experience level/background]

**Context:** [Where/when/how they use the app. Device, environment, time pressure, distractions.]

**Goals:** [Primary outcome they want; secondary outcomes]

**Pain Points:** [Specific friction in current workflow; cost per occurrence]

**Technical comfort:** [Low/Medium/High — concrete examples: "comfortable with spreadsheets, never used CLI" or "writes Python daily, unfamiliar with async/await"]

**Current workflow:** [How they solve this today; step-by-step; where it breaks down]

**Success signal:** [Observable behavior that means the app is working. Measurable, not aspirational.]

**Red flags:** [What would make them abandon the tool mid-flow]

### [Persona 2 Name] — [Role]
[Same structure. Include at least 2 personas unless this is a single-user tool.]

## Success Metrics
| Metric | Target | Timeframe | How Measured |
|---|---|---|---|
| [Metric name] | [Specific number] | [By when] | [What you look at] |

Examples: "80% of new users complete core flow by day 1" (measured via analytics), "zero lost data on sync" (measured via audit logs).

## Assumptions & Constraints

**We're assuming:**
- [Assumption about users, e.g., "Users have modern browsers (Chrome 90+, Safari 15+, Firefox 88+)"]
- [Assumption about scale, e.g., "< 50 concurrent users for 6 months"]
- [Assumption about integrations, e.g., "Salesforce API stays on v58+"]
- [Assumption about tech, e.g., "Node LTS is available in production environment"]

**Hard constraints:**
- [Budget ceiling: e.g., "< $500/month infrastructure"]
- [Timeline deadline: e.g., "Ship MVP in 6 weeks"]
- [Compliance: e.g., "GDPR compliance required day 1"]
- [Technical: e.g., "Must run on older Android 8.0 devices"]

## Risk Register
| Risk | Likelihood | Impact | Mitigation | Owner | Contingency |
|---|---|---|---|---|---|
| [What could go wrong] | Low/Med/High | Low/Med/High | [Specific action to reduce risk] | CLAUDE/USER | [Fallback if mitigation fails] |

Examples: "Payment processor integration takes 2x longer" (High/Med) → "Prototype with test API keys first, plan 2 days buffer" (CLAUDE) → "Fall back to manual payment processing for Phase 1".

## Scope Boundaries

**Phase 1 (MVP):**
- [Feature — one line each]

**Phase 2+:**
- [Feature]

**Explicitly out of scope (and why):**
- [Feature — reason: "Too expensive", "Needs market validation first", "Dependency not available"]
```

---

## 01 — Tech Stack

```markdown
# Tech Stack

## Selection Criteria
[2-3 sentences. What factors dominate for THIS project: speed to ship, cost, team familiarity, scalability, ecosystem, compliance.]

## Recommended Stack

### Frontend
**Choice:** [Framework + version]
**Why:** [2-3 sentences connecting to project needs, not generic praise. E.g., "React 19 because we need fine-grained reactivity and the team knows it; we avoid Vue to avoid learning curve."]
**Alternatives considered:**
- [Option B] — rejected because [specific reason tied to this project, e.g., "Svelte adds 40% more learning time and we're time-constrained"]

### Backend / API
**Choice:** [Framework/service]
**Why:** [Rationale tied to project constraints]
**Alternatives considered:**
- [Option B] — rejected because [reason]

### Database
**Choice:** [Database]
**Why:** [Address: data model fit, query patterns, scaling needs. E.g., "PostgreSQL because we need relational integrity and the JSON support handles semi-structured data in price_history field; we avoid NoSQL because we don't know our access patterns yet."]
**Alternatives considered:**
- [Option B] — rejected because [reason]

### Authentication
**Choice:** [Provider/method]
**Why:** [Rationale. E.g., "Supabase Auth because it's cheaper than Auth0 at this scale and RLS integrates with DB layer."]

### Hosting & Infrastructure
**Choice:** [Platform]
**Why:** [Address: cost, DX, deployment model, scaling. E.g., "Vercel for frontend because deploy-on-push and preview URLs save 10 hours setup; AWS RDS for DB because we need point-in-time recovery."]

### Key Libraries
| Category | Library | Purpose | Why not alternative |
|---|---|---|---|
| Styling | [e.g., Tailwind CSS] | [Purpose] | [e.g., "not styled-components because build complexity"] |
| State | [e.g., TanStack Query] | [Purpose] | [why] |
| Forms | [e.g., React Hook Form + Zod] | [Purpose] | [why] |
| Testing | [e.g., Vitest + Playwright] | [Purpose] | [why] |

## Stack Diagram
[Mermaid diagram showing: Frontend → API layer → Database; third-party integrations; CI/CD flow]

## Cost Estimate
| Service | Free Tier | At Launch | At 1K Users | Notes |
|---|---|---|---|---|
| [Service] | [Yes/No] | [$X/mo] | [$X/mo] | [Scaling assumptions] |
| **Total** | | **$X/mo** | **$X/mo** | [Total scaling path] |
```

---

## 02 — Architecture

```markdown
# Architecture Design

## Pattern
[Name the pattern: monolith, BaaS-first, modular monolith, serverless, etc.]

[1-2 sentences on WHY this pattern fits for THIS project. Reference architecture-patterns.md for full pattern catalog and diagrams.]

Example: "Modular monolith: all code in one codebase, clear module boundaries via services; cheaper than microservices, simpler ops than BaaS-only, scales past personal-tool stage."

## System Diagram
[Mermaid graph showing: Frontend (web/mobile) → API layer → services → database; external integrations; async queues if present]

## Component Breakdown
### [Component Name]
- **Owns:** [What data/behavior is this component's responsibility. E.g., "Invoice generation, storage, and delivery; nothing else"]
- **Inputs:** [Data/events in. E.g., "PurchaseCreated event, invoice config"]
- **Outputs:** [Data/events out. E.g., "Invoice persisted to DB, InvoiceSent event published"]
- **Dependencies:** [Other components. E.g., "PaymentService for tax lookup, StorageService for PDF upload"]

## Data Model
### ER Diagram
[Mermaid erDiagram showing all entities and relationships]

### Table Definitions
#### [table_name]
| Column | Type | Constraints | Description |
|---|---|---|---|
| id | uuid | PK, default gen_random_uuid() | |
| [col] | [type] | [constraints] | [description] |
| created_at | timestamptz | NOT NULL, default now() | Insertion timestamp |

**Indexes:** [List with rationale. E.g., "created_at DESC for pagination; user_id for queries by owner; (status, created_at) for dashboard filtering"]
**RLS Policies:** [If applicable. E.g., "SELECT: users can only read own records; UPDATE: only owner or admin"]

## API Design

> Discovery-level intent — high-level endpoint inventory, request/response shapes,
> and error envelope. The full contract (OpenAPI 3.1 or GraphQL schema, versioning
> policy, pagination/idempotency conventions, SDK generation) is *elaborated by
> the `oc-api-dev` skill* during Phase 2 handoff. Don't hand-author the OpenAPI here
> — it lives in `api/openapi.yaml` once oc-api-dev runs.

### Endpoint Inventory
| Method | Path | Description | Auth | Request Shape | Response Shape | Notes |
|---|---|---|---|---|---|---|
| GET | /api/v1/[resource] | [Description] | [Role] | — | `{ data: T[] }` | Supports ?limit, ?offset |
| POST | /api/v1/[resource] | [Description] | [Role] | `{ field: type }` | `{ data: T }` | 201 Created |

### Error Response Shape
```json
{
  "error": {
    "code": "MACHINE_READABLE_CODE",
    "message": "Human-readable message",
    "details": { "field": "error details" }
  }
}
```

### Request/Response Validation
All inputs validated with [Zod/Joi/other]. Responses typed and validated before sending. Errors map to HTTP status codes: 400 (validation), 401 (auth), 403 (authz), 404 (not found), 409 (conflict), 500 (server).

## State Management
| State Type | Tool | Examples | Scope |
|---|---|---|---|
| Server state | [e.g., TanStack Query] | Fetched data, cache | Shared across tabs |
| Client state | [e.g., Zustand/useState] | UI toggles, form drafts | Single component or session |
| URL state | [e.g., searchParams] | Filters, pagination, active tab | Browser history-aware |

## Caching Strategy
| What | Where | TTL | Invalidation Trigger | Rationale |
|---|---|---|---|---|
| [Data type] | [Browser/CDN/Redis] | [Duration] | [Event that busts cache] | [Why cached] |

Example: "User profile data → browser LocalStorage → 24 hours → on login/logout → 90% of requests same user, reduces API load by 50%"

## Error Handling & Recovery
```
DB error → API catches → transforms to { error } shape → frontend catches → shows toast/inline error → logs to Sentry
Critical error (can't recover) → Circuit breaker opens → UI shows fallback state → logs alert
```
[For each critical system: outline the error types, recovery strategy, and observability.]

## Background Jobs (if applicable)
| Job | Trigger | Frequency | Timeout | Failure Handling | Owner |
|---|---|---|---|---|---|
| [Job name] | [Cron/webhook/event] | [Schedule] | [Max runtime] | [Retry N times, then alert] | CLAUDE/USER |

Example: "Invoice generation → triggered by PurchaseCreated event → runs async → 60s timeout → retry 3x with exponential backoff, then alert to support"
```

---

## 03 — Security & Auth

```markdown
# Security & Auth

## Authentication
**Method:** [OAuth / magic link / email+password / SSO]
**Provider:** [Supabase Auth / Auth0 / NextAuth / custom]
**Session management:** [JWT in httpOnly cookie / refresh token flow / other]
**Password policy:** [Min 12 chars, complexity if applicable; only if email+password used]
**MFA:** [Enabled for admins, optional for users, or N/A]

## Authorization
**Model:** [RBAC (role-based) / ABAC (attribute-based) / RLS (database-level)]
**Roles:**
| Role | Can Create | Can Read | Can Update | Can Delete | Special |
|---|---|---|---|---|---|
| [Role] | [Scope] | [Scope] | [Scope] | [Scope] | [Notes] |

Example: "User: own records only; Admin: everything; Guest: nothing until signup"

**RLS Rules (if using Postgres RLS):**
```sql
-- Users can only read/update/delete their own records
CREATE POLICY "owner_isolation" ON items FOR ALL USING (auth.uid() = user_id);
```

## Data Protection
- Encryption at rest: [Yes/No — provider handles or custom; which fields if selective]
- Encryption in transit: [HTTPS everywhere; TLS 1.3+]
- PII fields: [List fields containing PII (email, phone, address, etc.) and handling approach (tokenized, hashed, encrypted, etc.)]
- Secrets management: [env vars, vault, encrypted config; how secrets are rotated]
- Data retention: [How long we keep deleted data; GDPR right-to-be-forgotten strategy]

## API Security

> Policy *declarations* go here. Concrete rate-limit infrastructure is sized by
> `oc-scale-ops`; threat-modelling of the surface is `oc-security-auditor`'s job;
> `oc-api-dev` translates these declarations into the OpenAPI spec
> (`securitySchemes`, response headers, deprecation metadata).

- Rate limiting: [X requests per Y minutes per Z (user/IP); strategy for logged-in vs. anonymous]
- Input validation: [Zod/Joi on all endpoints; max payload size]
- CORS: [Allowed origins; credentials policy]
- CSRF: [Double-submit cookie / SameSite flag / other]
- API versioning: [URL-based (v1, v2) to allow deprecation without breaking clients — oc-api-dev enforces strategy]

## OWASP Top 10 (This Project)
[List only the OWASP Top 10 items relevant to THIS app with specific mitigations. E.g., "A03:2021 Injection → validated inputs + prepared statements; A05:2021 Broken Access Control → RLS policies on all queries; etc."]
```

---

## 04 — Integrations

```markdown
# Integration Layer

## Third-Party Services
| Service | Purpose | Auth Method | Rate Limits | Fallback Behavior | Owner |
|---|---|---|---|---|---|
| [Service] | [Why needed] | [API key/OAuth/webhook] | [Limits; e.g., 100/min] | [What happens if down] | CLAUDE/USER |

Example: "Stripe → payments → API key in env → 100 req/s per account → manual payment entry; notify support"

## Webhook Patterns

### Inbound
| Source | Event Type | Endpoint | Signature Verification | Processing | Retry Strategy |
|---|---|---|---|---|---|
| [Service] | [Event, e.g., payment.success] | [/api/webhooks/stripe] | [HMAC-SHA256 signature header] | [What happens: update DB, trigger job, etc.] | [Idempotent? How handle duplicates?] |

### Outbound
| Trigger (Internal Event) | Destination | Payload Shape | Retry Policy | Timeout |
|---|---|---|---|---|
| [App event, e.g., OrderCreated] | [External URL] | [Shape; e.g., { order_id, status, total }] | [3 retries, exponential backoff, max 24h] | [30s] |

## Data Sync Strategy
[Real-time vs. batch. Direction (push/pull/bidirectional). Conflict resolution strategy.]

Example: "One-way push on order creation → Stripe; Real-time sync on payment success → webhook; Manual retry button in admin UI if webhook lost."

## API Credential Management
[How credentials are stored, rotated, and accessed. Example: "Stripe API key in .env.local (dev), AWS Secrets Manager (prod); rotated quarterly; never logged or exposed in errors."]
```

---

## 05 — Monetization (if applicable)

```markdown
# Monetization

## Pricing Model
[Freemium / subscription / usage-based / one-time / hybrid]

## Tier Structure
| Tier | Price | Limits | Key Features | Target User |
|---|---|---|---|---|
| Free | $0 | [Hard limits: e.g., 5 records, read-only] | [Features] | [Who: e.g., students, small projects] |
| Pro | $X/mo | [Limits: e.g., unlimited records] | [Features] | [Who] |

## Payment Integration
**Provider:** [Stripe / Paddle / LemonSqueezy / other]
**Webhook events:** checkout.session.completed, customer.subscription.updated, customer.subscription.deleted, invoice.payment_failed
**Trial:** [Duration, e.g., 14 days; credit card required or not]
**Billing cycle:** [Monthly/yearly; prorating policy]

## Subscription Lifecycle
Signup → [Trial period (N days)] → Active (recurring charge) → [Upgrade/Downgrade/Cancel] → Grace period (7 days) → Churned / Reactivated

**State machine transitions:**
- Active + cancel request → Canceled (access ends at period end)
- Canceled + reactivate → Active
- Active + payment fails → Past due (3 days grace, then Canceled)

## Analytics
[Track: conversion funnel, churn rate, MRR, LTV; tools and dashboards]
```

---

## 06 — Testing

```markdown
# Testing Strategy

## Coverage Targets
| Layer | Tool | Target | Focus Areas |
|---|---|---|---|
| Unit | [Vitest/Jest] | 80%+ | Business logic, utilities, custom hooks, edge cases |
| Integration | [Testing Library/RTL] | Critical paths | API → DB round trips; auth flows; state mutations |
| E2E | [Playwright] | Core user flows | Signup → core action → verify result; payment flow (if applicable); admin tasks |

## Critical Flows to E2E Test
1. [New user signup → onboarding (if present) → performs core action → sees result]
2. [Returning user login → triggers workflow → completes goal]
3. [If applicable: payment flow end-to-end; admin approval workflow; export/integration]

## Test Data Strategy
[Fixtures vs. factories; seeding strategy for integration tests; cleanup between tests]

Example: "Use factories for dynamic data; seed known fixtures for deterministic tests; cleanup DB after each test via transaction rollback."

## Performance Budget
| Metric | Target | Tool | Frequency |
|---|---|---|---|
| First Contentful Paint | < 1.5s | Lighthouse / WebVitals | Per PR |
| Largest Contentful Paint | < 2.5s | Lighthouse / WebVitals | Per PR |
| Cumulative Layout Shift | < 0.1 | Lighthouse / WebVitals | Per PR |
| JavaScript bundle size | < 200KB gzipped | build output | Per PR |
| Lighthouse score | > 90 | Lighthouse | Per PR |

## Accessibility Testing
[Automated: axe-core; manual: keyboard nav, screen reader (NVDA/JAWS); WCAG 2.1 AA target]
```

---

## 07 — DevOps & Deployment

```markdown
# DevOps & Deployment

## Environments
| Environment | Purpose | URL | Deploy Trigger | Data State |
|---|---|---|---|---|
| Local | Development | localhost:3000 | `npm run dev` | Seeded fixtures |
| Preview | PR review | {branch}.vercel.app | Push to PR branch | Copy of prod (sanitized) or empty |
| Production | Live | [domain] | Merge to main | Real user data |

## CI/CD Pipeline
```
Push → Lint (ESLint) → Type check (TypeScript) → Unit tests → Build → Deploy preview → E2E tests (Playwright) → [Manual approval if needed] → Deploy to production
```

[For each step, include: what passes/fails, who gets alerted, rollback action.]

## Database Migrations
- Migration tool: [e.g., Prisma migrations, Supabase migrations, Liquibase]
- Versioning: [Sequential numbered files with timestamps]
- Zero-downtime approach: [Add column → deploy code that handles both → backfill → remove old code in separate deploy]
- Never in single deploy: [Rename/drop columns, change constraints, change types — these require gradual migration]

## Monitoring & Observability
| What | Tool | Alert Threshold | Owner |
|---|---|---|---|
| Error rate | [Sentry/LogRocket/Rollbar] | > 1% of requests | CLAUDE/USER |
| Uptime | [UptimeRobot/Better Stack/Datadog] | Any downtime | ops |
| API latency | [DataDog/New Relic] | p95 > 500ms | backend owner |
| Performance (Web Vitals) | [Vercel Analytics / Google Analytics] | LCP > 2.5s | frontend owner |
| Database performance | [Provider's dashboard + slow query logs] | Query > 1s | backend owner |

## Backup & Recovery
- **Database:** [Automated daily backups via provider; retention period, e.g., 30 days]
- **Point-in-time recovery:** [Window, e.g., can restore to any time in last 7 days]
- **Files (if using object storage):** [Versioning enabled; deletion protection on critical buckets]
- **Rollback strategy:** [Git revert last commit + redeploy; OR blue-green deployment; OR database migration rollback script if needed]

Example: "Database: daily 3am UTC backup, 30-day retention via AWS RDS. Rollback: revert git commit, redeploy (5 min). Data loss acceptable up to 24h."

## Secrets Management
[How credentials are injected; rotation policy; audit logging]

Example: ".env for local dev, GitHub Actions secrets for CI, AWS Secrets Manager for prod; rotated quarterly; all access logged in CloudTrail."

## Disaster Recovery Plan
[RTO (Recovery Time Objective), RPO (Recovery Point Objective), and step-by-step runbook]

Example: "RTO: 1 hour. RPO: < 1 hour. Runbook: restore from latest backup, validate data, restore DNS, smoke test, announce to users."
```

---

## 08 — Analytics (if product-facing metrics matter)

```markdown
# Analytics & Metrics

## Product Metrics
| Metric | Definition | How Measured | Target | Cadence |
|---|---|---|---|---|
| [Metric] | [What it means] | [Event/query] | [Target value] | [Weekly/Monthly] |

Examples: "DAU: Daily Active Users (signed in + performed action) → event tracking → 100 by week 4 → Weekly review"

## Instrumentation
[Events tracked; properties attached to each event; sampling strategy if needed]

Example: "UserSignup: { platform, referrer, signup_method }; ExportInitiated: { export_format, record_count }; 100% sampling for conversion events, 5% for pageviews."

## Dashboards
[Key dashboards and who views them]

Example: "Product: DAU, retention, feature adoption (team); Marketing: traffic source, signup funnel (marketing); Ops: error rate, latency (eng)"

## Data Privacy
[How event data is handled; PII scrubbing; retention policy; user opt-out]
```

---

## 09 — Documentation Plan (if external users or compliance matters)

```markdown
# Documentation

## External Documentation
[For APIs, if public; for users, if product has learning curve]
- **Format:** [Markdown in repo / Docs site / Notion / Confluence]
- **Audience:** [Developers / End users / Integrators]
- **Must-have:** [Getting started, API reference, troubleshooting, FAQs]
- **Owner:** CLAUDE/USER

## Internal Documentation
- **Architecture:** /docs/architecture.md (updated per phase)
- **Database schema:** [Auto-generated from migrations or manual docs/db.md]
- **Runbooks:** [/docs/runbooks/: troubleshooting, deployment, incident response]
- **Decision log:** [/docs/adr/: Architecture Decision Records for major choices]

## Compliance & Legal Docs
[If applicable: Privacy Policy, Terms of Service, Data Processing Agreement, etc.]
- **Owner:** USER (legal review required)
- **Hosting:** [Legal site or embedded]
```

---

## 10 — Cost Model (detailed version)

See Tech Stack section for quick cost estimate. Generate a dedicated cost file only if:
- Pricing model is complex (usage-based tiers, overages, discounts)
- Infrastructure scales non-linearly
- Need detailed projections (5-year runway)

---

## 11 — Implementation Roadmap

See `phase-planning.md` for full methodology. Use this structure:

```markdown
# Implementation Roadmap

## Phase Overview
| Phase | Goal | CLAUDE Effort | USER Effort | Key Risk | Fallback |
|---|---|---|---|---|---|
| 1 | [MVP — one sentence] | ~X hours | ~Y hours | [Biggest risk] | [Quick plan if risk hits] |
| 2 | [Next goal] | ~X hours | ~Y hours | [Biggest risk] | [Fallback] |

## Phase 1: [Name]
**Goal:** [What's true when done — one sentence, no "and". E.g., "Users can sign up, auth persists, and core feature works end-to-end."]

**Prerequisites:** None

**Key Risk:** [What could cause this phase to fail?]
**Mitigation:** [What we do upfront to reduce risk]
**Fallback:** [If risk hits anyway, what do we do? E.g., "Ship without feature X; cut feature Y from scope; extend timeline by 1 week"]

**Scope Cut List (if over time):** [These items move to Phase 2: feature X, polish Y, etc.]

### Tasks
```
CLAUDE T1.0 — [Task description]
  - Depends on: [none or task IDs]
  - Output: [What exists when done; e.g., "component in /src/Button.tsx, tests passing"]

USER T1.1 — [Task description]
  - Depends on: T1.0
  - Output: [e.g., "Stripe account set up, API keys in 1password"]

CLAUDE T1.2 — [Task description]
  - Depends on: T1.1
  - Output: [e.g., "Stripe integration tested, payment flow works end-to-end"]
```

[For each task, specify who (CLAUDE/USER), what (one clear output), and dependencies. Task numbers: T[phase].[index] with CLAUDE/USER prefix.]

### Validation Checkpoint
- [ ] [Testable condition; reference task IDs. E.g., "User can sign up via T1.3 flow"]
- [ ] [Another condition. E.g., "Core feature from T1.5 works without errors"]
- [ ] [End-to-end condition. E.g., "App deploys to production via T1.6 and is accessible via URL"]

### Rollback Plan
[If Phase 1 breaks production, how to recover in < 1 hour. Examples: "git revert last commit + redeploy (5 min)", "restore DB from backup (20 min), run migration rollback script (5 min), redeploy (5 min) = 30 min total."]

## Phase 2: [Name]
**Goal:** [What's true when done]

**Prerequisites:** Phase 1 complete and passing validation

[Same structure as Phase 1]

## Phase 3+
[Continue pattern; extend as needed]
```
