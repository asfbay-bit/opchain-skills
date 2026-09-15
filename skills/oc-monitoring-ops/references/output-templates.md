# Output Templates

Report formats for oc-monitoring-ops assessments, ops reports, and status summaries.

---

## Observability Audit Report

```markdown
# Observability Audit — [project]

## Current Tier: [T0-T3]
## Maturity Score: [A-F] ([X]%)
## Date: [date]

## Executive Summary
[3-5 sentences: current state, biggest gap, top recommendation]

## Domain Scores

| Domain | Score | Current State | Key Gap |
|---|---|---|---|
| Logging | [X]/10 | [brief description] | [primary gap] |
| Error Tracking | [X]/10 | [brief description] | [primary gap] |
| Uptime Monitoring | [X]/10 | [brief description] | [primary gap] |
| Alerting | [X]/10 | [brief description] | [primary gap] |
| Incident Response | [X]/10 | [brief description] | [primary gap] |

## Detailed Assessment

### Logging ([X]/10)
| Check | Status | Evidence |
|---|---|---|
| Structured JSON format | ✅/❌ | [what exists] |
| Request ID propagation | ✅/❌ | [present in logs?] |
| User context attached | ✅/❌ | [userId in log entries?] |
| Error stack traces | ✅/❌ | [full traces captured?] |
| Log retention policy | ✅/❌ | [how long, where stored] |
| Searchable log platform | ✅/❌ | [tool used or "wrangler tail only"] |

### Error Tracking ([X]/10)
| Check | Status | Evidence |
|---|---|---|
| Error capture configured | ✅/❌ | [Sentry / LogRocket / none] |
| Unhandled exceptions caught | ✅/❌ | [global handler exists?] |
| Error grouping works | ✅/❌ | [unique issues or noise?] |
| Alert on new errors | ✅/❌ | [notification configured?] |
| Triage workflow defined | ✅/❌ | [who reviews, how often?] |

### Uptime Monitoring ([X]/10)
| Check | Status | Evidence |
|---|---|---|
| Health endpoint exists | ✅/❌ | [/api/health or equivalent] |
| External monitor configured | ✅/❌ | [BetterStack / UptimeRobot / none] |
| Check frequency appropriate | ✅/❌ | [interval vs. SLO] |
| Dependency checks included | ✅/❌ | [DB, KV, external APIs] |
| Status page exists | ✅/❌ | [URL or "none"] |
| Historical uptime tracked | ✅/❌ | [data available for how long] |

### Alerting ([X]/10)
| Check | Status | Evidence |
|---|---|---|
| Alert channel configured | ✅/❌ | [Telegram / Slack / PagerDuty] |
| Alert delivery tested | ✅/❌ | [when last tested] |
| Each alert has a runbook | ✅/❌ | [coverage: X of Y alerts mapped] |
| No-noise principle followed | ✅/❌ | [alerts/week, false positive rate] |
| SLOs defined | ✅/❌ | [targets documented?] |
| Error budget tracking | ✅/❌ | [burn rate alerting?] |

### Incident Response ([X]/10)
| Check | Status | Evidence |
|---|---|---|
| Runbooks exist | ✅/❌ | [count, coverage] |
| Incident template ready | ✅/❌ | [standardized format?] |
| Post-mortem practice | ✅/❌ | [how many completed?] |
| On-call defined | ✅/❌ | [rotation or "solo"] |
| Escalation path documented | ✅/❌ | [who to call when stuck] |
| Action items tracked | ✅/❌ | [from post-mortems, not lost] |

## Recommended Upgrades (prioritized)
1. [Highest-impact improvement] — [effort] — [why first]
2. [Next improvement] — [effort]
3. [Next improvement] — [effort]

## Target State
- **Current tier:** [T0-T3]
- **Recommended target:** [next tier]
- **Estimated effort to reach:** [hours]
- **Key milestones:** [what changes at each step]
```

---

## Ops Report (Periodic)

