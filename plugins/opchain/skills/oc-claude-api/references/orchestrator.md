# Orchestrator Protocol

> **Disambiguation:** this file (`orchestrator.md`) is the **shared protocol doc**
> bundled into every skill's `references/` — it has no commands. It is **not** the
> `oc-orchestrator` *skill* (`/oc-ops`, the multi-project registry + router), which lives
> at `skills/oc-orchestrator/SKILL.md`. If you're looking for `/oc-ops status` / `/oc-ops
> next`, that's the skill. This file is the ecosystem spec every skill reads on
> startup.

Shared reference for all opchain dev skills. Read this on first invocation of any skill
in the ecosystem. It defines how skills discover each other, hand off, welcome
novice users, and coordinate through checkpoints.

Every skill in the ecosystem bundles this file. When a skill activates, read this FIRST,
before executing any skill-specific logic.

---

## 1. Welcome Protocol

When ANY skill in the ecosystem activates (user triggers it by keyword, command, or
task description), follow this sequence:

### Step 1: Announce the skill

```
I'm using the [skill-name] skill. Here's what I can help with:

[2-sentence description of what this skill does]

Available commands:
  [list key commands — max 6, most important first]

Type any command to begin, or just describe what you need.
```

### Step 2: Check for context

Before doing any work, check these in order:

1. **Checkpoint exists?** → Read it, offer to resume
2. **Upstream checkpoint exists?** → Read it for context (see Pipeline Map below)
3. **User seems new?** → Offer the guided walkthrough (see Novice Mode below)
4. **None of the above** → Proceed with the user's request

### Step 3: Identify the user's intent

If the user's request is vague ("build me an app", "help with my project"), ask ONE
clarifying question to determine which phase they're in:

- Have an idea but no specs? → Start with `/oc-discover`
- Have specs but no code? → Start with `/oc-build`
- About to commit code? → Start with `/oc-bugcheck`
- PR needs docs, or repo needs a readiness check? → Start with `/oc-docs pr`, then `/oc-repo verify`
- Have code but need quality check? → Start with `/oc-audit`
- Have code ready to ship? → Start with `/oc-git-sync` then `/oc-deploy`
- Have existing code, no docs? → Start with oc-reverse-spec

Don't ask if the intent is clear. "Build me a recipe app" → go straight to `/oc-discover`.

---

## 2. Pipeline Map

This is the canonical flow. Every skill knows where it sits and what comes before/after.

```
oc-reverse-spec ──► oc-app-architect ──► oc-git-ops ──► oc-deploy-ops ──► oc-monitoring-ops
                      │                │           ▲
                      │                │           │ oc-release-ops sits between
                      │                │           │ oc-git-ops and oc-deploy-ops
                      │                │           │ at release boundaries
                      │                ├── chains to oc-bug-check before /oc-commit + /sync
                      │                └── chains to oc-docs-forge ──► oc-repo-ops before every PR
                      ├── Phase 2: chains to oc-stack-forge
                      ├── Phase 3: design pipeline
                      │     ├── the build loop invokes oc-ux-engineer on UI sprints (when routed through it)
                      │     └── oc-ux-engineer ──► oc-dash-forge on data-heavy screens
                      ├── Phase 6: build loop (Generator → Evaluator)
                      │     └── the design phase invokes oc-ux-engineer on UI sprints (when routed through it)
                      └── Phase 7: launch handoff

foundation:
  oc-checkpoint-protocol ──► schema bundled in every skill
  oc-orchestrator ──► cross-project registry, status, routing (/oc-ops)

pre-commit gate:
  oc-bug-check ──► fast type/lint/test/secret/build/dep checks (<2 min, blocks commit)

pre-PR gate (v1.8 "quality-gate rail"):
  oc-docs-forge ──► PR documentation packet: `## Documentation` body section, PR comments,
                    README/catalog/product-doc upkeep, changelog + ADR notes
  oc-repo-ops   ──► repo hygiene / PR readiness: docs packet present, generated files +
                    catalogs in sync, clean git state (fails closed, blocks the PR)

