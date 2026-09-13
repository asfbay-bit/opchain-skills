---
name: oc-dash-forge
displayName: OC · Dash Forge
version: 1.9.0
license: Apache-2.0
shortDesc: Dashboards, BI, dense data — design spec + React prototype. v1.2 attaches the handoff bundle to the linked PM ticket.
phases: [plan]
triAgent: false
tryable: true
commands:
  - /oc-data-forge
  - /oc-dash-forge
  - /oc-df-intake
  - /oc-df-archetype
  - /oc-df-layout
  - /oc-df-tokens
  - /oc-df-prototype
  - /oc-df-spec-only
  - /oc-df-full
  - /oc-df-audit
  - /oc-df-variants
  - /oc-df-status
  - /oc-df-resume
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
---

# Dash Forge

**On first invocation, read `references/orchestrator.md` and follow its welcome protocol.**

Dashboard and dense-information UI designer. Takes data (from oc-data-ops mart contracts, an oc-signal-forge signal, an upstream spec, or direct input) and produces:

1. **Design spec** — layout, density, component choices, interaction model, design tokens
2. **Working React prototype** — renderable artifact with mock data, archetype-appropriate viz stack
3. **Handoff packet** — spec + prototype + integration notes for oc-app-architect Phase 6 build

**Scope:** Design and prototype. Not production data wiring, not backend. Prototype uses mock data that looks realistic.

---

## /oc-data-forge — Command Reference

Entry command: `/oc-data-forge` (or alias `/oc-dash-forge`). Sub-commands (the oc-df- family below) are reached from this menu.

```
DASH FORGE COMMANDS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  Entry: /oc-data-forge  (shows this menu)

  CORE FLOW
  /oc-df-intake      Understand users, decisions, data, density requirements
  /oc-df-archetype   Pick archetype (exec / ops / analyst) with defense
  /oc-df-layout      Information architecture + grid + component inventory
  /oc-df-tokens      Design tokens (color semantics, density scale, type ramp)
  /oc-df-prototype   Build working React prototype with mock data
  /oc-df-spec-only   Skip prototype — produce design spec only
  /oc-df-full        Run all phases end-to-end

  UTILITIES
  /oc-df-audit       Quality checks (density, legibility, chart fit, a11y)
  /oc-df-status      Checkpoint progress
  /oc-df-resume      Resume from last checkpoint
  /oc-df-variants    Generate 2-3 layout variants for user to choose

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

To restart from scratch, archive `.checkpoints/oc-dash-forge.checkpoint.json` (rename it)
and run `/oc-df-intake`; there is no reset command.

### `/oc-df-full` behavior

Runs all phases with one gate:
1. Intake (adaptive — skim upstream context first)
2. Archetype pick (auto-proceed if clear)
3. Layout + tokens (show, proceed)
4. **Gate: "Layout look right? (Y/n or describe changes)"**
5. Prototype build, run `/oc-df-audit` silently
6. Report prototype artifact path + handoff file

User interrupts with "pause" or "change X" to revert to manual control.

### `/oc-df-spec-only` behavior

Skip Phase 3 (prototype). Run phases 0–2, then generate a spec document covering:
- Archetype pick + defense
- Layout + grid + component inventory
- Tokens (color, type, density, spacing)
- Chart selections per tile with rationale
- Interaction spec
- Handoff notes for whoever builds it

Use when the user already has a frontend team and only needs the design, or when iterating on the design before committing to a prototype build.

---

## Parent Skill Integration (Checkpoints)

oc-dash-forge can run standalone OR be invoked mid-flow by oc-ux-engineer (`/oc-uxe dash`), oc-app-architect (`/oc-design`), oc-monitoring-ops (`/oc-monitor dashboard`), or oc-signal-forge (`/oc-signal wire`). In every case:

### Checkpoint coordination

- oc-dash-forge writes its own `oc-dash-forge.checkpoint.json` to `{project-dir}/.checkpoints/`
- oc-dash-forge lists the handoff bundle (`dash-forge-handoff/` files) in its own
  `context_primer.generated_files`; a parent that needs the bundle reads it there. There
  is no combined status view — `/oc-df-status` reports this skill's progress, and the
  parent's own status reports the parent's

### Context inheritance

On invocation, oc-dash-forge inherits:

| From | Read | Use in |
|---|---|---|
| oc-data-ops `.opchain/data-contracts/*.yaml` | Mart schema, grain, freshness SLA | Phase 0 intake (what data exists) |
| oc-signal-forge `signals/catalog.md` + consumer stub | Validated metric definition + read contract | Phase 0 intake (what the tile shows) |
| oc-monitoring-ops ops context packet | Archetype `ops` (pre-selected), data sources, KPIs, refresh cadence | Phase 0 intake + Phase 1 (skip archetype interview) |
| oc-ux-engineer tokens file | Color/type/spacing tokens | Phase 2 (as constraints, specialize inside) |
| oc-app-architect style book | Brand palette, component patterns | Phase 2 (align tokens with app) |
| parent spec.md | User persona, decision context | Phase 0 intake (shortcut) |

### Token handoff out

At end of Phase 2, oc-dash-forge writes `tokens.ts` in the handoff bundle with this format (consumable by oc-ux-engineer):

```ts
export const dashboardTokens = {
  color: {
    neutral: { /* scale */ },
    accent: { primary: "#..." },
    state: { success: "#...", warning: "#...", danger: "#...", info: "#..." },
    series: ["#...", "#...", /* ≤7 colors, colorblind-safe */],
  },
  density: {
    archetype: "exec" | "ops" | "analyst",
    kpiFontSize: number,
    bodyFontSize: number,
    tilePaddingPx: number,
    gutterPx: number,
  },
  type: {
    display: { size: number, weight: number },
    headline: { size: number, weight: number },
    body: { size: number, weight: number },
    caption: { size: number, weight: number },
  },
  chart: {
    // recommended defaults for the archetype
    gridlineColor: string,
    axisLabelColor: string,
    tooltipStyle: object,
  },
};
```

oc-ux-engineer reads this to update its living component library.

---

## When to Use This Skill vs. oc-ux-engineer

| Use oc-dash-forge when | Use oc-ux-engineer when |
|---|---|
| Screen is primarily data display | Screen is primarily forms / workflow / content |
| ≥3 charts or ≥5 KPIs on the same view | General app UI |
| User mentions "dashboard", "BI", "analytics", "report" | User mentions "app", "page", "component library" |
| Dense info needs scannability design | Design system / token work |
| Upstream is oc-data-ops, oc-signal-forge, or a data source | Upstream is discovery / spec |

**If both apply** (e.g., a data-heavy feature in a larger app), oc-dash-forge handles the dashboard surface and hands component tokens back to oc-ux-engineer for app-wide consistency.

---

## The 5-Phase Pipeline (0–4)

```
Phase 0: Intake                (adaptive — skim upstream, ask gaps)
   ↓