```markdown
# Ops Report — [project] — [period (e.g., "Week of 2026-04-15")]

## Availability
- **Uptime:** [X]% (target: [Y]%)
- **Incidents:** [N] total ([M] SEV1, [K] SEV2, [J] SEV3)
- **Total downtime:** [duration]
- **SLO status:** [within budget / budget concern / budget violated]
- **Error budget remaining:** [X]%

## Performance
- **p50 latency:** [X]ms (target: [Y]ms)
- **p95 latency:** [X]ms (target: [Y]ms)
- **p99 latency:** [X]ms
- **Throughput:** [N] requests/day avg ([M] peak)

## Errors
- **Total errors:** [N]
- **Error rate:** [X]% (target: [Y]%)
- **New issues:** [M] unique
- **Resolved issues:** [K]
- **Top errors:**
  1. [error title] — [count]x — [status: new/known/resolved]
  2. [error title] — [count]x — [status]
  3. [error title] — [count]x — [status]

## SLO Dashboard
| SLI | Target | Actual | Budget Used | Budget Remaining |
|---|---|---|---|---|
| Availability | [X]% | [Y]% | [Z]% | [W]% |
| Latency (p95) | [X]ms | [Y]ms | [Z]% | [W]% |
| Error rate | [X]% | [Y]% | [Z]% | [W]% |

## Deploys
- **Deploys this period:** [N]
- **Rollbacks:** [M]
- **Deploy success rate:** [X]%
- **Mean time to deploy:** [X] min

## Incidents
[If incidents occurred, brief summary of each. Link to incident log.]

## Action Items
| Source | Action | Owner | Status |
|---|---|---|---|
| Incident PM-001 | [action] | [who] | [status] |
| Audit finding | [action] | [who] | [status] |

## Notable Changes
[Any infra changes, tool updates, or process changes during the period]

## Next Period Focus
[1-3 things to prioritize in the next period]
```

---

## Metrics Snapshot (Quick Check)

```
PRODUCTION METRICS — [project]
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  Status:        [✅ Healthy | ⚠️ Degraded | ❌ Down]
  Uptime (30d):  [X]%  ([Y] total downtime)
  Error rate:    [X]%  ([N] errors / [M] requests today)
  p50 latency:   [X]ms
  p95 latency:   [X]ms
  p99 latency:   [X]ms
  Active errors:  [N] unresolved ([M] HIGH, [K] LOW)
  Last deploy:   [relative time] ([version])
  Cert expiry:   [N] days
  SLO budget:    [X]% remaining this month
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

---

## Health Check Report

```
HEALTH CHECK — [project] — [timestamp]
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  Overall:   [✅ ok | ⚠️ degraded | ❌ unhealthy]

  Checks:
    ✅ database     ok       (12ms)
    ✅ kv           ok       (3ms)
    ⚠️ external-api degraded (890ms — high latency)
    ✅ auth         ok       (8ms)

  Latency:
    avg: [X]ms  max: [Y]ms  (5 samples)

  Version: [deployed version]
  Certificate: valid, expires [date] ([N] days)

  [If degraded/unhealthy:]
  ⚠️ Action needed: [specific issue + runbook reference]
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

---

## Snapshot Comparison

```markdown
## Monitoring Comparison — [project]
**Before:** [date or checkpoint ref]  →  **After:** [date or checkpoint ref]

| Metric | Before | After | Δ |
|---|---|---|---|
| Maturity grade | [X] | [Y] | [improved/same/regressed] |
| Logging | [X]/10 | [Y]/10 | [+/-N] |
| Error Tracking | [X]/10 | [Y]/10 | [+/-N] |
| Uptime | [X]/10 | [Y]/10 | [+/-N] |
| Alerting | [X]/10 | [Y]/10 | [+/-N] |
| Incident Response | [X]/10 | [Y]/10 | [+/-N] |
| SLO budget remaining | [X]% | [Y]% | [+/-N] |
| Runbook coverage | [X]/[Y] alerts | [X]/[Y] alerts | [+/-N] |
| Incidents this period | [N] | [M] | [+/-N] |

### Improvements
[List MO-XXX findings resolved since last snapshot]

### Regressions ⚠️
[Any metric that worsened — flag prominently]

### New Findings
[List any new MO-XXX findings not in previous snapshot]
```

---

## Finding Format

Monitoring-ops findings use the `MO-` prefix to distinguish from oc-code-auditor (`F-`)
and oc-security-auditor (`SA-`) findings.

```markdown
### [MO-001] [Short title]

**Domain:** Logging | Error Tracking | Uptime | Alerting | Incident Response
**Severity:** CRITICAL | HIGH | MEDIUM | LOW
**Current State:** [What exists now]
**Expected State:** [What should exist at this tier]
**Fix Effort:** S (< 30 min) | M (30 min - 2 hr) | L (2+ hr)

**Gap:**
[2-3 sentences: what's missing and why it matters]

**Remediation:**
[Specific steps, not vague advice]

**Verification:**
[How to confirm the fix worked]
```
