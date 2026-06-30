---
name: oc-checkpoint-protocol
displayName: OC · Checkpoint Protocol
version: 1.7.0
shortDesc: Session persistence across skills — JSON checkpoint contract + status/next/doctor/validate tooling, catches drift.
phases: [foundation]
triAgent: false
tryable: false
commands: []
description: >
  Cross-skill protocol for session persistence. Not invoked directly — every
  other opchain skill implements this JSON checkpoint contract so state
  survives across conversations.
---

# Checkpoint Protocol

A cross-skill convention for session persistence. Any skill that runs multi-step
workflows across conversations adopts this protocol to save, resume, and recover
state without the user re-explaining context.

This is a **protocol**, not a skill. It defines a file format, naming convention,
resume behavior, and integration contract that individual skills implement. Think
of it like HTTP — the spec lives here, the implementations live in each skill.

### Two versions, don't confuse them

- **`protocol_version`** — the **on-disk schema version**, currently `"1.1"`. It
  lives inside every checkpoint file and only changes when the file *shape* grows
  in a way the validator must know about. The validator (`scripts/checkpoint.mjs`)
  enforces it and accepts **both `"1.0"` and `"1.1"`**.
- **Skill release version** — the `version` in this file's YAML frontmatter. It
  tracks the evolution of the *docs and tooling* (the `pm_refs` extension, the
  `doctor`/`next` commands, etc.) and moves independently, in lockstep with the
  rest of the catalog. oc-release-ops bumps it.

**Additive fields, two ways to ship them.** An optional additive field can ride
under the *same* wire version — `pm_refs` (skill release 1.2) was added under
schema `"1.0"` with no wire bump, because old checkpoints stayed valid and the
shape only grew. OR a release can group additive fields into a **marked minor
wire bump** when it wants a visible protocol revision. v1.6 ("the instrumented
pipeline") took the second path: `cost`, `eval_scores`, and `telemetry_handle`
landed together as wire **`"1.1"`**. It is still fully backward compatible —
`"1.0"` checkpoints validate unchanged, those three fields stay optional — the
`1.1` stamp just marks the revision. New writes stamp `"1.1"`; `oc-migration-ops`
sweeps existing `"1.0"` files forward. A wire bump is *never* a breaking change
here: it only ever adds optional fields, never removes or repurposes one.

---

## Problem Statement

Claude's context resets between conversations. Multi-step skills (oc-app-architect,
tri-dev, oc-reverse-spec, oc-stack-forge, oc-code-auditor, oc-deploy-ops, oc-git-ops) lose all
progress when a session ends. Today:

- **oc-reverse-spec** has a bespoke `checkpoint.md` — the most mature implementation
- **tri-dev** has file-based state (contracts, eval reports) but no formal resume
- **oc-app-architect** has gates but zero session persistence
- **oc-stack-forge**, **life-architect**, and others have no continuity at all

