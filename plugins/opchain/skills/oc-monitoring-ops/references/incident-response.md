# Incident Response Reference

Templates and procedures for incident management, runbooks, and post-mortems.

---

## Incident Template

```markdown
# Incident: [INC-YYYY-MM-DD-NNN]

## Status: INVESTIGATING | IDENTIFIED | MITIGATED | RESOLVED

## Severity: SEV1 (critical) | SEV2 (major) | SEV3 (minor)

## Summary
[One sentence: what's broken and what's the user impact]

## Timeline
| Time (UTC) | Event |
|---|---|
| HH:MM | Alert fired: [alert name] |
| HH:MM | Acknowledged by: [who] |
| HH:MM | Initial diagnosis: [brief finding] |
| HH:MM | Root cause identified: [brief] |
| HH:MM | Mitigation applied: [action taken] |
| HH:MM | Service restored |
| HH:MM | Resolution confirmed — incident closed |

## Impact
- **Duration:** [total minutes from detection to resolution]
- **Users affected:** [number or "all" or "subset: description"]
- **Data loss:** None | [description]
- **Revenue impact:** None | [estimate]
- **SLO impact:** [X]% of monthly error budget consumed

## Root Cause
[2-3 sentences explaining why the failure occurred — mechanism, not blame]

## Mitigation
[What was done to restore service. Include commands run if relevant.]

## Resolution
[What was done to prevent recurrence — code change, config change, process change]

## Action Items
| ID | Action | Owner | Due | Status |
|---|---|---|---|---|
| AI-1 | [preventive action] | [who] | [date] | Open |
| AI-2 | [detective improvement] | [who] | [date] | Open |
| AI-3 | [process improvement] | [who] | [date] | Open |
```

### Severity Definitions

| Severity | Criteria | Response |
|---|---|---|
| **SEV1** | Service completely unavailable; data loss; security breach | Drop everything, all hands |
| **SEV2** | Major feature broken; degraded for all users; elevated error rate | Respond within 15 min |
| **SEV3** | Minor feature broken; affects subset of users; cosmetic | Respond within 1 hour |

For solo developers, SEV1 = "fix now", SEV2 = "fix today", SEV3 = "fix this week."

---

## Runbook Templates

### Runbook: Endpoint Unreachable

```markdown
# Runbook: Endpoint Unreachable

## Trigger
Alert: "Endpoint down" — health check fails 2 consecutive times

## Quick Check (< 2 min)
1. Verify from your device: `curl -s -o /dev/null -w "%{http_code}" $URL/api/health`
2. If 200: likely a monitoring false positive. Check monitor service status.
3. If non-200 or timeout: proceed to Diagnosis.

## Diagnosis

### Is it DNS?
```bash
dig $DOMAIN +short
# No result → DNS issue. Check registrar, Cloudflare DNS settings.
```

### Is it the CDN/edge?
```bash
curl -sI $URL | grep -i "cf-ray\|server"
# No Cloudflare headers → edge routing issue. Check CF dashboard.
```

### Is it the Worker?
```bash
npx wrangler tail --format=json 2>/dev/null | head -5
# No output → Worker not receiving requests
# Error output → Worker is crashing
```

### Is it the database?
Check the health endpoint response body for per-check status.

## Remediation

| Scenario | Action | Rollback |
|---|---|---|
| Worker crash | Check last deploy: `npx wrangler deployments list`. Rollback: `npx wrangler rollback` | Forward-deploy fix |
| DNS misconfigured | Fix in Cloudflare DNS dashboard | Revert DNS change |
| D1 unreachable | Check CF status page for D1 outage | Wait; no user action |
| Rate limited | Check if CF rate limiting is too aggressive | Adjust rules |
| Bad deploy | `npx wrangler rollback` | Forward-deploy fix |

## Escalation
- If unresolved after 30 min: check Cloudflare status page, post in CF Discord
- If data loss suspected: start incident log, preserve logs before they rotate
```

### Runbook: Error Rate Spike

```markdown
# Runbook: Error Rate Spike

## Trigger
Alert: "High error rate" — >5% of requests return 5xx in 5-min window

## Quick Check (< 2 min)
1. Check error tracking (Sentry): any new issues in the last hour?
2. Check deploy history: was there a deploy in the last 2 hours?
3. Check structured logs: `npx wrangler tail --format=json | grep '"level":"error"'`

## Diagnosis

### Recent deploy?
```bash
npx wrangler deployments list | head -5
# If deploy within 2 hours → likely regression. Consider rollback.
```

### Specific endpoint?
```bash
# Check if errors are concentrated on one route
npx wrangler tail --format=json | grep error | python3 -c "
import json, sys
from collections import Counter
paths = Counter()
for line in sys.stdin:
    try:
        log = json.loads(line)
        paths[log.get('path', '?')] += 1
    except: pass
for path, count in paths.most_common(5):
    print(f'  {count}x {path}')
