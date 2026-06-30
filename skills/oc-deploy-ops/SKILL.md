---
name: oc-deploy-ops
displayName: OC · Deploy Ops
version: 1.7.0
shortDesc: Audit gate → staging → production → monitor. v1.2 creates deploy tickets and updates linked PM tickets per env.
phases: [build]
triAgent: false
tryable: true
commands:
  - /oc-deploy
  - /oc-deploy staging
  - /oc-deploy audit
description: >
  Deployment pipeline: audit gate → staging → production → monitoring. Use for
  /oc-deploy, "deploy this", "ship it", "push to production", "staging", "rollback",
  "health check", or any deployment task. Trigger liberally.
---

# Deploy Ops

**On first invocation, read `references/orchestrator.md` and follow its welcome protocol.**

Orchestrate the full deployment lifecycle: pre-deploy quality gate → staging deploy →
smoke test → production promotion → health check → rollback if needed. Built for
Cloudflare Workers + D1 + Pages, with the aidops-core monorepo as the primary target.

## /oc-deploy — Command Reference

When the user types `/oc-deploy`, display this menu:

```
DEPLOY OPS COMMANDS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  PIPELINE
  /oc-deploy staging    Deploy to staging environment
  /oc-deploy prod       Promote staging to production (or direct deploy)
  /oc-deploy rollback   Revert to previous production version
  /oc-deploy status     Show current deployment state

  GATES
  /oc-deploy audit      Run pre-deploy audit (calls oc-code-auditor)
  /oc-deploy smoke      Run post-deploy smoke tests
  /oc-deploy health     Check production health

  SETUP
  /oc-deploy init       Set up deployment config for a project
  /oc-deploy env        Manage environment variables and secrets

  UTILITIES
  /checkpoint        Show checkpoint status

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  Type any command to begin. /oc-deploy to see this again.
```

---

## How This Skill Works

```
CODE (committed)
    │
    ▼
┌────────────┐     FAIL → block
│ Pre-deploy │─────────────────► Fix issues first
│ audit gate │
└─────┬──────┘
      │ PASS
      ▼
┌────────────┐
│  Staging   │──► smoke tests ──► FAIL → fix + redeploy
│  deploy    │
└─────┬──────┘
      │ PASS
      ▼
┌────────────┐
│ Production │──► health check ──► FAIL → auto-rollback
│  promote   │
└─────┬──────┘
      │ PASS
      ▼
  Monitoring
  (ongoing)
```

---

## Phase 0: Setup (/oc-deploy init)

### Project Detection

Read the project's config to determine the deployment target:

```bash
# Check for wrangler.toml (Cloudflare Workers)
[[ -f wrangler.toml ]] && echo "Cloudflare Workers project detected"

# Check for Pages config
grep -q "pages" wrangler.toml 2>/dev/null && echo "Pages deployment detected"

# Check for existing deploy scripts
grep -q '"deploy"' package.json 2>/dev/null && echo "Deploy script found in package.json"
```

### Deploy Config

Create or update `.oc-deploy-ops.json`:

```json
{
  "project_name": "gtrack",
  "platform": "cloudflare-workers",
  "monorepo": true,
  "monorepo_root": "/home/claude/aidops-core",
  "app_path": "apps/gtrack",

  "environments": {
    "staging": {
      "wrangler_env": "staging",
      "d1_database": "gtrack-staging",
      "url": "https://gtrack-staging.aidops.workers.dev",
      "auto_deploy_branch": "staging"
    },
    "production": {
      "wrangler_env": null,
      "d1_database": "gtrack-prod",
      "url": "https://gtrack.aidops.workers.dev",
      "auto_deploy_branch": "main"
    }
  },

  "deploy_order": [
    "migrate",
    "deploy-api",
    "deploy-frontend"
  ],

  "smoke_tests": [
    { "name": "API health", "url": "/api/health", "expect_status": 200 },
    { "name": "Auth endpoint", "url": "/api/auth/status", "expect_status": 401 },
    { "name": "Frontend loads", "url": "/", "expect_contains": "<html" }
  ],

  "rollback": {
    "strategy": "wrangler-rollback",
    "keep_versions": 3
  }
}
```

### First-Time Setup Checklist

