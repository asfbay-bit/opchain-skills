---
name: oc-security-auditor
displayName: OC · Security Auditor
version: 1.7.0
shortDesc: Threat modeling, OWASP hardening, attack-surface review. v1.2 files CRITICAL findings as PM incident tickets.
phases: [build]
triAgent: false
tryable: false
commands:
  - /oc-security
  - /oc-secaudit
  - /oc-sec
  - /oc-threat-model
  - /oc-owasp
  - /oc-hardening
  - /oc-attack-surface
  - /oc-posture
description: >
  Practice-level security posture assessment: threat modeling (STRIDE), OWASP Top 10
  compliance mapping, runtime/infra hardening (CSP, TLS, DNS, WAF, Cloudflare config),
  and attack surface mapping. Operates ABOVE oc-code-auditor — oc-code-auditor finds SQLi and
  hardcoded secrets; oc-security-auditor asks "what's the threat model?" and "is the infra
  hardened?" ALWAYS trigger on /oc-security, /oc-secaudit, /oc-sec, /oc-threat-model, /oc-owasp,
  /oc-hardening, /oc-attack-surface, /oc-posture. Also trigger on: "threat model this app",
  "is this secure enough", "OWASP compliance", "security review", "attack surface",
  "harden this", "what are the security risks", "SOC2 readiness", "pen test prep",
  "how would someone attack this", "security architecture review", "CSP policy",
  "TLS config", "WAF rules". Trigger when user asks about security at an architecture,
  infrastructure, or compliance level — not just code bugs. Trigger liberally.
---

# Security Auditor

**On first invocation, read `references/orchestrator.md` and follow its welcome protocol.**

Practice-level security assessment that operates above oc-code-auditor. Where oc-code-auditor
greps for SQL injection and hardcoded secrets, oc-security-auditor asks: *What's the threat
model? Who are the adversaries? What's exposed? Is the infrastructure hardened? Are we
compliant?*

Three pillars: **Threat Modeling**, **Compliance Mapping**, **Runtime Hardening**.

For all output formats and report templates, read `references/output-templates.md`.

## /oc-security — Command Reference

```
SECURITY AUDITOR COMMANDS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  THREAT MODELING
  /oc-security threat-model       Full STRIDE analysis of the application
  /oc-security attack-surface     Map all entry points, data flows, trust boundaries
  /oc-security adversaries        Profile likely threat actors and their capabilities
  /oc-security data-flow          Trace sensitive data from ingress to storage to egress

  COMPLIANCE
  /oc-security owasp              OWASP Top 10 compliance checklist (current year)
  /oc-security posture            Full posture assessment (all three pillars)
  /oc-security readiness [framework]  SOC2 / ISO27001 / HIPAA readiness gap analysis
  /oc-security report             Regenerate posture report from last checkpoint

  RUNTIME HARDENING
  /oc-security headers            Audit HTTP security headers (CSP, HSTS, X-Frame, etc.)
  /oc-security tls                TLS/SSL configuration check
  /oc-security dns                DNS security (DNSSEC, CAA, SPF/DKIM/DMARC)
  /oc-security cloudflare         Cloudflare-specific: WAF, Bot Management, Page Rules
  /oc-security infra              Full infrastructure hardening sweep

  UTILITIES
  /oc-security prioritize         Rank all findings by risk × effort matrix
  /oc-security compare [before] [after]  Compare two posture snapshots
  /checkpoint                  Show checkpoint status

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  Type any command to begin. /oc-security to see this again.
```

---

## Relationship to oc-code-auditor

| Layer | Owner | Examples |
|---|---|---|
| **Code-level** | oc-code-auditor | SQLi, XSS, hardcoded secrets, auth middleware, dep vulns |
| **Architecture-level** | oc-security-auditor | Threat models, trust boundaries, data flow, attack surface |
| **Compliance-level** | oc-security-auditor | OWASP Top 10 mapping, SOC2 gap analysis, policy checklists |
| **Infra/runtime-level** | oc-security-auditor | CSP headers, TLS config, DNS security, WAF rules |

