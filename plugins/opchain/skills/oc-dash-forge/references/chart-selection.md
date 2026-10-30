# Chart Selection Decision Tree

Pick the right chart for the data shape. Wrong chart = user can't read the story, no matter how well-styled.

**Pipeline context:** This file feeds Phase 2 and Phase 3 of oc-dash-forge.

---

## The Decision Tree

### Step 1: What's the data shape?

| Shape | Go to |
|---|---|
| Single number, point in time | § Single Value |
| Single metric over time | § Time Series (single) |
| Multiple metrics over time | § Time Series (multi) |
| Comparison across categories | § Categorical Comparison |
| Part-to-whole | § Part-to-Whole |
| Distribution of one variable | § Distribution |
| Relationship between two variables | § Correlation |
| Geographic | § Geographic |
| Hierarchical / nested | § Hierarchical |
| Network / flow | § Network / Flow |
| Tabular with many dimensions | § Table |

### Step 2: What's the question?

Chart type should match the question, not just the shape. "What's the trend" and "what's the outlier" on the same data want different charts.

---

## § Single Value

Question: "What's the current state of X?"

**Use:**
- **Big number + trend sparkline + comparison** — the KPI pattern. Best default.
- **Bullet chart** — when comparison against target is central
- **Stoplight indicator** — when binary/tertiary state is the point (ops only)

**Avoid:**
- Gauges — low information density, wastes space
- Speedometers — same problem, more chrome

---

## § Time Series (Single)

Question: "How has X changed over time?"

**Use:**
- **Line chart** — continuous data, >10 points
- **Area chart** — when cumulative magnitude matters alongside trend
- **Column/bar chart** — discrete periods, <15 bars
- **Sparkline** — inline with other content, context over precision

**Add reference lines for:**
- Target / goal
- Prior period average
- Threshold (anomaly flag)

**Avoid:**
- Smoothed / interpolated lines on discrete data (lies about values between points)
- Starting Y-axis at non-zero without explicit callout (Tufte's "lie factor")

---

## § Time Series (Multi)

Question: "How have X, Y, and Z changed over time?"

**Use:**
- **Multi-line chart** — up to ~5 series
- **Small multiples** — ≥6 series or when comparing any two pairs matters
- **Stacked area** — when total matters AND composition matters
- **100% stacked area** — when only composition matters over time

**Avoid:**
- 12-series line charts (rainbow problem)
- Stacked line charts without area fills (ambiguous)
- Dual-axis combo unless units genuinely require it (confuses more than it clarifies)

### Series overload rule

If you have >5 series and users need to compare specific pairs, use small multiples. If they just need to see totals over time, stacked area.

---

## § Categorical Comparison

Question: "How does X compare across A, B, C, D?"

**Use:**
- **Horizontal bar chart** — long category labels, ranked comparison, 5–30 categories
- **Vertical column chart** — time-like progression on x-axis, <15 categories
- **Lollipop chart** — same as bar but less ink, good when bars feel heavy
- **Dot plot** — for precise values with multiple categories
- **Grouped bar** — two dimensions, 2–4 groups × 2–8 categories
- **Heatmap** — two categorical dimensions with quantitative cells

**Avoid:**
- Pie charts with >5 slices (use bars)
- 3D bars, ever
- Sorted bars without a clear sort reason (alphabetical is usually wrong; sort by value)

---

## § Part-to-Whole

Question: "What share of the total is each part?"

**Use:**
- **Stacked bar (single)** — simplest, if you have the horizontal space
- **Pie chart** — only if 2–5 slices and approximate share is enough
- **Donut chart** — same as pie, with room for a center label
- **Treemap** — many parts, hierarchical, when relative size matters more than precise value
- **Waffle chart** — discrete count-based shares (good for small populations)

**Avoid:**
- Pie with >5 slices
- Multiple pies side-by-side for comparison (use stacked or grouped bars)
- 3D pies (banned on sight)

---

## § Distribution

Question: "How are values distributed?"

**Use:**
- **Histogram** — continuous data, shape of distribution
- **Box plot** — when median + quartiles + outliers matter
- **Violin plot** — distribution shape + box plot, when comparing multiple groups
- **Strip plot / jitter plot** — small N, show every point
- **Density plot / ridgeline** — comparing distributions across groups

---

## § Correlation

Question: "How does X relate to Y?"

**Use:**
- **Scatter plot** — two continuous variables
- **Bubble chart** — scatter + third dimension (size)
- **Heatmap (matrix)** — correlation matrix for many variables
- **Connected scatter** — ordered scatter showing trajectory over time

**Avoid:**
- Dual-axis line chart as a correlation indicator — implies relationship that may not exist

---

## § Geographic

Question: "How does X vary by location?"

**Use:**
- **Choropleth** — regions colored by value; good for admin boundaries
- **Proportional symbols** — circles sized by value on a map; better for point locations
- **Heatmap on map** — density of events
- **Flow map** — movements / connections between places

**Avoid:**
- Choropleth for raw counts (bigger regions look bigger — normalize by population or use proportional symbols)
- Fancy 3D globes when 2D suffices

---

## § Hierarchical

Question: "How do parts nest within wholes?"

**Use:**
- **Treemap** — rectangular nested areas, size by value
- **Sunburst** — radial version, good for 3+ levels
- **Icicle plot** — horizontal/vertical version of sunburst, better labels
- **Nested bar chart** — simpler, good for 2 levels

---

## § Network / Flow

Question: "What connects to what? What flows where?"

**Use:**
- **Sankey diagram** — flow magnitude between nodes (funnels, migration)
- **Chord diagram** — bidirectional flow between categories
- **Force-directed graph** — network structure, relationships
- **Arc diagram** — linear layout, arcs show connections

These almost always need D3. Recharts doesn't cover them natively.

---

## § Table

Question: "Show me the numbers."

**Use tables when:**
- Users need precise values
- Multiple dimensions where no chart captures all
- Users need to sort, filter, export
- The answer is "a list of rows"

**Upgrade tables with:**
- Inline sparklines (trend per row)
- Inline bar (comparison within column)
- Conditional formatting (highlight outliers, not every cell)
- Frozen header/columns on scroll
- Tabular numerals, right-aligned numbers

Tables are not a failure of imagination. They are often the right answer.

---

## Anti-Patterns (Hard No)

1. **Pie chart with >5 slices** — use bars
2. **3D anything** — breaks perception, lies about values
3. **Dual-axis without explicit labeling** — implies false correlation
4. **Rainbow line chart (>7 series in one chart)** — unreadable
5. **Donut with center number that doesn't match the ring total** — confuses
6. **Time on Y-axis** — time goes on X (unless it's specifically a Gantt)
7. **Non-zero Y-axis without callout** — exaggerates changes (Tufte's lie factor)
8. **Radar / spider chart with inconsistent scales** — broken comparison
9. **Gauges for continuous metrics** — use big number + sparkline instead
10. **Bar chart with unsorted bars when sort by value would help** — makes ranking invisible

---

## Chart Quality Questions

Before shipping any chart, ask:

1. What's the question this chart answers? (If you can't state it in one sentence, wrong chart.)
2. Does the chart type match the data shape?
3. What's the take-away in 3 seconds?
4. Is every chart element (color, size, gridline) pulling its weight?
5. Would a table be clearer?
6. Colorblind safe?
7. Screen reader accessible?