Phase 1: Archetype Pick        (exec / ops / analyst, defend)
   ↓
Phase 2: Layout + Tokens       (IA, grid, density, semantic color)
   ↓
Phase 3: React Prototype       (archetype-routed viz stack, mock data)
   ↓
Phase 4: Handoff               (spec + prototype + integration notes)
```

---

## Phase 0: Intake (Adaptive)

Before asking anything, **check for upstream context:**

1. Is there an oc-data-ops checkpoint or `.opchain/data-contracts/*.yaml`?
   Read the mart contracts — schema, grain, freshness SLA — as the
   authoritative inventory of what data exists.
2. Was this called from oc-signal-forge (`/oc-signal wire`)? Read the signal's entry in
   `signals/catalog.md` and its consumer stub — that is the metric the dashboard renders.
3. Was this called from oc-monitoring-ops (`/oc-monitor dashboard`)? Its context packet
   pre-selects the `ops` archetype and lists data sources, KPIs and refresh cadence —
   honour the pre-selection (skip the archetype interview) and ask only what's missing.
4. Was this called from oc-ux-engineer? Read its design spec / tokens for consistency.
5. Was this called from oc-app-architect? Read the spec + style book.
6. Is there a checkpoint from a prior run?

Skim what exists. Only ask what you don't already know.

### Always ask (minimum bar)

1. **Who uses this?** — Role, decision authority, domain expertise level
2. **What decisions does it drive?** — If "awareness" is the only answer, push back: awareness dashboards are low-value. The strongest dashboards drive specific actions.
3. **Viewing context?** — Standing on a wall display (ops), opened on a laptop during review (exec), explored with a mouse (analyst)
4. **Refresh cadence?** — Real-time / hourly / daily / monthly

### Scale to complexity

| Context | Questions |
|---|---|
| Upstream rich (data contracts or ops packet + oc-ux-engineer context) | 2–4 |
| Some upstream (one handoff doc or spec) | 4–7 |
| Standalone, data source known | 7–10 |
| Standalone, data unclear | 10–15, iterate |

### Pull from as needed

- What's one question the user wants answered at a glance?
- What's drill-worthy vs. background?
- Known comparison baselines (targets, prior period, benchmarks)?
- Segment cuts they care about (geo, product, channel, cohort)?
- Annotation / commentary needs?
- Export / share / schedule requirements?
- Mobile viewing? (Most dashboards don't need it — ask before assuming)
- Color constraints (brand, accessibility, dark mode)?

**Save intake to checkpoint.**

---

## Phase 1: Archetype Pick

**Read `references/archetypes.md`** for full patterns.

### Archetypes

| Archetype | Users | Density | Decisions | Stack |
|---|---|---|---|---|
| **Exec** | C-suite, senior leaders | Low — large type, few KPIs | Strategic, monthly | Tremor |
| **Ops** | Operators, on-call, support | High — small type, many tiles | Tactical, real-time | Recharts |
| **Analyst** | Data analysts, PMs, researchers | Variable, drill-heavy | Investigative | D3 + Recharts |

### Output format

```
ARCHETYPE: [Exec / Ops / Analyst]

WHY THIS, NOT THE ALTERNATIVES
- [2–3 reasons tied to users + decisions + viewing context]
- Runner-up: [archetype] — lost because [specific reason]

DENSITY TARGET
- [Low / Medium / High] — typical tile count, type scale

VIZ STACK
- [Tremor / Recharts / D3+Recharts]

INTERACTION MODEL
- [Passive display / Filter + drill / Full exploration]
```

**Hybrid rule:** If users span multiple archetypes (e.g., exec views ops dashboard), build for the *primary* user and provide a "simplified" or "detail" toggle. Don't design a dashboard that tries to serve two archetypes at full fidelity — it always compromises both.

---

## Phase 2: Layout + Tokens

**Read `references/design-principles.md`** for density rules, scannability hierarchy, color semantics.
**Read `references/chart-selection.md`** for data-shape → chart-type decisions.

### Deliverables

1. **Information Architecture**
   - Primary question the dashboard answers (one sentence)
   - Hierarchy: headline → secondary → supporting
   - What's above the fold vs. requires scroll

2. **Grid specification**
   - Column count at target breakpoint
   - Row height / tile aspect ratios
   - Gutter / padding scale

3. **Component inventory**
   - List every tile with: size (cols × rows), component type, data source, priority rank
   - Drill behavior per tile (none / modal / dedicated page)

4. **Design tokens**

   Color semantics (not aesthetic — **semantic**):
   | Token | Role | Use |
   |---|---|---|
   | `color.neutral.*` | Chrome, text, grid | 90% of ink |
   | `color.accent` | Primary series | Reserve for what needs attention |
   | `color.success` / `warning` / `danger` | State | Reserve for actual states |
   | `color.series.*` | Categorical palette | ≤7 colors, tested for colorblindness |

   Density scale (text + spacing):
   - Exec: 16–18px body, 32–48px KPI numbers, generous padding
   - Ops: 12–13px body, 20–24px KPI, tight padding
   - Analyst: 13–14px body, 18–22px KPI, medium padding

   Type ramp: 4 steps max (KPI / headline / body / caption)

5. **Interaction spec**
   - Filters (global / local / none)
   - Drill paths (what's clickable, what happens)
   - Time range control (where, scope)
   - Refresh / realtime indicator (ops only)

### Anti-patterns (hard rules)

- No rainbow charts (≤7 series; if more, bin the tail)
- No 3D charts, ever
- No pie charts with >5 slices
- No dual-axis without explicit callout
- No red/green as the *only* distinction (colorblind fail)
- No gauges taking more than 1/8 of the view (low info density)

---

## Phase 3: React Prototype

**Read `references/react-patterns.md`** for stack-specific boilerplate and mock-data patterns.

### Viz stack routing

| Archetype | Primary | Supplement | Why |
|---|---|---|---|
| Exec | Tremor | — | Tremor's opinionated components match exec density; fast build |
| Ops | Recharts | Tailwind for tiles | Recharts handles real-time updates well; flexible for dense layouts |
| Analyst | D3 | Recharts for standard charts | D3 for custom drill/zoom/linked views; Recharts where standard suffices |

### Mock data rules

- Realistic values — not `[1,2,3]`. Use plausible ranges from the domain.
- Realistic volume — enough rows to stress the viz (50–500 depending on chart).
- Realistic distribution — not all uniform. Include outliers, gaps, trend.
- Realistic time range — match the intake refresh cadence (ops = last hour, exec = last 12 months).
- Named like real entities — "Acme Corp" not "Customer A".

### Prototype deliverables

1. **Single React artifact** — write `{project-dir}/dash-forge-handoff/prototype.tsx` with
   your Write tool; record the path in the checkpoint (`skill_state.prototype.artifact_file`)
2. **Mock data file** — `dash-forge-handoff/mock-data.ts` (plus `types.ts` for its shapes)
3. **README** — `dash-forge-handoff/README.md`: what's shown, what's interactive, what's mocked
4. **Audit report** — `dash-forge-handoff/audit-report.md` from the `/oc-df-audit` run

### Prototype scope

- All primary tiles rendered with mock data
- Filters functional (on mock data)
- Drill-downs functional (modal / expand, no real routing)
- Responsive for primary viewport only (don't overscope mobile unless asked)
- No auth, no real API calls, no state persistence

---

## Phase 4: Handoff

Single artifact for oc-app-architect Phase 6 to build against:

```
{project-dir}/dash-forge-handoff/
├── spec.md                 ← design spec + tokens + component inventory
├── tokens.ts               ← Phase 2 tokens (oc-ux-engineer reads this)
├── prototype.tsx           ← React prototype
├── mock-data.ts            ← mock data
├── types.ts                ← data shapes for mock + real data
├── README.md               ← what's shown / interactive / mocked
├── audit-report.md         ← /oc-df-audit result
├── integration-notes.md    ← how to wire to real data source
└── components/             ← optional, when the prototype is split (react-patterns.md)
```

This is the canonical bundle; `references/checkpoint-schema.md` and
`references/react-patterns.md` describe the same tree.

**Tell user:** "Hand this to oc-app-architect Phase 6 (`/oc-build`) for build (which decomposes sprints internally)."

---

## /oc-df-audit — Quality Self-Check

Runs on demand and automatically before `/oc-df-prototype` completion.

| Check | Pass criteria |
|---|---|
| Archetype defense | Pick ties to ≥2 intake answers, runner-up named |
| Primary question | Dashboard answers 1 clear question, stated in the spec |
| Density fits archetype | Tile count, KPI font size, body font size within archetype range (see archetypes.md) |
| Color semantics | Every color token has a named role (chrome/state/accent/series), not just a swatch |
| Chart fit | Every chart matches data shape per `chart-selection.md`; no anti-patterns |
| Colorblind safe | No red/green-only distinctions; palette tested against deuteranopia |
| ≤7 series per chart | Or explicit binning note with "+N others" tail |
| Drill paths declared | Every interactive tile has a declared drill behavior (none/modal/page) |
| Mock data realism | Passes all four: (1) named entities not "A/B/C", (2) plausible value ranges for the domain, (3) non-uniform distribution with outliers/gaps, (4) row count matches chart type minimums in react-patterns.md |
| Type ramp | ≤4 sizes across the whole dashboard, none below 12px (design-principles.md) |
| Spacing on scale | All padding/gutter values from 4/8/12/16/24/32/48/64 |
| Contrast | Body text ≥4.5:1, large text ≥3:1 (spot-check 3 tiles minimum) |
| Screen reader | Charts have `<title>`/`<desc>` or accompanying data table |

Critical failures block `/oc-df-prototype` completion.

---

## Output Structure: Tiered

Every phase output follows:

```
═══ EXEC SUMMARY ═══
[3–5 bullets, 30-second read]

═══ FULL DETAIL ═══
[Everything the reader needs]
```

---

## Checkpoint Protocol

The shared checkpoint schema, write rules and resume protocol live in
`references/checkpoint-protocol.md`, bundled with this skill. This section adds only
what is specific to oc-dash-forge.

**Location:** `{project-dir}/.checkpoints/oc-dash-forge.checkpoint.json`, where
`{project-dir}` is the root of the project you are designing for (see
`references/checkpoint-protocol.md`).

**Read `references/checkpoint-schema.md`** for this skill's `skill_state` layout and a
full example; the envelope (required fields, `next_actions`, `blockers`) is the protocol's.

Write on: phase end, mid-phase intake, user pause, before destructive ops.
Read on: first action each session, before any phase command, on `/oc-df-status` or `/oc-df-resume`.

**`/oc-df-status`** prints the progress table below and the next phase, from the checkpoint
alone; with no checkpoint it says so and suggests `/oc-df-intake`. **`/oc-df-resume`**
loads the checkpoint and continues at the first phase not marked complete.

### Progress table

| Phase | Status |
|---|---|
| 0 — Intake | ✅ complete |
| 1 — Archetype | ✅ complete |
| 2 — Layout + Tokens | 🟡 in progress |
| 3 — Prototype | ⚪ not started |
| 4 — Handoff | ⚪ not started |

Large artifacts (prototype file, full spec) stored as file pointers, not inline in checkpoint.

---

## Failure Modes to Resist

1. **Archetype blur.** Trying to serve exec + analyst with one dashboard. Pick one, make the other a toggle.
2. **Density mismatch.** Exec densities for operators (wastes their screen) or ops densities for execs (overwhelms).
3. **Rainbow charts.** 12 series in one line chart. Bin, group, or split.
4. **Aesthetic color.** Using brand blue/orange for data series without semantic roles.
5. **Chart-for-everything.** Some data is a table. Some is a single number. Don't chart by reflex.
6. **Mock data lies.** Uniform distributions hide layout problems that real data exposes.
7. **Skipping `/oc-df-audit`.** Prototype ships with `console.error` on color contrast and nobody notices.
8. **Mobile-first when it shouldn't be.** Dashboards are usually desktop. Don't reverse without a reason.
9. **Building the full dashboard before layout gate.** Wastes tokens. Gate on layout first.

---

## Integration

```
oc-data-ops (contracts) ───┐
oc-signal-forge (wire) ────┤ ┌──────────────┐
                           ├►│ oc-dash-forge│──handoff──► oc-app-architect (Phase 6 build)
oc-monitoring-ops (ops) ───┘ └──────────────┘
                                  ▲
                                  │ routes when UI is data-heavy
                           ┌──────┴───────┐
                           │ oc-ux-engineer  │
                           └──────────────┘
                                  ▲
                                  │ calls during Phase 3 Design
                           ┌──────┴───────┐
                           │ oc-app-architect│
                           └──────────────┘
```

- **Upstream (common):** oc-ux-engineer design referral (`/oc-uxe dash`), oc-app-architect design phase (`/oc-design`)
- **Upstream (data):** oc-data-ops mart contracts; oc-signal-forge validated signal + consumer stub (`/oc-signal wire`); oc-monitoring-ops ops context with archetype pre-selected (`/oc-monitor dashboard`)
- **Upstream (rare):** direct invocation with just "design me a dashboard"
- **Downstream:** oc-app-architect Phase 6 build (handles sprint decomposition internally)
- **Peer:** oc-ux-engineer handles non-data UI; consistent token handoff both ways

---

## PM-Tool MCP Integration

Dashboard work is bursty: a single oc-dash-forge run produces a
substantial handoff bundle (design spec + prototype + component
inventory + integration notes). This section makes that bundle linkable
from the PM tool so oc-app-architect's build phase + reviewers can
find it without grepping the repo. Every write follows
`oc-integrations-engineer` and its runtime contract,
`oc-integrations-engineer/references/pm-mcp-protocol.md`; record each
ticket this skill comments on in the checkpoint's top-level `pm_refs[]`.

### Handoff comment on the linked ticket

When `/oc-data-forge` (or `/oc-dash-forge`) completes, post:

```
Dashboard handoff: {archetype} ({Exec / Ops / Analyst})
  Layout: {grid-summary}
  Components: {N total} ({M new})
  Charts: {chart-types-used}
  Mock-data fixtures: {fixture-count}
  Prototype: dash-forge-handoff/prototype.tsx
  Integration notes: dash-forge-handoff/integration-notes.md
  /oc-df-audit: PASS (or FAIL: {summary})
```

If routed-from oc-ux-engineer (the typical path), reply on the same
ticket where oc-ux-engineer's "Routed to oc-dash-forge" comment lives.
The thread reads end-to-end.

### Archetype-decision record

The archetype pick (Exec vs Ops vs Analyst) is an architectural
decision. It is recorded as a structured comment alongside the
handoff so the next reviewer can see *why* the dashboard looks
the way it does:

```
Archetype: {choice}
Reason: {one-line — usually about the user persona's task shape}
Rejected: {alternatives}, because {reason}.
```

### `/oc-df-audit` failures

If `/oc-df-audit` fails, post the failure summary on the ticket
**before** the handoff comment, so the ticket reflects the
current state. The handoff comment posts only after audit passes.

### Failure modes

- No linked ticket → handoff bundle written to filesystem only.
- oc-ux-engineer originating ticket missing → post the handoff
  unparented; the user can link it manually if needed.
- MCP unavailable → append the intended comment to the checkpoint's
  `pm_deferred_actions[]` (marker preserved, `retriable` per
  pm-mcp-protocol.md §4).

---

## Reference Files

- `references/archetypes.md` — Exec / Ops / Analyst patterns (Phase 1)
- `references/design-principles.md` — Tufte, Few, density, color semantics (Phase 2)
- `references/chart-selection.md` — Data shape → chart type decision tree (Phase 2)
- `references/react-patterns.md` — Tremor / Recharts / D3 boilerplate (Phase 3)
- `references/checkpoint-schema.md` — Checkpoint JSON schema
- `references/example-walkthrough.md` — Complete worked example (ops archetype, all phases)