Each skill reinvents (or doesn't) its own persistence. The user pays the cost:
re-explaining context, re-reading files, and hoping Claude picks up where it left off.

---

## Core Concepts

### 1. The Checkpoint File

Every checkpoint-aware skill writes a single `checkpoint.json` file to its project
directory. JSON (not markdown) because it's machine-parseable for cross-skill reads.

**Location:** `{project-dir}/.checkpoints/{skill-name}.checkpoint.json`

Example paths:
```
/home/claude/gtrack/.checkpoints/oc-app-architect.checkpoint.json
/home/claude/gtrack/.checkpoints/oc-code-auditor.checkpoint.json
/home/claude/gtrack/.checkpoints/oc-reverse-spec.checkpoint.json
```

Multiple skills can checkpoint the same project simultaneously without collision.

### 2. Checkpoint Schema

```jsonc
{
  // === HEADER (required) ===
  "protocol_version": "1.0",             // On-disk schema version (not the skill release version)
  "skill": "oc-app-architect",              // Skill that owns this checkpoint
  "project": "gtrack",                   // Human-readable project name
  "project_dir": "/home/claude/gtrack",  // Absolute path
  "created_at": "2026-03-31T14:00:00Z",
  "updated_at": "2026-03-31T15:30:00Z",

  // === PROGRESS (required) ===
  "phase": "build-loop",                 // Current phase name (skill-defined)
  "step": "sprint-2-eval-round-1",       // Current step within phase
  "status": "in_progress",               // in_progress | blocked | complete | failed
  "progress_summary": "Sprint 1 passed (8.2/10). Sprint 2 generator built, evaluator running.",

  // === PROGRESS TABLE (recommended; validator warns if missing while in_progress) ===
  // Ordered list of all phases/steps with completion status
  "progress_table": [
    { "id": "planning",       "label": "Planner",          "status": "complete" },
    { "id": "sprint-1",       "label": "Sprint 1: Auth",   "status": "complete" },
    { "id": "sprint-2",       "label": "Sprint 2: CRUD",   "status": "in_progress" },
    { "id": "sprint-3",       "label": "Sprint 3: UI",     "status": "not_started" }
  ],

  // === CONTEXT PRIMER (recommended — this is what lets resume skip a full re-read) ===
  // Dense, self-contained summary. A new session reads ONLY this + generated files
  // to resume work. Must be complete enough that re-reading the full codebase or
  // re-running prior phases is unnecessary.
  "context_primer": {
    "key_decisions": [
      "Stack: Hono + D1 + Workers. Auth: WebAuthn passkeys.",
      "Two users: Aidan (admin), Dan (viewer). User IDs in D1.",
      "Sprint 1 delivered auth + session middleware. All tests pass."
    ],
    "generated_files": [
      "spec.md",
      "sprint-plan.md",
      "sprints/sprint-1/contract.md",
      "sprints/sprint-1/eval-round-1.md",
      "sprints/sprint-1/eval-round-2.md",
      "src/auth/passkey.ts",
      "src/middleware/session.ts"
    ],
    "user_preferences": [
      "Prefers table-based layouts",
      "Terminal/dark aesthetic",
      "Direct, concise communication"
    ]
  },

  // === BLOCKERS & OPEN QUESTIONS (optional) ===
  "blockers": [
    {
      "id": "b1",
      "description": "Evaluator flagged missing rate limiting on auth endpoints",
      "blocking": "sprint-2",
      "needs": "user_decision",  // user_decision | code_fix | external_dep
      "proposed_resolution": "Add rate-limit middleware in sprint 2 scope"
    }
  ],

  // === NEXT ACTIONS (required while status is in_progress — resume reads [0] first) ===
  // What the next session should do FIRST. Ordered by priority.
  // Each item is a string, or { "text": "...", "done_when": "<shell cmd>" } so a
  // session can self-verify completion. `checkpoint done <skill>` pops item [0].
  "next_actions": [
    "Read evaluator report: sprints/sprint-2/eval-round-1.md",
    "Fix rate limiting gap flagged in blocker b1",
    { "text": "Re-run evaluator on sprint 2", "done_when": "npm test" }
  ],

  // === SKILL-SPECIFIC STATE (optional) ===
  // Freeform object for skill-internal state that doesn't fit the schema above.
  // Other skills should NOT read this section — it's private to the owning skill.
  "skill_state": {
    "current_sprint": 2,
    "iteration": 1,
    "max_iterations": 3,
    "pass_threshold": 6.0,
    "scores": {
      "sprint-1": { "final": 8.2, "rounds": 2 }
    }
  }
}
```

### 3. Status Values

| Status | Meaning | Resume behavior |
|---|---|---|
| `in_progress` | Work is actively happening | Pick up from `step` |
| `blocked` | Waiting on user decision or external dependency | Show blockers, ask for resolution |
| `complete` | All phases done | Inform user, offer next steps |
| `failed` | Unrecoverable error occurred | Show failure context, offer restart or manual fix |

> **Two enums, deliberately.** The top-level `status` is one of the four above.
> Individual `progress_table[].status` rows use a **superset** that also allows
> `not_started` — a single phase can be not-started even though the checkpoint as
> a whole is `in_progress`. The validator enforces each set in its own place.

---

## Resume Protocol

When any checkpoint-aware skill is invoked and a checkpoint exists for the current
project, follow this sequence:

### Step 1: Detect

```
Check: {project-dir}/.checkpoints/{skill-name}.checkpoint.json exists?
  YES → read it, go to Step 2
  NO  → start fresh (normal skill flow)
```

### Step 2: Orient

Read the checkpoint. Display a brief status to the user:

```
RESUMING: [skill] on [project]
Last session: [updated_at, relative time]
Status: [status] — [progress_summary]
Progress: [X/Y phases complete]
Next: [first item from next_actions]
```

### Step 3: Confirm (only when there's something to confirm)

Resuming your own work shouldn't cost a question every time. Default behavior:

- **`status: in_progress` and not stale** → **continue automatically.** Just say
  "Resuming from `next_actions[0]`: …" and proceed. The user can always redirect.
- **`status: blocked` or `failed`, or the checkpoint is stale (>7d)** → stop and
  ask: *"Continue from here, restart, or show the full checkpoint?"* These are the
  cases where silently continuing is wrong.

- **Continue** → Read `context_primer` and `next_actions`, load referenced
  `generated_files`, proceed.
- **Restart** → Archive current checkpoint (rename to `.checkpoint.json.bak`),
  start fresh.
- **Show full** → Display the complete checkpoint for review, then ask continue/restart.

### Step 4: Prime Context

Before doing any new work:

1. Read `context_primer.key_decisions` — this IS your session context
2. Read `context_primer.generated_files` — but only the ones relevant to the
   current step (don't read all files from all sprints if you're on sprint 3)
3. Check `blockers` — if any are `needs: user_decision`, ask before proceeding
4. Start with `next_actions[0]`

### Step 5: Re-validate (optional but recommended)

If the checkpoint is >24h old, do a quick consistency check:
- Do the referenced files still exist at the expected paths?
- Does the project directory structure match what the checkpoint expects?
- Flag any drift: "Checkpoint references `src/auth/passkey.ts` but the file has
  been modified since the last session. Want me to re-read it?"

---

## Write Protocol

### When to Write

Checkpoint writes are mandatory lifecycle work, not optional bookkeeping. Update
the checkpoint after:

| Event | Action |
|---|---|
| Session resume | Restamp `updated_at`, record `resumed_from` when known, and revalidate or replace `next_actions[0]` before continuing. |
| Session pause / user says stop / context is getting long | Write a compact `progress_summary`, current `step`, blockers, and the exact next action to run first. |
| Phase or gate completion | Update `progress_table`, `phase`, `step`, summary, and next action before moving on. |
| Key decision / user decision made | Append to `context_primer.key_decisions`, clear any matching blocker, and restamp. |
| File generated | Append to `context_primer.generated_files`. |
| Blocker discovered | Add to `blockers` and set `status` to `blocked` if it stops progress. |
| Blocker resolved | Remove or mark the blocker resolved and set `status` back to `in_progress`. |
| Cross-skill handoff | Current skill writes the handoff reason, named artifacts, and receiving skill before the receiver acts. |
| Branch / PR opened | Record branch, PR number, scope, touched artifacts, and pending verification. |
| PR merged | Mark PR-wait actions complete and replace them with deploy/release/follow-up actions. |
| Deploy to staging/prod | Record environment, commit SHA, health result, user-visible route checked, and next rollout step. |
| Release cut/ship | Reconcile release-relevant skill checkpoints to the shipped release state. |
| Merge conflict or rebase resolution | Restamp if conflict resolution changed generated files, summaries, or next actions. |
| `checkpoint doctor` drift found | Write a reconciliation checkpoint or add an explicit blocker; do not leave drift only in console output. |

If a future session would be misled without the write, the current skill must
write before handing control back.

### How to Write

Always **read → merge → write**. Never blindly overwrite — another skill might have
written a checkpoint for the same project in a sibling file, and the current skill's
own file might have been manually edited.

```bash
# Pseudocode
existing = read_json("{project}/.checkpoints/{skill}.checkpoint.json") or {}
updated = merge(existing, new_state)
updated["updated_at"] = now()
write_json(updated)
```

### Checkpoint Size

There is **no hard byte cap** — these are session-state docs, and an honest one
beats an artificially short one. (An earlier draft of this protocol said "under
4KB"; real checkpoints run 5–16KB and that's fine. `.checkpoints/README.md` is the
authority: *keep them readable, keep them honest.*)

What actually matters is keeping the **resumable core** scannable and stopping
append-only telemetry from growing without bound:

- `progress_summary` is read on every resume — keep it to a few sentences. The
  validator **warns** above ~1200 characters. Push detail into `progress_table`.
- If `context_primer.key_decisions` exceeds ~20 items, consolidate older ones into
  a summary paragraph and keep only the recent items individually.
- Per-session telemetry in `skill_state` (merged-PR lists, reconciliation logs) is
  the usual source of bloat *and* of merge conflicts. Rotate closed sessions into
  `.checkpoints/history/<skill>.<date>.json` instead of letting `skill_state` grow.
  The validator **warns** once a file passes ~32KB.

> **Anti-pattern (worked example): don't auto-stamp `merged_prs` per merge.**
> opchain.dev once ran a `.github/workflows/checkpoint-after-merge.yml` that, on
> every merge to `main`, appended the merged PR to `skill_state.merged_prs` and
> opened a `bot/checkpoint-stamp-<PR>` PR. It was **removed 2026-06-22** after two
> compounding failures: (1) under branch protection the bot's `gh pr merge --auto`
> could never satisfy required review, so each merge left a **permanent open PR**
> (two dozen piled up); and (2) every stamp PR appended to the *same* array, so they
> **mutually conflicted** — merging one staled the rest, and GitHub's server-side
> resolution bypasses the merge driver (see *Tooling*). `merged_prs` is fully
> reconstructable from `git log`; it is not worth a CI-gated PR per merge. Restamp
> oc-git-ops at inflection points by hand (the assistant does this — e.g. a single
> reconciliation PR), and rotate the array into `.checkpoints/history/`.

---

## Cross-Skill Reads

Skills can read each other's checkpoints (read-only) for coordination. The table
below is illustrative — the **complete, maintained** upstream/downstream map lives
in `orchestrator.md` § "Upstream/Downstream Map" (it covers every skill including
oc-security-auditor, oc-api-dev, oc-monitoring-ops, oc-release-ops, and oc-migration-ops). Treat
that as the single source of truth; this table is just the common cases.

| Reader | Reads | Why |
|---|---|---|
| oc-app-architect | oc-reverse-spec checkpoint | Know what analysis exists for the codebase |
| oc-deploy-ops | oc-app-architect checkpoint | Know which sprints have passed QA |
| oc-git-ops | any skill checkpoint | Know what files to commit |
| oc-code-auditor | oc-reverse-spec checkpoint | Know what analysis has been done |

**Rules:**
- Read the `header`, `progress`, `progress_table`, `context_primer`, and `blockers`
- Never read `skill_state` — it's private to the owning skill
- Never write to another skill's checkpoint
- If you need to coordinate, write to your own checkpoint and reference the other:
  `"depends_on": "oc-app-architect checkpoint shows spec approved at 2026-03-31T12:00:00Z"`

---

## Tooling

All commands live in `package.json` and shell out to `scripts/checkpoint.mjs`
(zero deps, pure Node). The canonical writer is that one file at the repo root —
skills do **not** bundle their own writers.

**Read / resume:**

```bash
node scripts/checkpoint.mjs status            # "where did I leave off?" — full summary
node scripts/checkpoint.mjs status --brief    # just the top skill + its next action + blockers
node scripts/checkpoint.mjs status --since=2026-06-01T00:00:00Z   # momentum digest
node scripts/checkpoint.mjs next              # the SINGLE highest-priority non-stale action
```

`status` leads with a `⛔ N decisions waiting on you` banner when any blocker
`needs: user_decision`, and flags `⚠ stale (Nd)` on in_progress checkpoints older
than 7 days. `next` encodes the priority hierarchy (blocked-on-decision > failed >
in_progress-at-gate > in_progress > complete-with-queued-work > not-started) so you
don't need the oc-orchestrator's registry to answer "what now?".

**Reconcile / verify (catch drift before it bites):**

```bash
node scripts/checkpoint.mjs doctor            # cross-check vs git history + filesystem
node scripts/checkpoint.mjs doctor --online   # also compare deployed /api/health vs local HEAD
node scripts/checkpoint.mjs doctor --fail-on-warnings
```

`doctor` flags: a `project_dir` that doesn't exist on this machine, stale
in_progress checkpoints, `generated_files` that reference missing paths, and
`next_actions` that point at PRs/tickets already merged (the "telling future-self
to redo shipped work" failure that caused three manual reconciliations in this repo).

`next` uses the same drift evidence before recommending work. If a queued action
references already-merged PR work or a completed ticket, `next` skips to the
first fresh action or recommends checkpoint reconciliation instead of telling the
next agent to redo shipped work.

**Write:**

```bash
npm run checkpoint:validate                   # schema gate — CI runs this (add --strict to fail on warnings)
node scripts/checkpoint.mjs list              # list all checkpoint files
node scripts/checkpoint.mjs show [skill]      # display full JSON for one/all checkpoints
node scripts/checkpoint.mjs reset <skill>     # archive current file into .checkpoints/history/
node scripts/checkpoint.mjs update <skill> --field=value [...]   # apply updates, auto-stamp updated_at
node scripts/checkpoint.mjs done <skill>      # pop next_actions[0] → recently_done, restamp
node scripts/checkpoint.mjs init              # scaffold .checkpoints/ on a fresh project
```

`update` supports three operators on dotted paths:

- `--key=value`     — replace a scalar
- `--key+=value`    — append to an array (creates if missing)
- `--key:json=...`  — parse the value as JSON for objects/arrays/numbers

The validator runs after every `update`/`done` so you can't silently corrupt a file.

> **Merge-driver caveat (read this).** `.gitattributes` registers a custom merge
> driver (`scripts/merge-checkpoint.mjs`) that auto-resolves telemetry-only
> conflicts. It runs on **local `git merge` only** — GitHub's server-side
> "Update branch" / auto-merge buttons do **not** invoke it. A checkpoint that
> conflicts there can produce invalid JSON and fail CI (this happened, 2026-05-15).
> Mitigations: rotate volatile telemetry out of the CI-gated file (see
> *Checkpoint Size*), and prefer resolving checkpoint conflicts with a local
> `git merge` so the driver runs. `node scripts/checkpoint.mjs validate` after any
> manual conflict resolution catches the broken-JSON case before you push.

---

## Scaffold Phase

This protocol is **not invoked directly** (it has no commands of its own). A fresh
project gets scaffolded one of two ways:

- **Another skill** notices there's no `.checkpoints/` directory and runs
  `node scripts/checkpoint.mjs init` before writing its first checkpoint.
- **The oc-orchestrator cold-start** (`/oc-ops` on a project with no `.checkpoints/`)
  runs the same `init` as step zero.

`init` creates `.checkpoints/` and a starter `README.md` idempotently. To stand up
the full protocol on a brand-new repo, drop these (the opchain.dev repo is the
reference implementation — copying from there is faster than re-typing):

1. `scripts/checkpoint.mjs` — the validator/status/next/doctor/update CLI.
2. `.checkpoints/README.md` — schema reference + tooling docs (`init` writes a stub).
3. `package.json` scripts — `checkpoint`, `checkpoint:status`, `checkpoint:validate`
   (and optionally `checkpoint:next`, `checkpoint:doctor`).
4. CI step — call `npm run checkpoint:validate` from your CI pipeline.
5. `.gitattributes` — register the `merge=opchain-checkpoint` driver (see the
   merge-driver caveat under *Tooling*) plus `scripts/merge-checkpoint.mjs`.
6. **Do _not_ wire a per-merge auto-stamp workflow.** Earlier guidance here
   recommended a `.github/workflows/checkpoint-after-merge.yml` that opened a stamp
   PR on every merge to `main`. opchain.dev shipped it and **removed it 2026-06-22**
   because it was net-negative under branch protection — see *Anti-pattern: don't
   auto-stamp `merged_prs` per merge* under *Write Protocol → Checkpoint Size*. Let
   the assistant restamp oc-git-ops at inflection points instead.

**Do not** add `.checkpoints/` to `.gitignore`. Tracking the directory in git is
what makes checkpoints survive across sessions and machines — including ephemeral
runners like Claude Code on the web.

---

## /checkpoint Command

Any skill that adopts this protocol should recognize `/checkpoint` as a utility command:

```
/checkpoint         Show current checkpoint status for active project
/checkpoint next    Show the single highest-priority next action (priority engine)
/checkpoint doctor  Cross-check checkpoints against git + filesystem for drift
/checkpoint show    Display full checkpoint contents
/checkpoint reset   Archive current checkpoint and start fresh
/checkpoint list    List all checkpoints in the project directory
```

This is a **cross-skill** command — any checkpoint-aware skill handles it the same way.
The behavior is identical regardless of which skill the user is currently in.

---

## Directory Convention

```
project-dir/
├── .checkpoints/
│   ├── oc-app-architect.checkpoint.json
│   ├── oc-code-auditor.checkpoint.json
│   ├── oc-reverse-spec.checkpoint.json
│   └── oc-deploy-ops.checkpoint.json
├── spec/           (oc-app-architect output)
├── sprints/        (oc-app-architect Phase 6 build loop output)
├── src/            (project source)
└── ...
```

The `.checkpoints/` directory is:
- **Tracked in git** (was gitignored in v1.0; flipped to tracked because
  Claude Code on the web has an ephemeral worker — gitignored state
  doesn't survive sessions). Treat checkpoints as living "session state
  docs" the team can read in PRs alongside the code change.
- Readable by any skill in the ecosystem
- Validated by CI via `npm run checkpoint:validate` (see
  `.checkpoints/README.md` and `scripts/checkpoint.mjs` for the schema
  and tooling)
- Surfaced via `npm run checkpoint:status` — the canonical "where did I
  leave off?" command for new sessions

---

## Optional extension: `pm_refs`

`pm_refs` is an **optional, additive field** (introduced in skill release 1.2)
under on-disk schema `1.0` — checkpoints without it stay valid. It lets a skill's
checkpoint carry the PM tickets it touched so downstream skills find context
without re-asking.

> **Status:** the field is fully specified and **validated when present** (see
> *Validation* below), but in practice skills today still record PM refs ad-hoc in
> `skill_state` (e.g. `linear_active_parents`). Prefer `pm_refs` for anything a
> *sibling* skill needs to read; keep skill-private PM bookkeeping in `skill_state`.

### Field shape

```jsonc
{
  // ...existing fields
  "pm_refs": [
    {
      "provider": "linear",                  // or "jira" | "github-issues"
      "id": "PLAT-4471",                     // ticket id
      "url": "https://linear.app/onramp/issue/PLAT-4471",
      "role": "source",                      // "source" | "child" | "deploy" | "incident" | "linked"
      "created_by_skill": "oc-app-architect",   // which skill linked it
      "first_seen_at": "2026-05-04T12:00:00Z"
    }
  ]
}
```

`role` semantics:

- `source` — the originating ticket (one per checkpoint, typically).
- `child` — sprint / step / sub-ticket created by this skill.
- `deploy` — deploy-ops-created deploy ticket.
- `incident` — monitoring-ops-created incident ticket.
- `linked` — a related ticket the skill referenced but didn't author.

### Read pattern (downstream skills)

When any skill starts, after reading its own checkpoint, it
**also reads `pm_refs` from sibling-skill checkpoints** to find
context. Example: oc-git-ops, on `/oc-git-sync` with no explicit ticket
id, looks at `oc-app-architect.checkpoint.json#pm_refs` to find the
source ticket from the most recent build phase.

### Write pattern

Every skill that touches a PM ticket appends to its own
`pm_refs` array at the same time it writes the ticket. The array
is append-only within a session; entries are not deduplicated
across sessions (the audit trail is per-session).

### Status surface

`npm run checkpoint:status` includes a one-line PM summary per
skill in v1.2:

```
oc-app-architect    spec-approved    PM: PLAT-4471 (source) + 3 children
oc-git-ops          PR-merged        PM: PLAT-4471 (linked)
oc-deploy-ops       shipped          PM: PLAT-4485 (deploy) → PLAT-4471
oc-monitoring-ops   resolved         PM: PLAT-4503 (incident) → PLAT-4485
```

This makes the cross-skill PM thread legible at session resume.

### Validation

`npm run checkpoint:validate` treats `pm_refs` as optional, but when it **is**
present it checks the shape: each entry needs a `provider` and `id`, and any `role`
must be one of `source|child|deploy|incident|linked`. Checkpoints without the field
validate unchanged. There is no batch migration — the field appears on a skill's
next write.

### Privacy in regulated environments

The `pm_refs` array stores ticket ids + URLs. **It does not
store ticket bodies.** Tickets in regulated environments may
contain CUI / PHI; the body retrieval path runs through the
broker + redactor on each access (see `mcp-enterprise-f500` and
`mcp-enterprise-defense` scenarios). The checkpoint is therefore
safe to commit + share within the project.

---

## Wire 1.1 extensions: `cost`, `eval_scores`, `telemetry_handle`

Three **optional, additive** fields introduced with on-disk schema `"1.1"`
(v1.6 "the instrumented pipeline"). Checkpoints without them stay valid; they
are validated only when present. Together they make the pipeline *instrumented*:
every phase can report cost, every skill can report an eval score, every
checkpoint can carry a budget and an opt-in telemetry link.

### `cost` — LLM spend attribution + budget gate (owner: `oc-cost-ops`)

```jsonc
{
  "cost": {
    "currency": "USD",                       // optional, default USD
    "total_usd": 12.34,                      // optional, ≥ 0 — spend attributed to this checkpoint
    "budget_usd": 50,                        // optional, ≥ 0 — the budget ceiling; gate trips when total > budget
    "by_phase": { "spec": 3.10, "build": 8.40, "audit": 0.84 },   // optional, name → ≥ 0
    "by_model": { "claude-opus-4-8": 9.2, "claude-haiku-4-5": 3.1 }, // optional, name → ≥ 0
    "tokens": { "input": 1_200_000, "output": 240_000 },          // optional, free-form
    "updated_at": "2026-06-25T12:00:00Z"     // optional
  }
}
```

`oc-cost-ops` owns this field. The validator enforces: `cost` is an object;
`total_usd`/`budget_usd` are non-negative numbers; `by_phase`/`by_model` map
names to non-negative numbers. When `total_usd > budget_usd > 0` the validator
**warns** ("budget gate tripped") rather than erroring — overspend is a signal,
not a corrupt file. The budget *gate* (block vs warn) is policy `oc-cost-ops`
applies; the checkpoint just records the numbers.

### `eval_scores` — scores against a stable rubric (owners: `oc-bug-check`, `oc-code-auditor`, `oc-prompt-ops`)

```jsonc
{
  "eval_scores": [
    { "rubric": "oc-code-auditor", "score": 8.2, "max": 10, "at": "2026-06-25T12:00:00Z",
      "ref": "sprints/sprint-2/eval-round-1.md",
      "dimensions": { "functionality": 9, "completeness": 8, "quality": 8, "ux": 8 } },
    { "rubric": "oc-prompt-ops", "score": 0.93, "max": 1 }   // 0..1 pass_rate uses max: 1
  ]
}
```

Append-only list. The score is **rubric-relative** — pair it with `max` when the
scale isn't 0..10 (a prompt-ops `pass_rate` is 0..1 with `max: 1`; a code-auditor
grade is 0..10). The validator requires each entry to be an object with a string
`rubric` and a numeric `score`; `max` (if present) must be positive and `score`
must not exceed it; `at` (if present) must be ISO-8601; `dimensions` (if present)
maps names to numbers. This is what lets `oc-orchestrator` and `oc-cost-ops`
reason about quality trend, not just pass/fail.

### `telemetry_handle` — opt-in local-metering link (owner: `oc-telemetry-ops`)

```jsonc
{
  // a bare anonymous id …
  "telemetry_handle": "anon-7f3a91c0"
  // … or the richer opt-in object form:
  // "telemetry_handle": { "enabled": true, "id": "anon-7f3a91c0",
  //                       "sink": ".checkpoints/usage.sqlite",
  //                       "since": "2026-06-25T12:00:00Z" }
}
```

Links a checkpoint to its rows in the local `usage.sqlite` metering store
*without storing any PII or content*. **Default stance is OFF** — the field's
mere presence is not consent; `enabled: true` is. A string value is just an
anonymous handle; the object form additionally carries the opt-in flag, sink
path, and start time. The validator accepts a non-empty string or an object
whose `enabled` (when present) is boolean, `id`/`sink` are strings, and `since`
is ISO-8601. `oc-telemetry-ops` owns the metering store and the consent gate;
the checkpoint only carries the link.

### Validation & migration

`npm run checkpoint:validate` treats all three as optional and checks their shape
only when present (exactly like `pm_refs`). Existing `"1.0"` checkpoints validate
unchanged. The forward sweep (`"1.0"` → `"1.1"` stamp) is an `oc-migration-ops`
job — additive, no data transform, reversible — the same way governance
frontmatter rolled out in v1.4.

---

## Principles

1. **Read the checkpoint, not the chat history.** Chat history is gone next session.
   The checkpoint is the only truth that survives.
2. **Write often, write small.** Every completed step gets a checkpoint update.
   The cost of writing is negligible; the cost of losing progress is a full session.
3. **Context primer > full re-read.** A good context primer means the new session
   never needs to re-read the entire codebase or all generated files. 20 lines of
   dense summary beats 200 lines of re-analysis.
4. **JSON for machines, summaries for humans.** The checkpoint is JSON so skills can
   parse it. The `progress_summary` and `next_actions` are human-readable so the user
   can understand what's happening.
5. **Private state stays private.** `skill_state` is an opaque bag — other skills
   don't read it, and the protocol doesn't define its contents.
6. **Never block on a missing checkpoint.** If the checkpoint is corrupt, missing, or
   from an incompatible version, the skill starts fresh and tells the user why.
