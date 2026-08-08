# opchain skills — CHANGELOG

The breaking-change + release log for the opchain skill set. Every skill's
`governance.breaking_change_policy` points here. Skills are versioned in
**lockstep** — one minor bump moves the whole catalog — so entries are per
release, not per skill.

Versioning: additive capability → MINOR. A change that alters a documented
contract another skill depends on → called out as **BREAKING**. The on-disk
checkpoint `protocol_version` is tracked separately (see
`oc-checkpoint-protocol/SKILL.md`).

## [1.8.2] — 2026-07-24 — "Enforcement that ships"

The catalog stops describing gates it cannot enforce and starts shipping one that
works. opchain now installs as a Claude Code **plugin** carrying executable hooks —
previously the bundle was markdown only, so every "auto-invokes" claim in it was
unenforceable everywhere except the opchain.dev repo itself.

### Added
- **Claude Code plugin** (`/plugin marketplace add asfbay-bit/opchain-skills` →
  `/plugin install opchain`). Ships three hooks and eight registered slash commands
  alongside the 29 skills. The skills-only zip is unchanged and still supported.
  - **Commit gate** (`PreToolUse`) — blocks `git commit` unless oc-bug-check
    recorded a PASS bound to the full working-tree state. Fails closed.
  - **Session state** (`SessionStart`) — surfaces stale checkpoints, open findings,
    and the next action, computed from `.checkpoints/` rather than asked for.
  - **Next-skill suggestion** (`Stop`) — when a skill finishes, names the one to
    invoke next. Fires on checkpoint *transitions*, not standing state; silent when
    nothing changed. Mute with `OPCHAIN_SUGGEST=0`.

### Fixed
- **oc-bug-check** — added Swift stack support and a terminal `UNSUPPORTED` verdict
  distinct from PASS; an unrecognized stack previously reported green on code it
  never read. Secret-detection greps were scoped to TypeScript/JS includes and so
  matched nothing in Swift, Kotlin, Ruby or Java — now unscoped, plus JWT (`eyJ…`)
  and `sk_test_` patterns.
- **oc-git-ops** — removed a paragraph claiming a `PreToolUse` hook enforced the
  pre-commit gate. That hook existed in exactly one repository; the claim shipped to
  everyone. The plugin now makes it true where installed, and the text says so.
- **Checkpoint staleness detection** — `doctor`/`status` only flagged
  `in_progress` checkpoints, so a `complete` one asserting a long-shipped release
  drew no warning for 30 days. Now status-aware across `in_progress`, `complete`,
  and `blocked`.
- **Checkpoint next-action drift** — the highest-priority ranks (`user_decision`
  blockers, `failed`/`blocked` status) bypassed the stale-work filter entirely,
  which is how `next` recommended tagging a release that had shipped twelve days
  earlier. Both now route through the filter.

### Changed
- **Honesty pass, all 29 skills + the shared `orchestrator.md`.** Every
  `Auto-invokes X` and `Trigger liberally` claim removed from frontmatter and the
  bundled protocol doc. Measured across 87 transcripts: zero of 54 skill
  invocations were autonomous, so those phrases described a mechanism that has
  never once fired. Replaced with "chains to (when you invoke it)" and an explicit
  note that cross-skill edges need enforcement outside the catalog.
- Lockstep patch bump: all 29 skills → `1.8.2`.

### Compatibility
- Back-compatible with v1.8.1. No checkpoint migration, no route/command removals.
  The plugin is an additive install channel; existing zip installs keep working
  exactly as before, minus the enforcement they never actually had.

## [1.8.1] — 2026-07-12 — "Checkpoint truth without the CLI"

Consumer repos no longer lose trustworthy project status merely because they do not
carry opchain.dev's optional checkpoint CLI.

### Fixed
- **oc-orchestrator** — treats direct `.checkpoints/*.checkpoint.json` reads as the
  authoritative fallback and no longer recommends a repo-local scaffolder where it
  cannot exist.
- **oc-checkpoint-protocol** — explicitly requires agents to corroborate directly
  read checkpoint state against specs, git, tests, and release artifacts; missing CLI
  output is neither a blocker nor product progress.
- Lockstep patch bump: all 29 skills → `1.8.1`.

### Compatibility
- Back-compatible with v1.8.0. Existing checkpoint files require no migration.

## [1.8.0] — 2026-07-04 — "The quality-gate rail"

Every PR now rides a documentation + hygiene rail before it opens. The catalog
goes from 27 → **29 skills**.

### Added
- **oc-docs-forge** (`/oc-docs`) — documentation generator for every PR: the PR
  body's required `## Documentation` section (long packets overflow to a PR
  comment with marker `opchain:oc-docs-forge:pr-docs`), README/catalog/product-doc
  upkeep, changelog + ADR notes, and freshness/drift review (`/oc-docs upkeep`).
  Auto-invoked by oc-git-ops before PR creation and by release flows before
  release PRs. "No docs needed" is valid only with evidence — silence is not a pass.
- **oc-repo-ops** (`/oc-repo`) — repository hygiene and PR readiness gate:
  verifies the docs packet exists and is current, generated files + catalogs are
  in sync with source, git state is clean, and `.gitignore` policy holds. Fails
  closed and blocks the PR. Required every-PR order: oc-docs-forge → oc-repo-ops
  → oc-bug-check (already run at commit) → PR.

### Changed
- **oc-git-ops** — gains the pre-PR gate: auto-invokes oc-docs-forge then
  oc-repo-ops before every PR (mirroring the oc-bug-check pre-commit gate); the
  PR template gains a `## Documentation` section sourced from the docs-forge
  checkpoint; `.checkpoints/` is no longer gitignored by default (the checkpoint
  protocol tracks it unless the project opts out — oc-repo-ops enforces this).
- **oc-release-ops** — `/oc-release ship` invokes oc-docs-forge for the release
  docs packet before handing to oc-git-ops; `/oc-release verify` gains
  docs-packet and repo-readiness gate rows.
- **orchestrator.md** — pipeline map, upstream/downstream map, handoff points,
  routing tables, and ecosystem bullets gain the pre-PR gate rail (re-synced
  into every skill's bundled copy).
- Lockstep bump: all 29 skills → `1.8.0`.

### Not breaking
- Both new skills are additive gates. The `.checkpoints/` gitignore default in
  oc-git-ops flips to match the checkpoint protocol's documented tracking policy —
  a doc-consistency fix, not a contract change (the protocol was already the
  source of truth).

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