quality gates (run before deploy):
  oc-code-auditor ──► finds code-level issues
  oc-security-auditor ──► threat model, hardening, attack surface

post-deploy:
  oc-monitoring-ops ──► uptime, errors, alerts, incidents

release boundary:
  oc-release-ops ──► plan / draft / bump / announce / ship a versioned release
                  (sits between oc-git-ops and oc-deploy-ops; only invoked at
                  release time, not on every PR)

cross-cutting:
  oc-api-dev ──► runs when designing/building the app's own first-party API
  oc-integrations-engineer ──► runs when external APIs needed
  oc-migration-ops ──► runs when a live system's engine changes (DB / framework / platform)
  oc-scale-ops ──► runs when scaling questions arise
  oc-dash-forge ──► invoked by oc-ux-engineer (or oc-app-architect) for dashboards + dense data UIs

instrumentation (v1.6 "the instrumented pipeline"):
  oc-cost-ops ──► attributes LLM spend per phase, budget gates, model-tier routing
  oc-telemetry-ops ──► opt-in local usage metering → anonymized aggregate for /dashboard
```

### Upstream/Downstream Map

| Skill | Reads checkpoints from | Chains to (invoke actively) |
|---|---|---|
| **oc-orchestrator** | every skill (read-only, cross-project) | — (dispatches to any skill by intent) |
| **oc-app-architect** | oc-reverse-spec | oc-git-ops (after build), oc-deploy-ops (at launch), oc-migration-ops (when existing systems need engine changes) |
| **oc-stack-forge** | oc-app-architect (discovery context) | — (returns control to oc-app-architect) |
| **oc-ux-engineer** | oc-app-architect (design baseline) | oc-dash-forge (on data-heavy screens), otherwise returns control |
| **oc-dash-forge** | oc-ux-engineer (tokens + design spec), oc-app-architect (design phase, dashboard surface) | — (returns control to caller with design spec + prototype) |
| **oc-code-auditor** | oc-reverse-spec, oc-app-architect | oc-security-auditor (posture review above code-level findings), oc-deploy-ops (pre-deploy gate) |
| **oc-security-auditor** | oc-code-auditor (findings), oc-reverse-spec, oc-app-architect, oc-deploy-ops | oc-deploy-ops (posture check before prod gate) |
| **oc-integrations-engineer** | oc-app-architect (integration spec) | oc-code-auditor (verify integration) |
| **oc-api-dev** | oc-app-architect (`02-architecture.md`, `03-data-model.md`), oc-stack-forge (typed pipeline), oc-reverse-spec (existing-endpoint inventory) | oc-code-auditor (audits scaffolded handlers), oc-security-auditor (CORS/rate-limit posture), oc-monitoring-ops (SLO + drift manifest), oc-deploy-ops (drift gate) |
| **oc-migration-ops** | oc-app-architect (spec), oc-reverse-spec (current state) | oc-deploy-ops (cutover), oc-monitoring-ops (verify post-migration) |
| **oc-git-ops** | oc-app-architect (sprint context), oc-bug-check (gate result), oc-docs-forge (PR docs packet), oc-repo-ops (PR readiness verdict) | oc-bug-check (pre-commit gate, chain), oc-docs-forge → oc-repo-ops (pre-PR gate, chain), oc-deploy-ops (post-push) |
| **oc-bug-check** | oc-git-ops (gate trigger) | oc-git-ops (returns pass / fail / bypass; failure blocks the commit) |
| **oc-docs-forge** | oc-git-ops (PR trigger: branch, commit log, PR draft, linked ticket), oc-app-architect (feature scope), oc-reverse-spec (existing docs), oc-api-dev (API doc drift), oc-release-ops (release surfaces), oc-code-auditor / oc-bug-check (quality notes for PR docs) | oc-repo-ops (hands docs packet to the readiness gate), oc-git-ops (returns PR body fragment + optional marker comment) |
| **oc-repo-ops** | oc-docs-forge (docs packet), oc-git-ops (branch, base, PR draft), oc-bug-check (gate verdict), oc-release-ops (release PR surfaces), oc-checkpoint-protocol (tracking policy) | oc-docs-forge (on missing/stale docs packet), oc-bug-check (on missing/stale code gate), oc-git-ops (PASS → PR can open; FAIL blocks PR creation) |
| **oc-deploy-ops** | oc-code-auditor (audit grade), oc-security-auditor (posture), oc-git-ops (branch status) | oc-monitoring-ops (post-ship observability) |
| **oc-monitoring-ops** | oc-deploy-ops (what shipped) | — (incident loops back to oc-app-architect / oc-code-auditor as needed) |
| **oc-release-ops** | every skill's `*.checkpoint.json` (what shipped per skill since last release), oc-app-architect (sprint outputs feed changelog draft), oc-git-ops (merged-PR list), oc-deploy-ops (last-shipped commit SHA) | oc-git-ops (release PR / tag), oc-deploy-ops (staging then prod ship) |
| **oc-scale-ops** | oc-stack-forge (platform limits) | — (advisory, no chain) |
| **oc-cost-ops** | oc-claude-api (price table), oc-prompt-ops (eval token counts), any skill (phase token counts) | oc-prompt-ops (cost-regression gate), oc-telemetry-ops (attributed cost to aggregate), oc-orchestrator (budget into `/oc-ops next`) |
| **oc-telemetry-ops** | oc-cost-ops (per-run cost), any skill (skill/phase usage) | the site `/dashboard` (anonymized aggregate), oc-orchestrator (most-used-skill signal) |
| **oc-reverse-spec** | — (entry point for existing code) | oc-app-architect (handoff specs) |

---

## 3. Active Chaining Protocol

**DO NOT just "suggest" the next skill.** Actively invoke it.

> **These edges are conventions, not machinery.** Nothing in the skill catalog
> can make one skill invoke another — measured across 87 sessions, cross-skill
> prose produced *zero* autonomous invocations, even when the calling SKILL.md
> was fully in context with an imperative instruction. Where an edge must hold
> (a commit gate, a pre-PR gate, a deploy gate), it has to be enforced by
> something outside the catalog: a `PreToolUse` hook from the opchain plugin, a
> CI check, or a script at the chokepoint. Treat the table below as the contract
> you follow when you *are* running, not as a mechanism that runs for you.

When a skill reaches a handoff point, follow this exact pattern:

### Pattern: Active Invocation

```
WRONG (passive suggestion):
  "You might want to run oc-git-ops to commit these changes."

