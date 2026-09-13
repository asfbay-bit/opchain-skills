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
- Have code ready to ship? → Start with `/oc-git-sync` then `/oc-deploy staging`
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
                      │     └── chains to oc-dash-forge on data-heavy screens
                      ├── Phase 6: build loop (Generator → Evaluator)
                      │     └── the build loop invokes oc-ux-engineer on UI sprints (`/oc-uxe attach`)
                      └── Phase 7: launch handoff

oc-ux-engineer ──► oc-dash-forge on data-heavy screens

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

assurance & governed delivery (v1.9):
  oc-qa-ops ──► test-pyramid strategy → .opchain/qa.yaml (oc-bug-check reads budgets when present)
  oc-security-hardening ──► executes auditor findings → .opchain/hardening.yaml
                            (deploy audit gains a manifest-verify row when it exists)
  oc-compliance-ops ──► control register + evidence bundle at deploy
                        (activated by .opchain/compliance.yaml; inert without it)
  (oc-data-ops is the fourth v1.9 skill — it lives under cross-cutting below)

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
  oc-data-ops ──► runs when discovery surfaces a data-heavy backend (ingestion,
                  transformation layers, dbt, observable data contracts)

instrumentation (v1.6 "the instrumented pipeline"):
  oc-cost-ops ──► attributes LLM spend per phase, budget gates, model-tier routing
  oc-telemetry-ops ──► opt-in local usage metering → anonymized aggregate for /dashboard