1. **Detect platform** from config files
2. **Check auth** — `wrangler whoami` or CF API token in env
3. **Check environments** — staging/prod wrangler.toml configured?
4. **Check D1 databases** — staging and prod DBs exist?
5. **Generate .oc-deploy-ops.json** — ask user to confirm/adjust
6. **Verify deploy works** — dry-run `wrangler deploy --dry-run`
7. **Set up smoke test URLs** — derive from wrangler.toml routes

---

## Pre-Deploy Audit Gate (/oc-deploy audit)

Before any deploy, run **two** audits in order: oc-code-auditor (code-level
findings) then oc-security-auditor (architecture / hardening / threat
model). Both must pass for `/oc-deploy staging` and `/oc-deploy prod` to
proceed.

### 1. oc-code-auditor — code-level gate

```bash
# Reuse the existing checkpoint if it's recent
node scripts/checkpoint.mjs status oc-code-auditor
# If updated_at < 1h old, reuse. Otherwise:
#   Skill(skill="oc-code-auditor", args="/oc-audit pre-deploy")
```

### 2. oc-security-auditor — posture gate

Code-auditor finds SQLi and hardcoded secrets; oc-security-auditor asks
"what's the threat model?" and "is the infra hardened?". Run it
before the first production deploy and any time the surface area
changes (new auth flow, new public endpoint, new third-party
integration).

```bash
node scripts/checkpoint.mjs status oc-security-auditor
# Reuse if updated_at < 24h old AND no high-impact changes since.
# Otherwise:
#   Skill(skill="oc-security-auditor", args="/oc-security pre-deploy")
```

### Gate Rules

| Audit Result | Deploy Decision |
|---|---|
| No CRITICAL findings (both audits) | ✅ Proceed |
| CRITICAL findings exist (either audit) | 🚫 Block — must fix before deploy |
| HIGH findings (≤ 3 total) | ⚠️ Warn — proceed with user confirmation |
| HIGH findings (> 3 total) | 🚫 Block — too many unresolved issues |
| No audit run | ⚠️ Warn — suggest running both audits first |

When blocked, show the specific findings and fix commands. When warned, list
the findings and ask for explicit confirmation before proceeding.

---

## Staging Deploy (/oc-deploy staging)

### Deploy Sequence (Cloudflare Workers + D1)

```bash
cd <project-dir>

# 1. Pre-flight
npm ci
npx tsc --noEmit          # Type check — fail fast
npx vitest run            # Tests — fail fast

# 2. Migrate (staging DB)
npx wrangler d1 migrations apply <staging-db> --remote --env staging

# 3. Deploy Worker (staging)
npx wrangler deploy --env staging

# 4. Deploy Pages frontend (if applicable)
if [[ -d frontend ]]; then
  cd frontend && npm ci && npm run build
  npx wrangler pages deploy dist --project-name=<project>-staging
  cd ..
fi

# 5. Smoke tests (immediate)
```

### Monorepo Deploy (aidops-core)

For the aidops monorepo with the deploy API:

```bash
curl -X POST "https://oc-deploy.aidops.workers.dev/deploy" \
  -H "Authorization: Bearer <deploy-token>" \
  -H "Content-Type: application/json" \
  -d '{"app": "<app-name>", "env": "staging"}'
```

Fallback to direct wrangler if deploy API isn't available.

### Post-Staging Smoke Tests (/oc-deploy smoke)

Run immediately after staging deploy:

```bash
STAGING_URL="<staging-url>"
PASS=0; FAIL=0

run_smoke() {
  local name="$1" url="$2" expect="$3"
  local status=$(curl -s -o /dev/null -w "%{http_code}" --max-time 5 "${STAGING_URL}${url}")
  if [[ "$status" == "$expect" ]]; then
    echo "  ✅ $name: $status"; ((PASS++))
  else
    echo "  ❌ $name: $status (expected $expect)"; ((FAIL++))
  fi
}

echo "Smoke tests: $STAGING_URL"
run_smoke "API health"     "/api/health"      "200"
run_smoke "Auth guard"     "/api/auth/status"  "401"

# Content check
BODY=$(curl -s "${STAGING_URL}/")
echo "$BODY" | grep -q "<html" && { echo "  ✅ Frontend loads"; ((PASS++)); } || { echo "  ❌ Frontend missing"; ((FAIL++)); }

echo "Result: $PASS passed, $FAIL failed"
[[ $FAIL -eq 0 ]] && echo "Ready for production." || echo "Fix failures before promoting."
```

---

## Production Promotion (/oc-deploy prod)

### Pre-Promotion Checklist

