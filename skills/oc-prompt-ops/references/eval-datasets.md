# Eval Datasets — Building and Grading a Goldset

A prompt's goldset is the held-out set of cases its scores are measured against.
Three files: `inputs.jsonl`, `expected.jsonl`, `eval.yaml`. The live opchain
instance is `prompts/opchain-eval/` — a **routing** eval: given a dev request,
does opchain pick the right skill and its entry command?

## The three files

### `inputs.jsonl` — the cases

One JSON object per line: a stable `id` (the join key to `expected.jsonl`, never
reused) and the `input` the prompt runs on.

```jsonl
{"id": "route-001", "input": "build me a recipe app"}
{"id": "route-007", "input": "set up a RAG pipeline over our internal docs"}
{"id": "route-009", "input": "build a Claude agent that triages incoming GitHub issues"}
```

### `expected.jsonl` — the grading targets

One object per `id`. `mode` selects the grader; the rest of the object is that
grader's config. The opchain-eval set uses `contains` with an `all` array — the
routing answer must name the right skill **and** its command.

```jsonl
{"id": "route-001", "expect": {"mode": "contains", "all": ["oc-app-architect", "/oc-discover"]}}
{"id": "route-007", "expect": {"mode": "contains", "all": ["oc-rag-forge", "/oc-rag"]}}
{"id": "route-009", "expect": {"mode": "contains", "all": ["oc-agent-forge", "/oc-agent"]}}
```

### `eval.yaml` — the rubric

The suite config: the default grader, the judge config for `llm_judge` cases, and
the pass/regression thresholds. A case may override `default_mode` with its own
`mode` in `expected.jsonl`.

```yaml
prompt: opchain-routing
model: claude-opus-4-8          # the model the prompt-under-test runs on (from oc-claude-api)
grading:
  default_mode: contains         # used when a case omits its own mode
  judge:
    model: claude-opus-4-8       # judge ≥ capability of the model under test
    output_format: json_schema   # force a {score, reason} verdict — not free text
    rubrics:
      long_horizon: |
        Score 1 if the recommendation names a model suited to a long, autonomous
        agentic run (claude-opus-4-8 or claude-fable-5) AND gives a one-line
        reason tied to task difficulty. Otherwise score 0.
thresholds:
  pass_rate: 0.90                # ≥ 90% of cases must pass
  regression_epsilon: 0.05       # aggregate pass_rate drop > this vs baseline fails the gate
cost:
  cost_per_eval: null            # populated by oc-cost-ops in v1.6
```

## Grading modes

These are the values `grading.default_mode` (suite default) or a case's own
`expect.mode` (per-case override) can take.

| Mode | Use for | Mechanism |
|---|---|---|
| `exact` | A single deterministic answer (one label, a fixed JSON) | String equality after trim/normalise |
| `contains` | Output must include or exclude specific spans | `all` (every span present), `any` (≥1 present), `none` (all absent) |
| `llm_judge` | Open-ended output — a summary, an explanation, a rationale | A judge model scores the output against a rubric |

Prefer the cheapest mode that actually captures the requirement. `exact` and
`contains` are deterministic, free of a second model call, and never drift —
reach for `llm_judge` only when the correct output is open-ended enough that no
substring check captures it.

### `exact`

```jsonl
{"id": "label-007", "expect": {"mode": "exact", "value": "negative"}}
```

Normalise both sides (trim whitespace, lowercase if case-insensitive) before
comparing, and say so in `eval.yaml` so the rule is explicit.

### `contains`

```jsonl
{"id": "route-002", "expect": {"mode": "contains", "all": ["claude-haiku-4-5"], "none": ["opus", "fable"]}}
```

`none` is as important as `all` — it catches a prompt that produces the right
answer *plus* a wrong one. A routing prompt that names both Haiku and Opus
"passes" an `all`-only check but is still wrong.

### `llm_judge`

For open-ended output, a judge model reads the output and the rubric and returns
a score. The judge call is itself an LLM call governed by `oc-claude-api`.

**Rules:**

1. **Judge ≥ the model under test.** Default the judge to `claude-opus-4-8`.
   Never grade Opus output with Haiku — a weaker judge can't reliably tell a good
   answer from a plausible wrong one. (Model facts from `oc-claude-api` / the
   `claude-api` skill.)
2. **Force a structured verdict.** Use `output_config.format` with a
   `{score, reason}` JSON schema so the grade is parseable and the gate is
   deterministic. A free-text "this looks good" can't be thresholded.
3. **The judge is a versioned prompt.** Its rubric lives in `eval.yaml` under
   `prompts/<name>/eval/`, is reviewed in PRs, and is calibrated against a
   hand-graded sample (`/oc-prompt judge`). A judge that drifts silently
   poisons every score — re-calibrate when its agreement with human grades drops.
4. **Write gradeable rubrics.** "Score 1 if the answer is good" is ungradeable.
   "Score 1 if the recommendation names an appropriate model AND cites a reason"
   is. Independent, checkable criteria — the same discipline `oc-rag-forge` uses
   for faithfulness rubrics.

Example judge verdict (structured output):

```json
{ "score": 1, "reason": "Names claude-opus-4-8 for a long autonomous run and cites task difficulty." }
```

## Avoiding train/eval leakage

The goldset is a **test set**. The fastest way to corrupt it is to tune the
prompt by editing until the eval cases pass — that memorises the cases instead of
improving the prompt, and the scores stop meaning anything.

- **Keep the example pool separate.** A prompt's few-shot examples and its eval
  cases must come from disjoint pools. Never copy a goldset case into the
  prompt's examples — the prompt would then be graded on inputs it was handed the
  answers to.
- **Grow the goldset from production failures.** The best new cases are real
  inputs the prompt got wrong in the wild, added *after* they were found — not
  cases hand-written to match what the prompt already does.
- **Don't peek-and-patch.** If you must look at a failing eval case to debug,
  fix the *prompt's general behavior*, not that one case's wording. A fix that
  only helps the case you stared at is overfitting.
- **Hold out a slice.** For larger goldsets, keep a slice the prompt author never
  sees during tuning; a real improvement generalises to it.

A goldset built this way produces scores that predict production behavior. One
built by tuning-to-the-test produces scores that predict nothing.
