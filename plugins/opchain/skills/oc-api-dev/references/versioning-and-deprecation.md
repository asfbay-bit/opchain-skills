# API Versioning and Deprecation

Reference for first-party APIs. Pick a versioning strategy on day one, before
you ship the first endpoint. Adding versioning retroactively is a migration
project, not a small change.

---

## Strategy Choice

### URL path (recommended default)

```
https://oc-api.example.com/v1/widgets
https://oc-api.example.com/v2/widgets
```

- One major version per URL prefix.
- Minor / patch versions are *not* in the URL — they're additive within a major.
- Routing is trivial: each version is a separate deploy artifact / handler tree.
- Easy to operate in shared infra (Cloudflare Workers, K8s ingresses, AWS API
  Gateway stages).
- Cost: copying handler code between major versions. Acceptable if majors are
  rare (every 12–24 months).

### Header (date-based, calver)

```
GET /widgets
API-Version: 2026-04-27
```

- One handler tree, switch behavior internally based on the requested version.
- Stripe-style. Good when versions release frequently and breaking changes are
  small/surgical.
- Cost: every endpoint accumulates conditional logic over time. Requires
  per-version test suites and disciplined deprecation.

### Content-type negotiation

```
Accept: application/vnd.example.widget.v2+json
```

Most theoretically pure, least ergonomic for consumers. Use only if you have a
specific reason (HATEOAS, hypermedia API). Otherwise pick URL or header.

### Don't mix

Pick one strategy and apply it everywhere. Mixed strategies double the surface
area for consumers and tooling.

---

## What Counts as Breaking

The Conformance agent uses this taxonomy when running `openapi-diff`. Every
spec change must be classified.

### Additive (safe)

- Adding a new endpoint
- Adding a new optional request field
- Adding a new response field (consumers must ignore unknown fields — document
  this in `api/conventions.md`)
- Adding a new optional response header
- Loosening validation (raising `maxLength`, lowering `minLength`)
- Adding a new value to an enum **only if** the consumer was already required to
  treat unknown enum values as a default — otherwise it's breaking

### Behavior (review carefully)

- Changing default values
- Changing pagination order tie-breaker
- Changing `Idempotency-Key` retention window
- Performance characteristics (latency, rate limits)

These don't strictly break consumer code but do change runtime behavior. Ship
in a minor release with release notes; consumers who depended on the old
behavior will need to adapt.

### Breaking (requires new major + sunset)

- Removing an endpoint, field, or enum value
- Renaming a field or operationId
- Changing a field's type, format, or nullability
- Making an optional field required
- Changing status codes returned for the same logical outcome
- Changing the error envelope shape (always RFC 9457 — never change)
- Changing auth requirements on an existing endpoint
- Changing pagination shape (cursor → offset, etc.)

Breaking changes ship a new major version. The old version stays live for the
deprecation window.

---

## Deprecation Headers

When marking an endpoint or field deprecated, every response from that operation
emits these headers. Use `/oc-api deprecate` to wire them.

### Deprecation (RFC 9745)

```
Deprecation: @1735689600
```

Unix timestamp of when the deprecation was *announced*. Past or present, never
future.

### Sunset (RFC 8594)

```
Sunset: Wed, 01 Oct 2026 00:00:00 GMT
```

HTTP-date when the endpoint will be *removed*. Always future. Minimum
deprecation window: 6 months for public APIs, 3 months for internal-but-shared
APIs, 1 month for fully-internal APIs.

### Link

```
Link: <https://oc-api.example.com/docs/migrations/v1-to-v2>; rel="deprecation"
Link: <https://oc-api.example.com/v2/widgets>; rel="successor-version"
```

Always emit both `rel="deprecation"` (pointing at the migration guide) and
`rel="successor-version"` (pointing at the replacement endpoint or version).

### OpenAPI marker

```yaml
paths:
  /widgets-old:
    get:
      operationId: listWidgetsLegacy
      deprecated: true
      ...
```

The `deprecated: true` flag drives `/oc-api docs` to show a banner and `/oc-api sdk`
to mark the generated method `@deprecated`.

---

## Deprecation Workflow

Stored at `api/deprecations.md`. Every entry has:

```markdown
### listWidgetsLegacy → listWidgets (v2)

- **Announced:** 2026-04-27
- **Sunset:** 2026-10-27 (6-month window)
- **Replacement:** `GET /v2/widgets` (cursor pagination, problem+json errors)
- **Migration guide:** `api/migrations/v1-to-v2.md#listwidgetslegacy`
- **Consumers notified:**
  - 2026-04-27: changelog entry, blog post, dashboard banner
  - 2026-07-27: email at T-3 months
  - 2026-09-27: email at T-1 month
  - 2026-10-20: final email at T-1 week
- **Usage tracking:** oc-monitoring-ops dashboard `legacy-api-usage`,
  `requests_to_listWidgetsLegacy_total`
- **Sunset action:** return `410 Gone` with problem+json pointing at the
  migration guide. Do not silently proxy to the new endpoint.
```

### Checklist when marking an endpoint deprecated

1. Set `deprecated: true` in the OpenAPI spec.
2. Wire `Deprecation` + `Sunset` + `Link` headers in the handler.
3. Add an entry to `api/deprecations.md` with sunset date and migration plan.
4. Add a changelog entry (`api/CHANGELOG.md`).
5. Notify oc-monitoring-ops to track usage of the deprecated operation.
6. Schedule consumer notifications (T-3mo, T-1mo, T-1wk).
7. Calendar reminder for the sunset date with the runbook.
8. After sunset: handler returns `410 Gone` with a problem+json body pointing
   at the successor version.

---

## Migration Guide Template

Every breaking change ships with a guide at `api/migrations/v<old>-to-v<new>.md`:

```markdown
# Migrating from v1 to v2

## Why

[One paragraph. The constraint or design problem v1 had. What v2 fixes.]

## Timeline

- v2 available: 2026-04-27
- v1 deprecated: 2026-04-27
- v1 sunset: 2026-10-27 (returns 410 Gone)

## Breaking Changes

### 1. Cursor pagination replaces offset

| | v1 | v2 |
|---|---|---|
| Query | `?offset=100&limit=50` | `?cursor=...&limit=50` |
| Response | `{ data, total, page, pages }` | `{ data, next_cursor }` |

**Why:** offset pagination becomes unstable when rows are inserted mid-traversal,
and `total` queries don't scale past ~100k rows.

**How to migrate:** call without `cursor` for the first page; pass
`response.next_cursor` on the next call until `next_cursor` is `null`.

### 2. ...

## Non-Breaking Additions

- New optional `tags` field on `Widget`
- New `?include=owner` parameter on list/get

## SDK Changes

```diff
- import { ApiClient } from '@example/sdk-v1';
+ import { ApiClient } from '@example/sdk-v2';
```

## Questions

api-feedback@example.com — we read every message.
```

---

## Versioning Anti-Patterns

Don't:

- **Silently change behavior in a minor.** "We tightened validation" without a
  version bump = a breaking change disguised as a patch.
- **Skip versioning because the API is small.** Three months from now it won't be.
- **Add a v2 just for cosmetic changes.** v2 means breaking changes; cosmetic
  cleanups go in a minor or stay in v1.
- **Run more than two majors at once.** v1 sunset before v3 ships. Otherwise the
  cost of operating compounds.
- **Use semver in URLs.** `/api/v1.2.3/` is noise — patch and minor are
  invisible to consumers, only major matters.
- **Forget about the SDK.** SDK majors track API majors. `@example/sdk-v2` not
  `@example/sdk@2.0.0`-but-it-still-talks-to-v1.
