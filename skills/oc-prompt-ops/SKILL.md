---
name: oc-prompt-ops
displayName: OC · Prompt Ops
version: 1.8.1
shortDesc: Prompt-as-code — versioning, eval datasets, regression and drift detection for LLM prompts.
phases: [build, ai-native]
triAgent: false
tryable: true
commands:
  - /oc-prompt
  - /oc-prompt eval
  - /oc-prompt diff
description: >
  Prompt operations harness — treat prompts as versioned, diffable,
  source-controlled code. Owns prompt versioning, eval datasets, regression
  detection, and drift tracking. Use for /oc-prompt, "prompt versioning",
  "eval dataset", "prompt regression", "prompt drift", "golden set",
  "prompt diff", "LLM eval", "regression suite". Trigger liberally on
  prompt-engineering / eval work.
governance:
  breaking_change_policy: skills/CHANGELOG.md
  last_reviewed: 2026-06-25
  owner: opchain
  docs:
    - { path: SKILL.md, kind: contract, lifecycle: stable }
---

# Prompt Ops

**On first invocation, read `references/orchestrator.md` and follow its welcome protocol.**

Treat prompts as **code**: source-controlled, diffable, semver'd, and gated on
an eval suite the same way application code is gated on tests. A prompt is the
single most behavior-defining string in an LLM app — and the one most teams
edit live, in a console, with no version history and no way to tell whether
"it got better" is real or vibes. This skill makes a prompt change a reviewable
diff with a measured score delta attached.

This is **not** a tri-agent harness. It's an operations layer the model-facing
skills build on: `oc-claude-api` owns the request surface (model routing,
caching, tool wiring), `oc-agent-forge` owns agent topology, `oc-rag-forge`
owns retrieval. Prompt Ops owns the part underneath all three — the prompt
text, the eval datasets that score it, and the regression gate that stops a
"small wording tweak" from quietly tanking quality on a migration.

opchain dogfoods this skill on itself. The worked example referenced throughout
is **`prompts/opchain-eval/`** — opchain's own eval set (`inputs.jsonl`,
`expected.jsonl`, `eval.yaml`), published in Sprint 3 as the canonical
`/oc-prompt eval` artifact. Wherever this doc says "the eval set", that directory
is the live instance.

> **Model facts come from `oc-claude-api` / the `claude-api` skill, not memory.**
> Judge-model choice, model IDs, and Batch-API economics in this skill are sourced
> there. Current models: **Fable 5** (`claude-fable-5`), **Opus 4.8**
> (`claude-opus-4-8`), **Sonnet 4.6** (`claude-sonnet-4-6`), **Haiku 4.5**
> (`claude-haiku-4-5`). When a prompt is pinned to a model, pin it to one of
> these exact IDs.

---

## /oc-prompt — Command Reference

```
PROMPT OPS COMMANDS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  PROMPT-AS-CODE
  /oc-prompt              Version / organize a prompt set (prompt-as-code layout)
  /oc-prompt diff         Diff two prompt versions + their eval-score deltas

  EVALUATION
  /oc-prompt eval         Run a prompt version against an eval dataset → scorecard
  /oc-prompt goldset      Build or extend the eval goldset (inputs/expected/rubric)
  /oc-prompt judge        Configure / calibrate the LLM-as-judge grader

  REGRESSION / DRIFT
  /oc-prompt regress      Re-run the eval suite and gate on score regression
  /oc-prompt baseline     Freeze the current scores as the regression baseline
  /oc-prompt drift        Re-run the frozen baseline to detect prompt/model drift

  UTILITIES
  /checkpoint             Show checkpoint status

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  Type any command to begin. /oc-prompt to see this again.
```

---

## How This Skill Fits the Build Pipeline

```
oc-claude-api (model routing) ──pins the model an eval runs against──┐
                                                                     │
oc-prompt-ops owns:                                                  ▼
   prompts/<name>/<version>/prompt.md        ┌────────────────────────────┐
   prompts/<name>/eval/inputs.jsonl     ────►│  /oc-prompt eval           │
   prompts/<name>/eval/expected.jsonl        │  run prompt × goldset       │
   prompts/<name>/eval/eval.yaml             │  grade → scorecard          │
                                             └─────────────┬──────────────┘
                                                           │ score delta
                                       ┌───────────────────┴────────────────┐
                                       ▼                                     ▼
                          /oc-prompt regress (CI gate)         /oc-prompt drift (scheduled)
                          block merge on score drop            flag model/prompt drift
                                       │
              ┌────────────────────────┼────────────────────────┐
              ▼                        ▼                         ▼
        oc-agent-forge          oc-rag-forge             oc-claude-api migrate
        (agent eval harness)    (gen-prompt eval)        (eval-gate the diff PR)
```

