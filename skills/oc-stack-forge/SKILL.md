---
name: oc-stack-forge
displayName: OC · Stack Forge
version: 1.7.0
shortDesc: Stack decisions, Cloudflare patterns, typed pipeline. v1.2 records the chosen stack on the linked PM ticket as an ADR.
phases: [plan, build]
triAgent: false
tryable: true
commands:
  - /oc-stack
  - /oc-stack-decide
  - /oc-feature
description: >
  Stack advisor for any platform: Cloudflare, Vercel, AWS, Supabase, Rails, Django.
  Use for /oc-stack, /oc-stack-decide, /oc-feature, "what stack", "tech stack", "what should I
  build with", or framework comparisons. Auto-invoked by oc-app-architect. Trigger liberally.
---

# Stack Forge

**On first invocation, read `references/orchestrator.md` and follow its welcome protocol.**

Opinionated stack advisor that helps you pick the right tools and enforces type safety
across whatever stack you choose. Auto-invoked by oc-app-architect during Phase 2 — you
don't call it separately for new projects.

Works with any stack: Cloudflare Workers, Vercel/Next.js, AWS Lambda, Supabase, Rails,
Django, Go, Rust — the decision framework is universal. The implementation patterns are
stack-specific, loaded from reference docs at runtime.

## How This Skill Fits the Build Pipeline

```
APP-ARCHITECT (planning)                TRI-DEV (building)
  Phase 2: Spec ──auto-calls──▶ oc-stack-forge decision tree
  Phase 5: Scaffold ──auto-calls──▶ oc-stack-forge project structure
                                         │
  Feature request ───────────────────────▶ /oc-feature → sprint decomposition
                                         │
                                   Planner reads feature-decomposition
                                   Generator reads stack-specific patterns
                                   Evaluator reads per-layer criteria
```

**App-architect auto-invokes oc-stack-forge** — when Phase 2 starts, oc-stack-forge's decision
tree runs automatically to generate `01-tech-stack.md` and `02-architecture.md`. The user
doesn't need to call `/oc-stack-forge` separately. Stack-forge reads the discovery interview
results and recommends the best stack for the project's requirements.

**App-architect Phase 6 uses oc-stack-forge** for stack-ordered sprint decomposition regardless of stack choice.

---

## /oc-stack-forge — Command Reference

