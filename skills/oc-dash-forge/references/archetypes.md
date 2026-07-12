# Dashboard Archetypes

Three archetypes. Every dashboard picks one primary. Hybrid designs fail — pick one, offer a toggle for the other use case.

**Pipeline context:** This file feeds Phase 1 of oc-dash-forge. Phase 0 intake drives the pick.

---

## Executive (Exec)

### Who

C-suite, VPs, senior directors, board members. People with strategic authority but limited time for detail.

### Primary decisions

- Is the business on track?
- Which areas need attention this month / quarter?
- Approve / veto / re-prioritize

### Viewing context

- Opened on a laptop during review, or shown on a projector
- 30 seconds to 2 minutes of attention per view
- Often shared as a PDF / slide / email screenshot

### Density

**Low.** 5–12 tiles total. Big type, generous whitespace.

- KPI numbers: 32–48px
- Section headers: 20–24px
- Body: 16–18px
- Max 3–4 charts on screen
- Each tile earns its place — no filler

### What belongs

- Top-level KPIs with target / prior-period comparison
- Trend line for each KPI (sparkline or small line chart)
- 1–3 narrative "call-outs" — what changed, why it matters
- Period-over-period summary (this month vs. last, YoY)
- Exception list — only the top 3–5 things requiring attention

### What doesn't belong

