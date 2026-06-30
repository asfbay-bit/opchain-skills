# React Patterns for Dashboard Prototypes

Stack-specific boilerplate and mock-data patterns for the Phase 3 prototype build.

**Pipeline context:** This file feeds Phase 3 of oc-dash-forge.

---

## TypeScript Types — Derive from Schema

All `DashboardData`, `OpsData`, `AnalystData` types in the examples below are **derived from the upstream schema** (data-architect handoff, or if standalone, inferred from the data source).

Before writing the prototype:

1. Read the schema (from data-architect handoff or intake)
2. Define types in `types.ts` that mirror the tables and computed metrics
3. Mock data conforms to those types

Example:

```ts
// types.ts — derived from data-architect-handoff.md
export type ComplianceKPI = {
  id: string;
  label: string;
  value: number;
  target: number;
  deltaType: "increase" | "moderateIncrease" | "unchanged" | "moderateDecrease" | "decrease";
  deltaLabel: string;
};

export type TrendPoint = {
  month: string;       // "2025-10" format
  actual: number;
  target: number;
};

export type DashboardData = {
  asOf: string;
  kpis: ComplianceKPI[];
  trend: TrendPoint[];
  changes: { name: string; value: number }[];
};
```

This keeps the prototype plug-compatible with the real data source — when oc-app-architect wires it up, the types don't change.

---

## Viz Stack by Archetype

| Archetype | Primary | Supplement | Install |
|---|---|---|---|
| Exec | Tremor | — | `@tremor/react` |
| Ops | Recharts | Tailwind | `recharts` |
| Analyst | D3 | Recharts + shadcn Data Table | `d3`, `recharts`, `@tanstack/react-table` |

---

## Tremor (Exec)

Opinionated components optimized for exec dashboards. Fast to build, limited customization — which is the point.

### Boilerplate

```tsx
import { Card, Metric, Text, Title, Flex, BadgeDelta, AreaChart, BarList } from "@tremor/react";

export default function ExecDashboard({ data }: { data: DashboardData }) {
  return (
    <main className="p-8 bg-neutral-50 min-h-screen">
      <header className="mb-8">
        <Title>Q4 2025 Business Review</Title>
        <Text>As of {data.asOf}</Text>
      </header>

      {/* KPI row */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
        {data.kpis.map((kpi) => (
          <Card key={kpi.name}>
            <Flex justifyContent="between" alignItems="center">
              <Text>{kpi.name}</Text>
              <BadgeDelta deltaType={kpi.deltaType}>{kpi.deltaLabel}</BadgeDelta>
            </Flex>
            <Metric className="mt-2">{kpi.value}</Metric>
            <Text className="mt-1 text-neutral-500">vs target {kpi.target}</Text>
          </Card>
        ))}
      </div>

      {/* Primary chart + narrative */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-6">
        <Card className="lg:col-span-2">
          <Title>Revenue Trend</Title>
          <AreaChart
            className="mt-6 h-72"
            data={data.trend}
            index="month"
            categories={["Actual", "Target"]}
            colors={["blue", "neutral"]}
            valueFormatter={(n) => `$${(n/1e6).toFixed(1)}M`}
          />
        </Card>
        <Card>
          <Title>What Changed</Title>
          <BarList data={data.changes} className="mt-4" />
        </Card>
      </div>
    </main>
  );
}
```

### Exec density checklist

- Generous padding (`p-8`, `mb-6`, `gap-4` minimum)
- Large metrics (`<Metric>` renders 32–48px)
- Max 4 KPI tiles in a row
- Minimal colors — accent on 1–2 elements
- Whitespace > tiles

---

## Recharts (Ops)

Flexible, composable, handles real-time updates cleanly.

### Boilerplate

