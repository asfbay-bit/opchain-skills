# Budget Gates & Cost-Regression

Two gates Cost Ops runs in CI, both alongside (not replacing) the existing
quality gates. A change that holds quality but blows the budget or triples spend
is a regression — these gates name it.

## Gate 1: Budget ceiling

A per-phase or per-suite budget recorded in the checkpoint's `cost.budget_usd`.
The validator **warns** when `total_usd > budget_usd` (overspend is a signal, not
a corrupt file); the **gate decision** (warn vs. block) is Cost Ops policy:

| Mode | Behavior when `total_usd > budget_usd` |
|---|---|
| `lenient` (default) | WARN — surface the overspend, allow the commit/deploy |
| `strict` | FAIL — block until the budget is raised (a logged decision) or spend is cut |

Setting a budget:

```
/oc-cost budget --phase build --usd 5.00      # per-phase ceiling
/oc-cost budget --suite opchain-eval --usd 2  # per eval-suite ceiling
```

Raising a budget is a deliberate, logged act (recorded in the checkpoint), the
same way `oc-prompt-ops` re-freezes a baseline on an intentional change — you
don't bypass the gate, you move it forward on purpose.

## Gate 2: Cost regression (beside the score gate)

This is the gate `oc-prompt-ops` already advertises. `oc-prompt-ops` freezes a
**score** baseline and fails a PR on a score drop; Cost Ops freezes a **cost**
baseline and fails on a cost spike. They run together so a prompt/model change is
judged on *both* axes:

```
PROMPT CHANGE — model-routing  v1.1.0 → v1.2.0
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
            baseline   new      Δ
pass_rate   0.93       0.95     +0.02   ✓  (oc-prompt-ops score gate)
cost/eval   $0.011     $0.034   +209%   ✗  (oc-cost-ops cost gate)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
VERDICT: BLOCK — quality held but cost tripled (switched judge to a verbose
prompt that 3× the output tokens). Either trim the change or raise the budget.
```

The cost-regression threshold mirrors `oc-prompt-ops`'s `regression_epsilon`
shape — a `cost.regression_pct` ceiling in `eval.yaml`:

```yaml
cost:
  cost_per_eval: 0.011        # populated by oc-cost-ops (was null pre-v1.6)
  budget_per_eval: 0.05       # hard ceiling per eval run
  regression_pct: 0.50        # a cost rise > 50% vs baseline fails the gate
```

Two blocking conditions (both, like the score gate's aggregate + per-case):

- **Ceiling:** `cost_per_eval > budget_per_eval` → FAIL.
- **Regression:** `cost_per_eval` rises more than `regression_pct` above the
  frozen baseline → FAIL, even if still under the ceiling (a 3× rise that's still
  cheap today won't be at scale).

## Running the gate in CI

`/oc-cost gate` produces a CI-friendly verdict (exit non-zero on FAIL in strict
mode). Wire it next to `/oc-prompt regress` on every PR that touches `prompts/`
or that a build sprint attributed cost to:

```
- run: npm run oc-prompt -- regress   # quality
- run: npm run oc-cost -- gate        # cost  (this skill)
```

On a deliberate, accepted cost increase (a MAJOR change that needs the spend),
re-freeze the cost baseline with `/oc-cost budget --rebaseline`, recording the
new number in the prompt's CHANGELOG — same discipline as a score re-baseline.

## Why both gates, not one

Quality and cost are independent failure modes. A change can:

- hold quality, spike cost → **cost gate catches it** (the case score-only CI misses)
- cut cost, drop quality → **score gate catches it** (the case cost-only CI misses)
- improve both → ship it
- regress both → obviously block

Running only one gate makes the other dimension invisible. The point of the
instrumented pipeline is that *neither* moves silently.
