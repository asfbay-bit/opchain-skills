# Checkpoint Protocol — Skill Integration Guide

Concrete integration instructions for each skill. Copy-paste ready.

---

## Universal: /checkpoint Command

Add this to every skill's command reference section:

```
  CHECKPOINT (cross-skill)
  /checkpoint         Show checkpoint status for current project
  /checkpoint next    Show highest-priority non-stale action
  /checkpoint doctor  Check checkpoints against git/filesystem drift
  /checkpoint show    Display full checkpoint JSON
  /checkpoint reset   Archive and clear checkpoint
  /checkpoint list    List all skill checkpoints in project
```

**Implementation:** When any of these commands are received, run the canonical CLI
(pure Node, zero deps) against the current project's `.checkpoints/` directory:

```bash
node scripts/checkpoint.mjs <command>     # status | next | doctor | list | show | reset | validate | update | done | init
```

There is **no `checkpoint.sh`** — the tool is `scripts/checkpoint.mjs`. Map the
`/checkpoint` sub-commands: `/checkpoint` → `status`, `/checkpoint next` → `next`,
`/checkpoint doctor` → `doctor`, `/checkpoint list` → `list`,
`/checkpoint show` → `show`, `/checkpoint reset` → `reset`.

---

## Universal: Resume-on-Start

Add this to the **top** of every skill's entry point (the first thing that runs
when the skill is invoked):

```
RESUME CHECK
━━━━━━━━━━━━
1. Determine project directory from context (user message or cwd).
2. Check existence:  test -f .checkpoints/<skill-name>.checkpoint.json
3. If it exists:
   a. Read it (or run: node scripts/checkpoint.mjs status --brief)
   b. Display brief status (skill, phase, step, summary, last updated)
   c. If status is in_progress and NOT stale (<7d): continue automatically —
      "Resuming from next_actions[0]: …". Don't ask.
   d. If status is blocked/failed OR the checkpoint is stale (>7d): ask
      "Continue from here, restart, or show full checkpoint?"
   e. On continue: load context_primer, start from next_actions[0]
   f. On restart: archive the file (mv to .bak) and proceed fresh
4. If it does not exist: proceed with normal skill flow (or `init` to scaffold).
```

---

## oc-app-architect

### Where to Write Checkpoints

| Event | What to Save |
|---|---|
| Discovery interview complete | `phase: "discovery"`, key decisions from interview |
| Each spec section generated | Append file to `generated_files` |
| **Spec Approval Gate passed** | `phase: "spec-approved"`, all approved decisions |
| Style book + wireframes done | `phase: "design"`, design direction notes |
| **Design Direction Gate** | `phase: "design-approved"` |
| Punch list generated | Append punch list path |
| **Punch List Gate** | `phase: "punch-list-approved"` |
| Roadmap generated | `phase: "roadmap"` |
| **Roadmap Gate** | `phase: "roadmap-approved"` |
| Scaffold generated | `phase: "scaffold"` |
| Build progress (per screen/component) | Update `step` with current build item |
| **UAT Gate** | `phase: "uat-approved"` |
| Launch complete | `status: "complete"` |

### progress_table Template

```json
[
  { "id": "discovery",       "label": "Discovery interview",    "status": "not_started" },
  { "id": "spec",            "label": "Spec generation",        "status": "not_started" },
  { "id": "spec-gate",       "label": "★ Spec approval",        "status": "not_started" },
  { "id": "design",          "label": "Design pipeline",        "status": "not_started" },
  { "id": "design-gate",     "label": "★ Design approval",      "status": "not_started" },
  { "id": "punch-list",      "label": "Punch list",             "status": "not_started" },
  { "id": "punch-gate",      "label": "★ Punch list approval",  "status": "not_started" },
  { "id": "roadmap",         "label": "Implementation roadmap",  "status": "not_started" },
  { "id": "roadmap-gate",    "label": "★ Roadmap approval",     "status": "not_started" },
  { "id": "scaffold",        "label": "Scaffold generation",    "status": "not_started" },
  { "id": "build",           "label": "Frontend + backend",     "status": "not_started" },
  { "id": "uat-gate",        "label": "★ UAT approval",         "status": "not_started" },
  { "id": "launch",          "label": "Launch & post-launch",   "status": "not_started" }
]
```

### Key context_primer Fields for oc-app-architect

```json
{
  "key_decisions": [
    "One-sentence pitch: ...",
    "Primary users: ...",
    "MVP scope: ...",
    "Stack: [from Phase 2]",
    "Auth approach: [from Phase 2]",
    "Gate approvals: spec ✅, design ✅, punch list ⏳"
  ],
  "generated_files": [
    "spec/00-project-overview.md",
    "spec/01-tech-stack.md",
    "design/style-book.html",
    "design/wireframes.html",
    "design/punch-list.md",
    "spec/11-implementation-roadmap.md"
  ]
}
```

