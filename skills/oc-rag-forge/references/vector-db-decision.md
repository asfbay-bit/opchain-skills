# Vector-DB Decision

Choosing where the vectors live. The four options below correspond 1:1 to
`oc-stack-forge` packs with `kind: vector-db` — RAG Forge picks, stack-forge
provisions the index and emits the client config.

## The decision in one table

| | **pgvector** | **Supabase Vectors** | **Turbopuffer** | **Pinecone** |
|---|---|---|---|---|
| What it is | Postgres extension (HNSW/IVFFlat) | pgvector + Supabase platform | Serverless ANN on object storage | Managed vector DB |
| Sweet-spot scale | ≤ ~1M chunks | ≤ ~1–2M chunks | millions → billions | thousands → billions |
| Ops burden | You run Postgres | Supabase runs it | Fully managed, serverless | Fully managed |
| Cost shape | Free (your DB) + RAM for index | Supabase plan | Cheap at rest (S3-class), pay per query | Per-pod / serverless usage |
| Hybrid search | FTS (`tsvector`) + app-side fusion | FTS + RPC fusion | Native BM25 + vector in one query | Sparse-dense or integrated rerank |
| Metadata filtering | Full SQL (`WHERE`) | Full SQL + RLS | Rich attribute filters | Rich metadata filters |
| Latency (warm) | low (in-process) | low | low; cold-start on idle namespaces | low |
| Best when | Corpus already in Postgres; ops simplicity wins | You're already on Supabase | Scale + cost-at-rest matter, low ops | Want hands-off, rich filtering, will pay |

## Decision tree

```
Is the corpus already in (or naturally belongs in) Postgres,
and is it under ~1M chunks?
   YES → pgvector. One database, transactional consistency, SQL filters.
         Use HNSW (vector_cosine_ops); IVFFlat only for huge static sets.

Are you on Supabase specifically (auth, RLS, edge functions, one platform)?
   YES → Supabase Vectors. Same pgvector engine, but you get RLS-based
         tenant isolation and the Supabase client for free.

Do you need to scale into the millions/billions with low ops and the
index sitting cheaply at rest?
   YES → Turbopuffer. Object-storage economics, native hybrid in a single
         query, excellent $/vector. Mind cold-start latency on idle namespaces.

Do you want a fully managed, battle-tested DB with rich metadata filtering
and an integrated reranker, and you'll pay for hands-off ops?
   YES → Pinecone.
```

## Sizing math (do this first)

Raw vector footprint ≈ `chunks × dims × 4 bytes` (float32).

- 200K chunks × 1536d ≈ **1.2 GB** → comfortably pgvector.
- 5M chunks × 1536d ≈ **30 GB** of raw vectors; HNSW roughly doubles RAM needs →
  this is the edge of pgvector-on-a-shared-DB; consider Turbopuffer/Pinecone.
- 50M chunks × 3072d ≈ **600 GB** raw → Turbopuffer or Pinecone, not pgvector.

Levers if footprint hurts: a smaller-dim model, Matryoshka truncation
(`text-embedding-3-large` → 512d), or `int8`/binary quantization (trade a few
points of recall for 4–32× storage savings — re-validate on the goldset).

## Notes by option

- **pgvector** — Default to HNSW (`m=16`, `ef_construction=64` to start; raise
  `ef_search` at query time for recall). IVFFlat needs a trained list count and
  re-training as data grows; only worth it for very large static corpora. Hybrid
  is a manual job: a `tsvector` GIN index for BM25-ish FTS, then reciprocal-rank
  fusion in the app.
- **Supabase Vectors** — pgvector underneath, so all of the above applies. The win
  is platform integration: RLS gives you per-tenant row filtering enforced at the
  DB, which is the cleanest multi-tenant isolation story of the four.
- **Turbopuffer** — Built for this exact workload: cheap object-storage at rest,
  native combined BM25 + vector query, strong cost-at-scale. The tradeoff is
  cold-start latency on namespaces that have gone idle — fine for most apps,
  watch it for low-latency-critical paths.
- **Pinecone** — The "I don't want to think about the index" option. Serverless
  tier scales to zero; integrated reranking and sparse-dense hybrid remove
  app-side fusion code. You pay for that convenience.

## Anti-patterns

- Reaching for Pinecone/Turbopuffer at 50K chunks "to be safe" — pgvector on the
  DB you already run is simpler and cheaper. Scale *up* when sizing says to.
- Putting a 600 GB vector set on the app's primary Postgres and starving OLTP RAM.
- Choosing dense-only because the DB doesn't do hybrid well — that's a reason to
  pick a different DB, not to ship worse retrieval (see `chunking-strategies.md`
  and the hybrid section of `SKILL.md`).
