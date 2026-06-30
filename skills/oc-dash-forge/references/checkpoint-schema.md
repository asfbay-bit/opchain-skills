# Checkpoint Schema — oc-dash-forge

Conforms to aidops checkpoint protocol v1.0.

**Location:** `{project-dir}/.checkpoints/oc-dash-forge.checkpoint.json`

Default if unset: `/home/claude/dash-forge-session/`

---

## Schema

```jsonc
{
  // === HEADER ===
  "protocol_version": "1.0",
  "skill": "oc-dash-forge",
  "project": "IT Training Compliance Dashboard",
  "project_dir": "/home/claude/it-training-compliance",
  "created_at": "2026-04-17T14:00:00Z",
  "updated_at": "2026-04-17T15:30:00Z",

  // === PROGRESS ===
  "phase": "prototype",                // intake | archetype | layout | prototype | handoff | complete
  "step": "building-ops-grid",
  "status": "in_progress",
  "progress_summary": "Intake done. Exec archetype picked. Layout + tokens approved. Prototype building.",

  // === PROGRESS TABLE ===
  "progress_table": [
    { "id": "intake",    "label": "Phase 0 — Intake",         "status": "complete" },
    { "id": "archetype", "label": "Phase 1 — Archetype",      "status": "complete" },
    { "id": "layout",    "label": "Phase 2 — Layout + Tokens", "status": "complete" },
    { "id": "prototype", "label": "Phase 3 — React Prototype", "status": "in_progress" },
    { "id": "handoff",   "label": "Phase 4 — Handoff",         "status": "not_started" }
  ],

  // === CONTEXT PRIMER ===
  "context_primer": {
    "upstream_context": {
      "data_architect_handoff": "/home/claude/it-training-compliance/data-architect-handoff.md",
      "ux_engineer_tokens": null,
      "app_architect_spec": null
    },
    "primary_question": "Are our IT training requirements being met across departments?",
    "archetype": "exec",
    "archetype_reason": "CIO is primary user; monthly review cadence; decision is 'where to focus enforcement effort'",
    "viz_stack": "tremor",
    "key_decisions": [
      "Low density — 6 KPI tiles, 1 trend chart, 1 exception list",
      "Power BI embed is NOT in scope — this is a React prototype that could later be rebuilt in Power BI",
      "No real-time; monthly refresh matches exec cadence"
    ],
    "open_questions": [
      "Does CIO want drill to department view, or just list?"
    ]
  },

  // === PHASE DATA ===
  "phase_data": {
    "intake": {
      "users": [
        { "role": "CIO", "authority": "strategic", "frequency": "monthly" },
        { "role": "IT Director", "authority": "tactical", "frequency": "weekly" }
      ],
      "primary_decision": "Where to focus compliance enforcement this quarter",
      "viewing_context": "laptop review meeting, occasional exec email screenshot",
      "refresh_cadence": "monthly",
      "data_source": "data-architect-handoff.md schema (Power BI semantic model)",
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
      "tokens_file": "/home/claude/it-training-compliance/dash-forge-handoff/tokens.ts"
    },

    "prototype": {
      "artifact_file": "/home/claude/it-training-compliance/dash-forge-handoff/prototype.tsx",
      "mock_data_file": "/home/claude/it-training-compliance/dash-forge-handoff/mock-data.ts",
      "readme_file": "/home/claude/it-training-compliance/dash-forge-handoff/README.md",
      "audit_passed": true,
      "audit_report_file": "/home/claude/it-training-compliance/dash-forge-handoff/audit-report.md"
    },

    "handoff": {
      "bundle_dir": "/home/claude/it-training-compliance/dash-forge-handoff/",
      "generated_at": "2026-04-17T16:00:00Z",
      "integration_notes_file": "/home/claude/it-training-compliance/dash-forge-handoff/integration-notes.md"
    }
  }
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
    └── integration-notes.md
```

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

On user revision requests (e.g., "change the archetype"), revert the target phase to `in_progress` and set all later phases to `not_started`, clearing their `phase_data`.

---

## Write Triggers

- End of every phase
- Mid-phase significant decisions (archetype picked, layout approved)
- Before running `/oc-df-prototype` (captures layout state)
- User pause
- Before destructive operations

## Read Triggers

- First action of every session
- Before any `/df-*` command
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
