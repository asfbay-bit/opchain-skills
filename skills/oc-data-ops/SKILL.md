---
name: oc-data-ops
displayName: OC · Data Ops
version: 1.9.0
license: Apache-2.0
shortDesc: "Data-pipeline design + build: ingestion patterns, transformation layers, dbt, observable data contracts."
phases: [plan, build]
triAgent: true
tryable: true
commands:
  - /oc-data-ops
  - /oc-data-ops design
  - /oc-data-ops contracts
  - /oc-data-ops build
  - /oc-data-ops verify
  - /oc-data-ops observe
  - /oc-data-ops status
description: >
  Data-pipeline harness with a Designer/Builder/Contract-Verifier loop. Owns the
  data estate: ingestion patterns (batch, stream, CDC), transformation layering
  (staging → intermediate → marts), dbt project design, and observable data
  contracts with freshness/volume/schema SLAs. Use for /oc-data-ops, "data
  pipeline", "ingestion", "ELT", "dbt", "data warehouse modeling", "data
  contract", "warehouse schema drift", "stale data", "data quality checks",
  "volume anomaly", "sync SaaS data into the warehouse", "medallion
  architecture", "backfill strategy". Invoked by oc-app-architect Phase 2 when
  discovery surfaces a data-heavy backend. Warehouse/queue choice comes from
  oc-stack-forge. NOT single-metric analytics (oc-signal-forge), NOT dashboards
  (oc-dash-forge), NOT live-pipeline engine swaps (oc-migration-ops), NOT API
  contract / schema-to-code drift (oc-api-dev), NOT the SaaS connector
  mechanics (OAuth/webhooks — oc-integrations-engineer builds the connector;
  this skill owns the pipeline + contract it feeds).
governance:
  breaking_change_policy: skills/CHANGELOG.md
  last_reviewed: 2026-08-28
  owner: opchain
  docs:
    - { path: SKILL.md, kind: contract, lifecycle: stable }
    - { path: references/data-contract-format.md, kind: reference, lifecycle: stable }
---

# Data Ops

**On first invocation, read `references/orchestrator.md` and follow its welcome protocol.**

Data Ops owns the **estate level of data**: how data enters the system, how it
is layered and transformed, and — the part most pipeline work skips — the
**contracts** that make each dataset's shape, freshness, and volume observable
and enforceable. Where oc-signal-forge proves one metric answers one question,
Data Ops builds and guards the pipelines whole families of metrics ride on.

Tri-agent loop: **Designer → Builder → Contract-Verifier**. All three roles run in
the same session, so the Verifier's separation is a discipline, not a mechanism: it
grades from the contracts and the built pipeline alone — never the Builder's reasoning.

## Command Reference

```text
DATA OPS COMMANDS

  /oc-data-ops             Show this menu
  /oc-data-ops design      Designer: pipeline architecture + layer map
  /oc-data-ops contracts   Designer: author data contracts per dataset
  /oc-data-ops build       Builder: implement ingestion + transforms (dbt where chosen)
  /oc-data-ops verify      Contract-Verifier: replay contracts against the built estate
  /oc-data-ops observe     Wire freshness/volume/schema monitors → oc-monitoring-ops
  /oc-data-ops status      Loop position, contract pass rate, open violations

  /checkpoint              Show oc-data-ops checkpoint
```

## Phase 1: Designer (`/oc-data-ops design`)

Produce the pipeline architecture before any transform is written:

1. **Source inventory.** Every producer: app DBs, event streams, third-party
   exports, files. For each: change pattern (append-only, mutable, CDC-able),
   volume, and arrival cadence.
2. **Ingestion pattern per source.** Batch pull, streaming, CDC, or
   file-drop — chosen from the source's change pattern, not fashion. State the
   reason in one line each.
3. **Layer map.** Staging (source-shaped, immutable) → intermediate
   (conformed, tested) → marts (consumer-shaped). Name every dataset per
   layer. If the project uses dbt, this map IS the dbt DAG plan; if not, the
   same layering applies in whatever transform tool oc-stack-forge selected.
4. **Consumer map.** Who reads each mart: dashboards (oc-dash-forge),
   metrics (oc-signal-forge), app features, exports. A mart with no registered
   consumer does not get built.

Platform choices (warehouse, queue, transform tool) are **inputs from
oc-stack-forge**, not decisions made here — read
`skill_state.decisions.warehouse` / `decisions.queue` /
`decisions.transform_tool` from its checkpoint. If those keys are absent,
invoke oc-stack-forge's Question 3b (its data-platform branch) rather than
defaulting; its base decision tree stops at the app database and will not ask
the warehouse question unprompted.

