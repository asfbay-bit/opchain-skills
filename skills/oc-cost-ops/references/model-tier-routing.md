# Model-Tier Routing

The cheapest model that holds quality on a phase is the right model for that
phase. Cost Ops recommends a tier per skill phase; it never silently downgrades
(an Opus phase quietly demoted to Haiku is a quality regression masquerading as a
cost win). The routing decisions here are **sourced from `oc-claude-api`** — Cost
Ops adds the cost lens, oc-claude-api owns the routing call.

## The decision: match tier to the phase's failure cost

```
Is the phase intelligence-sensitive — does a wrong answer cost a lot to undo?
  (spec, architecture, audit, migration, hard reasoning, LLM-judge grading)
        │ yes                                   │ no
        ▼                                       ▼
  claude-opus-4-8                       Is it volume-dominated and simple?
  (Fable 5 only for overnight             (classification, routing, extraction,
   autonomous runs that must               label-gen, bulk summarization)
   complete without correction)                 │ yes              │ no
                                                 ▼                  ▼
                                          claude-haiku-4-5   claude-sonnet-4-6
                                          (Batch if latency-  (build, codegen,
                                           tolerant)           balanced agentic)
```

## Phase → tier table (the opchain pipeline)

| Skill / phase | Recommended tier | Why |
|---|---|---|
| oc-app-architect discovery / spec | `claude-opus-4-8` | Ambiguity navigation, reasoning depth |
| oc-app-architect architecture design | `claude-opus-4-8` | Trade-off analysis, long-horizon coherence |
| oc-app-architect build / codegen | `claude-sonnet-4-6` | Fast, strong coding, cost-efficient at volume |
| oc-reverse-spec doc generation | `claude-sonnet-4-6` | High-throughput structured output |
| oc-code-auditor / oc-bug-check | `claude-opus-4-8` | Best real-bug recall + precision |
| oc-claude-api migrate | `claude-opus-4-8` | Careful breaking-change classification |
| oc-prompt-ops eval grading (LLM-judge) | `claude-opus-4-8` | Grader ≥ model under test |
| routing / classification / extraction | `claude-haiku-4-5` | Cheapest, simple decision |
| bulk summarization | `claude-haiku-4-5` + Batch | Volume-dominated; Batch = 50% |
| overnight autonomous build | `claude-fable-5` | Completes long runs without correction |

## Rules (from oc-claude-api, applied with the cost lens)

1. **Don't downgrade silently for cost.** Default the intelligence-sensitive
   phases to `claude-opus-4-8`. A tier downgrade is a recommendation the user
   accepts, attached to an expected quality check (re-run the phase's
   `eval_scores` after the change — if they hold, the downgrade is real savings;
   if they drop, it was a false economy).
2. **Fix caching before downgrading.** A low cache-hit rate often costs more than
   the tier gap. `/oc-cost route` checks cache-hit rate first and may recommend
   "fix caching, keep the tier" instead of a downgrade.
3. **Cap output, not just tier.** Output is 5× input price across all tiers;
   trimming verbose output or `max_tokens` is tier-independent savings.
4. **One model per cached prefix.** For a cheap sub-task inside an expensive loop,
   spawn a Haiku **subagent** rather than switching the main loop's model (a
   switch invalidates the cache — see `pricing-reference.md`).
5. **Batch the latency-tolerant.** Eval suites and bulk jobs go through the Batch
   API (50%); never pay standard price for work that can wait.

## What `/oc-cost route` outputs

A per-phase recommendation with the projected delta, e.g.:

```
COST ROUTING — myapp pipeline
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
phase            current        recommend      est. Δ/run   note
build            opus-4-8       sonnet-4-6     -$0.42       codegen holds on Sonnet
bulk-summarize   sonnet-4-6     haiku-4-5+B    -$0.31       simple + batchable
spec             opus-4-8       opus-4-8        $0.00       keep — intelligence-sensitive
eval-grading     opus-4-8       opus-4-8 (B)   -$0.18       batch the suite, keep tier
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Apply build+summarize downgrades, then re-run eval_scores to confirm quality holds.
```

The recommendation is advisory. The user applies it; the next eval confirms it.
