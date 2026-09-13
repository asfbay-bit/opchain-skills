# Pricing Reference (dated snapshot)

> **Source of truth is `oc-claude-api`, not this file.** The numbers below are a
> **snapshot** copied from `oc-claude-api`'s `references/model-routing.md` so cost
> math is self-contained. Always verify against `oc-claude-api` before quoting a
> price to a user — model prices change and this snapshot can go stale.
>
> **Snapshot date:** 2026-06-25 (v1.6).

## Standard per-token prices

Prices are USD per **million tokens** (MTok). Pin to the **base model ID**
(no date suffix).

| Model | ID | Context | Input $/MTok | Output $/MTok |
|---|---|---|---:|---:|
| Claude Fable 5 | `claude-fable-5` | 1M | $10 | $50 |
| Claude Opus 4.8 | `claude-opus-4-8` | 1M | $5 | $25 |
| Claude Sonnet 4.6 | `claude-sonnet-4-6` | 1M | $3 | $15 |
| Claude Haiku 4.5 | `claude-haiku-4-5` | 200K | $1 | $5 |

Older Opus (`claude-opus-4-6`, `claude-opus-4-7`) remain billable if pinned;
check `oc-claude-api` for their prices.

## The cost formula

```
cost_usd = (input_tokens  / 1e6) * input_price
         + (output_tokens / 1e6) * output_price
```

Cache and Batch are multipliers on top (see below). `cost-attribution.md` shows
the worked phase-level version.

## Batch API — 50% of standard

Eval suites, bulk summarization, and any latency-tolerant workload should run
through the **Batch API at 50% of the standard price** (both input and output).
Eval is latency-tolerant *by definition*, so Batch is the right default for
`oc-prompt-ops` eval runs.

```
batch_cost = standard_cost * 0.5
```

## Prompt caching — the big lever

Caching is **model-scoped** (a mid-conversation model switch invalidates the
whole cache — keep one model per cached prefix; spawn a Haiku *subagent* for a
cheap sub-task rather than switching the main loop). Cache economics from
`oc-claude-api`'s `prompt-caching.md`:

- **Cache write:** a one-time premium over base input price on the first call
  that establishes the cached prefix.
- **Cache read:** subsequent calls re-reading the cached prefix pay a steep
  discount vs. base input price.

A high cache-hit rate (`oc-claude-api cache-audit` targets ≥ 60%) is usually the
single largest cost reduction available — larger than a model downgrade — for
any skill with a stable system prompt / reference preamble. Cost Ops's
`/oc-cost route` recommendation always checks cache-hit rate before recommending
a tier change, because fixing caching often removes the need to downgrade at all.

## Relative cost intuition (for routing)

Normalizing to Haiku input = 1×:

| Model | Input rel. | Output rel. |
|---|---:|---:|
| Haiku 4.5 | 1× | 1× |
| Sonnet 4.6 | 3× | 3× |
| Opus 4.8 | 5× | 5× |
| Fable 5 | 10× | 10× |

So routing a phase from Opus → Haiku is a **5× input / 5× output** reduction —
but only take it when Haiku holds quality on that phase (see
`model-tier-routing.md`). Output tokens dominate cost on generative phases
(output price is 5× input across the board), so trimming verbose output or
capping `max_tokens` is often a bigger win than a tier change.
