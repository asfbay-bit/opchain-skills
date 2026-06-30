# GitHub Actions Workflow Templates

Complete CI/CD workflows for Cloudflare Workers + D1 + Pages projects.

---

## Full Deploy Pipeline

```yaml
# .github/workflows/deploy.yml
name: Deploy

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

env:
  CLOUDFLARE_API_TOKEN: ${{ secrets.CF_API_TOKEN }}
  CLOUDFLARE_ACCOUNT_ID: ${{ secrets.CF_ACCOUNT_ID }}

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: "20" }
      - run: npm ci
      - run: npx tsc --noEmit
      - run: npx vitest run

  audit:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: "20" }
      - run: npm ci
      - run: npm audit --audit-level=critical
        continue-on-error: false

  deploy-staging:
    needs: [test, audit]
    if: github.event_name == 'pull_request'
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: "20" }
      - run: npm ci
      - run: npx wrangler d1 migrations apply ${{ vars.D1_STAGING_DB }} --remote --env staging
      - run: npx wrangler deploy --env staging
      - name: Smoke test
        run: |
          sleep 5
          STATUS=$(curl -s -o /dev/null -w "%{http_code}" --max-time 10 "${{ vars.STAGING_URL }}/api/health")
          echo "Health check: $STATUS"
          [[ "$STATUS" == "200" ]] || exit 1

  deploy-production:
    needs: [test, audit]
    if: github.ref == 'refs/heads/main' && github.event_name == 'push'
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: "20" }
      - run: npm ci
      - run: npx wrangler d1 migrations apply ${{ vars.D1_PROD_DB }} --remote
      - run: npx wrangler deploy
      - name: Health check
        run: |
          sleep 5
          STATUS=$(curl -s -o /dev/null -w "%{http_code}" --max-time 10 "${{ vars.PROD_URL }}/api/health")
          echo "Health check: $STATUS"
          if [[ "$STATUS" != "200" ]]; then
            echo "❌ Health check failed — rolling back"
            npx wrangler rollback
            exit 1
          fi

  notify:
    needs: deploy-production
    if: always() && needs.deploy-production.result != 'skipped'
    runs-on: ubuntu-latest
    steps:
      - name: Notify
        if: vars.TELEGRAM_BOT_TOKEN != ''
        run: |
          RESULT="${{ needs.deploy-production.result }}"
          EMOJI=$([[ "$RESULT" == "success" ]] && echo "✅" || echo "❌")
          MSG="$EMOJI *${{ github.repository }}* deploy: $RESULT
          Commit: \`${{ github.sha }}\`
          By: ${{ github.actor }}"
          curl -s -X POST "https://oc-api.telegram.org/bot${{ vars.TELEGRAM_BOT_TOKEN }}/sendMessage" \
            -d "chat_id=${{ vars.TELEGRAM_CHAT_ID }}" -d "text=$MSG" -d "parse_mode=Markdown"
```

---

## Monorepo Variant (aidops-core)

For monorepos with multiple apps, use path filters:

```yaml
# .github/workflows/deploy-gtrack.yml
name: Deploy gtrack

on:
  push:
    branches: [main]
    paths:
      - 'apps/gtrack/**'
      - 'packages/shared/**'
  pull_request:
    branches: [main]
    paths:
      - 'apps/gtrack/**'
      - 'packages/shared/**'

jobs:
  test:
    runs-on: ubuntu-latest
    defaults:
      run:
        working-directory: apps/gtrack
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: "20" }
      - run: npm ci
      - run: npx tsc --noEmit
      - run: npx vitest run

  deploy:
    needs: test
    if: github.ref == 'refs/heads/main'
    runs-on: ubuntu-latest
    defaults:
      run:
        working-directory: apps/gtrack
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: "20" }
      - run: npm ci
      - run: npx wrangler d1 migrations apply gtrack-prod --remote
        env:
          CLOUDFLARE_API_TOKEN: ${{ secrets.CF_API_TOKEN }}
      - run: npx wrangler deploy
        env:
          CLOUDFLARE_API_TOKEN: ${{ secrets.CF_API_TOKEN }}
```

---

## Required Secrets & Variables

### Secrets (encrypted)

| Secret | Purpose |
|---|---|
| `CF_API_TOKEN` | Cloudflare API token with Workers/D1/Pages permissions |

### Variables (plaintext)

| Variable | Example | Purpose |
|---|---|---|
| `D1_STAGING_DB` | `gtrack-staging` | Staging D1 database name |
| `D1_PROD_DB` | `gtrack-prod` | Production D1 database name |
| `STAGING_URL` | `https://gtrack-staging.aidops.workers.dev` | Staging smoke test URL |
| `PROD_URL` | `https://gtrack.aidops.workers.dev` | Production smoke test URL |
| `TELEGRAM_BOT_TOKEN` | (optional) | Telegram notification bot |
| `TELEGRAM_CHAT_ID` | (optional) | Telegram chat for notifications |
