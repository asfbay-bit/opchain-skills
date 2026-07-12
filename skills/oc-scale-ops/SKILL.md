---
name: oc-scale-ops
displayName: OC · Scale Ops
version: 1.8.1
shortDesc: Load, caching, capacity planning. v1.2 posts load-test reports to the PM ticket; HIGH risks as sub-tickets.
phases: [plan]
triAgent: false
tryable: true
commands:
  - /oc-scale
  - /oc-scale audit
description: >
  Scaling readiness: load test, perf budgets, caching, capacity planning. Use for
  /oc-scale, "load test", "can this handle more users", "performance", "caching strategy",
  or any scaling question. Trigger liberally.
---

# Scale Ops

**On first invocation, read `references/orchestrator.md` and follow its welcome protocol.**

Assess and improve an app's ability to handle growth. Covers load testing,
performance budgets, caching strategy, query optimization, CDN config, and
capacity planning. Produces a scaling readiness report with a concrete upgrade
path from current capacity to target capacity.

## /oc-scale — Command Reference

```
SCALE OPS COMMANDS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  ASSESS
  /oc-scale audit          Full scaling readiness assessment
  /oc-scale budget         Set or audit performance budgets
  /oc-scale bottleneck     Identify the #1 scaling bottleneck

  TEST
  /oc-scale loadtest       Run load test against target URL
  /oc-scale benchmark      Benchmark specific endpoints

  OPTIMIZE
  /oc-scale cache          Design or audit caching strategy
  /oc-scale queries        Audit and optimize database queries
  /oc-scale cdn            CDN and edge optimization

  PLAN
  /oc-scale plan           Capacity plan from current → target users
  /oc-scale cost           Cost projection at target scale

  UTILITIES
  /checkpoint           Show checkpoint status

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  Type any command to begin. /oc-scale to see this again.
```

---

## Scaling Readiness Assessment (`/oc-scale audit`)

Comprehensive evaluation of how the app handles load. Produces a readiness
score and prioritized optimization list.

### What Gets Checked

| Layer | Checks | Tools |
|---|---|---|
| **Database** | Query complexity, missing indexes, N+1 patterns, connection pooling, row counts | EXPLAIN ANALYZE, schema review |
| **API** | Response times, payload sizes, pagination, rate limiting, caching headers | curl timing, endpoint inventory |
| **Frontend** | Bundle size, code splitting, lazy loading, image optimization, core web vitals | Lighthouse, bundle analysis |
| **Infrastructure** | Worker limits, D1 limits, KV limits, edge caching, CDN config | CF dashboard / API |
| **Architecture** | Stateless design, horizontal scalability, single points of failure | Code review |

### Cloudflare-Specific Limits

| Service | Free Tier | Paid Tier | Hard Ceiling |
|---|---|---|---|
| Workers requests | 100K/day | 10M/mo ($5) | Unlimited (pay per use) |
| Workers CPU time | 10ms/invocation | 30s/invocation | 30s |
| D1 reads | 5M/day | 25B/mo | Bound by SQLite limits |
| D1 writes | 100K/day | 50M/mo | 1 writer at a time |
| D1 database size | 500MB | 10GB | 10GB per DB |
| KV reads | 100K/day | 10M/mo | 1000 reads/sec per namespace |
| KV writes | 1K/day | 1M/mo | 1 write/sec per key |
| R2 storage | 10GB | Pay per use | Unlimited |
| Pages deployments | 500/mo | 5000/mo | Per project |

### Readiness Score

| Score | Meaning | Can Handle |
|---|---|---|
| A | Production-ready at scale | 10K+ concurrent users |
| B | Ready for moderate traffic | 1K-10K concurrent users |
| C | Works for small teams | 100-1K concurrent users |
| D | Works for personal use | 1-100 concurrent users (aidops-scale) |
| F | Has scaling blockers | Will break under real load |

### Readiness Report

```markdown
# Scaling Readiness Report — [project]

## Current Profile
- Users: ~[N] (daily active)
- Requests: ~[N]/day
- Database: [size], [tables], [heaviest query]
- Infrastructure: [CF plan], [services used]

## Readiness Score: [A-F]
[One-sentence summary]

## Layer Scores
| Layer | Score | Bottleneck |
|---|---|---|
| Database | B | Missing index on sessions.user_id |
| API | C | No response caching, 4 N+1 queries |
| Frontend | A | Bundle 89KB gzipped, lazy loading active |
| Infrastructure | D | D1 free tier, 100K write limit/day |
| Architecture | B | Stateless workers, but single D1 database |

## Top 5 Bottlenecks (fix in order)
1. [Most impactful issue with fix]
2. ...

## Scaling Path: [current users] → [target users]
[What needs to change at each tier]
```