```tsx
import { LineChart, Line, XAxis, YAxis, Tooltip, ReferenceLine, ResponsiveContainer } from "recharts";

export default function OpsDashboard({ data }: { data: OpsData }) {
  return (
    <main className="p-3 bg-neutral-950 text-neutral-100 min-h-screen font-sans">
      {/* Status bar */}
      <header className="flex items-center justify-between text-xs text-neutral-400 mb-2">
        <span>Last update: {data.lastUpdate}</span>
        <span>Auto-refresh: 30s</span>
      </header>

      {/* Dense KPI grid */}
      <div className="grid grid-cols-8 gap-2 mb-3">
        {data.kpis.map((kpi) => (
          <div key={kpi.id} className="bg-neutral-900 border border-neutral-800 rounded p-2">
            <div className="text-[10px] text-neutral-500 uppercase tracking-wide">{kpi.label}</div>
            <div className="flex items-baseline justify-between mt-0.5">
              <span className="text-xl font-mono tabular-nums">{kpi.value}</span>
              <StatusDot status={kpi.status} />
            </div>
            <div className="text-[10px] text-neutral-500 mt-0.5">{kpi.sub}</div>
          </div>
        ))}
      </div>

      {/* Main chart + queue */}
      <div className="grid grid-cols-3 gap-2 mb-3">
        <div className="col-span-2 bg-neutral-900 border border-neutral-800 rounded p-3">
          <div className="text-xs text-neutral-400 mb-2">Throughput (last 60 min)</div>
          <ResponsiveContainer width="100%" height={200}>
            <LineChart data={data.throughput}>
              <XAxis dataKey="t" tick={{ fill: "#737373", fontSize: 10 }} />
              <YAxis tick={{ fill: "#737373", fontSize: 10 }} />
              <ReferenceLine y={data.threshold} stroke="#dc2626" strokeDasharray="3 3" />
              <Line type="monotone" dataKey="value" stroke="#3b82f6" strokeWidth={1.5} dot={false} />
              <Tooltip contentStyle={{ background: "#171717", border: "1px solid #404040", fontSize: 11 }} />
            </LineChart>
          </ResponsiveContainer>
        </div>
        <QueueDepthTile data={data.queues} />
      </div>

      {/* Incidents table */}
      <IncidentsTable incidents={data.incidents} />
    </main>
  );
}

function StatusDot({ status }: { status: "ok" | "warn" | "crit" }) {
  const colors = { ok: "bg-emerald-500", warn: "bg-amber-500", crit: "bg-red-500" };
  return <span className={`inline-block w-2 h-2 rounded-full ${colors[status]}`} />;
}
```

### Ops density checklist

- Tight padding (`p-2`, `gap-2`)
- 8+ column grid common
- Monospace for numbers (`font-mono tabular-nums`)
- Dark background for long viewing sessions
- Status as color + shape + text (never color alone)

---

## D3 (Analyst)

For custom exploration: linked brushing, drill, unusual viz types.

### Pattern: linked brush + detail

```tsx
import { useEffect, useRef, useState } from "react";
import * as d3 from "d3";

export default function AnalystView({ data }: { data: AnalystData }) {
  const [dateRange, setDateRange] = useState<[Date, Date] | null>(null);
  const [selectedSegment, setSelectedSegment] = useState<string | null>(null);

  const filtered = useMemo(() =>
    data.rows.filter(r =>
      (!dateRange || (r.date >= dateRange[0] && r.date <= dateRange[1])) &&
      (!selectedSegment || r.segment === selectedSegment)
    ),
    [data.rows, dateRange, selectedSegment]
  );

  return (
    <main className="p-4 bg-white min-h-screen">
      <Filters dateRange={dateRange} onDateRangeChange={setDateRange} />

      <BrushChart
        data={data.trend}
        onBrush={setDateRange}
        height={220}
      />

      <div className="grid grid-cols-2 gap-4 mt-4">
        <PivotTable data={filtered} onSegmentClick={setSelectedSegment} />
        <SmallMultiples data={filtered} />
      </div>

      <AnomalyFlags data={data.anomalies} onDrill={(a) => {/* open detail */}} />
    </main>
  );
}

function BrushChart({ data, onBrush, height }: Props) {
  const ref = useRef<SVGSVGElement>(null);

  useEffect(() => {
    if (!ref.current) return;
    const svg = d3.select(ref.current);
    // ... standard d3 setup with brush that calls onBrush with selected range
  }, [data]);

  return <svg ref={ref} width="100%" height={height} />;
}
```

### Analyst tips

