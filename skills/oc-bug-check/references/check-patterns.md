# Check Patterns Reference

Detailed patterns, false positive handling, and stack-specific adaptations for each
oc-bug-check check. The SKILL.md describes WHAT is checked; this file provides the
implementation details and edge cases.

---

## Anti-Pattern Detection (Check 4)

### Pattern: console.log in Production Code

**Grep:**
```bash
grep -rn "console\.log\b" --include="*.ts" --include="*.tsx" \
  --exclude-dir=test --exclude-dir=__tests__ --exclude-dir=node_modules \
  --exclude-dir=scripts --exclude="*.test.*" --exclude="*.spec.*" src/
```

**False positives to exclude:**
- Logger implementations (files named `logger.ts`, `log.ts`)
- Intentional structured logging via `console.log(JSON.stringify(...))`
- Comments containing `console.log`

**Detection heuristic:** If the line contains `JSON.stringify` within the same
`console.log` call, it's likely structured logging — downgrade to PASS. If the
file is named `logger.*` or `logging.*`, skip it.

```bash
# Refined: exclude structured logging and logger files
grep -rn "console\.log\b" --include="*.ts" --include="*.tsx" \
  --exclude-dir=test --exclude-dir=__tests__ --exclude-dir=node_modules \
  --exclude="logger.*" --exclude="*.test.*" src/ \
  | grep -v "JSON.stringify" \
  | grep -v "^[^:]*:[^:]*://.*console"  # exclude comments
```

### Pattern: debugger Statement

```bash
grep -rn "\bdebugger\b" --include="*.ts" --include="*.tsx" --include="*.js" \
  --exclude-dir=node_modules .
```

**Always FAIL.** No false positives — `debugger` has no legitimate production use.

### Pattern: .only in Tests

```bash
grep -rn "\.\(only\|skip\)\b" --include="*.test.*" --include="*.spec.*" \
  --exclude-dir=node_modules .
```

`.only` always FAIL (silently skips other tests). `.skip` gets WARN (intentional
test suppression should be temporary).

### Pattern: Explicit any

```bash
grep -rn ": any\b\|as any\b\|<any>" --include="*.ts" --include="*.tsx" \
  --exclude-dir=node_modules --exclude="*.d.ts" --exclude="*.test.*" src/
```

**False positives:**
- Type assertion on catch blocks: `catch (e: any)` — this is sometimes necessary.
  Downgrade to PASS if the catch block actually uses `e` (not swallowed).
- Generated files (`.d.ts`, codegen output) — already excluded.

### Pattern: @ts-ignore / @ts-nocheck

```bash
grep -rn "@ts-ignore\|@ts-nocheck\|@ts-expect-error" --include="*.ts" --include="*.tsx" \
  --exclude-dir=node_modules src/
```

`@ts-expect-error` is slightly better than `@ts-ignore` (it fails if the error goes
away), but both suppress type checking. WARN for all three.

### Pattern: Empty Catch Blocks

```bash
# Single-line empty catch
grep -rn "catch\s*(.*)\s*{\s*}" --include="*.ts" --include="*.tsx" \
  --exclude-dir=node_modules src/

# Multi-line empty catch (harder to grep — check for catch followed by } with only whitespace)
```

