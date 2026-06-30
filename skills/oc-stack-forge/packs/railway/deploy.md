# Railway

A modern Heroku-alike. Stack-forge picks Railway when the team wants
"git push and forget" ergonomics with first-class Postgres/Redis, and
either AWS Elastic Beanstalk is overkill or Heroku's price tag has become
the blocker. Lower friction than AWS for small teams; quicker to a running
production stack than self-managed containers.

## When to pick it

- Solo founders and small teams shipping a server-rendered app or API +
  database, who want a managed Postgres in the same dashboard as the app.
- Workloads that outgrew a hobby tier on Heroku/Fly and want a similar
  developer experience without the Heroku per-dyno math.
- Stacks that don't fit edge runtime constraints (long-lived processes,
  background workers, scheduled jobs) but still want zero ops.
- Containerised services where the team already has a working `Dockerfile`
  and doesn't want to babysit ECS/EKS.

Skip when: the workload is genuinely edge-friendly (Cloudflare Workers
wins on cost + latency), or the team is locked into AWS for compliance /
existing infra reasons (AWS Amplify is the right pivot).

## Canonical deploy mechanics

| Mechanism | Use case | Notes |
|---|---|---|
| `railway up` (CLI) | One-shot from a local checkout | Uploads the project; Railway detects buildpacks or `Dockerfile` automatically. |
| GitHub integration | Default for teams | Connect a repo; pushes to the tracked branch trigger a build + deploy. PR preview environments are one click. |
| `Dockerfile` build | When buildpack detection fails | Drop a `Dockerfile` at the repo root; Railway uses it instead of Nixpacks. |
| Template deploy | Bootstrapping a known stack | One-click templates (Postgres, Redis, common app shells) provision services with sensible defaults. |

Railway's build layer is **Nixpacks** — buildpack-style auto-detection
that handles Node/Python/Go/Rust/Elixir/Ruby/PHP/Java without configuration
in the common case. When detection picks the wrong runtime or version,
the override is a `railway.json` file or a `Dockerfile`.

## Supported runtimes

Railway's Nixpacks handles every language pack in the v1.4 catalog:

| Language pack | Notes |
|---|---|
| typescript / bun / deno | Node 20 default; bun/deno detected from lockfile. |
| python | `requirements.txt` / `pyproject.toml` both work; `uv` supported via Dockerfile. |
| ruby | Bundler-driven; matches the Heroku buildpack experience closely. |
| go | Module-aware; `go.mod` triggers Go detection. |
| rust | `Cargo.toml` triggers; Nixpacks caches the registry across builds. |
| elixir | Mix-driven; releases (`mix release`) work out of the box. |

Framework packs ride on top of the language detection — Phoenix, Remix,
SvelteKit, Solid all deploy cleanly when their language pack does.

## Pricing band (2026-Q2, rough)

| Tier | Cost | What you get |
|---|---|---|
| Trial | $5 one-time credit | Free trial period for evaluation. |
| Hobby | $5/month | $5 of usage included; pay-as-you-go beyond. Suitable for hobbyist apps + a small Postgres. |
| Pro | $20/month/seat | Team features, higher limits, priority support. Still pay-as-you-go on compute. |

Pricing is **usage-based** on top of the plan fee — CPU-seconds, RAM-GB-
hours, egress GB. A typical small-team API + Postgres lands around $20-40/
month all-in. Check Railway's pricing page at decision time.

## Gotchas oc-stack-forge will flag

- **Cold starts on the hobby tier** — services with no recent traffic
  spin down. Production-critical workloads should sit on a usage tier
  that keeps containers warm.
- **Regions are limited** — Railway has fewer regions than AWS/GCP. Apps
  that need multi-region latency (or strict data-residency) should pick a
  different target.
- **Custom domains + SSL** — straightforward via the dashboard, but DNS
  propagation can stall; oc-stack-forge flags projects whose launch plan
  doesn't budget at least an hour for the first custom-domain handshake.
- **Env vars vs. secrets** — Railway treats both as the same "variables"
  surface, which is convenient but means anyone with project access
  reads secret values. Use Railway's "shared variables" feature for
  team-managed secrets, and rotate on team membership changes.
- **Egress costs at scale** — fine at hobby scale; meaningful once
  outbound traffic crosses ~100GB/month. Front the app with a CDN before
  egress dominates the bill.
- **No background-worker primitive** — long-running workers are just
  another service. Cron jobs ship as a separate "Cron" service type;
  don't try to shoehorn them into the main app process.

## Status

`stable` — full coverage. No coverage flag is emitted (deploy-target
packs are sub-selections of language/framework packs, not top-level
coverage units). Stack-forge surfaces Railway as a `supportedPlatforms`
option once language/framework packs start declaring it (PR 8+).