```
STACK FORGE COMMANDS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  STACK SELECTION
  /oc-stack-decide     Run the full stack decision tree
  /oc-stack-compare    Compare 2-3 specific stack options side by side

  PATTERNS
  /typed-pipeline   Set up type chain for the selected stack
  /testing          Configure testing pyramid for the stack
  /oc-deploy           Deployment patterns for the selected platform
  /errors           Error handling + logging patterns
  /ci               CI pipeline for the stack

  TRI-DEV INTEGRATION
  /oc-feature          Decompose a feature into stack-ordered sprints

  SESSION
  /checkpoint       Show checkpoint status
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

---

## Stack Decision Tree (`/oc-stack-decide`)

### How It Works

The decision tree adapts to the project. It doesn't assume Cloudflare or any platform —
it starts from requirements and narrows down. Skip questions where the answer is already
clear from oc-app-architect discovery, user memory, or conversation context.

**Before answering any question, web search for current best practices.** Frameworks
change fast — a recommendation from 6 months ago may be wrong today. Search for
"[framework] production readiness 2026" or "[A] vs [B] for [use case]" before committing.

### Question 1: Platform & Hosting

Start here because it constrains everything downstream.

| Factor | Ask |
|---|---|
| Deployment target | Where does this run? Edge (CF Workers, Vercel Edge), serverless (Lambda, Cloud Run), container (Fly.io, Railway), VPS (DigitalOcean), or managed PaaS (Heroku, Render)? |
| User geography | Global (needs edge/CDN) or regional (single-region fine)? |
| Budget | Free tier required? What's the monthly ceiling? |
| Existing infra | Is the team already on AWS/GCP/CF/Vercel? Don't migrate without reason. |
| Compliance | HIPAA, SOC2, GDPR data residency? This eliminates some platforms. |

**Decision heuristic:**
- Solo/small app, free tier matters → **Cloudflare Workers** or **Vercel Hobby**
- Next.js app → **Vercel** (native support) or **CF Pages** (cost)
- Heavy backend logic, Python/ML → **Cloud Run** or **Fly.io**
- Enterprise, existing AWS → **Lambda + API Gateway** or **ECS**
- Full-stack with auth/storage built in → **Supabase** or **Firebase**
- If unsure → **start with the smallest thing that works.** Migrate later when you hit a wall.

### Question 2: Backend Language & Framework

| Factor | TypeScript | Python | Go | Ruby | Rust |
|---|---|---|---|---|---|
| Best for | API-first, full-stack JS, edge | Data/ML, scripting, rapid proto | Performance, infra tools | Rapid web apps, convention | Systems, WASM, extreme perf |
| Frameworks | Hono, Express, Fastify, tRPC, Next.js API | FastAPI, Django, Flask | Chi, Fiber, Echo | Rails, Sinatra | Axum, Actix |
| Type safety | Native (TS) | Pydantic, mypy | Native | Sorbet (optional) | Native |
| ORM | Drizzle, Prisma | SQLAlchemy, Django ORM | GORM, sqlx | ActiveRecord | Diesel, SeaORM |
| Edge deploy | Workers, Vercel Edge | Workers (beta), Lambda | Lambda, Fly.io | Not typical | Workers (WASM), Lambda |

**Decision heuristic:**
- Full-stack JS/TS, API + frontend same language → **TypeScript**
- Data processing, ML features, scripting → **Python**
- Performance-critical microservice → **Go** or **Rust**
- Rapid prototype, "I need this by Friday" → **Rails** or **Next.js**
- Team's strongest language wins unless there's a compelling technical reason otherwise

### Question 3: Database

| Factor | SQLite/D1 | Postgres | MySQL | MongoDB | Redis |
|---|---|---|---|---|---|
| Scale | Small-medium | Any scale | Any scale | Document-heavy | Cache/queue |
| Hosted options | D1, Turso, Litestream | Supabase, Neon, RDS | PlanetScale, RDS | Atlas, self-hosted | Upstash, Elasticache |
| Cost (entry) | Free | Free (Supabase/Neon) | Free (PlanetScale) | Free (Atlas) | Free (Upstash) |
| Best for | Solo/small apps | Most production apps | Legacy, WordPress | Flexible schema | Caching, sessions, queues |
| ORM support | Drizzle, Prisma | All ORMs | All ORMs | Mongoose | ioredis |

**Decision heuristic:**
- < 100 users, simple schema → **SQLite/D1** (zero ops)
- Production app, complex queries, RLS → **Postgres** (Supabase or Neon for free tier)
- Need flexible schema, document storage → **Mongo** (but usually Postgres JSONB is enough)
- Caching layer needed → add **Redis/Upstash** alongside primary DB

### Question 4: Auth

| Option | Best for | Complexity | Lock-in |
|---|---|---|---|
| Passkeys (WebAuthn) | 1-2 known users, passwordless | Medium | None |
| NextAuth / Auth.js | Next.js apps, OAuth providers | Low-Medium | Low |
| Supabase Auth | Full Supabase stack, magic links | Low | Medium |
| Clerk | Polished auth UI, enterprise SSO | Low | High |
| Lucia Auth | Self-hosted, full control | Medium | None |
| Firebase Auth | Google ecosystem | Low | High |
| Platform-native | CF Access, AWS Cognito | Low-Medium | High |
| Roll your own | Never, unless you have a specific reason | High | None |

**Decision heuristic:**
- Using Supabase? → **Supabase Auth**
- Using Next.js? → **Auth.js** or **Clerk**
- 1-2 known users → **Passkeys**
- Internal tool behind corp network → **Platform-native** (CF Access, AWS SSO)
- Need full control → **Lucia**
- Enterprise SSO required → **Clerk** or **Auth0**

### Question 5: Frontend

| Option | Best for | SSR | Complexity |
|---|---|---|---|
| Next.js | Full-stack React, SEO | Yes | Medium |
| React + Vite | SPA, dashboard-style apps | No (client) | Low |
| SvelteKit | Performance, smaller bundle | Yes | Low-Medium |
| Astro | Content sites, marketing pages | Yes (islands) | Low |
| Vue + Nuxt | Vue ecosystem | Yes | Medium |
| HTMX + server templates | Progressive enhancement, Rails-style | Server | Low |
| No frontend | Pure API, CLI tool, mobile backend | N/A | N/A |

### Output: Stack Recommendation

After the decision tree, produce a summary:

```markdown
## Stack Recommendation — [project]