```

### Upstream/Downstream Map

| Skill | Reads checkpoints from | Chains to (invoke actively) |
|---|---|---|
| **oc-orchestrator** | every skill (read-only, cross-project) | — (dispatches to any skill by intent) |
| **oc-checkpoint-protocol** | — (the schema itself; bundled into every skill as `references/checkpoint-protocol.md`) | — (not invoked directly) |
| **oc-app-architect** | oc-reverse-spec | oc-git-ops (after build), oc-deploy-ops (at launch) |
| **oc-stack-forge** | oc-app-architect (discovery context) | — (returns control to oc-app-architect); its decisions are read by, among others, oc-app-architect, oc-api-dev, oc-data-ops, oc-scale-ops, oc-security-hardening, oc-rag-forge, oc-signal-forge and oc-fleet-ops |
| **oc-ux-engineer** | oc-app-architect (design baseline) | oc-dash-forge (on data-heavy screens), otherwise returns control |
| **oc-dash-forge** | oc-ux-engineer (tokens + design spec), oc-app-architect (design phase, dashboard surface), oc-data-ops (contracted marts), oc-signal-forge (validated signal), oc-monitoring-ops (ops context, archetype pre-selected) | — (returns control to caller with design spec + prototype) |
| **oc-code-auditor** | oc-reverse-spec, oc-app-architect | oc-security-auditor (posture review above code-level findings), oc-deploy-ops (pre-deploy gate) |
| **oc-security-auditor** | oc-code-auditor (findings), oc-reverse-spec, oc-app-architect, oc-deploy-ops | oc-security-hardening (remediation handoff — `/oc-harden fix` per finding; `/oc-security compare` closes the loop), oc-deploy-ops (posture check before prod gate) |
| **oc-integrations-engineer** | oc-app-architect (integration spec) | oc-code-auditor (verify integration) |
| **oc-api-dev** | oc-app-architect (`02-architecture.md` API Design + Data Model sections), oc-stack-forge (typed pipeline), oc-reverse-spec (existing-endpoint inventory), oc-qa-ops (contract-test rows for the conformance suite) | oc-code-auditor (audits scaffolded handlers), oc-security-auditor (CORS/rate-limit posture), oc-monitoring-ops (SLO targets from the spec), oc-deploy-ops (hand-off; `/oc-api drift` is a recommended check, not a deploy gate) |
| **oc-migration-ops** | oc-app-architect (spec), oc-reverse-spec (current state), oc-modularize-ops (`modularization/module-map.json`), oc-data-ops (live schema evolution) | oc-deploy-ops (cutover), oc-monitoring-ops (verify post-migration), oc-app-architect (spec updates after an engine change) |
| **oc-git-ops** | oc-app-architect (sprint context), oc-bug-check (gate result), oc-docs-forge (PR docs packet), oc-repo-ops (PR readiness verdict) | oc-bug-check (pre-commit gate, chain), oc-docs-forge → oc-repo-ops (pre-PR gate, chain), oc-deploy-ops (post-push) |
| **oc-bug-check** | oc-qa-ops (`.opchain/qa.yaml` coverage budgets, when present), oc-code-auditor, oc-app-architect, oc-deploy-ops | — (invoked by oc-git-ops as the commit gate, or by oc-repo-ops on a stale verdict; returns PASS / FAIL / UNSUPPORTED to the caller — a bypass is a logged event; FAIL or UNSUPPORTED blocks the commit) |
| **oc-docs-forge** | oc-git-ops (PR trigger: branch, commit log, PR draft, linked ticket), oc-app-architect (feature scope), oc-reverse-spec (existing docs), oc-api-dev (API doc drift), oc-release-ops (release surfaces), oc-code-auditor / oc-bug-check (quality notes for PR docs), oc-compliance-ops (policy docs riding the PR packet) | oc-repo-ops (hands docs packet to the readiness gate), oc-git-ops (returns PR body fragment + optional marker comment) |
| **oc-repo-ops** | oc-docs-forge (docs packet), oc-git-ops (branch, base, PR draft), oc-bug-check (gate verdict), oc-release-ops (release PR surfaces), oc-checkpoint-protocol (tracking policy) | oc-docs-forge (on missing/stale docs packet), oc-bug-check (on missing/stale code gate), oc-git-ops (PASS → PR can open; FAIL blocks PR creation) |
| **oc-deploy-ops** | oc-code-auditor (audit grade), oc-security-auditor (posture), oc-git-ops (branch status), oc-security-hardening (manifest verify, when `.opchain/hardening.yaml` exists), oc-compliance-ops (evidence bundle, when `.opchain/compliance.yaml` exists) | oc-monitoring-ops (post-ship observability) |
| **oc-monitoring-ops** | oc-deploy-ops (what shipped, deploy tickets in `pm_refs`), oc-data-ops (monitor inventory from `observe`), oc-security-hardening (detection controls handed off), oc-signal-forge (`freshness_sla` per signal, handed over via `/oc-monitor alerts`), oc-api-dev (SLO targets from the spec), oc-security-auditor (detection requirements), oc-scale-ops (performance budgets) | oc-dash-forge (`/oc-monitor dashboard`); incidents loop back to oc-app-architect / oc-code-auditor as needed |
| **oc-release-ops** | every skill's `*.checkpoint.json` (what shipped per skill since last release), oc-app-architect (sprint outputs feed changelog draft), oc-git-ops (merged-PR list), oc-deploy-ops (last-shipped commit SHA) | oc-docs-forge (`/oc-docs pr` release packet), oc-git-ops (`/oc-git-sync` release PR, then `/oc-git-release` tag), oc-deploy-ops (`/oc-deploy staging` then `/oc-deploy prod`) |
| **oc-scale-ops** | oc-stack-forge (platform limits), oc-qa-ops (load plan → execution) | — (advisory, no chain) |
| **oc-qa-ops** | oc-app-architect (spec + punch list, Phase 6 contracts), oc-api-dev (API surface), oc-data-ops (data contracts), oc-bug-check (gate behavior + suite runtime), oc-scale-ops (platform limits shaping load scenarios), oc-code-auditor (findings + test-bootstrap output) | oc-scale-ops (load-plan execution), oc-api-dev (contract-test rows), oc-integrations-engineer (third-party contract rows), oc-bug-check (budgets consumed at the gate) |
| **oc-data-ops** | oc-app-architect (data-heavy discovery), oc-stack-forge (warehouse/queue choice), oc-signal-forge (metrics needing pipelines), oc-reverse-spec (existing pipeline inventory) | oc-monitoring-ops (monitor inventory from `observe`), oc-dash-forge (contracted marts), oc-migration-ops (live schema evolution) |
| **oc-compliance-ops** | oc-security-auditor (readiness gaps seed the register), oc-security-hardening (remediation status), oc-deploy-ops (deploy SHA for evidence), oc-data-ops (data-contract evidence), oc-monitoring-ops (audit-log artifacts) | oc-security-hardening (technical gaps → execution), oc-deploy-ops (evidence gate row), oc-release-ops (compliance delta), oc-docs-forge (policy docs in PR packet) |
| **oc-security-hardening** | oc-security-auditor (findings + tier), oc-code-auditor (infra-adjacent findings), oc-compliance-ops (chained control gaps), oc-stack-forge (platform idiom for config-as-code), oc-deploy-ops (gate chokepoint) | oc-deploy-ops (manifest gate row), oc-security-auditor (`/oc-security compare` after remediation), oc-monitoring-ops (detection controls handed off) |
| **oc-claude-api** | oc-app-architect (AI-app discovery, Phase 2), oc-stack-forge (the overall stack it sits inside) | oc-prompt-ops (`migrate` diffs wait on a no-regression eval), oc-git-ops (migration diff PR); its model routing is read by oc-agent-forge, oc-rag-forge and oc-cost-ops |
| **oc-agent-forge** | oc-app-architect (`02-architecture.md` agent requirement), oc-claude-api (model routing), oc-rag-forge (retrieval config, wired as a tool), oc-integrations-engineer and oc-api-dev (tool contracts) | oc-deploy-ops (frozen harness config + fixture suite, hand-off — no gate), oc-monitoring-ops (live task-success and tool-error drift), oc-scale-ops (fleet sizing) |
| **oc-rag-forge** | oc-app-architect (knowledge-base requirement), oc-stack-forge (`kind: vector-db` pack), oc-claude-api (generation model, context budget) | oc-prompt-ops (generation-prompt goldset), oc-agent-forge (frozen retrieval function wired as a tool), oc-deploy-ops (frozen retrieval config + ingestion pipeline, hand-off — no gate), oc-monitoring-ops (recall drift), oc-security-auditor (tenant isolation, PII in embeddings), oc-scale-ops (index and batch sizing) |
| **oc-prompt-ops** | oc-claude-api (pinned model), oc-app-architect (LLM features registered under `prompts/`), oc-cost-ops (`cost_per_eval`) | oc-claude-api (eval result on a model migration), oc-git-ops (prompt diff PR + scorecard), oc-deploy-ops (frozen prompt version; no deploy gate) |
| **oc-cost-ops** | oc-claude-api (price table), oc-prompt-ops (eval token counts), any skill (phase token counts) | oc-prompt-ops (`/oc-cost gate` beside `/oc-prompt regress`), oc-telemetry-ops (attributed cost to aggregate), oc-orchestrator (budget into `/oc-ops next`) |
| **oc-telemetry-ops** | oc-cost-ops (per-run cost), any skill (skill/phase usage) | the site `/dashboard` (anonymized aggregate, once an export loader exists) |
| **oc-signal-forge** | oc-app-architect's `08-analytics.md` (read when invoked manually; app-architect does not chain here), oc-stack-forge (store / warehouse choice), oc-api-dev (metrics exposed by an endpoint) | oc-dash-forge (renders the validated signal), oc-monitoring-ops (each signal's `freshness_sla`, via `/oc-monitor alerts`), oc-api-dev (metric endpoint), oc-data-ops (when the metric needs a pipeline) |
| **oc-modularize-ops** | oc-reverse-spec (module map), oc-app-architect (spec, data model), oc-code-auditor (coupling hotspots), oc-scale-ops (independent-scaling drivers) | oc-migration-ops (structural migration plan via `modularization/module-map.json`), oc-fleet-ops (deploys the extracted modules), oc-code-auditor (audits each module), oc-security-auditor (vets fixture capture, `/oc-security data-flow`), oc-git-ops (a commit per extraction) |
| **oc-fleet-ops** | oc-modularize-ops (`modularization/module-map.json`), oc-stack-forge (target platform), oc-scale-ops (replica and capacity targets), oc-app-architect (`07-devops.md`) | oc-monitoring-ops (fleet-wide observability, `/oc-monitor`), oc-git-ops (commits the IaC) |
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
| /oc-commit or /oc-git-sync starts | oc-git-ops | oc-bug-check | Invoke oc-bug-check; pass → proceed with commit; fail → block, surface report, offer `/oc-bugcheck fix`, or an explicit bypass (`/oc-bugcheck bypass` record + `OPCHAIN_BYPASS=1 git commit` / `--no-verify`); UNSUPPORTED blocks like FAIL |
| PR creation starts (/oc-pr, or /oc-git-sync reaches the PR step) | oc-git-ops | oc-docs-forge | Invoke `/oc-docs pr` to generate the PR documentation packet (`## Documentation` body fragment + optional marker comment) |
| Docs packet written or verified | oc-docs-forge | oc-repo-ops | Invoke `/oc-repo verify`; PASS → return control to oc-git-ops to open the PR; FAIL → block PR creation, surface blocking findings, offer `/oc-repo clean` |
| git-sync completes | oc-git-ops | oc-deploy-ops | Confirm with the user (a deploy is their call), then invoke oc-deploy-ops, run /oc-deploy audit then /oc-deploy staging |
| Launch phase starts | oc-app-architect | oc-code-auditor → oc-deploy-ops | Run /oc-audit pre-deploy first, then /oc-deploy staging |
| Existing codebase analyzed | oc-reverse-spec | oc-app-architect | Invoke oc-app-architect, copy oc-reverse-spec's specs to `spec/` and run `/oc-roadmap` (Phase 4 baseline) |
| Integration needed | oc-app-architect (Phase 2) | oc-integrations-engineer | Invoke oc-integrations-engineer for the specific service |
| First-party API surface in spec | oc-app-architect (Phase 2) | oc-api-dev | Invoke oc-api-dev `/oc-api design` to elaborate `02-architecture.md` API Design into an OpenAPI/GraphQL contract |
| Stack decision needed | oc-app-architect (Phase 2) | oc-stack-forge | Invoke from Phase 2 (a step you run, not an automatic trigger) |
| UI sprint detected | oc-app-architect (Phase 6) | oc-ux-engineer | Invoke the Design Evaluator as a build-loop step (not an automatic trigger) |
| Data-heavy screen flagged | oc-ux-engineer (Phase 1 intake) or oc-app-architect (Phase 3 design) | oc-dash-forge | Package tokens + design spec into oc-dash-forge context, invoke /oc-data-forge; hand the resulting spec + prototype back to the caller |
| Release boundary reached (user says "cut a release", "ship v1.3", "bump versions") | any skill | oc-release-ops | Invoke oc-release-ops `/oc-release plan` to propose the next semver and theme, then walk through `draft → bump → announce → ship` |
| `/oc-release ship` advances to PR | oc-release-ops | oc-docs-forge → oc-git-ops | Invoke oc-docs-forge `/oc-docs pr` for the release docs packet, then oc-git-ops `/oc-git-sync v<semver>` with the bump commit (the pre-PR gate runs as usual); oc-release-ops resumes after merge |
| Release PR merged | oc-release-ops | oc-git-ops | Invoke oc-git-ops `/oc-git-release <semver>` for the signed tag and its push; opchain's own deploy script (`npm run deploy`) refuses an untagged release |
| `/oc-release ship` advances to deploy | oc-release-ops | oc-deploy-ops | Invoke oc-deploy-ops `/oc-deploy staging` then `/oc-deploy prod` on user confirmation; oc-release-ops closes the release ticket on prod ship |
| Phase 2 reaches `06-testing.md` | oc-app-architect | oc-qa-ops | Invoke `/oc-qa pyramid`; its output IS 06-testing.md (a step you run, not an automatic trigger) |
| Data-heavy backend surfaced in discovery | oc-app-architect (Phase 2) | oc-data-ops | After oc-stack-forge, invoke `/oc-data-ops design` — the data branch, parallel to the AI-app branch |
| Metric needs a pipeline that doesn't exist | oc-signal-forge | oc-data-ops | Invoke `/oc-data-ops design`; the signal rides a contracted mart instead of a raw source |
| AI app surfaced in discovery | oc-app-architect (Phase 2) | oc-claude-api | After oc-stack-forge, invoke `/oc-claude-api` for model routing and caching; its model routing feeds the AI architecture spec and the AI skills below |
| Knowledge base, semantic search or cited answers in the spec | oc-app-architect (Phase 2) | oc-rag-forge | Invoke `/oc-rag` after oc-claude-api; hand the retrieval design back into the spec |
| Agent or multi-step autonomous work in the spec | oc-app-architect (Phase 2) | oc-agent-forge | Invoke `/oc-agent` after oc-claude-api; hand the topology and harness back into the spec |
| Prompts, goldsets or eval regressions in scope | oc-app-architect (Phase 2), oc-agent-forge, oc-rag-forge | oc-prompt-ops | Invoke `/oc-prompt goldset` to register the prompt with a goldset, then `/oc-prompt eval` to score it |
| Claude model migration diff ready | oc-claude-api (`/oc-claude-api migrate`) | oc-prompt-ops → oc-git-ops | Run `/oc-prompt drift` against the new model; no score regression → oc-git-ops opens the diff PR |
| Signal validated and wired | oc-signal-forge (`/oc-signal wire`) | oc-dash-forge, oc-monitoring-ops | Hand the signal to oc-dash-forge to render and its `freshness_sla` to oc-monitoring-ops via `/oc-monitor alerts` |
| Module extraction planned | oc-modularize-ops (`/oc-modularize plan`) | oc-migration-ops | Write `modularization/module-map.json`; invoke `/oc-migrate plan` for the structural move and live cutover |
| Extracted modules ready to run | oc-modularize-ops (`/oc-modularize verify`) | oc-fleet-ops | Invoke `/oc-fleet topology` with `modularization/module-map.json`, then `/oc-fleet deploy` |
| Fleet deployed | oc-fleet-ops (`/oc-fleet deploy`) | oc-monitoring-ops | Chain to oc-monitoring-ops (`/oc-monitor`) for fleet-wide observability |
| Security findings ready for remediation | oc-security-auditor | oc-security-hardening | Invoke `/oc-harden fix` per finding (or `/oc-harden baseline`); close the loop with `/oc-security compare` |
| `.opchain/hardening.yaml` exists at deploy | oc-deploy-ops | oc-security-hardening | Audit-gate row: replay the manifest (`/oc-harden verify`) at the deploying SHA |
| `.opchain/compliance.yaml` exists at deploy | oc-deploy-ops | oc-compliance-ops | Audit-gate row: `/oc-comply evidence` writes the bundle for the deploying SHA |