### SKILL.md Changes Required

1. Add `/checkpoint` to the command reference under UTILITIES
2. Add resume check to the top of "How This Skill Works" section
3. After each `★ GATE` section, add: "After gate approval, write checkpoint."
4. Add to `/status` command: "Reads checkpoint first, then summarizes."

---

## oc-app-architect Phase 6 build loop (formerly `tri-dev`)

> **tri-dev is retired.** Its Generator→Evaluator build harness now lives inside
> **oc-app-architect Phase 6**. The checkpoint guidance below still applies — read
> "the skill" as oc-app-architect, and `/td-status` / `/td-build` as oc-app-architect's
> `/status` / `/oc-build`.

### Where to Write Checkpoints

| Event | What to Save |
|---|---|
| Planner completes spec + sprint plan | `phase: "planned"`, spec decisions |
| Config set | Config values in `skill_state` |
| Sprint contract negotiated | `step: "sprint-N-contract"` |
| Generator completes build | `step: "sprint-N-built"` |
| Evaluator grades (each round) | `step: "sprint-N-eval-round-M"`, scores in `skill_state` |
| Sprint passes | Move to next sprint, update `progress_table` |
| Sprint fails + max iterations | `status: "blocked"`, blocker with eval report ref |
| All sprints complete | `status: "complete"` |

### progress_table Template

```json
[
  { "id": "planning",  "label": "Planner: spec + sprints",  "status": "not_started" },
  { "id": "config",    "label": "Configuration",            "status": "not_started" },
  { "id": "sprint-1",  "label": "Sprint 1: [name]",         "status": "not_started" },
  { "id": "sprint-2",  "label": "Sprint 2: [name]",         "status": "not_started" },
  { "id": "sprint-3",  "label": "Sprint 3: [name]",         "status": "not_started" }
]
```

### skill_state Template

```json
{
  "current_sprint": 2,
  "iteration": 1,
  "max_iterations": 3,
  "pass_threshold": 6.0,
  "stack": "Hono + D1 + Workers",
  "scores": {
    "sprint-1": { "final": 8.2, "rounds": 2, "verdict": "PASS" },
    "sprint-2": { "final": null, "rounds": 1, "verdict": null }
  }
}
```

### SKILL.md Changes Required

1. Add `/checkpoint` to the command reference under CONTROLS
2. `/status` reads checkpoint first (instead of just scanning files)
3. `/oc-build` checks for checkpoint on entry — if mid-sprint, resume from last eval
4. After each evaluator round, write checkpoint with scores
5. After spec approval gate, write checkpoint

---

## oc-reverse-spec (migration from markdown checkpoint)

### Migration Steps

1. Replace `checkpoint.md` writes with `checkpoint.json` writes to `.checkpoints/`
2. Map existing fields:
   - "Analysis Progress" table → `progress_table`
   - "Generated Docs" table → `context_primer.generated_files`
   - "Key Findings So Far" → `context_primer.key_decisions`
   - "Blockers & Open Questions" → `blockers`
   - "Next Session Should" → `next_actions`
3. `/oc-rev-status` reads from new location
4. Keep backward compat: if `.checkpoints/` doesn't exist but `checkpoint.md` does,
   read the markdown version and offer to migrate

### SKILL.md Changes Required

1. Replace checkpoint section with reference to protocol
2. Update all checkpoint write locations to use new path
3. Add `/checkpoint` to command reference

---

## oc-stack-forge

### Where to Write Checkpoints

| Event | What to Save |
|---|---|
| Stack decision tree completed | Decisions per question |
| `/oc-feature` decomposition generated | Sprint plan reference |
| Gap analysis completed | Gap findings summary |

### SKILL.md Changes Required

1. Add checkpoint writes after `/oc-stack-decide` completes
2. Add checkpoint writes after `/oc-feature` generates a sprint plan
3. Add `/checkpoint` to command reference

---

## Validation Checklist

Before marking a skill as "oc-checkpoint-protocol compliant," verify:

- [ ] Writes checkpoint after every phase/step completion
- [ ] Writes checkpoint after every gate approval
- [ ] Writes checkpoint after every user decision
- [ ] Resume check runs on skill entry
- [ ] `/checkpoint` command works
- [ ] `context_primer` is dense enough to skip re-reading the full project
- [ ] `next_actions` is specific enough to start working immediately
- [ ] `progress_table` covers all phases the skill defines
- [ ] `progress_summary` is scannable (a few sentences; validator warns >~1200 chars)
- [ ] No runaway `skill_state` telemetry (validator warns >~32KB; rotate to `.checkpoints/history/`)
- [ ] Cross-skill reads work (e.g., oc-deploy-ops can read oc-app-architect's checkpoint)
