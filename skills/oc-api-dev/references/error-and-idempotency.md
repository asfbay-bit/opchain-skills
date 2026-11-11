# Error Envelope and Idempotency

Reference for first-party APIs. One error shape, one idempotency mechanism,
applied to every endpoint.

---

## Error Envelope: RFC 9457 problem+json

Every error response — every endpoint, every status code from `4xx` to `5xx` —
returns the same shape with `Content-Type: application/problem+json`.

### Shape

```json
{
  "type":     "https://oc-api.example.com/errors/widget-not-found",
  "title":    "Widget not found",
  "status":   404,
  "detail":   "No widget with id wid_abc123 exists.",
  "instance": "/v1/widgets/wid_abc123",
  "errors":   [ ... ]
}
```

| Field | Required | Purpose |
|---|---|---|
| `type` | yes | URI identifying the error class. Must resolve to human-readable docs. Stable across versions; consumers branch on this. |
| `title` | yes | Short human-readable summary. Stable per `type`. |
| `status` | yes | HTTP status code (must match the response status). |
| `detail` | no | Specific to this occurrence — variable. Safe to log; never include secrets. |
| `instance` | no | URI of the specific request that failed. Useful for support tickets. |
| `errors` | no | Array of per-field errors for `422` validation responses. |

### Status code map

| Code | When | `type` example |
|---|---|---|
| 400 | Malformed request, JSON parse fail, unknown query param | `/errors/bad-request` |
| 401 | No auth, expired auth | `/errors/unauthenticated` |
| 403 | Authenticated but not allowed | `/errors/forbidden` |
| 404 | Resource not found | `/errors/<resource>-not-found` |
| 409 | Conflict (version mismatch, unique constraint) | `/errors/conflict` |
| 410 | Endpoint sunset | `/errors/endpoint-removed` |
| 422 | Validation failure (well-formed but semantically invalid) | `/errors/validation-failed` |
| 429 | Rate limited | `/errors/rate-limited` |
| 500 | Server bug — emit a request id, log, alert | `/errors/internal` |
| 503 | Dependency down (DB, third-party) | `/errors/unavailable` |

`401` ≠ `403`. `400` ≠ `422`. Don't conflate them. The Conformance agent
verifies each one is reachable and renders correctly.

### Validation errors (422)

```json
{
  "type":   "https://oc-api.example.com/errors/validation-failed",
  "title":  "Validation failed",
  "status": 422,
  "errors": [
    { "field": "name",   "code": "too_short", "message": "Must be at least 1 character" },
    { "field": "owner_id", "code": "not_found", "message": "No user with that id" }
  ]
}
```

`code` is a stable enum the consumer can branch on; `message` is human-readable
and may change.

### Rate-limit responses (429)

Always include the standard rate-limit hint headers:

```
HTTP/1.1 429 Too Many Requests
Retry-After: 30
RateLimit-Limit: 100
RateLimit-Remaining: 0
RateLimit-Reset: 30
```

Body uses the same problem+json shape with `type:
.../errors/rate-limited`. Consumers should read `Retry-After` and back off; the
body is for the human reading the log.

### Implementation hint

Build one helper, use it everywhere:

```typescript
function problem(c: Context, status: number, type: string, title: string, opts?: {
  detail?: string;
  errors?: Array<{ field: string; code: string; message: string }>;
}) {
  return c.json(
    {
      type:   `https://oc-api.example.com${type}`,
      title,
      status,
      instance: c.req.path,
      ...opts,
    },
    status,
    { 'Content-Type': 'application/problem+json' },
  );
}
```

The Conformance agent asserts `Content-Type: application/problem+json` on every
error response. Plain JSON errors fail the round.

---

## Idempotency

Every unsafe operation (`POST`, `PATCH`, `DELETE`, anything that mutates state)
accepts an `Idempotency-Key` header. Same key → same response, byte-for-byte,
within a 24-hour window.

### Header

```
Idempotency-Key: <uuid-or-opaque-string-from-client>
```

- Client-generated. UUIDv4 is ideal, but any opaque string ≤ 255 chars is fine.
- Required on every unsafe operation. Reject requests without it (`400`,
  `type: /errors/missing-idempotency-key`).
- Include it in OpenAPI as a required parameter on every mutating operation.

### Behavior

```
First request:
  Server processes the operation.
  Stores: idempotency-key → { status, headers, body, fingerprint } with 24h TTL.
  Returns response.

