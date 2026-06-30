---
name: oc-rag-forge
displayName: OC · RAG Forge
version: 1.7.0
shortDesc: Design and build RAG systems — vector DB choice, embeddings, chunking, hybrid search, retrieval eval. Tri-agent.
phases: [build, ai-native]
triAgent: true
tryable: true
commands:
  - /oc-rag
  - /oc-rag eval
  - /oc-rag bench
description: >
  Retrieval-augmented generation harness with a Designer/Builder/Evaluator
  loop. Owns vector DB selection (pgvector, Turbopuffer, Pinecone, Supabase
  Vectors), embedding-model choice, chunking strategy, hybrid search, and
  retrieval evaluation. Use for /oc-rag, "RAG", "vector database", "embeddings",
  "chunking", "semantic search", "hybrid search", "retrieval eval", "reranking",
  "knowledge base". Trigger liberally on retrieval / RAG work.
governance:
  breaking_change_policy: skills/CHANGELOG.md
  last_reviewed: 2026-06-21
  owner: opchain
  docs:
    - { path: SKILL.md, kind: contract, lifecycle: stable }
---

# RAG Forge

**On first invocation, read `references/orchestrator.md` and follow its welcome protocol** (if present; otherwise fall back to the shared `skills/orchestrator.md`).

Tri-agent retrieval harness: the **Designer** picks the retrieval architecture
(vector DB, embedding model, chunking strategy, search mode) → the **Builder**
materialises the ingestion + retrieval pipeline and indexes a corpus → the
**Evaluator** scores retrieval quality against a labelled set with isolated
context and gates the system on recall/MRR/nDCG/faithfulness thresholds.

RAG is not "embed some docs and hope." Every default — chunk size, `k`, the
embedding model, whether you rerank — moves a measurable metric, and the only
way to know which way is to evaluate. This skill exists to make retrieval an
*evaluated* artifact, not a vibe.

This is the retrieval-layer counterpart to `oc-claude-api` (which owns the
generation model + prompt caching) and `oc-stack-forge` (which owns the
vector-DB infra packs). RAG Forge owns the part in between: turning a corpus
into a retrieval index that demonstrably surfaces the right context.

---

## /oc-rag — Command Reference

```
RAG FORGE COMMANDS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  TRI-AGENT HARNESS
  /oc-rag                Design a RAG system end-to-end (Designer → Builder → Evaluator)
  /oc-rag design         Pick vector DB, embedding model, chunking, search mode (Designer)
  /oc-rag build          Materialise ingest + retrieval pipeline, index corpus (Builder)
  /oc-rag eval           Score retrieval against a labelled set (Evaluator)

  RETRIEVAL DESIGN
  /oc-rag chunk          Choose / tune a chunking strategy for a corpus
  /oc-rag embed          Choose / swap the embedding model
  /oc-rag hybrid         Add BM25 + dense fusion and a reranker

  EVALUATION
  /oc-rag goldset        Build or extend the labelled query→relevant-doc set
  /oc-rag bench          Benchmark vector-DB / embedding / chunking choices head-to-head
  /oc-rag regress        Re-run the goldset and gate on metric regression

  UTILITIES
  /oc-rag inspect        Dump retrieved chunks for a query (debug retrieval)
  /checkpoint            Show checkpoint status

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  Type any command to begin. /oc-rag to see this again.
```

---

## Tri-Agent Architecture

```
CORPUS + RETRIEVAL INTENT
(from oc-app-architect: "this app needs a knowledge base / semantic search")
        │
        ▼
┌──────────────────┐
│   RAG            │  Picks the retrieval architecture: vector DB,
│   DESIGNER       │  embedding model, chunking strategy, search mode
│                  │  (dense / hybrid / + reranker). Declares targets.
└────────┬─────────┘
         │
         ▼
┌──────────────────────────────────────────────┐
│     RETRIEVAL LOOP (per corpus / config)     │
│                                              │
│  ┌────────────┐  config     ┌─────────────┐  │
│  │    RAG     │◄─negotiate──►│    RAG      │  │
│  │  BUILDER   │             │  EVALUATOR  │  │
│  │            │──index─────►│             │  │
│  │  Ingests + │             │  Runs the   │  │
│  │  chunks +  │             │  goldset,   │  │
│  │  embeds +  │◄──failures──│  scores     │  │
│  │  indexes   │             │  recall/MRR │  │
│  └────────────┘             └─────────────┘  │
│       │                           │          │
│       │   Metrics ≥ thresholds?   │          │
│       └───────────────────────────┘          │
└──────────────────────────────────────────────┘
         │
         └──► Regression gating (ongoing, in CI)
```

