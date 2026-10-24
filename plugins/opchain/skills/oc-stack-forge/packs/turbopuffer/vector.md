# Turbopuffer

Object-storage-backed vector + full-text search. The oc-rag-forge pick when the
corpus is very large and cost-per-vector matters more than single-digit-ms
cold-read latency — vectors live on S3-class storage with hot caching.

## When to pick it

- Very large corpora (10M–1B+ vectors) where Pinecone/pgvector storage cost is
  the dominant line item.
- Workloads tolerant of warm-cache latency (cold reads hit object storage).
- You want native hybrid (vector + BM25) in one query path.

## When to look elsewhere

- Strict p99 on cold data with no warm cache → `pinecone`.
- Small corpus already in Postgres → `pgvector`.
- Status is `beta` here — for a conservative default, prefer `pgvector` or
  `pinecone` until you've benchmarked your latency profile.

## Shape

```ts
await ns.write({
  upsert_rows: [
    { id: "doc-1", vector: embedding, content: "…", lang: "en" },
  ],
  distance_metric: "cosine_distance",
});

const res = await ns.query({
  rank_by: ["vector", "ANN", queryEmbedding],
  top_k: 10,
  filters: ["lang", "Eq", "en"],
  include_attributes: ["content"],
});
```

## Operational notes

- Namespaces are cheap and the unit of isolation — one per tenant scales well.
- First query against a cold namespace pays an object-storage fetch; keep hot
  paths warm or accept the tail. Benchmark with your real corpus before
  committing (see oc-rag-forge `references/retrieval-eval.md`).
- Hybrid ranking (vector + BM25) is first-class; useful for keyword-heavy
  domains.

## oc-rag-forge integration

Selected by oc-rag-forge's vector-DB decision tree. Coverage flag:
`skills.coverage.turbopuffer.enabled` (default **off** — status `beta`; flip it
on per-project once benchmarked).
