---
name: oc-orchestrator
displayName: OC · Orchestrator
version: 1.8.1
shortDesc: Pipeline coordinator — registry, status, routing. v1.2 reads `pm_refs` across skills; routes by ticket id.
phases: [foundation]
triAgent: false
tryable: true
commands:
  - /oc-ops
  - /oc-ops status
  - /oc-ops next
  - /oc-ops route
  - /oc-ops projects
  - /oc-ops register
  - /oc-ops scan
  - /oc-ops switch
  - /oc-ops pipeline
  - /oc-ops blockers
  - /oc-ops recent
description: >
  Pipeline coordinator for the opchain dev ecosystem. Multi-project registry, cross-skill
  status, smart routing, and "what should I do next?" recommendations. Use for /oc-ops,
  "what's the status", "where did I leave off", "which project", "what should I work on",
  "show me everything", or any question about pipeline state across projects. Also trigger
  when the user seems lost, references multiple projects, or asks a vague dev question
  that needs routing. Trigger liberally.
---

# Orchestrator

**On first invocation, read `references/orchestrator.md` and follow its welcome protocol.**

Pipeline coordinator for the opchain dev ecosystem. This skill does NOT build, audit,
deploy, or design — it reads every other skill's checkpoints, maintains a project
registry, and answers three questions:

1. **Where am I?** — Cross-skill status across all registered projects.
2. **What's next?** — The single highest-priority action based on pipeline position.
3. **Route me.** — Smart dispatch to the right skill based on intent.

This is an **additive layer**. Every existing skill retains its own welcome protocol
and works independently. The oc-orchestrator provides a better front door and a unified
view across projects — it doesn't replace any skill's internal logic.

---

## /oc-ops — Command Reference

```
ORCHESTRATOR COMMANDS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  STATUS
  /oc-ops                 Show all projects + active skill state
  /oc-ops status          Same as /oc-ops — full status dashboard
  /oc-ops status [project] Status for one project (all skills)

  ROUTING
  /oc-ops next            Recommend the single highest-priority action
  /oc-ops next [project]  Next action for a specific project
  /oc-ops route [intent]  Route a vague request to the right skill + phase

  PROJECT REGISTRY
  /oc-ops projects        List all registered projects with health
  /oc-ops register        Register a new project (path + name)
  /oc-ops unregister      Remove a project from the registry
  /oc-ops switch [project] Set the active project for this session
  /oc-ops scan            Auto-discover projects by scanning workspace

  PIPELINE
  /oc-ops pipeline        Show the canonical pipeline DAG
  /oc-ops pipeline [project] Show where a project sits in the pipeline
  /oc-ops blockers        Show all blockers across all projects
  /oc-ops recent          Last-known state per skill (sorted by recency)

  META
  /oc-ops health          Self-check: are all skill files accessible?
  /oc-ops skills          List all installed opchain skills with versions
  /checkpoint          Show oc-orchestrator state (registry + session, from the tracked checkpoint)

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  Type any command, or just describe what you need.
```

> **What's wired vs. what's a pattern.** The oc-orchestrator is a *reasoning* skill —
> most "commands" are behaviors Claude performs by reading checkpoints and routing,
> not shell entry points. The pieces backed by **real tooling** are the checkpoint
> reads/writes: `node scripts/checkpoint.mjs status | next | doctor | validate |
> update | done | init`. `/oc-ops status`, `/oc-ops next`, and `/oc-ops blockers` lean on
> those directly. `/oc-ops register`, `/oc-ops switch`, `/oc-ops scan`, `/oc-ops route`,
> `/oc-ops health`, `/oc-ops skills`, and the v1.2 PM verbs (`/oc-ops resume`, `/oc-ops ticket`,
> `/oc-ops pm-status`) are **agent behaviors** — described here as patterns, executed by
> Claude, with state persisted to the tracked checkpoint. None are dead ends, but
> don't expect a binary named `ops`.

---

## Session-Start Protocol

Run this on every new session, before doing any other oc-orchestrator work:

```bash
npm run checkpoint:status
```

That command prints a markdown summary of every `.checkpoints/<skill>.checkpoint.json`
in the project — phase, step, status, `next_actions`, and blockers. It
**is** the registry scanner for a single project; the architecture
diagram below describes how the same protocol scales to multi-project.

If the project doesn't have `npm run checkpoint:status` wired up
(common on cold projects), fall back to:

```bash
ls .checkpoints/*.checkpoint.json 2>/dev/null && cat .checkpoints/*.checkpoint.json
```

Treat that direct read as the authoritative status source. The missing convenience
command is not evidence that checkpoint state is unreliable, and it must not be
reported as product progress or as a blocker. If the files exist, validate their
claims against the named specs, git state, tests, and release artifacts as normal.