1. Staging smoke tests passed (read checkpoint)
2. Code audit clear (no CRITICAL)
3. User explicitly confirms

Always ask before production deploy — never auto-promote.

### Deploy Sequence

```bash
cd <project-dir>
git checkout main && git pull origin main

# Record current version for rollback
PREV_VERSION=$(npx wrangler deployments list --json 2>/dev/null | \
  python3 -c "import json,sys;d=json.load(sys.stdin);print(d[0]['id'] if d else 'unknown')")

# Migrate → Deploy → Smoke (same as staging but against prod)
npx wrangler d1 migrations apply <prod-db> --remote
npx wrangler deploy

# Run health check
```

### Post-Deploy Health (/oc-deploy health)

```bash
PROD_URL="<production-url>"
STATUS=$(curl -s -o /dev/null -w "%{http_code}" --max-time 5 "$PROD_URL/api/health")
LATENCY=$(curl -s -o /dev/null -w "%{time_total}" --max-time 5 "$PROD_URL/api/health")

echo "Production: $STATUS (${LATENCY}s)"

[[ "$STATUS" != "200" ]] && echo "❌ UNHEALTHY — consider rollback"
(( $(echo "$LATENCY > 2.0" | bc -l 2>/dev/null) )) && echo "⚠️ High latency"
```

### Hand off to oc-monitoring-ops

After a successful production promotion, **invoke oc-monitoring-ops** to
verify post-deploy observability (uptime checks, error tracking,
SLO/SLI alarms). Deploy-ops ships it; oc-monitoring-ops watches it.

```
Skill(skill="oc-monitoring-ops", args="/oc-monitor verify")
```

oc-monitoring-ops reads this skill's checkpoint to learn what shipped
(version, commit SHA, prod URL) and confirms:

- Uptime monitor is configured and pinging the new deployment.
- Error tracking sees fresh events from the new version.
- Any new alerts/SLOs needed for surfaces introduced in this release.

If oc-monitoring-ops reports gaps (no uptime monitor, no error tracking,
new endpoints without SLOs), surface them and let the user decide
whether to address now or schedule for a follow-up.

---

## Rollback (/oc-deploy rollback)

### Wrangler Rollback

```bash
npx wrangler rollback
# Verify
curl -s -o /dev/null -w "%{http_code}" "<production-url>/api/health"
```

### Migration Rollback

D1 migrations are forward-only. If a migration needs reversal:
1. Create a new "revert" migration
2. Apply it
3. Roll back the Worker code

### Auto-Rollback

If production health check fails after deploy:
1. Wait 30 seconds (propagation)
2. Re-check
3. If still failing → `wrangler rollback` + notify user

---

## Monitoring (Phase 4 extension)

### On-Demand Health Check

`/oc-deploy health` runs the full suite:
- HTTP status check on all smoke test URLs
- Latency measurement
- CF Workers analytics via API (request count, error rate) if token available
- Comparison against baseline (if prior checkpoint exists)

### Cloudflare Analytics

```bash
# Requires CF_API_TOKEN and CF_ACCOUNT_ID
curl -s "https://oc-api.cloudflare.com/client/v4/accounts/$CF_ACCOUNT_ID/workers/analytics/stored" \
  -H "Authorization: Bearer $CF_API_TOKEN" | python3 -c "
import json, sys
data = json.load(sys.stdin)
if data.get('success'):
  t = data['result']['totals']
  r = t.get('requests', {})
  print(f'Requests: {r.get(\"count\",0)}, Errors: {r.get(\"errors\",0)}')
"
```

### Notification (Telegram)

For projects with Telegram integration:

```bash
notify() {
  local msg="$1"
  [[ -n "$TELEGRAM_BOT_TOKEN" && -n "$TELEGRAM_CHAT_ID" ]] && \
    curl -s -X POST "https://oc-api.telegram.org/bot$TELEGRAM_BOT_TOKEN/sendMessage" \
      -d "chat_id=$TELEGRAM_CHAT_ID" -d "text=$msg" -d "parse_mode=Markdown"
}

notify "✅ *gtrack* deployed to production — $(git rev-parse --short HEAD)"
```

---

## Checkpoint Integration

### Checkpoint Location
`{project-dir}/.checkpoints/oc-deploy-ops.checkpoint.json`

### When to Write

