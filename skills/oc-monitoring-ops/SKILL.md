---
name: oc-monitoring-ops
displayName: OC · Monitoring Ops
version: 1.7.0
shortDesc: Post-deploy observability — uptime, errors, alerts, incidents. v1.2 opens PM incident tickets when alerts fire.
phases: [build]
triAgent: false
tryable: true
commands:
  - /oc-monitor
  - /oc-monitor setup
  - /oc-monitor stack
  - /oc-monitor instrument
  - /oc-monitor health
  - /oc-monitor errors
  - /oc-monitor uptime
  - /oc-monitor metrics
  - /oc-monitor alerts
  - /oc-monitor oncall
  - /oc-monitor slo
  - /oc-monitor incident
  - /oc-monitor runbook
  - /oc-monitor postmortem
  - /oc-monitor dashboard
  - /oc-monitor report
  - /oc-monitor audit
  - /oc-monitor compare
  - /oc-monitor status
description: >
  Post-deployment observability: uptime monitoring, error tracking, structured logging,
  alerting pipelines, and incident response runbooks. Sits after oc-deploy-ops in the
  pipeline — oc-deploy-ops ships it, oc-monitoring-ops watches it. Use for /oc-monitor,
  "set up monitoring", "error tracking", "uptime check", "alerting", "incident
  response", "observability", "what's happening in prod", "set up Sentry", "logging
  strategy", "on-call", "runbook", "SLO", "SLI", "is prod healthy", "why is it
  slow", "error rate", "status page". Trigger liberally.
---

# Monitoring Ops

**On first invocation, read `references/orchestrator.md` and follow its welcome protocol.**

Post-deployment observability skill. Deploy-ops ships the code; oc-monitoring-ops
watches it run. Covers five domains: uptime monitoring, error tracking, structured
logging, alerting pipelines, and incident response.

This skill does NOT build features or deploy code — it instruments what's already
deployed and establishes the feedback loop that catches problems before users report them.

## /oc-monitor — Command Reference

```
MONITORING OPS COMMANDS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  SETUP
  /oc-monitor setup         Guided observability stack setup for a project
  /oc-monitor stack         Recommend monitoring tools for the stack
  /oc-monitor instrument    Add structured logging + error capture to codebase

  OBSERVE
  /oc-monitor health        Live health check — hit endpoints, report status
  /oc-monitor errors        Check error tracking service for recent issues
  /oc-monitor uptime        Show uptime status and recent incidents
  /oc-monitor metrics       Key metrics snapshot (latency, error rate, throughput)
  /oc-monitor status        Current monitoring state from checkpoint

  ALERT
  /oc-monitor alerts        Design or audit alerting rules
  /oc-monitor oncall        Set up on-call rotation and escalation
  /oc-monitor slo           Define or review SLOs/SLIs/error budgets

  RESPOND
  /oc-monitor incident      Start or review an incident response
  /oc-monitor runbook       Generate or update operational runbooks
  /oc-monitor postmortem    Structured post-incident review

  REPORT
  /oc-monitor dashboard     Design an ops monitoring dashboard (routes to oc-dash-forge)
  /oc-monitor report        Generate weekly/monthly ops report
  /oc-monitor audit         Full observability maturity assessment
  /oc-monitor compare       Compare two monitoring snapshots (drift detection)

  SESSION
  /checkpoint            Show checkpoint status
  /checkpoint show       Display full checkpoint JSON
  /checkpoint reset      Archive and restart

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  Type any command to begin. /oc-monitor to see this again.
```

---

## Session Persistence (Checkpoint Protocol)

Checkpoint: `{project-dir}/.checkpoints/oc-monitoring-ops.checkpoint.json`

### Resume on Start

When any `/oc-monitor` command is invoked:
1. Check for checkpoint
2. If exists: show tier, tools, SLO status, active incidents, maturity grade, next action
3. Ask: "Continue, restart, or show full checkpoint?"
4. On continue: load context, resume from `next_actions[0]`