**Chaining rules:**
- After `/oc-audit security` (oc-code-auditor) → invoke oc-security-auditor for architecture + infra layers
- During `/oc-security posture` step 2 → check if oc-code-auditor checkpoint exists. If not,
  invoke `/oc-audit security` before proceeding. Threat modeling without code-level findings
  is incomplete.
- If threat model reveals code-level risks not in oc-code-auditor's findings → invoke
  `/oc-audit security` targeted at the specific area

---

## Pillar 1: Threat Modeling

### STRIDE Analysis (`/oc-security threat-model`)

For each component, evaluate all six STRIDE categories:

| Category | Question | Example Finding |
|---|---|---|
| **S**poofing | Can an attacker impersonate a user or system? | API-to-API calls use shared secret with no rotation |
| **T**ampering | Can data be modified in transit or at rest? | No integrity checks on database writes |
| **R**epudiation | Can a user deny performing an action? | No audit log on data mutation endpoints |
| **I**nformation Disclosure | Can sensitive data leak? | Error responses include stack traces; keys enumerable |
| **D**enial of Service | Can the service be made unavailable? | No rate limiting on public endpoints |
| **E**levation of Privilege | Can a user gain unauthorized access? | User ID from client header, not verified session |

### Process

1. **Inventory components.** Read oc-reverse-spec or oc-app-architect checkpoint for architecture.
   If none exists, scan the codebase for: routes, databases, external APIs, auth flows,
   static assets, scheduled tasks, WebSocket connections.

2. **Draw trust boundaries.** Identify where trust level changes. Common patterns:
   - Public internet → edge/CDN (Cloudflare, Vercel, CloudFront)
   - Edge → application server (Worker, Lambda, container)
   - Application → data store (D1, Postgres, DynamoDB, KV)
   - Application → external APIs (third-party services)
   - Client browser → application API
   - Admin interface → application API

3. **Run STRIDE per boundary crossing.** Each data flow that crosses a trust boundary
   gets all six STRIDE checks.

4. **Classify findings** using the risk matrix:

```
RISK = LIKELIHOOD × IMPACT

Likelihood:  HIGH (script kiddie, public, no auth) · MEDIUM (insider/chained) · LOW (physical/privileged)
Impact:      HIGH (breach, full compromise) · MEDIUM (partial exposure, degradation) · LOW (info leak, cosmetic)

           │ Low Impact │ Med Impact │ High Impact
───────────┼────────────┼────────────┼────────────
High Likl. │   MEDIUM   │    HIGH    │  CRITICAL
Med Likl.  │    LOW     │   MEDIUM   │    HIGH
Low Likl.  │    LOW     │    LOW     │   MEDIUM
```

### Attack Surface Mapping (`/oc-security attack-surface`)

Enumerate every entry point: HTTP endpoints, data stores, external integrations, static
assets, trust boundaries. See `references/output-templates.md` for the table format.

### Adversary Profiling (`/oc-security adversaries`)

Define realistic threat actors for the application. Generic starting set:

| Actor | Motivation | Capability | Relevant STRIDE |
|---|---|---|---|
| Opportunist | Curiosity, low-effort gain | Automated scanners, public exploits | S, I, D |
| Disgruntled user | Revenge, disruption | Authenticated access, social engineering | T, R, E |
| Data harvester | PII/PHI for resale | Scripted enumeration, credential stuffing | S, I |
| Competitive actor | IP theft | Targeted recon, API abuse | I, E |
| Supply chain | Backdoor access via deps | Compromised npm/pip package, typosquatting | T, E, I |

Tailor to the specific app. A personal fitness tracker has different adversaries than
a multi-tenant SaaS platform. Remove actors that don't apply; add app-specific ones.

### Data Flow Tracing (`/oc-security data-flow`)

Trace every sensitive data type from ingress to egress. Connective tissue between attack
surface mapping and STRIDE — shows exactly *where* sensitive data is vulnerable.

**Process:**

1. **Classify data types:**

| Classification | Description | Examples |
|---|---|---|
| PUBLIC | Intentionally public | Marketing copy, public API docs |
| INTERNAL | Not secret, not public | App config, feature flags |
| CONFIDENTIAL | User/business data needing protection | Email, analytics, preferences |
| RESTRICTED | Regulated or highly sensitive | PHI, PII, financial data, credentials |