| Event | What to Save |
|---|---|
| Init complete | Platform, environments, URLs, auth |
| Audit gate result | Pass/fail, finding count |
| Staging deployed | Version, timestamp, smoke results |
| Production promoted | Version, previous version, timestamp |
| Health check | Status, latency, error count |
| Rollback executed | From → to, reason |

### skill_state Template

```json
{
  "current_env": "staging",
  "staging_version": "abc123",
  "prod_version": "def456",
  "prev_prod_version": "ghi789",
  "last_deploy": "2026-04-01T10:00:00Z",
  "smoke_results": { "health": "pass", "auth": "pass", "frontend": "pass" },
  "rollback_available": true
}
```

### Cross-Skill Reads

| Reads from | Why |
|---|---|
| oc-code-auditor | Audit grade → deploy gate |
| oc-app-architect | Phase 6 sprint pass → deploy confidence |
| oc-git-ops | Branch merged → ready to deploy |

### Triggered By

Deploy-ops can be invoked directly, but also gets suggested by other skills:
- **oc-git-ops**: After `/oc-git-sync` completes, oc-git-ops suggests `/oc-deploy staging`
- **oc-app-architect**: After final Phase 6 sprint passes, oc-app-architect suggests `/oc-audit pre-deploy` → `/oc-deploy`
- **oc-app-architect**: Phase 7 (Launch) suggests the deploy pipeline

When triggered by another skill's suggestion, read that skill's checkpoint for context
(e.g., what was just pushed, what audit results exist) to skip redundant steps.

---

## GitHub Actions Template

For automated CI/CD, generate with `/oc-deploy init`:

Read `references/github-actions.md` for full workflow. Structure:

```yaml
jobs:
  test:        # lint + types + unit tests
  audit:       # npm audit, secret scan
  staging:     # wrangler deploy --env staging (PR only)
  production:  # wrangler deploy (main push only)
  smoke:       # post-deploy smoke tests
  notify:      # telegram notification
```

---

## Provider Reference (v1.3+)

The walkthrough above is Cloudflare-Workers-flavored because that's opchain's
own runtime. v1.3's platform-expansion sprint added first-class provider
sections for the four other targets in `oc-stack-forge`'s Platform Matrix. Each
section gives the deploy command, env-var pattern, smoke-test surface, and
rollback path. The audit gate, `/oc-deploy audit`, runs the same way regardless
of provider.

### Render (Django, Node static, Rails alt)

**Deploy command:** `git push render main` (Render auto-builds + deploys on
push to the connected branch). For Blueprint-managed projects, the first
deploy is `render blueprint launch` reading `render.yaml`.

**Env vars:** Set via Render dashboard or `render.yaml`'s `envVarGroups`.
Critical vars for opchain-managed projects:
- `DATABASE_URL` — provisioned automatically when `render.yaml` declares a
  `databases:` entry.
- `RENDER_GIT_COMMIT` — Render injects this; surface it via `/health` so
  smoke tests can verify the right SHA shipped.
- `SECRET_KEY` — set as a `sync: false` env var (UI only) so it's never in git.

**Migrations:** declared in `render.yaml` under the web service's
`buildCommand:` or as a separate `release` step. Render runs them before
swapping traffic.

**Smoke tests:** `curl -s https://<service>.onrender.com/health` returns the
deployed commit SHA; oc-deploy-ops compares to local HEAD. Latency check uses
`curl -w '%{time_total}'`.

**Rollback:** `render deploys list --service=<id>` → `render deploys rollback
--deploy=<id>`. Render keeps the prior image hot for ~30s after a swap so
rollback is fast.

**Audit gate:** `npm run validate-pm-mcp` + `npm run gen-catalog` run via the
build-time pipeline; for Django projects, replace with
`pytest && python manage.py check --deploy`.

### Heroku (Rails primary, Django alt)

**Deploy command:** `git push heroku main`. Heroku Pipelines: PRs → review
apps (auto), main → staging, manual promote → prod.

**Env vars:** `heroku config:set KEY=val -a <app>`. Critical vars:
- `DATABASE_URL` — auto-set when the `heroku-postgresql` add-on is provisioned.
- `RAILS_MASTER_KEY` (Rails) / `SECRET_KEY_BASE` (Rails legacy) — never in git.
- `HEROKU_SLUG_COMMIT` — Heroku injects this in dyno env; surface via `/health`.

**Migrations:** `Procfile` `release:` step (`bundle exec rake db:migrate` for
Rails) — Heroku runs it before scaling new dynos. If the release step fails,
the deploy aborts and traffic stays on the prior dyno.

