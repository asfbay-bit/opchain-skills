# Drift Detection — When the Score Moves and You Didn't Touch the Prompt

Regression gating catches *your* prompt edits. **Drift** is a score change you
didn't author — the model under the prompt changed, or something the prompt
depends on did. The harness's job is to make every score change fall into
exactly one of two buckets: a gated diff (you changed the prompt) or detected
drift (something underneath changed). There is no silent third bucket.

## Baselines

A baseline is the frozen scorecard a prompt is measured against. Freeze it once
the prompt passes, and re-freeze it only on a deliberate behavior change.

```
/oc-prompt baseline model-routing      # writes eval/baseline.json
```

`baseline.json` records the pass rate, the per-case results, the prompt version,
and the pinned model — all four matter, because a drift run compares against the
*exact* conditions the baseline was frozen under.

```json
{
  "frozen_at_version": "1.1.0",
  "pinned_model": "claude-opus-4-7",
  "pass_rate": 0.93,
  "cases": { "route-001": 1, "route-002": 1, "route-014": 1, "...": "..." }
}
```

## The two drift sources

### Model drift

The same prompt scores differently on a new model version. Models change
behavior between releases — narration volume, tool-reach defaults, instruction
literalness, length calibration — so a prompt tuned for `claude-opus-4-7` can
over- or under-trigger on `claude-opus-4-8` without a single character of the
prompt changing. (Behavioral-shift specifics per model version come from
`oc-claude-api` / the `claude-api` migration guide.)

This is the signal `oc-claude-api migrate` gates on: before a migration diff
merges, `/oc-prompt drift` re-runs the frozen baseline goldset against the
newly-pinned model and reports the per-case delta.

### Prompt drift (dependency drift)

The prompt text didn't change but its *dependencies* did — a referenced doc, a
tool name, an enum value, a downstream schema. Cases that used to pass now fail
because the world the prompt describes moved. The goldset catches this on a
scheduled run before a user hits it.

## Score-delta thresholds

`eval.yaml` defines `regression_epsilon` — the largest aggregate drop treated as
noise rather than drift. Two signals, same as the regression gate:

- **Aggregate drift**: `pass_rate` moved more than `regression_epsilon` from
  baseline.
- **Per-case drift**: any case that passed at baseline now fails — surfaced even
  when the aggregate held or rose, because a flipped case is a real behavior
  change hiding inside a stable average.

```
PROMPT DRIFT — model-routing   baseline v1.1.0 (claude-opus-4-7)
                               drift run against claude-opus-4-8
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
metric        baseline   now     Δ
pass_rate     0.93       0.89   -0.04   ✗  (> epsilon 0.02)
route-009     1.0        0.0    -1.00   ✗  REGRESSED on new model
route-021     1.0        0.0    -1.00   ✗  REGRESSED on new model
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
VERDICT: DRIFT — model bump regressed 2 cases. Block the re-pin; hand
route-009/route-021 to oc-claude-api for prompt re-tuning on claude-opus-4-8.
```

## CI gating

Drift runs in two places:

- **Scheduled** (e.g. daily/weekly): re-run the frozen baseline goldset to catch
  dependency drift before a user does. A clean run is recorded as a no-op; a
  drift signal opens a fix-the-prompt task with the failing cases attached.
- **On a model-version bump**: triggered by `oc-claude-api migrate`, gating the
  migration diff. The drift run is a required check — the migration doesn't merge
  if scores regress on the new model.

This is distinct from `/oc-prompt regress`, which runs on every PR that edits
`prompts/`. Regress gates *intentional* prompt edits against the baseline; drift
re-checks an *unchanged* prompt against a moving environment.

## What to do on a regression

| Situation | Action |
|---|---|
| Scores hold within `regression_epsilon` | No-op. Record the run; nothing to do. |
| Model bump, scores hold | Safe to re-pin the prompt to the new model. Re-freeze the baseline under the new model + bump the prompt version (MINOR). |
| Model bump, scores regress | **Block the re-pin.** Hand the per-case deltas to `oc-claude-api` for prompt re-tuning on the new model; re-run drift until clean, then re-baseline. |
| Dependency drift (text unchanged, cases fail) | Open a fix-the-prompt task with the failing cases. The fix is a normal gated `/oc-prompt` diff once the dependency is understood. |
| Drift you decide is the *new correct behavior* | Treat as a MAJOR prompt bump: rewrite `expected.jsonl`, re-freeze the baseline, record it in the CHANGELOG. You advance the gate, you don't bypass it. |

The throughline: a regression is never resolved by silencing the gate. You either
fix the prompt (re-tune, re-run, re-baseline) or you decide the new scores are
correct and move the baseline forward on purpose, with a CHANGELOG entry saying
so. Every score change ends with an explanation in git — which is the entire
reason the prompt lives in the repo instead of a console.
