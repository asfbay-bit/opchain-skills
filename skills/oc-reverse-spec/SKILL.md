---
name: oc-reverse-spec
displayName: OC · Reverse Spec
version: 1.8.1
shortDesc: Turn existing code into pipeline-ready specs. v1.2 mirrors discovered scope to the PM tool as parent + children.
phases: [plan]
triAgent: false
tryable: true
commands:
  - /oc-reverse-spec
  - /oc-rev-scan
  - /oc-rev-full
  - /oc-rev-design
  - /oc-rev-stack
  - /oc-rev-sprint
description: >
  Reverse-engineer existing code into spec docs. Use for /oc-rev-spec, /oc-reverse-spec,
  "document this codebase", "generate specs from code", "backfill specs", or when
  pointing at existing code that needs documentation. Trigger liberally.
---

# Reverse Spec

**On first invocation, read `references/orchestrator.md` and follow its welcome protocol.**

Read an existing codebase and generate the structured spec documents that oc-app-architect
expects as inputs. This is the reverse of the normal pipeline: instead of idea → spec →
code, it goes code → spec → pipeline-ready.

## Why This Exists

The build pipeline (oc-app-architect Phase 2 stack decision → Phase 6 build loop) assumes
spec documents exist. But most real projects were built before the pipeline existed, or
grew organically without formal specs. Reverse-spec bridges that gap — it reads what's
actually built and produces the documentation that makes the project legible to the rest
of the toolchain.

This matters because without specs:
- **oc-app-architect** can't generate a roadmap for new features (no baseline to build from)
- **oc-stack-forge** can't run a gap analysis (no documented architecture to compare against)
- **oc-app-architect Phase 6** can't decompose features into sprints (no spec.md or sprint-plan.md to reference)

## /oc-reverse-spec — Command Reference

When the user types `/oc-reverse-spec`, display this menu:

```
REVERSE SPEC COMMANDS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  MODES
  /oc-rev-scan       Quick scan — inventory what exists, recommend spec priority
  /oc-rev-full       Full spec generation — produce all oc-app-architect spec docs
  /oc-rev-design     Design system extraction — colors, typography, components
  /oc-rev-stack      Stack-forge gap analysis — typed pipeline audit
  /oc-rev-sprint     Tri-dev onramp — generate spec.md + sprint-plan.md for a feature

  UTILITIES
  /oc-rev-status     Show progress from checkpoint — what's done, what's next
  /oc-rev-diff       Compare generated specs against actual code (drift check)

  SESSION
  /checkpoint         Show checkpoint status
  /checkpoint show    Display full checkpoint JSON
  /checkpoint reset   Archive and clear checkpoint

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  Type any command to begin. /oc-reverse-spec to see this again.
```

### Command Behavior

**`/oc-rev-scan`**: Run Phase 0 only (orientation). Quick inventory, no deep analysis. Produces
the orientation summary and recommends which spec docs to prioritize.

**`/oc-rev-full`**: Run the complete pipeline — Phase 0 through Phase 2, generating all applicable
spec docs. This is the default when the user says "reverse spec this codebase." Uses the
checkpoint system to span sessions if needed.

**`/oc-rev-design`**: Can run standalone (without `/oc-rev-full`). Reads only the frontend layer
(components, styles, config) and produces `design/design-system.md` + `design/component-inventory.md`.
If Phase 1 analysis already exists in checkpoint, reuses it; otherwise runs a targeted frontend-only scan.

**`/oc-rev-stack`**: Can run standalone. Reads only the type pipeline artifacts (schema, ORM, API types,
OpenAPI, codegen, CI). Produces `stack-forge-audit.md`. If no prior analysis exists, runs a
targeted scan of just the typed pipeline layers.

**`/oc-rev-sprint`**: Requires either prior `/oc-rev-full` analysis or enough context from conversation/memory
to understand the project. Generates `app-architect-ready/spec.md` and optionally `sprint-plan.md` for a
specified feature.

**`/oc-rev-status`**: Reads checkpoint (JSON, or legacy markdown). If no checkpoint exists,
says so and suggests `/oc-rev-scan` to start.