| Layer | Choice | Rationale | Alternatives Considered |
|---|---|---|---|
| Platform | Vercel | Next.js native, generous free tier | CF Pages (cheaper), AWS (team uses it) |
| Backend | Next.js API Routes (TS) | Same language as frontend, tRPC available | FastAPI (if Python needed) |
| Database | Postgres (Supabase) | Auth included, RLS, free tier | D1 (simpler), Neon (standalone) |
| Auth | Supabase Auth | Built-in with DB, magic links | Auth.js (more providers) |
| Frontend | Next.js + React | SSR for SEO, app router | SvelteKit (lighter) |
| Hosting | Vercel | Zero-config for Next.js | CF Pages, Fly.io |

### Estimated Monthly Cost
| Tier | Users | Cost |
|---|---|---|
| Free | < 100 | $0 |
| Growth | 100-1K | $20-50 |
| Scale | 1K+ | $50-200 |
```

When invoked by oc-app-architect, this output becomes `01-tech-stack.md`.

---

## Typed Pipeline (Universal)

Regardless of stack, the principle is the same: **DB schema is truth, everything
downstream is derived.**

```
DB Schema → ORM Types → API Types → API Spec (OpenAPI) → Generated Client Types → Frontend
    ↑                                                                                  │
    └──────────────── Never hand-edit generated types ─────────────────────────────────┘