**Smoke tests:** `curl -s https://<app>.herokuapp.com/health` for SHA + DB
ping. For review-app verification, the URL is dynamic
(`<app>-pr-<N>.herokuapp.com`) — read it from the Heroku API.

**Rollback:** `heroku releases -a <app>` (lists v123, v122, ...) →
`heroku rollback v122 -a <app>`. The release step does NOT re-run on rollback —
if you need to roll back a migration too, that's a separate
`heroku run rails db:rollback`.

**Audit gate:** Rails projects run `bundle exec brakeman` and
`bundle exec rspec` in CI before promoting; oc-deploy-ops orchestrates via
`/oc-deploy audit` which dispatches to the project's `bin/audit` if present.

### Fly.io (Go primary, Rust alt, anything Dockerfile-based)

**Deploy command:** `fly deploy` (reads `fly.toml`). For staging vs prod,
use separate Fly apps (`fly deploy --app <name>-staging`).

**Env vars:** `fly secrets set KEY=val --app <name>` (encrypted at rest;
injected into the VM env). `fly.toml` `[env]` is for non-secret config.
Critical vars:
- `DATABASE_URL` — Fly Postgres clusters auto-attach via `fly postgres attach`,
  which sets this var on the consumer app.
- `PORT` — `fly.toml` `internal_port` must match what the binary listens on.

**Migrations:** `fly.toml` `release_command = "/app/migrate up"` — runs in a
one-shot VM before traffic swaps. Fly aborts the deploy if it exits non-zero.

**Smoke tests:** `curl -s https://<app>.fly.dev/health` returns commit SHA.
For multi-region apps, smoke each region:
`fly status -a <app> --json | jq '.Allocations[].Region'` → loop curls.

**Rollback:** `fly releases list -a <app>` → `fly deploy --image <prior-tag>`
or `fly deploy --rollback`. Fly keeps the prior image registered until the
next successful deploy, so rollback is image-swap fast.

**Audit gate:** Go: `go vet ./... && go test ./... && govulncheck ./...`. Rust:
`cargo clippy -- -D warnings && cargo test && cargo audit`. oc-deploy-ops
dispatches by reading the project root for `go.mod` / `Cargo.toml`.

### Shuttle.rs (Rust primary)

**Deploy command:** `cargo shuttle deploy` (reads `Shuttle.toml` for project
name; reads `main.rs` for infra annotations).

**Env vars:** `cargo shuttle secrets set KEY=val` — Shuttle stores them
encrypted; available via `#[shuttle_runtime::Secrets]` injection in `main.rs`.
Local dev reads `Secrets.toml` (gitignored) instead.

**Provisioning:** Shuttle's infra-as-code-in-main.rs model:
`#[shuttle_shared_db::Postgres]` annotation on the entry function provisions
a managed Postgres on first deploy. No separate dashboard step.

**Migrations:** `sqlx::migrate!("./src/store/migrations")` runs in `main.rs`
on each cold start; idempotent so safe to re-run. Shuttle hot-swaps the
binary on deploy without downtime.

**Smoke tests:** `curl -s https://<project>.shuttleapp.rs/health` returns
SHA. Shuttle assigns one stable subdomain per project; staging is via a
separate project (e.g. `<project>-staging`).

**Rollback:** `cargo shuttle deployment list` (lists deployment ids in
reverse-chrono) → `cargo shuttle deployment <id> redeploy`. Shuttle keeps
the prior binary until the next deploy succeeds.

**Audit gate:** same as Fly.io for Rust:
`cargo clippy -- -D warnings && cargo test && cargo audit`.

### What's NOT first-class (and why)

The Platform Matrix is intentionally short. These platforms are common but
not first-class in v1.3:

| Platform | Status | Why |
|---|---|---|
| Vercel | Reachable via oc-stack-forge `references/deployment-patterns.md`, but no v1.3 scaffold recipe | Overlaps too closely with CF Workers for opchain's audience; pick one. |
| AWS Lambda | Same | Steep operational ramp; oc-deploy-ops would need dramatically different audit/rollback shape. |
| Railway | Same | Render covers the same niche; redundant. |
| Cloud Run | Same | Fly.io covers the same niche with a simpler dev loop. |
| Bare-metal / VPS | Out of scope | oc-deploy-ops is opinionated about managed deploys; bare-metal needs oc-migration-ops, not oc-deploy-ops. |

