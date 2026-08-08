# Worked Example: Ops Dashboard for PenThreshold Compliance Monitoring

A complete run of oc-dash-forge on a realistic scenario. Use this as the north star for output quality.

**Scenario:** Aidan wants a real-time monitoring dashboard for the PenThreshold IT training compliance platform — the ops team needs to see at a glance whether training is landing, which integrations are healthy, and what's backing up.

This run was invoked by `/oc-app-architect` during its Phase 3b wireframe review, which detected the dashboard surface and routed to `/oc-data-forge`.

---

## Phase 0: Intake

### Upstream context found

- `data-architect-handoff.md` exists (PenThreshold schema: users, courses, completions, requirements, tickets)
- oc-app-architect style book exists (Penumbra blue + neutral warm grays, Inter font, 8px spacing scale)
- No prior oc-dash-forge checkpoint

### Exec summary

- Primary users: 2 IT Ops leads, rotating on-call
- Primary decision: "Is anything in distress right now?"
- Viewing context: wall monitor in IT ops area + occasional laptop check during on-call
- Refresh cadence: near-real-time (2-minute refresh acceptable)
- Desktop only, no mobile
- Dark mode — wall monitor runs 24/7, dark reduces eye fatigue
- Accessibility: WCAG AA

### Adaptive intake — questions asked

Only 5 questions because upstream context was rich:

| Question | Answer |
|---|---|
| What specific things go wrong that the dashboard should catch? | LMS sync failures, integration backlogs, ticket spikes, users who've been non-compliant >60 days |
| What thresholds = red vs. yellow vs. green? | Sync lag >15 min = red, >5 min = yellow. Backlog >50 = red, >20 = yellow. Ticket spike = 2σ over 7-day baseline |
| Who acts on red alerts? | Whoever is on-call. Dashboard should show owner per alert |
| Is there alert sound / notification? | No — this is passive monitoring. Pager duty handles alerts |
| Any constraint on React libraries? | No — match oc-app-architect's stack (already uses Tailwind + shadcn) |

Checkpoint written.

---

## Phase 1: Archetype Pick

### Exec summary

**Pick: Operations.**

### Full detail

```
ARCHETYPE: Operations

WHY THIS, NOT THE ALTERNATIVES
- Users are operators making tactical, immediate decisions
- Wall monitor viewing context demands high density and glance-legibility
- Real-time refresh cadence rules out exec archetype (monthly) and analyst (exploratory)
- Runner-up: Analyst. Lost because on-call operators don't explore — they react.

DENSITY TARGET
- High. 20–30 tiles expected. Tight padding, 12–13px body.

VIZ STACK
- Recharts + Tailwind for dense tile grids

INTERACTION MODEL
- Passive display with one drill path (click an alert → modal with details + owner)
- No filters — everything is "now" scoped
- Exception: time-range selector on the trend charts (last 1h / 6h / 24h)
```

Checkpoint updated: archetype = "ops".

---

## Phase 2: Layout + Tokens

### IA

**Primary question:** "Is anything in distress right now?"

**Hierarchy:**
1. Headline: top status bar — overall system health (green/yellow/red)
2. KPI row: 8 tiles with current values + status dots
3. Throughput / queue charts: 2 trend charts
4. Active incidents: table
5. Recent events: scrolling feed

**Above the fold:** Status bar + KPI row + trend charts. Table + feed scroll.

### Grid

- 8-column grid at 1920px (wall monitor), 6-column at 1280px (laptop)
- Tile padding: 8px
- Gutter: 8px
- Tile minimum height: 80px for KPIs, 240px for charts

### Component inventory (abridged)