2. **Trace each RESTRICTED and CONFIDENTIAL type** through the system: ingress →
   validation → processing → storage → retrieval → egress. Flag every trust boundary
   crossing. See `references/output-templates.md` for the trace format.

3. **Flag gaps:** Data crossing trust boundaries without protection, classification
   mismatches (RESTRICTED data with INTERNAL-level controls), retention beyond need.

4. **Third-party exposure check.** For each external integration identified in the
   attack surface map, assess:
   - What data classification level is shared with the third party?
   - Does the integration use least-privilege (minimal scopes, data minimization)?
   - What's the blast radius if the third party is compromised?
   - Is the integration authenticated with rotatable credentials (not hardcoded keys)?
   - Does the third party's privacy/security posture match the data classification?
   
   This is not full vendor management — it's a lightweight exposure check that feeds
   into STRIDE (Spoofing, Information Disclosure) and OWASP A06/A08.

---

## Pillar 2: Compliance Mapping

### OWASP Top 10 Checklist (`/oc-security owasp`)

For each OWASP category, assess the application's posture. Use web search to confirm
the current list (it updates every few years). Fallback if search is unavailable — the
2021 edition (current as of 2025):

A01: Broken Access Control · A02: Cryptographic Failures · A03: Injection ·
A04: Insecure Design · A05: Security Misconfiguration · A06: Vulnerable/Outdated
Components · A07: Identification and Authentication Failures · A08: Software and
Data Integrity Failures · A09: Security Logging and Monitoring Failures ·
A10: Server-Side Request Forgery (SSRF)

Status per category: ✅ PASS, ⚠️ PARTIAL, ❌ FAIL. See `references/output-templates.md`
for the assessment format.

### Framework Readiness (`/oc-security readiness [framework]`)

Supported: SOC2, ISO27001, HIPAA, PCI-DSS. Generate a gap analysis of applicable controls
vs. current state. See `references/output-templates.md` for format.

**Important:** This is readiness *mapping*, not certification. Always note that actual
compliance requires formal assessment by qualified auditors.

### Report Regeneration (`/oc-security report`)

Regenerates the posture report from the current checkpoint without re-running assessments.
Requires a checkpoint with at least one completed pillar. If no checkpoint exists,
redirects to `/oc-security posture`.

---

## Pillar 3: Runtime Hardening

### HTTP Security Headers (`/oc-security headers`)

Check the deployed application's response headers. If a URL is available, use web_fetch.
Otherwise, check the code for header-setting logic.

| Header | Secure Value | Why |
|---|---|---|
| `Content-Security-Policy` | Restrictive, no `unsafe-inline` | XSS mitigation |
| `Strict-Transport-Security` | `max-age=31536000; includeSubDomains; preload` | Force HTTPS |
| `X-Content-Type-Options` | `nosniff` | MIME sniffing prevention |
| `X-Frame-Options` | `DENY` or `SAMEORIGIN` | Clickjacking prevention |
| `Referrer-Policy` | `strict-origin-when-cross-origin` | Referrer leakage |
| `Permissions-Policy` | Restrict camera, microphone, geolocation | Feature control |
| `Cross-Origin-Opener-Policy` | `same-origin` | Spectre mitigation |
| `Cross-Origin-Resource-Policy` | `same-origin` or `same-site` | Resource isolation |

Score: X/8 headers configured correctly. Priority fix whichever has highest impact.

**Note:** `X-XSS-Protection` is intentionally excluded — it's deprecated and can introduce
vulnerabilities in older browsers. If present in a response, don't flag as a finding;
CSP supersedes it. If set, recommend `X-XSS-Protection: 0` to disable legacy behavior.

### TLS Configuration (`/oc-security tls`)

Check: TLS 1.2+ (1.3 preferred), certificate validity, cipher suite strength, HSTS
preload status. For edge-proxied sites (Cloudflare, Vercel), TLS is automatic — focus
on the platform-specific TLS settings instead.

### DNS Security (`/oc-security dns`)

