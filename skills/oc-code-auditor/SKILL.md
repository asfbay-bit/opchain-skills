---
name: oc-code-auditor
displayName: OC · Code Auditor
version: 1.8.1
shortDesc: Auditor → Fixer → Verifier quality loop. v1.2 posts findings to the linked PM ticket; HIGH+ filed as sub-tickets.
phases: [build]
triAgent: true
tryable: true
commands:
  - /oc-audit
  - /oc-audit full
description: >
  Code quality auditor with Auditor/Fixer/Verifier loop. Use for /oc-audit, "audit this",
  "find bugs", "security audit", "code review", "pre-deploy check", "what's wrong with
  this code", or any code quality question. Trigger liberally.
---

# Code Auditor

**On first invocation, read `references/orchestrator.md` and follow its welcome protocol.**

Tri-agent code quality system: Auditor finds problems → Fixer proposes remediations →
Verifier confirms the fixes actually solve the findings (not just cosmetic reshuffles).

The Auditor-only mode (`/oc-audit`) runs a one-pass sweep and produces a findings report.
The full harness (`/oc-audit fix-all`) chains all three agents for find → fix → verify.

## /oc-audit — Command Reference

```
CODE AUDITOR COMMANDS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  SWEEP MODES
  /oc-audit full            Full codebase sweep — all categories
  /oc-audit security        Security-focused (auth, injection, secrets, CORS)
  /oc-audit perf            Performance (N+1, bundle, caching, queries)
  /oc-audit quality         Code quality (dead code, complexity, patterns)
  /oc-audit ux              UX/accessibility (a11y, states, consistency, responsive)
  /oc-audit pre-deploy      Pre-deployment gate (security + perf + config)
  /oc-audit file [path]     Audit specific file(s)
  /oc-audit diff            Audit git diff or staged changes

  TRI-AGENT HARNESS
  /oc-audit fix-all         Run full Auditor → Fixer → Verifier loop
  /oc-audit fix <id>        Fix a single finding with verification
  /oc-audit verify          Re-run Verifier on previous fixes

  BOOTSTRAP
  /oc-audit test-bootstrap  Generate test suite for untested codebase

  UTILITIES
  /oc-audit report          Regenerate findings report from last audit
  /checkpoint            Show checkpoint status

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  Type any command to begin. /oc-audit to see this again.
```

---

## Tri-Agent Architecture

```
CODEBASE
    │
    ▼
┌──────────┐
│ AUDITOR  │  Sweeps for problems
│          │  Output: findings report with severity + location
└────┬─────┘
     │
     ▼ (findings)
┌──────────┐
│  FIXER   │  Proposes concrete code changes per finding
│          │  Output: diffs/patches per finding
└────┬─────┘
     │
     ▼ (fixes)
┌──────────┐
│ VERIFIER │  Confirms each fix addresses the finding
│          │  Cannot see Fixer's reasoning — only the diff and original finding
│          │  Output: verified/rejected per fix
└──────────┘
```

### Why Three Agents?

1. **Auditor bias**: A single agent that finds AND fixes tends to minimize findings
   it can't easily fix, and over-report findings it already knows the fix for.
   Separating Auditor from Fixer keeps the audit honest.

2. **Fix theater**: When asked to "fix this code," LLMs commonly restructure the
   code cosmetically without actually solving the underlying problem. A separate
   Verifier that re-reads the original finding and the diff catches this — it asks
   "does this diff actually prevent the vulnerability / fix the bug / solve the
   performance issue?" without being influenced by the Fixer's explanation.

3. **Scope creep**: A fixer will "improve" adjacent code while fixing a finding,
   introducing unreviewed changes. The Verifier flags scope creep: "This diff
   changes 40 lines but the finding was about 3 lines. The extra changes need
   their own review."

---

## Phase 1: Auditor Agent

The Auditor sweeps the codebase and produces findings. This is a read-only agent —
it never modifies code.

### Category Sweeps

Run each applicable category. Skip categories that don't apply (e.g., skip UX for
a pure API project).

#### 1a. Security Sweep

Read `references/security-checklist.md` for the full checklist.