RIGHT (active invocation):
  "Sprint 3 passed. Now committing changes using the oc-git-ops skill."
  [Read the oc-git-ops SKILL.md]
  [Execute /oc-git-sync using the sprint context from the checkpoint]
```

### Handoff Points (when to chain)

| Trigger | From | To | What to do |
|---|---|---|---|
| All build sprints pass | oc-app-architect | oc-git-ops | Invoke oc-git-ops, run /oc-git-sync with sprint context |
| /oc-git-commit or /oc-git-sync starts | oc-git-ops | oc-bug-check | Invoke oc-bug-check; pass → proceed with commit; fail → block, surface report, offer `/oc-bugcheck fix` or `/oc-bugcheck bypass` |
| PR creation starts (/oc-git-pr, or /oc-git-sync reaches the PR step) | oc-git-ops | oc-docs-forge | Invoke `/oc-docs pr` to generate the PR documentation packet (`## Documentation` body fragment + optional marker comment) |
| Docs packet written or verified | oc-docs-forge | oc-repo-ops | Invoke `/oc-repo verify`; PASS → return control to oc-git-ops to open the PR; FAIL → block PR creation, surface blocking findings, offer `/oc-repo clean` |
| git-sync completes | oc-git-ops | oc-deploy-ops | Invoke oc-deploy-ops, run /oc-deploy audit then /oc-deploy staging |
| Launch phase starts | oc-app-architect | oc-code-auditor → oc-deploy-ops | Run /oc-audit pre-deploy first, then /oc-deploy staging |
| Existing codebase analyzed | oc-reverse-spec | oc-app-architect | Invoke oc-app-architect, load oc-reverse-spec's output as Phase 2 baseline |
| Integration needed | oc-app-architect (Phase 2) | oc-integrations-engineer | Invoke oc-integrations-engineer for the specific service |
| First-party API surface in spec | oc-app-architect (Phase 2) | oc-api-dev | Invoke oc-api-dev `/oc-api design` to elaborate `02-architecture.md` API Design into an OpenAPI/GraphQL contract |
| Stack decision needed | oc-app-architect (Phase 2) | oc-stack-forge | Invoke from Phase 2 (a step you run, not an automatic trigger) |
| UI sprint detected | oc-app-architect (Phase 6) | oc-ux-engineer | Invoke the Design Evaluator as a build-loop step (not an automatic trigger) |
| Data-heavy screen flagged | oc-ux-engineer (Phase 1 intake) or oc-app-architect (Phase 3 design) | oc-dash-forge | Package tokens + design spec into oc-dash-forge context, invoke /oc-data-forge; hand the resulting spec + prototype back to the caller |
| Release boundary reached (user says "cut a release", "ship v1.3", "bump versions") | any skill | oc-release-ops | Invoke oc-release-ops `/oc-release plan` to propose the next semver and theme, then walk through `draft → bump → announce → ship` |
| `/oc-release ship` advances to PR | oc-release-ops | oc-docs-forge → oc-git-ops | Invoke oc-docs-forge `/oc-docs pr` for the release docs packet, then oc-git-ops `/oc-git-sync v<semver>` with the bump commit (the pre-PR gate runs as usual); oc-release-ops resumes after merge |
| `/oc-release ship` advances to deploy | oc-release-ops | oc-deploy-ops | Invoke oc-deploy-ops `/oc-deploy staging` then `/oc-deploy` on user confirmation; oc-release-ops closes the release ticket on prod ship |