The skill's output is an **evaluated, versioned prompt** plus a regression
suite. Sibling skills consume that harness: `oc-agent-forge` and `oc-rag-forge`
run their own goldsets *through* this skill's eval runner rather than
reinventing one, and `oc-claude-api migrate` gates its model-migration diff on
the prompt's eval scores not regressing on the new model.

---

## Principle 1: Prompt-as-Code

A prompt that lives only in a SaaS console or interpolated inside a function is
an undiffable, unversioned production dependency. Prompt Ops moves it into the
repo and treats it like any other source artifact.

**The convention** (full layout in `references/prompt-versioning.md`):

```
prompts/
└── <prompt-name>/
    ├── CHANGELOG.md            # one entry per version, with the eval delta
    ├── v1.0.0/
    │   └── prompt.md           # the prompt text — the only source of truth
    ├── v1.1.0/
    │   └── prompt.md
    └── eval/
        ├── inputs.jsonl        # eval inputs (one JSON object per line)
        ├── expected.jsonl      # expected outputs / grading targets, keyed by id
        └── eval.yaml           # rubric: which grader, thresholds, judge config
```

Four rules make it "code":

1. **Source-controlled.** The prompt text lives in `prompt.md`, reviewed in a PR
   like any other change. No live console edits — those are invisible to git and
   to the eval gate.
2. **Diffable.** A prompt change is a line diff. `/oc-prompt diff v1.0.0 v1.1.0`
   shows the text delta *and* the score delta side by side, so a reviewer sees
   both what changed and what it did.
3. **Lockstep-versioned.** The prompt and the eval set version together. A prompt
   bump that needs new eval cases bumps both in the same commit, so a version is
   always evaluable against its own contemporaneous goldset.
4. **Semver'd by behavior.** PATCH = typo/format fix, no score movement expected.
   MINOR = capability added, scores should hold or rise. MAJOR = behavior changed
   such that the old expected outputs no longer apply (the goldset itself
   changes). See `references/prompt-versioning.md`.

The model the prompt runs against is **part of the version contract**: a prompt
pinned to `claude-opus-4-8` is a different evaluable artifact than the same text
on `claude-haiku-4-5`. The pinned model ID comes from `oc-claude-api`'s routing
decision and is recorded in `eval.yaml`.

---

## Principle 2: Eval Datasets (the goldset)

You cannot tell whether a prompt change helped without a fixed set of cases to
score it on. That set — the **goldset** — is three files. (Full format and a
small worked example in `references/eval-datasets.md`; the live instance is
`prompts/opchain-eval/`.)

**`inputs.jsonl`** — one JSON object per line, each an eval case with a stable
`id` and the `input` the prompt runs on:

```jsonl
{"id": "route-001", "input": "build me a recipe app"}
{"id": "route-007", "input": "set up a RAG pipeline over our internal docs"}
```

**`expected.jsonl`** — the grading target for each `id`. `mode` selects the
grader; the rest of the object is that grader's config:

```jsonl
{"id": "route-001", "expect": {"mode": "contains", "all": ["oc-app-architect", "/oc-discover"]}}
{"id": "route-007", "expect": {"mode": "contains", "all": ["oc-rag-forge", "/oc-rag"]}}
```

**`eval.yaml`** — the suite config: the default grader, the judge config for
`llm_judge` cases, and the pass/regression thresholds:

```yaml
prompt: opchain-routing
model: claude-opus-4-8         # the model the prompt-under-test runs on (from oc-claude-api)
grading:
  default_mode: contains       # exact | contains | llm_judge (a case may override via its own mode)
  judge:
    model: claude-opus-4-8     # judge ≥ capability of the model under test
    output_format: json_schema # force a {score, reason} verdict — not free text
thresholds:
  pass_rate: 0.90              # ≥ 90% of cases must pass
  regression_epsilon: 0.05     # a pass_rate drop > this vs baseline fails the gate
cost:
  cost_per_eval: null          # measured by oc-cost-ops /oc-cost attribute (null until first costed run)
```