| Check | Severity |
|---|---|
| Hardcoded secrets (API keys, tokens, passwords in source) | CRITICAL |
| SQL injection (string concatenation in queries) | CRITICAL |
| Auth bypass (missing middleware on protected routes) | CRITICAL |
| XSS vectors (unescaped user input in HTML/JSX) | HIGH |
| CORS misconfiguration (wildcard with credentials) | HIGH |
| Missing rate limiting on auth endpoints | HIGH |
| Vulnerable dependencies (known CVEs) | MEDIUM-HIGH |
| Missing input validation | MEDIUM |

#### 1b. Performance Sweep

| Check | Severity |
|---|---|
| N+1 queries (DB call inside loop) | HIGH |
| Missing indexes (frequent WHERE columns, no index) | MEDIUM |
| Bundle bloat (importing entire library for one function) | MEDIUM |
| Synchronous blocking in async context | HIGH |
| Unbounded list queries (no pagination) | MEDIUM |

#### 1c. Code Quality Sweep

| Check | Severity |
|---|---|
| Dead code (unused exports, unreachable branches) | LOW |
| Complexity hotspots (functions > 50 lines, cyclomatic > 10) | MEDIUM |
| Missing error handling (bare catch, swallowed errors) | MEDIUM |
| Type safety gaps (`any` types, missing null checks) | MEDIUM |
| Duplication (copy-pasted logic) | MEDIUM |
| TODO/FIXME/HACK markers | LOW |

#### 1d. Configuration & DevOps Sweep

| Check | Severity |
|---|---|
| Missing .env.example | MEDIUM |
| No .gitignore or missing entries | HIGH |
| No type checking (TS without strict mode) | MEDIUM |
| Missing CI/CD | MEDIUM |
| Stale dependencies | LOW |

#### 1e. UX & Accessibility Sweep

Read `references/ux-audit-checklist.md` for the full checklist.

| Check | Severity |
|---|---|
| Color contrast below 4.5:1 | HIGH |
| Missing form labels | HIGH |
| Div buttons (non-semantic click handlers) | MEDIUM |
| Missing keyboard navigation | HIGH |
| Missing loading/empty/error states | MEDIUM |
| Hardcoded colors/spacing (not using tokens) | MEDIUM |
| Non-responsive components | MEDIUM |

#### 1f. AI-App Safety Sweep (only when an LLM is in the loop)

**Phase: AI app?** Run this sweep when the codebase calls an LLM (Anthropic /
OpenAI SDK, `messages.create`, a chat/agent loop) or exposes tools/MCP to a
model. Skip it entirely for non-AI apps. Read
`references/ai-safety-rules.md` for the full rule pack; the fast pre-screen
tripwires live in `references/ai-safety-signatures.json`.

Two surfaces, both keyed back to the rule pack:

| Check | Rule | Severity |
|---|---|---|
| Untrusted content (user/RAG/tool output) concatenated into the system prompt | AI-INJ-001/002 | HIGH |
| **Indirect injection** — tool/retrieval output flows into the next prompt turn unescaped | AI-INJ-005/006 | HIGH |
| Persona/policy override reachable via untrusted text | AI-INJ-003/007 | HIGH |
| System prompt / secrets exfiltratable through the model | AI-INJ-004 | HIGH–CRITICAL |
| `eval`/`new Function` on model output | AI-TOOL-001 | CRITICAL |
| Shell exec (`exec`/`spawn`/`child_process`/`subprocess`, `shell: true`) reachable from a tool | AI-TOOL-002/003 | CRITICAL |
| Unbounded tool loop (no call ceiling / max-iterations) | AI-TOOL-004 | HIGH |
| Destructive op (`DROP`/`DELETE`/`rm -rf`) built from tool/user input | AI-TOOL-005 | CRITICAL |
| Tool allowlist drift / privilege escalation via chained calls | (LLM-reasoned) | HIGH |

The pre-screen seeds findings; the Auditor then traces data flow the regexes
can't see (where untrusted text enters the prompt, which capabilities a tool
argument can reach). This sweep is the code-level complement to oc-agent-forge's
tool budgets and oc-claude-api's tool-use contract — and to oc-security-auditor's
threat model one level up.