### How to Invoke Another Skill

1. State what you're doing: "Now using [skill-name] to [action]."
2. Read that skill's SKILL.md (it's in the available skills list)
3. Read that skill's orchestrator.md (same file you're reading now)
4. Check for that skill's checkpoint (resume if exists)
5. Execute the relevant command with context from the current skill's checkpoint

### Context Passing

When chaining, pass context through checkpoints — don't rely on conversation history:

1. Write your current skill's checkpoint with all relevant state
2. The next skill reads it from `.checkpoints/[skill-name].checkpoint.json`
3. Key context to pass: project name, project directory, current phase, key decisions,
   files generated, and the specific reason for the handoff

---

## 4. Novice Mode

If the user seems unfamiliar with the ecosystem (no checkpoints exist, vague request,
no command used), activate novice mode:

### Guided Walkthrough

```
Looks like this is a new project. Here's how the dev skills pipeline works:

1. PLAN — I'll interview you about your idea, pick the right tech stack,
   and design the UX before writing any code.

2. BUILD — I'll build it sprint-by-sprint, with automated quality checks
   after each sprint. Tests are written alongside code.

3. SHIP — I'll commit to git, run a security/quality audit, deploy to
   staging, then production.

Want to start from the beginning? Just describe your app idea and I'll
take it from there.
```

### One-Prompt Start

A novice user should be able to type a single sentence and get the full pipeline:

```
User: "I want to build a workout tracker app"

Claude: [Reads orchestrator.md → identifies this as a new project]
        [Invokes oc-app-architect → starts /oc-discover]
        [Guides through discovery, spec, design, sprints, build, ship]
```

