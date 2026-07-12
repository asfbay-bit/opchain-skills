---
name: oc-migration-ops
displayName: OC · Migration Ops
version: 1.8.1
shortDesc: Change the engine mid-flight — DB, framework, auth, platform. v1.2 mirrors the plan as parent + step children.
phases: [plan, build]
triAgent: false
tryable: true
commands:
  - /oc-migrate
  - /oc-migrate assess
  - /oc-migrate plan
  - /oc-migrate impact
  - /oc-migrate execute
  - /oc-migrate step
  - /oc-migrate verify
  - /oc-migrate rollback
  - /oc-migrate status
  - /oc-migrate diff
  - /oc-migrate history
  - /oc-migrate dry-run
  - /oc-migrate ecosystem
  - /oc-migrate abandon
description: >
  Migration and refactor operator for live systems: database migrations (D1 →
  Postgres, schema overhauls), framework upgrades (Hono v3→v4, React 18→19), auth
  provider swaps, monorepo restructures, and platform moves (Workers → Vercel).
  Produces incremental plans with rollback points at every step, executes with
  verification gates, and validates the end state matches the target spec. ALWAYS
  trigger on /oc-migrate, /oc-migration, /oc-upgrade, /oc-refactor, /oc-swap,
  /oc-move-to, /oc-platform-move. Also trigger on "migrate from X to Y", "upgrade
  to", "swap auth provider", "move database", "restructure the monorepo", "refactor
  to use", "breaking changes", "deprecation", "end of life". Also covers opchain
  ecosystem upgrades: "update all skills", "checkpoint protocol upgrade", "bulk update
  SKILL.md". Trigger when transforming an existing system from one state to another —
  not greenfield building (oc-app-architect) or documenting what exists
  (oc-reverse-spec). Trigger liberally.
---

# Migration Ops

**On first invocation, read `references/orchestrator.md` and follow its welcome protocol.**

