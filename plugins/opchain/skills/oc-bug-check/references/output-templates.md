# Output Templates

Report formats for oc-bug-check gate verdicts, reports, and history.

---

## Gate Verdict: PASS

```
BUG CHECK — PASS ✅
━━━━━━━━━━━━━━━━━━━━
  7 checks passed (1.2s)
  Proceeding to commit.
```

Minimal output. Silence is the goal for a passing gate.

If streak is active and >5:

```
BUG CHECK — PASS ✅  (streak: 12 🔥)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  7 checks passed (0.9s)
```

---

## Gate Verdict: WARN

```
BUG CHECK — PASS with warnings ⚠️
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  ⚠️ Anti-patterns:
     src/routes/users.ts:14 — console.log (debug artifact)
     src/lib/utils.ts:28 — console.log (debug artifact)

  ⚠️ Dependencies:
     lodash: high severity vulnerability (CVE-2024-xxxxx)
     Run `npm audit fix` to resolve.

  5 PASS, 2 WARN. Proceeding to commit.
  Run /oc-bugcheck fix to auto-resolve fixable warnings.
```

---

## Gate Verdict: FAIL

```
BUG CHECK — FAIL ❌
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  ❌ Type Safety (3 errors)
     src/routes/users.ts:14:5
       Type 'string' is not assignable to type 'number'
     src/lib/auth.ts:28:10
       Property 'userId' does not exist on type 'Session'
     src/db/schema.ts:42:1
       Cannot find module 'drizzle-orm/sqlite-core'

  ❌ Tests (2 failing)
     ✗ GET /api/users — expected 200, got 500
       AssertionError: expected status 200, received 500
       at tests/users.test.ts:24:5
     ✗ auth middleware — session validation
       Error: Invalid token format
       at tests/auth.test.ts:18:3

  ❌ Secrets (1 detected)
     src/config.ts:8 — possible Stripe key: sk_live_...
     ⚠️ Rotate this key immediately if it was ever committed.

  Commit blocked. Fix 6 issues before committing.
  Run /oc-bugcheck fix for auto-fixable items (lint, formatting).
  Run /oc-bugcheck bypass to override (logged).
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

---

## Gate Verdict: BYPASS

```
BUG CHECK — BYPASSED ⏩
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  Bypassed checks: type_safety (3 errors), tests (2 failing)
  Reason: WIP — types incomplete, will fix in next commit

  Commit proceeding with [BYPASS] prefix.
  These issues are now carried debt — they'll surface on every
  subsequent /oc-bugcheck until resolved.

  Carried debt: 5 issues across 2 checks
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

---

## Report (`/oc-bugcheck report`)

```
BUG CHECK REPORT — [project]
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  Mode:          lenient
  Last run:      2 min ago — PASS ✅
  Duration:      0.9s
  Streak:        12 clean commits 🔥
  Best streak:   23 (set 2026-04-10)
  Carried debt:  0

  Per-Check Results (last run):
    ✅ Type safety     0 errors
    ✅ Lint             0 errors, 0 warnings
    ✅ Tests            42 passed, 0 failed
    ⚠️ Anti-patterns    2 warnings (console.log)
    ✅ Secrets          clean
    ✅ Build            success (2.1s)
    ✅ Dependencies     0 critical, 0 high

  Recent History (last 10):
    ✅ ✅ ✅ ❌ ✅ ✅ ✅ ⚠️ ✅ ✅

  Failure Patterns:
    Most common: type_safety (3 of last 20 failures)
    Auto-fix rate: 60% of warnings resolved by /oc-bugcheck fix
    Avg duration: 1.1s
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

---

## Carried Debt Display

When bypassed issues exist, every subsequent run shows them:

```
BUG CHECK — PASS ✅ (but 3 issues carried from bypass)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  7 checks passed on current changes (0.8s)

  ⚠️ Carried debt from bypass on 2026-04-22:
     - 2 type errors in src/lib/auth.ts
     - 1 failing test: auth middleware validation

  Resolve these to clear the debt counter.
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

---

## Config Display (`/oc-bugcheck config`)

```
BUG CHECK CONFIG — [project]
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  Mode: lenient
  Scope: changed files only
  Auto-fix on fail: no

  Check Configuration:
    type_safety     ON    fails → FAIL
    lint            ON    errors → FAIL, warnings → WARN
    tests           ON    failures → FAIL, no tests → WARN
    anti_patterns   ON    debugger/.only → FAIL, others → WARN
    secrets         ON    always → FAIL (not configurable)
    build           ON    fails → FAIL
    dependencies    ON    critical → FAIL, high → WARN

  Source: .bugcheck.json
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

---

## Finding Format

Bug-check findings are ephemeral — they're per-run, not persisted findings like
oc-code-auditor (F-) or oc-security-auditor (SA-). They don't get IDs because they're
resolved by fixing the code and re-running, not by tracking them across sessions.

Format per finding:

```
  ❌ [Check Name] ([count] [errors/warnings])
     [file]:[line]:[col]
       [message]
     [file]:[line]:[col]
       [message]
```

For auto-fixable findings, append:

```
     ↳ Auto-fixable: run /oc-bugcheck fix
```