### What's Tracked

Monitoring-ops uniquely stores **runtime state** alongside pipeline progress — the last
health check result, active incident count, and SLO budget consumption. This means the
checkpoint serves double duty: session persistence AND operational snapshot.

---

## How This Skill Fits the Pipeline

```
oc-reverse-spec → oc-app-architect → oc-git-ops → oc-deploy-ops → MONITORING-OPS
                                                            │
                                              ┌─────────────┤
                                              │             │
                                         oc-security-auditor   oc-scale-ops
                                         (detection/        (perf
                                          response input)    budgets)
```

**oc-deploy-ops ships it, oc-monitoring-ops watches it.** The handoff:

1. oc-deploy-ops completes production promotion
2. oc-deploy-ops runs health check (basic HTTP 200 verification)
3. If oc-monitoring-ops checkpoint exists: oc-monitoring-ops takes over ongoing observation
4. If not: oc-deploy-ops suggests `/oc-monitor setup` for the project

oc-deploy-ops's health check is a one-shot verification. oc-monitoring-ops provides
continuous observation, error aggregation, alerting, and incident coordination.

### Cross-Skill Connections

| Skill | Relationship |
|---|---|
| **oc-deploy-ops** | Upstream. oc-deploy-ops ships → oc-monitoring-ops watches. Shares health check URLs, environment config. |
| **oc-security-auditor** | Peer. oc-security-auditor's Pillar 3 (detection/response) maps directly to oc-monitoring-ops's alerting + incident response. oc-security-auditor defines WHAT to detect; oc-monitoring-ops implements HOW to detect it. |
| **oc-scale-ops** | Peer. oc-scale-ops sets performance budgets; oc-monitoring-ops enforces them via alerting. Latency SLOs from oc-scale-ops become oc-monitoring-ops alert thresholds. |
| **oc-code-auditor** | Upstream consumer. oc-code-auditor's `/oc-audit pre-deploy` findings can include "missing error handling" — oc-monitoring-ops's `/oc-monitor instrument` addresses the gap at the observability layer. |
| **oc-app-architect** | Upstream. Reads spec for expected behaviors, user flows, and error handling strategy to inform what to monitor. |
| **oc-dash-forge** | Downstream for visualization. `/oc-monitor dashboard` routes to oc-dash-forge with an ops archetype context for monitoring UI design. |

---

## Observability Maturity Model

Every project maps to a maturity tier. The setup wizard determines the tier from
the project's scale, sensitivity, and infrastructure.

| Tier | Name | Who | What's Covered | Example |
|---|---|---|---|---|
| **T0** | Bare Minimum | Solo dev, personal app | Health endpoint + basic logging + crash alerts | aidops apps on free tier |
| **T1** | Foundations | Small team, internal tool | T0 + error tracking + uptime monitoring + structured logs | PenThreshold |
| **T2** | Production | Multi-user product, SLA exists | T1 + SLOs + alerting pipeline + runbooks + dashboards | SaaS MVP |
| **T3** | Operational | Revenue-bearing, on-call required | T2 + incident response + post-mortems + distributed tracing | Scaled product |

**Default for aidops-scale apps: T0 or T1.** Don't overengineer monitoring for a
2-user app. The setup wizard auto-detects the appropriate tier.

---

## Phase 1: Setup (`/oc-monitor setup`)

Guided setup that instruments a project for observability. Reads existing config
(oc-deploy-ops checkpoint, wrangler.toml, package.json) to avoid asking questions
with known answers.

### Setup Wizard

Use `ask_user_input` for remaining unknowns:

1. **What tier?** (auto-detect from oc-scale-ops/oc-deploy-ops context, confirm)
2. **Error tracking provider?** (Sentry, LogRocket, Highlight, BetterStack, or console-only)
3. **Uptime monitoring?** (BetterStack, UptimeRobot, Checkly, or CF Health Checks)
4. **Alerting channel?** (Telegram, Slack, Discord, email, PagerDuty)
5. **Status page?** (BetterStack, Instatus, or none)

