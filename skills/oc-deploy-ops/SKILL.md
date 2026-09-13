---
name: oc-deploy-ops
displayName: OC · Deploy Ops
version: 1.9.0
license: Apache-2.0
shortDesc: Audit gate → staging → production → monitor. Creates deploy tickets and updates linked PM tickets per env.
phases: [build]
triAgent: false
tryable: true
commands:
  - /oc-deploy
  - /oc-deploy staging
  - /oc-deploy audit
  - /oc-deploy init
  - /oc-deploy prod
  - /oc-deploy rollback
  - /oc-deploy env
  - /oc-deploy status
  - /oc-deploy smoke
  - /oc-deploy health
description: >
  Deployment pipeline: audit gate → staging → production → monitoring. Use for
  /oc-deploy, "deploy this", "ship it", "push to production", "staging", "rollback",
  "health check", or any deployment task. Single-app managed deploys only:
  multi-container, self-managed or IaC deploys are oc-fleet-ops.
---

# Deploy Ops

**On first invocation, read `references/orchestrator.md` and follow its welcome protocol.**

Orchestrate the full deployment lifecycle: pre-deploy quality gate → staging deploy →
smoke test → production promotion → health check → rollback if needed. Built for
Cloudflare Workers + D1 + Pages, with the acme-core monorepo as the primary target.

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
# Check for a wrangler config (Cloudflare Workers): wrangler.toml, .jsonc or .json
WRANGLER_CFG=$(ls wrangler.toml wrangler.jsonc wrangler.json 2>/dev/null | head -1)
[[ -n "$WRANGLER_CFG" ]] && echo "Cloudflare Workers project detected ($WRANGLER_CFG)"

# Check for Pages config
grep -q "pages" "$WRANGLER_CFG" 2>/dev/null && echo "Pages deployment detected"