**False positive:** `catch {}` when the intent is explicitly "swallow this error" (e.g.,
optional cleanup that shouldn't crash the app). If a comment explains why, downgrade
to PASS.

### Pattern: TODO/FIXME/HACK in Changed Code

```bash
# Only check files in the current diff, not the entire codebase
git diff --cached --name-only | xargs grep -Hn "TODO\|FIXME\|HACK\|XXX" 2>/dev/null
```

WARN only. TODOs in existing code are acceptable tech debt. TODOs in *new code* you're
about to commit suggest incomplete work.

---

## Secret Detection (Check 5)

### Primary Patterns

```bash
# Generic secret patterns (API keys, tokens, passwords)
grep -rn --include="*.ts" --include="*.tsx" --include="*.js" --include="*.json" \
  --include="*.yaml" --include="*.yml" --include="*.toml" \
  -E "(api[_-]?key|secret|password|token|credential|auth).*['\"][A-Za-z0-9+/=_-]{16,}['\"]" \
  --exclude-dir=node_modules --exclude=".env*" --exclude="*.example" .
```

### Service-Specific Patterns

| Service | Pattern | Example |
|---|---|---|
| AWS | `AKIA[0-9A-Z]{16}` | `AKIAIOSFODNN7EXAMPLE` |
| GitHub PAT | `ghp_[A-Za-z0-9]{36}` | `ghp_xxxxxxxxxxxx` |
| GitHub OAuth | `gho_[A-Za-z0-9]{36}` | `gho_xxxxxxxxxxxx` |
| Stripe (live) | `sk_live_[A-Za-z0-9]{24,}` | `sk_live_xxx` |
| Stripe (publishable) | `pk_live_[A-Za-z0-9]{24,}` | `pk_live_xxx` |
| Sentry DSN | `https://[a-f0-9]+@[^/]+/[0-9]+` | `https://abc@sentry.io/123` |
| Telegram bot | `[0-9]+:AA[A-Za-z0-9_-]{33}` | `123456:AAxxxx` |
| Private keys | `BEGIN (RSA\|EC\|DSA )?PRIVATE KEY` | PEM blocks |
| OpenAI | `sk-[A-Za-z0-9]{20,}` | `sk-xxx` |

### False Positive Handling

Reduce noise from common non-secret patterns:

```bash
# Exclude example/template files
--exclude="*.example" --exclude="*.template" --exclude="*.sample"

# Exclude .env files (they're gitignored, not committed)
--exclude=".env*"

# Exclude lock files
--exclude="package-lock.json" --exclude="pnpm-lock.yaml"
```

**Do NOT exclude test files from secret scanning.** A hardcoded API key in a test
fixture is still a committed secret. Use environment variables or mock values in tests.

**When in doubt, FAIL.** False positive on secrets → minor annoyance. False negative
on secrets → security incident. The cost is asymmetric.

---

## Dependency Vulnerability Scan (Check 7)

### Node.js

```bash
# npm audit with JSON output for parsing
npm audit --json 2>/dev/null | python3 -c "
import json, sys
try:
    data = json.load(sys.stdin)
    vulns = data.get('vulnerabilities', {})
    critical = sum(1 for v in vulns.values() if v.get('severity') == 'critical')
    high = sum(1 for v in vulns.values() if v.get('severity') == 'high')
    moderate = sum(1 for v in vulns.values() if v.get('severity') == 'moderate')
    print(f'critical:{critical} high:{high} moderate:{moderate}')
    for name, info in sorted(vulns.items(),
        key=lambda x: {'critical':0,'high':1,'moderate':2,'low':3}.get(x[1].get('severity','low'), 4)):
        sev = info.get('severity', '?')
        if sev in ('critical', 'high'):
            via = info.get('via', [{}])
            title = via[0].get('title', '?') if isinstance(via[0], dict) else str(via[0])
            print(f'  {sev}: {name} — {title}')
except Exception as e:
    print(f'audit_parse_error: {e}')
"
```

### Python

```bash
# pip-audit (if installed)
pip-audit --format=json 2>/dev/null || echo "pip-audit not available — install with: pip install pip-audit"

# Safety (alternative)
safety check --json 2>/dev/null
```

### Verdict Logic

| Severity | Verdict |
|---|---|
| Critical | FAIL |
| High | WARN (configurable to FAIL in strict mode) |
| Moderate | PASS (logged, not surfaced) |
| Low | PASS (ignored) |

---

## Build Verification (Check 6)

### Build Command Detection

```bash
# Read build command from package.json
BUILD_CMD=$(node -e "try{console.log(JSON.parse(require('fs').readFileSync('package.json')).scripts.build||'')}catch{}" 2>/dev/null)

if [[ -n "$BUILD_CMD" ]]; then
  npm run build 2>&1
else
  echo "No build script detected — skipping build check"
fi
```

### Common Build Failures

| Failure | Cause | Fix |
|---|---|---|
| Module not found | Missing dependency or wrong import path | `npm install` or fix import |
| Out of memory | Large build, insufficient heap | `NODE_OPTIONS=--max_old_space_size=4096` |
| TypeScript errors | Same as Check 1 — but build mode may catch different config | Fix type errors |
| Asset resolution | Missing image/font/file referenced in code | Add asset or fix path |

---

## Scope Detection

### Determining Changed Files

```bash
# Priority order for detecting scope:
# 1. Staged files (about to be committed)
git diff --cached --name-only --diff-filter=ACMR 2>/dev/null

# 2. Unstaged changes (working directory)
git diff --name-only --diff-filter=ACMR 2>/dev/null

# 3. Since last commit (if no staged/unstaged)
git diff HEAD~1 --name-only --diff-filter=ACMR 2>/dev/null

# 4. Fallback: all files (new repo, no commits)
find src/ -name "*.ts" -o -name "*.tsx" 2>/dev/null
```

### File Type Filtering

Only check relevant files — don't lint images or scan fonts for secrets:

```bash
# Source files (for lint, types, anti-patterns)
grep -E '\.(ts|tsx|js|jsx|py|go|rs)$'

# Config files (for secrets only)
grep -E '\.(json|yaml|yml|toml|env)$'

# Exclude always
grep -v -E '(node_modules|dist|build|\.next|coverage|\.git)/'
```

---

## Timing Budget

Target: <2 minutes total. If any check exceeds its budget, log the overage in
the checkpoint for config tuning.

| Check | Budget | Typical |
|---|---|---|
| Type safety | 30s | 5-15s |
| Lint | 15s | 2-8s |
| Tests | 45s | 5-30s |
| Anti-patterns | 5s | <1s |
| Secrets | 5s | <1s |
| Build | 30s | 10-20s |
| Dependencies | 10s | 3-5s |
| **Total** | **140s** | **30-80s** |

If tests exceed 45s, suggest to the user: "Test suite is slow (Xs). Consider splitting
into fast unit tests (run on every commit) and slow integration tests (run on PR only)."
