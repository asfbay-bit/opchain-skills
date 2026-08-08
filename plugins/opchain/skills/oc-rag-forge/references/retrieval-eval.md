# Retrieval Evaluation

The Evaluator's contract. No retrieval config ships without a labelled set and a
number. This doc defines the goldset, the metrics, the scoring rubric, and the
regression gate.

## 1. Building the labelled set (goldset)

A goldset is a list of `query → relevant doc/chunk ids` pairs. It is the ground
truth the Evaluator scores against.

```jsonl
{"id": "q1", "query": "how do I rotate an API key", "relevant": ["doc_42#sec3", "doc_88#sec1"]}
{"id": "q2", "query": "error code OC-4012 meaning", "relevant": ["doc_kb_4012"]}
{"id": "q3", "query": "what's the refund window", "relevant": ["doc_policy#refunds"]}
```

How to build one:

- **Mine real queries.** Pull from product logs, support tickets, search history.
  Synthetic-only goldsets miss how users actually phrase things.
- **Label relevance honestly.** For each query, mark the chunk(s) that actually
  answer it. Multiple relevant chunks per query is normal.
- **Cover the failure modes on purpose:** exact-term lookups (SKUs, error codes,
  proper nouns), paraphrase/semantic queries, multi-hop questions, and
  **out-of-corpus** queries whose correct answer is "nothing / abstain."
- **Size:** 50 is a floor for signal, 200+ is comfortable. Stratify by query type
  so you can read per-type recall, not just an average that hides a weak segment.
- **Version it in git** next to the pipeline. The goldset is the regression suite.

LLM-assisted bootstrapping: have a model draft `query → relevant` pairs from the
corpus, then a human accepts/edits. Speeds labeling; never replaces the human pass.

## 2. Retrieval metrics

Computed over the goldset, retrieving top-`k` per query.

| Metric | What it answers | Formula sketch |
|---|---|---|
| **recall@k** | Did the relevant doc make the top k? | (relevant retrieved in top-k) / (total relevant) |
| **precision@k** | How much of the top-k is relevant? | (relevant in top-k) / k |
| **MRR** | How high is the *first* relevant hit? | mean of 1/rank-of-first-relevant |
| **nDCG@k** | Are relevant docs ranked near the top? (graded) | DCG / ideal-DCG, position-discounted |
| **Hit rate** | Did *any* relevant doc appear? | fraction of queries with ≥1 relevant in top-k |

Reading them:

- **recall@k** is the ceiling for the whole system — if the supporting passage
  isn't retrieved, the answer cannot be grounded. Watch this first.
- **MRR** captures top-result quality. High recall + low MRR = right docs, wrong
  order → add a reranker.
- **nDCG** is the most complete single number when you have graded relevance
  (highly/somewhat/not relevant), since it rewards putting the best doc first.
- Report retrieval `k` (e.g. retrieve 40 → rerank → 10) explicitly; the metrics
  are meaningless without it.

## 3. Generation metrics (end-to-end)

Retrieval can be perfect and the answer still wrong — and vice versa. Measure both
layers so you know which one to fix. These are typically scored by an LLM judge
(or a framework like RAGAS) against the question, retrieved context, and answer.

| Metric | What it answers |
|---|---|
| **Faithfulness / groundedness** | Is every claim in the answer supported by retrieved context? (catches hallucination) |
| **Answer relevance** | Does the answer actually address the question? |
| **Context precision** | Of the retrieved chunks, how many were actually used/relevant? (noise check) |
| **Context recall** | Did retrieval surface everything needed to answer fully? |

Decision rule: **low context recall → fix retrieval** (chunking, `k`, embedding,
hybrid). **High context recall but low faithfulness → fix generation** (prompt,
grounding instructions, the model) — that's `oc-claude-api`/`oc-prompt-ops`
territory, not retrieval.

## 4. The Evaluator's scoring rubric

For each round the Evaluator:

1. Runs every goldset query through the live retrieval function (isolated context;
   no access to the Builder's tuning rationale).
2. Computes recall@k, MRR, nDCG@k aggregate + per-query.
3. Runs the end-to-end pipeline on a sample to score faithfulness + answer relevance.
4. Buckets the failures by query type (exact-term / paraphrase / multi-hop /
   out-of-corpus) and names the suspected knob for each bucket.
5. Compares every metric against (a) the declared targets and (b) the previous
   passing round's values.

**Verdict = PASS** only if every metric meets its target **and** no metric
regressed materially vs the last passing config. A single broken core query type
(e.g. all exact-SKU lookups failing) is a FAIL even if the average looks fine.

## 5. Regression gating

Once a config passes, **freeze it** and wire the goldset into CI (`/oc-rag regress`):

- Re-run the goldset on every change to chunking, embedding, search config, or the
  corpus indexing code.
- Fail the build if any metric drops below target **or** regresses beyond a small
  tolerance (e.g. recall@10 down > 0.02) vs the frozen baseline.
- Treat an embedding-model upgrade or a big corpus addition as a migration: re-embed,
  re-run the goldset, compare deltas, re-freeze. `oc-monitoring-ops` watches for
  slow recall drift as the corpus grows in production and for provider model
  deprecations.

The goldset is to retrieval what a unit-test suite is to code: the thing that lets
you change the system without silently breaking it.