### Grading modes

| Mode | When | How |
|---|---|---|
| `exact` | Deterministic output (a single label, a fixed JSON) | String equality after normalisation |
| `contains` | Output must include / exclude specific spans (a model ID, a forbidden phrase) | `all` / `any` / `none` substring sets |
| `llm_judge` | Open-ended output (a summary, an explanation, a design rationale) | A judge model scores against the rubric |

**LLM-as-judge rules** (detail in `references/eval-datasets.md`):
- The judge model should be **at least as capable** as the model under test —
  default to `claude-opus-4-8`; never grade Opus output with Haiku.
- Force a **structured verdict** via `output_config.format` (a `{score, reason}`
  JSON schema) so the grade is parseable and the gate is deterministic, not a
  free-text "looks good".
- The judge is itself a prompt — it lives under `prompts/<name>/eval/` and is
  versioned and calibrated like any other. Re-run `/oc-prompt judge` to
  re-calibrate against a hand-graded sample when the judge drifts.

### Avoiding train/eval leakage

The goldset is a held-out test set. If you tune a prompt by staring at the eval
cases and editing until they pass, you've overfit — the scores are memorised, not
earned. Keep a few-shot/example pool **separate** from the goldset, never copy a
goldset case into the prompt's examples, and grow the goldset from real
production failures, not from cases you already know the prompt handles.

---

## Principle 3: Regression Gating

Once a prompt has a goldset and a passing score, **freeze that score as a
baseline** and gate every future prompt change on not regressing below it.

```
/oc-prompt baseline model-routing      # freeze current scores → eval/baseline.json
... edit prompts/model-routing/v1.2.0/prompt.md ...
/oc-prompt eval model-routing@v1.2.0   # score the new version
/oc-prompt regress model-routing       # compare vs baseline, gate
```

The regress gate (run in CI on every PR that touches `prompts/`):

```
PROMPT REGRESSION — model-routing  v1.1.0 → v1.2.0
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
case mode        baseline   new     Δ
pass_rate        0.93       0.95    +0.02   ✓
route-001 judge  1.0        1.0      0.00   ✓
route-014 judge  1.0        0.0     -1.00   ✗  REGRESSION
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
VERDICT: FAIL — route-014 regressed (long-context routing now picks Haiku).
aggregate +0.02 but a per-case regression beyond epsilon blocks the merge.
```

Two failure conditions, both blocking:
- **Aggregate regression**: `pass_rate` drops more than `regression_epsilon`
  below baseline.
- **Per-case regression**: any individual case that passed at baseline now fails
  — even if the aggregate went *up*. A change that lifts the average while
  breaking a previously-working case made that case worse, and the table names it.

On a deliberate behavior change (a MAJOR prompt bump), the baseline is
**re-frozen** with `/oc-prompt baseline` after the new expected outputs land —
you don't bypass the gate, you move it forward intentionally with a CHANGELOG
entry recording the new scores.

---

## Principle 4: Drift Detection

Regression gating catches *your* prompt edits. **Drift** is the score moving when
you *didn't* touch the prompt — because the model under it changed, or the world
the prompt describes did. (Full playbook in `references/drift-detection.md`.)

Two drift sources:

- **Model drift.** The same prompt scores differently on a new model version. A
  prompt tuned for `claude-opus-4-7` may over- or under-trigger on
  `claude-opus-4-8` (more narration, different tool-reach defaults). `/oc-prompt
  drift` re-runs the frozen baseline goldset against the newly-pinned model and
  reports the per-case delta — this is the exact signal `oc-claude-api migrate`
  gates its migration diff on.
- **Prompt drift.** The prompt text didn't change but its *dependencies* did — a
  referenced doc, a tool name, an enum value — so cases that used to pass now
  fail. The goldset catches this on the scheduled `/oc-prompt drift` run before a
  user does.

`/oc-prompt drift` runs on a schedule (or on a model-version bump), compares the
live score to the frozen baseline, and:

| Drift signal | Action |
|---|---|
| Scores hold within `regression_epsilon` | No-op; record the run |
| Model bump, scores hold | Safe to re-pin the prompt to the new model; re-baseline |
| Model bump, scores regress | Block the re-pin; hand the per-case deltas to `oc-claude-api` for prompt re-tuning on the new model |
| Dependency drift (text unchanged, cases fail) | Open a fix-the-prompt task with the failing cases attached |