- Real-time data (exec decisions don't need sub-daily granularity)
- Operational detail (ticket queues, server health)
- Multi-dimensional drilldowns
- Scroll. If it doesn't fit, cut something.

### Default viz stack

**Tremor.** Opinionated component library, matches exec density out of the box, fast build.

Components to favor:
- `<Card>` with large KPI + small sparkline
- `<LineChart>` for trends
- `<BarList>` for ranked callouts
- `<DonutChart>` only for 2–4 slice compositions

### Example layout pattern

```
┌────────────────────────────────────────────┐
│  [Period selector]         [Export/Share]  │
├──────────┬──────────┬──────────┬───────────┤
│  KPI 1   │  KPI 2   │  KPI 3   │  KPI 4    │
│  vs tgt  │  vs tgt  │  vs tgt  │  vs tgt   │
├──────────┴──────────┼──────────────────────┤
│                     │                      │
│   Primary trend     │   What changed       │
│   (large chart)     │   (narrative + list) │
│                     │                      │
├─────────────────────┴──────────────────────┤
│  Exceptions: top 3–5 items needing review  │
└────────────────────────────────────────────┘
```

---

## Operations (Ops)

### Who

Operators, on-call engineers, support leads, network ops, trading desk, logistics coordinators. People executing on the system in real time.

### Primary decisions

- What's broken right now?
- What needs intervention in the next minutes / hours?
- Is the system within operating tolerances?

### Viewing context

- Wall display, large monitor, or ops console
- Continuous glance-over — checked every few seconds to every few minutes
- Multiple users viewing the same display simultaneously

### Density

**High.** 15–50 tiles. Small type, tight spacing, data-ink maximized.

- KPI numbers: 20–24px (but many of them)
- Body: 12–13px
- Status indicators: color-coded, shape-coded, text-labeled (all three — glance legibility)
- Grid-heavy, minimal chrome

### What belongs

- Real-time / near-real-time metrics
- Status indicators (green/yellow/red — with text + shape for a11y)
- Active alerts / incidents with duration
- Queue depths, throughput, latency percentiles (P50 / P95 / P99)
- Recent events log (scrolling or expanding)
- Geographic / topological views if relevant

### What doesn't belong

- Narrative commentary (no time to read)
- YoY comparisons (not the time scale that matters)
- Aspirational or forecast data
- Trend lines without a threshold reference

### Default viz stack

**Recharts + Tailwind.** Recharts handles real-time updates and custom refs; Tailwind for dense tile layouts.

Components to favor:
- Dense KPI tiles in a grid
- `<LineChart>` with reference lines for thresholds
- Status table with conditional row coloring
- Sparklines embedded in table cells

### Example layout pattern

```
┌────────────────────────────────────────────────────┐
│  [Last update: 12s ago]       [Refresh: auto 30s]  │
├──────┬──────┬──────┬──────┬──────┬──────┬──────────┤
│  M1  │  M2  │  M3  │  M4  │  M5  │  M6  │  M7      │
│ ▲0.2 │ ●OK  │ ▼2.1 │ ●OK  │ ▲0.8 │ ●OK  │  ●OK     │
├──────┴──────┴──────┴──────┴──────┴──────┴──────────┤
│  Throughput (last 60 min)  │  Queue Depth          │
│  [line chart]              │  [stacked bar]        │
├────────────────────────────┴───────────────────────┤
│  Active Incidents (3)                              │
│  [table: id / service / severity / age / owner]    │
├────────────────────────────────────────────────────┤
│  Recent Events [scrolling feed]                    │
└────────────────────────────────────────────────────┘
```

---

## Analyst

### Who

Data analysts, product managers, researchers, business intelligence users. People asking follow-up questions.

### Primary decisions

- What's actually driving the number?
- What's different about segment X?
- What's the story behind the anomaly?

### Viewing context

- Laptop or dual-monitor workstation
- 10 minutes to several hours per session
- Mouse-driven exploration, filters, drill-downs

### Density

**Variable.** Starts medium, grows to high on drill. Interaction-heavy.

- KPI numbers: 18–22px
- Body: 13–14px
- Dense tables common, with sort / filter controls
- Multiple linked views

### What belongs

- Primary metric with decomposition controls
- Segment comparisons (geo, product, cohort, time)
- Pivot-style tables with grouping / filtering
- Linked views — click chart filters table filters map
- Custom time range picker
- Outlier / anomaly flags with drill-to-detail
- Data export / schedule

### What doesn't belong

- Prescriptive narrative ("you should do X") — analysts form their own narrative
- Over-polished summaries that hide the raw data
- Fixed time ranges — always give the picker

### Default viz stack

**D3 for custom, Recharts for standard.**

- D3 when: linked brushing, custom drill animations, unusual viz (sankey, chord, network)
- Recharts when: standard chart types are enough (line, bar, scatter, heatmap)
- shadcn/ui Data Table for tabular work (sort, filter, pagination built in)

### Example layout pattern

```
┌───────────────────────────────────────────────────────┐
│ [Metric ▾] [Date Range ▾] [Segment: Region ▾]  [⤓]   │
├───────────────────────────────────────────────────────┤
│  Headline metric with decomposition                   │
│  [line chart with brush control]                      │
├─────────────────────┬─────────────────────────────────┤
│                     │  Segment breakdown              │
│  Pivot table        │  [small multiples]              │
│  (linked)           │                                 │
│                     │                                 │
├─────────────────────┴─────────────────────────────────┤
│  Anomaly flags / outliers [click to drill]            │
└───────────────────────────────────────────────────────┘
```

---

## Hybrid Use Cases

When the intake reveals multiple user types, don't design a chimera. Pick a primary and handle the secondary with one of:

1. **Density toggle** — "Simple view" / "Detail view" switch. Exec + Analyst coexist on same data.
2. **Escalation path** — Ops tile → click → Analyst drill view. Different archetypes, separated by navigation.
3. **Role-based landing** — Login role determines default dashboard. Same data, different lens.
4. **Report mode** — Ops dashboard with a "Weekly Summary" export that produces exec view.

Never split the difference by making everything medium density. That's how you get dashboards nobody loves.

---

## Archetype Decision Prompt

If intake is ambiguous, ask:

> "If this dashboard could only answer **one** question, for **one** person's decision, what would it be?"

The answer names the archetype:

- "Is revenue on track this quarter?" → Exec
- "Is any service in distress right now?" → Ops
- "Why did conversion drop for enterprise customers in EMEA?" → Analyst