Check: DNSSEC, CAA records, SPF/DKIM/DMARC (if domain sends email), no dangling CNAMEs
(subdomain takeover risk), no unintentional wildcard DNS.

### Platform-Specific Hardening (`/oc-security cloudflare`)

**Platform routing:** The checks below use Cloudflare as the default (matching the aidops
stack). For other platforms, adapt the equivalent controls:

| Category | Cloudflare | Vercel | AWS |
|---|---|---|---|
| Edge TLS | SSL/TLS settings | Automatic | ACM + CloudFront |
| WAF | Managed Rules (OWASP Core) | Vercel Firewall | AWS WAF |
| DDoS | Under Attack Mode | Automatic | Shield + CloudFront |
| Bot protection | Bot Management | Bot Protection | Bot Control |
| Rate limiting | Rate Limiting Rules | App-level | API Gateway throttling |

**Cloudflare-specific checks** (when applicable):

| Setting | Recommended | Why |
|---|---|---|
| SSL/TLS mode | Full (Strict) | Anything less allows MITM |
| Always Use HTTPS | On | Prevents HTTP downgrade |
| Minimum TLS Version | 1.2 | Block legacy clients |
| WAF Managed Rules | On (OWASP Core) | Base protection |
| Bot Fight Mode | On | Bot mitigation |
| Rate Limiting | Per-endpoint rules | DoS protection |
| Browser Integrity Check | On | Basic bot filter |
| Security Level | Medium+ | Challenge threshold |

**If Cloudflare MCP is connected:** Use it to read actual configuration. If not, check
`wrangler.toml` and advise on dashboard settings.

### Infrastructure Sweep (`/oc-security infra`)

Runs all runtime checks in sequence: headers → TLS → DNS → platform config →
detection/response → cross-reference with threat model if one exists.

**Pre-deployment projects:** If no live URL exists, skip runtime checks (headers, TLS,
DNS) and instead audit the *code* that sets these values — middleware, response headers
in source, wrangler.toml/vercel.json config. Flag missing header-setting code as findings
rather than testing live responses. Resume runtime checks after first deployment.

### Detection & Response Readiness

Every hardening sweep includes detection/response checks. Prevention fails eventually
(Principle 6: Assume Breach).

| Check | What to Look For |
|---|---|
| **Audit logging** | Auth events, data mutations, admin actions logged? |
| **Log integrity** | Append-only or shipped to immutable storage? |
| **Alerting** | Anomalous patterns (brute force, data exfil) alerted? |
| **Incident response** | Documented IR plan? Who's on-call? |
| **Backup & recovery** | Backups tested? RPO/RTO defined? |
| **Forensic readiness** | Can you reconstruct what happened? |

**Proportional thresholds:**

| Tier | Minimum Detection/Response |
|---|---|
| Lite (personal, non-sensitive) | Audit log on auth; manual backup |
| Standard (multi-user, sensitive) | Full audit log, error alerting, weekly backups |
| Comprehensive (public, regulated) | All six checks, tested IR plan, automated backups |

---

## Posture Assessment (`/oc-security posture`)

The full-stack assessment. Runs all three pillars and produces an executive report.

### Step 0: Scope & Classify

Before running checks, determine assessment depth. Use `ask_user_input`:

| Factor | Options |
|---|---|
| **Data sensitivity** | Public only · User PII · PHI/financial · Regulated |
| **Exposure** | Internal only · Authenticated users · Public-facing |
| **User scale** | Personal (1-2) · Small team (<50) · Production (50+) |

These determine the **assessment tier:**

| Tier | Criteria | What Runs |
|---|---|---|
| **Lite** | Personal, public data, 1-2 users | STRIDE overview, basic headers, skip compliance |
| **Standard** | User PII, authenticated, small team | Full STRIDE, OWASP Top 10, full hardening |
| **Comprehensive** | PHI/financial, public-facing, regulated | All pillars + framework readiness + detection/response |

Auto-detect from checkpoints when possible; confirm with user. Don't run Comprehensive
on a personal hobby app (Principle 7).