### Why Three Agents for Retrieval?

1. **Self-graded retrieval is fiction.** Whoever builds the pipeline picks the
   chunk size, the `k`, the embedding model — and then eyeballs three queries
   that happen to work. The Evaluator runs a *labelled* set (query → known-relevant
   docs) with isolated context and reports recall@k, MRR, and nDCG. "It looks
   like it's finding the right stuff" is not a measurement.

2. **The generation hides retrieval failure.** A strong model (Claude) will
   produce a fluent, confident answer even when the retrieved context is wrong
   or empty — it falls back on parametric knowledge or hallucinates. **Faithfulness**
   (is the answer grounded in retrieved context?) and **context recall** (did we
   even retrieve the supporting passage?) catch this; answer quality alone does not.

3. **Every knob is a tradeoff with no obvious default.** Smaller chunks raise
   precision but fragment context; larger `k` raises recall but costs tokens and
   adds noise; a reranker fixes ordering but adds latency. The only honest way to
   set these is to move one knob, re-run the goldset, and keep the change if the
   metric improved. That is the Builder ↔ Evaluator loop.

---

## Phase 1: RAG Designer (`/oc-rag design`)

### Designer Persona

The Designer is a retrieval engineer who has shipped production RAG and has the
scars to prove that defaults matter. Key behaviors:

- **Read the corpus before choosing anything.** Volume (1K docs vs 50M chunks),
  modality (clean markdown vs scanned PDF vs code vs chat logs), update cadence
  (static snapshot vs streaming), and query shape (keyword-y lookups vs fuzzy
  natural-language questions) drive every other decision. Don't pick pgvector vs
  Pinecone in a vacuum.
- **Size the index first.** Estimated chunk count × embedding dimensions × 4 bytes
  is your raw vector footprint. 50M chunks × 1536 dims is ~300GB before the index
  overhead — that rules out "just use pgvector on the app's Postgres" and points
  at Turbopuffer or Pinecone. See `references/vector-db-decision.md`.
- **Default to hybrid, not pure dense.** Pure vector search silently fails on
  exact terms — product SKUs, error codes, proper nouns, acronyms. Dense + BM25
  fusion (then rerank the union) is the strong default for mixed corpora. Reserve
  pure dense for short, paraphrase-heavy semantic matching.
- **Pick the embedding model on the eval, not the leaderboard.** MTEB rank is a
  starting prior, not an answer. Domain (legal, code, multilingual) flips the
  ranking. The Designer commits to a *candidate set* (e.g. `text-embedding-3-large`,
  Cohere `embed-v4`, Voyage `voyage-3`, open `bge-large`) for the Builder to bench.
- **Declare the metric targets up front.** "recall@10 ≥ 0.90, MRR ≥ 0.75,
  faithfulness ≥ 0.95" before building. Targets the Designer can't justify from the
  product's tolerance for a missed answer aren't real targets.

### Designer Workflow

1. Read upstream context: corpus description, `oc-app-architect` `02-architecture.md`
   (is this a knowledge base? semantic search? agentic retrieval?), the chosen
   generation model from `oc-claude-api` (it bounds the context budget you can
   spend on retrieved chunks).
2. Walk the **vector-DB decision tree** → `references/vector-db-decision.md`.
3. Walk the **embedding-model decision tree** → `references/embedding-models.md`.
4. Pick a **chunking strategy** → `references/chunking-strategies.md`.
5. Choose **search mode**: dense-only, hybrid (dense + BM25), and whether to add a
   cross-encoder reranker.
6. Declare metric targets and write the **Retrieval Design** doc for approval.

### Vector-DB Decision Tree

