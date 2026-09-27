# Data contract format — `.opchain/data-contracts/*.yaml`

One file per dataset that crosses an ownership boundary. Written by
`/oc-data-ops contracts` (Designer), replayed by `/oc-data-ops verify`
(Contract-Verifier), compiled into monitors by `/oc-data-ops observe`.
One artifact, three uses — review, verification, monitoring cannot drift
apart.

## Full example

```yaml
# .opchain/data-contracts/marts.orders_daily.yaml
version: 1
dataset: marts.orders_daily
owner: data-team            # who fixes it
consumers:                  # who gets told
  - { name: "revenue dashboard", via: oc-dash-forge }
  - { name: "aov metric", via: oc-signal-forge }
grain: "one row per order per day"
schema:
  evolution: additive-only   # additive-only | versioned
  columns:
    - { name: order_id, type: string, nullable: false, key: true }
    - { name: order_date, type: date, nullable: false, key: true }
    - { name: amount_usd, type: "decimal(12,2)", nullable: false }
    - { name: channel, type: string, nullable: true }
freshness:
  max_staleness: "26h"       # duration
  loaded_at_field: _loaded_at  # required — the column carrying the load
                               #   timestamp (maps directly onto dbt's
                               #   loaded_at_field)
volume:
  per: day
  min_rows: 100
  max_rows: 50000
  window_field: order_date   # optional; defaults to freshness.loaded_at_field
invariants:                  # executed as queries by the Verifier
  - name: non_negative_amounts
    check: "amount_usd >= 0"
  - name: no_future_orders
    check: "order_date <= current_date"
```

## Field rules

- `dataset` uses the layer-qualified name from the Designer's layer map
  (`staging.* | intermediate.* | marts.*`), and the file is named after it:
  `.opchain/data-contracts/<layer.dataset>.yaml` (e.g.
  `marts.orders_daily.yaml`) — so file → dataset mapping is mechanical and
  `staging.orders` can never collide with `marts.orders`.
- `consumers` must be non-empty for marts (**no consumer, no mart**) — staging
  and intermediate datasets may list only their downstream models.
- `schema.evolution: additive-only` means columns may be added, never removed,
  renamed, or retyped. Anything else requires `versioned` with an explicit
  dataset version suffix and a migration window — and that cutover is
  **oc-migration-ops** work, not a quiet contract edit.
- `freshness.max_staleness` and both `volume` bounds are the consumers'
  tolerance, agreed with them — not the pipeline's convenience.
- `invariants[].check` is an **expression, never a query**. Permit column
  references, literals, comparisons, boolean/arithmetic operators, and an
  explicit dialect-specific allowlist of pure scalar functions. Reject `;`,
  SQL comments, subqueries/`SELECT`, DDL/DML, procedure calls, file/network
  functions, and multi-statements before opening a warehouse connection. The
  Verifier compiles a valid expression into its own parameterized/read-only
  `SELECT COUNT(*) ... WHERE NOT (<expression>)` wrapper; it never executes the
  field verbatim. Two or three invariants that matter beat twenty that don't.

## Verifier semantics (`/oc-data-ops verify`)

For each contract, grading only from the contracts, the built pipeline and the data
(never the Builder's reasoning — the roles share one session, so this is a
discipline, not a mechanism):

Use a read-only warehouse identity, an explicitly selected database/schema, a
statement timeout, and a result-row cap. Display the compiled query and target
before execution, with credentials omitted. Any environment that cannot prove
those protections returns BLOCKED rather than running the check.

| Check | PASS when |
|---|---|
| schema | actual columns ⊇ contract columns, types/nullability/keys match, no removals under additive-only |
| freshness | now − max(`loaded_at_field`) ≤ `max_staleness` |
| volume | rows where `window_field` falls in the last `per` window ∈ [min, max] |
| invariants | every check returns zero violating rows |
| evolution | diff vs. the last-verified snapshot obeys the declared policy |

**Evolution baseline:** on each PASS the Verifier writes the observed schema to
`.opchain/data-contracts/.verified/<layer.dataset>.json`; the evolution check
diffs against that snapshot. First run: no snapshot → record it and PASS.
Snapshots are committed alongside the contracts so a Verifier in a later session
always has its baseline.

Two further verdicts: **BLOCKED** — a data-dependent check (freshness, volume,
invariants) with no reachable warehouse; never a PASS. **PASS (fixtures)** — a
check executed against fixture rather than warehouse data, recorded distinctly.
**PASS (fixtures) never updates the `.verified/` snapshot — only a
warehouse-backed PASS does** (a fixture-derived baseline would pollute exactly
the drift record the snapshot exists to keep).

Any failed check → VIOLATION with evidence (the offending diff, timestamp, or
sample rows). Violations fail the loop iteration; the Builder fixes.

## Monitor compilation (`/oc-data-ops observe`)

Each contract compiles to standing checks in the platform's idiom — dbt source
`freshness:` + generated tests where dbt is in play, otherwise scheduled
queries. The monitor inventory (what runs, where, how often) is recorded in the
checkpoint's public surface — monitor file paths in
`context_primer.generated_files`, the summary in `progress_summary` — and handed
to **oc-monitoring-ops** for alert routing; this skill
creates the checks, monitoring-ops decides who is woken up.
