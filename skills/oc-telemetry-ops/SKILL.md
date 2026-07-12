---
name: oc-telemetry-ops
displayName: OC · Telemetry Ops
version: 1.8.1
shortDesc: Opt-in, local-first usage metering to .checkpoints/usage.sqlite; anonymized aggregates power the public /dashboard.
phases: [build]
triAgent: false
tryable: true
commands:
  - /oc-telemetry
  - /oc-telemetry enable
  - /oc-telemetry disable
  - /oc-telemetry status
  - /oc-telemetry aggregate
  - /oc-telemetry export
description: >
  Telemetry operations harness — opt-in, local-first usage metering that records
  which skills and phases actually run, to a local .checkpoints/usage.sqlite
  store, then produces anonymized aggregates for the public /dashboard. Use for
  /oc-telemetry, "usage metering", "telemetry", "opt-in analytics", "which skills
  do people use", "usage stats", "dashboard data", "anonymized usage". Default
  stance is OFF — nothing is recorded until you explicitly enable it, and no
  prompt content or PII ever leaves the machine. Pairs with oc-cost-ops (cost per
  run) for the cost-per-feature dashboard stats. Trigger liberally on
  usage/telemetry work.
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
opt-in, and produces an anonymized aggregate that the public `/dashboard` renders
as a credibility surface (pipelines run, most-used skill, model-tier mix,
cost-per-shipped-feature). The raw store never leaves the machine; only the
small, aggregated, identity-free rollup is ever published.

This is **not** a hosted analytics product and not PostHog (that's the *site's*
consent-gated client analytics). Telemetry Ops is about the **skills pipeline's
own** usage, recorded where the work happens — locally, in git-adjacent state —
so the numbers are real (they come from actual runs) and private (they stay put
unless you export an aggregate).

> **Default OFF. Presence is not consent.** Metering does nothing until
> `/oc-telemetry enable` flips it on. The `telemetry_handle` checkpoint field
> existing is *not* consent; `enabled: true` is. See `references/privacy-consent.md`.

---

## /oc-telemetry — Command Reference

```
TELEMETRY OPS COMMANDS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  CONSENT (default: OFF)
  /oc-telemetry enable     Opt in — create the local store, set telemetry_handle.enabled
  /oc-telemetry disable    Opt out — stop metering (store kept locally, your call to delete)
  /oc-telemetry status     Show consent state, store location, row count

  METERING & EXPORT
  /oc-telemetry aggregate  Roll the local store up into an anonymized summary
  /oc-telemetry export     Emit the publishable aggregate (no PII) for /dashboard

  UTILITIES
  /checkpoint              Show checkpoint status

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  Type any command to begin. /oc-telemetry to see this again.
```

---

## How This Skill Fits the Build Pipeline

```
every skill run ──(opt-in)──► .checkpoints/usage.sqlite   (LOCAL, gitignored)
                                       │  skill, phase, model-tier, cost (from
                                       │  oc-cost-ops), timestamp — NO content
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

---

## The `telemetry_handle` checkpoint field (wire 1.1)

Telemetry Ops owns the `telemetry_handle` field added in v1.6 (see
`oc-checkpoint-protocol` § "Wire 1.1 extensions"). It links a checkpoint to its
rows in the local store **without storing any PII or content**:

```jsonc
"telemetry_handle": {
  "enabled": true,                       // opt-in flag — the actual consent signal
  "id": "anon-7f3a91c0",                 // random, machine-local, non-reversible
  "sink": ".checkpoints/usage.sqlite",   // local store path
  "since": "2026-06-25T12:00:00Z"
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

## Principle 2: Opt-in — presence is not consent

Default is **OFF**: no store, no writes, no `telemetry_handle`. `/oc-telemetry
enable` flips `telemetry_handle.enabled = true` and mints a random, machine-local
`handle` (never derived from any identity). A `telemetry_handle` whose `enabled`
is `false` — or absent — means off; only `enabled: true` authorizes a write, and
the write path checks it on every run. `/oc-telemetry disable` stops metering
immediately (the local file is kept; deleting it is the user's call). Full consent
model, the recorded-vs-never-recorded table, and the relationship to the site's
separate PostHog consent: `references/privacy-consent.md`.

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

### Location
`{project-dir}/.checkpoints/oc-telemetry-ops.checkpoint.json`

### When to Write

| Event | What to Save |
|---|---|
| Opted in / out | `telemetry_handle.enabled` + `since` |
| Store created | `telemetry_handle.id` + `sink` |
| Aggregate produced | rollup summary path in `skill_state` |

### Cross-Skill Reads

| Reads from | Why |
|---|---|
| oc-cost-ops | Per-run attributed cost to meter alongside usage |
| any skill | The skill/phase that ran (the unit of usage) |

| Read by | Why |
|---|---|
| the site `/dashboard` | The anonymized aggregate export |
| oc-orchestrator | "Most-used skill" signal for recommendations |

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