```

### Per-Stack Type Chains

| Stack | DB → Types | API Spec | Client Gen |
|---|---|---|---|
| Hono + D1 | Drizzle schema → inferred TS | Zod → OpenAPI via @hono/zod-openapi | openapi-fetch |
| Next.js + Supabase | Supabase CLI → generated types | tRPC (type-safe by default) | tRPC client |
| FastAPI + Postgres | SQLAlchemy → Pydantic models | Auto-generated OpenAPI | openapi-typescript |
| Django + Postgres | Django models → serializers | DRF + drf-spectacular | openapi-typescript |
| Rails + Postgres | ActiveRecord → schema.rb | Rswag / committee | openapi-typescript |
| Go + Postgres | sqlc → generated Go types | swaggo/gin-swagger | openapi-typescript |

Read `references/typed-pipeline.md` for detailed implementation per stack.

oc-stack-forge *recommends* the typed pipeline. The `oc-api-dev` skill *materialises*
it: authoring the OpenAPI / GraphQL contract, scaffolding typed handlers, and
generating the SDK. When oc-app-architect Phase 2 detects a first-party API
surface, it auto-invokes oc-api-dev with the stack chosen here.

---

## Testing Strategy (Universal)

| Level | Ratio | What It Catches |
|---|---|---|
| Contract tests | Run every PR | API spec violations, edge-case 500s |
| Unit tests | ~60% | Logic bugs, data transforms |
| Integration tests | ~25% | API flows, DB interactions |
| E2E tests | ~15% | User flows, visual regression |

**For any stack, start with:** contract tests + unit tests on critical paths. Add E2E
only for critical user flows. Don't over-test a 2-user app.

Read `references/testing-patterns.md` for framework-specific tooling.

---

## Deployment Patterns (Per-Platform)

| Platform | Deploy Command | CI/CD | Preview Deploys |
|---|---|---|---|
| CF Workers | `wrangler deploy` | GitHub Actions | `wrangler deploy --env staging` |
| Vercel | `git push` (auto) | Built-in | Automatic per PR |
| Fly.io | `fly deploy` | GitHub Actions | `fly deploy --app staging` |
| AWS Lambda | `cdk deploy` or `serverless deploy` | GitHub Actions | Separate stage |
| Railway | `git push` (auto) | Built-in | Automatic per PR |
| Cloud Run | `gcloud run deploy` | Cloud Build | Traffic splitting |

Read `references/deployment-patterns.md` for detailed patterns per platform.

---

## Platform Matrix (v1.3+)

opchain v1.3 expands the platform menu beyond the JS / Cloudflare bias of v1.0–v1.2.
Four full-stack patterns are first-class targets: oc-stack-forge recommends them,
oc-app-architect's `references/scaffold-guide.md` knows how to scaffold them, and
oc-deploy-ops knows how to ship them.

| Stack | DB | Deploy target | When to pick it |
|---|---|---|---|
| **Node + Hono / Astro** | D1 / Postgres | Cloudflare Workers | The opchain default; static-leaning sites + edge APIs. Cheapest at low scale. |
| **Django + Postgres** | Managed Postgres | Render (primary) / Fly.io | Solo founders / small teams who want batteries-included (admin, ORM, migrations) without ops overhead. |
| **Rails + Postgres** | Managed Postgres | Heroku (primary) / Render | Teams that already know Rails; scaffolding / convention-over-configuration buy speed. |
| **Go (`net/http` or chi)** | Postgres / SQLite | Fly.io (primary) / Cloud Run | Latency-sensitive APIs, long-running connections, high-throughput workers; prefer single-binary deploy. |
| **Rust + Axum** | Postgres / SQLite | Shuttle.rs (primary) / Fly.io | Performance-critical APIs, deep correctness requirements, teams comfortable with the ecosystem. Shuttle gives Postgres + secrets provisioning out of the box. |

### Decision criteria (for /oc-stack-decide)

- **Django/Render** — picks itself when: solo dev, no ops appetite, server-rendered UI, admin panel needed, time-to-first-deploy is the dominant cost. Render's free tier covers the entire app; Postgres is one click. Skip if: you need <50ms global latency or sub-second cold-starts.
- **Rails/Heroku** — picks itself when: team has Rails experience, Hotwire/Turbo replaces a SPA, the app is CRUD-heavy with traditional auth. Heroku's pipeline (review apps + staging + prod) is the smoothest mainstream path. Skip if: cost-at-scale matters more than dev velocity.
- **Go/Fly.io** — picks itself when: performance is the headline requirement, single-binary deploys are aesthetically preferred, the team values explicit error handling. Fly's edge VMs give regional placement without configuring a CDN. Skip if: the team has no Go experience and the app is CRUD-heavy (Django/Rails will ship faster).
- **Rust/Shuttle.rs** — picks itself when: the team wants Rust's correctness guarantees, the app is library-shaped (financial calc, parsers, codecs), and Shuttle's "infra as code in your `main.rs`" model fits. Skip if: the team has no Rust experience (the learning curve is real) or the app is mostly CRUD (Django/Rails ship dramatically faster).

### Cost band (rough monthly, hobby → small-team scale)

| Stack | Hobby | Small team (10k MAU) |
|---|---|---|
| Node + CF Workers | $0 | $5–25 |
| Django/Render | $0 | $14 (Render starter web + Postgres) – $50 |
| Rails/Heroku | $0 (eco) | $50 (Hobby web + mini Postgres) – $150 |
| Go/Fly.io | $0 (3 shared-cpu-1x) | $20 (1 dedicated + Postgres cluster) |
| Rust/Shuttle | $0 (free tier) | $25–60 (Pro tier) |

Costs are 2026-Q2 estimates from public pricing; check the platform docs at decision time.

### Per-stack quick references

| Stack | Scaffold recipe | Deploy recipe |
|---|---|---|
| Django + Postgres + Render | [`scaffold-guide.md` § Django](../oc-app-architect/references/scaffold-guide.md) | [`oc-deploy-ops` § Render](../oc-deploy-ops/SKILL.md) |
| Rails + Postgres + Heroku | [`scaffold-guide.md` § Rails](../oc-app-architect/references/scaffold-guide.md) | [`oc-deploy-ops` § Heroku](../oc-deploy-ops/SKILL.md) |
| Go + Fly.io | [`scaffold-guide.md` § Go](../oc-app-architect/references/scaffold-guide.md) | [`oc-deploy-ops` § Fly.io](../oc-deploy-ops/SKILL.md) |
| Rust + Axum + Shuttle.rs | [`scaffold-guide.md` § Rust](../oc-app-architect/references/scaffold-guide.md) | [`oc-deploy-ops` § Shuttle.rs](../oc-deploy-ops/SKILL.md) |

### What NOT to add to this matrix

The matrix is intentionally short. New stacks earn a row only when:

1. There's a documented `scaffold-guide.md` recipe AND a `oc-deploy-ops` provider section.
2. At least one in-action `/demo` scenario exercises the stack end-to-end.
3. The pairing (language + framework + DB + deploy) is opinionated — opchain
   recommends ONE deploy target per stack rather than listing every option.

Adding a stack without all three is a oc-stack-forge bug; the matrix becomes noise instead of guidance.

---

## `kind: mobile` dispatch (v1.4+)

Mobile packs (iOS / Android / Flutter / React Native — landing in PRs 6 + 6.5
of the v1.4 sequence) do not have a "deploy command" the way web packs do.
App Store / Play Store reviews are the gate; TestFlight / Internal-testing
tracks gate beta cohorts. oc-stack-forge's dispatcher recognises `kind: mobile`
and routes through a **release-checklist** envelope instead of trying to
execute commands.

The runtime entry point is `dispatchMobile(packId)` in
`src/lib/pack-dispatch.js`:

```js
import { dispatchMobile } from "../../src/lib/pack-dispatch.js";