| ID | Component | Size | Data | Drill |
|---|---|---|---|---|
| status-bar | StatusBar | col-span-8 | overallStatus | none |
| kpi-sync-lag | KpiTile | col-span-1 | syncLagSeconds | modal (last 10 sync runs) |
| kpi-compliance-rate | KpiTile | col-span-1 | currentComplianceRate | none |
| kpi-active-alerts | KpiTile | col-span-1 | activeAlertCount | modal (alert list) |
| kpi-integration-health | KpiTile | col-span-1 | integrationStatus | modal (per-integration breakdown) |
| kpi-ticket-rate | KpiTile | col-span-1 | ticketRateLastHour | modal (recent tickets) |
| kpi-overdue-60d | KpiTile | col-span-1 | overdue60dCount | modal (user list) |
| kpi-queue-depth | KpiTile | col-span-1 | queueDepth | none |
| kpi-throughput | KpiTile | col-span-1 | completionsPerHour | none |
| chart-throughput | LineChart | col-span-5 | throughputSeries | none |
| chart-queue-depth | LineChart | col-span-3 | queueSeries | none |
| incidents-table | DataTable | col-span-8 | activeIncidents | row click → modal |
| events-feed | ScrollFeed | col-span-8 | recentEvents | none |

### Design tokens

```ts
// tokens.ts
export const dashboardTokens = {
  color: {
    neutral: {
      50: "#fafafa", 100: "#f5f5f5", 200: "#e5e5e5", 400: "#a3a3a3",
      500: "#737373", 700: "#404040", 800: "#262626", 900: "#171717", 950: "#0a0a0a",
    },
    accent: { primary: "#3b82f6" },  // Penumbra blue, for primary chart series
    state: {
      success: "#10b981",
      warning: "#f59e0b",
      danger: "#dc2626",
      info: "#6366f1",
    },
    series: [
      "#3b82f6", "#f59e0b", "#10b981", "#a855f7",
      "#ec4899", "#06b6d4", "#ef4444",
    ],
  },
  density: {
    archetype: "ops",
    kpiFontSize: 22,
    bodyFontSize: 12,
    tilePaddingPx: 8,
    gutterPx: 8,
  },
  type: {
    display: { size: 22, weight: 600 },
    headline: { size: 14, weight: 500 },
    body: { size: 12, weight: 400 },
    caption: { size: 10, weight: 400 },
  },
  chart: {
    gridlineColor: "#262626",
    axisLabelColor: "#737373",
    tooltipStyle: { background: "#171717", border: "1px solid #404040", fontSize: 11 },
  },
};
```

Colors reviewed against deuteranopia simulator — green/red distinctions backed by shape (●/▲) and text labels. ✅

### ★ Gate: Layout look right?

User confirmed. Proceed to prototype.

---

## Phase 3: React Prototype

Building `prototype.tsx` with Recharts + Tailwind. Mock data uses realistic entity names (real IT service names from PenThreshold integration list in the upstream data-architect handoff).

### Key prototype decisions

- Dark background (`bg-neutral-950`) for 24/7 wall monitor comfort
- Monospace tabular numerals for all metric values (prevents column jitter on refresh)
- Status indicators use color + shape + text (WCAG + glance legibility)
- Throughput chart has reference line at baseline threshold, dashed
- Incidents table sorts by severity then age; conditional row backgrounds for critical
- Recent events feed auto-scrolls, user can pause with hover

### Mock data samples

```ts
// mock-data.ts (excerpted)
export const mockKpis: KpiTile[] = [
  { id: "sync-lag", label: "LMS Sync Lag", value: "4.2m", status: "warn", sub: "threshold: 5m" },
  { id: "compliance", label: "Compliance", value: "87.3%", status: "ok", sub: "target: 85%" },
  { id: "alerts", label: "Active Alerts", value: "3", status: "warn", sub: "2 warn, 1 crit" },
  { id: "integration", label: "Integrations", value: "7/8", status: "warn", sub: "ServiceNow degraded" },
  { id: "ticket-rate", label: "Tickets/hr", value: "12", status: "ok", sub: "7d avg: 10" },
  { id: "overdue-60", label: "Overdue >60d", value: "47", status: "crit", sub: "↑ 6 from yesterday" },
  { id: "queue", label: "Queue Depth", value: "23", status: "ok", sub: "max: 50" },
  { id: "throughput", label: "Completions/hr", value: "89", status: "ok", sub: "7d avg: 76" },
];

// Throughput series — realistic shape with trend, noise, weekend dip
export const throughputSeries = generateOpsTimeSeries({
  intervalMinutes: 5,
  durationHours: 24,
  baseline: 80,
  noiseRatio: 0.15,
  outlierProbability: 0.02,
});

// Incidents — real integration names
export const incidents: Incident[] = [
  { id: "INC-4821", service: "ServiceNow Connector", severity: "critical", ageMinutes: 47, owner: "on-call" },
  { id: "INC-4820", service: "Azure AD Sync", severity: "warning", ageMinutes: 12, owner: "IT Ops" },
  { id: "INC-4819", service: "Power BI Refresh", severity: "warning", ageMinutes: 8, owner: "Data Team" },
];
```