If `.checkpoints/` doesn't exist at all, this is a cold start. The
`oc-checkpoint-protocol` is not directly invocable. If this is the opchain.dev repo
and its CLI exists, run its scaffolder:

```bash
node scripts/checkpoint.mjs init
```

In any other repo, create `.checkpoints/` and the receiving skill's checkpoint
directly with the file tools already available; do not assume `scripts/checkpoint.mjs`
was copied into the project. Follow the oc-checkpoint-protocol
SKILL.md § "Scaffold Phase" to add the `package.json` scripts, the `.gitattributes`
merge driver, and the optional post-merge auto-stamp workflow only when the user asks
to adopt the CLI. Routing and checkpoint writes do not wait for that tooling work.

**Do not** start routing or dispatching work until you've read the
checkpoint state. The whole point of the protocol is that the next
session resumes from the prior session's `next_actions[0]`, not from
chat history.

---

## Architecture

```
┌──────────────────────────────────────────────────────┐
│                    ORCHESTRATOR                       │
│                                                      │
│  ┌──────────────┐  ┌──────────────┐  ┌────────────┐  │
│  │   Project    │  │  Checkpoint  │  │   Router    │  │
│  │   Registry   │  │   Scanner    │  │   Engine    │  │
│  │              │  │              │  │             │  │
│  │  Multi-proj  │  │  Reads ALL   │  │  Intent →   │  │
│  │  tracking    │  │  skill CPs   │  │  skill +    │  │
│  │              │  │  per project │  │  phase      │  │
│  └──────────────┘  └──────────────┘  └────────────┘  │
│           │                │                │         │
│           ▼                ▼                ▼         │
│  ┌─────────────────────────────────────────────────┐  │
│  │              Priority Engine                    │  │
│  │  Blockers > Failed > In-progress > Not-started  │  │
│  │  Pipeline order breaks ties                     │  │
│  └─────────────────────────────────────────────────┘  │
│                          │                            │
│                          ▼                            │
│                   /oc-ops next output                    │
│                   /oc-ops status output                  │
│                   /oc-ops route → active invocation      │
└──────────────────────────────────────────────────────┘
         │ reads                        │ dispatches to
         ▼                              ▼
  .checkpoints/*.json            Other opchain skills
  (all projects)                 (oc-app-architect, oc-code-auditor, etc.)
```

### Design Constraints

1. **Read-only coordinator.** Orchestrator reads other skills' checkpoints but NEVER
   writes to them. It persists its own state via memory (registry) and session files
   (routing history, scan cache).
2. **Additive, not gating.** Skills work without the oc-orchestrator installed. The
   oc-orchestrator makes the ecosystem smarter, not dependent.
3. **No build artifacts.** Orchestrator produces status reports and routing decisions,
   never code, specs, designs, or documents.
4. **Dispatch, don't duplicate.** When routing, actively invoke the target skill
   (read its SKILL.md, execute its command). Don't re-implement skill logic.

---

## Project Registry

The registry tracks all projects the user is actively working on.

### Persistence Model

**Critical constraint:** the worker filesystem is **ephemeral** — it resets between
conversations and, on Claude Code for the web, between sessions on a fresh clone.
Anything that must survive has to be **committed to git**. That is exactly why the
checkpoint protocol tracks `.checkpoints/` in git, and the oc-orchestrator persists the
**same way every other skill does**: a single tracked file at

```
.checkpoints/oc-orchestrator.checkpoint.json
```