No commands needed. No knowledge of the ecosystem required. Claude routes to the
right skill and phase based on the request.

### Smart Routing Table

| User says (examples) | Route to | Phase |
|---|---|---|
| "Build me an app" / "I have an idea for..." | oc-app-architect | /oc-discover |
| "Here's my codebase, document it" | oc-reverse-spec | /oc-rev-full |
| "What stack should I use for..." | oc-stack-forge | /oc-stack-decide |
| "Check this before I commit" / "Pre-commit" / "Lint and test" / "Quick audit" | oc-bug-check | /oc-bugcheck |
| "Generate the PR docs" / "Update the README" / "Docs drifted" / "Docs upkeep" | oc-docs-forge | /oc-docs pr |
| "Is this PR ready?" / "Repo hygiene" / "Clean this repo" / "Catalog drift" | oc-repo-ops | /oc-repo audit |
| "Review this code" / "Is this code good?" | oc-code-auditor | /oc-audit full |
| "Fix the UX" / "The design is inconsistent" | oc-ux-engineer | /oc-uxe eval |
| "Connect to Salesforce" / "Set up webhooks" | oc-integrations-engineer | /oc-integrate plan |
| "Design our API" / "Write the OpenAPI" / "Versioning strategy" / "Generate an SDK" | oc-api-dev | /oc-api design |
| "Deploy this" / "Ship it" | oc-deploy-ops | /oc-deploy staging |
| "Commit my changes" / "Push to git" | oc-git-ops | /oc-git-sync |
| "Can this handle more users?" | oc-scale-ops | /oc-scale audit |
| "Cut a release" / "Ship v1.3" / "Bump versions" / "Draft the changelog" / "Tag the release" | oc-release-ops | /oc-release plan |
| "Continue where we left off" | [check all checkpoints] | [resume most recent] |

---

## 5. Checkpoint Discovery

On first invocation of any skill, scan for ALL ecosystem checkpoints:

```bash
ls {project-dir}/.checkpoints/*.checkpoint.json 2>/dev/null
```

If multiple checkpoints exist, present a status summary:

```
Found existing project state:
  ✅ oc-app-architect: spec approved, design approved, sprint 2 of 4 in progress
  ✅ oc-code-auditor: last audit 2 hours ago, grade B+
  ⏳ oc-deploy-ops: not started

Resuming oc-app-architect build loop (Sprint 2).
```

This gives the user (and Claude) a complete picture of where the project stands
across all skills, regardless of which skill was invoked.

---

## 6. Error Recovery

When a skill encounters a problem it can't resolve:

1. **Don't silently fail.** State what went wrong and why.
2. **Check if another skill can help.** Error in build → suggest /oc-audit to diagnose.
   Error in deploy → suggest /oc-rollback. Error in integration → check /oc-integrate health.
3. **Write checkpoint before giving up.** Even partial progress should be saved.
4. **Offer the user a clear next step.** Not "something went wrong" — instead:
   "The evaluator found 3 failing tests. I can fix them now, or you can review
   the eval report and decide which to prioritize."

---

## 7. Skill Descriptions (Trigger Optimization)

These are the optimized descriptions that maximize Claude's trigger accuracy.
Each skill's YAML frontmatter `description` field should match exactly:

```yaml
# oc-app-architect
description: >
  Unified app development: idea → spec → design → build with Generator/Evaluator
  QA loop → launch. Use for /oc-app, /oc-discover, /oc-spec, /oc-design, /oc-build, /oc-launch,
  "build me an app", "I have an app idea", or any software project. Chains to (when you invoke it): oc-stack-forge and oc-ux-engineer.

# oc-stack-forge
description: >
  Stack advisor for any platform: Cloudflare, Vercel, AWS, Supabase, Rails, Django.
  Use for /oc-stack, /oc-stack-decide, /oc-feature, "what stack", "tech stack", "what should I
  build with", or framework comparisons. Invoked by oc-app-architect.

# oc-reverse-spec
description: >
  Reverse-engineer existing code into spec docs. Use for /oc-rev-spec, /oc-reverse-spec,
  "document this codebase", "generate specs from code", "backfill specs", or when
  pointing at existing code that needs documentation.

# oc-bug-check
description: >
  Pre-commit QA gate that runs on every commit. Fast, opinionated checks: type
  safety, lint, tests, anti-pattern scan, secret detection, build verification,
  and dependency vulnerability scan. Blocks commits on failures, warns on cautions,
  passes silently on clean code. Invoked by oc-git-ops before every /oc-git-commit
  and /oc-git-sync. Use for /oc-bugcheck, "check this before I commit", "run the checks",
  "is this safe to commit", "pre-commit", "quick audit", "lint and test", "any bugs
  in this?", "sanity check".

# oc-docs-forge
description: >
  Documentation creation, standardization, and upkeep for every PR. Invoked
  by oc-git-ops before PR creation and by release flows before release PRs. Use
  for /oc-docs, /oc-docs pr, "generate the PR docs", "update README", "standardize
  docs", "refresh product documentation", "write PR body docs", "post a PR docs
  comment", "docs upkeep", changelog/ADR/readme/catalog drift, or any request
  where implementation changes need reader-facing documentation.

# oc-repo-ops
description: >
  Repository hygiene and PR readiness gate. Invoked by oc-git-ops before
  every PR and after oc-docs-forge generates the PR documentation packet. Use for
  /oc-repo, /oc-repo audit, /oc-repo verify, "repo hygiene", "clean this repo",
  "is this PR ready", "check generated files", "catalog drift", "plugin/cache
  drift", ".gitignore policy", orphaned docs/files, stale generated artifacts,
  source-vs-doc mismatch, or any repository cleanliness question.

# oc-code-auditor
description: >
  Code quality auditor with Auditor/Fixer/Verifier loop. Use for /oc-audit, "audit this",
  "find bugs", "code review", "pre-deploy check", "what's wrong with this code", or any
  code-level quality question. For fast pre-commit checks, escalate to oc-bug-check. For
  architecture- or infra-level security, escalate to oc-security-auditor.

# oc-security-auditor
description: >
  Practice-level security posture assessment: threat modeling (STRIDE), OWASP Top 10
  compliance mapping, runtime/infra hardening (CSP, TLS, DNS, WAF), and attack-surface
  mapping. Runs ABOVE oc-code-auditor. Use for /oc-security, /oc-secaudit, /oc-threat-model, /oc-owasp,
  /oc-hardening, /oc-attack-surface, "is this secure enough", "SOC2 readiness", "pen test prep",
  "security architecture review".

# oc-ux-engineer
description: >
  UI/UX design harness with Design Planner/Generator/Evaluator loop. Use for /oc-uxe,
  "review the UX", "design iteration", "component library", "accessibility audit",
  "is the UI consistent", or any design quality question.

# oc-dash-forge
description: >
  Dashboard and dense-information UI designer. Produces design specs AND working React
  prototypes with mock data for three archetypes: executive, operations, analyst. Use
  for /oc-data-forge, /oc-dash-forge, "design a dashboard", "BI design", "KPI dashboard",
  "analytics UI", "monitoring dashboard". Invoked by oc-ux-engineer / oc-app-architect
  when the UI is data-heavy.

# oc-integrations-engineer
description: >
  Third-party API integrations with Planner/Builder/Tester loop. Use for /oc-integrate,
  "connect to Salesforce", "webhook", "OAuth", "API integration", "connect to Slack",
  or any external service connection. For designing or building your *own* first-party
  API (OpenAPI/GraphQL authoring, versioning, SDK generation), use oc-api-dev instead.

# oc-api-dev
description: >
  First-party API design and build harness with Designer/Builder/Conformance loop.
  Owns OpenAPI/GraphQL authoring, schema↔code parity, versioning + sunset strategy,
  pagination/error/idempotency conventions, typed handler scaffolding, and SDK
  generation for the API your own clients consume. Use for /oc-api, /oc-api design,
  /oc-api spec, /oc-api scaffold, /oc-api version, /oc-api lint, /oc-api sdk, "design our API",
  "OpenAPI", "GraphQL schema", "versioning strategy", "deprecate endpoint",
  "generate SDK", "schema drift". For consuming someone else's API (Stripe, Slack,
  OAuth) use oc-integrations-engineer instead.

# oc-migration-ops
description: >
  Migration and refactor operator for live systems. Database migrations (D1 → Postgres,
  schema overhauls), framework upgrades (Hono v3→v4, React 18→19), auth provider swaps,
  monorepo restructures, platform moves. Produces incremental migration plans with
  rollback points and verification gates. Use for /oc-migrate, /oc-upgrade, /oc-refactor, /oc-swap,
  "migrate from X to Y", "upgrade to", "restructure the monorepo", "deprecation". Trigger
  when transforming an existing system from one state to another.

# oc-git-ops
description: >
  Git workflow: branch, commit, PR, sync. Chains to (when you invoke it): oc-bug-check before every
  commit and the oc-docs-forge → oc-repo-ops pre-PR gate before every PR. Use for
  /oc-git, /oc-commit, /oc-pr, /oc-push, "commit this", "push to git", "create a PR",
  "sync to repo", or any git operation.

# oc-deploy-ops
description: >
  Deployment pipeline: audit gate → staging → production. Use for
  /oc-deploy, "deploy this", "ship it", "push to production", "staging", "rollback",
  or any deployment task. Hands off post-deploy observability to oc-monitoring-ops.

# oc-monitoring-ops
description: >
  Post-deployment observability: uptime monitoring, error tracking, structured logging,
  alerting pipelines, and incident response runbooks. Sits after oc-deploy-ops — oc-deploy-ops
  ships it, oc-monitoring-ops watches it. Use for /oc-monitor, "set up monitoring", "error
  tracking", "alerting", "incident response", "observability", "what's happening in prod",
  "set up Sentry", "SLO", "runbook".

# oc-scale-ops
description: >
  Scaling readiness: load test, perf budgets, caching, capacity planning. Use for
  /oc-scale, "load test", "can this handle more users", "performance", "caching strategy",
  or any scaling question.

# oc-orchestrator
description: >
  Pipeline coordinator for the opchain dev ecosystem. Multi-project registry, cross-skill
  status, smart routing, and "what should I do next?" recommendations. Use for /oc-ops,
  "what's the status", "where did I leave off", "which project", "what should I work on",
  "show me everything". Also trigger when the user seems lost, references multiple
  projects, or asks a vague dev question that needs routing.

# oc-release-ops
description: >
  Release-cadence operator. Plan, draft, bump, announce, and ship versioned
  releases of opchain (or any opchain-managed project). Reads sprint
  checkpoints, proposes the next semver, drafts the /changelog entry from
  what actually shipped, bumps every skill version atomically, and hands
  off to oc-git-ops + oc-deploy-ops. Use for /oc-release, /oc-release plan, /oc-release
  draft, /oc-release bump, /oc-release announce, /oc-release ship, "cut a release",
  "ship v1.3", "tag the release", "draft the changelog", "what's in this
  release", "version bump".

# oc-cost-ops
description: >
  Cost operations harness — attribute LLM spend to the skill phase that incurred
  it, set per-phase and per-suite budgets that gate in the checkpoint, and
  recommend model-tier routing (Haiku for cheap repetitive phases, Opus for
  spec/audit/migration). Use for /oc-cost, "what did this cost", "cost
  attribution", "token cost", "budget gate", "model tier routing", "cost
  regression", "cheaper model", "spend per feature".

# oc-telemetry-ops
description: >
  Telemetry operations harness — opt-in, local-first usage metering to a local
  .checkpoints/usage.sqlite store, with anonymized aggregates for the public
  /dashboard. Default OFF; no prompt content or PII ever leaves the machine.
  Use for /oc-telemetry, "usage metering", "telemetry", "opt-in analytics",
  "which skills do people use", "usage stats", "dashboard data". Trigger
  liberally on usage/telemetry work.
```