**Tier scope is advisory for `/oc-security posture` only.** Individual commands (`/oc-security
owasp`, `/oc-security headers`, etc.) always run at full depth regardless of tier — if the
user explicitly asks, deliver.

**Monorepo scoping:** For multi-app repos (like aidops-core), assess per-app — each app
has its own data sensitivity, attack surface, and tier. Shared infrastructure (single
Cloudflare account, shared D1 instance, common auth) gets assessed once and cross-referenced
by each app's report. Write one checkpoint per app, not one per repo.

### Process

1. **Gather context.** Read checkpoints: oc-reverse-spec, oc-app-architect, oc-code-auditor, oc-deploy-ops.

2. **Ensure code-level coverage.** If no oc-code-auditor checkpoint exists, invoke
   `/oc-audit security` first. Architecture-level assessment without code-level findings
   is incomplete.

3. **Run Pillar 1:** Threat model (STRIDE + attack surface + adversaries + data flow).

4. **Run Pillar 2:** OWASP Top 10 compliance. Add framework readiness for Comprehensive tier.

5. **Run Pillar 3:** Runtime hardening sweep including detection/response.

6. **Synthesize.** Cross-reference: do oc-code-auditor findings map to STRIDE categories?
   Do hardening gaps align with attack surface exposure? Flag anything in threat model
   not covered by code or infra controls.

7. **Produce the Posture Report.** See `references/output-templates.md` for format.

---

## Prioritization (`/oc-security prioritize`)

Takes all findings across pillars and produces a risk × effort matrix:

```
                 │ Small Effort │ Medium Effort │ Large Effort
─────────────────┼──────────────┼───────────────┼─────────────
CRITICAL Risk    │ DO NOW       │ DO NOW        │ PLAN NOW
HIGH Risk        │ DO NOW       │ PLAN NEXT     │ PLAN NEXT
MEDIUM Risk      │ QUICK WIN    │ BACKLOG       │ BACKLOG
LOW Risk         │ QUICK WIN    │ ACCEPT        │ ACCEPT
```

Output: Findings sorted into buckets with specific next actions.

---

## Posture Comparison (`/oc-security compare`)

Compares two posture snapshots to track improvement. Input: two dates or checkpoint paths.
If one argument, compares against current checkpoint. Diffs finding counts, OWASP score,
header score. Highlights regressions prominently. See `references/output-templates.md`
for format.

---

## Checkpoint Integration

### Location
`{project-dir}/.checkpoints/oc-security-auditor.checkpoint.json`

### When to Write

| Event | What to Save |
|---|---|
| Assessment started | Scope, tier (Lite/Standard/Comprehensive), project |
| Threat model complete | STRIDE findings, attack surface map, adversary profiles |
| OWASP check complete | Per-category status, overall score |
| Hardening sweep complete | Header scores, TLS/DNS status, platform config, detection/response |
| Posture report generated | Risk heatmap, finding count by risk, remediation plan |
| Finding addressed | Finding ID, verification status |

### skill_state

```json
{
  "scope": "posture",
  "tier": "standard",
  "pillar_status": {
    "threat_model": "complete",
    "compliance": "complete",
    "hardening": "in_progress"
  },
  "findings_total": 14,
  "findings_by_risk": { "CRITICAL": 0, "HIGH": 2, "MEDIUM": 8, "LOW": 4 },
  "owasp_score": "7/10",
  "header_score": "5/8",
  "detection_response_score": "3/6",
  "detection_response_applicable": 6,
  "remediation_plan_generated": true,
  "code_auditor_checkpoint_read": true
}
```

### Cross-Skill Reads

| Reads from | Why |
|---|---|
| oc-reverse-spec | Architecture, component inventory, data flows |
| oc-app-architect | Spec, auth design, data model |
| oc-code-auditor | Code-level security findings → cross-reference, don't duplicate |
| oc-deploy-ops | Deployment config, environment variables, platform settings |
| oc-stack-forge | Platform capabilities and limitations |

| Read by | Why |
|---|---|
| oc-deploy-ops | Posture grade → deployment gate (optional) |
| oc-code-auditor | Threat model → guide where to focus code sweeps |
| oc-app-architect | Security requirements → inform spec updates |
| oc-scale-ops | DoS findings → capacity planning input |

