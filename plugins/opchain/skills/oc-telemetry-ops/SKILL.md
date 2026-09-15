---
name: oc-telemetry-ops
displayName: OC · Telemetry Ops
version: 2.0.2
license: Apache-2.0
shortDesc: Opt-in, local-first usage metering to .checkpoints/usage.sqlite; anonymized local aggregate export.
phases: [build]
triAgent: false
tryable: true
commands:
  - /oc-telemetry
  - /oc-telemetry enable
  - /oc-telemetry disable
  - /oc-telemetry status
  - /oc-telemetry event
  - /oc-telemetry aggregate
  - /oc-telemetry export
description: >
  Telemetry operations harness — opt-in, local-first usage metering that records
  which skills and phases actually run, to a local .checkpoints/usage.sqlite
  store, then produces anonymized local aggregate exports. Use for
  /oc-telemetry, "usage metering", "opchain usage telemetry", "opt-in analytics",
  "which skills do people use", "usage stats", "dashboard data", "anonymized
  usage". Default stance is OFF — nothing is recorded until you explicitly enable
  it, and no prompt content or PII ever leaves the machine. Pairs with oc-cost-ops
  (cost per run) for the cost-per-feature dashboard stats. NOT application or
  production observability (oc-monitoring-ops).
governance:
  breaking_change_policy: skills/CHANGELOG.md
  last_reviewed: 2026-06-25
  owner: opchain
  docs:
    - { path: SKILL.md, kind: contract, lifecycle: stable }
    - { path: references/local-metering.md, kind: shared, lifecycle: stable }
    - { path: references/privacy-consent.md, kind: shared, lifecycle: stable }
    - { path: references/aggregation.md, kind: shared, lifecycle: stable }
---

# Telemetry Ops

**On first invocation, read `references/orchestrator.md` and follow its welcome protocol.**

Answer *"is anyone actually using this, and which parts?"* — **without betraying
opchain's local-first, no-backend stance.** Telemetry Ops meters skill/phase
usage into a **local** SQLite store (`.checkpoints/usage.sqlite`), strictly
opt-in, and produces an anonymized local aggregate export (pipelines run,
most-used skill, model-tier mix, cost-per-shipped-feature). The public
`/dashboard` currently uses sample data; export ingestion is not implemented.
The CLI does not publish the raw store or the aggregate.

This is **not** a hosted analytics product and not PostHog (that's the *site's*
consent-gated client analytics). Telemetry Ops is about the **skills pipeline's
own** usage, recorded where the work happens — locally, in git-adjacent state —
so the numbers are real (they come from actual runs) and private (they stay put
unless you export an aggregate).

> **Default OFF. Tracked state is not consent.** Metering does nothing until
> `/oc-telemetry enable` records opt-in in the gitignored local SQLite store. A
> `telemetry_handle` checkpoint field, including a cloned legacy `enabled: true`,
> is never consent. See `references/privacy-consent.md`.

---

## /oc-telemetry — Command Reference

```
TELEMETRY OPS COMMANDS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  CONSENT (default: OFF)
  /oc-telemetry enable     Opt in — create the local store and record local consent
  /oc-telemetry disable    Opt out — stop metering (store kept locally, your call to delete)
  /oc-telemetry status     Show consent state, store location, row count;
                           exits non-zero when enabled with no store
                           (enabled-with-no-store never reads healthy)

  METERING, EVENTS & EXPORT (local CLI)
  /oc-telemetry aggregate  Roll the local store up into an anonymized summary
  /oc-telemetry export     Emit the publishable aggregate (no PII) for /dashboard
  /oc-telemetry event      Attach a bounded eval, gate, or sprint event to a local run

  UTILITIES
  /checkpoint              Show checkpoint status

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  Type any command to begin. /oc-telemetry to see this again.
```

---

## How This Skill Fits the Build Pipeline

### Installed runtime