const out = dispatchMobile("ios-swiftui");
// → {
//     kind: "mobile",
//     platform: "ios",
//     displayName: "iOS (SwiftUI)",
//     mobileRef: "mobile.md",
//     releaseChecklist: "iOS (SwiftUI) (ios) — checklist-driven, not automated…"
//   }
```

The returned envelope is rendered verbatim at the head of any oc-stack-forge
output for a mobile pack so the downstream agent (or user) cannot
accidentally interpret it as a deploy command.

### Resolution rules

| Result | What it means | Caller action |
|---|---|---|
| `null` | Pack does not exist. | Surface "unknown pack" error. |
| `{ kind: "not-mobile", actualKind }` | Pack exists but isn't mobile. | Fall back to the regular dispatcher. |
| `{ kind: "mobile", platform, … }` | Mobile pack. | Render `releaseChecklist` + the `mobileRef` doc; do **not** invoke oc-deploy-ops. |

### What goes in the release checklist

The actual checklist content lives in each mobile pack's `mobileRef` doc (e.g.
`skills/oc-stack-forge/packs/ios-swiftui/mobile.md`, landing in PR 6). The
template the agent renders has a fixed prelude:

```
{displayName} ({platform}) — checklist-driven, not automated.
oc-stack-forge will render the release checklist from {mobileRef} rather than
executing commands. App Store / Play Store review windows are the gate.
```

…followed by the body of `mobileRef`. Mobile dispatch deliberately does NOT
invoke `oc-deploy-ops`; oc-release-ops handles the App-Store / Play-Store /
TestFlight / Internal-Testing workflow.

### Why this lands in PR 3, ahead of the first real mobile pack

PR 6 (ADEV-336) ships the first mobile pack (iOS + SwiftUI). Pre-loading the
dispatch logic + tests in PR 3 keeps PR 6's diff focused on the pack content
itself rather than the dispatcher plumbing. The `tests/pack-dispatch.test.js`
suite exercises `dispatchMobile` against synthetic ios/android/flutter/
react-native fixtures so the dispatcher is locked in before any real mobile
pack lands.

---

## Feature Decomposition (`/oc-feature`)

Decomposes a feature into stack-ordered sprints for oc-app-architect Phase 6 regardless of platform:

```
1. DB layer (schema, migrations)
2. API layer (endpoints, types, validation)
3. Type generation (if applicable — OpenAPI, tRPC, codegen)
4. Frontend (components, pages, state)
5. Tests (unit, integration, contract)
6. CI/CD (deploy pipeline, type enforcement)
```

The sprint order follows the type pipeline — bottom-up, each layer built on
verified ground truth. This ordering is universal across stacks.

---

## Invocation by oc-app-architect

**Stack-forge is actively invoked by oc-app-architect during Phase 2** per orchestrator.md §3.
When called, oc-stack-forge:

1. Reads the discovery context from `.checkpoints/oc-app-architect.checkpoint.json` (requirements, users, constraints, budget, team experience).
2. Runs the decision tree (platform → backend → database → auth → frontend), web-searching for current framework status.
3. Produces the stack recommendation.
4. Writes its own checkpoint and returns control to oc-app-architect, which then writes `01-tech-stack.md` and `02-architecture.md`.
5. User reviews stack at oc-app-architect's Spec Approval Gate.

**The user does not call `/oc-stack-forge` separately for new projects** — oc-app-architect
chains to it via the active-invocation pattern. `/oc-stack-forge` is only invoked standalone for:
- Quick stack questions outside a project context
- Feature decomposition (`/oc-feature`) for existing projects
- Gap analysis on existing codebases (with oc-reverse-spec)

---

## Session Persistence (Checkpoint Protocol)

Checkpoint location: `{project-dir}/.checkpoints/oc-stack-forge.checkpoint.json`

### When to Write

| Event | What to Save |
|---|---|
| Each decision tree question answered | Decision + rationale |
| Decision tree complete | Full recommendation, stack path |
| Feature decomposition generated | Sprint plan reference |
| Gap analysis completed | Findings summary |

### skill_state

```json
{
  "stack_path": "nextjs-supabase",
  "decisions": {
    "platform": { "choice": "Vercel", "rationale": "Next.js native" },
    "backend": { "choice": "Next.js API Routes", "rationale": "Full-stack TS" },
    "database": { "choice": "Supabase Postgres", "rationale": "Auth included, free tier" },
    "auth": { "choice": "Supabase Auth", "rationale": "Built-in" },
    "frontend": { "choice": "Next.js + React", "rationale": "SSR, app router" }
  },
  "features_planned": [],
  "gap_analysis_done": false
}
```

### Cross-Skill Reads

| Reads from | Why |
|---|---|
| oc-app-architect | Discovery interview → stack decision context |
| oc-reverse-spec | Existing stack → gap analysis baseline |

| Read by | Why |
|---|---|
| oc-app-architect | Stack recommendation → Phase 2 spec (automatic); Phase 6 uses sprint decomposition patterns |
| oc-code-auditor | Type pipeline standard → compliance check |
| oc-scale-ops | Platform limits → scaling constraints |
| oc-deploy-ops | Platform → deployment patterns |

---

## Reference Docs

| Command | Reference | Contents |
|---|---|---|
| /typed-pipeline | `references/typed-pipeline.md` | Type chains per stack |
| /testing | `references/testing-patterns.md` | Testing pyramid per framework |
| /oc-deploy | `references/deployment-patterns.md` | Deploy patterns per platform |
| /errors | `references/error-handling.md` | Structured errors, logging |
| /oc-feature | `references/feature-decomposition.md` | Sprint templates for oc-app-architect Phase 6 |
| — | `references/cf-deployment.md` | CF-specific patterns (Workers, D1, KV) |

**When a reference doc doesn't cover the selected stack**, web search for current
best practices and generate the pattern inline. The reference docs are a starting
point, not a ceiling.

---

## PM-Tool MCP Integration (v1.2+)

oc-stack-forge produces architectural decisions. Those decisions
deserve a permanent home in the PM tool — the next engineer
investigating "why are we on this stack?" should not have to dig
through chat logs. v1.2 makes oc-stack-forge an Architectural
Decision Record (ADR) author. See `oc-integrations-engineer` for
the canonical PM-MCP patterns.

### Stack-decision comment on the linked ticket

When oc-stack-forge runs from oc-app-architect Phase 2 (the typical
case), the source ticket comes from the parent invocation. After
the stack is selected, post:

```
Stack decision (ADR-{N}):
  Platform:  {choice}        ← {one-line rationale}
  Backend:   {choice}        ← {one-line rationale}
  Database:  {choice}        ← {one-line rationale}
  Auth:      {choice}        ← {one-line rationale}
  Frontend:  {choice}        ← {one-line rationale}