### How to Invoke Another Skill

1. State what you're doing: "Now using [skill-name] to [action]."
2. Read that skill's SKILL.md (it's in the available skills list). If that skill is not
   in the available skills list, do the part of the handoff you can inline, tell the
   user which skill is missing, and record it in `next_actions`.
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
| "Cut a release" / "Ship v1.3" / "Bump versions" / "Draft the changelog" | oc-release-ops | /oc-release plan |
| "Tag the release" | oc-git-ops | /oc-git-release |
| "Threat model this app" / "Is this secure enough" / "Security review" | oc-security-auditor | /oc-security posture |
| "Set up monitoring" / "Error tracking" | oc-monitoring-ops | /oc-monitor setup |
| "Is prod healthy" | oc-monitoring-ops | /oc-monitor health |
| "Migrate from X to Y" / "Upgrade to" / "Swap auth provider" | oc-migration-ops | /oc-migrate assess |
| "Design a dashboard" / "KPI dashboard" / "Analytics UI" | oc-dash-forge | /oc-data-forge |
| "What's the status" / "Which project" / "What should I work on" | oc-orchestrator | /oc-ops status |
| "Anthropic SDK" / "Prompt caching" / "Model migration" | oc-claude-api | /oc-claude-api |
| "RAG" / "Vector database" / "Semantic search" | oc-rag-forge | /oc-rag design |
| "Build an agent" / "Claude Agent SDK" / "Subagent" | oc-agent-forge | /oc-agent plan |
| "Prompt regression" / "Eval dataset" | oc-prompt-ops | /oc-prompt eval |
| "Prompt drift" | oc-prompt-ops | /oc-prompt drift |
| "What did this cost" / "Budget gate" / "Cheaper model" | oc-cost-ops | /oc-cost report |
| "Usage metering" / "Which skills do people use" | oc-telemetry-ops | /oc-telemetry status |
| "New metric" / "Instrument this" / "Is this metric right" | oc-signal-forge | /oc-signal frame |
| "Break up the monolith" / "Extract a service" | oc-modularize-ops | /oc-modularize assess |
| "Kubernetes" / "Terraform" / "Deploy multiple containers" / "Self-managed infra" | oc-fleet-ops | /oc-fleet topology |
| "Test strategy" / "Test pyramid" / "Coverage budget" / "Contract testing" / "Plan a load test" | oc-qa-ops | /oc-qa pyramid |
| "Data pipeline" / "dbt" / "Data contract" / "Ingestion" / "Warehouse schema drift" / "Stale data" (API contract drift → oc-api-dev) | oc-data-ops | /oc-data-ops design |
| "SOC 2 evidence" / "Compliance checklist" / "Audit-ready" / "What would an auditor ask for" | oc-compliance-ops | /oc-comply scope |
| "Harden this" / "Fix the security findings" / "Roll out CSP" / "Rate limit this endpoint" | oc-security-hardening | /oc-harden baseline |
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
   Error in deploy → suggest /oc-deploy rollback. Error in integration → check /oc-integrate health.