---

## PM-Tool MCP Integration (v1.2+)

Security findings have higher impact than code findings: they often
require coordinated remediation across teams + a paper trail for
audit. v1.2 routes `/oc-secaudit` output through the PM tool with
slightly different rules from `oc-code-auditor`. See
`oc-integrations-engineer` for the canonical PM-MCP patterns.

### Posture summary on the linked ticket

After every `/oc-secaudit` run, post a structured summary on the linked
PM ticket (if any):

```
Security audit: Posture grade {A-F}.
STRIDE findings: {C N, H N, M N, L N}
OWASP Top 10: {N FAIL, N PARTIAL, N PASS}
Top three (by exploitability × impact):
  1. {component} — {one-line finding}
  ...
Compliance lens: {SOC2 / HIPAA / CMMC / ISO mapping summary}
Full report: .checkpoints/oc-security-auditor.checkpoint.json
```

### CRITICAL findings as incident tickets

CRITICAL findings get the `incident` issue-type from
`.opchain/pm.yaml`, not `bug`:

- `priority`: highest tier.
- `labels`: `security`, `incident`, `severity:CRITICAL`,
  `compliance:<framework-if-relevant>`.
- `parent`: the source PR ticket if invoked from one; otherwise
  unparented.
- `assignee`: Security Lead from `.opchain/pm.yaml`
  `remediation_owners.security`.
- `body`: full finding + threat-model reference + suggested
  remediation + compliance-impact statement.

Why incident-typed: a CRITICAL security finding is treated as an
active operational concern, not a backlog bug. Incident-typed tickets
in most PM tools route to on-call workflows + status pages.

### HIGH findings as security sub-tickets

HIGH findings get filed as `bug`-typed sub-tickets parent-linked to
the source PR ticket, same shape as oc-code-auditor's HIGH+ pattern.
Labels include `security`, `severity:HIGH`, and the relevant OWASP
category.

### Compliance crosswalk artifacts

In regulated runs (SOC2, HIPAA, CMMC, FedRAMP) the crosswalk
artifact (mapping findings → compliance controls) is also attached
to the ticket as a comment + uploaded as a file attachment if the PM
tool supports it. The crosswalk is the auditor-facing artefact; the
PM ticket is the engineer-facing surface.

### Re-scan hygiene

`/oc-secaudit` re-runs check existing security tickets. A finding that
no longer reproduces gets a `oc-security-auditor verified clean in {sha}`
comment + transition to `done`. Regressions reopen the same ticket
rather than create duplicates.

### Cross-domain + regulated environments

In environments with the broker / redactor / cross-domain rules
described in scenarios `mcp-enterprise-f500` and
`mcp-enterprise-defense`, the oc-security-auditor's PM-MCP writes pass
through the same broker as every other tool call — same audit log,
same scope rules. The Security Lead role typically holds elevated
PM-MCP scope by design.

### Failure modes

- No linked ticket + CRITICAL finding → still file the incident
  ticket unparented; the gravity warrants a PM record even without
  context linkage.
- MCP unavailable → log to checkpoint as deferred; never block the
  audit on PM availability.
- BAA / DPA missing on the configured PM provider → refuse to write
  the body of compliance findings; only post the grade + count.

---

## Principles

1. **Architecture before code.** A perfectly secure function in a badly designed system
   is still insecure. Start with the threat model.
2. **Risk-based prioritization.** Not every finding needs a fix. Accept LOW risks with
   eyes open rather than creating an infinite backlog.
3. **Concrete remediation.** "Implement proper access control" is useless. "Add
   `requireAuth()` middleware to `/api/admin/*` routes" is actionable.
4. **Don't duplicate oc-code-auditor.** Code bugs are oc-code-auditor's job. Cross-reference;
   don't re-scan.
5. **Compliance ≠ security.** Passing a checklist doesn't mean secure. The threat model
   is the real assessment; compliance is the paper trail.
6. **Assume breach.** Include detection and containment, not just prevention.
7. **Proportional response.** Match security investment to data sensitivity and exposure.
   A hobby app doesn't need SOC2.