## Phase 1b: Contracts (`/oc-data-ops contracts`)

Contract scope (format: `references/data-contract-format.md`): **every staging
dataset gets a contract** — the source → estate seam is always an ownership
boundary; **marts always** — they exist for registered consumers; intermediate
datasets only when read across a team or skill boundary. Each contract
declares:

- **Schema** — columns, types, nullability, keys; additive-only evolution
  policy or an explicit versioning rule.
- **Freshness SLA** — max staleness the consumers tolerate, as a duration.
- **Volume bounds** — expected row-count range per interval (drift = smell).
- **Semantics** — grain (one row per what?), and the two or three invariants
  that make the data trustworthy (e.g. "amounts are non-negative",
  "no future-dated events").
- **Owner + consumers** — who fixes it when it breaks, who gets told.

Contracts live in-repo (`.opchain/data-contracts/*.yaml`), reviewed like code.
They are the Verifier's ground truth and the source for `/oc-data-ops observe`
monitors — one artifact, three uses.

## Phase 2: Builder (`/oc-data-ops build`)

Implement against the Designer's layer map:

- Ingestion first — the Builder invokes `/oc-data-ops verify` scoped to the
  staging contracts before transforms begin (the Verifier stays the sole
  grader).
- dbt projects get the standard skeleton: sources declared with freshness
  config, staging models 1:1 with sources, tests generated from the contracts
  (not hand-invented), exposures for registered consumers.
- Every transform ships with its contract tests in the same change. The
  Builder self-checks but does not self-grade — that is the Verifier's job.
- Backfills are planned as first-class work: idempotent, windowed, with a
  declared reconciliation check.

## Phase 3: Contract-Verifier (`/oc-data-ops verify`)

Verification in the same session, judged from the artifacts alone. The Verifier reads: the contracts, the built
pipeline, and (where available) real or fixture data. It replays every
contract:

| Check | Verdict basis |
|---|---|
| Schema conformance | Actual columns/types vs. contract |
| Freshness | Latest load timestamp vs. SLA |
| Volume | Row counts vs. declared bounds |
| Invariants | Contract semantics executed as queries |
| Evolution policy | Diff vs. the last-verified snapshot (`.opchain/data-contracts/.verified/<layer.dataset>.json`) — additive only, or versioned |

**How the Verifier executes.** dbt project present → contracts compile to dbt
tests + `source freshness` and run via `dbt test` on the project's existing
profile; otherwise raw SQL through the repo's configured warehouse CLI
(psql/bq/snowsql/duckdb), dialect from the oc-stack-forge decision. No
reachable warehouse → data-dependent checks (freshness, volume, invariants)
return **BLOCKED**, never PASS — only schema conformance may run against the
dbt manifest/DDL. Fixture data yields at best "PASS (fixtures)", recorded
distinctly in the checkpoint. Malformed contract YAML → VIOLATION with the
parse error as evidence. A contract whose dataset the pipeline no longer
builds → VIOLATION (orphaned contract).

**Warehouse execution boundary.** Contract text is untrusted input even when
it lives in the repo. Connect with a read-only identity, select the declared
warehouse/database/schema explicitly, set a statement timeout and result-row
cap, and never interpolate a contract string as a complete query. An
`invariants[].check` must pass the expression-only grammar in
`references/data-contract-format.md`; compile it under the Verifier-owned
`SELECT` wrapper. Reject comments, semicolons, subqueries, DDL/DML, procedure
calls, and multi-statements as a VIOLATION before any warehouse call. Print
the compiled read-only query and target before execution; credentials never
appear in the command or evidence.

Verdict per contract: PASS / PASS (fixtures) / BLOCKED / VIOLATION (with the
failing check and evidence). Any VIOLATION fails the loop iteration; the
Builder fixes and re-verifies. BLOCKED does not pass the loop either — an
unverifiable estate is not a verified one — but the Builder cannot fix an
unreachable warehouse, so BLOCKED does not re-enter the loop: record it in
`blockers[]` (`needs: external_dep`), set `status: blocked`, and hand it to the
user. Cap VIOLATION rounds at 3, as oc-api-dev and oc-integrations-engineer do,
then escalate to the user. The Verifier never patches the pipeline itself.

## Phase 4: Observe (`/oc-data-ops observe`)