### Setup Deliverables

| Artifact | Description |
|---|---|
| `monitoring/config.md` | Monitoring strategy document — what's monitored, thresholds, tools |
| `monitoring/runbooks/` | Operational runbooks (at least: deploy failure, error spike, downtime) |
| `src/lib/logger.ts` (or equivalent) | Structured logging utility |
| `src/middleware/monitoring.ts` | Request tracking, error capture, latency measurement |
| `.monitoring.json` | Tool configuration (URLs, check IDs, alert channels) |

### Health Endpoint Contract

Every monitored app needs a `GET /api/health` endpoint. This is the shared contract
between oc-deploy-ops (one-shot check), oc-monitoring-ops (continuous check), and external
uptime monitors.

**Response shape:**
```json
{
  "status": "ok | degraded | unhealthy",
  "checks": { "database": "ok", "kv": "ok" },
  "version": "1.2.3",
  "timestamp": "2026-04-23T10:00:00Z"
}
```

**Rules:**
- Returns 200 when all checks pass, 503 when any check is "down"
- Each dependency (DB, KV, external API) gets its own named check
- Include deployed version for deploy-correlation
- Include per-check latency at T2+ (for oc-scale-ops integration)

Read `references/instrumentation.md` for full implementation patterns per stack
(Workers, Next.js, FastAPI), including structured logger, request monitoring middleware,
and Sentry transport for Workers.

---

## Phase 2: Observe

### Health Check (`/oc-monitor health`)

Goes deeper than oc-deploy-ops's one-shot 200 check:

1. **HTTP status** — hit `/api/health`, verify 200
2. **Per-dependency status** — parse response body, check each named service (DB, KV, etc.)
3. **Latency profile** — 5 samples, report avg and max
4. **Certificate expiry** — TLS cert days remaining
5. **Version correlation** — compare deployed version to last-known-good

Output uses the Health Check Report format from `references/output-templates.md`.

### Error Tracking (`/oc-monitor errors`)

Checks the configured error tracking service. Adapts to what's available:

| Service | Method | What's Reported |
|---|---|---|
| Sentry | Sentry Issues API | Unresolved count, top 10 by recency, severity breakdown |
| Console-only | `wrangler tail` structured log grep | Recent error-level entries, deduplication by message |
| BetterStack / Highlight | Service-specific API | Unresolved issues + error trends |

### Metrics Snapshot (`/oc-monitor metrics`)

Aggregate key metrics from available sources:

```
PRODUCTION METRICS — [project]
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  Uptime (30d):    99.87%  (2h 17m total downtime)
  Error rate:      0.3%    (12 errors / 4,200 requests today)
  p50 latency:     42ms
  p95 latency:     187ms
  p99 latency:     890ms
  Active errors:   3 unresolved (1 HIGH, 2 LOW)
  Last deploy:     2 days ago (v1.2.3)
  Next cert expiry: 47 days
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

### Status (`/oc-monitor status`)

Reads the checkpoint and displays the current monitoring state without hitting
any live endpoints. This is a checkpoint read, not a health check.

```
MONITORING STATUS — [project]
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  Tier:          T1 (Foundations)
  Maturity:      C (50%)
  Tools:         Sentry + BetterStack + Telegram
  SLOs:          99% avail / 1s p95 / 1% errors
  Budget:        86% remaining (24 days left in window)
  Last health:   2 min ago — ✅ ok (42ms)
  Incidents:     0 active
  Runbooks:      3 of 6 alert-mapped
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

---

## Phase 3: Alert (`/oc-monitor alerts`)

### Alert Design Principles

1. **Every alert must have an action.** If you can't do anything when it fires,
   it's noise, not an alert. Remove it.
2. **Two thresholds: warn and critical.** Warn = investigate soon. Critical = act now.
3. **Alert on symptoms, not causes.** "Error rate > 5%" is better than "database
   connection pool exhausted" — the symptom catches more failure modes.
