# opchain skills — CHANGELOG

The breaking-change + release log for the opchain skill set. Every skill's
`governance.breaking_change_policy` points here. Skills are versioned in
**lockstep** — one minor bump moves the whole catalog — so entries are per
release, not per skill.

Versioning: additive capability → MINOR. A change that alters a documented
contract another skill depends on → called out as **BREAKING**. The on-disk
checkpoint `protocol_version` is tracked separately (see
`oc-checkpoint-protocol/SKILL.md`).

## [1.7.0] — 2026-06-26 — "Seams & Signals"

Seams between systems and the signals that prove they work. The catalog goes
from 24 → **27 skills**.

### Added
- **oc-signal-forge** (`/oc-signal`) — turns a *question* into a trustworthy
  metric: designs the instrumentation, builds the harvester + transform, and
  adversarially proves the signal answers the question before wiring it to a
  surface. The product-analytics backend none of the instrumentation skills
  owned (oc-telemetry-ops meters the pipeline; oc-dash-forge renders;
  oc-monitoring-ops watches prod). Designer/Builder/Evaluator loop.
- **oc-modularize-ops** (`/oc-modularize`) — decomposes a live monolith with
  **provably zero functionality or data loss**, using golden fixtures captured
  from real traffic as the equivalence oracle; refuses when modularization
  isn't warranted, then hands the bulk code-move + live cutover to
  oc-migration-ops's Structural type.
- **oc-fleet-ops** (`/oc-fleet`) — provisions, deploys, and operates
  one-or-more containers across self-managed environments (k8s/Nomad/Compose,
  IaC, on-prem VMs, GCE) — the bare-metal/self-managed territory oc-deploy-ops
  routes away. Mandatory dry-run/plan gate before any IaC apply.

### Changed
- **oc-deploy-ops** — Platform Matrix "What's NOT first-class" re-point: the
  bare-metal / VPS / multi-node row now routes to **oc-fleet-ops** (was the
  oc-migration-ops default pointer). deploy-ops and fleet-ops are peers —
  managed app → deploy-ops; self-managed fleet → fleet-ops.
- **oc-dash-forge** + **oc-monitoring-ops** — gain oc-signal-forge as the
  upstream that feeds validated metrics (dash-forge renders them;
  monitoring-ops enforces each signal's freshness SLA).
- Lockstep bump: all 27 skills → `1.7.0`.

### Not breaking
- No documented cross-skill contract was removed. The three new skills are
  additive; the oc-deploy-ops re-point only changes where bare-metal *routes*,
  a surface that was a default pointer, not a guarantee.

## [1.6.0] — 2026-06-25 — "The instrumented pipeline"

Cost + telemetry instrumentation. The catalog goes from 22 → **24 skills**.

### Added
- **oc-cost-ops** (`/oc-cost`) — LLM cost attribution per skill phase, budget
  gates in the checkpoint, model-tier routing recommendations, and a
  cost-regression gate that runs beside oc-prompt-ops's score gate.
- **oc-telemetry-ops** (`/oc-telemetry`) — opt-in, local-first usage metering to
  `.checkpoints/usage.sqlite`, with anonymized aggregates for the public
  `/dashboard`. Default OFF; content-free by schema.
- Checkpoint protocol **wire 1.1** — additive optional fields `cost`,
  `eval_scores`, `telemetry_handle`. Both `"1.0"` and `"1.1"` validate;
  oc-migration-ops sweeps existing checkpoints. Not breaking — old checkpoints
  stay valid and the fields are optional.
- oc-bug-check + oc-code-auditor now emit `eval_scores` against a stable rubric
  (binary verdict / letter grade unchanged — the score is additive, for trend).
- oc-monitoring-ops AI-app monitoring template (token rate, cost rate, eval
  drift, hallucination/refusal flags).
- oc-orchestrator `/oc-ops next` factors cost/budget (over-budget checkpoints
  sort first within a priority rank).

### Changed
- oc-prompt-ops: the `cost_per_eval` placeholder is now wired to oc-cost-ops
  (measured, not estimated) plus `budget_per_eval` / `regression_pct` config.
- Lockstep bump: all 24 skills → `1.6.0`.

### Not breaking
- No documented cross-skill contract changed. The wire 1.1 fields are optional
  and backward compatible; every prior checkpoint validates unchanged.

## [1.5.0] — 2026-06-22 — "Build the AI app"

Four AI-native skills added: **oc-claude-api**, **oc-rag-forge**,
**oc-agent-forge**, **oc-prompt-ops**. oc-stack-forge gained vector-DB packs;
oc-app-architect gained an AI-app `/oc-discover` branch; oc-code-auditor gained
an AI-safety rule pack. Lockstep bump: all 22 skills → `1.5.0`.

## [1.4.x] — 2026-06 — pack registry + governance + multi-mobile

oc-stack-forge pack registry (languages, frameworks, mobile, hosting), the
`governance:` frontmatter rollout, and v1.4.3 Codex / any-MCP-agent support.

## [1.3.0] — 2026-05 — PM-MCP runtime + release-ops

PM-tool MCP runtime across five skills, the platform menu
(Cloudflare/Django/Rails/Go/Rust), and **oc-release-ops** — opchain's own
release cadence, dogfooded.
