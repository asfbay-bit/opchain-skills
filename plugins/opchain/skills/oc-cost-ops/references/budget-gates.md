# Budget Gates & Cost-Regression

Two gates Cost Ops runs on a PR (runner-backed eval checks and assistant-driven
checkpoint policy, see below), both alongside (not
replacing) the existing quality gates. A change that holds quality but blows the
budget or triples spend is a regression — these gates name it.

## Gate 1: Budget ceiling

A per-phase or per-suite budget recorded in `cost.budget_usd` of the oc-cost-ops
checkpoint. The validator **warns** when `budget_usd > 0` and `total_usd >
budget_usd` (overspend is a signal, not a corrupt file; a `0` budget never trips
it); the **gate decision** (warn vs. block) is Cost Ops policy:

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
  cheap today won't be at scale). The frozen cost baseline is a separate
  `cost-baseline.json` artifact, created from measured usage by the cost runner;
  it is not the prompt runner's score baseline. A missing cost baseline returns
  `BLOCKED` (`missing_baseline`), even when a ceiling is configured. Missing usage
  or pricing remains unavailable and blocks the gate; a dataset identity mismatch
  also blocks. Malformed artifacts are rejected, never treated as zero cost.

## Running the gate on a PR

Run the shipped eval-cost commands from the opchain source checkout with
dependencies installed, or from the unpacked local runtime artifact. A skills-only
ZIP or Claude plugin does not include these npm commands. Keep the runtime in its
own directory and pass the target project's dataset and artifact paths explicitly:

```sh
npm run oc-cost -- attribute <dataset-dir> --result <result.json> --rates <rates.json> --measurement-id <id> --out <cost.json>
npm run oc-cost -- baseline <dataset-dir> --measured <cost.json> --out <cost-baseline.json>
npm run oc-cost -- gate <dataset-dir> --measured <cost.json> --baseline <cost-baseline.json>
npm run oc-prompt -- regress <dataset-dir> --result <result.json> --baseline <score-baseline.json>
```

`rates.json` supplies explicit `input_per_million` and `output_per_million`;
attribution uses the result's preserved adapter usage. No model price is assumed.
The cost gate compares that measured artifact with the separate frozen cost
baseline and `eval.yaml` budget/regression thresholds. A PASS exits 0; FAIL or
BLOCKED exits 2. Baseline creation requires a valid measured-cost artifact.

Run both gates for every PR that touches `prompts/` or carries attributed eval
cost, and record their verdicts in the checkpoint (`skill_state.last_gate`) and
PR body. These commands do not install an automatic CI check. `/oc-cost`, `budget`,
`route`, `report`, and checkpoint-oriented policy remain assistant-driven modes.
The checkpoint validator (`npm run checkpoint:validate`, opchain repo) surfaces
an overspent `cost.budget_usd` as a **warning**; it does not replace the executable
eval-cost gate or strict checkpoint-budget policy.

On a deliberate, accepted cost increase (a MAJOR change that needs the spend),
re-freeze the separate cost baseline with
`npm run oc-cost -- baseline <dataset-dir> --measured <cost.json> --out <cost-baseline.json>`
after the new measurement is accepted. Record the decision and new number in the
checkpoint and prompt's CHANGELOG, and explicitly update the budget policy if its
ceiling changes. This does not rewrite the prompt's score baseline or silently
raise a budget.

## Why both gates, not one

Quality and cost are independent failure modes. A change can:

- hold quality, spike cost → **cost gate catches it** (the case score-only CI misses)
- cut cost, drop quality → **score gate catches it** (the case cost-only CI misses)
- improve both → ship it
- regress both → obviously block

Running only one gate makes the other dimension invisible. The point of the
instrumented pipeline is that *neither* moves silently.