"
```

### External dependency?
If errors mention a third-party service (Stripe, Salesforce, etc.):
1. Check that service's status page
2. Check if error includes timeout or connection refused

## Remediation

| Scenario | Action | Rollback |
|---|---|---|
| Bad deploy (regression) | `npx wrangler rollback` | Forward-deploy fix |
| External service down | Enable fallback/graceful degradation | Wait for recovery |
| Traffic spike | Check oc-scale-ops thresholds; consider rate limiting | Adjust limits |
| Database issue | Check D1 dashboard; look for lock contention | Restart Worker |
| Code bug (no recent deploy) | Fix forward — patch + deploy | N/A |

## Escalation
- If rollback doesn't help: deeper investigation needed, check database
- If error rate > 50%: start SEV1 incident
```

### Runbook: Deploy Failure

```markdown
# Runbook: Deploy Failure

## Trigger
Alert: "Deploy failure" — CI/CD pipeline fails on production deploy

## Quick Check (< 2 min)
1. Check GitHub Actions: which step failed?
2. Is production still running on the previous version? (It should be.)
3. Is this blocking a critical fix?

## Diagnosis

### Build failure?
- TypeScript errors → fix in code
- Dependency resolution → check package-lock.json, clear CI cache

### Migration failure?
- D1 migration error → check migration SQL syntax
- Migration already applied → check migration state, may need manual fix

### Wrangler deploy failure?
- Auth error → check CF_API_TOKEN is valid and not expired
- Size limit → check bundle size, remove unused deps
- Compatibility date → update wrangler.toml

## Remediation

| Scenario | Action |
|---|---|
| Build error | Fix code, re-push |
| Migration error | Fix migration, or apply manually via `wrangler d1 execute` |
| Auth token expired | Rotate token in GitHub Secrets |
| Flaky test | Re-run CI; if persistent, fix the test |
| Critical fix blocked | Deploy manually: `npx wrangler deploy` from local |

## Escalation
- If manual deploy also fails: deeper infra issue, check CF status
```

---

## Post-Mortem Template

```markdown
# Post-Mortem: [INC-YYYY-MM-DD-NNN]

## Summary
[One paragraph: what happened, when, impact, resolution. Write this so someone
who wasn't involved can understand the incident in 30 seconds.]

## Impact
- **Duration:** [X] minutes
- **Users affected:** [N]
- **Data loss:** [None / description]
- **SLO impact:** [X]% of monthly error budget consumed
- **Revenue impact:** [None / $X]

## Timeline
[Copy from incident log, clean up timestamps]

## Contributing Factors
[NOT "root cause" — incidents usually have multiple contributing factors.
List each as a separate item with a brief explanation.]

1. **[Factor 1]:** [What made the failure possible]
2. **[Factor 2]:** [What made detection slow]
3. **[Factor 3]:** [What made mitigation difficult]

## What Went Well
- [Thing that worked — monitoring caught it fast, rollback was easy, etc.]
- [Another positive]

## What Didn't Go Well
- [Gap — no runbook for this scenario]
- [Delay — took 20 min to find the right logs]

## Where We Got Lucky
- [Thing that could have been worse — "if this happened during peak traffic..."]

## Action Items
| ID | Action | Type | Owner | Priority | Due | Status |
|---|---|---|---|---|---|---|
| PM-1 | [action] | Prevent | [who] | P1 | [date] | Open |
| PM-2 | [action] | Detect | [who] | P2 | [date] | Open |
| PM-3 | [action] | Process | [who] | P3 | [date] | Open |

Action types:
- **Prevent:** Stop this class of failure from happening
- **Detect:** Catch it faster next time
- **Mitigate:** Reduce blast radius or recovery time
- **Process:** Change how we respond to incidents

## Lessons Learned
[1-3 sentences: what changes in how we build, deploy, or operate as a result
of this incident. These should be actionable, not platitudes.]

## Review
- **Author:** [who wrote this]
- **Reviewed by:** [who else read it]
- **Review date:** [when]
```

### Post-Mortem Ground Rules

1. **Blameless.** Focus on systems and processes, not individuals. "The deploy
   pipeline didn't catch the regression" not "Alice broke prod."
2. **Honest.** Include "where we got lucky." If the failure happened at 3am
   instead of 3pm, that's not skill — that's luck. Document it.
3. **Action-oriented.** Every post-mortem produces at least one action item
   with an owner and due date. No action items = the post-mortem was theater.
4. **Timely.** Write within 48 hours of resolution while memory is fresh.
5. **Shared.** Post-mortems that only the author reads are worthless. Share
   with everyone who might benefit.

---

## Incident Severity Response Matrix

| | SEV1 | SEV2 | SEV3 |
|---|---|---|---|
| **Response time** | 5 min | 15 min | 1 hour |
| **Communication** | Status page update | Internal notification | Tracked silently |
| **Resolution target** | 1 hour | 4 hours | 1 week |
| **Post-mortem required?** | Yes, within 48h | Yes, within 1 week | Optional |
| **Action items required?** | Yes, tracked | Yes, tracked | Discretionary |

For solo developers, collapse SEV1+SEV2 into "fix now" and SEV3 into "fix this sprint."

---

## Filing Structure

```
monitoring/
├── config.md                  # Monitoring strategy, tools, thresholds
├── runbooks/
│   ├── downtime.md
│   ├── error-spike.md
│   ├── deploy-failure.md
│   ├── latency.md
│   ├── cert-renewal.md
│   └── error-budget.md
├── incidents/
│   ├── INC-2026-04-15-001.md
│   └── INC-2026-04-20-002.md
└── postmortems/
    └── PM-2026-04-15-001.md
```