A future minor release can promote any of these by adding a scaffold recipe
in `oc-app-architect/references/scaffold-guide.md` AND a provider section here
AND at least one in-action `/demo` scenario.

---

## Pack-aware dispatch (v1.4+)

v1.4 introduces the oc-stack-forge pack registry (`skills/oc-stack-forge/packs/<id>/pack.yml`).
oc-deploy-ops consumes it at **runtime** via `src/lib/pack-dispatch.js` to pick
the right provider section above without re-implementing the matrix.

The contract is intentionally minimal — pack lookups are cheap and the
Platform Matrix above is the source of truth for *how* to deploy. The pack
metadata answers *which* matrix row applies.

### Entry point: `getDispatchTarget(packId)`

```js
import { getDispatchTarget } from "../../src/lib/pack-dispatch.js";

const target = getDispatchTarget("python");
// → { defaultPlatform: "render", supportedPlatforms: ["render", "fly-io"] }
//   (once PR 7 lands the deploy-target packs)
// → { defaultPlatform: null,    supportedPlatforms: [] }
//   while deploy-target packs are still pending (v1.4 PR 3 → PR 7 window)
// → null when the pack does not exist
```

Resolution order:

1. **Pack hit + populated platforms** — dispatch to the `defaultPlatform`'s
   provider section. The user can override with `/oc-deploy ... --platform <id>`
   as long as the override is in `supportedPlatforms`.
2. **Pack hit + empty platforms** — fall back to the Platform Matrix above
   keyed by language (Python → Render, Ruby → Heroku, Go → Fly.io, Rust →
   Shuttle, TypeScript → Cloudflare Workers). This is the v1.4 PR 3-through-6
   state for the 5 backfilled language packs.
3. **Pack miss** — caller error. oc-deploy-ops surfaces `unknown pack: <id>`
   and exits. No fuzzy matching.

### Worked example — `/oc-deploy staging` on a Python project

```
1. /oc-deploy staging
2. Read pack hint from project's oc-stack-forge.checkpoint.json:
     activePack: "python"
3. getDispatchTarget("python") → { defaultPlatform: null, supportedPlatforms: [] }
4. Fall back to language → Platform Matrix:
     python → Render
5. Read the "Render (Django, Node static, Rails alt)" section above.
6. Run `git push render main`, then `curl /health`, then update PM tickets.
```

After PR 7 lands `render`, `fly-io`, `heroku`, `shuttle` as deploy-target
packs with bidirectional graph entries, step 4 above gets short-circuited:
the pack's `defaultPlatform` is the answer, no fallback needed.

### Why runtime read (and not codegen)?

The dispatcher is a single-field lookup per deploy invocation — codegen
would buy a few μs and lose the property that `pack.yml` is the single
source of truth at the moment oc-deploy-ops actually runs. (oc-api-dev codegens
because it needs to template per-language scaffolds *into generated source
code* — different shape, different trade-off.)

---

## PM-Tool MCP Integration (v1.3+)

oc-deploy-ops creates a **deploy ticket** per environment + commit +
ship and updates every PM ticket linked to commits in the deploy.

The runtime contract — concrete tool names, retry policy, idempotency
markers, the `pm_deferred_actions[]` schema, and the extended state
vocabulary (`staging-verified` / `shipped` / `rolled-back` / `blocked`)
— lives in
[`oc-integrations-engineer/references/pm-mcp-protocol.md`](../oc-integrations-engineer/references/pm-mcp-protocol.md).
**All MCP calls below honour that contract; this section says only how
oc-deploy-ops shapes the deploy ticket and per-event updates.**

### Deploy ticket creation

When `/oc-deploy staging` or `/oc-deploy prod` starts and audit gate
passes:

1. Walk the commit range from last-deployed to HEAD.
2. Extract `Refs:` and `Closes:` trailers from each commit; collect
   the unique ticket id set.
3. Compose deploy-ticket description, prefixed with the idempotency
   marker per protocol §3:

   ```
   <!-- opchain:oc-deploy-ops:deploy-created:<env>:<HEAD-sha> -->

   Environment: {env}
   Range: {prev-sha}..{HEAD-sha}
   Commits: {N}
   Linked tickets: {ids comma-separated, each linked}
   Audit gate: PASS (grade {X})
   Bug-check: PASS
   Smoke tests: pending
   ```

