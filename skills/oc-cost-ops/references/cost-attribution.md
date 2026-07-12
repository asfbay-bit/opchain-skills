# Cost Attribution

Turn the token counts the model-facing skills already emit into **dollars
attributed to the phase that incurred them**, written into the wire-1.1 `cost`
checkpoint field. The principle: cost is *attributed from real token counts*, never
estimated — `/oc-cost attribute` multiplies measured tokens by the
`pricing-reference.md` table, it does not guess.

## Inputs

Cost Ops does not call models itself. It reads token counts that already exist:

| Source | What it provides |
|---|---|
| `oc-claude-api` (the request layer) | per-call `usage` (input/output/cache tokens) + the price table |
| `oc-prompt-ops` eval runs | per-eval token counts (call-under-test + judge call) |
| `oc-bug-check` / `oc-code-auditor` | the phase label a run belongs to |
| the skill's own checkpoint | which phase/step is active when a call is made |

## The math (per call → per phase → total)

Per call:

```
call_usd = (input_tokens  / 1e6) * input_price[model]
         + (output_tokens / 1e6) * output_price[model]
         + cache_write_tokens / 1e6 * cache_write_price[model]
         + cache_read_tokens  / 1e6 * cache_read_price[model]
```

Batch calls multiply the whole thing by 0.5. Roll calls up by phase and by model:

```
by_phase[p] = Σ call_usd for calls tagged phase p
by_model[m] = Σ call_usd for calls on model m
total_usd   = Σ by_phase = Σ by_model        (the two rollups must reconcile)
```

The reconciliation check (`Σ by_phase == Σ by_model == total_usd`) is how
`/oc-cost attribute` catches a miscounted call.

## Worked example

A small build sprint:

| Phase | Model | in tok | out tok | $/run |
|---|---|---:|---:|---:|
| spec | opus-4-8 | 180k | 40k | 180/1e6·5 + 40/1e6·25 = $1.90 |
| build | sonnet-4-6 | 900k | 220k | 900/1e6·3 + 220/1e6·15 = $6.00 |
| audit | opus-4-8 | 120k | 18k | 120/1e6·5 + 18/1e6·25 = $1.05 |

```jsonc
"cost": {
  "currency": "USD",
  "total_usd": 8.95,
  "by_phase": { "spec": 1.90, "build": 6.00, "audit": 1.05 },
  "by_model": { "claude-opus-4-8": 2.95, "claude-sonnet-4-6": 6.00 },
  "tokens": { "input": 1200000, "output": 278000 },
  "updated_at": "2026-06-25T12:00:00Z"
}
```

`by_phase` sums to 8.95; `by_model` sums to 8.95; both equal `total_usd`. ✓

## Writing the `cost` field

`/oc-cost attribute` does a **read → merge → write** on the owning skill's
checkpoint (never blind-overwrite — another skill may share the project):

1. Read the current checkpoint.
2. Compute `by_phase` / `by_model` / `total_usd` from the run's token counts.
3. Merge into `cost` (sum into existing phase/model buckets across a multi-run
   session; don't clobber prior attributions).
4. Restamp `cost.updated_at` + the checkpoint `updated_at`.
5. Validate (`npm run checkpoint:validate`) — the validator enforces non-negative
   numbers and warns if `total_usd > budget_usd`.

## Cost per shipped feature (the /showcase + /dashboard number)

`/oc-cost report` divides a feature's attributed `total_usd` by what shipped:

```
cost_per_feature = total_usd attributed to the feature's sprints
cost_per_pr      = total_usd / merged PR count in the range
```

This is the honest number the v1.5 blog post ("What it cost to ship v1.5")
promised and could not yet produce. `oc-telemetry-ops` aggregates it across runs
for the public `/dashboard`; `oc-cost-ops` produces it per project.

## Honesty rules

- **Attributed, not estimated.** If token counts for a phase are missing, report
  the phase as `unknown`, not a guess. A partial-but-true total beats a
  complete-but-fabricated one.
- **Cache and Batch are in the number.** A "cheap" run that's cheap only because
  of caching should show that — don't strip the cache discount to flatter a tier.
- **Reconcile or flag.** If `by_phase` and `by_model` don't agree, the
  attribution has a bug; surface it rather than papering over it.
