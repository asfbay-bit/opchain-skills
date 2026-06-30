---
name: oc-integrations-engineer
displayName: OC · Integrations Engineer
version: 1.7.0
shortDesc: Third-party APIs, OAuth, webhooks. v1.2 adds PM-tool MCP integration patterns (Linear / Jira / GitHub Issues).
phases: [build]
triAgent: true
tryable: true
commands:
  - /oc-integrate
  - /oc-integrate plan
description: >
  Third-party API integrations with Planner/Builder/Tester loop. Use for /oc-integrate,
  "connect to Salesforce", "webhook", "OAuth", "API integration", "connect to Slack",
  or any external service connection. For designing or building your *own* first-party
  API (OpenAPI/GraphQL authoring, versioning, SDK generation), use oc-api-dev instead.
  Trigger liberally.
---

# Integrations Engineer

**On first invocation, read `references/orchestrator.md` and follow its welcome protocol.**

Tri-agent integration harness: Planner designs the connection architecture → Builder
implements the client, auth, and error handling → Tester verifies the integration works
against the real (sandbox) API with edge cases the Builder didn't consider.

**Boundary:** this skill is the *consumer* side — building clients for someone else's
API (Stripe, Slack, Salesforce, Google APIs, OAuth providers). For designing or
building **your own** first-party API that other clients will consume (OpenAPI /
GraphQL authoring, versioning, SDK generation), use `oc-api-dev` instead. Webhook
*receivers* tied to a single integration (`POST /webhooks/stripe`) stay here;
public/product API surfaces belong in `oc-api-dev`.

## /oc-integrate — Command Reference

```
INTEGRATIONS ENGINEER COMMANDS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  TRI-AGENT HARNESS
  /oc-integrate plan       Design an integration (Planner agent)
  /oc-integrate build      Build an integration (Builder → Tester loop)
  /oc-integrate test       Run Tester against an existing integration

  QUICK BUILD
  /oc-integrate connect    Guided build for a single integration (streamlined)
  /oc-integrate webhook    Set up inbound or outbound webhook
  /oc-integrate oauth      Implement OAuth 2.0 flow

  OPERATE
  /oc-integrate health     Check health of all active integrations
  /oc-integrate secrets    Audit secret storage and rotation
  /oc-integrate retry      Configure retry/backoff for an integration

  UTILITIES
  /oc-integrate list       Show all integrations with status
  /checkpoint           Show checkpoint status

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  Type any command to begin. /oc-integrate to see this again.
```

---

## Tri-Agent Architecture

```
INTEGRATION REQUIREMENT
        │
        ▼
┌──────────────────┐
│   INTEGRATION    │  Reads service docs, designs architecture
│   PLANNER        │  Outputs: integration-spec.md per service
└────────┬─────────┘
         │
         ▼
┌──────────────────────────────────────────────┐
│     BUILD LOOP (per integration)             │
│                                              │
│  ┌────────────┐  contract   ┌─────────────┐  │
│  │ INTEGRATION│◄─negotiate──►│ INTEGRATION │  │
│  │  BUILDER   │             │  TESTER     │  │
│  │            │──code──────►│             │  │
│  │  Builds    │             │  Hits real  │  │
│  │  client    │◄──failures──│  sandbox    │  │
│  └────────────┘             └─────────────┘  │
│       │                           │          │
│       │    All tests pass?        │          │
│       └───────────────────────────┘          │
└──────────────────────────────────────────────┘
         │
         └──► Health monitoring (ongoing)
```

### Why Three Agents for Integrations?

1. **Optimistic builder bias** — The Builder writes a client and mentally tests
   it against the happy path. The Tester hits the real sandbox API with malformed
   inputs, expired tokens, rate limit conditions, and timeout scenarios that the
   Builder didn't consider.

2. **Documentation drift** — The Planner reads the service's actual API docs
   (via web search) and designs the integration against reality. The Builder
   might rely on cached knowledge about an API that has changed. The separation
   forces fresh research.

3. **Mock ≠ real** — The Builder writes MSW mocks for unit tests. The Tester
   hits the real sandbox endpoint. Mocks pass when the real API would return 422
   because the request body was slightly wrong. Only real-API testing catches this.

---