---

## 8. Ecosystem Awareness

Every skill should know these facts:

- **Foundation:** `oc-checkpoint-protocol` (shared JSON schema bundled in every skill) and
  `oc-orchestrator` (multi-project registry + router via `/oc-ops`).
- **Tri-agent skills:** oc-app-architect (Generator/Evaluator), oc-ux-engineer (Design
  Planner/Generator/Evaluator), oc-code-auditor (Auditor/Fixer/Verifier),
  oc-integrations-engineer (Planner/Builder/Tester), oc-api-dev (Designer/Builder/Conformance).
- **Declared chains (each requires an explicit invocation):** oc-stack-forge during oc-app-architect Phase 2; oc-ux-engineer during
  oc-app-architect UI sprints; oc-dash-forge from oc-ux-engineer or oc-app-architect on data-heavy
  screens; oc-bug-check from oc-git-ops before every `/oc-git-commit` and `/oc-git-sync`;
  oc-docs-forge from oc-git-ops before PR creation (and from release flows before release
  PRs); oc-repo-ops from oc-git-ops before every PR, after oc-docs-forge.
- **Pipeline flow:** oc-reverse-spec → oc-app-architect → oc-git-ops → oc-deploy-ops → oc-monitoring-ops.
- **Release boundary:** oc-release-ops sits between oc-git-ops and oc-deploy-ops; runs only on
  versioned-release events (`/oc-release plan` / `draft` / `bump` / `announce` / `ship`),
  not on every PR. v1.3 added it as the 18th skill; opchain itself dogfoods it.