4. **Pair every alert with a runbook.** The alert says "something's wrong." The
   runbook says "here's what to do."

### Standard Alert Set (T1+)

| Alert | Condition | Severity | Runbook |
|---|---|---|---|
| Endpoint down | Health check fails 2 consecutive times | CRITICAL | `runbooks/downtime.md` |
| High error rate | >5% of requests return 5xx in 5-min window | CRITICAL | `runbooks/error-spike.md` |
| Elevated error rate | >1% of requests return 5xx in 15-min window | WARN | `runbooks/error-spike.md` |
| High latency | p95 > 2s for 5 minutes | WARN | `runbooks/latency.md` |
| Certificate expiring | SSL cert expires within 14 days | WARN | `runbooks/cert-renewal.md` |
| Error budget burn | >50% of monthly error budget consumed | WARN | `runbooks/error-budget.md` |
| Deploy failure | CI/CD pipeline fails on production | CRITICAL | `runbooks/deploy-failure.md` |

### SLO Definition (`/oc-monitor slo`)

Service Level Objectives quantify "good enough." They prevent over-engineering
reliability for apps that don't need five nines.

| Metric (SLI) | T0 Target | T1 Target | T2 Target | T3 Target |
|---|---|---|---|---|
| Availability | 95% (36h down/mo) | 99% (7h down/mo) | 99.9% (43m down/mo) | 99.95% (22m down/mo) |
| Latency (p95) | <2s | <1s | <500ms | <200ms |
| Error rate | <5% | <1% | <0.1% | <0.05% |
| Data freshness | Best effort | <5 min | <1 min | <30s |

**Error budget = 100% − SLO.** If your SLO is 99% availability, you have 7.3 hours
of downtime per month before you violate it. Spend that budget on deploys and
feature velocity, not perfection.

Read `references/alerting-patterns.md` for channel setup (Telegram, Slack, PagerDuty),
alert transport code, and SLO burn-rate alerting math.

---

## Phase 4: Respond (`/oc-monitor incident`)

Read `references/incident-response.md` for full incident template, runbook template,
and post-mortem template.

### Incident Lifecycle

```
ALERT FIRES
    │
    ▼
ACKNOWLEDGE (who's looking at it?)
    │
    ▼
DIAGNOSE (what's broken? use runbook decision tree)
    │
    ├──► QUICK FIX (restart, rollback, scale) ─────┐
    │                                               │
    ├──► FIX FORWARD (patch + deploy) ──────────────┤
    │                                               │
    └──► ESCALATE (beyond current expertise) ───────┤
                                                    ▼
                                      MITIGATE (service restored)
                                                    │
                                                    ▼
                                      RESOLVE (root cause addressed)
                                                    │
                                                    ▼
                                      POST-MORTEM (blameless, action items)
```

### Key Files

| File | Purpose |
|---|---|
| `monitoring/runbooks/downtime.md` | Endpoint unreachable — diagnosis + recovery |
| `monitoring/runbooks/error-spike.md` | Error rate elevated — triage + mitigation |
| `monitoring/runbooks/deploy-failure.md` | Deploy broke prod — rollback procedure |
| `monitoring/runbooks/latency.md` | Response times degraded — diagnosis |
| `monitoring/incidents/` | Incident logs (one file per incident) |
| `monitoring/postmortems/` | Post-incident reviews |

---

## AI-App Monitoring Template (v1.6 — the instrumented pipeline)

When the deployed app has an LLM in the loop (an `11-ai-architecture.md` spec, or
any oc-claude-api / oc-rag-forge / oc-agent-forge surface), the standard uptime +
error template isn't enough — AI apps fail in ways HTTP 200s hide. This template
adds four AI-specific signals on top of the usual ones:

| Signal | What it catches | Source / how |
|---|---|---|
| **Token rate** | a runaway loop or prompt bloat burning spend | tokens/min from the request layer; alert on a step-change |
| **Cost rate** | spend outrunning budget in production | `oc-cost-ops` attribution per request → $/hour; alert past a ceiling |
| **Eval drift** | model/prompt quality silently regressing in prod | scheduled `oc-prompt-ops` drift run on the live prompt; alert when score drops past `regression_epsilon` |
| **Hallucination / refusal flags** | answers ungrounded or the model over-refusing | sampled output checks (RAG faithfulness, refusal-rate, schema-valid tool calls); alert on rate spikes |

Wiring notes:
- **Cost rate** reuses `oc-cost-ops` — monitoring watches the *production* spend
  rate; cost-ops owns the attribution + the budget gate. A sustained breach pages
  on-call the same as an error-rate breach.
- **Eval drift** reuses `oc-prompt-ops drift` — monitoring schedules it against the
  live model and treats a score regression as an incident trigger, closing the
  loop the v1.6 theme is about: quality and cost are monitored, not just uptime.
- **Token/hallucination** signals are sampled (not every request) to keep the
  monitor cheap; the sample rate is a `/oc-monitor instrument` config.

This template is additive — it sits beside the uptime/error/latency SLOs, it does
not replace them. Select it with `/oc-monitor setup --template ai-app`.

## Observability Audit (`/oc-monitor audit`)

Full maturity assessment. Scores each domain and recommends the next upgrade.

### Audit Domains

| Domain | Weight | What it measures |
|---|---|---|
| **Logging** | 20% | Structured logs, context propagation, retention, searchability |
| **Error Tracking** | 20% | Capture rate, grouping, alerting, triage workflow |
| **Uptime** | 20% | Monitoring coverage, check frequency, historical availability |
| **Alerting** | 20% | Alert quality (action per alert), channel reliability, runbook coverage |
| **Incident Response** | 20% | Runbooks exist, post-mortem practice, on-call defined |