### /oc-df-audit result

All 13 checks passed:
- ✅ Archetype defense tied to wall-monitor context + on-call role + 2-min refresh
- ✅ Primary question declared in spec header
- ✅ Density fits ops (8 KPIs at 22px, body 12px, padding 8px)
- ✅ Every color has a named role
- ✅ Chart fit (line for time-series, table for incidents, KPI tiles for current state)
- ✅ Colorblind safe (status = color + shape + text)
- ✅ ≤7 series per chart (throughput has 2, queue has 4)
- ✅ Drill paths declared per tile
- ✅ Mock data: named entities, plausible ranges, non-uniform distribution, 288 data points per series
- ✅ Type ramp: 4 sizes (22/14/12/10)
- ✅ Spacing: all 8/16/24 from the scale
- ✅ Contrast spot-checked on 5 tiles, all ≥7:1
- ✅ Charts have titles and accompanying data tables in alt view

---

## Phase 4: Handoff

### Bundle created

```
/home/claude/penthreshold/dash-forge-handoff/
├── spec.md                 (design spec + rationale)
├── tokens.ts               (design tokens)
├── types.ts                (TypeScript types)
├── prototype.tsx           (working React prototype, ~340 lines)
├── mock-data.ts            (generators + instances, ~180 lines)
├── README.md               (what's shown, what's mocked)
├── audit-report.md         (13-check audit output)
└── integration-notes.md    (wiring to Power BI semantic model)
```

### Integration notes (excerpt)

```md
## Wiring to Real Data

This prototype uses mock data in `mock-data.ts`. To wire to real data:

1. Replace `mockKpis`, `throughputSeries`, `incidents`, `events` imports with live data hooks
2. All types in `types.ts` match the data-architect handoff schema — no transformation needed
3. KPI values come from aggregations over the compliance schema (see data-architect-handoff.md §5 Top 10)
4. Throughput series: SELECT completions grouped by 5-minute windows over last 24h
5. Incidents: the incidents table is the existing ServiceNow integration — wire via /incidents API, poll every 2 min
6. Recent events: EventHub stream, last 50 events

### Return to oc-app-architect

> `/oc-app-architect` → add "PenThreshold Ops Dashboard" to Phase 3d punch list with source=oc-dash-forge
> Build sprint estimate: S (4–6 hours, mostly wiring)
```

### Parent checkpoint updated

oc-app-architect's checkpoint now has:

```jsonc
"sub_skill_invocations": [
  {
    "skill": "oc-dash-forge",
    "checkpoint_path": "/home/claude/penthreshold/.checkpoints/oc-dash-forge.checkpoint.json",
    "status": "complete",
    "handoff_path": "/home/claude/penthreshold/dash-forge-handoff/"
  }
]
```

---

## What Good Looks Like — Extracted Principles

Re-reading this run, the things to imitate:

1. **Adaptive intake worked.** 5 questions because upstream context was rich — don't force 15 when 5 suffices.
2. **Archetype pick was defended with specifics.** "Wall monitor + on-call + 2-min refresh" — three concrete intake answers.
3. **Every tile has a declared drill path.** Not "some of them are clickable" — every one.
4. **Mock data is real.** "ServiceNow Connector" and "Azure AD Sync" not "Integration A" and "Integration B".
5. **Tokens handed back up.** `tokens.ts` is in a format oc-ux-engineer can consume for its component library.
6. **Audit passed before handoff.** 13 checks documented, not skipped.