The "change the engine mid-flight" skill. Fills the gap between oc-reverse-spec ("what I
have") and oc-app-architect ("what I want") when the answer is "transform one into the
other" — without downtime, without data loss, and with a rollback at every step.

This is inherently multi-session work. A database migration plan might span 3–4
conversations. Checkpoint protocol adoption is critical from day one.

## /oc-migrate — Command Reference

```
MIGRATION OPS COMMANDS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  PLAN
  /oc-migrate              Show this menu
  /oc-migrate assess       Inventory current state + classify migration type
  /oc-migrate plan         Generate incremental migration plan with rollback points
  /oc-migrate impact       Blast radius analysis — what breaks during each step

  EXECUTE
  /oc-migrate execute      Start or resume execution from migration plan
  /oc-migrate step [N]     Execute a specific step (with pre/post verification)
  /oc-migrate verify       Run verification suite against current state
  /oc-migrate rollback     Revert to last verified checkpoint

  OBSERVE
  /oc-migrate status       Current migration state from checkpoint
  /oc-migrate diff         Compare current state vs. target state
  /oc-migrate history      Show completed steps with pass/fail and timing

  UTILITIES
  /oc-migrate dry-run      Simulate the next step without applying changes
  /oc-migrate ecosystem    Bulk-update opchain skills (format, protocol, oc-orchestrator)
  /oc-migrate abandon      Abandon an in-progress migration (archive checkpoint)
  /checkpoint           Show checkpoint status

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  Type any command, or describe what you want to migrate.
```

---

## How This Skill Fits the Pipeline

```
EXISTING SYSTEM (documented or not)
       │
       ├──► oc-reverse-spec (if undocumented → produces baseline specs)
       │
       ▼
┌──────────────┐
│ MIGRATION-OPS│  current state → migration plan → incremental execution → target state
│              │  Reads: oc-reverse-spec, oc-stack-forge, oc-app-architect, oc-code-auditor
│              │  Chains to: oc-code-auditor (post-migration verify), oc-deploy-ops (cutover)
└──────┬───────┘
       │
       ├──► oc-code-auditor /oc-audit (post-migration quality gate)
       ├──► oc-deploy-ops /oc-deploy (cutover deployment)
       └──► oc-app-architect (if migration reveals spec updates needed)
```

Migration-ops sits between "what exists" and "what should exist" — it's the
transformation engine. It does NOT build new features (oc-app-architect) or document
existing code (oc-reverse-spec). It transforms running systems from state A to state B.

---

## Migration Types

Every migration request is classified into one of these types. The type determines
which reference playbook to load and which verification strategy to use.

| Type | Examples | Risk | Key Concern |
|---|---|---|---|
| **Database** | D1 → Postgres, schema overhaul, ORM swap | HIGH | Data integrity, zero data loss |
| **Framework** | Hono v3→v4, React 18→19, Next.js pages→app router | MEDIUM | Breaking API changes, dependency conflicts |
| **Auth** | Passkeys → Supabase Auth, Auth0 → Clerk, session → JWT | HIGH | Auth gap = security gap, user lockout |
| **Platform** | Workers → Vercel, Supabase → raw Postgres, Heroku → Fly.io | HIGH | DNS cutover, cold start behavior, binding changes |
| **Structural** | Monorepo restructure, module extraction, package split | MEDIUM | Import path breakage, CI pipeline updates |
| **Dependency** | Major version bumps, library swap (Axios → fetch, Moment → date-fns) | LOW-MED | API surface changes, bundle impact |
| **Ecosystem** | Opchain skill format changes, checkpoint protocol upgrades, oc-orchestrator rewrites, bulk SKILL.md updates | LOW-MED | Consistency across N skills, no skill left behind |

### Auto-Detection

When the user describes a migration without explicitly classifying it, infer the type:

- "Move from D1 to Postgres" → Database
- "Upgrade Hono to v4" → Framework
- "Switch auth to Supabase" → Auth
- "Move off Cloudflare to Vercel" → Platform
- "Split the monorepo" → Structural
- "Replace Axios with fetch" → Dependency
- "Update all skills to the new format" → Ecosystem
- "Upgrade checkpoint protocol to v2" → Ecosystem
- "Add a new field to every SKILL.md" → Ecosystem

If ambiguous, ask ONE clarifying question using `ask_user_input`.

---

## Phase 0: Assessment (`/oc-migrate assess`)

Before planning anything, understand the current state and the target state. This is
the most important phase — a bad assessment produces a bad plan.

### Step 1: Gather Current State

Check for existing documentation in this order:

1. **CLAUDE.md / project config** — if a CLAUDE.md exists in the project root, read it
   first. For aidops-core apps, also read `wrangler.toml` for bindings (D1, KV, secrets),
   routes, and compatibility dates.
2. **Reverse-spec checkpoint** — if it exists, the current state is already documented.
   Read `context_primer.key_decisions` and `generated_files` for architecture, schema,
   and stack info. Skip redundant scanning.
3. **App-architect checkpoint** — read spec files (01-tech-stack.md, 02-architecture.md)
   for the documented architecture.
4. **Stack-forge checkpoint** — read stack decisions for current platform/framework choices.
5. **Code scan** — if no upstream checkpoints exist, run a targeted scan of the specific
   layer being migrated (not a full oc-reverse-spec).

### Step 2: Define Target State

The user describes where they want to end up. Capture:

- **Target technology** — specific framework, database, platform, auth provider
- **Target version** — exact version number, not "latest"
- **Constraints** — zero downtime required? Data migration needed? Backward compat?
- **Timeline** — "this session" vs. "planned over multiple sessions"
- **Success criteria** — what proves the migration worked?

### Step 3: Gap Analysis

Compare current state → target state. For each gap:

| Gap | Current | Target | Effort | Risk | Dependencies |
|---|---|---|---|---|---|
| Database engine | D1 (SQLite) | Supabase Postgres | L | HIGH | Schema translation, ORM swap |
| Auth provider | WebAuthn passkeys | Supabase Auth | M | HIGH | Session migration, credential mapping |
| Query patterns | Drizzle + D1 | Drizzle + Postgres | S | LOW | Connection string change, dialect swap |

### Step 4: Risk Classification

Rate the overall migration:

| Risk Level | Criteria | Planning Depth |
|---|---|---|
| **LOW** | Dependency swap, no data, no auth, no platform change | Lightweight plan, 2-3 steps |
| **MEDIUM** | Framework upgrade, structural refactor, minor schema changes | Standard plan, 5-10 steps |
| **HIGH** | Database engine change, auth swap, platform move | Full plan with rollback at every step, verification gates |
| **CRITICAL** | Production data migration + auth change + platform move simultaneously | Break into sequential migrations, never do all at once |

**Critical migration rule:** If the assessment reveals a CRITICAL-risk migration,
recommend breaking it into 2-3 sequential migrations (e.g., migrate database first,
then swap auth, then move platform). Each sequential migration gets its own plan.
Never execute multiple HIGH-risk changes simultaneously.

### Output: Assessment Report

```markdown
# Migration Assessment — [project]

## Classification
- **Type:** [Database | Framework | Auth | Platform | Structural | Dependency | Ecosystem]
- **Risk:** [LOW | MEDIUM | HIGH | CRITICAL]
- **Estimated steps:** [N]
- **Estimated sessions:** [N]

## Current State
[Dense summary from checkpoint reads or code scan]

## Target State
[What the user wants to achieve]

## Gap Analysis
| Gap | Current | Target | Effort | Risk |
|---|---|---|---|---|

## Dependencies
[What must be true before migration starts — tests passing, backups, etc.]

## Recommendation
[Proceed with single migration plan | Break into sequential migrations | Defer — prerequisites missing]
```

Write checkpoint: phase "assessed".

---

## Phase 1: Migration Plan (`/oc-migrate plan`)

Generate an incremental migration plan. Every step has a verification gate and a
rollback procedure. The plan follows the **expand-migrate-contract** pattern where
applicable.

### Pre-Planning: Web Search

**Before generating any plan, web search for the migration path.** Frameworks publish
migration guides, databases have export/import docs, and platforms document cutover
procedures. Search for `[source] to [target] migration guide [year]` and read the
official docs before writing a single step. The official guide overrides generic
patterns — if Hono v5 has a codemod, use it instead of manual find-and-replace.

### Expand-Migrate-Contract Pattern

For most non-trivial migrations, the safest approach is:

1. **Expand** — Add the new capability alongside the old one (dual-write, feature flag,
   new column alongside old). Both systems work simultaneously.
2. **Migrate** — Move data/traffic/users from old to new. Verify at each batch.
3. **Contract** — Remove the old capability once new is verified. This is the point
   of no return — keep rollback available until this step.

Not every migration needs this pattern. Dependency swaps and minor framework upgrades
can often be done in-place. The assessment's risk level determines the approach:

| Risk | Approach |
|---|---|
| LOW | In-place upgrade with tests |
| MEDIUM | Feature-flagged rollout or branch-based |
| HIGH | Full expand-migrate-contract |
| CRITICAL | Break into sequential HIGH migrations, each with expand-migrate-contract |

### Migration Step Template

Every step in the plan follows this structure:

```markdown
## Step [N]: [Short title]

### Owner
CLAUDE | USER | CLAUDE+USER
(CLAUDE = autonomous execution. USER = only a human can do this — create accounts,
fill .env, DNS changes. CLAUDE+USER = Claude drafts, user reviews/confirms.)

### What Changes
[Specific files, configs, schemas, or infrastructure being modified]

### Pre-Conditions
[What must be true before this step runs — prior steps passed, tests green, etc.]

### Procedure
[Numbered instructions. Concrete commands, not vague descriptions.]

### Verification
[How to prove this step succeeded. Specific checks:]
- [ ] [Testable condition — command to run, expected output]
- [ ] [Another condition]

### Rollback
[How to undo this step if verification fails. Specific commands.]
- [ ] [Rollback step 1]
- [ ] [Rollback step 2]
- [ ] [Verify rollback succeeded]

### Point of No Return?
[YES/NO. If YES, explain why and what must be confirmed before proceeding.]

### Estimated Time
CLAUDE: [time] | USER: [time]
```

### Standard Step Ordering by Migration Type

Read `references/migration-playbooks.md` for type-specific step templates. General
ordering principles:

**Database migrations:**
1. Backup current database
2. Create target database + apply schema
3. Set up dual-write (if live migration)
4. Migrate data in batches with verification
5. Switch reads to new database
6. Verify all reads correct
7. Stop writes to old database
8. Remove dual-write code
9. Archive old database

**Framework upgrades:**
1. Pin current version in lockfile
2. Web search `[framework] [version] migration guide` — read breaking changes
3. Create upgrade branch
4. Bump version
5. Fix breaking changes (compiler/linter-guided, referencing migration guide)
6. Run full test suite
7. Manual smoke test
8. Merge

**Auth provider swaps:**
1. Set up new auth provider (sandbox/dev)
2. Implement new auth flow alongside old (feature-flagged)
3. Migrate user credentials / sessions
4. Route new signups to new provider
5. Migrate existing users in batches
6. Verify all users can authenticate via new provider
7. Remove old auth code
8. Decommission old provider

**Platform moves:**
1. Set up target platform account + project
2. Adapt code for target runtime (bindings, env vars, API differences)
3. Deploy to target (staging)
4. Run full smoke test suite on target
5. Set up DNS for cutover (low TTL)
6. Cutover DNS
7. Monitor for 24-48h
8. Decommission old platform

### ★ Plan Approval Gate

Present the complete plan. User reviews every step, rollback procedure, and point
of no return. Do NOT proceed until explicitly approved.

Write checkpoint: phase "planned".

---

## Phase 2: Execution (`/oc-migrate execute`)

Execute the migration plan step by step. Each step is a mini-cycle: pre-check (block on missing
preconditions) → execute (rollback on error) → verify (retry / manual fix / rollback on fail) →
checkpoint (save progress + verification).

### Execution Rules

1. **One step at a time.** Never batch-execute steps. Each step gets individual
   verification before the next begins.

2. **Verify before advancing.** A step is not "done" because the commands ran
   without errors. It's done when the verification checks pass.

3. **Checkpoint after every step.** If the session ends mid-migration, the next
   session knows exactly where to resume.

4. **Rollback is always available** — until a "point of no return" step, at which
   point the user must explicitly confirm they want to proceed.

5. **Dry run first** when the step modifies production data. Show what would
   change without applying it.

### Step Execution Report

After each step:

```markdown
## Step [N] — Execution Report

### Status: PASSED | FAILED | ROLLED BACK

### Procedure Output
[Key output from the commands run]

### Verification Results
- [x] [Check 1] — PASSED [evidence]
- [ ] [Check 2] — FAILED [what went wrong]

### Duration
CLAUDE: [X min] | USER: [Y min]

### Next
[What happens next — next step, or remediation needed]
```

---

## Phase 3: Verification (`/oc-migrate verify`)

Run the full verification suite against the current state. This can be invoked:
- After completing all steps (final verification)
- Mid-migration (progress check)
- After a rollback (confirm clean state)

### Verification Layers

| Layer | What to Check | Tools |
|---|---|---|
| **Schema** | Target schema matches expected (tables, columns, types, indexes) | SQL inspection, ORM schema dump |
| **Data** | Row counts match, checksums match, no orphaned records | COUNT queries, spot-check samples |
| **API** | All endpoints respond correctly with new backend | Smoke test suite, contract tests |
| **Auth** | Users can authenticate, sessions valid, permissions correct | Auth flow test, token validation |
| **Performance** | No regression in response times | Baseline comparison, p95 latency |
| **Integration** | External services still connected and functional | Integration health checks |
| **CI/CD** | Pipeline passes with new configuration | Full CI run |

### Final Verification Report

```markdown
# Migration Verification — [project]

## Migration: [description]
## Steps Completed: [X] of [Y]

## Verification Results
| Layer | Status | Evidence | Notes |
|---|---|---|---|
| Schema | ✅ PASS | 12 tables, all indexes present | — |
| Data | ✅ PASS | Row counts match ±0, checksums verified | — |
| API | ⚠️ PARTIAL | 18/20 endpoints pass, 2 timeout | See findings |
| Auth | ✅ PASS | Both users authenticated successfully | — |
| Performance | ✅ PASS | p95 42ms (baseline: 45ms) | Slight improvement |

## Open Issues
1. [Issue with details and remediation plan]

## Verdict: MIGRATION COMPLETE | ISSUES REMAINING
```

---

## Rollback (`/oc-migrate rollback`)

Revert to the last verified state. Rollback granularity depends on migration progress:

### Rollback Strategies

| Scenario | Strategy |
|---|---|
| Step N failed, steps 1-(N-1) verified | Roll back step N only |
| Multiple steps failed | Roll back to last verified step |
| Full migration needs reversal | Execute rollback procedures in reverse order |
| Post-cutover rollback (platform move) | DNS revert + traffic switch |
| Data migration rollback | Restore from backup taken at step 1 |

### Rollback Verification

After rollback, run the same verification suite against the original state:
- Schema matches pre-migration state
- Data intact (compare against backup checksums)
- All endpoints respond as before
- Auth works as before

---

## Handling Multi-Session Migrations

Migrations are the most checkpoint-dependent skill in the ecosystem. A database
migration might span 4+ sessions:

- Session 1: Assessment + plan generation
- Session 2: Steps 1-3 (backup, create target, dual-write setup)
- Session 3: Steps 4-6 (data migration, read switchover)
- Session 4: Steps 7-9 (cleanup, decommission, final verification)

### Session Handoff Protocol

At the end of each session (or when context is getting long):

1. Write a detailed checkpoint with:
   - Which steps are complete (with verification results)
   - Which step is next
   - Any manual steps the user needs to do before next session
   - Current system state (dual-write active? which database is primary?)
2. Tell the user: "Migration paused at step [N]. Before next session, please [manual tasks]. Next session will resume with [step N+1]."

### Session Resume

On resume, oc-migration-ops:
1. Reads its checkpoint
2. Displays migration progress and current system state
3. Checks if manual tasks are complete
4. Re-runs verification on the last completed step (detect drift)
5. Proceeds with next step

---

## Impact Analysis (`/oc-migrate impact`)

Before executing, analyze blast radius — what could break at each step and who's
affected.

### Impact Report

```markdown
## Impact Analysis — [migration description]

### Service Dependencies
[Which services/users/integrations depend on the system being migrated]

### Per-Step Impact
| Step | What Changes | Who's Affected | Downtime | Rollback Time |
|---|---|---|---|---|
| 1. Backup | Nothing visible | Nobody | 0 | N/A |
| 2. Schema | Nothing visible | Nobody | 0 | < 1 min |
| 3. Dual-write | Write latency +10ms | All users | 0 | < 5 min |
| 4. Data migration | Read latency +20ms | All users | 0 | 30 min (restore backup) |
| 5. Read switchover | ★ CRITICAL — brief read gap | All users | ~30s | < 5 min |

### Risk Mitigation
| Risk | Likelihood | Mitigation |
|---|---|---|
| Data loss during migration | LOW | Backup verified at step 1, checksums per batch |
| Auth gap during switchover | MEDIUM | Feature flag, gradual rollout (10% → 50% → 100%) |
| Performance regression | LOW | Baseline metrics captured, alert if p95 > 2x |

### Recommended Timing
[When to run this migration — low-traffic window, maintenance window, or safe anytime]
```

---

## Cross-Skill Integration

| Skill | Relationship |
|---|---|
| **oc-reverse-spec** | Upstream. Reads oc-reverse-spec output for current state documentation. If no oc-reverse-spec exists, runs a targeted scan of the migration-relevant layers only. |
| **oc-stack-forge** | Upstream. Reads stack decisions. For platform moves, invokes oc-stack-forge to validate the target stack before planning. |
| **oc-app-architect** | Peer. If migration reveals spec updates needed (new architecture after database change), chains to oc-app-architect to update spec files. |
| **oc-code-auditor** | Downstream. After migration completes, invokes `/oc-audit full` on the migrated code to catch quality regressions. |
| **oc-deploy-ops** | Downstream. For platform moves and cutover deploys, chains to oc-deploy-ops for the deployment steps. |
| **oc-security-auditor** | Downstream. Auth migrations always trigger a security posture check afterward. |
| **oc-scale-ops** | Peer. Platform moves may change scaling characteristics. Reads oc-scale-ops for performance baselines. |
| **oc-git-ops** | Downstream. After migration steps that produce code changes, suggests oc-git-ops commit. |
| **oc-monitoring-ops** | Downstream. Platform moves and database migrations change health check URLs, connection targets, and alert thresholds. Invoke `/oc-monitor setup` to update monitoring config after cutover. |

### Active Chaining

| Trigger | Action |
|---|---|
| Assessment needs current state docs | Check oc-reverse-spec checkpoint → if missing, run targeted scan |
| Platform move planned | Invoke oc-stack-forge to validate target stack |
| Migration complete | Invoke oc-code-auditor `/oc-audit full` |
| Auth migration complete | Invoke oc-security-auditor `/oc-security posture` |
| Code changes from migration steps | Suggest oc-git-ops `/oc-git-sync` |
| Cutover deployment needed | Invoke oc-deploy-ops `/oc-deploy staging` then `/oc-deploy prod` |
| Platform or database migration complete | Invoke oc-monitoring-ops `/oc-monitor setup` to update health checks and alert targets |

---

## Session Persistence (Checkpoint Protocol)

Checkpoint: `{project-dir}/.checkpoints/oc-migration-ops.checkpoint.json`

### Resume on Start

When any `/oc-migrate` command is invoked:
1. Check for checkpoint
2. If exists: show migration type, current step, verification status, next action
3. Ask: "Continue from step [N], restart, or show full checkpoint?"

### Concurrent Migration Guard

**One active migration per project.** If a checkpoint exists with `status: in_progress`,
block any new `/oc-migrate assess` or `/oc-migrate plan` until the current migration is
completed, rolled back, or explicitly abandoned via `/oc-migrate abandon`. This prevents
half-finished migrations from being orphaned by a new one starting on top.

`/oc-migrate abandon` archives the checkpoint (`.bak`) and warns: "Abandoning mid-migration
may leave the system in a partial state. Run `/oc-migrate verify` to check current health."

### progress_table

```json
[
  { "id": "assessment",    "label": "Assessment + classification",    "status": "not_started" },
  { "id": "plan",          "label": "Migration plan generation",      "status": "not_started" },
  { "id": "plan-gate",     "label": "★ Plan approval",                "status": "not_started" },
  { "id": "step-1",        "label": "Step 1: [title]",                "status": "not_started" },
  { "id": "step-2",        "label": "Step 2: [title]",                "status": "not_started" },
  { "id": "step-3",        "label": "Step 3: [title]",                "status": "not_started" },
  { "id": "verification",  "label": "Final verification",             "status": "not_started" },
  { "id": "cleanup",       "label": "Cleanup + decommission",         "status": "not_started" }
]
```

### skill_state

The `skill_state` shape varies by migration type. Common fields are always present;
type-specific fields are included only when relevant.

```json
{
  "migration_type": "database",
  "risk_level": "HIGH",
  "source": "D1 (SQLite)",
  "target": "Supabase Postgres",
  "total_steps": 9,
  "current_step": 4,
  "steps_verified": [1, 2, 3],
  "step_failures": [
    { "step": 4, "attempt": 1, "error": "brief description", "rollback": "succeeded" }
  ],
  "rollback_available": true,
  "point_of_no_return_reached": false,

  "_type_specific_fields_below": "shape depends on migration_type",

  "backup_location": "d1-backup-20260423.sql",
  "dual_write_active": true,
  "primary_database": "d1"
}
```

Type-specific fields by migration type:

| migration_type | Additional fields |
|---|---|
| database | `backup_location`, `dual_write_active`, `primary_database`, `tables_migrated` |
| framework | `source_version`, `target_version`, `breaking_changes_fixed` |
| auth | `old_provider`, `new_provider`, `feature_flag_state`, `users_migrated` |
| platform | `old_platform`, `new_platform`, `dns_ttl`, `cutover_timestamp` |
| structural | `files_moved`, `imports_updated`, `configs_updated` |
| dependency | `packages_upgraded`, `breaking_changes_count` |
| ecosystem | `skills_updated`, `skills_remaining`, `protocol_version_from`, `protocol_version_to` |

### When to Write

| Event | What to Save |
|---|---|
| Assessment complete | Migration type, risk, source/target, gap analysis |
| Plan generated | Step count, step titles, rollback procedures |
| Plan approved | Gate passed, plan finalized |
| Each step executed | Step result, verification outcome, timing |
| Each step verified | Verification results, pass/fail per check |
| Rollback executed | What was rolled back, verification of clean state |
| Migration complete | Final verification results, total timing |
| Manual task assigned | What the user needs to do before next session |

### Cross-Skill Reads

| Reads from | Why |
|---|---|
| oc-reverse-spec | Current state documentation — architecture, schema, stack |
| oc-app-architect | Spec files — data model, API design, auth spec |
| oc-stack-forge | Stack decisions — platform capabilities, limitations |
| oc-code-auditor | Pre-existing findings — don't introduce new issues |
| oc-scale-ops | Performance baselines — detect regression after migration |
| oc-deploy-ops | Deployment config — environments, URLs, health checks |

| Read by | Why |
|---|---|
| oc-deploy-ops | Migration status → deploy confidence, cutover readiness |
| oc-code-auditor | Post-migration findings → quality gate |
| oc-app-architect | Spec updates needed → architecture doc refresh |
| oc-orchestrator | Migration progress → pipeline status, blockers |

---

## Diff View (`/oc-migrate diff`) and History (`/oc-migrate history`)

`/oc-migrate diff` compares current system state against target state, showing per-area progress
(Schema / Data / API / Auth / Config) with completion percentages, current dual-write posture,
and the next step.

`/oc-migrate history` reads `steps_verified` and `step_failures` from the checkpoint and lists each
completed step with outcome (✅/❌→✅ retry/❌ failed), duration, and session number. Both
views are read-only summaries — execution happens via `/oc-migrate execute`.

For the full output formats and example renders, see `references/migration-playbooks.md`.

---

## File Structure

```
project-dir/
├── .checkpoints/
│   └── oc-migration-ops.checkpoint.json
├── migrations/
│   ├── assessment.md              # Assessment report
│   ├── migration-plan.md          # Full plan with all steps
│   ├── impact-analysis.md         # Blast radius report
│   ├── steps/
│   │   ├── step-01-report.md      # Execution report per step
│   │   ├── step-02-report.md
│   │   └── ...
│   └── verification/
│       ├── pre-migration.md       # Baseline state snapshot
│       ├── step-03-verify.md      # Per-step verification
│       └── final-verify.md        # Final verification report
```

---

## PM-Tool MCP Integration (v1.2+)

Migrations are multi-week, multi-step, multi-engineer. They are
also genuinely scary — the kind of work where everyone in the org
wants to know the current state. v1.2 makes that state legible
in the PM tool the team already lives in. See
`oc-integrations-engineer` for the canonical PM-MCP patterns.

### Parent + step-child mirror

When `/oc-migrate plan` produces the migration plan:

1. Create a **parent ticket**:
   - title: `Migration: {from-engine} → {to-engine}`
   - type: `chore` or `epic` from `.opchain/pm.yaml` (use `epic`
     mapping if available — migrations are exactly the kind of
     work epics exist for).
   - body: full migration spec summary + estimated calendar
     duration + abort criteria + the rollback strategy.
   - labels: `migration`, `area:<from-engine>`, `area:<to-engine>`,
     `risk:<low/med/high>`.
2. For each plan step, create a **child ticket** parent-linked:
   - title: `Step {NN}: {step-name}`
   - body: step procedure + rollback + verification criteria.
   - state: `Todo` initially.
3. Record parent + child ids in the
   `oc-migration-ops.checkpoint.json` so the executor knows which
   ticket to update at each step.

### Per-step state machine

The plan is the source of truth; the PM tool reflects it.

```
plan-pending      Step is in the plan, not yet started
in_progress       /oc-migrate execute picked it up
verified          /oc-migrate verify passed
blocked           Verification failed; rollback in progress
rolled-back       Step was undone; back to plan-pending or aborted
done              Verified + signed off; safe to advance
```

State transitions on the PM ticket happen at the same instants the
checkpoint is updated. The PM comment thread carries the verifier
output; the checkpoint carries the canonical machine-readable record.

### Per-step comment shape

Every state transition emits a comment on the step ticket:

```
{state-from} → {state-to} at {timestamp}
Verifier: {pass-summary OR failure-detail}
Next: {next-action OR blocker}
Checkpoint: .checkpoints/oc-migration-ops.checkpoint.json
```

If the step touches a separately-tracked feature ticket (e.g. the
migration is happening to unblock PLAT-4471), comment back on
that ticket too: `Migration step N completed; PLAT-4471 unblocked.`

### Aborts + rollbacks

Aborts are big enough that they get their own visibility:

- Abort triggered → comment on the parent ticket:
  `MIGRATION ABORTED at step {N}. Rollback in progress.`
- Each rollback step gets its own comment on its step ticket.
- Final state on parent: `rolled-back` with the abort reason.

### Communication discipline

For long-running migrations (multi-week), oc-monitoring-ops and
oc-deploy-ops will write into the same parent ticket via their own
PM-MCP integrations — deploy tickets parent-link to the migration
parent, incident tickets back-reference if any incident is traced
to a migration step. The parent ticket becomes the project
homepage.

### Failure modes

- PM provider down at a step transition → checkpoint records the
  intended transition; user can `/oc-migrate sync-pm` to flush.
- Migration spans 50+ steps → use a phase-grouping pattern:
  parent → phase tickets (≤6) → step tickets per phase. Avoids a
  flat list of 50 children that nobody can navigate.
- Cross-team migration → mention the team's owner in each step
  ticket using the PM tool's `@mentions` (or labelled assignment
  if mentions aren't available).

---

## Principles

1. **Assess before planning, plan before executing.** Skip assessment and you'll
   discover blockers mid-migration. Skip planning and you'll have no rollback.
2. **One step at a time.** Every step gets individual verification. No batch execution.
3. **Rollback is not optional.** Every step documents how to undo it. If a step
   can't be undone, it's a point of no return that requires explicit user confirmation.
4. **Data integrity over speed.** Checksums, row counts, and spot-checks at every
   data migration step. Fast migrations that lose data are failures.
5. **Dual-write beats big-bang.** For database and auth migrations, run both systems
   simultaneously before cutting over. The expand-migrate-contract pattern exists
   because big-bang cutovers fail.
6. **Checkpoint obsessively.** This is the most session-spanning skill in the ecosystem.
   Every completed step, every verification result, every manual task — checkpoint it.
7. **Never combine HIGH-risk migrations.** Database change + auth swap + platform move
   at the same time is how outages happen. Sequential, not simultaneous.
8. **Web search the migration guide.** Frameworks publish migration guides for major
   versions. Read them before planning — the breaking changes are documented.
9. **Inventory before transforming.** For ecosystem migrations, count every affected
   file before changing any of them. The file you forgot to update is the one that
   breaks trigger routing next Tuesday.