The principle: a score change is never silent. Either you changed the prompt (a
diff, gated) or something underneath it changed (drift, detected) — there is no
third category.

---

## `/oc-prompt diff` — prompt + eval delta

`diff` is the reviewer's view of a prompt change. It shows the **text diff** and
the **eval-score diff** in one place, so "I reworded the system prompt" always
arrives with "and here's what it did to the scores":

```
/oc-prompt diff model-routing@v1.1.0 model-routing@v1.2.0
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 prompt.md
- Route long-context tasks to a high-capability model.
+ Route tasks over 200k tokens to claude-opus-4-8 or claude-fable-5.

 eval scorecard (goldset: 28 cases)
   pass_rate   0.93 → 0.95   +0.02
   regressions 1   (route-014: long-context → Haiku)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

A prompt diff with no attached eval delta is incomplete — `diff` runs the eval if
a scorecard for either version is stale. Versioning + diffing detail lives in
`references/prompt-versioning.md`.

---

## Cost: oc-cost-ops collaboration (v1.6)

Running an eval suite costs tokens — every case is at least one model call, and
`llm_judge` grading doubles that (the call under test plus the judge call). For
large goldsets, route eval runs through the **Batch API** (50% of standard
price, sourced from `oc-claude-api`) — eval is latency-tolerant by definition, so
batch is the right default.

`eval.yaml` carries `cost_per_eval` / `budget_per_eval` / `regression_pct`, owned
by **`oc-cost-ops`** (shipped v1.6). `cost_per_eval` is *measured* from real token
counts by `/oc-cost attribute` — it stays `null` until the first costed run (Cost
Ops attributes, it does not estimate). `oc-cost-ops` runs a **cost-regression gate
beside this skill's score gate**: a prompt change that holds quality but triples
token cost is also a regression and blocks the merge. The two gates run together
so a prompt/model change is judged on both quality and cost. See
`oc-cost-ops/references/budget-gates.md`.

```json
"cost": { "cost_per_eval": null, "_note": "measured by oc-cost-ops /oc-cost attribute (null until first costed run)" }
```

---

## Boundaries (what oc-prompt-ops does NOT own)

| Concern | Owner | Why |
|---|---|---|
| Model routing, prompt caching, tool wiring, the request layer | `oc-claude-api` | Prompt Ops versions + evals the prompt text; oc-claude-api runs it |
| Agent topology, subagent budgets, harness loop shape | `oc-agent-forge` | Agent-forge designs the loop; it *uses* this skill's eval harness to score it |
| Retrieval quality (recall@k, MRR, faithfulness) | `oc-rag-forge` | RAG owns *retrieval* evals; Prompt Ops owns *generation-prompt* evals |
| Live eval-spend tracking, cost-regression gate | `oc-cost-ops` | Prompt Ops emits token counts; oc-cost-ops owns the budget + cost-regression gate |
| Running the model-migration diff itself | `oc-claude-api migrate` | Prompt Ops supplies the drift signal that gates the migration |
| Deploying the evaluated prompt | `oc-deploy-ops` | Receives a frozen, score-gated prompt version |

Prompt Ops owns the **prompt artifact and its evidence** — the versioned text,
the goldset, the baseline, the regression and drift gates. Siblings route, run,
deploy, and cost it.

---

## Cross-Skill Integration

| Skill | How it connects |
|---|---|
| **oc-claude-api** | Owns model routing; Prompt Ops pins each prompt/eval to the chosen model ID. On a model migration, `oc-claude-api migrate` gates its diff on `/oc-prompt drift` showing no score regression on the new model. |
| **oc-agent-forge** | Consumes this skill's eval harness to score agent behavior — its agent goldset runs through `/oc-prompt eval` rather than a bespoke runner. |
| **oc-rag-forge** | Consumes the same eval harness for its *generation* prompt (the answer-synthesis step). RAG owns the *retrieval* goldset; Prompt Ops owns the generation-prompt goldset; the two regression suites run side by side. |
| **oc-cost-ops** | Owns live eval-spend tracking and the `cost_per_eval` field + cost-regression gate that runs alongside the score gate (shipped v1.6). |
| **oc-deploy-ops** | Receives a frozen, score-gated prompt version; gates prod on the regression suite passing. |
| **oc-git-ops** | Opens the PR carrying the prompt diff + scorecard (surfaced in the PR's oc-docs-forge documentation packet); CI runs `/oc-prompt regress` as a required check. |
| **oc-app-architect** | When an app has an LLM feature, its prompt is registered under `prompts/` with a goldset from day one rather than backfilled later. |

---

## Checkpoint Integration

### Checkpoint Location
`{project-dir}/.checkpoints/oc-prompt-ops.checkpoint.json`

### When to Write

| Event | What to Save |
|---|---|
| Prompt versioned | Prompt name, new version, semver bump kind, pinned model |
| Goldset built / extended | Case count, grading modes used, judge model |
| Eval runs | Per-mode pass rate, regressions, scorecard path |
| Baseline frozen | Baseline scores + the version they were frozen at |
| Regression gate | Pass/fail + per-case deltas vs baseline |
| Drift run | Model/dependency drift signal + deltas vs frozen baseline |

### skill_state

```json
{
  "prompt": "model-routing",
  "version": "1.2.0",
  "pinned_model": "claude-opus-4-8",
  "goldset": {
    "path": "prompts/opchain-eval",
    "cases": 28,
    "grading_modes": ["contains", "llm_judge"],
    "judge_model": "claude-opus-4-8"
  },
  "baseline": {
    "frozen_at_version": "1.1.0",
    "pass_rate": 0.93
  },
  "last_eval": {
    "version": "1.2.0",
    "pass_rate": 0.95,
    "regressions": ["route-014"],
    "verdict": "FAIL"
  },
  "last_drift": {
    "against_model": "claude-opus-4-8",
    "from_model": "claude-opus-4-7",
    "delta": 0.01,
    "verdict": "PASS"
  },
  "cost": { "cost_per_eval": null, "_note": "measured by oc-cost-ops /oc-cost attribute (null until first costed run)" }
}
```

### Cross-Skill Reads

| Reads from | Why |
|---|---|
| oc-claude-api | The pinned model ID each prompt/eval runs against |
| oc-app-architect | `05-llm-design.md` — which prompts an app ships, to register goldsets |

| Read by | Why |
|---|---|
| oc-claude-api | Drift signal gates the model-migration diff before merge |
| oc-agent-forge | Eval harness contract for scoring agent behavior |
| oc-rag-forge | Eval harness contract for scoring the generation prompt |
| oc-deploy-ops | Frozen, score-gated prompt version as a deploy gate |
| oc-cost-ops | Token counts per eval run as the cost-tracking input |

---

## Principles

1. **A prompt is code.** Source-controlled, diffable, reviewed in a PR, gated on
   an eval suite. Live console edits are invisible to git and to the gate — they
   don't happen here.
2. **No score claim without a goldset.** "It got better" is a measurement against
   a fixed set of held-out cases, or it's a vibe. Every prompt ships with
   `inputs.jsonl` / `expected.jsonl` / `eval.yaml`.
3. **Version prompt and eval in lockstep.** A version is always evaluable against
   its own contemporaneous goldset. Bump both in one commit.
4. **Semver by behavior.** PATCH = no expected score movement, MINOR = scores hold
   or rise, MAJOR = expected outputs change. The bump kind tells the reviewer what
   the eval should show.
5. **A diff carries its score delta.** `/oc-prompt diff` shows the text change and
   what it did to the scores, together. A prompt change reviewed without its eval
   delta is reviewed blind.
6. **Gate on per-case regression, not just the average.** A change that lifts the
   aggregate while breaking a previously-passing case made that case worse. Name
   the case and block the merge.
7. **Pin the model — it's part of the version.** The same text on a different
   model is a different evaluable artifact. The pinned ID comes from
   `oc-claude-api` and lives in `eval.yaml`.
8. **Judge with a model at least as capable, and force a structured verdict.**
   Default the judge to `claude-opus-4-8`; never grade Opus output with Haiku;
   make the grade a `{score, reason}` JSON object, not free text.
9. **No train/eval leakage.** The goldset is held out. Don't copy goldset cases
   into the prompt's examples, and grow the goldset from real production failures,
   not from cases the prompt already passes.
10. **Every score change is explained.** Either you changed the prompt (a gated
    diff) or something underneath changed (detected drift). There is no silent
    third category — and that is the whole point of the harness.