Second request (same key, same body fingerprint):
  Server reads cache, returns the *exact same* response — same status, same
  headers, same body bytes. No re-processing.

Second request (same key, *different* body):
  Server returns 422 with type=/errors/idempotency-key-conflict.
  This catches client bugs where they reused a key for a different operation.

Concurrent requests (same key, both arrive before the first completes):
  Second request blocks (or returns 409) until the first completes, then
  returns the cached response.
```

### Body fingerprint

Hash the request body (`SHA-256(canonicalize(body))`). Store the hash alongside
the cached response. On a key match, compare hashes — if they differ, reject
with `422`.

### Storage

- Cloudflare Workers: KV with `expirationTtl: 86400`.
- Postgres-based stack: a `idempotency_keys` table with `(key TEXT PK,
  body_hash TEXT, response_status INT, response_headers JSONB, response_body
  TEXT, created_at TIMESTAMPTZ, expires_at TIMESTAMPTZ)` and a periodic cleanup
  job.
- Redis: `SET key value EX 86400 NX` — the `NX` is the lock for concurrent
  requests.

### Retention

- 24 hours is the default. Document it in `api/conventions.md`.
- Don't extend retention without a reason — keys consume storage proportional
  to traffic.
- After expiry, a repeated request is treated as new. Document this — clients
  should retry within the window.

### Retry-safety matrix

For consumers of the API, this is the safe-retry rulebook. Document it in the
API docs.

| Status | Cause | Safe to retry without changing key? |
|---|---|---|
| 2xx | Success | Yes — server returns same cached response |
| 4xx (validation, auth, not found) | Client bug | No — fix the request, generate a new key |
| 409 | Conflict (version mismatch) | No — re-fetch state, generate a new key |
| 422 idempotency-key-conflict | Same key, different body | No — generate a new key |
| 429 | Rate limited | Yes — back off per `Retry-After`, same key |
| 5xx | Server error or timeout | Yes — retry with same key, exponential backoff |

The "yes" rows are where idempotency earns its keep. Without a key, retrying a
5xx might charge the customer twice or create two widgets.

### Operations that are *naturally* idempotent

`PUT` and `DELETE` against an addressable resource (`PUT /widgets/abc`,
`DELETE /widgets/abc`) are idempotent by HTTP definition — repeated calls have
the same effect. Still accept `Idempotency-Key` so the *response body* is
deterministic, even if the side-effect is.

`GET` is safe by definition. No idempotency key on `GET`.

---

## Putting It Together: a Request's Life

```
1. Client: POST /v1/widgets
           Idempotency-Key: 8f3e...
           Authorization: Bearer ...
           Content-Type: application/json
           { "name": "..." }

2. Server: middleware checks Idempotency-Key cache.
           Hit?  return cached response, end.
           Miss? acquire lock for this key, continue.

3. Server: validate body. If invalid:
           store + return 422 problem+json with errors[]. Release lock.

4. Server: run handler logic, get result.

5. Server: format response. Store { status, headers, body, body_hash } under
           the idempotency key with 24h TTL. Release lock. Return response.

6. (Hours later) Same client retries with same key, same body.
   Server: cache hit. Returns identical response. No side effects.

7. (Hours later) Same client retries with same key, *different* body.
   Server: cache hit but body_hash mismatch.
           Returns 422 problem+json type=/errors/idempotency-key-conflict.
```

The Conformance agent fuzzes step 6 (idempotent replay) and step 7 (conflict
detection) on every operation that accepts a body.
