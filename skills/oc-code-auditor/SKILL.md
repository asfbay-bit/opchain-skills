---
name: oc-code-auditor
displayName: OC · Code Auditor
version: 1.9.0
license: Apache-2.0
shortDesc: Auditor → Fixer → Verifier quality loop. v1.2 posts findings to the linked PM ticket; HIGH+ filed as sub-tickets.
phases: [build]
triAgent: true
tryable: true
commands:
  - /oc-audit
  - /oc-audit full
  - /oc-audit security
  - /oc-audit perf
  - /oc-audit ux
  - /oc-audit pre-deploy
  - /oc-audit quality
  - /oc-audit file
  - /oc-audit diff
  - /oc-audit fix-all
  - /oc-audit fix
  - /oc-audit verify
  - /oc-audit test-bootstrap
  - /oc-audit report
description: >
  Code quality auditor with Auditor/Fixer/Verifier loop. Use for /oc-audit, "audit this",
  "find bugs", "code review", "pre-deploy check", "what's wrong with this code", or any
  code-level quality question. For fast pre-commit checks, escalate to oc-bug-check. For
  architecture- or infra-level security, escalate to oc-security-auditor.
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
│          │  Grades from the diff and original finding only, not the Fixer's rationale
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
**Category:** security | performance | quality | config | ux | ai-safety
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

**Scope:** [full (incl. 1f if LLM) | security | perf | quality | ux | pre-deploy]
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

The Verifier confirms that fixes actually address findings. All three roles run in the
same session, so its separation is a discipline, not a mechanism: grade from the
original finding and the diff alone — skip the fix document's `### Rationale` block and
do not re-read the Fixer's exploration notes.

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
| `/oc-audit full` | All 6 (1f only when an LLM is in the loop) | Auditor only | First audit, periodic health check |
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
   If `.opchain/qa.yaml` exists (oc-qa-ops), take targets and levels from its
   pyramid and honor `coverage.overrides` exemptions instead of inventing
   priorities (v1.9).
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

The shared checkpoint schema, write rules and resume protocol live in
`references/checkpoint-protocol.md`, bundled with this skill. This section adds only
what is specific to oc-code-auditor.

### Checkpoint Location
`{project-dir}/.checkpoints/oc-code-auditor.checkpoint.json`

### When to Write

| Event | What to Save |
|---|---|
| Audit started | Scope, mode, file count |
| Each category sweep complete | Findings from that category |
| Full report generated | Finding count by severity, grade — grade + counts restated in `progress_summary` (e.g. "Grade C+; 1 CRITICAL, 4 HIGH open"); trend score in `eval_scores`. Those are the fields sibling skills read |
| Fix applied | Finding ID, diff summary, files changed |
| Fix verified/rejected | Verification verdict per finding |
| Fix-all complete | Summary: fixed, verified, rejected counts |

**Never close over open findings.** Do not set `status: complete` while any CRITICAL or
HIGH finding is unresolved: set `skill_state.loop_state` to `open` and put the next fix
in `next_actions[0]`. `loop_state` is `open`, `closed` (every CRITICAL/HIGH verified), or
`abandoned` (the user stopped the loop; say so in `progress_summary`).

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
  "current_finding": "F-006",
  "loop_state": "open"
}
```

### Cross-Skill Reads

| Reads from | Why |
|---|---|
| oc-reverse-spec | Stack, architecture, file inventory → skip re-scanning |
| oc-app-architect | Sprint scores, known issues → don't re-report |
| oc-stack-forge | Typed pipeline standard → grade against |
| oc-qa-ops | `.opchain/qa.yaml` pyramid targets (when present) → test-bootstrap levels |

| Read by | Why |
|---|---|
| oc-deploy-ops | Grade + counts in `progress_summary` (trend score in `eval_scores`) → deploy gate |
| oc-git-ops | Grade + counts (`progress_summary`) → include in PR |
| oc-docs-forge | Quality notes / audit findings → PR testing & audit documentation |
| oc-app-architect | Grade + counts (`progress_summary`); individual findings come from the audit report, which is conversation output with no committed path → pre-seed Phase 6 evaluator |
| oc-ux-engineer | Component health → UX audit context |
| oc-security-hardening | Findings whose fix is a declarative, verifiable control (header, limit, policy) — mark them `route: oc-security-hardening` in the findings report so `/oc-harden fix` executes them and records the manifest entry; the Fixer keeps application-logic fixes (v1.9) |
| oc-qa-ops | Findings + test-bootstrap output feed `/oc-qa audit`'s gap analysis (v1.9) |
| oc-security-auditor | Grade + counts → cross-reference, don't duplicate; individual findings from the report or PM sub-tickets |
| oc-bug-check | Grade + counts → context for what an audit already flagged (per-finding detail is not in the checkpoint) |
| oc-scale-ops | Performance findings → pre-identified bottlenecks |
| oc-monitoring-ops | Error-handling gaps → logging instrumentation needs |
| oc-migration-ops | Pre-existing findings → don't introduce new issues during a migration |
| oc-modularize-ops | Coupling hotspots → natural seams |
| oc-cost-ops | Which phase an audit run belongs to, for cost attribution |

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
Counts + grade: .checkpoints/oc-code-auditor.checkpoint.json
```

The comment is intentionally compact — the checkpoint carries counts and
the grade, not individual findings; the full findings are the audit report
itself and the HIGH+ sub-tickets below. The summary is what subscribers +
reviewers see in their notification stream.

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
- `assignee`: unassigned, unless `remediation_owners` is set in
  `.opchain/pm.yaml` (an optional owner map by area — see oc-integrations-engineer's
  pm.yaml example); then use the matching area's owner.
- Append each sub-ticket to the checkpoint's top-level `pm_refs`
  (`role: child`, `created_by_skill: oc-code-auditor`) in the same write,
  per the bundled checkpoint protocol's `pm_refs` section.

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
- MCP unavailable → log intended writes to the checkpoint's top-level
  `pm_deferred_actions[]`, per
  `oc-integrations-engineer/references/pm-mcp-protocol.md` §4.
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
