# Prompt Versioning — Prompt-as-Code on Disk

How to lay out prompts so they version, diff, and review like source code.

## On-disk layout

One directory per prompt; one subdirectory per version; one shared `eval/`
goldset. The prompt text is the single source of truth — nothing generated, no
console copy.

```
prompts/
└── model-routing/
    ├── CHANGELOG.md              # one entry per version, with the eval delta
    ├── v1.0.0/
    │   └── prompt.md             # the prompt text
    ├── v1.1.0/
    │   └── prompt.md
    ├── v1.2.0/
    │   └── prompt.md
    └── eval/
        ├── inputs.jsonl          # eval cases
        ├── expected.jsonl        # grading targets
        ├── eval.yaml             # rubric + thresholds + pinned model + judge
        └── baseline.json         # frozen scores (the regression baseline)
```

The live opchain instance of this layout is `prompts/opchain-eval/` (the eval
files; the prompt under test is opchain's own model-routing prompt).

### Why a directory per version, not git history alone

Git history *is* the long-term record, but a working tree that holds the last
two or three versions side by side lets `/oc-prompt diff` and `/oc-prompt
regress` compare versions without checking out old commits, and lets a reviewer
read v1.1.0 and v1.2.0 in one view. Prune old version dirs once they're well
behind the baseline — git keeps them.

## Semver for prompts — by behavior, not by edit size

The version number describes **what the eval should show**, so a reviewer knows
what to expect before reading the scorecard.

| Bump | Meaning | Expected eval effect | Goldset effect |
|---|---|---|---|
| **PATCH** `1.1.0 → 1.1.1` | Typo, whitespace, formatting, a clarifying word | No score movement | Unchanged |
| **MINOR** `1.1.0 → 1.2.0` | Capability added, instruction tightened, a new case handled | Scores hold or rise; no regressions | May add cases |
| **MAJOR** `1.2.0 → 2.0.0` | Behavior changed such that old expected outputs no longer apply | Old `expected.jsonl` is rewritten | Goldset + baseline re-frozen |

The rule of thumb: **if the existing `expected.jsonl` is still correct, it's not
a MAJOR.** A MAJOR bump means the *right answer* changed, so the goldset's
expectations and the regression baseline both move forward intentionally (with a
CHANGELOG entry recording the new scores) — you don't bypass the gate, you
advance it.

### The model is part of the version

A prompt pinned to `claude-opus-4-8` and the same text pinned to
`claude-haiku-4-5` are two different evaluable artifacts — they score
differently and fail differently. The pinned model ID (from `oc-claude-api`'s
routing decision) lives in `eval.yaml`. Changing the pinned model is at least a
MINOR bump and triggers a drift check (see `drift-detection.md`), because the
scores will move even though `prompt.md` didn't.

## Diffing prompts and their eval deltas

A prompt change is reviewed as **two diffs in one**: the text and the score.

```
/oc-prompt diff model-routing@v1.1.0 model-routing@v1.2.0
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 prompt.md
- Route long-context tasks to a high-capability model.
+ Route tasks over 200k tokens to claude-opus-4-8 or claude-fable-5.

 eval scorecard (goldset: 28 cases)
   pass_rate    0.93 → 0.95   +0.02
   regressions  1   (route-014: long-context now routes to Haiku)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

Rules:
- **No diff ships without its score delta.** If the scorecard for either version
  is stale, `diff` re-runs the eval before printing. A wording change reviewed
  without "and here's what it did to the scores" is reviewed blind.
- The text diff is a plain line diff of `prompt.md`. Keep prompts in markdown,
  one idea per line where practical, so diffs are legible — a prompt written as
  one 400-word paragraph produces a single unreadable changed line.
- The score delta is per-mode (pass rate) plus the list of cases that flipped in
  either direction. A regression (a case that flipped pass→fail) is always
  surfaced, even when the aggregate rose.

## CHANGELOG discipline

`CHANGELOG.md` is the human-readable history a reviewer reads before the diff.
One entry per version, newest first, each recording **what changed and what it
did to the scores**:

```markdown
# model-routing — Changelog

## v1.2.0 — 2026-06-21
- Tightened long-context routing to name explicit models + token threshold.
- pass_rate 0.93 → 0.95 (+0.02). One regression: route-014 (long-context →
  Haiku) — fixed in the same PR before merge.
- Pinned model unchanged (claude-opus-4-8).

## v1.1.0 — 2026-06-10
- Added explicit Haiku routing for classification/extraction.
- pass_rate 0.88 → 0.93 (+0.05). No regressions. Baseline re-frozen at 0.93.

## v1.0.0 — 2026-06-01
- Initial versioned prompt. Goldset: 24 cases. pass_rate 0.88.
```

The entry is the bridge between the version number and the scorecard: it states
the bump's intent in words, then the measured effect in numbers. A version
without a CHANGELOG entry recording its score delta is not done — the number is
the whole reason the prompt is in the repo instead of a console.
