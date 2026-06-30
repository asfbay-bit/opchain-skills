# Output Templates

Reference templates for oc-security-auditor findings and reports. The SKILL.md describes
*what* to assess; this file describes *how to format* the output.

---

## Attack Surface Map Template

```markdown
## Attack Surface Map — [project]

### HTTP Endpoints
| Route | Method | Auth | Input | Sensitive Data | Risk Notes |
|---|---|---|---|---|---|
| /api/auth/register | POST | None | email, credential | PII | Rate limit? Enum? |
| /api/doses/log | POST | WebAuthn | dose data | PHI-adjacent | Audit trail? |

### Data Stores
| Store | Type | Encryption | Access Pattern | Backup | Notes |
|---|---|---|---|---|---|
| gtrack-db | D1 | At-rest (CF) | Worker binding | None | Single region |

### External Integrations
| Service | Auth Method | Data Sent | Data Received | Failure Mode |
|---|---|---|---|---|
| Amplitude | API key | Events | — | Silent drop |

### Static Assets
| Asset | Public? | Contains Secrets? | Cache Policy |
|---|---|---|---|
| /static/* | Yes | No | Immutable |

### Trust Boundaries
[ASCII diagram or list of boundary crossings with STRIDE findings]
```

---

## Data Flow Trace Template

```markdown
## Data Flow: [data type, e.g., "User dose logs"]
**Classification:** RESTRICTED (PHI-adjacent)

### Flow
1. **Ingress:** User submits via POST /api/doses/log (HTTPS, WebAuthn-authenticated)
2. **Validation:** Zod schema validates shape; no content sanitization
3. **Processing:** Worker formats and timestamps
4. **Storage:** Written to D1 `gtrack-db`, `doses` table (CF at-rest encryption)
5. **Retrieval:** GET /api/doses (auth-gated, user-scoped query)
6. **Egress:** JSON response over HTTPS to client; also sent to Amplitude as event

### Risk Points
| Step | Risk | Mitigation | Gap |
|---|---|---|---|
| 1→2 | Malformed input | Zod validation | No content-level sanitization |
| 4 | Data at rest | CF encryption | No app-level encryption, no field-level access control |
| 6 (Amplitude) | Data leaves trust boundary | HTTPS | No data minimization — full payload sent |
```

---

## OWASP Top 10 Assessment Template

```markdown
## OWASP Top 10 Assessment — [project]

### A01: Broken Access Control
**Status:** ⚠️ PARTIAL
**Evidence:** WebAuthn protects user routes, but admin flag is checked client-side.
**Remediation:** Move admin check to server-side middleware. Est. effort: S.

### A02: Cryptographic Failures
**Status:** ✅ PASS
**Evidence:** D1 encryption at rest, HTTPS enforced via Cloudflare, no custom crypto.
**Remediation:** None required.

[... continue for all 10 ...]

## Summary
| Category | Status | Effort to Fix |
|---|---|---|
| A01 Broken Access Control | ⚠️ PARTIAL | S |
| A02 Cryptographic Failures | ✅ PASS | — |
| ... | ... | ... |

**Overall OWASP Compliance: 7/10 PASS, 2 PARTIAL, 1 FAIL**
```

---

## Framework Readiness Template

```markdown
## [Framework] Readiness — [project]

### Applicable Controls
[List only controls relevant to this application type and data classification]

### Current State vs. Required
| Control | Requirement | Current State | Gap | Effort |
|---|---|---|---|---|
| Access Control | MFA on all admin access | WebAuthn (strong) | None | — |
| Audit Logging | Immutable audit trail | No audit log | Full gap | M |
| Encryption | Data encrypted at rest and in transit | CF handles both | None | — |
| Incident Response | Documented IR plan | None exists | Full gap | L |

### Prioritized Gap Closure Plan
1. [Highest-impact gap] — [effort] — [why first]
2. ...
```

**Important:** This is readiness *mapping*, not certification. Always note that actual
compliance requires formal assessment by qualified auditors. This skill identifies gaps
to close *before* engaging auditors.

---

## Posture Report Template

```markdown
# Security Posture Report — [project]
**Date:** [date]
**Scope:** [full | threat-model | compliance | hardening]
**Tier:** [Lite | Standard | Comprehensive]
**Assessor:** oc-security-auditor skill

## Executive Summary
[3-5 sentences: overall posture, critical risks, top recommendation]

## Risk Heatmap
| Category | Risk Level | Key Finding |
|---|---|---|
| Authentication | 🟢 LOW | WebAuthn, no password-based auth |
| Authorization | 🟡 MEDIUM | Admin checks need server-side enforcement |
| Data Protection | 🟢 LOW | CF encryption, no custom crypto |
| Infrastructure | 🟡 MEDIUM | Missing CSP header, weak HSTS |
| Compliance | 🟡 MEDIUM | OWASP 7/10, no audit logging |
| Threat Surface | 🟢 LOW | Small attack surface, limited public exposure |
| Detection/Response | 🟡 MEDIUM | No audit logging, no alerting |

## Findings by Pillar

### Pillar 1: Threat Model
[STRIDE summary, top 3 risks]

### Pillar 2: Compliance
[OWASP summary, framework gaps]

### Pillar 3: Runtime Hardening
[Headers, TLS, DNS, CF summary, detection/response status]

## Prioritized Remediation Plan
| Priority | Finding | Risk | Effort | Owner |
|---|---|---|---|---|
| P0 | Add CSP header | HIGH | S | oc-deploy-ops |
| P1 | Implement audit logging | MEDIUM | M | oc-app-architect |
| P2 | Harden HSTS max-age | LOW | S | oc-deploy-ops |

## Cross-References
- oc-code-auditor findings: [checkpoint reference or summary]
- oc-deploy-ops config: [checkpoint reference or summary]

## Next Steps
1. [Immediate action]
2. [Short-term action]
3. [Roadmap item]
```

---

## Posture Comparison Template

```markdown
## Posture Comparison — [project]
**Before:** [date or checkpoint ref]  →  **After:** [date or checkpoint ref]

| Metric | Before | After | Δ |
|---|---|---|---|
| Total findings | 18 | 14 | -4 ✅ |
| CRITICAL | 1 | 0 | -1 ✅ |
| HIGH | 4 | 2 | -2 ✅ |
| MEDIUM | 9 | 8 | -1 ✅ |
| LOW | 4 | 4 | — |
| OWASP score | 5/10 | 7/10 | +2 ✅ |
| Header score | 3/8 | 5/8 | +2 ✅ |

### New Findings (not in previous snapshot)
[List any new SA-XXX findings]

### Resolved Findings
[List SA-XXX findings present before but absent now]

### Regressions ⚠️
[Any metric that worsened — flag prominently]
```

---

## Finding Format

All findings across all pillars use this consistent format:

```markdown
### [SA-001] [Short title]

**Pillar:** Threat Model | Compliance | Hardening
**Risk:** CRITICAL | HIGH | MEDIUM | LOW
**Category:** STRIDE letter(s) | OWASP category | Header/TLS/DNS/CF
**Scope:** [What's affected — endpoint, component, entire app]
**Fix effort:** S (< 30 min) | M (30 min - 2 hr) | L (2+ hr) | XL (project)

**Problem:**
[2-3 sentences: what's the risk and what's the worst case]

**Remediation:**
[Specific steps to fix, not vague advice]

**Verification:**
[How to confirm the fix worked]
```

Finding IDs use the `SA-` prefix to distinguish from oc-code-auditor's `F-` prefix.
