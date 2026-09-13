# Phase Planning Reference

Methodology for breaking applications into buildable phases with clear ownership, dependencies, and risk management.

---

## Core Principle

The roadmap answers one question at every moment: **"What do I do next?"** If reading it requires thinking about sequencing or what a task means concretely, rewrite the task.

---

## Task Numbering: T[phase].[step]

**Format:** `[OWNER] T[phase].[step] — [Description]`

```
CLAUDE T1.0 — Initialize project scaffold with Next.js + TypeScript + Tailwind
USER T1.1 — Create Supabase project, note URL and anon key
USER T1.2 — Copy .env.example to .env, fill in values from T1.1
CLAUDE T1.3 — Create database migration for users table
CLAUDE+USER T1.4 — Review dashboard layout (Claude builds, user gives feedback)
```

**Rules:**
- Sequential within a phase: T1.0, T1.1, T1.2...
- CLAUDE/USER/CLAUDE+USER interleave by dependency
- Max ~20 steps per phase. More = split the phase.
- Cross-reference with `Depends on: T1.2` when order matters

---

## Owner Definitions

**CLAUDE** — Claude generates autonomously. User reviews output.
Typical: migrations, components, API endpoints, config, seed data, types.

**USER** — Only a human can do this.
Typical: create accounts, obtain API keys, purchase domains, make branding decisions, test on real devices, fill .env.

**CLAUDE+USER** — Claude drafts, user reviews/adjusts.
Typical: page layouts, user-facing copy, pricing tiers, E2E test scenarios, security review.

---

## Phase Structure

Every phase contains these sections:

```
## Phase [N]: [Name]
Goal: [One sentence. No "and" — if you need "and", split the phase.]
Prerequisites: [Task IDs from prior phase]
Risk: [Single biggest risk] → Fallback: [What to do if it hits]
Scope cut list: [Items to defer if over time budget]

### Tasks
[T[N].0 through T[N].x with OWNER prefix]

### Validation Checkpoint
- [ ] [Testable condition with task ID reference]

### Rollback Plan
[How to recover if this phase breaks the previous one]
```

---

## Phasing Strategy

### The MVP Test
Can you describe Phase 1's deliverable in one sentence without "and"? If not, cut scope.

Phase 1 is the smallest thing that proves the core idea works. Not polished. Not complete. Just: one user can do the one thing the app exists for.

### Typical Phase Breakdown

| Phase | Goal | Covers | Duration |
|---|---|---|---|
| 1: Foundation | Core loop works for one user | Setup, auth, DB, primary feature, deploy | 1-3 days |
| 2: Usable | Real users can use it without hand-holding | Error handling, loading states, responsive, secondary features, onboarding | 3-7 days |
| 3: Connected | Handles real traffic, talks to outside world | Performance, integrations, webhooks, email, analytics, monitoring | 1-2 weeks |
| 4: Revenue (if applicable) | Generates money | Payments, subscriptions, landing page, SEO | 1-2 weeks |

Adjust phase count to project scope:
- Personal tool: 1-2 phases
- Internal tool: 2-3 phases
- SaaS MVP: 3-4 phases
- Full product: 4-5 phases

### Build Order Within Each Phase
Follow the design pipeline's dependency chain:
1. Design tokens → CSS variables / Tailwind config
2. Base components (Button, Input, Badge, Card)
3. Composite components (DataTable, Form, Modal, Sidebar)
4. Layout components (AppLayout, AuthLayout)
5. Screen pages (from punch list)
6. Navigation / routing
7. Backend hookup (auth → reads → writes → real-time → errors)

---

## Risk Management

### Per-Phase Risk Assessment
Every phase identifies its single biggest risk and a concrete fallback:

```
Risk: Supabase RLS policies may be too complex for the approval workflow
Fallback: Use API-layer authorization instead of RLS. Slower to build but more debuggable.
```

```
Risk: Stripe webhook integration may take longer than estimated
Fallback: Defer payment to Phase 4. Use manual invoicing for first 10 customers.
```

### Scope Cut Lists
Every phase has a ranked list of items to defer if time runs over:

```
Scope cut list (in order of what gets cut first):
1. CSV export (nice-to-have, users can screenshot)
2. Email notifications (users can check the app directly)
3. Dark mode (cosmetic, zero functional impact)
```

Cut from the bottom of the list up. The top items are the last to go.

### Rollback Plans
Each phase documents how to recover if it breaks the previous phase:

```
Rollback Plan:
- Git: revert to tag v0.1.0 (end of Phase 1)
- Database: migration 003 has a down() that drops the new tables
- Deployment: Vercel instant rollback to previous deployment
- Data: no user data migration in this phase, so no data risk
```

---

## Task Granularity

### Too Vague
- "Set up the frontend"
- "Implement authentication"
- "Add database tables"

### Too Granular
- "Create src/components directory"
- "Add import statement for React"
- "Set border-radius to 8px"