Considered + rejected: {alternatives}, because {reason}.
Cost projection: ~${USD/month} at MVP scale.
Full rationale: spec/01-tech-stack.md
```

The `ADR-{N}` is auto-numbered from the project's existing ADR
counter (read from `.opchain/adr-counter` if present; otherwise
maintained by oc-stack-forge in the checkpoint).

### Standalone `/oc-stack-decide` runs

When oc-stack-forge is invoked outside a Phase 2 flow with
`/oc-stack-decide --ticket TICKET-1234`, the ticket is treated as
the ADR home. Otherwise the decision lives in the project's
`docs/adr/` directory only.

### Re-decisions

If `/oc-stack-decide` is invoked on a project that already has a
prior stack-decision comment in PM:

- Find the prior comment via the PM-MCP search.
- Post a follow-up comment: `Stack re-decision; supersedes ADR-{prev}.`
- Add the supersession to the prior ADR record.

### Failure modes

- No ticket context → no PM write; ADR lives in
  `docs/adr/{N}-stack-decision.md` only.
- MCP unavailable → log intent to checkpoint as deferred.
- ADR counter conflict → fall back to ISO timestamp suffix
  rather than block.

---

## Principles

1. **Start with the smallest stack that works.** SQLite before Postgres. Vercel before
   AWS. Monolith before microservices. Upgrade when you hit a real wall.
2. **One-direction type flow.** DB schema is truth. Everything downstream is derived.
3. **Web search before recommending.** Frameworks change. Don't recommend based on
   stale training data — search for current status.
4. **CI is the enforcer.** If it's not in CI, it's a suggestion, not a rule.
5. **The team's stack wins.** Unless there's a compelling technical reason, match what
   the team already knows. Migration cost > marginal framework benefit.
6. **Automatic, not optional.** Stack decisions happen inside oc-app-architect Phase 2,
   not as a separate step the user might forget.
