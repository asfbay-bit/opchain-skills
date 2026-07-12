---
name: oc-signal-forge
displayName: OC · Signal Forge
version: 1.8.1
shortDesc: "Question → trustworthy metric: instrument, harvest, prove it answers the question, then wire it. Backend only."
phases: [build]
triAgent: true
tryable: true
commands:
  - /oc-signal
  - /oc-signal frame
  - /oc-signal design
  - /oc-signal harvest
  - /oc-signal build
  - /oc-signal verify
  - /oc-signal wire
  - /oc-signal catalog
  - /oc-signal status
description: >
  Analytics & signals backend harness with a Designer/Builder/Evaluator loop. Derives
  new metrics from the question they answer, builds the instrumentation + harvester +
  transform, and adversarially verifies the signal is correct AND answers the question
  before wiring it to a consumer. Use for /oc-signal, "new metric", "instrument this",
  "analytics backend", "data harvesting", "is this metric right", "wire up a signal",
  "derive a KPI". Hands rendered output to oc-dash-forge. NOT pipeline telemetry
  (oc-telemetry-ops), NOT dashboards (oc-dash-forge), NOT prod uptime (oc-monitoring-ops).
  Trigger liberally on product-analytics / metric-engineering work.
governance:
  breaking_change_policy: skills/CHANGELOG.md
  last_reviewed: 2026-06-26
  owner: opchain
---

# Signal Forge

**On first invocation, read `references/orchestrator.md` and follow its welcome protocol.**

Owns the **backend of analytics**: instrumentation design, the harvester / ingestion
layer, the transform / middleware, the store, and — the part most analytics tooling
skips — **validation that the signal answers the question correctly**, before it's ever
exposed. The dashboarding front end already exists (`oc-dash-forge`); this is the skill
that *feeds* it a number you can trust.

The hard part of analytics is not laying pipe. It's proving the number is right. A
pipeline that runs is not a pipeline that's correct, and a metric that's correct can
still answer the wrong question — "active users" computed from raw page-loads is a
perfectly accurate count of the wrong thing. Signal Forge exists because that silent
failure mode is the default outcome of every dashboard built without an adversarial
check between the data and the chart.

So this is a `-forge` tri-agent harness. A **Designer** defines the metric and its
instrumentation spec from the question it serves, a **Builder** implements the
instrumentation + harvester + transform + store, and an **Evaluator** is *skeptical
about correctness* — it tries to disprove the number against an independent ground
truth and tests whether the signal actually answers the framed question. Only a signal
that survives the Evaluator gets wired to a consumer. Signal Forge does **not** render
charts, meter the opchain pipeline's own usage, or watch prod uptime — see Boundaries.

---

## /oc-signal — Command Reference

```
SIGNAL FORGE COMMANDS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  FRAME (Phase 0 — the anchor)
  /oc-signal frame      State the decision the metric informs + the question it answers

  DESIGNER (Phase 1)
  /oc-signal design     Produce the signal spec: definition, grain, instrumentation schema

  BUILDER (Phase 2)
  /oc-signal harvest    Select + scaffold the harvester archetype for this source
  /oc-signal build      Implement instrument + harvest + transform + store + consumer stub

  EVALUATOR (Phase 3 — the signature gate)
  /oc-signal verify     Adversarial pass: answers-the-question, correctness, robustness, wired

  WIRE (Phase 4)
  /oc-signal wire       Hand the validated signal to its consumer (oc-dash-forge / oc-api-dev)

  REGISTRY & STATE
  /oc-signal catalog    Show / update the living signal catalog (signals/catalog.md)
  /oc-signal status     Show checkpoint status — which signal, which phase, what's next
  /oc-signal            Show this command reference

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  Type any command to begin. /oc-signal to see this again.
```

---

## Operating model — Designer → Builder → Evaluator

The `-forge` tri-agent loop is the right shape here because the hard part isn't laying
pipe, it's proving the number is right. The **Evaluator is adversarial about
correctness** — its job is to disprove the signal, not to confirm it.