**Tier-adaptive grading:** At T0, incident response and alerting carry reduced weight
(a solo dev doesn't need PagerDuty). At T2+, all five domains are equally critical.
The audit grades against the project's declared tier, not against T3 universally.

### Maturity Scoring

| Score | Meaning |
|---|---|
| A (90%+) | Production-ready operations — you'd sleep through deploys |
| B (70-89%) | Solid foundations — most issues caught automatically |
| C (50-69%) | Basic coverage — you find out about problems, eventually |
| D (30-49%) | Reactive — users report problems before you see them |
| F (<30%) | No observability — flying blind |

See `references/output-templates.md` for full audit report format, ops report template,
and metrics snapshot format.

---

## Dashboard Routing (`/oc-monitor dashboard`)

When the user wants a monitoring dashboard, route to oc-dash-forge with ops archetype
pre-selected:

```
Detected monitoring dashboard request. Routing to oc-dash-forge with ops archetype.

oc-dash-forge will produce:
  - High-density ops layout (dark mode, tight tiles)
  - Real-time KPI tiles (error rate, latency, throughput, uptime)
  - Incident table, event feed, throughput chart
  - Working React prototype with mock data

Proceeding to /oc-data-forge with ops context...
```

Package the following context for oc-dash-forge:
- Archetype: ops (pre-selected, skip interview)
- Data sources: health endpoint, error tracking, uptime service, structured logs
- KPIs: error rate, p95 latency, uptime %, active incidents, deploy recency
- Refresh cadence: near-real-time (30s-2min)

---

## Ops Report (`/oc-monitor report`)

Generate a periodic operations summary covering availability, performance, errors,
SLO status, deploys, and incidents. Cadence depends on tier: T1 = monthly, T2+ = weekly.

The report pulls from: oc-monitoring-ops checkpoint (SLO budget, incident count), oc-deploy-ops
checkpoint (deploy count, rollbacks), and error tracking service (error counts, top issues).

See `references/output-templates.md` for the full report template.

---

## Snapshot Comparison (`/oc-monitor compare`)

Compares two monitoring snapshots to track observability posture over time. Mirrors
oc-security-auditor's `/oc-security compare` pattern.

Input: two checkpoint timestamps or dates. If one argument, compares against current state.

Diffs: maturity grade, domain scores, SLO budget consumption, incident count, runbook
coverage. Highlights regressions prominently. Uses the comparison format from
`references/output-templates.md`.

---

## File Structure

```
project-dir/
├── .checkpoints/
│   └── oc-monitoring-ops.checkpoint.json
├── .monitoring.json                 # Tool config (URLs, check IDs, channels)
├── monitoring/
│   ├── config.md                    # Strategy: what's monitored, thresholds, tools
│   ├── runbooks/
│   │   ├── downtime.md
│   │   ├── error-spike.md
│   │   ├── deploy-failure.md
│   │   ├── latency.md
│   │   ├── cert-renewal.md
│   │   └── error-budget.md
│   ├── incidents/
│   │   └── INC-YYYY-MM-DD-NNN.md
│   └── postmortems/
│       └── PM-YYYY-MM-DD-NNN.md
├── src/
│   ├── lib/
│   │   ├── logger.ts                # Structured logging utility
│   │   ├── alerting.ts              # Alert dispatch (Telegram/Slack/PagerDuty)
│   │   └── sentry.ts               # Error tracking transport (Workers)
│   └── middleware/
│       └── monitoring.ts            # Request tracking, timing, error capture
```

---

## Checkpoint Integration

### Location
`{project-dir}/.checkpoints/oc-monitoring-ops.checkpoint.json`

### When to Write

| Event | What to Save |
|---|---|
| Setup complete | Tier, tools configured, instrumentation files created |
| Health check run | Status, latency, individual check results |
| Alert rules defined | Alert inventory, channel config |
| SLOs defined | SLI definitions, targets, error budget |
| Incident started | Incident ID, timeline, status |
| Incident resolved | Resolution, post-mortem reference |
| Audit run | Domain scores, maturity grade, recommendations |
| Runbook created | Runbook inventory, coverage map |

### progress_table

```json
[
  { "id": "setup",      "label": "Observability setup",    "status": "not_started" },
  { "id": "logging",    "label": "Structured logging",     "status": "not_started" },
  { "id": "errors",     "label": "Error tracking",         "status": "not_started" },
  { "id": "uptime",     "label": "Uptime monitoring",      "status": "not_started" },
  { "id": "alerts",     "label": "Alerting pipeline",      "status": "not_started" },
  { "id": "slos",       "label": "SLO definition",         "status": "not_started" },
  { "id": "runbooks",   "label": "Operational runbooks",   "status": "not_started" },
  { "id": "dashboard",  "label": "Monitoring dashboard",   "status": "not_started" }
]
```

### skill_state

```json
{
  "tier": "T1",
  "tools": {
    "error_tracking": "sentry",
    "uptime": "betterstack",
    "alerting": "telegram",
    "logging": "structured-json"
  },
  "slos": {
    "availability": "99%",
    "latency_p95": "1s",
    "error_rate": "1%"
  },
  "last_health_check": {
    "at": "2026-04-22T10:00:00Z",
    "status": "ok",
    "latency_ms": 42
  },
  "active_incidents": 0,
  "runbook_count": 3,
  "maturity_grade": "C"
}
```

### Cross-Skill Reads

| Reads from | Why |
|---|---|
| oc-deploy-ops | Health check URLs, environment config, deploy history |
| oc-security-auditor | Detection/response requirements → what to monitor for |
| oc-scale-ops | Performance budgets → SLO/alert thresholds |
| oc-app-architect | Spec, error handling strategy → instrumentation targets |
| oc-code-auditor | Error handling gaps → logging instrumentation needs |

| Read by | Why |
|---|---|
| oc-deploy-ops | Health status → deploy confidence, post-deploy verification |
| oc-security-auditor | Detection/response maturity → Pillar 3 input |
| oc-scale-ops | Latency/error metrics → capacity planning data |
| oc-orchestrator | Active incidents, maturity grade → project health |

---

## Tool Recommendations by Stack

### Cloudflare Workers (aidops default)

| Domain | Free Tier | Paid | Notes |
|---|---|---|---|
| Logging | `console.log` + `wrangler tail` | Logpush → R2/S3 | Workers logs auto-available |
| Error tracking | Sentry (5K events/mo free) | Sentry Team ($26/mo) | Lightweight transport for Workers |
| Uptime | BetterStack (5 monitors free) | BetterStack ($24/mo) | Also does status pages |
| Alerting | Telegram bot (free) | PagerDuty | Telegram for solo; PagerDuty for teams |
| Dashboards | CF Analytics (built-in) | Grafana Cloud (free tier) | CF analytics covers most T0-T1 needs |

### Vercel / Next.js

| Domain | Free Tier | Paid |
|---|---|---|
| Logging | Vercel Logs | Axiom (Vercel integration) |
| Error tracking | Sentry | Sentry |
| Uptime | BetterStack | Checkly |
| Alerting | Vercel Alerts | PagerDuty |

### General (any stack)

| Domain | Recommended |
|---|---|
| Logging | Structured JSON → centralized log service |
| Error tracking | Sentry (dominant, best-in-class grouping) |
| Uptime | BetterStack or UptimeRobot |
| Alerting | Start with Telegram/Slack, graduate to PagerDuty |
| Status page | BetterStack (free tier includes status page) |

---

## PM-Tool MCP Integration (v1.3+)

oc-monitoring-ops opens **incident tickets** in the PM tool when
alerts fire, and back-references them through resolution.

The runtime contract — concrete tool names, retry policy, idempotency
markers, the `pm_deferred_actions[]` schema, and the extended state
vocabulary (`resolved-pending-postmortem`) — lives in
[`oc-integrations-engineer/references/pm-mcp-protocol.md`](../oc-integrations-engineer/references/pm-mcp-protocol.md).
**All MCP calls below honour that contract; this section says only how
oc-monitoring-ops shapes incidents and per-event updates.**

### On alert fire

1. Look up the alert in the runbook registry (configured per
   alert id; see `runbooks/`).
2. Compose incident description, prefixed with the idempotency marker
   per protocol §3:

   ```
   <!-- opchain:oc-monitoring-ops:incident-fired:<alert-event-id> -->

   Alert: {alert-name} ({severity})
   Fired at: {iso-timestamp}
   Service: {service}
   Symptoms: {first-three-symptoms-from-alert-payload}
   Runbook: {runbook-url}
   On-call: {on-call-engineer-from-pagerduty}
   Recent deploys: {list-of-deploys-in-last-2h-from-deploy-ops-checkpoint}
   ```

3. Pre-create check: call the registry-resolved `list_issues` tool
   (Linear: `mcp__claude_ai_Linear__list_issues`; GitHub:
   `mcp__mcp-server-github__list_issues`) filtered to the configured
   project + the `incident` issue type from `pm.yaml.issue_types`,
   description-text query for the marker. If a match exists, **reuse**
   the existing incident id (mid-burst alert dedupe).
4. Otherwise call the registry-resolved `create_issue` tool (Linear:
   `mcp__claude_ai_Linear__save_issue` with no `id`; GitHub:
   `mcp__mcp-server-github__issue_write` action=create) with:
   - `issue_type` from `pm.yaml.issue_types.incident` (default "Incident").
   - priority from alert severity mapping.
   - labels from runbook (`incident`, `service:<name>`,
     `severity:<level>`), merged with `pm.yaml.labels_default`.
   - parent / blocked-by relation to the most recent deploy ticket
     if one is open (likely culprit) — read from
     `oc-deploy-ops.checkpoint.json` `skill_state.pm.deploy_tickets[]`.
5. Record incident id in `oc-monitoring-ops.checkpoint.json`
   `skill_state.pm.incidents[]` with the correlating Sentry /
   PagerDuty event id.

### Per-event updates during the incident

Each row uses a unique idempotency marker. Pre-write check via
`list_comments` (Linear) or `issue_read` (GitHub) before every
`add_comment`. State strings come from `pm.yaml.states` /
`pm.yaml.states.extended` — never hard-coded.

| Event | Marker | Action |
|---|---|---|
| Alert auto-resolves (back to baseline) | `<!-- opchain:oc-monitoring-ops:auto-resolved:<incident-id> -->` | `add_comment`: "Auto-resolved — {duration}"; transition → `resolved-pending-postmortem` (resolved from `pm.yaml.states.extended`). Do not close. |
| Engineer ack via PagerDuty | `<!-- opchain:oc-monitoring-ops:acked:<incident-id>:<engineer-id> -->` | `add_comment`: "{engineer} acknowledged"; transition → `in_progress`. |
| Status page update | `<!-- opchain:oc-monitoring-ops:status-update:<incident-id>:<update-id> -->` | `add_comment` mirroring the public update. |
| Postmortem published | `<!-- opchain:oc-monitoring-ops:postmortem:<incident-id> -->` | `add_comment` with link; transition → `done`. |

### Postmortem back-reference

When the postmortem is written, oc-monitoring-ops appends an
action-item sub-ticket per remediation item, parent = the incident
ticket. Each remediation sub-ticket carries marker
`<!-- opchain:oc-monitoring-ops:remediation:<incident-id>:<item-n> -->`
in its description and is created via the `create_issue` tool with
the pre-create check pattern above. Each remediation sub-ticket is
assigned to the owning team's default assignee (from
`pm.yaml.remediation_owners` map), with a target close date.