4. Pre-create check: call the registry-resolved `list_issues` tool
   (Linear: `mcp__claude_ai_Linear__list_issues`; GitHub:
   `mcp__mcp-server-github__list_issues`) filtered to the configured
   project + the `deploy` issue type from `pm.yaml.issue_types`,
   description-text query for the marker. If a match exists, **reuse**
   the existing ticket id instead of creating a new one.
5. Otherwise call the registry-resolved `create_issue` tool (Linear:
   `mcp__claude_ai_Linear__save_issue` with no `id`; GitHub:
   `mcp__mcp-server-github__issue_write` action=create) with:
   - `issue_type` from `pm.yaml.issue_types.deploy` (default "Deploy"
     or "Task" if missing).
   - parent / blocked-by relations to each linked ticket, if the
     PM tool supports them.
6. Record the deploy-ticket id in `oc-deploy-ops.checkpoint.json`
   `skill_state.pm.deploy_tickets[]`.

### Per-event updates

Each row below uses a unique idempotency marker so retries / re-runs
short-circuit per protocol §3. Pre-write check via `list_comments`
(Linear) or `issue_read` (GitHub) before every comment.

| Event | Marker | Action |
|---|---|---|
| Smoke tests pass (staging) | `<!-- opchain:oc-deploy-ops:staging-verified:<deploy-id> -->` | `add_comment` to deploy ticket: PASS + URL; transition deploy ticket → `staging-verified` (resolved from `pm.yaml.states.extended`). |
| Production ship | `<!-- opchain:oc-deploy-ops:prod-shipped:<deploy-id> -->` | `add_comment` to deploy ticket: prod URL + version stamp; transition → `shipped`. For each linked ticket, separate marker `<!-- opchain:oc-deploy-ops:linked-shipped:<deploy-id>:<ticket-id> -->` with body "Shipped to prod via deploy {id}". |
| Rollback | `<!-- opchain:oc-deploy-ops:rollback:<deploy-id> -->` | `add_comment` to deploy ticket: rollback reason + previous-version SHA; transition → `rolled-back`. For each linked ticket, marker `<!-- opchain:oc-deploy-ops:linked-rollback:<deploy-id>:<ticket-id> -->` body "Rolled back — re-investigate". |
| Smoke fail | `<!-- opchain:oc-deploy-ops:smoke-fail:<deploy-id> -->` | `add_comment` to deploy ticket: failure summary; transition → `blocked`; the prod gate refuses. |

State strings (`staging-verified` / `shipped` / `rolled-back` /
`blocked`) **must** be resolved from `pm.yaml.states.extended` — never
hard-coded — so each project can map them to its actual workflow names.

### Cross-env consistency

The deploy ticket lives until production ships (or rollback closes
the loop). A staging deploy ticket left open >7d auto-comments on
itself with marker
`<!-- opchain:oc-deploy-ops:stale-staging:<deploy-id> -->` body
"Stale deploy — close manually if abandoned" so the PM tool
reflects reality. The 7-day auto-comment is itself idempotent —
the marker prevents duplicate stale-warnings on resumed sessions.

### `/oc-deploy --retry-pm` flush

Invokes the protocol §4 flush against
`oc-deploy-ops.checkpoint.json` `pm_deferred_actions[]`. Filter to
`skill: "oc-deploy-ops"` and `retriable: true`. Surfaces
`flushed N / failed M`. The deploy itself never blocks on PM-MCP;
this flush is purely the post-ship reconciliation path.

### Failure modes

- MCP unavailable / unconfigured → deploy proceeds; intended
  comments / transitions are deferred per protocol §4. `/oc-deploy
  --retry-pm` flushes later.
- 403 on a per-linked-ticket comment → defer that one entry with
  `retriable: false`; the deploy ticket and other linked-ticket
  comments are unaffected.
- Deploy spans 50+ tickets → comment on the deploy ticket only;
  individual linked tickets get a single rollup comment with marker
  `<!-- opchain:oc-deploy-ops:rollup:<deploy-id> -->` listing all
  included tickets to avoid notification spam.

---

## Principles

1. **Never deploy without a gate.** Even quick deploys run the audit check.
2. **Staging first.** Always. Even for "small changes."
3. **Rollback in 30 seconds.** Every deploy records the previous version.
4. **Health checks are non-negotiable.** Non-200 after deploy = something is wrong.
5. **Deploys should be boring.** The feature is the exciting part.
6. **Record everything.** The checkpoint is the deploy log.