### Right Level
```
CLAUDE T1.3 — Create migration: `projects` table with id (uuid PK), name (text NOT NULL),
  owner_id (uuid FK → users.id), status (text DEFAULT 'active'), created_at (timestamptz DEFAULT now())

CLAUDE T1.4 — Build ProjectList component: fetch user's projects, render as card grid,
  empty state with "Create your first project" CTA, loading skeleton, error state with retry

USER T1.1 — Create Stripe account at stripe.com, enable test mode, copy publishable key
  and secret key to .env as STRIPE_PUBLISHABLE_KEY and STRIPE_SECRET_KEY
```

**Test:** Can someone execute this task without asking a follow-up question?

---

## Grouping USER Tasks

Manual tasks interrupt flow. Batch them:

**Setup Session** (phase start): All account creation, API keys, .env population in one 30-minute block.

**Review Gate** (phase end): All testing, verification, and feedback in one focused session.

```
### User Setup (~30 min)
USER T1.0 — Create Supabase project → note URL and anon key
USER T1.1 — Create Vercel account → connect GitHub repo
USER T1.2 — Copy .env.example to .env → fill in all values
USER T1.3 — Run `npm run dev` → verify app loads at localhost:3000
```

```
### User Validation (before Phase 2)
USER T1.15 — Test signup flow on phone
USER T1.16 — Test core feature with real data (not test data)
USER T1.17 — Verify deployed URL loads correctly
USER T1.18 — Flag issues for Phase 2 adjustments
```

---

## Effort Estimation

### Heuristics
| Task Type | CLAUDE Estimate | Notes |
|---|---|---|
| DB migration (1-3 tables) | 10-20 min | Include indexes and RLS |
| React component (with all states) | 20-40 min | Loading, empty, error, responsive |
| API endpoint (CRUD) | 15-30 min | Validation, error handling, types |
| Auth flow (signup + login + logout) | 45-90 min | Including middleware and session |
| Full page (layout + components + routing) | 60-120 min | Depends on component count |
| CI/CD pipeline | 15-30 min | Lint + test + build + deploy |

| Task Type | USER Estimate | Notes |
|---|---|---|
| Account creation + API keys | 5-15 min per service | Supabase, Vercel, Stripe, etc. |
| .env population | 5-10 min | After all keys obtained |
| Test a flow on device | 10-20 min | Per critical flow |
| Design review + feedback | 15-30 min | Per screen set |

### Buffer Rule
Add 30% buffer to CLAUDE estimates (unexpected edge cases, API quirks). Add 50% buffer to USER estimates (context-switching, decision fatigue).

---

## Validation Checkpoints

Every phase ends with testable proof it's done:

**Good:**
- [ ] User can sign up and receive confirmation email (T1.5)
- [ ] Dashboard loads <2s with 100 items (T1.8)
- [ ] Payment form processes test charge in Stripe (T4.3)

**Bad:**
- [ ] Authentication is implemented (vague)
- [ ] Code is clean (subjective)
- [ ] All components are built (doesn't prove they work)

---

## Dependency Tracking

Use `Depends on:` to make blocking relationships explicit:

```
CLAUDE T1.7 — Build Stripe webhook handler
  Depends on: USER T1.1 (Stripe account), CLAUDE T1.3 (DB schema)
  Blocked by: CLAUDE+USER T1.5 (pricing decision)
  Output: /api/webhooks/stripe handling checkout.session.completed,
    customer.subscription.updated, customer.subscription.deleted
```

For complex dependencies, include a text-based dependency summary at the phase level:
```
Phase 2 Dependencies:
  T2.0 depends on: T1.3 (schema exists)
  T2.3 depends on: T2.0, T2.1 (components exist)
  T2.7 blocked by: T2.5 (USER decision on pricing)
```

---

## Handling Unknowns

Mark tasks you can't fully detail yet:

```
CLAUDE T2.7 — Implement payment webhook handling
  Detail: TBD — depends on pricing model from CLAUDE+USER T1.5
  Status: DEFERRED
  Estimated effort: 2-4 hours once unblocked
```

Visible unknowns are manageable. Hidden unknowns become blockers.

---

## Anti-Patterns

| Anti-Pattern | Fix |
|---|---|
| Phase 1 has 30+ tasks | Split into Phase 1a and 1b, or cut scope |
| USER tasks scattered randomly | Batch into setup sessions and review gates |
| "Set up backend" as a single task | Break into: migration, seed data, API endpoints, auth middleware |
| No validation checkpoint | Add testable conditions with task ID references |
| Dependencies not documented | Add `Depends on:` to every task that has a predecessor |
| Effort estimates missing | Add CLAUDE hours + USER hours per phase |
| No scope cut list | Rank all non-critical items by what gets cut first |
| Risk not assessed | Identify one risk per phase + fallback plan |
| No rollback plan | Document how to recover from this phase failing |
