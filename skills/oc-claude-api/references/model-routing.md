# Model Routing

Which Claude model to use, by task and build phase. Model IDs and prices are
sourced from the bundled `claude-api` skill — verify against it rather than
memory when in doubt. **Use the exact ID strings below; never append a date
suffix** (`claude-sonnet-4-6`, not `claude-sonnet-4-6-20251114`).

## Current models

| Model | ID | Context | Input $/MTok | Output $/MTok | Use for |
|---|---|---|---|---|---|
| Claude Fable 5 | `claude-fable-5` | 1M | $10 | $50 | The most demanding reasoning + long-horizon autonomous runs. Above Opus-tier price — opt in explicitly. |
| Claude Opus 4.8 | `claude-opus-4-8` | 1M | $5 | $25 | Default for intelligence-sensitive work: spec, architecture, audit, migration, hard reasoning. |
| Claude Sonnet 4.6 | `claude-sonnet-4-6` | 1M | $3 | $15 | Best speed/intelligence balance: build, codegen, balanced agentic + tool-heavy loops. |
| Claude Haiku 4.5 | `claude-haiku-4-5` | 200K | $1 | $5 | Cheap, high-volume, simple: classification, routing, extraction, label-gen, summarization. |

Opus 4.6 (`claude-opus-4-6`) and 4.7 (`claude-opus-4-7`) remain active if you
need to pin a prior generation; default new work to 4.8.

## Decision table by build phase

| Phase / task | Model | Why |
|---|---|---|
| Discovery / spec authoring | `claude-opus-4-8` | Reasoning depth, ambiguity navigation |
| Architecture design | `claude-opus-4-8` | Trade-off analysis, long-horizon coherence |
| Build / codegen | `claude-sonnet-4-6` | Fast, strong coding, cost-efficient at volume |
| Reverse-spec / doc generation | `claude-sonnet-4-6` | High-throughput structured output |
| Code audit / bug-finding | `claude-opus-4-8` | Best real-bug recall + precision |
| Model migration | `claude-opus-4-8` | Careful classification + breaking-change reasoning |
| Long-horizon autonomous build | `claude-opus-4-8` → `claude-fable-5` | Fable 5 for overnight runs that complete without correction |
| Classification / routing | `claude-haiku-4-5` | Cheapest, fast, simple decision |
| Extraction / label-gen | `claude-haiku-4-5` | High volume, low complexity |
| Bulk summarization | `claude-haiku-4-5` (or Batch API) | Volume-dominated; Batch = 50% price |
| LLM-as-judge / eval grading | `claude-opus-4-8` | Grader should be ≥ the model under test |

## Routing rules

- **Don't downgrade silently for cost.** Default to `claude-opus-4-8` for
  anything intelligence-sensitive; surface a cheaper tier as an option, don't
  impose it. Cost cuts are the caller's decision.
- **One model per cached prefix.** Caches are model-scoped — a mid-conversation
  model switch invalidates the whole cache. For a cheaper sub-task, spawn a
  Haiku **subagent** and keep the main loop on one model.
- **Effort, not a thinking budget.** On 4.6+ control depth with
  `output_config.effort` (`low` | `medium` | `high` | `max`; `xhigh` on Opus
  4.7/4.8) plus adaptive thinking (`thinking: {type: "adaptive"}`).
  `budget_tokens` is removed (400) on Fable 5 / Opus 4.8 / 4.7 and deprecated on
  Opus 4.6 / Sonnet 4.6.
- **`max` is Opus-tier only.** `output_config.effort: "max"` works on Fable 5,
  Opus 4.6+, and Sonnet 4.6 — it errors on Haiku 4.5 and Sonnet 4.5.
- **Fable 5 has different behavior.** Thinking is always on (omit the `thinking`
  param; an explicit `{type: "disabled"}` is a 400), the raw chain of thought is
  never returned, safety classifiers can return `stop_reason: "refusal"`, and it
  requires 30-day data retention. Reach for it only when the user explicitly
  asks for the most capable model.

## Live capability lookup

The table above is cached. For "what's the context window for X" / "does X
support effort/vision" at runtime, query the Models API
(`client.models.retrieve(id)` / `client.models.list()`) rather than guessing.
`m.max_input_tokens`, `m.max_tokens`, and `m.capabilities[...]["supported"]`
are the live fields.
