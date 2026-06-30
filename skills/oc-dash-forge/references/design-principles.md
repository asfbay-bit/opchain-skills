# Design Principles for Dense Information UI

Distilled from Edward Tufte, Stephen Few, Colin Ware, and hard-won practice. These are the rules that make dense dashboards legible — violate them deliberately, not by accident.

**Pipeline context:** This file feeds Phase 2 of oc-dash-forge.

---

## Core Principles

### 1. Maximize data-ink ratio (Tufte)

Every pixel of a chart should serve the data. Delete everything that doesn't.

**Cut:**
- 3D effects
- Heavy gridlines (use light, or none)
- Redundant legends when direct labels work
- Background fills on chart areas
- Chart junk: shadows, gradients, ornaments
- Tick marks on axes that already have gridlines

**Keep:**
- Data marks
- One axis reference (not both when one suffices)
- Labels directly on data where it doesn't collide

### 2. Small multiples beat stuffed charts (Tufte)

If you have 8 series and want to compare them, 8 small line charts of the same scale beat one rainbow line chart.

Rule: if a chart has >5 series and readers need to compare any two, split into small multiples with consistent axes.

### 3. Sparklines in context (Tufte)

Numbers with trend context > numbers alone.

```
Revenue:  $2.4M   ▁▂▃▅▇█▇▅   +14% MoM
```

The sparkline takes almost no space and adds huge context. Use liberally for KPIs.

### 4. Above all else, show the data (Tufte)

If a chart's purpose is decoration, cut it. If a tile is there because "the layout looked empty," cut it.

Dashboards with fewer tiles that answer clear questions beat dashboards with many tiles that don't.

---

## Scannability Hierarchy (Few)

Readers scan in this order. Design accordingly.

1. **Big number (KPI)** — 1 second
2. **Trend indicator** — 2 seconds
3. **Comparison (vs. target / prior)** — 5 seconds
4. **Supporting chart** — 10 seconds
5. **Detail table** — 30+ seconds

If your most important information requires step 4 or 5 to discover, the dashboard is failing its primary job.

### Pre-attentive attributes

Properties the eye catches without effort — reserve these for what matters:

- Color (especially saturation, not just hue)
- Size
- Position (top-left = most attention in left-to-right cultures)
- Orientation (unexpected tilt)
- Motion (use sparingly — reserve for alerts)

**Violation example:** Coloring every tile with brand colors wastes pre-attentive bandwidth. When everything is red, nothing is.

---

## Density Rules by Archetype

| Archetype | Body text | KPI number | Tiles visible | Padding |
|---|---|---|---|---|
| Exec | 16–18px | 32–48px | 5–12 | Generous |
| Ops | 12–13px | 20–24px | 15–50 | Tight |
| Analyst | 13–14px | 18–22px | 8–25 | Medium |

### Density check

Count ink per square inch. Exec dashboards should feel airy. Ops dashboards should feel packed. Analyst dashboards should feel navigable but dense.

Mismatch indicators:
- Exec dashboard feels cluttered → cut tiles
- Ops dashboard feels empty → you're probably wasting screen real estate
- Analyst dashboard feels overwhelming before drilling → start the overview simpler

---

## Color Semantics

Color must have **roles**, not just values.

### Semantic color tokens

| Token | Role | When to use |
|---|---|---|
| `neutral.900` → `neutral.50` | Ink and chrome | 85–90% of visual weight |
| `accent.primary` | Call to action, primary series | 1–2 places max |
| `success` / `warning` / `danger` | State | Only for actual states |
| `info` | Neutral information / annotation | Callouts, footnotes |
| `series.1` → `series.7` | Categorical palette | For multi-series charts |

### Rules

1. **Neutrals dominate.** 85%+ of a dashboard's pixels should be neutral. Color is for attention.
2. **Reserve red and green for state.** If red means "our brand" and also "error," the brand is undermining legibility. Pick one.
3. **Colorblind safe is not optional.** Test with a simulator. Red + green alone = fail. Add shape, position, or text.
4. **Sequential data wants sequential palette.** Don't use a categorical rainbow for ordered data (low → high temperature is a gradient, not 7 hues).
5. **Dark mode is a separate palette.** Don't invert by reflex. Saturation and contrast behave differently on dark backgrounds.

### Anti-pattern: the rainbow chart

A 12-series line chart in 12 distinct hues is unreadable. Solutions:
- Highlight 2–3 series, gray the rest to show context
- Split into small multiples
- Let the user pick which series are active
- Aggregate the tail into "Other"

---

## Typography for Data UI

### Scale

One type ramp, 4 levels max:

1. **KPI number** — 32–48px (exec) / 20–24px (ops) / 18–22px (analyst)
2. **Headline** — 18–24px
3. **Body / label** — 12–14px (varies by archetype)
4. **Caption / metadata** — 11–12px

Every extra size is a tax on scanning.

### Numerals

- Use **tabular** numerals (monospace width) for columns of numbers. Proportional numerals make "123" and "456" different widths and ruin table scanning.
- Right-align numeric columns.
- Unit indicators (%, $, ms) should be smaller than the number or subtly styled.

### Font choice

- Sans-serif for UI, almost always. Inter, Geist, SF Pro, Roboto.
- Mono for numeric data and code.
- Avoid display fonts — they're decorative, not informational.

---

## Layout Patterns

### The Z-pattern (exec)

Eye travels top-left → top-right → middle → bottom-left → bottom-right. Put the primary KPI top-left. Put the "so what" bottom.

### The grid (ops)

Eye scans like a table. Consistent tile sizes, predictable positions. Users learn "server health is always top-right."

### The overview + detail (analyst)

Summary on top (what's happening), detail on the bottom or expanding (why). Brushing / linking between them.

---

## Interaction Principles

1. **Default to the primary answer.** Don't make users filter to see the main thing.
2. **Filters are global OR local — be clear which.** A filter applied to one tile should look different from one that filters everything.
3. **Drill should be predictable.** If one tile drills to a modal, don't have another drill to a new page. Pick a drill metaphor.
4. **Time range is almost always global.** One picker, affects everything. Exceptions need clear visual separation.
5. **Refresh indicators belong in ops dashboards only.** Exec dashboards shouldn't show "last updated 12s ago." Daily refresh is enough.

---

## Accessibility Floor

Not optional. Every oc-dash-forge output must pass these:

1. **Text contrast:** 4.5:1 for body, 3:1 for large text. Test with a contrast checker.
2. **Color alone never carries meaning.** Every color distinction backed by text, shape, or position.
3. **Charts have text alternatives.** A `<title>` and `<desc>` for screen readers, or an accompanying data table.
4. **Focus states visible.** Tab through the dashboard — every interactive element should show focus.
5. **Type sizes don't break below 12px.** Even for captions. 11px is for error messages on user-agent choice.

---

## Edward Tufte's Six Principles (applied to dashboards)

1. **Documentation of the data** — labels, units, sources visible
2. **Context for comparison** — every number should have a reference (target, prior, benchmark)
3. **Multivariate display** — more than one dimension per view when useful (but not just for its own sake)
4. **High data density** — match archetype
5. **Integrated text + graphics + tables** — don't silo them; annotate charts directly
6. **Content counts most of all** — if the data isn't worth showing, no amount of design fixes it