## Phase 1: Integration Planner (`/oc-integrate plan`)

### Planner Persona

The Planner is a senior backend architect who has wired dozens of third-party APIs.
Key behaviors:
- **Read the actual docs.** Web search the service's API documentation. Don't rely
  on training data — APIs change frequently.
- **Map every endpoint you'll use.** Not "we'll call their API" — which exact
  endpoints, with which HTTP methods, with which auth headers.
- **Design for failure.** What happens when the API is down? When the token expires?
  When you hit the rate limit? When the response shape changes?
- **Minimal surface area.** Use the fewest endpoints possible. Every endpoint is
  a maintenance burden and a failure point.

### Planner Workflow

1. Identify service and use case
2. Web search for current API documentation
3. Read rate limits, auth requirements, sandbox availability
4. Produce integration spec

### Integration Spec Template

```markdown
## Integration Spec: [Service Name]

### Overview
- **Direction:** Inbound / Outbound / Both
- **Auth:** API key / OAuth 2.0 / Webhook secret / Bearer token
- **Base URL:** https://oc-api.service.com/v2
- **Sandbox:** [URL or "not available"]
- **Rate limits:** [requests per minute/hour]
- **SDK:** [available? use it or build typed client?]
- **Docs:** [URL to current API documentation]

### Endpoints

| Method | Path | Purpose | Auth | Rate Limit | Idempotent |
|---|---|---|---|---|---|
| GET | /contacts | List contacts | Bearer | 100/min | Yes |
| POST | /opportunities | Create opp | Bearer | 50/min | No (needs key) |

### Data Flow
[ASCII diagram showing request/response flow]

### Error Handling Matrix

| Status | Meaning | Action |
|---|---|---|
| 401 | Token expired | Refresh, retry once |
| 429 | Rate limited | Respect Retry-After, backoff |
| 500 | Server error | Retry with backoff, max 3 |
| 503 | Maintenance | Retry with longer delays |

### Secrets Required

| Secret | Storage | Rotation |
|---|---|---|
| Client ID | wrangler secret | Static |
| Client Secret | wrangler secret | Yearly |
| Access Token | KV | Auto-refresh on 401 |

### Test Plan
- **Unit tests:** Mock with MSW, test happy + error paths
- **Sandbox tests:** Hit real sandbox endpoint, verify response shapes
- **Edge cases:** Expired token, rate limit, malformed response, timeout
```

### Gate: Spec Approval

Present the spec. Confirm endpoints, auth, and error handling with the user.
Write checkpoint: phase "planned".

---

## Phase 2: Build Loop (`/oc-integrate build`)

### Step 1: Integration Contract

**Builder proposes:**
```markdown
## Integration Contract: [Service]

### Deliverables
- Typed API client (request/response types)
- Auth flow (token management, refresh)
- Retry middleware with exponential backoff
- Unit tests with MSW mocks
- Health check endpoint

### Testable Criteria
1. Auth flow completes successfully against sandbox
2. All endpoints return expected shapes
3. Retry works on 429 and 500 responses
4. Token refresh works on 401
5. Unit tests cover happy + error paths
```

**Tester reviews** and pushes back if:
- No edge case criteria (timeout, malformed response)
- No rate limit handling criteria
- Sandbox testing not included

### Step 2: Builder Implements

The Builder creates:

1. **Typed client class**
```typescript
// Typed request/response matching API spec
interface Contact { id: string; name: string; email: string; }
interface CreateOpportunityInput { name: string; stage: string; amount: number; }
interface Opportunity { id: string; stage: string; created_at: string; }

class ServiceClient {
  constructor(private env: Env) {}

  async getContacts(): Promise<Contact[]> { ... }
  async createOpportunity(input: CreateOpportunityInput): Promise<Opportunity> { ... }
}
```

2. **Auth layer** (read `references/oauth-patterns.md` for OAuth implementations)