The project **registry** (names, paths, priority, monorepo apps) lives in that
file's `skill_state.registry`. Routing history and the active project live in
`skill_state` too. There is **no** `memory_user_edits` and **no** `~/.opchain/`
session file — those were specified in an earlier draft and never worked on an
ephemeral runner (memory edits aren't available in this runtime, and a home-dir
file doesn't survive the clone). If you see references to them elsewhere, they're
stale; the tracked checkpoint is the single source of truth.

On session start the oc-orchestrator reads its own checkpoint for the registry, then
runs `node scripts/checkpoint.mjs status` to scan every other skill's checkpoint in
the active project for live state. (Re-scanning is cheap — there's no separate cache
layer to keep warm or invalidate.)

### Registry Schema (stored in `skill_state.registry` of the tracked checkpoint)

```jsonc
{
  "projects": [
    {
      "id": "aidops-core",
      "name": "aidops-core",
      "path": "/home/claude/aidops",
      "type": "monorepo",
      "priority": "primary",
      "apps": ["gtrackr", "dose", "pintrack", "get-ripped", "career-ops"],
      "notes": "Main platform monorepo — Workers + D1 + KV"
    },
    {
      "id": "penthreshold",
      "name": "PenThreshold",
      "path": "/home/claude/penthreshold",
      "type": "app",
      "priority": "secondary",
      "apps": null,
      "notes": "SharePoint training compliance platform"
    }
  ],
  "default_project": "aidops-core"
}
```

Schema design rationale:
- **No `last_activity` or `tags`** — derived at runtime from checkpoint timestamps
  and manifest scanning. Caching derivable data creates staleness.
- **`priority` instead of boolean `active`** — values: `primary`, `secondary`,
  `archived`. Primary projects surface first in `/oc-ops next` cross-project recommendations.
- **`apps` array** — for monorepos, lists sub-applications. Single-app projects
  set this to `null`. Enables per-app checkpoint scanning and status grouping.
- **`active_project` is session state, not registry** — it starts as `default_project`
  each session and can be switched with `/oc-ops switch`. Only `default_project` persists.

### Monorepo Sub-Project Handling

For monorepos like aidops-core with multiple apps, the scanner checks for
app-scoped checkpoints using **subdirectories** within `.checkpoints/`:

```
aidops-core/
├── .checkpoints/
│   ├── oc-reverse-spec.checkpoint.json       ← project-wide (applies to whole repo)
│   ├── oc-git-ops.checkpoint.json            ← project-wide
│   ├── gtrackr/
│   │   ├── oc-app-architect.checkpoint.json  ← app-specific
│   │   └── oc-code-auditor.checkpoint.json
│   └── dose/
│       └── oc-app-architect.checkpoint.json
├── apps/
│   ├── gtrackr/
│   ├── dose/
│   └── pintrack/
```

This follows the existing checkpoint protocol convention (each skill writes
`{skill}.checkpoint.json`) — the oc-orchestrator just adds an app-level directory
grouping. Skills writing app-specific checkpoints set `project_dir` to
`{monorepo}/.checkpoints/{app}/` instead of `{monorepo}/.checkpoints/`.

**Tooling-support note (important):** the canonical CLI (`scripts/checkpoint.mjs`)
scans only the **top level** of `.checkpoints/` — it does not recurse into app
subdirectories, and `checkpoint:validate` won't see subdir files either. So the
subdirectory layout above is **not** the supported default today. Until recursion
lands in the CLI, use the **flat** layout and group by the `project` field inside
each checkpoint: write app-specific checkpoints as
`.checkpoints/<app>-<skill>.checkpoint.json` (e.g. `gtrackr-app-architect.checkpoint.json`)
with `project: "gtrackr"`, and let the oc-orchestrator group by that field. This keeps
every checkpoint visible to `status`/`validate`/`doctor` with no tooling change.

Status output groups by app within a monorepo:

```
▶ aidops-core                             [active]
  Project-wide:
    ✅ oc-reverse-spec    complete     Specs for 4 apps
    ⏳ oc-git-ops         not started

  gtrackr:
    🔄 oc-app-architect   in_progress  Sprint 2/4
    ✅ oc-code-auditor    complete     Grade B+
    🚫 BLOCKER: F-003 rate limiting

  dose:
    🔄 oc-app-architect   in_progress  Phase 3 design
```

### Registration Flow (`/oc-ops register`)

1. Ask for project path (or detect from conversation context)
2. Scan `{path}/.checkpoints/` for existing skill checkpoints
3. Read `package.json`, `wrangler.toml`, or other manifests for metadata
4. Detect monorepo structure (workspace config, `apps/` directory)
5. If monorepo: inventory sub-applications, confirm app list with user
6. Determine priority (`primary` if first project, `secondary` otherwise)
7. Write to `memory_user_edits`
8. Display initial status scan

### Auto-Discovery

When any opchain skill is invoked and the project directory is NOT in the registry,
the oc-orchestrator should auto-register it on next `/oc-ops` invocation. Detection:
checkpoint files exist at a path not in the registry → suggest registration.

### Cold Start (First-Ever Invocation)

When the oc-orchestrator is invoked with no memory edit and no checkpoint files found
anywhere:

```
No projects registered yet. Let's set up your workspace.

I can scan for existing opchain checkpoints, or you can register a project manually.

  /oc-ops register [path]  — Register a specific project
  /oc-ops scan             — Scan common paths for checkpoint files
```

`/oc-ops scan` searches **roots derived at runtime** — never a hardcoded path. In
order: the current working directory and its immediate children, then any parent
that contains a `.git`, then the registry's existing project paths. It looks for
`.checkpoints/` directories or `package.json` / `wrangler.*` manifests and presents
discovered projects for confirmation. (The old `/home/claude/*` literal was wrong on
every runtime except one; don't reintroduce it.)

---

## Checkpoint Scanner

The core read engine. For a given project, scans all skill checkpoints and produces
a unified status view.

### Scan Process

```bash
# Preferred: let the canonical CLI read + summarize the active project.
( cd {project.path} && node scripts/checkpoint.mjs status )

# Raw fallback (flat layout — the supported default):
ls {project.path}/.checkpoints/*.checkpoint.json 2>/dev/null
# If you adopt the (unsupported-by-CLI) subdir layout, the glob is
# */*.checkpoint.json — NOT */checkpoint.json, which never matches the
# <app>/<skill>.checkpoint.json naming:
ls {project.path}/.checkpoints/*/*.checkpoint.json 2>/dev/null
```

For each checkpoint found:
1. Read header: skill, updated_at, status
2. Read progress_table: phase completion
3. Read blockers: any unresolved?
4. Read next_actions: what's queued?
5. Do NOT read skill_state (private to owning skill)

### Scan Caching

Scanning all checkpoints on every command is cheap for 2-3 projects (<50ms) but
could slow down with many projects or slow filesystems. Strategy:

- On first `/oc-ops` invocation per session: full scan, write to session cache
- On subsequent invocations: read from session cache unless >5 minutes stale
- `/oc-ops status --fresh` forces a re-scan
- Any routing dispatch invalidates the cache (the dispatched skill may write a checkpoint)

### Unified Status Output (`/oc-ops status`)

```
OPCHAIN STATUS — All Projects
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

▶ aidops-core                              [active]
  ✅ oc-reverse-spec      complete     Specs generated for 4 apps
  🔄 oc-app-architect     in_progress  Sprint 2/4 — CRUD API (gtrackr)
  ✅ oc-code-auditor      complete     Grade B+, 2 HIGH findings open
  ⏳ oc-deploy-ops        not started
  ⏳ oc-git-ops           not started
  🚫 BLOCKER: rate limiting gap (oc-code-auditor F-003)
  → Next: Fix F-003, then resume oc-app-architect sprint 2

▶ GET RIPPED
  🔄 oc-app-architect     in_progress  Phase 3 — design pipeline
  ⏳ oc-code-auditor      not started
  → Next: Complete design approval gate

▶ penthreshold
  ✅ oc-dash-forge        complete     Exec archetype, prototype delivered
  ⏳ oc-app-architect     not started
  → Next: Feed oc-dash-forge handoff into oc-app-architect Phase 3d

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  3 projects | 2 active pipelines | 1 blocker
```

### Single-Project Status (`/oc-ops status [project]`)

Deeper view for one project — shows full progress tables per skill, all blockers
with proposed resolutions, and the complete next_actions queue.

---

## Priority Engine (`/oc-ops next`)

Recommends the single most important action across all projects (or for a specific
project). Priority rules, in order:

### Priority Hierarchy

```
1. BLOCKED items needing user_decision     (you're the bottleneck)
2. FAILED skills needing recovery          (something broke)
3. IN_PROGRESS skills at a gate            (approval needed to continue)
4. IN_PROGRESS skills mid-work             (resume where you left off)
5. Pipeline-next for completed skills      (chain to the next skill)
6. NOT_STARTED skills in pipeline order    (start the next logical skill)
```

> **One implementation.** This exact hierarchy is encoded in
> `scripts/checkpoint.mjs` (`rankCheckpoint` / the `next` command). For a single
> project, `node scripts/checkpoint.mjs next` *is* `/oc-ops next` minus the
> cross-project layer — so the two never diverge. The oc-orchestrator adds the
> cross-project weighting (below) on top of the same ranking. Before recommending,
> run `node scripts/checkpoint.mjs doctor` so you don't surface a `next_action`
> that's already been shipped (the stale-action failure mode).

### Pipeline Order (tie-breaker)

When two actions have the same priority level, the one earlier in the canonical
pipeline wins:

```
oc-reverse-spec → oc-app-architect → oc-git-ops → oc-deploy-ops
                    ↕
          oc-code-auditor (required before deploy)
          oc-bug-check (pre-commit gate, auto-invoked by oc-git-ops)
          oc-docs-forge → oc-repo-ops (pre-PR gate, auto-invoked by oc-git-ops)
          oc-integrations-engineer (when needed)
          oc-scale-ops (advisory)
```

### Cost / Budget Awareness (v1.6 — the instrumented pipeline)

When `oc-cost-ops` has written a `cost` block to a checkpoint, `/oc-ops next`
factors budget into the ranking as a **tiebreaker within a priority level** (it
does not override the hierarchy above — a decision blocker still wins). Among
same-rank items, a checkpoint whose attributed spend has passed its ceiling
(`cost.total_usd > cost.budget_usd`) sorts first, and the recommendation is
prefixed `⚠ over budget ($X > $Y)`. Overspending is something you want surfaced
now, alongside resuming the work. Encoded as `budgetExceeded()` in
`scripts/checkpoint.mjs` and wired into `pickNext` / `recommendedAction`, so
`/oc-ops next` and `node scripts/checkpoint.mjs next` agree. (`eval_scores` on a
checkpoint inform the same "what needs attention?" read — a skill trending down on
its rubric is a candidate for the next pass.)

### Cross-Project Priority

When recommending across projects, the priority engine layers project weight on top
of the action-level hierarchy:

1. **Project priority class** — `primary` projects outrank `secondary` at the same
   action priority level. A blocker on a secondary project still outranks routine
   progress on a primary project (action priority wins first), but two in-progress
   items tie-break to the primary project.
2. **Recency** — within the same priority class, the more recently active project
   gets slight priority (user momentum).
3. **Session context** — if the user has been working on project X this conversation,
   favor project X for `/oc-ops next` unless another project has a strictly higher-priority
   action.

The user can override priority class with `/oc-ops register` or by editing the memory
edit directly.

### Output Format

```
NEXT ACTION
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Project: aidops-core (gtrackr)
Skill:   oc-code-auditor
Action:  Fix finding F-003 (missing rate limiting on /api/auth/*)
Why:     Blocks oc-app-architect sprint 2 evaluator pass + oc-deploy-ops gate
Command: /oc-audit fix F-003

Run it now? (Y) proceeds, (N) shows the next item in the queue.
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

On (Y): oc-orchestrator actively invokes the recommended skill with the right context.

---

## Router Engine (`/oc-ops route`)

Smart dispatch for vague or multi-skill requests. This operationalizes the routing
table currently in orchestrator.md.

### Routing Table

| Intent Signal | Route to | Phase |
|---|---|---|
| "build me an app", "I have an idea" | oc-app-architect | /oc-discover |
| "document this codebase", "backfill specs" | oc-reverse-spec | /oc-rev-full |
| "what stack should I use" | oc-stack-forge | /oc-stack-decide |
| "review this code", "find bugs", "audit" | oc-code-auditor | /oc-audit full |
| "fix the UX", "design is inconsistent" | oc-ux-engineer | /oc-uxe eval |
| "connect to [service]", "webhook", "OAuth" | oc-integrations-engineer | /oc-integrate plan |
| "deploy this", "ship it" | oc-deploy-ops | /oc-deploy staging |
| "commit", "push to git", "create a PR" | oc-git-ops | /oc-git-sync |
| "generate the PR docs", "update README", "docs drift" | oc-docs-forge | /oc-docs pr |
| "is this PR ready", "repo hygiene", "catalog drift" | oc-repo-ops | /oc-repo audit |
| "can this handle more users", "performance" | oc-scale-ops | /oc-scale audit |
| "dashboard", "analytics UI", "BI design" | oc-dash-forge | /oc-data-forge |
| "continue where I left off" | [scan checkpoints] | [resume most recent] |
| "what should I work on" | oc-orchestrator | /oc-ops next |

### Routing Process

1. Parse the user's intent from their message
2. Check if a project context is clear (active project, or mentioned by name)
3. If project is ambiguous AND multiple projects exist, ask which project
4. Match intent to routing table
5. Check the target skill's checkpoint for that project (resume vs. fresh start)
6. **Actively invoke** the target skill — read its SKILL.md, execute the command

### Fallback: No Match

If the intent doesn't match any routing table entry:

1. Check if it's a general question (not a pipeline action) → answer directly, no routing
2. If it seems like a pipeline action but is ambiguous → ask ONE clarifying question
   using `ask_user_input` with 2-3 options mapped to the most likely skills
3. Never guess — a wrong route wastes more time than a clarifying question

### Ambiguity Handling

If the intent is genuinely ambiguous (maps to 2+ skills equally), present the
options with one-line explanations:

```
That could go a few directions:

1. oc-code-auditor /oc-audit security — if you want to find vulnerabilities
2. oc-security-auditor /scan — if you want a full security posture review (coming soon)
3. oc-code-auditor /oc-audit fix-all — if you already know the issues and want fixes

Which one?
```

Never present more than 3 options.

---

## Pipeline Visualization (`/oc-ops pipeline`)

Shows the canonical pipeline DAG with the project's current position highlighted.

### Text-Based Pipeline View

```
PIPELINE — aidops-core (gtrackr)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  ✅ oc-reverse-spec ──► 🔄 oc-app-architect ──► ⏳ oc-git-ops ──► ⏳ oc-deploy-ops
                           │
                           ├── ✅ oc-stack-forge (Phase 2)
                           ├── ⏳ oc-ux-engineer (Phase 3/6)
                           └── 🔄 Sprint 2/4 in progress
                                  └── 🚫 Blocked: F-003

  Quality plugins:
    ✅ oc-code-auditor     Grade B+ (2 HIGH open)
    ⏳ oc-scale-ops        Not run
    ⏳ integrations     Not needed (no external APIs)

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

---

## Blockers Dashboard (`/oc-ops blockers`)

Aggregates all blockers from all checkpoints across all projects.

```
BLOCKERS — All Projects
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  aidops-core (gtrackr)
  🚫 B1: Missing rate limiting on auth endpoints
     Source: oc-code-auditor F-003
     Blocking: oc-app-architect sprint 2
     Needs: code_fix
     Resolution: Add rate-limit middleware → /oc-audit fix F-003

  GET RIPPED
  🚫 B1: Design direction not approved
     Source: oc-app-architect Phase 3 gate
     Blocking: oc-app-architect punch list
     Needs: user_decision
     Resolution: Review style book + wireframes → /approve

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  2 blockers | 1 code fix | 1 user decision
```

---

## Skill Health Check (`/oc-ops health`)

Verifies the ecosystem is intact. **Read every value at runtime** — do not print
remembered version numbers (they go stale, and a health check that lies is worse
than none):

```bash
# For each skill directory under skills/:
# 1. SKILL.md exists and its YAML frontmatter parses.
# 2. version comes from that frontmatter (NOT a hardcoded table).
# 3. references/orchestrator.md + references/checkpoint-protocol.md are present
#    and in sync:  node scripts/sync-bundles:check
# 4. The shared checkpoint writer exists ONCE at the repo root:
#    test -f scripts/checkpoint.mjs   (there is NO per-skill checkpoint.sh)
# 5. Checkpoints validate:  npm run checkpoint:validate
```

Sample shape (versions shown as `vX.Y.Z` because they're read live, not memorized):

```
ECOSYSTEM HEALTH
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  ✅ oc-app-architect     vX.Y.Z   SKILL.md ✓  references ✓ (in sync)
  ✅ oc-code-auditor      vX.Y.Z   SKILL.md ✓  references ✓ (in sync)
  ✅ oc-orchestrator      vX.Y.Z   SKILL.md ✓  (self)
  …one row per skill under skills/…

  shared writer: scripts/checkpoint.mjs ✓   checkpoints: npm run checkpoint:validate ✓
  N skills + 1 protocol | all healthy
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

---

## Activity Snapshot (`/oc-ops recent`)

Checkpoints store only their most recent `updated_at` — there's no historical event
log. `/oc-ops recent` reconstructs a snapshot from what's available: each skill's last
update timestamp and progress_summary, sorted reverse-chronologically.

```
LAST KNOWN STATE — Per Skill
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  15:30 today   aidops-core    oc-code-auditor   Audit complete, grade B+
  14:45 today   aidops-core    oc-app-architect  Sprint 2/4 in progress
  yesterday     GET RIPPED     oc-app-architect  Phase 3 design started
  3 days ago    penthreshold   oc-dash-forge     Prototype delivered
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

This is a "last seen" view, not a timeline. If you need a true activity log, the
routing_history in the session cache tracks dispatches within the current conversation.

---

## Checkpoint Integration

### One tracked checkpoint (like every other skill)

The oc-orchestrator stores its own state in `.checkpoints/oc-orchestrator.checkpoint.json`,
**tracked in git** so it survives the ephemeral worker. The cross-project registry
and the per-session routing history both live in that file's `skill_state`. It still
*reads* other skills' checkpoints at their standard `{project}/.checkpoints/`
locations — but for its **own** state there is no memory layer and no `~/.opchain/`
file.

| What | Where | Survives reset? |
|---|---|---|
| Project registry (names, paths, priority, apps, default) | `skill_state.registry` in the tracked checkpoint | **Yes** (git) |
| Active project + routing history + last scan summary | `skill_state` in the same file | **Yes** (git) |

### `skill_state` shape

```jsonc
{
  "registry": {
    "projects": [ /* see Registry Schema above */ ],
    "default_project": "aidops-core"
  },
  "active_project": "aidops-core",       // starts as default each session; /oc-ops switch changes it
  "last_scan": "2026-04-21T15:30:00Z",
  "scan_summary": {
    "aidops-core": { "skills_found": ["oc-reverse-spec", "oc-app-architect", "oc-code-auditor"], "blocker_count": 1, "status_summary": "Sprint 2/4, 1 blocker" }
  },
  "routing_history": [
    { "at": "2026-04-21T15:30:00Z", "intent": "audit the code", "routed_to": "oc-code-auditor", "project": "aidops-core" }
  ]
}
```

`scan_summary` is a convenience snapshot from the last scan — it's re-derived by
re-running `node scripts/checkpoint.mjs status`, never trusted as a cache.

### Session Start Sequence

1. Read `.checkpoints/oc-orchestrator.checkpoint.json` → `skill_state.registry`.
2. If the registry has projects: scan each path (`node scripts/checkpoint.mjs status`),
   refresh `scan_summary`, and write the checkpoint.
3. If the registry is empty: cold start flow (see Project Registry § Cold Start).
   On a project with no `.checkpoints/` at all, run `node scripts/checkpoint.mjs init`
   first.

### Error Handling

| Error | Detection | Recovery |
|---|---|---|
| Registered path doesn't exist | `stat {path}` fails | Flag project as unreachable, skip in status, suggest `/oc-ops unregister` |
| Checkpoint file is malformed JSON | JSON parse error | Skip that skill, flag in status: "⚠️ {skill} checkpoint corrupt" |
| Registry entry is stale (references deleted project) | Path scan fails | Remove from `skill_state.registry`, write the checkpoint |
| No checkpoints at registered path | Empty `.checkpoints/` dir | Show project as registered but no pipeline activity |

### Cross-Skill Reads

| Reads from | Why |
|---|---|
| **Every skill** | Checkpoint status, progress, blockers, next_actions |

| Read by | Why |
|---|---|
| No skill reads oc-orchestrator state | It's a coordinator, not a dependency. Skills that need project context get it from their own checkpoints or conversation context. |

### When to Write

All writes go to the one tracked checkpoint (`update oc-orchestrator --skill_state…`):

| Event | What changes in `skill_state` |
|---|---|
| Project registered/unregistered | `registry.projects`, `registry.default_project` |
| Active project changed | `active_project` |
| `/oc-ops status` scanned | `last_scan`, `scan_summary` |
| Routing dispatched | append to `routing_history` |

### `/checkpoint` Behavior

Like every other skill, the oc-orchestrator has one tracked checkpoint. `/checkpoint`
summarizes its `skill_state`:

```
ORCHESTRATOR STATE  (.checkpoints/oc-orchestrator.checkpoint.json — tracked in git)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Registry:
  3 projects (aidops-core [primary], penthreshold, GET RIPPED)
  Default: aidops-core

Session:
  Active: aidops-core
  Last scan: 2 min ago
  Routing history: 3 dispatches this session
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

---

## Smart Behaviors

### Session Start Detection

When the oc-orchestrator is invoked at the start of a conversation (no prior messages),
run an automatic scan and present the most relevant status:

```
Welcome back. Here's where things stand:

▶ aidops-core has a blocker (rate limiting fix needed)
▶ GET RIPPED is waiting on your design approval

/oc-ops next recommends: Fix F-003 on aidops-core (unblocks the build pipeline)
```

### Stale Checkpoint Detection

If a checkpoint's `updated_at` is >7 days old and status is `in_progress`:

```
⚠️ aidops-core / oc-app-architect hasn't been updated in 9 days.
   Last status: Sprint 2 in progress.
   This might be stale. Resume or reset?
```

### Pipeline Completion Detection

Not every project uses every skill. The oc-orchestrator determines the **applicable
pipeline** for a project by checking which skills have ever written a checkpoint
(or were referenced in another skill's checkpoint as a dependency).

A project is "pipeline complete" when all skills that have checkpoints show
`status: complete` AND no skill's `next_actions` references an uninvoked skill.

When detected:

```
🎉 penthreshold — pipeline complete!
   oc-dash-forge ✅ → oc-app-architect ✅ → oc-git-ops ✅ → oc-deploy-ops ✅
   (oc-scale-ops, oc-integrations-engineer not applicable — no checkpoints)
   Archive this project? (/oc-ops unregister penthreshold)
```

### Implicit Project Detection

If the user says "deploy gtrackr" and gtrackr is a known app in the aidops-core
monorepo, the oc-orchestrator should:
1. Set active project to aidops-core
2. Route to oc-deploy-ops with the gtrackr app context
3. No extra question needed

---

## Relationship to `orchestrator.md`

> **Two different things share the word "oc-orchestrator" — don't conflate them:**
> - **`oc-orchestrator` (this skill)** — `/oc-ops`: multi-project registry, cross-project
>   status, priority engine, routing. Has commands and a checkpoint.
> - **`orchestrator.md` (the shared protocol doc)** — bundled into *every* skill's
>   `references/`, read on first invocation. Defines the welcome protocol, pipeline
>   map, chaining, and novice mode. No commands; it's a spec every skill follows.
>
> (The filename is kept as-is deliberately: ~18 skills are instructed to "read
> `references/orchestrator.md`" on startup, so renaming it is a high-blast-radius
> change for low value. The disambiguation header at the top of that file makes the
> distinction clear in place.)

The shared `orchestrator.md` file bundled in every skill remains as-is. It defines:
- Welcome protocol (each skill's own entry behavior)
- Pipeline map (reference for all skills)
- Active chaining protocol (how skills invoke each other)
- Novice mode (guided walkthrough)

The oc-orchestrator **skill** adds:
- Multi-project registry (orchestrator.md has no concept of multiple projects)
- Cross-project status aggregation (orchestrator.md scans one project at a time)
- Priority engine (orchestrator.md has no prioritization logic)
- Routing with project context (orchestrator.md's routing table doesn't consider which project)
- Activity history (orchestrator.md has no temporal tracking)

Over time, skills may choose to delegate their welcome protocol to the oc-orchestrator
(check if oc-orchestrator checkpoint exists → read active project from it → skip own
project detection). But this is opt-in, not required.

---

## PM-Tool MCP Integration (v1.2+)

The oc-orchestrator already reads every skill's checkpoint to answer
"where did I leave off?". v1.2 makes it PM-aware by reading the
`pm_refs` field added in oc-checkpoint-protocol v1.2 — the oc-orchestrator
becomes a router by ticket id, not just by project / phase.

### Cross-skill PM thread aggregation

`/oc-ops` reads `pm_refs` across every skill checkpoint in every
registered project, then aggregates:

```
Active threads (by ticket):

  PLAT-4471 — Add CSV export to /api/customers
    oc-app-architect     spec-approved   (source)
    oc-git-ops           PR opened       (linked)
    oc-deploy-ops        shipped         (deploy: PLAT-4485)
    oc-monitoring-ops    resolved        (incident: PLAT-4503)

  AEGIS-9 — Migrate auth provider Auth0 → Clerk
    oc-migration-ops     step 4/9        (parent + 9 children)
    oc-deploy-ops        ─               (waiting)

  EXP-12 — Image-search prototype
    oc-app-architect     /oc-discover       (source)
    oc-stack-forge       decided         (ADR-7)
```

The view collapses by project but is queryable by ticket: `/oc-ops
ticket PLAT-4471` shows that thread alone.

### `/oc-ops resume TICKET-ID` — route by ticket

New verb (v1.2). User says "resume work on PLAT-4471" and the
oc-orchestrator:

1. Searches `pm_refs` across all skill checkpoints for the
   ticket id.
2. Identifies which skill last touched it + what phase.
3. Recommends the next action, citing the specific skill and
   command. Examples:
   - "Last touched by `oc-git-ops` 2 days ago — PR is in review.
     Run `/oc-git-sync --refresh` to update."
   - "Last touched by `oc-app-architect` Phase 4. Next: `/oc-build`."

### `/oc-ops next` (existing verb, v1.2-enhanced)

`/oc-ops next` already considers project + phase. v1.2 also
considers PM-ticket priority:

- A ticket marked `Urgent` or `priority:high` in the PM tool
  surfaces ahead of lower-priority backlog work.
- Tickets with an unblocked dependency surface ahead of blocked
  ones.
- Stale-but-active threads (no checkpoint write in > 7d) get a
  `stale?` annotation.

### `/oc-ops pm-status` — what does the PM tool say?

New advisory verb. Queries the configured PM-MCP for the user's
assigned tickets in `In Progress` state, cross-references with
checkpoint state, and reports inconsistencies:

```
PM ↔ checkpoint reconciliation:

  PLAT-4471 — In Progress (PM)   ↔   shipped (oc-deploy-ops)
    ⚠  PM ticket should be Done. Likely auto-transition failed.
    Suggested: /oc-git-sync --retry-pm

  AEGIS-9 — In Progress (PM)     ↔   step 4/9 (oc-migration-ops)
    ✓  In sync.

  CHURN-3 — In Progress (PM)     ↔   no checkpoint
    ⚠  PM says you're working on this; no opchain skill
       has a checkpoint. Did you start outside opchain?
```

This is a hygiene tool, not an enforcement layer. Reconciliation
problems are usually transient (deferred PM writes, MCP outages
during a transition).

### Multi-project routing

In a multi-project setup (oc-orchestrator's existing strength),
`pm_refs` are namespaced by project so the oc-orchestrator never
confuses `PLAT-1` from project A with `PLAT-1` from project B
(different PM workspaces, different broker scopes).

### Failure modes

- No PM-MCP configured anywhere → `/oc-ops` operates as v1.1; no
  PM aggregation; the existing project / phase view is the
  full picture.
- PM-MCP available but `pm_refs` field absent in a skill's
  checkpoint → that skill simply doesn't appear in the PM
  thread view; oc-checkpoint-protocol v1.2 backfill happens on
  the skill's next write.
- Cross-project PM ambiguity → oc-orchestrator prompts the user
  to disambiguate when a ticket id appears in multiple PM
  workspaces.

---

## Principles

1. **Read everything, write only your own state.** The oc-orchestrator's power
   comes from its cross-skill read access. It never modifies another skill's
   checkpoints. Its own state lives in memory (registry) and session files (cache).
2. **Recommend, don't block.** `/oc-ops next` is a recommendation, not a gate. The user
   can always invoke any skill directly.
3. **One answer per question.** `/oc-ops next` returns ONE action, not a list. The user
   can ask again for the next item in the queue.
4. **Project context is first-class.** Every command accepts an optional project
   argument. If omitted, use active_project (session state) or default_project (memory).
5. **Pipeline order is the tie-breaker.** When priority is equal, earlier pipeline
   position wins. Unblock downstream skills first.
6. **Dispatch, don't duplicate.** When routing, read the target skill's SKILL.md and
   invoke its command. Don't re-implement skill logic inside the oc-orchestrator.
7. **Stale data is worse than no data.** Flag old checkpoints. Don't present week-old
   status as current truth.