---

## Performance Budgets (`/oc-scale budget`)

Define measurable limits for each performance dimension:

### Default Budgets (adjust per project)

| Metric | Budget | Measurement |
|---|---|---|
| Time to First Byte (TTFB) | < 200ms | Server response time |
| First Contentful Paint (FCP) | < 1.5s | Browser paint |
| Largest Contentful Paint (LCP) | < 2.5s | Largest visible element |
| Cumulative Layout Shift (CLS) | < 0.1 | Visual stability |
| Interaction to Next Paint (INP) | < 200ms | Input responsiveness |
| API response time (p50) | < 100ms | Median endpoint latency |
| API response time (p95) | < 500ms | Tail latency |
| JS bundle size (gzipped) | < 150KB | Initial load |
| Total page weight | < 500KB | All resources |
| Database query time (p95) | < 50ms | Slowest queries |

### Budget Enforcement

```bash
# Lighthouse CI (run in CI or locally)
npx lhci autorun --collect.url="<url>" \
  --assert.preset=lighthouse:recommended \
  --assert.assertions.first-contentful-paint=["error",{"maxNumericValue":1500}] \
  --assert.assertions.largest-contentful-paint=["error",{"maxNumericValue":2500}]

# Bundle size check
npx bundlesize --config bundlesize.config.json
# bundlesize.config.json:
# { "files": [{ "path": "dist/index.js", "maxSize": "150 kB" }] }
```

### Budget Monitoring

After setting budgets, integrate into the pipeline:
- **In CI**: Lighthouse CI and bundle size checks block PRs that exceed budgets
- **In oc-deploy-ops**: Performance budgets are part of the smoke test suite
- **In oc-code-auditor**: `/oc-audit perf` checks budget compliance

---

## Load Testing (`/oc-scale loadtest`)

### Using oha (Rust-based HTTP load tester)

```bash
# Install
cargo install oha 2>/dev/null || brew install oha 2>/dev/null

# Basic load test: 100 concurrent connections, 30 seconds
oha -c 100 -z 30s https://your-app.workers.dev/api/health

# With custom headers (auth)
oha -c 50 -z 30s -H "Authorization: Bearer <token>" https://your-app.workers.dev/api/data

# Target specific RPS (requests per second)
oha -c 20 --rps 100 -z 60s https://your-app.workers.dev/api/health
```

### Using hey (Go-based, simpler)

```bash
# Install
go install github.com/rakyll/hey@latest 2>/dev/null

# 1000 requests, 50 concurrent
hey -n 1000 -c 50 https://your-app.workers.dev/api/health

# With POST body
hey -n 500 -c 20 -m POST -H "Content-Type: application/json" \
  -d '{"test": true}' https://your-app.workers.dev/api/data
```

### Using curl for quick benchmarks

```bash
# Simple timing
curl -o /dev/null -s -w "DNS: %{time_namelookup}s\nConnect: %{time_connect}s\nTTFB: %{time_starttransfer}s\nTotal: %{time_total}s\n" \
  https://your-app.workers.dev/api/health

# Run 20 times, get averages
for i in $(seq 1 20); do
  curl -o /dev/null -s -w "%{time_total}\n" https://your-app.workers.dev/api/health
done | awk '{sum+=$1} END {print "Avg:", sum/NR, "s"}'
```

### Load Test Report

```markdown
## Load Test Results — [endpoint]

### Configuration
- Tool: oha
- Concurrency: 100
- Duration: 30s
- Target: https://oc-app.workers.dev/api/health

### Results
| Metric | Value | Budget | Status |
|---|---|---|---|
| Requests/sec | 2,340 | 1,000 | ✅ |
| p50 latency | 42ms | 100ms | ✅ |
| p95 latency | 187ms | 500ms | ✅ |
| p99 latency | 890ms | 1000ms | ✅ |
| Error rate | 0.1% | < 1% | ✅ |
| Total requests | 70,200 | — | — |
| Timeouts | 3 | 0 | ⚠️ |

### Observations
- [What happened at peak load]
- [Where latency spiked]
- [Any errors and their patterns]
```

---

## Caching Strategy (`/oc-scale cache`)

### Cache Layers for Cloudflare Stack