3. **Retry middleware**
```typescript
async function withRetry<T>(
  fn: () => Promise<T>,
  opts: { maxAttempts?: number; baseDelay?: number } = {}
): Promise<T> {
  const { maxAttempts = 3, baseDelay = 1000 } = opts;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try { return await fn(); }
    catch (e: any) {
      if (attempt === maxAttempts) throw e;
      if (e.status === 401) throw e; // Don't retry auth failures
      const delay = e.status === 429
        ? parseInt(e.headers?.get('Retry-After') || '0') * 1000 || baseDelay * 2 ** (attempt - 1)
        : Math.min(baseDelay * 2 ** (attempt - 1), 30000) + Math.random() * 1000;
      await new Promise(r => setTimeout(r, delay));
    }
  }
  throw new Error('Unreachable');
}
```

4. **Unit tests with MSW mocks**

5. **Health check endpoint**

### Step 3: Tester Agent

The Tester has **isolated context** — it reads the integration spec and the contract,
then tests the built integration without seeing the Builder's implementation decisions.

**Tester Persona:**

The Tester is a QA engineer who specializes in API integrations. Key behaviors:

- **Hit the real sandbox first.** Not mocks. The real endpoint. If there's no sandbox,
  test against the production API with read-only operations.
- **Break the happy path.** Send malformed input. Omit required fields. Use expired
  tokens. Send requests faster than the rate limit.
- **Verify response shapes.** Does the actual response match the TypeScript types?
  APIs add fields, remove fields, change nullability.
- **Test the error paths.** Force a 401 — does the token refresh? Force a 429 —
  does the backoff work? Force a timeout — does the retry fire?
- **Check idempotency.** Send the same POST twice. Is the result safe?
- **Don't trust mocks.** MSW tests passing means the mock is consistent with
  the code. It says nothing about the real API.

**Test Execution:**

```bash
# 1. Sandbox connectivity
curl -s -o /dev/null -w "%{http_code}" -H "Authorization: Bearer $TOKEN" \
  "https://sandbox.service.com/api/health"

# 2. Auth flow
# Attempt OAuth flow against sandbox
# Verify token received, check expiry

# 3. Endpoint verification
# Call each endpoint from the spec
# Verify response shapes match TypeScript types

# 4. Error handling
# Force 401 (use expired token) → verify refresh
# Force 429 (rapid-fire requests) → verify backoff
# Force timeout (set very short timeout) → verify retry
```

**Test Report** saved to `integrations/[service]/test-round-M.md`:

```markdown
## Integration Test — [Service] — Round [M]

### Sandbox Connectivity
- Endpoint reachable: [Yes/No]
- Auth succeeds: [Yes/No]
- Latency: [X]ms

### Endpoint Tests
| Endpoint | Status | Response Shape | Notes |
|---|---|---|---|
| GET /contacts | PASS | Matches types | 47ms |
| POST /opportunities | FAIL | Missing `created_at` field | Type needs update |

### Error Handling
| Scenario | Expected | Actual | Status |
|---|---|---|---|
| Expired token (401) | Auto-refresh + retry | Refreshed, retried | PASS |
| Rate limit (429) | Backoff + retry | Threw immediately | FAIL |
| Server error (500) | Retry 3x with backoff | Retried 3x | PASS |
| Timeout | Retry with backoff | No timeout configured | FAIL |

### Verdict: PASS / FAIL
[If FAIL: specific failures for Builder to fix]
```

### Step 4: Iterate or Advance

- **PASS**: Integration is production-ready. Add to health monitoring.
- **FAIL + rounds remaining**: Feed test report to Builder, fix, re-test.
- **FAIL + max rounds**: Escalate to user.

Max iterations: 3. A single endpoint failure = overall FAIL.

---

## Quick Build Mode (`/oc-integrate connect`)

For simple integrations (API key auth, 1-3 endpoints), skip the full harness:

1. Interview: which service, which endpoints, auth method
2. Build the typed client with retry
3. Run basic smoke test against sandbox
4. Done. No contract negotiation, no formal test report.

Use quick build for: Telegram bot, SendGrid email, simple REST APIs.
Use full harness for: Salesforce, Stripe, Google APIs, anything with OAuth.

---

## Webhook Patterns (`/oc-integrate webhook`)

### Inbound (they call you)