- Keep state in React, use D3 only for rendering
- Use `useMemo` aggressively — analyst views run many filters
- shadcn `<DataTable>` for any tabular work
- Provide a "reset" button — filtered state gets confusing fast
- Export to CSV belongs on analyst views

---

## Mock Data Patterns

### Do

**Realistic entities with names**
```ts
const customers = [
  { id: "cust_001", name: "Northshore Logistics", tier: "enterprise" },
  { id: "cust_002", name: "Kestrel Analytics", tier: "midmarket" },
  { id: "cust_003", name: "Blue Heron Medical", tier: "enterprise" },
  { id: "cust_004", name: "Westford Retail Co", tier: "smb" },
  // 20–50 more...
];
```

**Realistic time series with shape**
```ts
// Trend + noise + seasonality + occasional outlier
function generateTrend(days: number, base: number, trend: number): DataPoint[] {
  return Array.from({ length: days }, (_, i) => {
    const trendValue = base + trend * i;
    const seasonality = Math.sin((i / 7) * Math.PI) * base * 0.08;  // weekly
    const noise = (Math.random() - 0.5) * base * 0.05;
    const outlier = Math.random() < 0.02 ? base * 0.3 * (Math.random() - 0.5) : 0;
    const date = new Date(Date.now() - (days - i) * 86400000);
    return {
      date: date.toISOString().split("T")[0],
      value: Math.max(0, Math.round(trendValue + seasonality + noise + outlier)),
    };
  });
}
```

**Realistic distributions**
```ts
// Power law for revenue by customer — not uniform
function generateRevenuePerCustomer(customers: Customer[]): Record<string, number> {
  return Object.fromEntries(
    customers.map((c, i) => [
      c.id,
      Math.round(100_000 / Math.pow(i + 1, 0.85) * (0.8 + Math.random() * 0.4))
    ])
  );
}
```

### Don't

- `[1, 2, 3, 4, 5]` — too clean, hides layout bugs
- All identical values — charts look broken when they render correctly
- 10 rows when the real dataset is 10,000 — densities lie
- Perfect uniformity — real data has outliers, gaps, weekend dips
- Names like "Customer A", "Product 1" — real dashboards show "Acme Corp"

### Sizing guide

| Chart type | Minimum mock rows | Realistic |
|---|---|---|
| Sparkline | 10 | 30–60 |
| Line chart | 20 | 90–365 |
| Bar chart | 3 | 8–25 |
| Table | 10 | 50–500 (with pagination) |
| Heatmap | 25 cells | 100+ cells |
| Small multiples | 4 panels × 10 points | 6–12 panels × 30+ points |

---

## File Organization

For the Phase 3 prototype artifact:

```
dash-forge-handoff/
├── prototype.tsx          # Main component, default export
├── mock-data.ts           # Mock data generators + instances
├── types.ts               # TypeScript types
├── components/            # Sub-components if >200 lines
│   ├── KPITile.tsx
│   ├── TrendChart.tsx
│   └── IncidentsTable.tsx
└── README.md              # What's shown, what's interactive, what's mocked
```

For simple prototypes (<300 lines), a single `prototype.tsx` file is fine.

---

## Prototype README Template

```md
# [Project Name] Dashboard Prototype

## Archetype
[Exec / Ops / Analyst]

## What's rendered
- [Tile 1] with [data source]
- [Tile 2] with [data source]
- ...

## Interactivity
- [What's clickable / filterable]
- [What drills where]

## What's mocked
- All data is synthetic — see `mock-data.ts`
- No API calls, no auth
- [Any other mocked behavior]

## To wire to real data
- Replace `mockData` imports with API calls
- Match the TypeScript types in `types.ts`
- See `integration-notes.md` in the handoff for backend hooks
```

---

## Performance Defaults

- **Memoize derived data.** `useMemo` on filtered arrays, aggregations.
- **Virtualize long tables.** Use `@tanstack/react-virtual` or TanStack Table's built-in virtualization past 100 rows.
- **Lazy-load drilldowns.** Don't render hidden modals until opened.
- **Debounce slider filters.** 150ms is usually right.

Skip these only for toy prototypes.
