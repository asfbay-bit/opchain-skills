# Embedding Models

The embedding model decides what "similar" means for your corpus. Pick it on your
goldset (`/oc-rag bench`), not on a leaderboard — MTEB rank is a prior, and your
domain (legal, code, multilingual, support) routinely flips the ranking.

## Candidate set (2026)

| Model | Dims | Strengths | Notes |
|---|---|---|---|
| OpenAI `text-embedding-3-small` | 1536 | Cheap, solid English, easy default | Matryoshka-truncatable to 512/256 |
| OpenAI `text-embedding-3-large` | 3072 | Stronger recall, large context | Truncatable; ~6× cost of small |
| Cohere `embed-v4` | 256–1536 (configurable) | Excellent multilingual, native int8/binary, search-optimized | Has query/document input types |
| Voyage `voyage-3` / `voyage-3-large` | 1024–2048 | Top-tier general + long-context | `voyage-code` for code, `voyage-law`/`voyage-finance` domain variants |
| `bge-large-en-v1.5` (open) | 1024 | Strong English, self-hostable, free at volume | Needs the "represent this query" instruction prefix |
| `bge-m3` (open) | 1024 | Multilingual + multi-granularity (dense/sparse/colbert) | Great open hybrid option |
| `e5-large-v2` / `nomic-embed` (open) | 1024 / 768 | Self-host, good price/quality | `query:`/`passage:` prefixes matter |

## Decision tree

```
Multilingual corpus or non-English queries?
   → Cohere embed-v4, Voyage multilingual, or bge-m3. Do NOT use an
     English-only model and hope; recall collapses on other languages.

Code (or mixed code + prose)?
   → Voyage voyage-code, or text-embedding-3-large. Generic prose models
     under-retrieve on identifiers and call sites.

General English, want the easy, well-priced default?
   → text-embedding-3-small. If goldset recall is short, step up to
     text-embedding-3-large before doing anything exotic.

Must self-host (no egress, data residency, cost-at-volume)?
   → bge-large-en-v1.5 / bge-m3 / e5-large. Remember the instruction prefixes.

Storage or latency pressure at scale?
   → Matryoshka truncation (3-large → 512/256d) or a 384–768d open model,
     or int8/binary quantization. Re-validate recall after truncating.
```

## Dimension vs recall tradeoff

More dimensions usually means higher recall but more storage, RAM, and per-query
compute. The relationship is sharply diminishing:

- Going 768 → 1536 often buys a few points of recall.
- Going 1536 → 3072 buys less, for double the storage.
- **Matryoshka** models (OpenAI 3-*, Cohere embed-v4) are trained so the leading
  N dimensions are self-contained — you can truncate `3-large` to 512d and keep
  most of the recall. This is the right lever when storage hurts: truncate, then
  confirm the goldset still passes.

Quantization is the other lever: `int8` (~4× smaller) is usually near-lossless;
binary (~32× smaller) costs more recall but can be rescued by reranking the binary
shortlist with full-precision vectors. Always re-run the eval after quantizing.

## Operational rules

- **Use the model's input types.** Cohere and the open models distinguish *query*
  vs *document* / need an instruction prefix. Embedding queries as documents (or
  dropping the bge/e5 prefix) silently degrades recall — a common, invisible bug.
- **Embed at index time and query time with the same model + version.** A model
  swap means a full re-index. Pin the version; treat an embedding-model upgrade as
  a migration (re-embed, re-run goldset, compare deltas) — `oc-monitoring-ops`
  watches for provider deprecations.
- **Cache by content hash.** Re-ingest should not re-embed unchanged chunks.
- **Normalize** if your DB uses cosine vs inner-product expectations; mismatched
  metrics quietly wreck rankings.

## When to fine-tune (rarely, and last)

Reach for an off-the-shelf model + hybrid + a reranker *first* — that fixes most
gaps far more cheaply than fine-tuning. Consider fine-tuning a domain embedding
model only when **all** of these hold:

- You have a real labelled set (thousands of query→relevant pairs, not 50).
- The domain vocabulary is genuinely out-of-distribution (specialized legal/medical
  jargon, internal product taxonomy, a non-natural-language symbol space).
- Hybrid + reranking has plateaued below target on the goldset.
- You can own the retraining + re-index cadence as the corpus evolves.

Even then, fine-tuning the **reranker** is often a better ROI than fine-tuning the
bi-encoder, because the reranker sees the query and document jointly. Decide on the
eval, not on instinct.