These map 1:1 to `oc-stack-forge` packs with `kind: vector-db`. The Designer
recommends; `oc-stack-forge` provisions.

```
Already on Postgres + < ~1M chunks + ops-simplicity wins?
   └─► pgvector (HNSW)            → oc-stack-forge pack: pgvector

On Supabase specifically (RLS, edge functions, one platform)?
   └─► Supabase Vectors          → oc-stack-forge pack: supabase-vectors
       (pgvector under the hood + Supabase tooling/auth)

Need serverless scale-to-millions, object-storage economics, low ops?
   └─► Turbopuffer                → oc-stack-forge pack: turbopuffer
       (cheap at rest, native hybrid, great $/vector at scale)

Need a managed, battle-tested vector DB with rich metadata filtering
and you'll pay for hands-off ops?
   └─► Pinecone                   → oc-stack-forge pack: pinecone
```

Full tradeoff table (scale / latency / ops / cost) in
`references/vector-db-decision.md`.

### Embedding-Model Decision Tree

```
Multilingual corpus or non-English queries?
   └─► Cohere embed-v4 / Voyage multilingual / bge-m3

Code / mixed code+prose retrieval?
   └─► Voyage voyage-code / OpenAI text-embedding-3-large

General English, want the easy default + good price/quality?
   └─► OpenAI text-embedding-3-small (1536d) → -large (3072d) if recall is short

Self-host / no-egress / cost-at-volume mandatory?
   └─► open weights: bge-large-en-v1.5, e5-large, nomic-embed

Storage / latency pressure at huge scale?
   └─► Matryoshka truncation (3-large → 256/512d) or a 384d open model
```

Dimension vs recall tradeoffs, fine-tuning triggers, and the full table live in
`references/embedding-models.md`.

### Chunking Strategy (quick map)

| Corpus | Default strategy | Notes |
|---|---|---|
| Clean markdown / docs | Structural (by heading) → recursive fallback | Respect doc structure |
| Long prose / books | Recursive char split, 512–1024 tok, 10–20% overlap | Overlap preserves context |
| Heterogeneous / mixed quality | Semantic chunking (embedding-distance splits) | Costlier, higher coherence |
| Q&A / support tickets | One chunk per item | Natural unit already |
| Code | Structural by symbol (function/class) | AST-aware, never mid-function |
| Tables / scanned PDF | Parse → structural; keep tables whole | Don't split a table row-wise |

Use **parent-document retrieval** when you need precise matching *and* full
context: embed small child chunks for the match, return the larger parent for the
LLM. Full heuristics in `references/chunking-strategies.md`.

### Gate: Retrieval Design Approval

Present the design: vector DB (+ stack-forge pack), embedding model (+ candidate
set to bench), chunking strategy, search mode, and the declared metric targets.
Confirm with the user. Write checkpoint: phase `designed`.

---

## Phase 2: Build Loop (`/oc-rag build`)

### Step 1: Build Contract

**Builder proposes:**

```markdown
## RAG Build Contract

### Deliverables
- Ingestion pipeline: load → clean → chunk → embed → upsert (idempotent on doc id)
- Vector index provisioned via oc-stack-forge pack [pgvector|turbopuffer|pinecone|supabase-vectors]
- Retrieval function: query → embed → (dense ∪ BM25) → rerank → top-k chunks
- Metadata filter support (tenant, source, date, doc_type)
- A labelled goldset (≥ 50 query→relevant-doc pairs) for the Evaluator
- Re-index / incremental-update path (no full rebuild for one changed doc)

### Testable Criteria
1. Re-running ingest on an unchanged corpus is a no-op (idempotent upserts)
2. Retrieval returns chunks with stable ids + source metadata + scores
3. Metadata filters actually restrict the candidate set (tenant isolation holds)
4. Hybrid fusion + rerank are wired and toggleable for the bench
5. The goldset exists and every query has ≥ 1 labelled relevant doc

### Metric Targets (from Designer)
- recall@10 ≥ 0.90
- MRR ≥ 0.75
- nDCG@10 ≥ 0.80
- faithfulness ≥ 0.95 (end-to-end, on the generation)
```