Run the bundled helper with Node.js 22.13 or newer. Resolve `scripts/telemetry.mjs`
relative to this installed skill's `SKILL.md`, then invoke its absolute path from
the project you are working on:

```sh
node /absolute/path/to/oc-telemetry-ops/scripts/telemetry.mjs status
node /absolute/path/to/oc-telemetry-ops/scripts/telemetry.mjs record --skill=oc-app-architect --phase=build
```

The helper finds the consuming Git repository root, including when invoked from
a subdirectory; outside Git it uses the current directory. `OPCHAIN_ROOT` can
explicitly select another project. It does not write state into the installed
skill or plugin cache. No project package.json or npm script is required.
The opchain source repository also offers `npm run telemetry -- <command>` as
a convenience; use the bundled helper in other projects.

An installation or update is not telemetry consent. Preserve the existing
checkpoint, `telemetry_handle.enabled`, anonymous ID, timestamps, and SQLite
store. Never run `enable` or `disable` as part of updating skills. Missing consent
stays off. After an update, use `status` to verify the existing setting; an enabled
checkpoint without a usable store must be reported as unhealthy. Before opting
in, ensure `.checkpoints/usage.sqlite` and its SQLite journal/WAL/SHM sidecars are
gitignored, while checkpoint JSON remains tracked.

```
every skill run ╌╌(YOU must call)╌► .checkpoints/usage.sqlite   (LOCAL, gitignored)
   bundled `telemetry.mjs record`      │  skill, phase, model-tier, cost (from
   nothing records automatically       │  oc-cost-ops), timestamp — NO content
                                       ▼
                              /oc-telemetry aggregate
                                       │  anonymized rollup (counts + sums only)
                                       ▼
                              /oc-telemetry export ──► site /dashboard
                                                       (pipelines run, top skill,
                                                        model-tier mix, $/feature)
```

The local store is the source; the published artifact is a small aggregate with
no identifiers. `oc-cost-ops` supplies the per-run cost so the dashboard can show
average cost-per-shipped-feature.

Aggregate/export initialization uses the local checkpoint provider to establish
the ignored `.checkpoints/.local/` metadata convention in a Git worktree. A
non-Git project may record locally but aggregate/export fails closed rather than
writing telemetry metadata to an unverified path.

**What is mechanical today.** `scripts/telemetry.mjs` (opchain repo, `npm run
telemetry -- <cmd>`) implements `enable`, `disable`, `status`, `record`, `event`,
`aggregate`, and `export`. `record` remains session-invoked; no skill, hook or
plugin command calls it automatically. `aggregate` prints a local anonymized
preview; `export --out=<new-file>` writes a new local artifact only when consent
is enabled and the C-backed private path is verified as ignored in a Git
worktree. Neither command publishes or contacts a service.

---

## The `telemetry_handle` checkpoint field (wire 1.1)

Telemetry Ops previously used the `telemetry_handle` field added in v1.6 (see
`oc-checkpoint-protocol` § "Wire 1.1 extensions"). Existing fields remain
historical links only; local consent and the anonymous handle now live solely in
the gitignored SQLite store, so a copied checkpoint cannot opt in a new machine.

```jsonc
"telemetry_handle": {
  "sink": ".checkpoints/usage.sqlite",   // informational local-store path
  "local_consent": true                   // informational; never authorizes writes
}
```

`.checkpoints/usage.sqlite` is **gitignored** — it is local-only state, never
committed (unlike the rest of `.checkpoints/`, which is tracked). The handle is a
random local id, not derived from any user identity.

---

## Principle 1: Local-first metering, content-free by schema

Usage is recorded to a single local SQLite file, `.checkpoints/usage.sqlite`
(gitignored), and only when telemetry is enabled. The store records *that* a
skill/phase ran and what it cost — never *what* was in the prompt. The privacy
guarantee is structural: prompt text, file paths, project names, and any user
identifier are **not columns**, so they cannot be recorded. Schema, write path,
and the opt-out→zero-writes guarantee: `references/local-metering.md`.