```typescript
app.post('/webhooks/:service', async (c) => {
  const service = c.req.param('service');
  const secret = c.env[`${service.toUpperCase()}_WEBHOOK_SECRET`];

  // 1. Verify signature
  if (!await verifySignature(c.req.raw, secret)) {
    return c.json({ error: 'Invalid signature' }, 401);
  }

  // 2. Idempotency check
  const eventId = c.req.header('X-Event-ID');
  if (await c.env.KV.get(`webhook:${eventId}`)) {
    return c.json({ status: 'already_processed' }, 200);
  }

  // 3. Process
  const event = await c.req.json();
  await processEvent(service, event, c.env);

  // 4. Mark processed (TTL: 7 days)
  await c.env.KV.put(`webhook:${eventId}`, 'true', { expirationTtl: 604800 });
  return c.json({ status: 'processed' }, 200);
});
```

### Outbound (you call them)

```typescript
async function sendWebhook(url: string, payload: any, secret: string) {
  const body = JSON.stringify(payload);
  const signature = await hmacSign(body, secret);
  return withRetry(() => fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Signature-256': `sha256=${signature}`,
      'X-Event-ID': crypto.randomUUID(),
    },
    body,
  }));
}
```

---

## Operate

### Health Check (`/oc-integrate health`)

For each active integration:

```
INTEGRATION HEALTH — [project]
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  ✅ Salesforce    reachable  42ms    token valid
  ✅ Telegram      reachable  18ms    bot active
  ❌ Stripe        unreachable —      webhook endpoint 504
  ⚠️  SendGrid     reachable  890ms   high latency

  Issues:
  1. Stripe webhook endpoint returning 504 — investigate
  2. SendGrid latency > 500ms threshold
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

### Secret Audit (`/oc-integrate secrets`)

Check every integration's secrets:
- Stored in wrangler secrets or KV (not .env or code)?
- Rotation schedule defined?
- Any secrets in git history?

---

## Common Integration Patterns

| Service | Auth | Harness? | Notes |
|---|---|---|---|
| Salesforce | OAuth 2.0 | Full | Bulk API for > 200 records |
| Slack | Bot token | Quick | Verify request signatures |
| Telegram | Bot token | Quick | Webhooks, not polling |
| Stripe | API key + webhook | Full | Always verify webhook sigs |
| Google APIs | OAuth 2.0 | Full | Service account for server-to-server |
| SendGrid | API key | Quick | Idempotency keys |
| GitHub | OAuth / PAT / App | Full | App auth for org-level |

---

## PM-Tool MCP Integration (v1.3+)

This skill is the canonical owner of PM-tool MCP integration patterns.
"PM tools" means project / issue trackers — Linear, Jira, GitHub Issues —
and the integration is via the **MCP servers** Anthropic ships with
Claude Code (or the customer's on-prem variant in regulated environments).

The runtime contract — concrete tool names, retry / backoff, idempotency
markers, deferred-action queue, validator rules — lives in
[`references/pm-mcp-protocol.md`](references/pm-mcp-protocol.md). v1.2
introduced the prose; v1.3 makes it executable. **Every PM-MCP write made
by an opchain skill must follow that contract.**

The pattern is the same across all three providers: an MCP server exposes a
stable tool surface (`get_issue`, `list_issues`, `save_issue`,
`save_comment`/`add_issue_comment`, `list_projects`, etc.). The other opchain
skills consume that surface through their own phases. This section defines
the patterns; downstream skills cite this section AND the protocol doc.

### When PM-MCP integration matters

- The user has a PM ticket they're working from. Reading the ticket as
  context is far cheaper than re-asking. (`oc-app-architect /oc-discover`,
  `oc-git-ops /oc-git-sync TICKET-1234`.)
- Work product needs to be reflected back to the PM tool. Sprint plans,
  PRs, deploy windows, incidents — all live there as records. Writing
  back closes the loop. (`oc-app-architect /oc-roadmap`, `oc-git-ops` on PR open
  + merge, `oc-deploy-ops` per environment, `oc-monitoring-ops` per alert.)
- The org's audit posture requires it. Enterprises (see scenarios 7-8)
  treat the PM tool as the system-of-record for engineering work; an
  agent flow that doesn't update the ticket is invisible to compliance.

### MCP-server selection

| Tool | Anthropic-shipped MCP | On-prem variant | Notes |
|---|---|---|---|
| **Linear** | yes (cloud only) | no — SaaS-only product | Default for PLG-style orgs |
| **Jira** | yes (cloud + Atlassian DC via separate MCP) | yes (on-prem Jira via custom MCP fork) | Most common in enterprise |
| **GitHub Issues** | yes (cloud) | yes (GitHub Enterprise via custom MCP) | Convenient when the repo + tracker live together |

In regulated environments (HIPAA / FedRAMP / CMMC), only the on-prem
variants are permissible. See scenarios `mcp-enterprise-f500` and
`mcp-enterprise-defense` for the security posture and the broker /
redactor / audit pipeline that must precede deployment.

### Detecting "this work has a PM ticket"

The agent recognises a PM ticket reference when:

1. The user's prompt contains a recognisable ticket id pattern:
   - `[A-Z][A-Z0-9_]+-\d+` (Jira / Linear convention; e.g. `PLAT-4471`,
     `MEM-12`).
   - `#\d+` immediately after a repo reference (GitHub Issues).
   - A URL matching `linear.app/.+/issue/.+`,
     `*.atlassian.net/browse/.+`, or `github.com/.+/issues/\d+`.