**Evaluator reviews** and pushes back if:
- There's no goldset (you cannot evaluate retrieval without labels)
- Upserts aren't idempotent (re-ingest duplicates the corpus and inflates recall)
- Metadata/tenant filtering isn't testable (a multi-tenant RAG leak is a breach)
- Targets are absent or unjustified

### Step 2: Builder Implements

Builder reads the chosen vector-DB pack from the `oc-stack-forge` checkpoint and
uses that pack's client + index config rather than reinventing it:

| Vector DB (stack-forge pack) | Index | Hybrid support | Client pattern |
|---|---|---|---|
| `pgvector` | HNSW (`vector_cosine_ops`) | BM25 via Postgres FTS (`tsvector`) + app-side fusion | SQL + `pgvector` driver |
| `supabase-vectors` | HNSW (pgvector) | FTS + RPC fusion function | Supabase client / RPC |
| `turbopuffer` | native ANN | native BM25 + vector in one query | Turbopuffer SDK |
| `pinecone` | native ANN | sparse-dense vectors or integrated reranker | Pinecone SDK |

Embedding generation: batch the corpus through the chosen model (respect rate
limits, retry with backoff, cache by content hash so re-runs are cheap). If the
generation model is Claude via `oc-claude-api`, the retrieved chunks become cached
prefix content — coordinate chunk ordering with prompt-caching boundaries.

### Step 3: Evaluator

The Evaluator runs with **isolated context** — it sees the goldset and the live
retrieval function, not the Builder's tuning rationale.

**Evaluator Persona.** A retrieval QA engineer who trusts numbers over demos. Key
behaviors:

- **Run the whole goldset, not three cherry-picked queries.** Report aggregate
  recall@k, MRR, and nDCG@10 with per-query breakdown for the failures.
- **Separate retrieval failure from generation failure.** If recall@k is high but
  answers are wrong, the bug is in generation/prompting, not retrieval. If recall
  is low, no amount of prompt tuning saves it. Name which layer failed.
- **Measure faithfulness and answer relevance** on the end-to-end output: is every
  claim grounded in a retrieved chunk, and does the answer address the question.
- **Probe the known failure modes**: exact-term queries (does hybrid catch the
  SKU/error-code?), out-of-corpus queries (does it correctly retrieve nothing /
  abstain?), and adversarial near-duplicates.
- **Gate on regression, not just absolutes.** A change that lifts recall@10 from
  0.91 to 0.93 but drops MRR from 0.80 to 0.62 made retrieval *worse* for the
  top result. Report deltas vs the last passing config.

**Evaluator Report** saved to `rag/eval-round-M.md`:

```markdown
## RAG Evaluation — Round [M]

### Config Under Test
- Vector DB: turbopuffer | Embedding: text-embedding-3-large (3072d)
- Chunking: recursive 768 tok / 15% overlap | Search: hybrid + Cohere rerank-v3.5
- k (retrieve): 40 → rerank → 10

### Retrieval Metrics (goldset: 80 queries)
| Metric | Value | Target | Pass? |
|---|---|---|---|
| recall@10 | 0.93 | ≥ 0.90 | PASS |
| MRR | 0.78 | ≥ 0.75 | PASS |
| nDCG@10 | 0.81 | ≥ 0.80 | PASS |

### Generation Metrics
| Metric | Value | Target | Pass? |
|---|---|---|---|
| faithfulness | 0.96 | ≥ 0.95 | PASS |
| answer relevance | 0.88 | ≥ 0.85 | PASS |

### Failure Analysis
- 5 queries below recall@10: 4 are exact-SKU lookups (hybrid weight too low on sparse)
- 1 out-of-corpus query: correctly retrieved nothing, model abstained ✓

### Delta vs Round [M-1]
- recall@10 +0.04, MRR +0.06 (reranker added). No regressions.

### Verdict: PASS / FAIL
[If FAIL: which metric, which queries, which knob to move]
```

Scoring rubric details (how each metric is computed, faithfulness judging) live in
`references/retrieval-eval.md`.

### Step 4: Iterate or Advance