3. **Write checkpoint before giving up.** Even partial progress should be saved.
4. **Offer the user a clear next step.** Not "something went wrong" — instead:
   "The evaluator found 3 failing tests. I can fix them now, or you can review
   the eval report and decide which to prioritize."

---

## 7. Skill Descriptions (Trigger Optimization)

These are the optimized descriptions that maximize Claude's trigger accuracy. The
block below is generated from each skill's YAML frontmatter `description` field and
must match it exactly: edit the frontmatter, run
`node scripts/check-skill-contracts.mjs --write`, then `npm run sync-bundles` and
`npm run sync-plugin-skills`. CI fails when they differ.

```yaml
# oc-agent-forge
description: >
  Claude Agent SDK build harness with a Planner/Builder/Evaluator loop. Owns
  subagent topology, tool-budget design, harness loop shapes, and agent
  evaluation. Use for /oc-agent, "Claude Agent SDK", "build an agent",
  "subagent", "tool budget", "agent loop", "harness", "multi-agent",
  "agent eval", "orchestrator-worker". Model routing comes from oc-claude-api;
  agent-forge owns topology + harness shape.

# oc-api-dev
description: >
  First-party API design and build harness with Designer/Builder/Conformance loop.
  Owns OpenAPI/GraphQL authoring, schema↔code parity, versioning + sunset strategy,
  pagination/error/idempotency conventions, typed handler scaffolding, and SDK
  generation for the API your own clients consume. Use for /oc-api, /oc-api design,
  /oc-api spec, /oc-api scaffold, /oc-api version, /oc-api lint, /oc-api sdk, "design our API",
  "OpenAPI", "GraphQL schema", "versioning strategy", "deprecate endpoint",
  "generate SDK", "API schema drift" (spec↔code; warehouse/data schema drift is
  oc-data-ops). For consuming someone else's API (Stripe, Slack,
  OAuth) use oc-integrations-engineer instead.

# oc-app-architect
description: >
  Unified app development: idea → spec → design → build with Generator/Evaluator
  QA loop → launch. Use for /oc-app, /oc-discover, /oc-spec, /oc-design, /oc-roadmap,
  /oc-scaffold, /oc-build, /oc-launch,
  "build me an app", "I have an app idea", or any software project. Chains to (when you invoke it): oc-stack-forge and oc-ux-engineer.

# oc-bug-check
description: >
  Pre-commit QA gate that runs on every commit. Fast, opinionated checks: type
  safety, lint, tests, anti-pattern scan, secret detection, build verification,
  and dependency vulnerability scan. Blocks commits on failures, warns on cautions,
  passes silently on clean code. Invoked by oc-git-ops before every /oc-commit
  and /oc-git-sync. Use for /oc-bugcheck, "check this before I commit", "run the checks",
  "is this safe to commit", "pre-commit", "quick audit", "lint and test", "any bugs
  in this?", "sanity check".

# oc-claude-api
description: >
  Build, debug, and optimize Claude API / Anthropic SDK apps. Apps built with
  this skill include prompt caching by default. Also migrates existing Claude
  API code between model versions (4.6 → 4.7 → 4.8, Mythos Preview → Fable 5,
  retired-model replacements). Use for /oc-claude-api, "Anthropic SDK", "prompt
  caching", "cache hit rate", "tool use", "model migration", "extended thinking",
  "batch API", "files API", "memory", "citations".

# oc-code-auditor
description: >
  Code quality auditor with Auditor/Fixer/Verifier loop. Use for /oc-audit, "audit this",
  "find bugs", "code review", "pre-deploy check", "what's wrong with this code", or any
  code-level quality question. For fast pre-commit checks, escalate to oc-bug-check. For
  architecture- or infra-level security, escalate to oc-security-auditor.

# oc-compliance-ops
description: >
  Standing compliance operator: maps SOC 2 / HIPAA / GDPR controls to concrete
  repo and infra artifacts in a maintained control register, generates
  audit-ready evidence bundles at deploy and release time, and scaffolds the
  policy docs auditors ask for. Use for /oc-comply, /oc-compliance, "make us
  SOC 2 compliant", "get compliant", "SOC 2 evidence", "compliance checklist",
  "audit-ready", "control mapping", "GDPR", "HIPAA", "BAA", "data retention
  policy", "access review", "what would an auditor ask for", "compliance delta
  since last release". Consumes oc-security-auditor's readiness gaps (the
  point-in-time assessor); this skill is the standing register and evidence
  pipeline. Activated by `.opchain/compliance.yaml` (adds oc-deploy-ops'
  evidence gate row); absent profile, inert. Readiness and evidence, not
  certification and not legal advice. Technical control execution belongs to
  oc-security-hardening.

# oc-cost-ops
description: >
  Cost operations harness — attribute LLM spend to the skill phase that incurred
  it, set per-phase and per-suite budgets that gate in the checkpoint, and
  recommend model-tier routing (Haiku for cheap repetitive phases, Opus for
  spec/audit/migration). Use for /oc-cost, "what did this cost", "cost
  attribution", "token cost", "budget gate", "model tier routing", "cost
  regression", "cheaper model", "spend per feature". Pairs with oc-prompt-ops
  (cost-regression gate alongside the score gate) and oc-telemetry-ops (feeds
  the public /dashboard cost stats).

# oc-dash-forge
description: >
  Specialized dashboard and dense-information UI designer. Produces design specs AND
  working React prototypes with mock data for three archetypes: executive (KPI-driven,
  low density), operations (real-time, monitoring-dense), and analyst (exploratory,
  drill-heavy). ALWAYS trigger on /oc-data-forge, /oc-dash-forge, /dashboard, /dataviz-design.
  Also trigger on: "design a dashboard", "dashboard mockup", "BI design", "data
  visualization design", "KPI dashboard", "analytics UI", "monitoring dashboard",
  "dense information display", "what should the dashboard look like", "design a report
  view". Invoked by oc-ux-engineer when the UI is data-heavy and by oc-app-architect
  when the design phase encounters a dashboard surface.

# oc-data-ops
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

# oc-deploy-ops
description: >
  Deployment pipeline: audit gate → staging → production → monitoring. Use for
  /oc-deploy, "deploy this", "ship it", "push to production", "staging", "rollback",
  "health check", or any deployment task. Single-app managed deploys only:
  multi-container, self-managed or IaC deploys are oc-fleet-ops.

# oc-docs-forge
description: >
  Documentation creation, standardization, and upkeep for every PR. Invoked
  by oc-git-ops before PR creation and by release flows before release PRs. Use
  for /oc-docs, /oc-docs pr, "generate the PR docs", "update README", "standardize
  docs", "refresh product documentation", "write PR body docs", "post a PR docs
  comment", "docs upkeep", changelog/ADR/readme drift, or any request where
  implementation changes need reader-facing documentation. Catalog drift
  (generated catalogs out of sync with source) is oc-repo-ops.

# oc-fleet-ops
description: >
  Multi-container / orchestration deployment operator for self-managed infrastructure.
  Declares topology (containers/services × target environment), provisions infra with the
  right IaC tool (Terraform/OpenTofu when it fits, else Ansible/cloud-init/k8s-manifests/
  Helm/Nomad/Compose), rolls the fleet with a rollout strategy, verifies fleet-wide health,
  and operates day-2 (scale/drain/replace/rollback). Specifically lands the modules
  oc-modularize-ops carves out of a monolith. Use for /oc-fleet, "deploy multiple
  containers", "kubernetes", "terraform", "orchestrate containers", "on-prem deployment",
  "deploy to VMs", "self-managed infra", "container fleet". Complements oc-deploy-ops
  (single-app managed PaaS): managed app → deploy-ops; multi-container/self-managed/IaC →
  fleet-ops. Trigger on multi-container / IaC / self-managed deployment.

# oc-git-ops
description: >
  Git workflow: branch, commit, PR, sync, release tag. Chains to (when you invoke it):
  oc-bug-check before every commit and the oc-docs-forge → oc-repo-ops pre-PR gate before
  every PR. Owns the release tag that oc-release-ops hands off. Use for /oc-git, /oc-commit,
  /oc-pr, /oc-push, /oc-git-sync, /oc-git-release, "commit this", "push to git", "create a PR",
  "tag the release", "sync to repo", or any git operation.

# oc-integrations-engineer
description: >
  Third-party API integrations with Planner/Builder/Tester loop. Use for /oc-integrate,
  "connect to Salesforce", "webhook", "OAuth", "API integration", "connect to Slack",
  or any external service connection. For designing or building your *own* first-party
  API (OpenAPI/GraphQL authoring, versioning, SDK generation), use oc-api-dev instead.
  When the destination is the data warehouse, this skill builds the connector; the
  warehouse-bound pipeline + data contract side is oc-data-ops.

# oc-migration-ops
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
  (oc-reverse-spec).

# oc-modularize-ops
description: >
  Monolith decomposition operator. Decides whether modularization is even the right call
  (and is willing to say no), captures golden fixtures from REAL data for every boundary
  as an equivalence oracle, plans the seams + data ownership, and proves zero
  functionality/data loss by replaying the fixtures. Supports parallel-copy and
  strangler-fig strategies. Hands the bulk code-move + live cutover to oc-migration-ops
  (Structural type) and per-module deployment to oc-fleet-ops. Use for /oc-modularize,
  "break up the monolith", "extract a service from a live system", "split this codebase
  safely", "golden fixtures", "no functionality loss". For a behaviour-git-diffable
  repo/package reorg, use oc-migration-ops Structural instead. Trigger when decomposing a
  LIVE monolith carrying real traffic.

# oc-monitoring-ops
description: >
  Post-deployment observability: uptime monitoring, error tracking, structured logging,
  alerting pipelines, and incident response runbooks. Sits after oc-deploy-ops in the
  pipeline — oc-deploy-ops ships it, oc-monitoring-ops watches it. Use for /oc-monitor,
  "set up monitoring", "error tracking", "uptime check", "alerting", "incident
  response", "observability", "what's happening in prod", "set up Sentry", "logging
  strategy", "on-call", "runbook", "SLO", "SLI", "is prod healthy", "why is it
  slow", "error rate", "status page". NOT opchain skill-usage metering
  (oc-telemetry-ops).

# oc-orchestrator
description: >
  Pipeline coordinator for the opchain dev ecosystem. Multi-project registry, cross-skill
  status, smart routing, and "what should I do next?" recommendations. Use for /oc-ops,
  "what's the status", "where did I leave off", "which project", "what should I work on",
  "show me everything", or any question about pipeline state across projects. Also trigger
  when the user seems lost, references multiple projects, or asks a vague dev question
  that needs routing.

# oc-prompt-ops
description: >
  Prompt operations harness — treat prompts as versioned, diffable,
  source-controlled code. Owns prompt versioning, eval datasets, regression
  detection, and drift tracking. Use for /oc-prompt, "prompt versioning",
  "eval dataset", "prompt regression", "prompt drift", "golden set",
  "prompt diff", "LLM eval", "regression suite".

# oc-qa-ops
description: >
  Test-strategy designer: owns the test pyramid, coverage budgets, contract-test
  matrix, and load-test planning — the strategy layer split out of oc-bug-check.
  oc-bug-check runs the tests in under two minutes at the commit gate; oc-qa-ops
  decides which tests should exist and where. Writes `.opchain/qa.yaml`, which
  oc-bug-check's test check reads when present. Use for /oc-qa, /oc-qa pyramid,
  /oc-qa coverage, /oc-qa contracts, /oc-qa loadplan, /oc-qa audit, "test
  strategy", "test pyramid", "coverage budget", "what should we test", "contract
  testing", "plan a load test", "too many e2e tests", "our tests are slow",
  "test debt", "flaky tests", "unit vs integration". Invoked by oc-app-architect
  Phase 2 to author 06-testing.md. NOT test execution (oc-bug-check), NOT
  load-test execution or perf budgets (oc-scale-ops), NOT first-party API
  conformance authoring (oc-api-dev), NOT writing the tests themselves (the
  build loop's Generator, or /oc-audit test-bootstrap for untested codebases).

# oc-rag-forge
description: >
  Retrieval-augmented generation harness with a Designer/Builder/Evaluator
  loop. Owns vector DB selection (pgvector, Turbopuffer, Pinecone, Supabase
  Vectors), embedding-model choice, chunking strategy, hybrid search, and
  retrieval evaluation. Use for /oc-rag, "RAG", "vector database", "embeddings",
  "chunking", "semantic search", "hybrid search", "retrieval eval", "reranking",
  "knowledge base".

# oc-release-ops
description: >
  Release-cadence operator. Plan, draft, bump, announce, and ship versioned
  releases of opchain (or any opchain-managed project). Reads sprint
  checkpoints, proposes the next semver, drafts the /changelog entry from
  what actually shipped, bumps every skill version atomically, and hands
  off to oc-git-ops + oc-deploy-ops. Use for /oc-release, /oc-release plan, /oc-release
  draft, /oc-release bump, /oc-release announce, /oc-release ship, "cut a release",
  "ship v1.3", "draft the changelog", "what's in this release", "version bump".
  The release tag itself is oc-git-ops (/oc-git-release).

# oc-repo-ops
description: >
  Repository hygiene and PR readiness gate. Invoked by oc-git-ops before
  every PR and after oc-docs-forge generates the PR documentation packet. Use for
  /oc-repo, /oc-repo audit, /oc-repo verify, "repo hygiene", "clean this repo",
  "is this PR ready", "check generated files", "catalog drift", "plugin/cache
  drift", ".gitignore policy", orphaned docs/files, stale generated artifacts,
  source-vs-doc mismatch, or any repository cleanliness question.

# oc-reverse-spec
description: >
  Reverse-engineer existing code into spec docs. Use for /oc-rev-spec, /oc-reverse-spec,
  /oc-rev-full, /oc-rev-scan, /oc-rev-design, /oc-rev-stack, /oc-rev-sprint,
  "document this codebase", "generate specs from code", "backfill specs", or when
  pointing at existing code that needs documentation.

# oc-scale-ops
description: >
  Scaling readiness: load test, perf budgets, caching, capacity planning. Use for
  /oc-scale, "load test", "can this handle more users", "performance", "caching strategy",
  or any scaling question.

# oc-security-auditor
description: >
  Practice-level security posture assessment: threat modeling (STRIDE), OWASP Top 10
  compliance mapping, runtime/infra hardening (CSP, TLS, DNS, WAF, Cloudflare config),
  and attack surface mapping. Operates ABOVE oc-code-auditor — oc-code-auditor finds SQLi and
  hardcoded secrets; oc-security-auditor asks "what's the threat model?" and "is the infra
  hardened?" ALWAYS trigger on /oc-security, /oc-secaudit, /oc-sec, /oc-threat-model, /oc-owasp,
  /oc-hardening, /oc-attack-surface, /oc-posture. Also trigger on: "threat model this app",
  "is this secure enough", "OWASP compliance", "security review", "attack surface",
  "is it hardened", "what are the security risks", "SOC2 readiness", "pen test prep",
  "security architecture review", "audit the CSP policy", "review WAF rules",
  "check TLS config". Trigger on architecture-, infrastructure-, or
  compliance-level security questions — not just code bugs. Assessment only:
  oc-security-hardening (/oc-harden) executes the fixes; oc-compliance-ops
  keeps the register.

# oc-security-hardening
description: >
  Security remediation and enforcement operator — the execution half of the
  security pair. oc-security-auditor assesses (/oc-hardening audits the posture);
  oc-security-hardening executes (/oc-harden writes the fixes): security
  headers, staged CSP rollout, TLS/WAF/rate-limit config as code, secrets
  hygiene, dependency-pinning policy. Maintains `.opchain/hardening.yaml` — the
  declared-controls manifest — and stands the per-deploy gate that verifies it,
  the "before every deploy" step auditor findings never had. Use for
  /oc-harden, /oc-harden baseline, /oc-harden fix, /oc-harden csp, /oc-harden
  gate, "harden this", "fix the security findings", "the pen test found",
  "add security headers", "roll out CSP", "rate limit this endpoint", "rotate
  secrets", "block deploys on security regressions", "security baseline". NOT
  assessment (oc-security-auditor), NOT code-bug fixing (oc-code-auditor's
  Fixer), NOT dependency vuln scanning (oc-bug-check — this skill owns pinning
  policy, not the scan).

# oc-signal-forge
description: >
  Analytics & signals backend harness with a Designer/Builder/Evaluator loop. Derives
  new metrics from the question they answer, builds the instrumentation + harvester +
  transform, and adversarially verifies the signal is correct AND answers the question
  before wiring it to a consumer. Use for /oc-signal, "new metric", "instrument this",
  "analytics backend", "data harvesting", "is this metric right", "wire up a signal",
  "derive a KPI". Hands the validated signal (stable read contract) to oc-dash-forge
  for rendering. NOT pipeline telemetry
  (oc-telemetry-ops), NOT dashboards (oc-dash-forge), NOT prod uptime (oc-monitoring-ops),
  NOT estate-level data pipelines — ingestion/dbt/warehouse layering is oc-data-ops;
  when a metric needs a pipeline that doesn't exist, chain to /oc-data-ops design
  and build the signal on the contracted mart.

# oc-stack-forge
description: >
  Stack advisor for any platform: Cloudflare, Vercel, AWS, Supabase, Rails, Django.
  Use for /oc-stack, /oc-stack-decide, /oc-feature, "what stack", "tech stack", "what should I
  build with", or framework comparisons. Invoked by oc-app-architect.

# oc-telemetry-ops
description: >
  Telemetry operations harness — opt-in, local-first usage metering that records
  which skills and phases actually run, to a local .checkpoints/usage.sqlite
  store, then produces anonymized aggregates for the public /dashboard. Use for
  /oc-telemetry, "usage metering", "opchain usage telemetry", "opt-in analytics",
  "which skills do people use", "usage stats", "dashboard data", "anonymized
  usage". Default stance is OFF — nothing is recorded until you explicitly enable
  it, and no prompt content or PII ever leaves the machine. Pairs with oc-cost-ops
  (cost per run) for the cost-per-feature dashboard stats. NOT application or
  production observability (oc-monitoring-ops).

# oc-ux-engineer
description: >
  UI/UX design harness with Design Planner/Generator/Evaluator loop. Use for /oc-uxe,
  "review the UX", "design iteration", "component library", "accessibility audit",
  "is the UI consistent", or any design quality question. Routes data-heavy screens
  (dashboards, BI, analytics) to oc-dash-forge via /oc-uxe dash.
```