2. The user provides the id explicitly to a command:
   `/oc-git-sync PLAT-4471`, `/oc-discover --ticket PLAT-4471`.
3. The skill is in a phase where it actively asks the user
   ("Is there a Jira ticket for this?").

When detected, the skill calls the registry-resolved `get_issue` tool
(Linear: `mcp__claude_ai_Linear__get_issue`; GitHub Issues:
`mcp__mcp-server-github__issue_read`; Jira: `mcp__atlassian__jira_get_issue`)
to fetch: title, description, status, assignee, priority, labels, parent /
project, recent comments. Apply retry / backoff per
[`pm-mcp-protocol.md` §2](references/pm-mcp-protocol.md). The fetch is logged
to the audit pipeline (see scenarios for required schema in regulated
environments).

### Patterns by phase (quick reference; canonical text in each skill)

**Read-then-shape** (oc-app-architect Phase 1, oc-code-auditor on a bug
ticket, oc-monitoring-ops on a runbook reference):
1. Get the ticket via the registry-resolved `get_issue` tool, applying the
   retry policy from [`pm-mcp-protocol.md` §2](references/pm-mcp-protocol.md).
2. Use the body + comments as discovery / spec context.
3. Continue the phase normally; cite the ticket id in produced
   artifacts.

**Write-on-close** (oc-app-architect Phase 4, oc-git-ops on PR merge,
oc-deploy-ops on prod ship, oc-monitoring-ops on alert resolution):
1. Complete the phase / event.
2. Compose a structured comment summarising what changed + artifact links;
   prepend the idempotency marker from
   [`pm-mcp-protocol.md` §3](references/pm-mcp-protocol.md):
   `<!-- opchain:<skill>:<event>:<correlation-id> -->`.
3. Pre-write check: list comments on the ticket, skip if marker already
   present, else call the registry-resolved `add_comment` tool (Linear:
   `save_comment`; GitHub: `add_issue_comment`; Jira: `jira_add_comment`).
4. Optionally transition the ticket via the registry-resolved
   `transition_state` tool (Linear / GitHub: `save_issue` /
   `issue_write` with the state field; Jira: `jira_transition_issue`).
   State strings come from `.opchain/pm.yaml` `states` map — never
   hard-coded.
5. On retry-budget exhaustion, defer per
   [`pm-mcp-protocol.md` §4](references/pm-mcp-protocol.md).

**Auto-create** (oc-deploy-ops creates a deploy ticket, oc-monitoring-ops
opens an incident ticket, oc-release-ops creates a release ticket):
1. Compose ticket title + description from event context. The
   description carries the idempotency marker per Section 3 of the
   protocol; pre-write check via `list_issues` filtered to the
   configured project + issue type before creating.
2. Call the registry-resolved `create_issue` tool (Linear:
   `save_issue` with no `id`; GitHub: `issue_write` action=create;
   Jira: `jira_create_issue`) with the project + issue-type +
   priority defaults from `pm.yaml`.
3. Link related tickets via the parent / blocked-by relation.

### Project configuration

Each repo using PM-MCP integration has a `.opchain/pm.yaml`:

```yaml
provider: linear   # or "jira" / "github-issues"
team_or_project: PLAT
issue_types:
  feature: Feature
  bug: Bug
  deploy: Deploy
  incident: Incident
states:
  in_progress: "In Progress"
  in_review: "In Review"
  done: "Done"
labels_default: [opchain, agent-driven]
mcp_server: linear   # which configured MCP server to use
```

Skills read `.opchain/pm.yaml` to know which fields / state
transitions to use. Missing file → skill prompts user once and
writes it.

### Failure modes

Authoritative semantics — including which failures are retriable, when to
mark a deferred action `retriable: false`, and how `--retry-pm --force`
clears non-retriable entries — live in
[`pm-mcp-protocol.md` §2 + §4](references/pm-mcp-protocol.md). Quick recap:

- **MCP unconfigured** — skill reports `pm-mcp not configured`
  and continues without PM context. Never blocks on MCP; the PM
  loop is enrichment, not load-bearing.
- **Ticket not found (404)** — skill reports the failure, asks user to
  confirm the id, and continues without PM context. Not retriable.
- **Transient (5xx / 429 / network)** — retry policy applies; if the
  budget exhausts, log to `pm_deferred_actions[]` with `retriable: true`.
  User can flush with `/<verb> --retry-pm`.
- **Cross-team / scope-violation write (403)** — broker (in enterprise
  deployments) or PM server returns 403. Skill surfaces the
  permission error, records `retriable: false`, and stops; never
  silently widens scope. `--retry-pm --force` is required to clear.
- **Validation error (422)** — skill bug; surface for fix. Not retriable.

### Audit-pipeline expectation (regulated)

In CMMC / HIPAA / FedRAMP environments, every PM-MCP tool call
emits an audit record per the broker design (see scenarios 7-8).
The skill itself does not handle audit emission; that is a
broker-side concern. The skill's only obligation is to use
named, narrow tool surfaces and to never embed the **content**
of a fetched ticket in subsequent tool calls without first
running it through the redactor (the broker enforces this; the
skill respects rejections).

---

## Checkpoint Integration

### Checkpoint Location
`{project-dir}/.checkpoints/oc-integrations-engineer.checkpoint.json`

### When to Write

| Event | What to Save |
|---|---|
| Integration spec created | Service, endpoints, auth, test plan |
| Contract negotiated | Deliverables, test criteria |
| Builder completes | Files created, test status |
| Tester runs | Test results, pass/fail per endpoint |
| Health check | Status per integration |
| Secret audit | Findings, rotation schedule |

### skill_state

```json
{
  "integrations": {
    "salesforce": {
      "status": "built",
      "auth": "oauth",
      "endpoints": 4,
      "test_rounds": 2,
      "last_test": "PASS",
      "last_health": "2026-04-03T10:00:00Z"
    },
    "telegram": {
      "status": "built",
      "auth": "bot_token",
      "test_rounds": 1,
      "last_test": "PASS"
    }
  },
  "current_build": "stripe",
  "build_iteration": 1
}
```

### Cross-Skill Reads

| Reads from | Why |
|---|---|
| oc-app-architect | 04-integrations.md → discovery baseline |
| oc-reverse-spec | Existing integrations → inventory pre-fill |
| oc-stack-forge | Auth pattern → compatible implementation |
| oc-deploy-ops | Environment config → where secrets stored |

| Read by | Why |
|---|---|
| oc-code-auditor | Integration health → security context |
| oc-deploy-ops | Integration status → deploy confidence |
| oc-scale-ops | API rate limits → scaling constraints |
| oc-api-dev | When this app's first-party API needs to call out to a third-party that oc-integrations-engineer wired up |

---

## Principles

1. **Three agents, real APIs.** The Builder codes, the Tester hits the real sandbox.
   Mocks pass when production would fail.
2. **Never store secrets in code.** Wrangler secrets or KV. Period.
3. **Always verify webhooks.** Signature verification is not optional.
4. **Retry with backoff.** Exponential + jitter. Never brute force.
5. **Idempotency on both sides.** Safe to receive twice, safe to send twice.
6. **Type the boundary.** Validate API responses at the edge with Zod/Pydantic.
7. **Monitor the connection.** A healthy app with a dead integration is still broken.
8. **Read the current docs.** APIs change. Web search before building.
