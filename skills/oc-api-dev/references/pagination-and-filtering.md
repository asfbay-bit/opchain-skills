# Pagination, Filtering, and Bulk Patterns

Reference for first-party API design. Pick one pagination shape, one filter
grammar, and one bulk pattern, and apply them everywhere. Variation is more
expensive than the wrong choice.

---

## Pagination

### Cursor (default for public APIs)

```
GET /widgets?cursor=eyJpZCI6...&limit=50
→ 200 OK
{
  "data": [ ... ],
  "next_cursor": "eyJpZCI6..."   // null when no more pages
}
```

- Cursor is **opaque** to the consumer — never document it as "the id of the last
  row" because that locks you into never changing the sort key.
- Encode the cursor as base64 of `{"k": "<sort-key value>", "id": "<tiebreaker>"}`.
  Always include a tiebreaker (UUID, monotonically-increasing id) so sorts on
  non-unique fields are deterministic.
- `limit` has a server-enforced ceiling (default: 50, max: 200). Reject larger
  values with `400` rather than silently capping.
- No `prev_cursor` unless the consumer needs bidirectional traversal — most don't.
- No `total` field. Counting all rows defeats cursor pagination's reason to exist.
  If the consumer needs a count, expose `GET /widgets:count` as a separate
  operation that the client calls only when it needs a number.

### Offset (only when justified)

Use offset/limit only when:
- The dataset is bounded and small (< 10k rows).
- The consumer is a UI you control (admin tool, internal dashboard) where
  jump-to-page-N is a real user need.
- The data has no natural sort key.

```
GET /widgets?offset=100&limit=50
```

Drawbacks: slow on large tables (`OFFSET` scans), unstable when rows are inserted
mid-pagination, and `total` queries become expensive at scale.

### Time-bucketed (audit logs, events, metrics)

```
GET /events?since=2026-04-27T00:00:00Z&until=2026-04-27T01:00:00Z&limit=500
```

Use for append-only stores where consumers want "everything in this window."
Combine with cursor pagination if windows can exceed `limit` rows.

---

## Filtering

### Choose one grammar — no mixing

**Option A: explicit query params (simple).** Good for ≤ 5 filter dimensions.

```
GET /widgets?status=active&owner_id=abc&created_after=2026-01-01
```

Each dimension is a documented parameter with a typed schema in OpenAPI.
Multi-value: comma-separated (`status=active,pending`) — document the
separator. Operators: `_after`, `_before`, `_gte`, `_lte` suffixes when ranges
are needed (`created_after=...`, `amount_gte=100`).

**Option B: structured filter expression (powerful).** Good for ≥ 6 filter
dimensions or arbitrary boolean composition.

```
GET /widgets?filter=status:eq:active+owner_id:in:abc,def+created_at:gte:2026-01-01
```

Pick one syntax (RSQL, FIQL, JSON-encoded predicate tree) and stick to it.
Document the operators (`eq`, `ne`, `gt`, `gte`, `lt`, `lte`, `in`, `like`) as a
closed enum.

**Option C: GraphQL `where` argument.** Native — use it if the API is GraphQL.

Don't ship Option A *and* Option B for different endpoints. Consumers must learn
exactly one grammar.

### Sorting

```
GET /widgets?sort=-created_at,name
```

`-` prefix = descending. Multi-key sort separated by comma. Document each sort
field as an enum in OpenAPI; reject anything else with `400`. Always require a
tiebreaker when paginating, even if the consumer doesn't ask for one — append
the primary key to the sort silently.

### Sparse fieldsets (optional)

```
GET /widgets?fields=id,name,status
```

Consumers opt into smaller payloads. Validate that requested fields exist;
unknown fields → `400`. Don't mix this with GraphQL — pick one mechanism for
field selection.

---

## Bulk Operations

### Bulk read

Most consumers don't need this — they paginate. If you do ship it:

```
POST /widgets:batch-get
{
  "ids": ["a", "b", "c"]
}
→ 200 OK
{
  "data":   [ { "id": "a", ... }, { "id": "c", ... } ],
  "errors": [ { "id": "b", "error": { "type": "...", "title": "Not found" } } ]
}
```

Cap batch size in OpenAPI (`maxItems: 100`). Mixed success/failure response —
never fail the whole batch because one id is missing.

### Bulk write

Two shapes — pick one per resource:

**Atomic.** All succeed or all fail. Useful when items are interdependent.

```
POST /widgets:batch-create
{ "items": [ ... ] }
→ 201 Created   (all)
→ 422 Unprocessable Entity   (none — problem+json with per-item errors)
```

**Best-effort.** Each item independent.

```
POST /widgets:batch-create
{ "items": [ ... ] }
→ 207 Multi-Status
{
  "results": [
    { "status": 201, "data": { "id": "...", ... } },
    { "status": 422, "error": { "type": "...", "title": "Invalid name" } }
  ]
}
```

Always require `Idempotency-Key` on bulk writes — they're the most painful to
retry.

---

## Async / Long-Running Operations

For work that doesn't fit in a 30s response window (large exports, ML inference,
batch processing):

### 1. Operation envelope

```
POST /exports
→ 202 Accepted
Location: /operations/op_abc123
{
  "operation": {
    "id": "op_abc123",
    "status": "pending",
    "created_at": "...",
    "metadata": { "export_type": "csv", "row_count": 50000 }
  }
}
```

### 2. Status polling

```
GET /operations/op_abc123
→ 200 OK
{
  "operation": {
    "id": "op_abc123",
    "status": "running" | "succeeded" | "failed" | "cancelled",
    "progress": 0.42,
    "result_url": "https://...",   // only when status=succeeded
    "error": { "type": "...", ... } // only when status=failed
  }
}
```

### 3. Cancellation

```
POST /operations/op_abc123:cancel
→ 200 OK   (or 409 if already terminal)
```

### 4. Webhook completion (optional)

If consumers register a `notification_url`, POST the final operation envelope to
it when status becomes terminal. Use the outbound-webhook patterns from
`oc-integrations-engineer` (signed body, retries with backoff, idempotency on the
receiver side).

---

## Decision Log Template

Document these choices once, in `api/conventions.md`, and reference them from
every endpoint description in the OpenAPI spec:

```markdown
## API Conventions

- **Pagination:** cursor (opaque, base64-encoded {k,id}). Default limit 50, max 200.
- **Filtering:** explicit query params (Option A). `_after/_before` suffixes for ranges.
- **Sorting:** `?sort=-field1,field2`. Tiebreaker = primary key (always appended).
- **Bulk read:** `POST /<resource>:batch-get`, max 100, mixed-success response.
- **Bulk write:** atomic. All succeed or all fail. Idempotency-Key required.
- **Async:** operation envelope at `/operations/<id>`. Optional notification_url.
```

If a future endpoint deviates, that's a design discussion, not a quiet local
exception.