---

## 8. Ecosystem Awareness

Every skill should know these facts:

- **Foundation:** `oc-checkpoint-protocol` (shared JSON schema bundled in every skill) and
  `oc-orchestrator` (multi-project registry + router via `/oc-ops`).
- **Tri-agent skills:** oc-app-architect (Generator/Evaluator), oc-ux-engineer (Design
  Planner/Generator/Evaluator), oc-code-auditor (Auditor/Fixer/Verifier),
  oc-integrations-engineer (Planner/Builder/Tester), oc-api-dev (Designer/Builder/Conformance),
  oc-agent-forge (Planner/Builder/Evaluator), oc-rag-forge (Designer/Builder/Evaluator),
  oc-signal-forge (Designer/Builder/Evaluator), oc-data-ops (Designer/Builder/Contract-Verifier).
- **Declared chains (each requires an explicit invocation):** oc-stack-forge during oc-app-architect Phase 2; oc-ux-engineer during
  oc-app-architect UI sprints; oc-dash-forge from oc-ux-engineer or oc-app-architect on data-heavy
  screens; oc-bug-check from oc-git-ops before every `/oc-commit` and `/oc-git-sync`;
  oc-docs-forge from oc-git-ops before PR creation (and from release flows before release
  PRs); oc-repo-ops from oc-git-ops before every PR, after oc-docs-forge; (v1.9)
  oc-qa-ops from oc-app-architect Phase 2 at `06-testing.md`; oc-data-ops from
  oc-app-architect Phase 2 on data-heavy discovery and from oc-signal-forge when a
  metric needs a pipeline; oc-security-hardening from oc-security-auditor after an
  assessment; the two conditional manifest gates (oc-security-hardening,
  oc-compliance-ops) from oc-deploy-ops when their `.opchain/*.yaml` files exist.
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
- **Assurance & governed delivery (v1.9):** oc-qa-ops (test-pyramid strategy →
  `.opchain/qa.yaml`, read by oc-bug-check's test check when present),
  oc-security-hardening (executes auditor findings; `.opchain/hardening.yaml`
  adds a manifest-verify row to the deploy audit gate), oc-compliance-ops
  (control register + per-deploy evidence bundle; activated by
  `.opchain/compliance.yaml`, inert without it), oc-data-ops (data estate:
  ingestion, transformation layers, dbt, observable data contracts). The
  security pair verb split: /oc-hardening assesses (oc-security-auditor),
  /oc-harden executes (oc-security-hardening).
- **Cross-cutting skills:** oc-api-dev (first-party APIs — OpenAPI/GraphQL, versioning,
  SDKs), oc-integrations-engineer (external APIs), oc-migration-ops (live system changes —
  DB, framework, platform), oc-scale-ops (advisory), oc-dash-forge (dense data UIs).
- **Instrumentation (v1.6 "the instrumented pipeline"):** oc-cost-ops (LLM spend
  attribution per phase, budget gates, model-tier routing) and oc-telemetry-ops
  (opt-in local usage metering → anonymized `/dashboard` aggregate). They add the
  wire-1.1 checkpoint fields `cost` / `eval_scores` / `telemetry_handle`. v1.6
  took the catalog to 24 skills; v1.7 "Seams & Signals" adds oc-signal-forge /
  oc-modularize-ops / oc-fleet-ops → 27; v1.8 "the quality-gate rail" adds
  oc-docs-forge / oc-repo-ops → 29; v1.9 "Assurance and governed delivery ops"
  adds oc-qa-ops / oc-data-ops / oc-compliance-ops / oc-security-hardening → 33.
- **Checkpoint protocol:** every skill writes to `.checkpoints/[skill].checkpoint.json`.
- **Tri-dev is retired.** Its build harness lives inside oc-app-architect Phase 6.
  If a user asks for tri-dev, route to oc-app-architect /oc-build.