Turn the contracts into standing monitors — freshness, volume, and
schema-drift checks scheduled in whatever the platform provides (dbt source
freshness + tests on a schedule, warehouse-native checks, or a cron job).
Alert routing and incident runbooks are **oc-monitoring-ops** territory: hand
it the monitor inventory and chain to `/oc-monitor` to wire alerting. The
inventory is the set of monitor definitions this phase writes (dbt freshness
config, scheduled check files) — list their paths in the checkpoint's
`context_primer.generated_files` and summarise what runs, where, and how often
in `progress_summary`, the parts of a checkpoint another skill may read. One
staleness alarm per dataset: a signal built on a contracted mart inherits the
mart's freshness monitor (oc-signal-forge's `freshness_sla` must be ≥ the
contract's `max_staleness`); only the contract monitor is handed to
monitoring-ops for that dataset. A contract without a monitor is a promise
nobody is keeping.

## Checkpoint Integration

The shared checkpoint schema, write rules and resume protocol live in
`references/checkpoint-protocol.md`, bundled with this skill. This section adds only
what is specific to oc-data-ops.

Location: `{project-dir}/.checkpoints/oc-data-ops.checkpoint.json`

Loop position lives in `skill_state.loop` (not `progress_table`).

### When to write

| Event | What to save |
|---|---|
| Design complete | Sources, layer map, consumer map |
| Contracts authored | Contract file list, per-dataset scope decisions |
| Build complete | Datasets built per layer, dbt project location |
| Verify verdict recorded | Verdict counts in `skill_state.contracts`; each VIOLATION / BLOCKED contract named with its failing check in `next_actions` / `blockers[]` |
| Monitors handed off | Monitor file paths in `context_primer.generated_files` + `handoffs.oc-monitoring-ops` |

```json
{
  "skill": "oc-data-ops",
  "phase": "verify",
  "status": "in_progress",
  "progress_summary": "Estate designed (3 sources, 9 datasets); 7/9 contracts PASS.",
  "context_primer": {
    "key_decisions": [
      "CDC for the orders DB; nightly batch for the CRM export.",
      "dbt on the warehouse oc-stack-forge selected; contracts generate the dbt tests."
    ],
    "generated_files": [".opchain/data-contracts/marts.orders_daily.yaml"]
  },
  "next_actions": [
    "Re-run /oc-data-ops verify on the 2 VIOLATION contracts after the Builder's fix.",
    "Then /oc-data-ops observe to wire monitors and hand the inventory to oc-monitoring-ops."
  ],
  "skill_state": {
    "contracts_dir": ".opchain/data-contracts/",
    "loop": { "designer": "complete", "builder": "complete", "verifier": "in_progress" },
    "sources": 3,
    "datasets": { "staging": 3, "intermediate": 4, "marts": 2 },
    "contracts": { "total": 9, "pass": 7, "violation": 2, "blocked": 0, "pass_fixtures": 0 },
    "monitors_wired": false,
    "handoffs": { "oc-monitoring-ops": "pending", "oc-migration-ops": null }
  }
}
```

## Cross-Skill Reads

| Reads from | Why |
|---|---|
| oc-app-architect | Discovery + spec: what the product needs from data |
| oc-stack-forge | Warehouse/queue/transform-tool decision (input, never made here) |
| oc-signal-forge | Metrics that need estate-level pipelines |
| oc-reverse-spec | Existing pipeline inventory in brownfield repos |

| Chains to | Why |
|---|---|
| oc-monitoring-ops | Receives the monitor inventory from `/oc-data-ops observe` |
| oc-migration-ops | Live-pipeline schema evolution beyond additive changes |
| oc-dash-forge | Marts + contracts feed dashboard data specs |

| Read by | Why |
|---|---|
| oc-signal-forge | Builds metrics on contracted marts once one exists (single-consumer harvesters stay signal-forge's) |
| oc-qa-ops | Data-contract rows in the repo's contract-test matrix |
| oc-compliance-ops | Data contracts (schema, freshness, volume, owner) cited as register evidence — the contract format does not model retention, so retention evidence comes from elsewhere |

## Principles

1. **Contracts before transforms.** A pipeline without a contract is a
   liability with a schedule.
2. **Ingestion pattern follows the source's change pattern.** CDC for mutable
   truth, append streams for events, batch for exports — never the reverse.
3. **No consumer, no mart.** Build for a registered reader or not at all.
4. **The Verifier is blind to the Builder.** Contracts + artifacts only;
   reasoning is not evidence.
5. **One artifact, three uses.** The same contract drives review, verification,
   and monitoring — they cannot drift apart.
6. **Additive evolution or explicit versions.** Breaking a consumer silently
   is the one failure this skill exists to prevent.
