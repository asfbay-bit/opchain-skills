# Checkpoint Schema — oc-dash-forge

The envelope (header, progress, `context_primer`, `blockers`, `next_actions`, wire
version) is the opchain checkpoint protocol — see `checkpoint-protocol.md`, bundled next
to this file. This document adds only oc-dash-forge's `skill_state` layout and a worked
example.

**Location:** `{project-dir}/.checkpoints/oc-dash-forge.checkpoint.json`, where
`{project-dir}` is the root of the project being designed for.

---

## Schema

```jsonc
{
  // === HEADER (protocol) ===
  "protocol_version": "1.1",
  "skill": "oc-dash-forge",
  "project": "IT Training Compliance Dashboard",
  "project_dir": "/Users/alex/code/it-training-compliance",   // absolute path of {project-dir}
  "created_at": "2026-04-17T14:00:00Z",
  "updated_at": "2026-04-17T15:30:00Z",

  // === PROGRESS (protocol) ===
  "phase": "prototype",                // intake | archetype | layout | prototype | handoff
  "step": "building-ops-grid",
  "status": "in_progress",             // in_progress | blocked | complete | failed
  "progress_summary": "Intake done. Exec archetype picked. Layout + tokens approved. Prototype building.",

  "progress_table": [
    { "id": "intake",    "label": "Phase 0 — Intake",         "status": "complete" },
    { "id": "archetype", "label": "Phase 1 — Archetype",      "status": "complete" },
    { "id": "layout",    "label": "Phase 2 — Layout + Tokens", "status": "complete" },
    { "id": "prototype", "label": "Phase 3 — React Prototype", "status": "in_progress" },
    { "id": "handoff",   "label": "Phase 4 — Handoff",         "status": "not_started" }
  ],

  // === CONTEXT PRIMER (protocol — the part other skills may read) ===
  "context_primer": {
    "key_decisions": [
      "Primary question: are our IT training requirements being met across departments?",
      "Archetype exec (runner-up analyst); viz stack Tremor",
      "Low density — 6 KPI tiles, 1 trend chart, 1 exception list",
      "Power BI embed is NOT in scope — this is a React prototype that could later be rebuilt in Power BI",
      "No real-time; monthly refresh matches exec cadence"
    ],
    "generated_files": [
      "dash-forge-handoff/spec.md",
      "dash-forge-handoff/tokens.ts"
    ]
  },

  // === BLOCKERS + NEXT ACTIONS (protocol; next_actions required while in_progress) ===
  "blockers": [
    {
      "id": "b1",
      "description": "Does the CIO want drill to department view, or just the list?",
      "blocking": "prototype",
      "needs": "user_decision"
    }
  ],
  "next_actions": [
    "Finish the department KPI tiles in dash-forge-handoff/prototype.tsx",
    "Run /oc-df-audit and write dash-forge-handoff/audit-report.md"
  ],

  // === SKILL STATE (private to oc-dash-forge; paths relative to project_dir) ===
  "skill_state": {
    "upstream_context": {
      "data_contracts": ".opchain/data-contracts/compliance.yaml",
      "ux_engineer_tokens": null,
      "app_architect_spec": null
    },
    "intake": {
      "users": [
        { "role": "CIO", "authority": "strategic", "frequency": "monthly" },
        { "role": "IT Director", "authority": "tactical", "frequency": "weekly" }
      ],
      "primary_decision": "Where to focus compliance enforcement this quarter",
      "viewing_context": "laptop review meeting, occasional exec email screenshot",
      "refresh_cadence": "monthly",
      "data_source": "oc-data-ops compliance mart (Power BI semantic model)",
      "constraints": {
        "brand_palette": ["Penumbra blue", "neutral grays"],
        "dark_mode": false,
        "mobile": false,
        "accessibility": "WCAG AA baseline"
      }
    },

    "archetype": {
      "pick": "exec",
      "runner_up": "analyst",
      "runner_up_loss_reason": "CIO-primary; analyst density would overwhelm the monthly review use case",
      "density_target": "low",
      "viz_stack": "tremor",
      "interaction_model": "passive display with one drill-to-exception-detail"
    },

    "layout": {
      "ia": {
        "primary_question": "Are our IT training requirements being met?",
        "hierarchy": [
          "Headline: overall compliance rate",
          "Secondary: 4 department KPIs",
          "Supporting: 12-month trend",
          "Action: exception list (top 5 non-compliant teams)"
        ],
        "above_fold": "All KPIs + trend + top 3 exceptions"
      },
      "grid": {
        "columns": 4,
        "row_height": "auto",
        "gutter_px": 16
      },
      "component_inventory": [
        {
          "id": "hero-kpi",
          "component": "tremor.Card + Metric",
          "size": "col-span-4",
          "data": "overall_compliance_rate",
          "drill": null
        },
        {
          "id": "dept-kpis",
          "component": "tremor.Card × 4",
          "size": "col-span-1 each",
          "data": "compliance_by_department[]",
          "drill": "modal"
        }
      ],
      "tokens_file": "dash-forge-handoff/tokens.ts"
    },

    "prototype": {
      "artifact_file": "dash-forge-handoff/prototype.tsx",
      "mock_data_file": "dash-forge-handoff/mock-data.ts",
      "readme_file": "dash-forge-handoff/README.md",
      "audit_passed": false,
      "audit_report_file": "dash-forge-handoff/audit-report.md"
    },

    "handoff": {
      "bundle_dir": "dash-forge-handoff/",
      "generated_at": null,
      "integration_notes_file": "dash-forge-handoff/integration-notes.md"
    }
  }

  // PM writes (see SKILL.md → PM-Tool MCP Integration) add the protocol's optional
  // top-level "pm_refs": [...] and "pm_deferred_actions": [...] arrays.
}
```

---

## Storage Pattern: Pointer + Summary

All large artifacts (prototype.tsx, full component inventory, audit report) are stored as **files** referenced by file path in the checkpoint. The checkpoint holds pointers + summaries, not raw content.

Rule: any artifact > ~50 lines or > ~5KB lives in its own file.

```
{project-dir}/
├── .checkpoints/
│   └── oc-dash-forge.checkpoint.json      ← pointers here
└── dash-forge-handoff/
    ├── spec.md
    ├── tokens.ts
    ├── prototype.tsx
    ├── mock-data.ts
    ├── types.ts
    ├── README.md
    ├── audit-report.md
    ├── integration-notes.md
    └── components/          (optional)
```

Same tree as SKILL.md → Phase 4: Handoff (the canonical list).

---

## Phase → Status Transitions

```
intake.in_progress → intake.complete
  ↓
archetype.in_progress → archetype.complete
  ↓
layout.in_progress → layout.complete   (user gate before proceeding)
  ↓
prototype.in_progress → prototype.complete  (runs /oc-df-audit, must pass)
  ↓
handoff.in_progress → handoff.complete  →  top-level status: "complete"
```

On user revision requests (e.g., "change the archetype"), revert the target phase to `in_progress` and set all later phases to `not_started`, clearing their `skill_state` entries.

---

## Write Triggers

- End of every phase
- Mid-phase significant decisions (archetype picked, layout approved)
- Before running `/oc-df-prototype` (captures layout state)
- User pause
- Before destructive operations

## Read Triggers

- First action of every session
- Before any oc-df- phase command
- On `/oc-df-status` or `/oc-df-resume`

## Resume Prompt

```
Found oc-dash-forge checkpoint from [updated_at].
Project: [project]
Archetype: [archetype]
Phase: [phase] — [step]
Progress: [X of 5 phases complete]

Resume? (Y/n)
```