```
/oc-signal frame      The QUESTION + decision the metric serves (the anchor)
        │
        ▼
┌──────────────┐  signal spec   ┌──────────────┐
│  DESIGNER    │───────────────►│  BUILDER     │  instrument + harvest + transform + store
│ define the   │                │ implement    │
│ metric +     │◄──negotiate───►│ the pipeline │
│ instrument-  │                └──────┬───────┘
│ ation spec   │                       │ signal (live)
└──────────────┘                       ▼
                              ┌──────────────────┐
                              │  EVALUATOR       │  "does it answer the question,
                              │ skeptical:       │   and is the answer RIGHT?"
                              │ correctness +    │
                              │ answers-the-Q +  │  PASS → /oc-signal wire
                              │ robustness +     │  FAIL → back to Builder
                              │ wired?           │
                              └──────────────────┘
```

The Designer↔Builder edge is a negotiation: if the source can't carry the grain the
Designer specced (e.g. the event has no stable `user_id`), they renegotiate the
definition rather than ship a wrong one. The Builder→Evaluator edge is one-directional;
the Evaluator never edits the pipeline, it only grades it and routes FAILs back. This is
the same loop discipline as `oc-app-architect`'s Generator/Evaluator — a 5/10 verdict is
a fine and expected outcome of an honest first pass.

### Phase 0 — Frame (`/oc-signal frame`)

State, in **one sentence**, the decision this metric informs and the question it
answers. This is the anchor the Evaluator grades everything against. Without it you get
a number nobody can act on.

A good frame names the decision out loud: *"Should we keep investing in the
team-collaboration surface? → Are teams coming back week over week?"* A bad frame is a
metric name with no decision behind it (*"weekly active users"* — to do *what*?). The
frame is recorded as `signal.question` in the catalog and never dropped; every later
phase points back at it.

### Phase 1 — Designer (`/oc-signal design`)

Produce the **signal spec**:

- The question it answers + the decision it drives (carried forward from `frame`).
- **Metric definition:** the formula, numerator / denominator, unit, **grain** (per-request
  / session / user / day), and the source of truth.
- **Instrumentation schema:** event names, properties, identity / keys, sampling rate,
  and an explicit PII stance.
- **"What would make this *wrong*":** double-counting, bot / replay traffic, timezone
  handling, identity stitching, late-arriving data, survivorship / selection bias. The
  Designer writes the failure list the Evaluator will later test against — naming the
  traps up front is half the defence.

Grain is the field most metrics get wrong, so it's mandatory: a "conversion rate" at
session grain and the same name at user grain are different numbers that disagree, and
the catalog must say which one this is.

### Phase 2 — Builder (`/oc-signal build`, `/oc-signal harvest`)

Implement the pipeline. The **harvester is an explicit abstraction** so the same skill
handles any ingestion shape. `/oc-signal harvest` selects and justifies the archetype;
`/oc-signal build` scaffolds the full path through to a consumer stub.

| Harvester archetype | When to pick it | Example |
|---|---|---|
| In-process emit | you own the code path | analytics SDK call at the event site |
| Sidecar / worker container | heavy transform, out-of-band | a consumer container off a queue |
| CI / scheduled job | batch, periodic recompute | nightly cron recomputing a cohort metric |
| Endpoint / webhook pull | data lives in a 3rd-party API | pull Stripe / CRM, or receive a webhook |
| Log / trace scrape | you can't change the source | parse structured logs |

The harvester is a **choice, not a default** — pick to fit the source, and record the
choice in `skill_state.signals[].harvester_type`. Beyond the harvester, the Builder
produces:

- The **middleware / transform** — clean, dedupe, enrich, aggregate; with **idempotency**
  (re-ingesting the same event must not double-count) and **late-data handling** (an event
  that arrives for yesterday's window must reconcile, not silently drop).
- The **store** — events table / warehouse / time-series. Signal Forge **defers the
  platform choice to `oc-stack-forge`** and consumes that decision; it does not pick the
  warehouse.
- A **consumer stub** — the query or endpoint that `oc-dash-forge` (or an app) will read.
  The stub is the stable read contract the wire phase later hardens.

The five archetypes are tabulated above; idempotency keys, late-data windows, and
sampling correction are covered in the middleware/transform bullet below.

### Phase 3 — Evaluator (`/oc-signal verify`) — the signature gate

The skeptical pass. The Evaluator's job is to **disprove the number**, graded on four
axes:

| Axis | What it catches |
|---|---|
| **Answers-the-question** | proxy-metric drift — e.g. "active users" built as raw page-loads when the question was about *engaged* users. The most common silent failure, and the reason `frame` is mandatory. |
| **Correctness** | reconcile against an **independent ground truth** — a hand-written SQL count, a known reference period, a back-of-envelope. Distribution sanity: no impossible values, expected cardinality, no silent zeros. |
| **Robustness** | double-count, bot / replay, timezone, identity-stitch, late-arriving, sampling-bias — tested, not assumed away. |
| **Wired** | the signal actually reaches its consumer and the read contract is stable. Freshness is *defined* here as `freshness_sla`, then **enforced in prod by `oc-monitoring-ops`** — see Boundaries. |

The correctness check is non-negotiable: the Evaluator writes an **independent** query
against the source of truth and reconciles the pipeline's output against it. A match
within tolerance (`matched hand SQL ±0`, or a stated drift budget) is recorded in
`skill_state.signals[].ground_truth_check`. A pipeline that produces a number but can't
be reconciled is a FAIL regardless of how clean the code is.

**FAIL → Builder fixes → re-verify**, same loop until all four axes pass. A FAIL names
the failing axis explicitly so the Builder knows what to fix and the PM ticket (below)
records it.

### Phase 4 — Wire (`/oc-signal wire`)

Hand the **validated** signal to its consumer. This chains to `oc-dash-forge` for
rendering, or `oc-api-dev` if the metric is exposed as a first-party endpoint. Wiring
an *unverified* signal is forbidden — `verify` PASS is the precondition. The wire phase
also hands the signal's `freshness_sla` to `oc-monitoring-ops` so staleness gets a prod
alarm (Signal Forge owns the *contract*; monitoring-ops owns the *alert*).

---

## Signature artifact — the signal catalog (`/oc-signal catalog`)

A living registry — `signals/catalog.md` plus `skill_state.signals[]` — recording every
metric with its **question**, definition, harvester type, source, consumer, freshness
SLA, and last-verified date. This is the antidote to metric sprawl: it makes *"which
*active users* is this?"* answerable, and it's where a future reader discovers that two
dashboards quietly disagree because they're reading two different definitions of the
same name.

`/oc-signal catalog` prints the registry and flags any signal whose `last_verified` is
older than its `freshness_sla` would imply, or whose consumer no longer reads it. A
signal that isn't in the catalog isn't done — definition ambiguity is the silent killer
of analytics trust.

---

## Boundaries — what oc-signal-forge does NOT own

| Concern | Owner |
|---|---|
| Pipeline usage metering (opt-in, local) | `oc-telemetry-ops` |
| Rendering the dashboard / charts | `oc-dash-forge` |
| Prod uptime / error / SLO observability | `oc-monitoring-ops` |
| **Alerting on signal staleness in prod** | `oc-monitoring-ops` — it has a first-class *Data-freshness* SLI + the v1.6 eval-drift template. signal-forge **defines** `freshness_sla`; monitoring-ops **enforces** it. |
| LLM spend attribution specifically | `oc-cost-ops` |
| Where the warehouse / store lives | `oc-stack-forge` (signal-forge consumes the decision) |

The cleanest way to keep the seam: Signal Forge produces a *trustworthy number with a
stable read contract*. The moment that number is being **drawn** (dash-forge),
**watched in prod** (monitoring-ops), or **stored on a platform that has to be chosen**
(stack-forge), it has crossed out of this skill.

---

## Cross-skill wiring

| Reads from | Why |
|---|---|
| `oc-app-architect` (`08-analytics.md`) | the analytics *plan*; signal-forge *executes* it |
| `oc-stack-forge` | store / warehouse / time-series choice |
| `oc-api-dev` | if the metric is exposed via a first-party endpoint |

| Chains to | Why |
|---|---|
| `oc-dash-forge` | render the validated signal |
| `oc-monitoring-ops` | hand off each signal's `freshness_sla` so monitoring-ops enforces it via its Data-freshness SLI + AI-app eval-drift template (signal-forge owns the *contract*, monitoring-ops owns the *alert*) |
| `oc-api-dev` | publish the metric as an endpoint |

> **Resolves an existing seam:** `oc-app-architect`'s Phase-2 spec set already contains
> `08-analytics.md`. Today that doc is a plan with no executor. In 1.7, app-architect's
> Phase 2 chains to `oc-signal-forge` when the analytics doc warrants real
> instrumentation — the plan finally has a skill that builds it.

---

## PM-Tool MCP Integration

Like its neighbour `oc-dash-forge`, Signal Forge posts to a linked ticket when one is in
context (e.g. `/oc-signal --ticket TICKET-1234`). It defers the runtime contract (tool
names, retry / backoff, idempotency markers, `pm_deferred_actions[]`) to
`oc-integrations-engineer/references/pm-mcp-protocol.md` and only shapes:

- **Signal spec posted** (Designer) → a comment carrying the question + the metric
  definition, marker `<!-- opchain:oc-signal-forge:signal-spec:<signal-id> -->`.
- **Evaluator verdict** (verify) → a comment with the PASS / FAIL + the ground-truth
  reconciliation result, marker `<!-- opchain:oc-signal-forge:verify:<signal-id> -->`;
  a FAIL leaves the ticket open with the failing axis named.
- Records comment ids in `skill_state.pm.signal_comments[]`. No ticket in context → no
  PM write (operates as signals-only).

---

## Checkpoint

`{project-dir}/.checkpoints/oc-signal-forge.checkpoint.json`. The `progress_table` is the
canonical array-of-objects shape (`{id, label, status}`); the signal catalog lives in
`skill_state.signals[]` and on disk at `signals/catalog.md`.

```jsonc
"progress_table": [
  { "id": "frame",        "label": "Frame the question",        "status": "not_started" },
  { "id": "design",       "label": "Signal spec (Designer)",    "status": "not_started" },
  { "id": "design-gate",  "label": "★ Spec approval",           "status": "not_started" },
  { "id": "harvest",      "label": "Harvester selection",       "status": "not_started" },
  { "id": "build",        "label": "Build pipeline (Builder)",  "status": "not_started" },
  { "id": "verify",       "label": "Evaluator gate",            "status": "not_started" },
  { "id": "verify-gate",  "label": "★ Correctness PASS",        "status": "not_started" },
  { "id": "wire",         "label": "Wire to consumer",          "status": "not_started" }
]
```

```jsonc
"skill_state": {
  "signals": [
    {
      "id": "weekly-active-teams",
      "question": "Are teams coming back week over week?",
      "definition": "distinct team_id with >=1 qualifying action / ISO week",
      "harvester_type": "scheduled-job",
      "store": "warehouse.fact_actions",
      "consumer": "oc-dash-forge:exec/retention",
      "freshness_sla": "24h",
      "status": "verified",
      "last_verified": "2026-07-xxTxx:xxZ",
      "ground_truth_check": "matched hand SQL ±0"
    }
  ]
}
```

### When to write

| Event | What to save |
|---|---|
| Question framed | `signals[].question` + the decision it informs |
| Spec approved | `signals[].definition`, `grain`, `harvester_type` (planned), `★ design-gate` |
| Harvester chosen | `signals[].harvester_type` + the rationale |
| Pipeline built | `signals[].store`, `consumer` stub, `freshness_sla` |
| Evaluator verdict | `signals[].status`, `ground_truth_check`, `last_verified`, `★ verify-gate` |
| Wired | `signals[].consumer` resolved + freshness handoff to monitoring-ops |

---

## references/

*Planned companion docs for this skill — not yet written.*

- `signal-design.md` — metric-definition discipline, the proxy-metric traps, grain & identity.
- `harvester-patterns.md` — the 5 archetypes, idempotency, late-data, sampling.
- `signal-verification.md` — ground-truth reconciliation, distribution checks, the answers-the-question rubric.

---

## Principles

1. **A metric without a question is noise.** Frame first — the decision the number
   informs is the anchor everything else is graded against.
2. **The Evaluator's job is to disprove the number.** A skeptical 5/10 first pass is
   fine; a confirmation-biased 10/10 is a failure of the gate.
3. **Reconcile against an independent truth.** A pipeline that runs is not a pipeline
   that's right — match it to a hand-written count or a known reference period.
4. **The harvester is a choice, not a default.** Container vs CI vs pull vs scrape —
   pick to fit the source, and justify it in the catalog.
5. **Catalog every signal.** Definition ambiguity is the silent killer of analytics
   trust; an uncatalogued signal isn't done.