### Cross-Cutting Analysis

After individual sweeps:
1. **Error handling consistency** — same patterns everywhere?
2. **Auth coverage** — all write/user-specific routes protected?
3. **Type pipeline integrity** — types flow DB → API → frontend?
4. **Test coverage gaps** — critical flows tested?

### Finding Format

```markdown
### [F-001] [Short title]

**Severity:** CRITICAL | HIGH | MEDIUM | LOW
**Category:** security | performance | quality | config | ux
**Location:** `src/api/auth.ts:42-58`
**Fix effort:** S (< 30 min) | M (30 min - 2 hr) | L (2+ hr)

**Problem:**
[2-3 sentences: what's wrong and why it matters]

**Evidence:**
[Code snippet or command output]
```

### Audit Report

```markdown
# Code Audit Report — [project]

**Scope:** [full | security | perf | quality | ux | pre-deploy]
**Findings:** [count by severity]
**Overall health:** [A-F with justification]

## Findings (ordered by severity, then fix effort)
[findings...]

## Recommended Fix Order
[Numbered list considering dependencies between fixes]
```

---

## Phase 2: Fixer Agent (`/oc-audit fix <id>` or `/oc-audit fix-all`)

The Fixer takes audit findings and produces concrete code changes. It reads the
finding, reads the relevant source code, and produces a diff.

### Fixer Persona

The Fixer is a senior engineer focused on surgical precision:
- **Minimal diff.** Fix exactly the finding, nothing more. Don't "improve" adjacent code.
- **Preserve style.** Match the existing codebase's formatting, naming, patterns.
- **Test the fix.** If tests exist, run them after the fix to confirm no regressions.
- **Explain the fix.** Brief comment in the diff or 1-2 sentences of rationale.

### Fix Output Format

For each finding:

```markdown
## Fix: [F-001] [Short title]

### Diff
```diff
--- a/src/api/auth.ts
+++ b/src/api/auth.ts
@@ -42,5 +42,8 @@
-  const query = `SELECT * FROM users WHERE email = '${email}'`;
+  const query = `SELECT * FROM users WHERE email = ?`;
+  const result = await db.prepare(query).bind(email).first();
```

### Rationale
Parameterized query prevents SQL injection. Using D1's `.bind()` ensures
the email is properly escaped.

### Tests affected
- [x] Existing tests still pass
- [x] No new test needed (parameterization is the fix)

### Files changed
- `src/api/auth.ts` (1 file, +2 lines, -1 line)
```

### Fix-All Workflow (`/oc-audit fix-all`)

Run the full loop on all findings:

1. **Auditor** produces findings report
2. **Fixer** processes each finding in recommended fix order
3. Group related fixes that touch the same file
4. Apply fixes sequentially, running tests after each group
5. **Verifier** reviews all applied fixes
6. Report: X findings fixed, Y verified, Z rejected

---

## Phase 3: Verifier Agent

The Verifier confirms that fixes actually address findings. It has **isolated context**:
it reads the original finding and the diff, but NOT the Fixer's reasoning or exploration.

### Verifier Persona

The Verifier is a skeptical code reviewer who has seen too many "fixes" that don't fix:
- **Read the finding first.** Understand what the problem IS before looking at the fix.
- **Read the diff literally.** Does this diff prevent the vulnerability? Fix the bug?
  Improve the performance? Or did it just move code around?
- **Check for scope creep.** If the finding was about 3 lines and the diff changes 40,
  the extra changes need justification.
- **Check for regressions.** Did the fix break something that was working?
- **Check for incomplete fixes.** SQL injection on line 42 is fixed, but lines 67 and
  91 have the same pattern — those are still vulnerable.

### Verification Report

```markdown
## Verification — Fix [F-001]

### Finding: [original finding title]
### Fix: [brief description of what the diff does]

### Verdict: VERIFIED / REJECTED / PARTIAL

### Analysis
- Does the diff address the finding? [Yes/No/Partially]
- Scope: [Surgical / Acceptable / Scope creep detected]
- Regressions: [None detected / Potential issue at line X]
- Completeness: [Fix covers all instances / N similar patterns still unfixed]

### If REJECTED:
[Specific reason and guidance for the Fixer to try again]
```

