# Supabase Vectors

pgvector, managed by Supabase, with the Supabase client, auth, and Edge
Functions around it. The oc-rag-forge pick when the app is already on Supabase —
you get vector search without standing up or operating Postgres yourself.

## When to pick it

- The app already uses Supabase (Postgres + Auth + Storage + Edge Functions).
- You want pgvector's SQL-native filtered search with a managed control plane
  and a typed client.
- Corpus up to ~1–5M vectors (same envelope as `pgvector`, since it *is*
  pgvector underneath).

## When to look elsewhere

- Not on Supabase and don't want it → plain `pgvector` (self-managed) or
  `pinecone` (fully managed, no Postgres).
- 10M+ vectors / strict p99 → `pinecone` or `turbopuffer`.

## Shape

Enable the extension, store embeddings, and query via an RPC or the client:

```sql
create extension if not exists vector;
create table documents (
  id bigint primary key generated always as identity,
  content text,
  embedding vector(1536)
);
create index on documents using hnsw (embedding vector_cosine_ops);
```

```ts
const { data } = await supabase.rpc("match_documents", {
  query_embedding: embedding,
  match_count: 10,
});
```

## Operational notes

- It's pgvector — everything in the `pgvector` pack applies (HNSW tuning,
  opclass ↔ metric, fixed dimension per column).
- Row Level Security composes with vector search: tenant isolation is a policy,
  not a separate index.
- Edge Functions are a convenient place to run the embed-then-query step close
  to the DB.

## oc-rag-forge integration

Selected by oc-rag-forge's vector-DB decision tree. Coverage flag:
`skills.coverage.supabase-vectors.enabled` (default on — status `stable`).