**`/oc-rev-diff`**: Re-reads the codebase and compares against previously generated specs. Flags
drift (code changed since specs were generated). Requires prior spec generation.

---

## How This Skill Fits the Pipeline

```
EXISTING CODEBASE
       │
       ▼
┌──────────────┐
│ REVERSE-SPEC │  Reads code → produces spec docs
│              │  Outputs: spec/*.md, design/, gap-analysis.md
└──────┬───────┘
       │
       ├──► APP-ARCHITECT  (Phase 2+: has baseline specs, can roadmap new features)
       ├──► STACK-FORGE    (has architecture doc, can run typed pipeline audit)
       └──► TRI-DEV        (has spec.md + sprint-plan.md, can build features)
```

Reverse-spec is a **read-only analyzer** — it never modifies the codebase. It produces
documents that describe what exists, flags what's missing, and makes the project ready
for the build pipeline to take over.

---

## Phase 0: Scope & Orientation

Before reading any code, establish what we're working with. The scope determines how
deep the analysis goes and which output docs are relevant.

### Determine Input Scope

Ask the user (or infer from context) which scope applies:

| Scope | Input | Analysis Depth | Typical Output |
|---|---|---|---|
| **Monorepo** | Root path of a multi-app repo | Inventory all apps, shared libs, infra config. Generate top-level overview + per-app specs. | All spec docs + per-app summaries |
| **Single App** | Path to one application | Full analysis: schema, API, UI, auth, integrations, config | All spec docs (00-10) |
| **Feature/Module** | Path to a specific directory or set of files | Focused analysis: what this module does, its interfaces, dependencies | Targeted spec sections + oc-app-architect sprint docs |
| **Uploaded/Pasted** | Files in /mnt/user-data/uploads or pasted code | Best-effort analysis from available code | Whatever can be inferred; flag gaps prominently |

### Orientation Scan

Run a quick structural scan before deep analysis. This takes 60 seconds and saves hours
of wrong assumptions.

```
1. Directory tree (2 levels deep, ignore node_modules/.git/dist/build)
2. Package manifests (package.json, requirements.txt, pyproject.toml, wrangler.toml, Cargo.toml)
3. Config files (tsconfig, vite.config, tailwind.config, .env.example, docker-compose)
4. Database artifacts (migrations/, schema files, seed files, ORM config)
5. Entry points (index.ts, main.py, app.tsx, worker.ts)
6. Test infrastructure (test dirs, vitest/jest/pytest config, playwright config)
7. CI/CD (.github/workflows/, wrangler.toml deploy config, Dockerfile)
8. README.md and any existing docs/
```

Present the orientation as a quick summary:

```
ORIENTATION SUMMARY
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Project: [name from package.json or directory]
Type: [monorepo | single app | library | worker | etc.]
Stack: [framework] + [DB] + [hosting] + [auth]
Size: [file count, LOC estimate, number of routes/endpoints]
Existing docs: [README, ADRs, API docs, or "none"]
Test coverage: [present/absent, framework, rough coverage]
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

After orientation, confirm scope and output targets with the user before proceeding.

---

## Phase 1: Deep Analysis

Read the codebase systematically, layer by layer. The goal is to extract *facts* — what
the code actually does, not what it should do. Save speculation for the gap analysis.

**Before starting:** Read `references/analysis-playbook.md` for detailed per-layer reading
strategies (where to look, what to extract, framework-specific locations). The playbook
is the tactical manual; this section is the strategic overview.

### Analysis Order

Follow this order because each layer informs the next:

1. **Schema & Data Model** — Ground truth. Tables, columns, types, relationships, indexes.
2. **API Layer** — Every endpoint: method, path, auth, input/output shapes.
3. **Business Logic** — Services, domain functions, complexity hotspots, dead code/unused exports.
4. **Frontend Structure** — Pages, component tree, state management, design tokens.
5. **Auth & Security** — Auth method, session management, roles, CORS, rate limiting.
6. **Integrations** — Third-party services, webhooks, env vars pointing to external APIs.
7. **Infrastructure** — Hosting, CI/CD, deployment, monitoring, logging.
8. **Testing** — Test files, coverage, frameworks, what's actually tested vs. what exists.

### Confidence Scoring

Every extracted fact gets a confidence level:

| Level | Meaning | Example |
|---|---|---|
| **HIGH** | Directly observed in code, types, or config | "Uses D1 with 4 tables" (seen in migrations) |
| **MEDIUM** | Inferred from patterns, naming, or partial evidence | "Likely uses RBAC" (role field exists, no explicit policy) |
| **LOW** | Guessed from conventions or absent evidence | "Probably no E2E tests" (no playwright config, but could be elsewhere) |
| **UNKNOWN** | Can't determine from available code | "Auth provider unclear" (env var references external service not in code) |

Flag MEDIUM/LOW/UNKNOWN items prominently in every output doc. These are the gaps the
user needs to validate or that downstream tools need to account for.

---

## Phase 2: Spec Generation

Generate spec documents in the exact format oc-app-architect uses. Read
`/mnt/skills/user/oc-app-architect/references/spec-template.md` for the canonical templates.

The key difference from forward-mode oc-app-architect: **oc-reverse-spec describes what IS,
not what SHOULD BE.** Every section should reflect the actual codebase, with gaps and
recommendations clearly separated from observations.

### Output Structure

```
reverse-spec-output/
├── spec/
│   ├── 00-project-overview.md      # What this project does, who it's for
│   ├── 01-tech-stack.md            # Actual stack with rationale (inferred)
│   ├── 02-architecture.md          # System diagram, data model, API inventory
│   ├── 03-security-auth.md         # Auth method, authorization, data protection
│   ├── 04-integrations.md          # Third-party services, webhooks, external APIs
│   ├── 05-monetization.md          # Only if payment/billing code exists
│   ├── 06-testing.md               # Current test coverage and strategy
│   ├── 07-devops.md                # CI/CD, environments, deployment, monitoring
│   ├── 08-analytics.md             # Only if analytics/tracking code exists
│   ├── 09-documentation-plan.md    # Only if docs infra exists
│   └── 10-cost-estimate.md         # Only if infra costs are inferrable
├── design/
│   ├── design-system.md            # Extracted colors, typography, spacing, components
│   └── component-inventory.md      # Every component with props, states, usage
├── gap-analysis.md                 # What's missing vs. best practices
├── stack-forge-audit.md            # Typed pipeline gap analysis for oc-stack-forge
└── app-architect-ready/
    ├── spec.md                     # app-architect-format product spec
    └── sprint-plan.md              # Ready for oc-app-architect /oc-build (if feature scope given)