### Alert hygiene

If an alert fires more than N times in 24h (default 5; configurable
per alert), oc-monitoring-ops adds a `noisy-alert` label (per protocol
Appendix A — labels, not state) to the incident and surfaces a
tuning recommendation rather than spamming new tickets — same
incident gets new comments, not new tickets. The pre-create check
in step 3 above ensures this naturally for in-window alerts.

### `/oc-monitor --retry-pm` flush

Invokes the protocol §4 flush against
`oc-monitoring-ops.checkpoint.json` `pm_deferred_actions[]`. Filter to
`skill: "oc-monitoring-ops"` and `retriable: true`. Critical alerts
should NOT depend on flush succeeding — Telegram / PagerDuty fire
regardless; the flush is reconciliation only.

### Failure modes

- MCP unavailable → alert fires through Telegram / PagerDuty as
  always; intended PM-MCP write is deferred per protocol §4.
  Operator visibility is unaffected.
- PM provider rate-limits during a major incident burst → batch into
  a single rollup ticket via the marker dedupe in step 3 (the same
  alert-event-id naturally folds into one incident); separate
  comments per alert event with marker
  `<!-- opchain:oc-monitoring-ops:burst-event:<incident-id>:<event-n> -->`.
- 403 on incident creation → defer with `retriable: false`; surface
  to the on-call channel as a side message; never silently widen scope.

---

## Principles

1. **Monitor symptoms, not implementations.** Alert on error rate, not on which
   specific database query failed. Symptoms catch failures you didn't predict.
2. **Every alert needs a runbook.** An alert without instructions is just noise.
3. **Error budgets over perfection.** 99% uptime is fine for aidops-scale apps.
   That's 7 hours of acceptable downtime per month. Use that budget for shipping.
4. **Structured logs are non-negotiable.** `console.log("error")` tells you nothing
   in production. JSON with request ID, user context, and timestamps tells you
   everything.
5. **Proportional investment.** T0 for personal apps, T3 for revenue-bearing
   products. Don't build PagerDuty rotation for a 2-user fitness tracker.
6. **Post-mortems are investments, not punishments.** Every incident you learn
   from is one that won't repeat. Blameless or don't bother.
7. **Observability is continuous.** Setup is phase 1, not the finish line.
   Audit quarterly, refine alerts monthly, run health checks daily.