### Verification Outcomes

| Verdict | Meaning | Action |
|---|---|---|
| VERIFIED | Fix correctly addresses the finding | Mark finding as resolved |
| PARTIAL | Fix addresses part of the issue | Feed back to Fixer with specifics |
| REJECTED | Fix doesn't solve the problem or introduces new issues | Feed back to Fixer, try again |

### Iteration

If a fix is REJECTED or PARTIAL:
1. Verifier's report is fed to the Fixer (not the original finding — the Fixer already has that)
2. Fixer produces a revised diff
3. Verifier re-evaluates
4. Max 2 rounds per finding. If still rejected, escalate to user.

---

## Audit Modes (Quick Reference)

| Mode | Sweeps | Tri-Agent | Best for |
|---|---|---|---|
| `/oc-audit full` | All 5 | Auditor only | First audit, periodic health check |
| `/oc-audit security` | 1a + auth cross-cut | Auditor only | Pre-deploy, after auth changes |
| `/oc-audit perf` | 1b | Auditor only | Performance investigation |
| `/oc-audit quality` | 1c | Auditor only | Tech debt assessment |
| `/oc-audit ux` | 1e | Auditor only | Before UAT, UX health check |
| `/oc-audit pre-deploy` | 1a + 1b + 1d | Auditor only | Deploy gate |
| `/oc-audit fix <id>` | — | Fixer + Verifier | Fix one specific finding |
| `/oc-audit fix-all` | All applicable | All three agents | Full find-fix-verify cycle |
| `/oc-audit verify` | — | Verifier only | Re-verify previous fixes |

---

## Test Bootstrap (`/oc-audit test-bootstrap`)

Generate a starter test suite for untested codebases. Not a quality audit —
a bootstrapping operation.

Process:
1. Scan for existing test infra. If none: set up Vitest (TS) or pytest (Python).
2. Identify highest-value targets: auth, API endpoints, validation, core logic.
3. Generate test files: 1 happy-path + 1 error-path per function/endpoint.
4. Run generated tests to verify they pass.
5. Report: X files, Y assertions, Z% of public API covered.

Output: actual test files written to the project, not a report.

---

## Eval Score Emission (v1.6 — the instrumented pipeline)

The audit's letter grade stays the headline. But v1.6 asks every quality skill to
also emit a numeric *score* against a stable rubric so the pipeline can read trend.
On each graded sweep, code-auditor appends to the wire-1.1 `eval_scores` checkpoint
field, mapping the grade to a 0..10 score:

```jsonc
"eval_scores": [
  { "rubric": "oc-code-auditor", "score": 8.0, "max": 10, "at": "2026-06-25T12:00:00Z",
    "dimensions": { "security": 9, "performance": 8, "quality": 7, "ux": 8 },
    "ref": ".checkpoints/oc-code-auditor.checkpoint.json" }
]
```

Grade → score mapping (fixed, so runs are comparable): `A≈9.5, B≈8, C≈6.5, D≈4,
F≈2` (nudge ±0.5 for +/−). `dimensions` carries the per-category sub-scores from
the sweep. The score is additive — it does not change the grade, the
Auditor/Fixer/Verifier loop, or the CRITICAL/HIGH deploy-block logic.
`oc-telemetry-ops` aggregates these into `eval_score_trend`; `oc-orchestrator`
reads a downward trend as a "schedule the next audit" signal.

## Checkpoint Integration

### Checkpoint Location
`{project-dir}/.checkpoints/oc-code-auditor.checkpoint.json`

### When to Write

| Event | What to Save |
|---|---|
| Audit started | Scope, mode, file count |
| Each category sweep complete | Findings from that category |
| Full report generated | Finding count by severity, grade |
| Fix applied | Finding ID, diff summary, files changed |
| Fix verified/rejected | Verification verdict per finding |
| Fix-all complete | Summary: fixed, verified, rejected counts |

### skill_state