SQLite (not a JSON array) because usage is append-heavy and queried by aggregate
— and because a growing JSON array in `.checkpoints/` would be a merge-conflict
magnet, the exact failure the checkpoint protocol warns against.

## Principle 2: Opt-in — tracked state is not consent

Default is **OFF**: no store, no writes. `/oc-telemetry enable` creates the local
store, records consent there, and mints a random machine-local handle (never
derived from any identity). A copied checkpoint cannot authorize a write. The
write path checks the local row on every run. `/oc-telemetry disable` stops
metering immediately (the local file is kept; deleting it is the user's call).
Full consent model and the relationship to the site's separate PostHog consent:
`references/privacy-consent.md`.

## Principle 3: Aggregate-only export

The only thing that ever leaves the machine is a small, anonymized **aggregate** —
counts and sums, no raw rows, no identity — produced by `/oc-telemetry aggregate`
and emitted by `/oc-telemetry export` in the exact shape the site `/dashboard`
(Sprint 5) renders: `pipelines_run`, `by_skill`, `model_tier_distribution`,
`avg_cost_per_feature_usd` (cost from `oc-cost-ops`), `eval_score_trend`. Guards:
no raw rows are ever exported, the `handle` is never exported, small cells
(< k=5) fold into `"other"`, tiers not full model ids, weekly time buckets. Shape
+ queries + k-anonymity: `references/aggregation.md`.

This is the honest answer to "is anyone actually using this, and which parts?" —
real because it comes from real runs, publishable because it's anonymized and
content-free by construction.

---

## Boundaries (what oc-telemetry-ops does NOT own)

| Concern | Owner | Why |
|---|---|---|
| Per-run cost numbers | `oc-cost-ops` | Telemetry stores + aggregates the cost cost-ops attributes |
| Site client analytics (PostHog, consent banner) | the site (`ConsentBanner.astro`) | Different surface — visitor analytics, not pipeline usage |
| Rendering `/dashboard` | the Astro site (Sprint 5) | Telemetry defines the export shape; the site draws it |
| Production observability (uptime, errors) | `oc-monitoring-ops` | That watches the deployed app; this meters the skills pipeline |

---

## Checkpoint Integration

The shared checkpoint schema, write rules and resume protocol live in
`references/checkpoint-protocol.md`, bundled with this skill. This section adds only
what is specific to oc-telemetry-ops.

### Location
Consent and raw runs stay in `{project-dir}/.checkpoints/usage.sqlite`. Aggregate
metadata is written through C's local store under
`{project-dir}/.checkpoints/.local/telemetry/.checkpoints/`; the tracked
`{project-dir}/.checkpoints/oc-telemetry-ops.checkpoint.json` is not updated.

### When to Write

| Event | What to Save |
|---|---|
| Opted in / out | local SQLite `telemetry_meta` consent value |
| Store created | local SQLite random handle + sink |
| Aggregate produced | compact rollup summary in the private telemetry checkpoint `skill_state` |

### Cross-Skill Reads

| Reads from | Why |
|---|---|
| oc-cost-ops | Per-run attributed cost to meter alongside usage |
| any skill | The skill/phase that ran (the unit of usage) |

| Read by | Why |
|---|---|
| the site `/dashboard` | The anonymized aggregate export — intended reader; the page still imports static sample data and has no loader for an export yet |

---

## Principles

1. **Opt-in, always.** Default OFF. Nothing is recorded until the user enables
   it; the field's presence is not consent — `enabled: true` is.
2. **Local-first, no backend.** The raw store is a local SQLite file, gitignored,
   never committed and never auto-uploaded.
3. **Aggregate, never raw.** Only an anonymized, identity-free rollup (counts and
   sums) is ever published. No prompt content, no file paths, no PII.
4. **Honest numbers.** Usage comes from real runs, not estimates — that's the
   whole point of the `/dashboard` credibility surface.
5. **Reversible.** `/oc-telemetry disable` stops metering immediately; deleting
   the local store is always the user's call.