```
Request
  │
  ├──► CF CDN Cache (static assets, HTML if cacheable)
  │       TTL: hours-days
  │
  ├──► CF KV (app-level cache)
  │       TTL: minutes-hours
  │       Use for: API responses, computed values, session data
  │
  ├──► D1 Query Cache (automatic in Workers)
  │       TTL: per-request (not cross-request)
  │
  └──► Origin (D1 query)
        No cache, always fresh
```

### What to Cache (Decision Framework)

| Data Type | Cache? | Where | TTL | Invalidation |
|---|---|---|---|---|
| Static assets (JS, CSS, images) | Yes | CDN | 1 year (immutable hash) | Deploy new hash |
| User-specific data | Maybe | KV | 1-5 min | On write (purge key) |
| Public list data | Yes | KV | 5-15 min | On write or TTL |
| Auth tokens | Yes | KV | Token expiry - 60s | On refresh |
| Computed aggregations | Yes | KV | 5-60 min | On underlying data change |
| Real-time data | No | — | — | — |

### KV Caching Pattern

```typescript
async function withCache<T>(
  kv: KVNamespace,
  key: string,
  ttl: number,
  fetcher: () => Promise<T>
): Promise<T> {
  // Try cache first
  const cached = await kv.get(key, 'json');
  if (cached) return cached as T;

  // Cache miss — fetch and store
  const fresh = await fetcher();
  await kv.put(key, JSON.stringify(fresh), { expirationTtl: ttl });
  return fresh;
}

// Usage
const contacts = await withCache(env.CACHE, `contacts:${userId}`, 300, () =>
  db.select().from(contacts).where(eq(contacts.userId, userId))
);
```

### Cache Invalidation

```typescript
// Invalidate on write
app.post('/api/contacts', async (c) => {
  const contact = await createContact(c.env.DB, data);
  // Purge relevant cache keys
  await c.env.CACHE.delete(`contacts:${userId}`);
  await c.env.CACHE.delete(`contacts:${userId}:count`);
  return c.json(contact, 201);
});
```

---

## Query Optimization (`/oc-scale queries`)

### Find Slow Queries

```sql
-- D1: no built-in slow query log, but you can time queries in code
-- Wrap queries with timing:
```

```typescript
async function timedQuery<T>(db: D1Database, sql: string, params: any[]): Promise<{ result: T; ms: number }> {
  const start = performance.now();
  const result = await db.prepare(sql).bind(...params).all();
  const ms = performance.now() - start;
  if (ms > 50) console.warn(`Slow query (${ms.toFixed(0)}ms): ${sql.substring(0, 100)}`);
  return { result: result.results as T, ms };
}
```

### Common Query Optimizations

| Problem | Detection | Fix |
|---|---|---|
| Missing index | Query on column without index, table > 1K rows | `CREATE INDEX idx_table_col ON table(col)` |
| N+1 queries | Loop with DB call inside (fetch list, then fetch detail per item) | Use JOIN or batch query |
| SELECT * | Fetching all columns when only 2-3 needed | List specific columns |
| Unbounded query | No LIMIT on list queries | Add pagination (LIMIT + OFFSET or cursor) |
| Repeated queries | Same query called multiple times per request | Cache result in request context |
| Missing compound index | WHERE on multiple columns, each indexed separately | `CREATE INDEX idx_tbl_a_b ON tbl(a, b)` |

### EXPLAIN for D1

```sql
-- D1 supports EXPLAIN QUERY PLAN
EXPLAIN QUERY PLAN SELECT * FROM sessions WHERE user_id = ? AND created_at > ?;
-- Look for: SCAN TABLE (bad) vs SEARCH TABLE USING INDEX (good)
```

---

## Capacity Planning (`/oc-scale plan`)

### Scaling Path Template

```markdown
## Capacity Plan: [current] → [target] users

### Current State
- DAU: [N]
- Peak concurrent: [N]
- Requests/day: [N]
- DB size: [N] MB
- Monthly cost: $[N]

### Growth Tiers

| Tier | Users | Requests/day | DB Size | Changes Needed | Monthly Cost |
|---|---|---|---|---|---|
| Current | 2 | 500 | 5 MB | None | $0 (free tier) |
| Small | 100 | 50K | 50 MB | Add indexes, KV caching | $0 (free tier) |
| Medium | 1K | 500K | 500 MB | Paid Workers, optimize queries | $5-15 |
| Large | 10K | 5M | 5 GB | Multiple D1 DBs or Postgres, CDN | $50-200 |
| Scale | 100K+ | 50M+ | 50+ GB | External Postgres, queue system, read replicas | $200+ |

### Tier Transition Checklist

When moving from [current tier] to [next tier]:
1. [ ] [Specific infrastructure change]
2. [ ] [Query optimization needed]
3. [ ] [Caching to add]
4. [ ] [Cost increase to approve]
5. [ ] [Load test to validate]
```

