# Chunking Strategies

Chunking decides what unit gets embedded and retrieved. It is the single highest-
leverage, most-underrated knob in RAG: a great embedding model on bad chunks
retrieves garbage. Tune it on the goldset like everything else.

## The strategies

### 1. Fixed-size
Split every N tokens with optional overlap. Simple, fast, modality-agnostic.
Blindly cuts mid-sentence and mid-idea. Use as a baseline or for truly
unstructured text; rarely the best choice.

### 2. Recursive character splitting (the workhorse)
Split on a priority list of separators — `\n\n` → `\n` → `. ` → ` ` — recursing
to the next separator only when a chunk is still too big. Keeps paragraphs and
sentences intact far more often than fixed-size. **This is the sane default for
prose.** (LangChain's `RecursiveCharacterTextSplitter` is the canonical impl.)

### 3. Structural / document-aware
Chunk along the document's own structure: markdown headings, HTML sections, code
symbols (functions/classes), table boundaries, slide/page breaks. Respects the
author's units. Best for clean docs, code, and anything with real structure.
Carry the heading path into metadata (e.g. `H1 > H2 > H3`) so a chunk knows where
it came from.

### 4. Semantic
Embed sentences, then split where adjacent-sentence embedding distance spikes —
i.e. at topic boundaries. Produces the most topically coherent chunks. Costs an
extra embedding pass over the corpus and is slower; reach for it on heterogeneous
or messy corpora where structure is unreliable.

## Size + overlap heuristics

| Corpus type | Chunk size | Overlap | Strategy |
|---|---|---|---|
| Docs / knowledge base | 512–1024 tok | 10–20% | structural → recursive fallback |
| Long prose / books | 768–1024 tok | 15–20% | recursive |
| Support tickets / Q&A | 1 item = 1 chunk | none | per-record |
| Code | 1 symbol = 1 chunk | none | structural (AST/symbol) |
| Chat / transcripts | a turn or small window | 1 turn | structural by speaker turn |
| Tables / spreadsheets | keep a table whole; row-group large ones | none | structural, never mid-row |

Rules of thumb:

- **Smaller chunks → higher precision, more fragmentation.** Good for pinpoint
  fact lookup; bad when the answer needs surrounding context.
- **Larger chunks → more context per hit, more noise + token cost.** Good for
  narrative/explanatory answers.
- **Overlap (~10–20%)** stops a fact from being severed at a boundary. Too much
  overlap inflates the index and duplicates hits.
- Size to the **generation model's** context budget (from `oc-claude-api`): if you
  retrieve `k=10` chunks, `k × chunk_size` must comfortably fit alongside the
  prompt and answer.

## Metadata (attach it, always)

Every chunk should carry: `doc_id`, `source`/URL, `title`, heading-path or section,
`chunk_index`, `created_at`/`updated_at`, and any filter keys the app needs
(`tenant`, `doc_type`, `lang`, `version`). Metadata powers:

- **Filtered retrieval** — restrict the candidate set before/with the vector search
  (tenant isolation, recency, doc type). This is correctness *and* security.
- **Citations** — the generation layer (`oc-claude-api`) cites `source` + section.
- **Debuggability** — `/oc-rag inspect` shows where each retrieved chunk came from.

## Parent-document retrieval

The fix for the precision-vs-context tension. **Embed small child chunks** (high
match precision) but **return the larger parent** (full context to the LLM):

```
Index:   parent doc/section → split into small child chunks → embed children
Query:   match child chunks → dedupe to their parents → return parent text
```

Variants:
- **Small-to-big**: child = sentence/256-tok, parent = section/1024-tok.
- **Sentence-window**: match a sentence, return it ± a few neighbors.

Use it whenever you need exact matching *and* coherent context — the common case
for docs and long-form knowledge bases.

## Tuning loop

Chunking is a Builder ↔ Evaluator knob. Move one thing (size, overlap, strategy,
parent-doc on/off), re-run the goldset, keep the change if recall/MRR improved.
Don't pick a chunk size from a blog post and call it done — `/oc-rag bench` sweeps
sizes for you and reports the winner with cost and latency.

## Anti-patterns

- Splitting code mid-function or a table mid-row.
- One giant chunk per document (kills precision; the match is diluted).
- Tiny chunks with no parent retrieval (the LLM gets a fragment with no context).
- Dropping metadata — you lose filtering, citations, and tenant isolation.
- Chunking once and never re-evaluating after an embedding-model or corpus change.
