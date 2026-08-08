# Aggregation & Export

The only thing that ever leaves the machine is a small, anonymized **aggregate** —
counts and sums, no raw rows, no identity. `/oc-telemetry aggregate` computes it
from the local store; `/oc-telemetry export` emits it in the shape the site
`/dashboard` (v1.6 Sprint 5) renders.

## The export shape

A single JSON object. Every value is a count, a sum, an average, or a category —
never a raw run, never an identifier.

```jsonc
{
  "schema": "opchain-usage-aggregate/1",
  "generated_at": "2026-06-25T12:00:00Z",
  "window": { "from": "2026-05-01", "to": "2026-06-25" },
  "totals": {
    "pipelines_run": 1284,          // COUNT(DISTINCT handle, day-bucketed run sessions)
    "skill_runs": 5310,             // COUNT(*) FROM runs
    "avg_cost_per_feature_usd": 7.41 // SUM(cost_usd) / shipped-feature count
  },
  "by_skill": [                     // COUNT(*) GROUP BY skill, desc
    { "skill": "oc-app-architect", "runs": 980 },
    { "skill": "oc-bug-check",     "runs": 870 }
    // ...
  ],
  "model_tier_distribution": [      // share of runs by tier
    { "tier": "sonnet", "share": 0.52 },
    { "tier": "opus",   "share": 0.31 },
    { "tier": "haiku",  "share": 0.17 }
  ],
  "eval_score_trend": [             // avg score by week (rubric-relative, 0..1 normalized)
    { "week": "2026-W20", "avg": 0.86 },
    { "week": "2026-W21", "avg": 0.88 }
  ]
}
```

`/dashboard` reads exactly this shape. If no live aggregate is published yet, the
page ships clearly-labeled **sample** data (Sprint 5) and swaps to the real export
when one exists — the page never presents seed numbers as real.

## How it's computed (counts/sums only)

```sql
-- totals.skill_runs
SELECT COUNT(*) FROM runs;
-- by_skill
SELECT skill, COUNT(*) runs FROM runs GROUP BY skill ORDER BY runs DESC;
-- model_tier_distribution
SELECT model_tier tier, COUNT(*)*1.0 / (SELECT COUNT(*) FROM runs) share
  FROM runs GROUP BY model_tier;
-- avg_cost_per_feature
SELECT SUM(cost_usd) / :shipped_feature_count FROM runs;
-- eval_score_trend
SELECT strftime('%Y-W%W', at) week, AVG(score) avg
  FROM events WHERE kind='eval' GROUP BY week;
```

No query selects a raw `runs` row for export. The export is the *result set of
aggregates*, never the underlying table.

## Privacy guarantees on the aggregate

1. **No raw rows.** Only `COUNT` / `SUM` / `AVG` / `share` leave the store.
2. **No identity.** `handle` is never exported (and is machine-local + random to
   begin with — see `privacy-consent.md`).
3. **Small-cell suppression (k-anonymity).** A `by_skill` or distribution bucket
   with fewer than **k = 5** runs is folded into an `"other"` bucket rather than
   exported on its own, so a tiny cohort can't be singled out.
4. **Tier, not model id.** `model_tier_distribution` uses the coarse tier, never
   the full pinned model id.
5. **Coarse time.** Trends bucket by week, not by timestamp.

## Dogfooding → the credibility surface

opchain runs telemetry on its **own** pipeline; the aggregate it exports is what
the public `/dashboard` shows ("is anyone actually using this, and which parts?").
The numbers are real because they come from real runs, and publishable because the
aggregate is anonymized and content-free by construction. `oc-cost-ops` supplies
`cost_usd`, so the dashboard's `avg_cost_per_feature_usd` is the honest answer to
the v1.5 "what did it cost to ship?" question.
