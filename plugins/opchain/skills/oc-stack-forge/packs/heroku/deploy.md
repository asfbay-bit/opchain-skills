# Heroku

The original PaaS. Stack-forge picks Heroku when the team's dominant
pressure is **boring, predictable, ages well** — when "no one ever got
fired for deploying to Heroku" is the right read of the room. Higher
cost than Railway/Fly at scale, but the buildpack ecosystem, Postgres
add-on, and operational maturity are unmatched.

## When to pick it

- Teams that have shipped on Heroku before and don't want to relearn the
  PaaS muscle memory. The mental model is unchanged since ~2013.
- Ruby on Rails apps — Heroku is still the canonical Rails deploy target.
  The buildpack, asset pipeline, and Postgres integration are first-class.
- Workloads that need **Heroku Postgres** specifically — its forking,
  follower, and dataclips features are still unique in the PaaS space.
- Enterprise teams using **Heroku Enterprise** for SOC2 / HIPAA-ready
  shared-tenant compute without standing up AWS Landing Zone.
- Apps where the buildpack chain (multi-buildpack Node + Python + Ruby
  in one slug) is genuinely useful and a single-runtime container would
  feel awkward.

Skip when: the team is cost-sensitive at hobby scale (Railway's $5/mo
hobby tier wins) or wants edge / multi-region as a default (Fly.io
wins). Heroku stopped having a free tier in November 2022.

## Canonical deploy mechanics

| Mechanism | Use case | Notes |
|---|---|---|
| `git push heroku main` | The original Heroku flow | Pushes to the Heroku git remote trigger a buildpack build + slug deploy. Still the default. |
| GitHub integration | Auto-deploy on push | Connect a repo via the dashboard; pushes to the tracked branch trigger builds. Optional wait-for-CI gate. |
| `heroku container:push` | Container deploys | When buildpack detection won't do (binary deps, custom runtime), push a Docker image to the Heroku registry. |
| `heroku pipelines` | Staging → production promotion | "Promote" copies the built slug from staging to production without rebuilding. Closest thing to "deploy once, run anywhere" in the PaaS world. |

Heroku's build layer is the **buildpack** — a community-maintained pack
of "detect-compile-release" scripts per language. Buildpacks are still
the most predictable build layer in the PaaS space; they almost never
surprise you, but they constrain what's possible.

## Supported runtimes

Heroku has first-party buildpacks for every major language in the
v1.4 catalog:

| Language pack | Buildpack | Notes |
|---|---|---|
| typescript / bun / deno | `heroku/nodejs` | Bun/Deno work via community buildpacks; not first-party. Node 20 default. |
| python | `heroku/python` | `requirements.txt` / `Pipfile` / `poetry`. `uv` requires a Dockerfile or custom buildpack. |
| ruby | `heroku/ruby` | The canonical Rails deploy target. Bundler-first; sprockets/propshaft handled out of the box. |
| go | `heroku/go` | Module-aware; vendored deps supported. |
| rust | `emk/rust` (community) | No first-party Rust buildpack; community buildpack is widely used. |
| elixir | `hashnuke/elixir` (community) | OTP releases preferred; the community buildpack handles them. |

Multi-buildpack apps work (a Rails app with a Node frontend, for instance)
but expect slug-size pressure as the buildpack chain grows.

## Pricing band (2026-Q2, rough)

| Tier | Cost | What you get |
|---|---|---|
| Eco | $5/month | 1000 dyno-hours/month pool across all Eco dynos; dynos sleep after 30 min idle. The replacement for the old free tier. |
| Basic | $7/month/dyno | No sleep, custom domains, automated SSL. |
| Standard-1X / 2X | $25 / $50/month/dyno | Production-grade; metrics, log retention. |
| Performance-M / L | $250 / $500/month/dyno | Dedicated CPU. |
| Heroku Postgres | $5 (Mini) → $200+ (Standard tiers) | Add-on; pricing scales with row count + memory. |

Heroku is **the most expensive PaaS in the v1.4 catalog at production
scale** — a multi-dyno app + a serious Postgres easily lands at $100-300/
month before add-ons. The pricing is honest about what it is; teams
picking Heroku in 2026 know they're buying maturity, not cost.

## Gotchas oc-stack-forge will flag

- **Eco dynos sleep** — apps on the $5 tier go to sleep after 30 min
  idle. First request after sleep takes 5-15s. Anything user-facing in
  production should sit on Basic or higher.
- **24-hour dyno restart** — every dyno restarts at least once per day.
  In-memory state is not durable; long-running jobs need to checkpoint.
- **Slug size cap** — 500MB compiled slug. Heavy ML deps (torch, tensorflow)
  blow through this; oc-stack-forge flags Python ML workloads heading to
  Heroku and steers them to container deploys instead.
- **Region scarcity** — `us` and `eu` only on the common-runtime. Apps
  with regulatory requirements outside those regions need Heroku Private
  Spaces (enterprise) or a different host.
- **Postgres connection limits** — Heroku Postgres tiers cap concurrent
  connections aggressively. PgBouncer (or app-level pooling like
  `asyncpg.create_pool` / Rails' `DATABASE_POOL`) is mandatory at any
  real scale; oc-stack-forge bakes this into its guidance.
- **Heroku Connect / pipelines lock-in** — pipelines and review apps are
  Heroku-specific; expect rework when migrating off.
- **Add-on pricing surprises** — every add-on has its own pricing curve;
  the per-month cost can balloon when Redis, Postgres, Papertrail, and
  Scout APM each scale independently. Audit the add-on bill quarterly.

## Status

`stable` — full coverage. No coverage flag is emitted (deploy-target
packs are sub-selections only). Stack-forge surfaces Heroku as a
`supportedPlatforms` option for Ruby (Rails) and Python (Django) packs
once cross-wiring lands in PR 8+.