- **PASS**: Retrieval is shippable. Freeze the config, commit the goldset, register
  the regression suite with CI, hand off to `oc-claude-api` for the generation
  layer and `oc-deploy-ops` for the pipeline.
- **FAIL + rounds remaining**: Feed the failure analysis to the Builder. Move *one*
  knob (chunk size, `k`, hybrid weight, reranker, embedding model), re-run.
- **FAIL + max rounds**: Escalate to user with all round reports and the metric
  trajectory.

Max iterations: 3. Each iteration moves one variable so the delta is attributable.

---

## Benchmark Mode (`/oc-rag bench`)

`bench` is the Evaluator running a **grid**, not a single config — it sweeps the
candidate set the Designer declared (embedding models × chunk sizes × search modes)
and reports the full metric matrix so the winning config is chosen by data.

```
RAG BENCH — corpus: support-kb (12,400 chunks) — goldset: 80 queries
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
embedding              chunk   search          recall@10  MRR   $/1M  p95ms
text-embedding-3-small  512     dense            0.84      0.69  0.02   31
text-embedding-3-small  512     hybrid           0.89      0.74  0.02   44
text-embedding-3-large  768     hybrid           0.91      0.77  0.13   46
text-embedding-3-large  768     hybrid+rerank    0.93      0.81  0.13   88
cohere embed-v4         768     hybrid+rerank    0.94      0.82  0.10   91
bge-large (self-host)   768     hybrid+rerank    0.90      0.76  0.00  120
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Recommend: cohere embed-v4 + 768/hybrid+rerank (best recall/MRR; reranker
adds ~45ms — acceptable for this product's latency budget).
```

The bench output is the evidence behind the Designer's final config choice. Always
include cost and p95 latency, not just quality — the best-recall config that
blows the latency budget is not the answer.

---

## Boundaries (what oc-rag-forge does NOT own)

| Concern | Owner | Why |
|---|---|---|
| The generation model, prompt caching of retrieved context, citations | `oc-claude-api` | RAG Forge surfaces chunks; oc-claude-api turns them into answers |
| Provisioning the vector DB (Postgres, Turbopuffer, Pinecone, Supabase) | `oc-stack-forge` | Owns the `kind: vector-db` packs; RAG Forge selects, stack-forge provisions |
| The app/data model the corpus lives in | `oc-app-architect` | RAG Forge is invoked *by* it for the retrieval surface |
| Prompt versioning / eval datasets for the *generation* prompt | `oc-prompt-ops` | Prompt-side evals; RAG Forge owns *retrieval* evals |
| Embedding *batch jobs* at scale, capacity math | `oc-scale-ops` | RAG Forge declares throughput needs; scale-ops sizes |
| Multi-tenant isolation threat model | `oc-security-auditor` | RAG Forge enforces metadata filters; security-auditor reviews the boundary |
| Deploying + monitoring the live retrieval service | `oc-deploy-ops` / `oc-monitoring-ops` | RAG Forge hands off a frozen, evaluated config |

RAG Forge's output is an *evaluated retrieval config* plus a regression goldset.
Sibling skills provision, generate, deploy, and monitor around it.

---

## Cross-Skill Integration

| Skill | How it connects |
|---|---|
| **oc-app-architect** | Auto-invokes RAG Forge when `02-architecture.md` calls for a knowledge base, semantic search, or agentic retrieval. RAG Forge returns the retrieval design into the architecture spec. |
| **oc-stack-forge** | Vector-DB choice maps to a `kind: vector-db` pack (`pgvector`, `turbopuffer`, `pinecone`, `supabase-vectors`). RAG Forge selects; stack-forge provisions + emits the client config. |
| **oc-claude-api** | Owns the generation model. RAG Forge pulls the model's context budget (how many chunks fit) and coordinates chunk ordering with prompt-caching boundaries. Citations/grounding live there. |
| **oc-prompt-ops** | Owns generation-prompt versioning + evals. RAG Forge's goldset is the *retrieval* analogue; the two regression suites run side by side. |
| **oc-deploy-ops** | Receives the frozen retrieval config + ingestion pipeline; gates prod on the regression goldset passing. |
| **oc-monitoring-ops** | Watches live retrieval: recall drift as the corpus grows, embedding-model deprecations, p95 latency. |
| **oc-security-auditor** | Reviews multi-tenant metadata-filter isolation and PII-in-embeddings exposure. |
| **oc-scale-ops** | Sizes the embedding batch jobs and the index at projected corpus volume. |