```

### Document Generation Rules

1. **Generate only what the code supports.** If there's no payment code, skip 05-monetization.md.
   If there's no analytics, skip 08-analytics.md. Don't fabricate sections.

2. **Use the oc-app-architect template structure exactly.** This ensures downstream tools
   can consume the output without translation. Read the spec-template.md reference and
   follow its heading structure, table formats, and section organization.

3. **Separate observation from recommendation.** In every section, use this pattern:

   ```markdown
   ## [Section Name]

   ### Current State
   [What the code actually does. Facts only. Cite file paths.]

   ### Confidence
   [HIGH/MEDIUM/LOW per claim. Flag UNKNOWN items.]

   ### Gaps & Recommendations
   [What's missing. What best practices aren't followed. What oc-app-architect/oc-stack-forge
   would expect to find here. Prioritize by impact.]
   ```

4. **Cite file paths.** Every claim should reference the file(s) that support it.
   Example: "Auth uses WebAuthn passkeys (src/lib/auth/webauthn.ts, L12-45)"

5. **Generate Mermaid diagrams where the template calls for them.** System diagrams,
   ER diagrams, and flow diagrams should be generated from the actual code structure,
   not idealized versions.

---

## Session Persistence (Checkpoint Protocol)

Reverse-spec adopts the checkpoint protocol v1.0.

Read `references/checkpoint-protocol.md` for the full protocol specification.

Checkpoint file location: `{project-dir}/.checkpoints/oc-reverse-spec.checkpoint.json`

### Backward Compatibility

If `.checkpoints/oc-reverse-spec.checkpoint.json` does NOT exist but
`reverse-spec-output/checkpoint.md` DOES exist, read the markdown version
and offer to migrate: "Found a legacy checkpoint in markdown format. Migrate
to the standard JSON format? (This enables cross-skill checkpoint reads.)"

On migration, map the fields:
- "Analysis Progress" table → progress_table
- "Generated Docs" table → context_primer.generated_files
- "Key Findings So Far" → context_primer.key_decisions
- "Blockers & Open Questions" → blockers
- "Next Session Should" → next_actions

### Resume on Start

When `/oc-reverse-spec`, `/oc-rev-scan`, `/oc-rev-full`, or any /rev-* command is invoked:

1. Check for checkpoint: `node scripts/checkpoint.mjs show oc-reverse-spec`
2. If exists (JSON):
   - Read checkpoint
   - Display: analysis progress, generated docs, next action
   - Ask: "Continue from here, restart, or show full checkpoint?"
   - On continue: load context_primer, resume from next_actions[0]
3. If exists (legacy markdown):
   - Offer migration, then resume as above
4. If neither exists: proceed with normal flow

### Checkpoint Write Points

| Event | What to Save |
|---|---|
| Orientation complete | phase: "orientation", scope, stack detected |
| Each analysis layer complete | Update progress_table, append to key_decisions |
| Each spec doc generated | Append to generated_files, update confidence |
| User confirms an answer | Append to key_decisions |
| Blocker discovered | Add to blockers |
| Contradiction found | Update key_decisions, flag in next_actions |

### progress_table

```json
[
  { "id": "orientation",   "label": "Orientation scan",     "status": "not_started" },
  { "id": "schema",        "label": "Schema & data model",  "status": "not_started" },
  { "id": "api",           "label": "API layer",            "status": "not_started" },
  { "id": "business",      "label": "Business logic",       "status": "not_started" },
  { "id": "frontend",      "label": "Frontend structure",   "status": "not_started" },
  { "id": "auth",          "label": "Auth & security",      "status": "not_started" },
  { "id": "integrations",  "label": "Integrations",         "status": "not_started" },
  { "id": "infra",         "label": "Infrastructure",       "status": "not_started" },
  { "id": "testing",       "label": "Testing",              "status": "not_started" }
]
```

### Session Planning

At the **start** of each session, estimate what can be completed and tell the user:

```
Session Plan (estimated):
  ✅ Can complete: Schema analysis, API analysis, 00-overview, 01-stack, 02-architecture
  ⏳ May start: 03-security-auth
  📋 Next session: 04-integrations through 07-devops, design system, gap analysis