# Check for existing deploy scripts
grep -q '"deploy"' package.json 2>/dev/null && echo "Deploy script found in package.json"
```

### Deploy Config

Create or update `.oc-deploy-ops.json`:

```json
{
  "project_name": "acme-app",
  "platform": "cloudflare-workers",
  "monorepo": true,
  "monorepo_root": "~/repos/acme-core",
  "app_path": "apps/acme-app",

  "environments": {
    "staging": {
      "wrangler_env": "staging",
      "d1_database": "acme-app-staging",
      "url": "https://acme-app-staging.example.workers.dev",
      "auto_deploy_branch": "staging"
    },
    "production": {
      "wrangler_env": null,
      "d1_database": "acme-app-prod",
      "url": "https://acme-app.example.workers.dev",
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
3. **Check environments** — staging/prod environments configured in the wrangler config?
4. **Check D1 databases** — staging and prod DBs exist?
5. **Generate .oc-deploy-ops.json** — ask user to confirm/adjust
6. **Verify deploy works** — dry-run `wrangler deploy --dry-run`
7. **Set up smoke test URLs** — derive from the wrangler config's routes

### Environment Variables and Secrets (/oc-deploy env)

Inventory what each environment needs before anything ships to it. The commands
below are Wrangler's; on Render, Fly or Heroku use the platform's equivalent.

1. **Declared** — read the env-var template (`.env.example` or equivalent) and the
   platform config (`vars` per environment in wrangler config).
2. **Present** — list what each environment actually has (`wrangler secret list`,
   `wrangler secret list --env staging`). Report names only, never values.
3. **Diff** — flag a variable the code reads but an environment lacks, and a secret
   an environment holds that nothing reads.
4. **Set** — on request, set a missing secret with `wrangler secret put <NAME>`
   (add `--env staging` for staging); the user types the value, never the agent.

Rotation policy belongs to oc-security-hardening, which hands the actual rotation
here when the platform's secret store is the tool.

---

## Pre-Deploy Audit Gate (/oc-deploy audit)

Before any deploy, run **two** audits in order: oc-code-auditor (code-level
findings) then oc-security-auditor (architecture / hardening / threat
model). Both must pass for `/oc-deploy staging` and `/oc-deploy prod` to
proceed. Two **conditional rows** (v1.9) join the gate when their manifests
exist in the repo — see steps 3 and 4; absent manifests, the gate is exactly
the two-audit gate above.

**This gate is agent-executed.** oc-deploy-ops applies these rules while it runs;
`npm run deploy` and similar deploy scripts do not read auditor checkpoints. An
audit on record counts only if it covered **this repo's runtime code at the SHA
being deployed**. An audit of another commit, or of docs or skill text, is treated
as no audit run.

The commands below use opchain's checkpoint CLI, where `status <skill>` prints that
one checkpoint and exits 1 when it does not exist. On a project without the CLI,
read `.checkpoints/<skill>.checkpoint.json` directly.

### 1. oc-code-auditor — code-level gate

```bash
node scripts/checkpoint.mjs status oc-code-auditor   # exit 1 = no audit on record
# Reuse only if updated_at < 1h old AND it audited the deploying SHA's runtime code.
# Otherwise:
#   Skill(skill="oc-code-auditor", args="/oc-audit pre-deploy")
```

### 2. oc-security-auditor — posture gate

Code-auditor finds SQLi and hardcoded secrets; oc-security-auditor asks
"what's the threat model?" and "is the infra hardened?". Run it
before the first production deploy and any time the surface area
changes (new auth flow, new public endpoint, new third-party
integration).

```bash
node scripts/checkpoint.mjs status oc-security-auditor   # exit 1 = no assessment on record
# Reuse only if updated_at < 24h old, it assessed this deployment's surface, and
# nothing high-impact changed since. Otherwise:
#   Skill(skill="oc-security-auditor", args="/oc-security posture")
```

### 3. oc-security-hardening — manifest gate (conditional, v1.9)

Only when `.opchain/hardening.yaml` exists. Replay the manifest — `config`/
`test` controls verify at the deploying SHA; `http` controls verify the
*currently live* environment (pre-deploy they check the last deployment, so
they re-run post-staging against the staging URL — see the hardening
manifest's timing-soundness note):

```bash
ls .opchain/hardening.yaml 2>/dev/null && \
  echo "manifest present — Skill(skill=\"oc-security-hardening\", args=\"/oc-harden verify\")"
# Any FAIL-class control → treat as a CRITICAL finding (block).
# Unparseable manifest / missing verify method → also FAIL (schema error, never a skip).
# `manual` controls → loud-skip, listed in the gate output with their age.
```

### 4. oc-compliance-ops — evidence gate (conditional, v1.9)

Only when `.opchain/compliance.yaml` exists. The gate condition is that an
**honest evidence bundle exists for the deploying SHA** — not that the
register is gap-free (compliance state is reported, never enforced here):

```bash
ls .opchain/compliance.yaml 2>/dev/null && \
  echo "profile present — Skill(skill=\"oc-compliance-ops\", args=\"/oc-comply evidence\")"
# Missing/stale bundle for this SHA → ⚠️ Warn, generate before prod.
```

### Gate Rules

| Audit Result | Deploy Decision |
|---|---|
| No CRITICAL findings (both audits) | ✅ Proceed |
| CRITICAL findings exist (either audit) | 🚫 Block — must fix before deploy |
| HIGH findings (≤ 3 total) | ⚠️ Warn — proceed with user confirmation |
| HIGH findings (> 3 total) | 🚫 Block — too many unresolved issues |
| No code audit on record, or it does not cover the deploying runtime code | ⚠️ Warn — run `/oc-audit pre-deploy` first |
| No security assessment on record | 🚫 Block — run `/oc-security posture`, or record an explicit waiver (who, why, until when) in the oc-deploy-ops checkpoint before proceeding |
| Hardening manifest present, any control FAILs verify | 🚫 Block — a regressed control is a CRITICAL |
| Hardening manifest present, `manual` controls only | ⚠️ Loud-skip — list them + last-check age |
| Compliance profile present, no evidence bundle at this SHA | ⚠️ Warn — run `/oc-comply evidence` before prod |

When blocked, show the specific findings and fix commands. When warned, list
the findings and ask for explicit confirmation before proceeding.

---

## Staging Deploy (/oc-deploy staging)

**Use the project's deploy wrapper when it has one.** If `package.json` defines a
`deploy:staging` / `deploy` script, run it instead of calling the platform CLI
directly: the wrapper is where the project keeps its own checks. In the opchain.dev
repo, `npm run deploy:staging` and `npm run deploy` run `scripts/deploy.mjs`, which
refuses an off-main or dirty checkout, refuses an untagged release (production),
runs `npm run hardening:verify`, then replays the hardening manifest and the smoke
suite against the live target and rolls back on a miss. A bare `wrangler deploy`
skips all of that. The raw sequences below are for projects without a wrapper.

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

### Monorepo Deploy (acme-core)

For the acme-core monorepo with the deploy API:

```bash
curl -X POST "https://deploy.example.com/deploy" \
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

Same rule as staging: a project deploy script (`npm run deploy` in opchain.dev)
wins over the raw commands below.

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
check the new deployment. Deploy-ops ships it; oc-monitoring-ops watches it.

```
Skill(skill="oc-monitoring-ops", args="/oc-monitor health")
```

When the project has no oc-monitoring-ops checkpoint yet, run `/oc-monitor setup`
instead: there is nothing to verify until observability exists.

Before handing off, record what shipped (version, commit SHA, prod URL) in this
skill's checkpoint `progress_summary`, a part of a checkpoint a sibling may read
(`skill_state` is private). They are there for the session to compare against:
`/oc-monitor health` itself reads no sibling checkpoint. It checks the live
deployment (per-dependency status, latency, TLS expiry) and compares the deployed
version to its own last-known-good.

Uptime monitoring, error tracking and SLO coverage for new surfaces are separate
oc-monitoring-ops verbs (`/oc-monitor uptime`, `/oc-monitor errors`,
`/oc-monitor slo`). If health or the monitoring checkpoint shows gaps (no uptime
monitor, no error tracking, new endpoints without SLOs), surface them and let the
user decide whether to address now or schedule for a follow-up.

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
curl -s "https://api.cloudflare.com/client/v4/accounts/$CF_ACCOUNT_ID/workers/analytics/stored" \
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
    curl -s -X POST "https://api.telegram.org/bot$TELEGRAM_BOT_TOKEN/sendMessage" \
      -d "chat_id=$TELEGRAM_CHAT_ID" -d "text=$msg" -d "parse_mode=Markdown"
}

notify "✅ *acme-app* deployed to production — $(git rev-parse --short HEAD)"
```

---

## Checkpoint Integration

The shared checkpoint schema, write rules and resume protocol live in
`references/checkpoint-protocol.md`, bundled with this skill. This section adds only
what is specific to oc-deploy-ops.

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
  "platform": "cloudflare-workers",
  "current_env": "staging",
  "staging_url": "https://acme-app-staging.example.workers.dev",
  "production_url": "https://acme-app.example.workers.dev",
  "staging_version": "abc123",
  "prod_version": "def456",
  "production_sha": "def456",
  "prev_prod_version": "ghi789",
  "last_deploy": "2026-04-01T10:00:00Z",
  "staging_smoke_results": { "health": "pass", "auth": "pass", "frontend": "pass" },
  "production_smoke_results": { "health": "pass" },
  "rollback_available": true
}
```

`skill_state` is private to this skill. Anything a sibling needs (the shipped
version, SHA and prod URL for oc-monitoring-ops; the deploy ticket for incident
linking) also goes in `progress_summary` or top-level `pm_refs`.

### Cross-Skill Reads

| Reads from | Why |
|---|---|
| oc-code-auditor | Audit grade → deploy gate (step 1) |
| oc-security-auditor | Posture assessment → deploy gate (step 2) |
| oc-security-hardening | `.opchain/hardening.yaml` manifest verify → conditional gate row (step 3) |
| oc-compliance-ops | Evidence bundle for the deploying SHA → conditional gate row (step 4) |
| oc-app-architect | Phase 6 sprint pass → deploy confidence |
| oc-git-ops | Branch merged → ready to deploy |
| oc-bug-check | Last gate status → the `Bug-check:` line on the deploy ticket (not a gate row) |
| oc-stack-forge | Platform Matrix + `packs/<id>/pack.yml` → which deploy recipe applies (files, not a checkpoint) |
| oc-agent-forge / oc-rag-forge / oc-prompt-ops | Frozen harness config + fixtures, retrieval config + goldset, or prompt version → the artifact being shipped (hand-off only; no gate row) |

| Read by | Why |
|---|---|
| oc-monitoring-ops | What shipped (version, SHA, prod URL) and the deploy ticket in `pm_refs` |
| oc-release-ops | Last-shipped commit SHA for the release record |
| oc-git-ops | Deploy status → PR deployment notes |
| oc-compliance-ops | Deploy SHA the evidence bundle is keyed to |
| oc-security-hardening | The deploy gate that replays its manifest |
| oc-security-auditor | Deployment config, environment variables, platform settings → posture inputs |
| oc-scale-ops | Current deployment config → infrastructure baseline |
| oc-migration-ops | Deployment config (environments, URLs, health checks) → cutover planning |
| oc-integrations-engineer | Environment config → where secrets are stored |
| oc-bug-check | Environment config → which build command its build check runs |

### Triggered By

Deploy-ops can be invoked directly, and other skills hand off to it:
- **oc-git-ops**: after `/oc-git-sync` completes, offers `/oc-deploy audit` then `/oc-deploy staging` and runs them on user confirmation
- **oc-app-architect**: after the final Phase 6 sprint passes, `/oc-audit pre-deploy` → `/oc-deploy staging`
- **oc-app-architect**: Phase 7 (Launch) runs the deploy pipeline
- **oc-release-ops**: `/oc-release ship` runs `/oc-deploy staging`, then `/oc-deploy prod` on user confirmation
- **oc-migration-ops**: a cutover hands its deploy step here

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

**Audit gate:** the project's own lint / type-check / test scripts plus
`npm audit` for Node services; for Django projects,
`pytest && python manage.py check --deploy`. (opchain's own build runs
`npm run validate-pm-mcp` + `npm run gen-catalog`; those scripts exist only in
the opchain repo.)

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
| Vercel | Reachable via oc-stack-forge's platform matrix, but no v1.3 scaffold recipe | Overlaps too closely with CF Workers for opchain's audience; pick one. |
| AWS Lambda | Same | Steep operational ramp; oc-deploy-ops would need dramatically different audit/rollback shape. |
| Railway | Same | Render covers the same niche; redundant. |
| Cloud Run | Same | Fly.io covers the same niche with a simpler dev loop. |
| Bare-metal / VPS / multi-container / IaC | Out of scope | oc-deploy-ops is opinionated about single-app managed deploys; self-managed, multi-node and IaC deploys are oc-fleet-ops (moving a live system onto one is oc-migration-ops). |

A future minor release can promote any of these by adding a scaffold recipe
to `oc-app-architect/references/scaffold-guide.md` (in that skill) AND a provider section here
AND at least one in-action `/demo` scenario.

---

## Pack-aware dispatch (v1.4+)

The oc-stack-forge pack registry (`skills/oc-stack-forge/packs/<id>/pack.yml`)
tells oc-deploy-ops *which* provider section above applies; the Platform Matrix
stays the source of truth for *how* to deploy. In the opchain repo the lookup is
`getDispatchTarget(packId)` in `src/lib/pack-dispatch.js`. That module is repo
source and does not ship with the skill; elsewhere, read the pack files directly.

### What the registry holds today

- **Mobile packs** (`ios-swiftui`, `flutter`, `kotlin-android`,
  `react-native-expo`) declare a platform: `getDispatchTarget` returns e.g.
  `{ defaultPlatform: "app-store", supportedPlatforms: ["app-store"] }`.
- **Language packs** (python, ruby, go, rust, typescript, …) declare no platform
  graph: `getDispatchTarget(<language>)` returns
  `{ defaultPlatform: null, supportedPlatforms: [] }` for every one of them.
- **Deploy-target packs** exist for `heroku`, `railway`, `netlify`,
  `aws-amplify`, `app-store` and `play-store`. There are no `render`, `fly-io`
  or `shuttle` packs; those platforms are covered only by the provider sections
  above.
- `getDispatchTarget` returns `null` when the pack does not exist.

### Resolution order

1. **Pack returns a `defaultPlatform`** — use it (the mobile packs today). App
   Store / Play Store releases are checklist-driven: oc-stack-forge renders the
   release checklist rather than oc-deploy-ops running commands.
2. **Pack returns no platform** — fall back to the Platform Matrix keyed by
   language (the path every language pack takes today). Detect the language from
   the project root (`pyproject.toml` / `requirements.txt` → Python, `Gemfile` →
   Ruby, `go.mod` → Go, `Cargo.toml` → Rust, `package.json` + a wrangler config →
   TypeScript on Workers), then: Python → Render, Ruby → Heroku, Go → Fly.io,
   Rust → Shuttle, TypeScript → Cloudflare Workers.
3. **Pack miss** (`null`) — caller error. Surface `unknown pack: <id>` and stop.
   No fuzzy matching.

### Worked example — `/oc-deploy staging` on a Python project

```
1. /oc-deploy staging
2. Detect the language from the project root: pyproject.toml → python
3. getDispatchTarget("python") → { defaultPlatform: null, supportedPlatforms: [] }
4. Language → Platform Matrix: python → Render
5. Read the "Render (Django, Node static, Rails alt)" section above.
6. Run `git push render main`, then `curl /health`, then update PM tickets.
```

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
`oc-integrations-engineer/references/pm-mcp-protocol.md`, in that skill. It is not bundled
with this skill: install the full catalog (or oc-integrations-engineer alongside it) to read it.
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
   `skill_state.pm.deploy_tickets[]` (private bookkeeping), and append
   `{ provider, id, url, role: "deploy", created_by_skill: "oc-deploy-ops" }`
   to the checkpoint's top-level `pm_refs[]` per the checkpoint protocol's
   write pattern. `pm_refs` is what sibling skills (oc-monitoring-ops
   linking an incident to the latest deploy) read.

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