---

## Checkpoint Integration

### Checkpoint Location
`{project-dir}/.checkpoints/oc-rag-forge.checkpoint.json`

### When to Write

| Event | What to Save |
|---|---|
| Design approved | Vector DB + pack, embedding model + candidate set, chunking, search mode, targets |
| Build contract negotiated | Deliverables, criteria, goldset size |
| Builder completes | Corpus size, chunk count, index name, ingest pipeline path |
| Evaluator runs | Per-metric values vs targets, failure analysis, round number |
| Bench runs | Full config matrix, recommended config |
| Regression gate | Pass/fail + delta vs last frozen config |

### skill_state

```json
{
  "vector_db": "turbopuffer",
  "stack_forge_pack": "turbopuffer",
  "embedding": { "model": "cohere-embed-v4", "dims": 1024 },
  "chunking": { "strategy": "recursive", "size_tokens": 768, "overlap_pct": 15 },
  "search": { "mode": "hybrid", "reranker": "cohere-rerank-v3.5", "retrieve_k": 40, "final_k": 10 },
  "corpus": { "docs": 4200, "chunks": 12400 },
  "goldset": { "path": "rag/goldset.jsonl", "queries": 80 },
  "targets": { "recall_at_10": 0.90, "mrr": 0.75, "ndcg_at_10": 0.80, "faithfulness": 0.95 },
  "last_eval": {
    "round": 3,
    "verdict": "PASS",
    "metrics": { "recall_at_10": 0.94, "mrr": 0.82, "ndcg_at_10": 0.81, "faithfulness": 0.96 }
  }
}
```

### Cross-Skill Reads

| Reads from | Why |
|---|---|
| oc-app-architect | `02-architecture.md` retrieval intent + corpus description |
| oc-stack-forge | Chosen vector-DB pack + provisioned index config |
| oc-claude-api | Generation model + context budget for retrieved chunks |

| Read by | Why |
|---|---|
| oc-claude-api | Retrieved chunks feed the generation prompt (+ caching boundaries) |
| oc-deploy-ops | Frozen config + regression goldset as a deploy gate |
| oc-monitoring-ops | Retrieval metrics + corpus-growth drift to watch |
| oc-security-auditor | Tenant-isolation filter contract as a posture input |

---

## Principles

1. **Retrieval is an evaluated artifact, not a vibe.** Every config ships with a
   goldset and a recall@k / MRR / nDCG number. "Looks right" is not a measurement.
2. **The generation hides retrieval failure.** Measure faithfulness and context
   recall separately — a fluent wrong answer is a retrieval bug wearing a disguise.
3. **Default to hybrid.** Pure dense search silently misses exact terms. Dense +
   BM25 + rerank is the strong default; reserve pure dense for paraphrase matching.
4. **Pick the embedding model on the eval, not the leaderboard.** MTEB is a prior.
   Your domain flips the ranking. Bench the candidate set on your goldset.
5. **Move one knob per iteration.** Chunk size, `k`, hybrid weight, reranker,
   embedding model — change one, re-run, attribute the delta. Bundled changes hide
   which one helped.
6. **Gate on regression, not just absolutes.** A change that lifts recall but tanks
   MRR made the top result worse. Always report deltas vs the last passing config.
7. **Cost and latency are first-class metrics.** The best-recall config that blows
   the latency or token budget is not the answer. Bench reports `$` and p95 too.
8. **Idempotent ingest, isolated tenants.** Re-ingest must be a no-op on unchanged
   docs, and metadata filters must actually isolate tenants — a cross-tenant
   retrieval leak is a breach, not a bug.
9. **Select, don't reinvent.** Vector DB comes from an oc-stack-forge pack; the
   generation model from oc-claude-api. RAG Forge owns the layer in between.
10. **Freeze and regress.** Once a config passes, freeze it and run the goldset in
    CI. Corpus growth and model deprecations cause silent drift.