Checkpointing after each doc — if we run long, nothing is lost.
```

### Cross-Session Consistency

Context drift across sessions can cause contradictions. Three guards:

- **Re-read dependent docs** before writing new ones (02-architecture before 03-security,
  01-tech-stack before 06-testing)
- **Keep key_decisions dense and current** — it's the context primer that prevents full
  codebase re-reads
- **Flag contradictions immediately** — if new analysis contradicts an earlier doc, update
  the earlier doc, log the change in the checkpoint, and tell the user what shifted

---

## Phase 3: Design System Extraction (`/oc-rev-design`)

If the project has a frontend, extract the design system from the code. This produces
documentation that matches what oc-app-architect Phase 3a (Style Book) would generate.

### What to Extract

Read the UX design guide at `/mnt/skills/user/oc-app-architect/references/ux-design-guide.md`
for the canonical design system structure, then extract:

- **Colors**: CSS variables, Tailwind config theme.colors, any color constants
- **Typography**: Font families, type scale, font weights used
- **Spacing**: Base unit, spacing scale, container widths, grid config
- **Components**: Every reusable component with its props interface, variants, and states
- **Layout patterns**: Page layouts, navigation structure, responsive breakpoints
- **Icons**: Icon library used, custom icons

### Component Inventory

For each UI component found:

```markdown
### [ComponentName]
- **Location:** src/components/[path]
- **Props:** [TypeScript interface or inferred props]
- **Variants:** [If conditional rendering based on props/state]
- **States:** [default, loading, error, empty, disabled — which are handled?]
- **Used in:** [Which pages/parent components use this]
- **Missing states:** [Which standard states are NOT handled]
```

---

## Phase 4: Stack-Forge Gap Analysis (`/oc-rev-stack`)

Run the oc-stack-forge typed pipeline audit. Read `/mnt/skills/user/oc-stack-forge/SKILL.md`
for the pattern, then check each link in the chain:

```
DB Schema → ORM/Migrations → API Types → OpenAPI Spec → Generated TS Types → Frontend Types → CI Enforcement
```

For each link, report:

| Pipeline Link | Status | Evidence | Gap |
|---|---|---|---|
| DB Schema | ✅ Present | migrations/ dir with 4 files | — |
| ORM Types | ⚠️ Partial | Drizzle schema exists but 2 tables missing | users, sessions not in ORM |
| API Types | ✅ Present | Zod validators on all routes | — |
| OpenAPI Spec | ❌ Missing | No openapi.json or generation script | High priority — blocks codegen |
| Generated TS | ❌ Missing | Frontend types are hand-written | Drift risk |
| CI Enforcement | ❌ Missing | No type-check or schema-drift CI step | Add to pipeline |

This output is designed to feed directly into oc-stack-forge's retroactive use mode.

---

## Phase 5: App-Architect Onramp (`/oc-rev-sprint`)

Generate the two files oc-app-architect Phase 6 needs to start building:

### spec.md (oc-app-architect Format)

Use the oc-app-architect spec structure (Overview, Features, Design Direction, Technical
Constraints, Out of Scope) but populate it from the reverse-engineered analysis.
This describes the project AS IT EXISTS, so oc-app-architect's Generator (Phase 6) has a
baseline to extend from.

### sprint-plan.md (For New Features)

If the user specifies a feature they want to add, generate a sprint plan that
accounts for the existing codebase. The sprints should:
- Reference existing code that the feature builds on
- Identify existing patterns to follow (or break from, with justification)
- Flag tech debt that needs resolution before the feature can land
- Follow oc-stack-forge's stack-ordered decomposition if the project is CF-native

---

## Handling Different Scopes

### Monorepo Scope

When scanning a monorepo:
1. Start with root-level config (workspace config, shared dependencies, CI)
2. Inventory every app/package with a one-line summary
3. Ask the user which app(s) to deep-analyze
4. Generate a top-level `00-project-overview.md` for the monorepo
5. Generate per-app spec suites for selected apps

### Single App Scope

Standard flow — run all phases, generate all applicable docs.

### Feature/Module Scope

Narrower analysis:
1. Read the module's files + its direct imports/dependencies
2. Generate only the spec sections relevant to this module
3. Focus on: data model (tables this module touches), API (endpoints it owns),
   components (UI it renders), and integration points (what it calls)
4. Always generate an oc-app-architect sprint doc if the user wants to extend this module

### Uploaded/Pasted Code

Best-effort mode:
1. Analyze what's provided
2. Flag everything that can't be determined from the available code
3. Ask targeted questions to fill critical gaps
4. Generate partial specs with UNKNOWN confidence on gaps

---

## Output Delivery

### File Generation

Generate all output files to `/home/claude/reverse-spec-output/` (or user-specified directory),
then copy final versions to `/mnt/user-data/outputs/`. Use the present_files tool to share.

### Summary Report

After generating specs, present a summary:

```
REVERSE SPEC — GENERATION COMPLETE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Project: [name]
Scope: [monorepo | app | feature | uploaded]

Docs Generated:
  ✅ 00-project-overview.md    (HIGH confidence)
  ✅ 01-tech-stack.md          (HIGH confidence)
  ✅ 02-architecture.md        (HIGH confidence, 2 MEDIUM items)
  ✅ 03-security-auth.md       (MEDIUM confidence — auth provider unclear)
  ⏭️ 05-monetization.md       (skipped — no payment code found)
  ✅ 06-testing.md             (HIGH confidence)
  ...

