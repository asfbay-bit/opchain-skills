# Pinecone

Fully-managed, serverless vector database. The oc-rag-forge pick when you want
zero vector-infra ops and predictable latency at scale, and you don't already
have (or don't want to scale) Postgres for vectors.

## When to pick it

- Large corpora (10M–1B+ vectors) with strict p99 latency targets.
- You want a managed service: no index tuning, no capacity planning, pay for
  what you store/query (serverless).
- Multi-tenant isolation via namespaces.

## When to look elsewhere

- You already run Postgres and the corpus is modest → `pgvector` (no new
  dependency, transactional with your rows).
- Cost-sensitive at small scale → `pgvector` or `supabase-vectors`.
- You want object-storage-backed economics at very large scale → `turbopuffer`.

## Setup

```ts
import { Pinecone } from "@pinecone-database/pinecone";
const pc = new Pinecone({ apiKey: process.env.PINECONE_API_KEY! });
const index = pc.index("docs");

await index.namespace("tenant-42").upsert([
  { id: "doc-1", values: embedding, metadata: { source: "kb", lang: "en" } },
]);

const res = await index.namespace("tenant-42").query({
  vector: queryEmbedding,
  topK: 10,
  filter: { lang: { $eq: "en" } },     // metadata filtering
  includeMetadata: true,
});
```

## Operational notes

- Pick the metric (`cosine` / `dotproduct` / `euclidean`) at index creation; it
  cannot be changed later.
- Use namespaces for tenant isolation rather than separate indexes.
- Hybrid search (dense + sparse) is supported via sparse-dense vectors; see
  oc-rag-forge `references/retrieval-eval.md` for when hybrid is worth it.

## oc-rag-forge integration

Selected by oc-rag-forge's vector-DB decision tree. Coverage flag:
`skills.coverage.pinecone.enabled` (default on — status `stable`).
