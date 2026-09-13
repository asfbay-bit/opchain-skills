# pgvector (Postgres)

Vector search as a Postgres extension. The default oc-rag-forge recommendation
when the app already runs Postgres — no new datastore, vectors live next to the
relational data, and one transaction spans both.

## When to pick it

- You already have Postgres (Supabase, Neon, RDS, self-hosted).
- Corpus up to ~1–5M vectors; recall and latency are fine with an HNSW index.
- You want filtered search using existing SQL `WHERE` clauses (metadata is just
  columns) and transactional consistency between rows and embeddings.

## When to look elsewhere

- 10M+ vectors with strict p99 latency → `turbopuffer` or `pinecone`.
- No Postgres in the stack and you don't want to run one → `pinecone`.

## Setup

```sql
create extension if not exists vector;
alter table documents add column embedding vector(1536);
-- HNSW: better recall/latency than ivfflat for most workloads.
create index on documents using hnsw (embedding vector_cosine_ops);
```

Query (cosine distance, `<=>`):

```sql
select id, content
from documents
where tenant_id = $1                       -- metadata filter via SQL
order by embedding <=> $2                   -- $2 = query embedding
limit 10;
```

## Operational notes

- Match the index opclass to your distance metric: `vector_cosine_ops`,
  `vector_l2_ops`, or `vector_ip_ops`. Cosine is the usual choice for
  normalized embeddings.
- HNSW build is memory-hungry; tune `m` / `ef_construction` for recall, and set
  `hnsw.ef_search` per query for the recall/latency tradeoff.
- Dimension is fixed per column — changing embedding models means a new column +
  reindex. See oc-rag-forge `references/embedding-models.md`.

## oc-rag-forge integration

This pack is selected by oc-rag-forge's vector-DB decision tree
(`references/vector-db-decision.md`). Coverage flag:
`skills.coverage.pgvector.enabled` (default on — status `stable`).