Pipeline Readiness:
  oc-app-architect: READY (can run /oc-roadmap with these specs)
  oc-stack-forge:   PARTIAL (missing OpenAPI spec, see gap-analysis.md)
  oc-app-architect: READY (spec.md + sprint-plan.md generated)

Top 3 Gaps:
  1. No OpenAPI spec generation — blocks typed pipeline
  2. Auth session management unclear — needs user clarification
  3. No E2E tests — core flows untested

Next Steps:
  1. Review generated specs for accuracy (especially MEDIUM/LOW items)
  2. Run /oc-rev-stack for detailed typed pipeline audit
  3. Use /oc-app-architect /oc-roadmap to plan next features against these specs
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

---

## PM-Tool MCP Integration (v1.2+)

A oc-reverse-spec run produces 8-11 markdown files describing what
exists. In legacy projects without a PM trail, those documents are
the first record of the system at all — most teams want them
mirrored into the PM tool so they become discoverable + linkable
from future work. See `oc-integrations-engineer` for the canonical
PM-MCP patterns.

### `/oc-rev-spec --pm-mirror`

Opt-in flag (off by default — oc-reverse-spec on a private fork
doesn't want PM mirroring). When set:

1. Create a parent ticket in the configured PM tool:
   - title: `Reverse-spec: {repo-name} ({sha})`
   - type: `chore` (or `documentation` if mapped in
     `.opchain/pm.yaml`)
   - body: top-level summary + total file count + run timestamp.
2. For each generated spec file (`00-overview.md`,
   `01-tech-stack.md`, etc.), create a child ticket:
   - title: `Spec: {file-title}`
   - body: the file's executive summary + a `Source:` link
     pointing at the file path in the repo.
   - labels: `oc-reverse-spec`, `documentation`.
3. Record the parent + child ticket ids in the
   `oc-reverse-spec.checkpoint.json` for downstream skills (notably
   `oc-app-architect /oc-roadmap`) to read.

### Hand-off to oc-app-architect

After `/oc-rev-full` completes, actively chain to oc-app-architect per orchestrator.md §3
(Active Invocation):

1. State the chain: "Reverse-spec analysis complete. Now using oc-app-architect to extend
   from this baseline."
2. Read `oc-app-architect/SKILL.md` and `oc-app-architect/references/orchestrator.md`.
3. Check for `.checkpoints/oc-app-architect.checkpoint.json` (resume if present).
4. Execute the appropriate command: `/oc-discover --ticket {parent-id}` if PM tickets were
   filed (treats this run as the discovery), otherwise `/oc-spec` directly.
5. App-architect reads the oc-reverse-spec checkpoint and PM-ticket pointers. Phase 4
   (`/oc-roadmap`) then writes the new sprint plan back to the same parent or a new sibling.

### Findings as sub-tickets

If the oc-reverse-spec run surfaced concerning findings (security
posture gaps, scaling risks, integration-rot indicators), file
each as a sub-ticket of the parent with the appropriate skill
label:
- `security` finding → labeled for oc-security-auditor follow-up.
- `scaling` finding → labeled for oc-scale-ops.
- `integration` finding → labeled for oc-integrations-engineer.

The team's standard triage process picks them up from there.

### Failure modes

- `--pm-mirror` set but no MCP configured → skill prompts user
  to run `/oc-integrate plan pm` first, or proceed without
  mirroring.
- Parent ticket creation fails → emit specs to the filesystem
  as usual; log the intended PM mirror as deferred in the
  checkpoint.
- Repo is huge (50+ specs) → batch sub-tickets into 5-spec
  groupings rather than 50 individual children to avoid PM
  notification storms.

---

## Principles

1. **Describe what IS, not what should be.** Observations first, recommendations clearly separated.
2. **Confidence over completeness.** Honest UNKNOWN markers beat plausible fiction.
3. **Pipeline-native output.** Every document matches its downstream consumer's expected format exactly.
4. **Read the code, not the tree.** File names lie. A stub and a full implementation look identical in `ls`.
5. **Cite everything.** Every claim references a file path. Ungrounded claims don't ship.