---

## Checkpoint Integration

### Checkpoint Location
`{project-dir}/.checkpoints/oc-scale-ops.checkpoint.json`

### When to Write

| Event | What to Save |
|---|---|
| Readiness audit run | Scores per layer, bottleneck list, overall grade |
| Performance budgets set | Budget values, enforcement config |
| Load test completed | Results, endpoint, concurrency, pass/fail |
| Caching strategy designed | Cache layers, TTLs, invalidation plan |
| Query optimization done | Queries optimized, before/after times |
| Capacity plan produced | Current tier, target tier, upgrade path |

### Cross-Skill Reads

| Reads from | Why |
|---|---|
| oc-stack-forge | Stack architecture → infrastructure limits |
| oc-code-auditor | Performance findings → pre-identified bottlenecks |
| oc-deploy-ops | Current deployment config → infrastructure baseline |
| oc-integrations-engineer | API rate limits → external constraints |

| Read by | Why |
|---|---|
| oc-deploy-ops | Readiness score → deploy confidence at scale |
| oc-code-auditor | Performance budgets → `/oc-audit perf` thresholds |
| oc-app-architect | Cost projections → spec cost estimates |

---

## PM-Tool MCP Integration (v1.2+)

Scaling work is advisory — recommendations the engineering team
will act on over weeks. v1.2 makes those recommendations
discoverable + ownable in the PM tool. See `oc-integrations-engineer`
for the canonical PM-MCP patterns.

### Load-test summary on the linked ticket

After every `/oc-scale audit` or `/oc-scale loadtest`, post a structured
summary on the linked PM ticket:

```
Scale audit: Readiness {READY / WATCH / RED}.
Load profile: {N concurrent users / {req/sec} sustained}
SLO compliance: p95 {Xms / target Yms} · p99 {Xms / target Yms} · err {X% / target Y%}
Top three bottlenecks (by headroom × business-impact):
  1. {component} — {one-line finding}
  ...
Cost projection: ~${USD/month} at {target-scale}
Full report: .checkpoints/oc-scale-ops.checkpoint.json
```

### HIGH-risk findings as scaling sub-tickets

For every finding tagged HIGH or CRITICAL on the readiness scale:

- Sub-ticket parent-linked to the source PR ticket.
- `issue_type`: `bug` if it's a current pain; `chore` if it's a
  scaling-prep concern.
- labels: `scaling`, `severity:<level>`, `area:<component>`.
- assignee: from `.opchain/pm.yaml` `remediation_owners.infra` or
  `.backend` based on finding type.

### Capacity-planning artifacts

`/oc-scale capacity` produces a 12-month capacity projection. The
output is uploaded as a comment with the projection table + a
calendar-keyed reminder ticket scheduled for the next review
window (default 90 days).

### Cost recommendations

When `/oc-scale cost` finds a > 30% cost-reduction opportunity, file a
sub-ticket with the projected savings + the change required. Cost
recommendations smaller than that stay in the report only — not
worth the PM noise.

### Failure modes

- No linked ticket → report still produced; no PM write.
- MCP unavailable → log intended writes to checkpoint; user can
  `/oc-scale sync-pm` later.
- Load test still running when invoked → defer the PM comment until
  the run completes; never post partial results.

---

## Principles

1. **Measure before optimizing.** Load test first. The bottleneck is rarely where
   you think it is.
2. **Cache the read path, optimize the write path.** Most apps are 90% reads.
   Caching reads buys the most headroom with the least complexity.
3. **D1 is enough until it isn't.** For aidops-scale (< 100 users), D1's free
   tier handles everything. Don't migrate to Postgres speculatively.
4. **Performance budgets are guardrails, not goals.** Set them once, enforce in
   CI, forget about them until they break.
5. **Scale the bottleneck, not the stack.** If the bottleneck is a missing index,
   adding a CDN won't help. Fix the actual constraint.
6. **Cost scales with usage, not preparation.** CF's pay-per-request model means
   you don't pay for capacity you don't use. Build the optimization, deploy it,
   and let usage determine cost.