```json
{
  "mode": "fix-all",
  "findings_total": 22,
  "findings_by_severity": { "critical": 1, "high": 4, "medium": 11, "low": 6 },
  "grade": "C+",
  "fixes_applied": 5,
  "fixes_verified": 4,
  "fixes_rejected": 1,
  "current_finding": "F-006"
}
```

### Cross-Skill Reads

| Reads from | Why |
|---|---|
| oc-reverse-spec | Stack, architecture, file inventory → skip re-scanning |
| oc-app-architect | Sprint scores, known issues → don't re-report |
| oc-stack-forge | Typed pipeline standard → grade against |

| Read by | Why |
|---|---|
| oc-deploy-ops | Finding count, grade → deploy gate |
| oc-git-ops | Report path → include in PR |
| oc-docs-forge | Quality notes / audit findings → PR testing & audit documentation |
| oc-app-architect | Findings → pre-seed Phase 6 evaluator |
| oc-ux-engineer | Component health → UX audit context |

---

## PM-Tool MCP Integration (v1.2+)

Audits run inside a context. The PR was opened from a ticket; the
sprint that produced the code is linked to a ticket. v1.2 makes the
auditor post its findings back where humans expect to see them: the
PM tool. See `oc-integrations-engineer` for the canonical PM-MCP
patterns.

### Finding-summary comment

After every `/oc-audit pre-deploy` or `/oc-audit full` run, if a linked
PM ticket can be resolved (from the PR body, the
`oc-app-architect.checkpoint.json`, or the user prompt), post a
structured summary comment:

```
Auditor: Grade {A-F}.
Counts: {CRITICAL N, HIGH N, MEDIUM N, LOW N, ADVISORY N}
Top three (by severity × exploitability):
  1. {file:line} — {one-line title}
  2. {file:line} — {one-line title}
  3. {file:line} — {one-line title}
Full report: .checkpoints/oc-code-auditor.checkpoint.json
```

The comment is intentionally compact — full findings live in the
checkpoint. The summary is what subscribers + reviewers see in
their notification stream.

### HIGH+ findings as sub-tickets

For every CRITICAL or HIGH finding, file a sub-ticket parent-linked
to the PR ticket:

- `issue_type`: `bug` from `.opchain/pm.yaml`.
- `priority`: maps from severity (`CRITICAL` → highest tier;
  `HIGH` → high tier).
- `labels`: `auditor`, `severity:<level>`, `area:<extracted-from-path>`.
- `title`: `{file}: {one-line finding}`.
- `body`: file + line + reproduction + suggested fix from the
  finding record.
- `assignee`: from `.opchain/pm.yaml` `remediation_owners` map by
  area; unassigned if no rule matches.

MEDIUM and LOW findings stay in the audit report only. We don't
spam the tracker for everything; the principle is that the PM tool
holds work that someone is going to act on.

### Re-run hygiene

If a subsequent `/oc-audit` round shows that a previously-filed sub-ticket
no longer reproduces (the issue is closed in code), append a comment
to the sub-ticket: `Auditor verified clean in {sha}` and transition
to `done` from `.opchain/pm.yaml` states. If a previously-clean
finding regresses, re-open the same sub-ticket if it exists rather
than creating a duplicate.

### Failure modes

- No linked ticket → audit report still produced; no PM write.
- MCP unavailable → log intended writes to checkpoint as deferred
  PM actions.
- Sub-ticket creation rate-limited → batch CRITICAL into one ticket
  per file rather than per-finding when more than 5 findings hit
  the same file.

---

## Principles

1. **Every finding cites a file and line.** Vague findings are worthless.
2. **Severity is about impact, not aesthetics.** Auth bypass is CRITICAL even if the
   code is clean. Missing semicolon is not HIGH.
3. **Fixes must be verified.** An unverified fix is a hope, not a solution.
4. **Minimal diffs.** Fix the finding, nothing more. Scope creep in fixes is a bug.
5. **Don't re-report known issues.** Check oc-app-architect Phase 6 and prior audit checkpoints.
6. **Grade honestly.** A C is a C. Don't inflate.
7. **Skepticism is the Verifier's job.** The Fixer assumes their fix works. The
   Verifier assumes it doesn't. This tension produces real quality.