- **Pre-commit gate:** oc-bug-check (fast metal-detector — type / lint / tests / secrets /
  build / dep scan in <2 min; blocks the commit on failure).
- **Pre-PR gate (v1.8 "the quality-gate rail"):** oc-docs-forge (PR documentation packet —
  `## Documentation` body section, README/catalog/product-doc upkeep) → oc-repo-ops
  (repo hygiene / PR readiness — docs packet, generated files, catalog parity; fails
  closed, blocks the PR).
- **Quality gates (pre-deploy):** oc-code-auditor → oc-security-auditor (runs above oc-code-auditor
  for threat model / hardening).
- **Cross-cutting skills:** oc-api-dev (first-party APIs — OpenAPI/GraphQL, versioning,
  SDKs), oc-integrations-engineer (external APIs), oc-migration-ops (live system changes —
  DB, framework, platform), oc-scale-ops (advisory), oc-dash-forge (dense data UIs).
- **Instrumentation (v1.6 "the instrumented pipeline"):** oc-cost-ops (LLM spend
  attribution per phase, budget gates, model-tier routing) and oc-telemetry-ops
  (opt-in local usage metering → anonymized `/dashboard` aggregate). They add the
  wire-1.1 checkpoint fields `cost` / `eval_scores` / `telemetry_handle`. v1.6
  took the catalog to 24 skills; v1.7 "Seams & Signals" adds oc-signal-forge /
  oc-modularize-ops / oc-fleet-ops → 27; v1.8 "the quality-gate rail" adds
  oc-docs-forge / oc-repo-ops → 29.
- **Checkpoint protocol:** every skill writes to `.checkpoints/[skill].checkpoint.json`.
- **Tri-dev is retired.** Its build harness lives inside oc-app-architect Phase 6.
  If a user asks for tri-dev, route to oc-app-architect /oc-build.
