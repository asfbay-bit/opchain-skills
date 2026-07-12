# Ruby

The convention-over-configuration choice. Stack-forge picks Ruby when the
team already knows Rails, or when a CRUD app needs to ship by Friday with
Hotwire/Turbo replacing the SPA. The catalog's other languages give you
more knobs; Ruby gives you fewer decisions.

## When to pick it

- Team has Rails experience and is allergic to greenfield wiring.
- App is CRUD-heavy with traditional auth (sessions, devise) — Rails'
  scaffolding accelerates the first six weeks dramatically.
- Hotwire / Turbo / Stimulus replace a full SPA — server-rendered UI with
  surgical client interactivity.
- Heroku's review-app + staging + prod pipeline maps cleanly to the team's
  release cadence.

Skip when: cost-at-scale matters more than dev velocity (Heroku/Render
charges add up faster than DIY container hosting), or the workload is
genuinely API-only (FastAPI / Hono are leaner choices), or the team has no
Ruby pull (Python/TS will be a softer landing).

## Canonical tooling

| Concern | Tool | Notes |
|---|---|---|
| Test runner | `rspec` (preferred), `minitest` | Rails defaults to minitest; oc-stack-forge recommends rspec for richer matchers, but stays agnostic. |
| Build | `bundle exec rake build` | For gem packaging. Rails apps don't really "build" — they're deployed as source + assets. |
| Lint | `bundle exec rubocop` | The de-facto standard; pair with `standard` for opinionated defaults. |
| Type checker | `sorbet` or `rbs` + `steep` | Optional; Ruby typing is gradual. Stack-forge defaults to "no static types" unless the project already uses one. |
| Package manager | `bundler` | One canonical answer. `gem install` for system gems, `bundle` for app deps. |
| Asset pipeline | `propshaft` (Rails 7+), `importmap-rails`, esbuild via `jsbundling-rails` | Stack-forge picks propshaft + importmap for Hotwire apps, esbuild for anything with a real JS build. |

## Frameworks (land in later v1.4 PRs)

These are the ruby-language frameworks oc-stack-forge will recommend once their
packs ship in PRs 4-7:

- **Rails** — the default; full-stack, convention-driven, Hotwire-aware.
  This is the framework oc-stack-forge actually picks when you choose Ruby.
- **Sinatra** — micro-framework; default when "Rails is overkill" for a
  tiny service.

PR 2 ships the language pack only. Framework packs (and the bidirectional
`frameworks: [rails, sinatra]` entry on this pack) arrive in PRs 4-7.

## Typed pipeline

Ruby's typed pipeline is gradual. The default chain:

`DB schema → ActiveRecord models → schema.rb → Rswag/committee OpenAPI →
openapi-typescript client`.

| Stage | Default | Alternative | Notes |
|---|---|---|---|
| ORM / schema | ActiveRecord | Sequel | Rails picks ActiveRecord; Sinatra apps often use Sequel for explicit SQL. |
| Migrations | `rails db:migrate` | `sequel-rails`, raw SQL | Rails migrations are idiomatic and well-tooled. |
| API contract | Rswag (OpenAPI from request specs) | committee (OpenAPI-first validation) | Rswag is more common; committee inverts the flow. |
| Validation | ActiveModel validations + strong params | dry-validation | ActiveModel for in-model rules; dry-validation for explicit schema objects. |
| Client | `openapi-typescript` | grape-swagger (if using Grape) | Generated from the emitted OpenAPI spec. |

When oc-app-architect Phase 2 detects a first-party API surface and oc-stack-forge
has picked Ruby, control passes to `oc-api-dev` to author the contract
explicitly and generate the SDK.

## Default deploy targets

| Target | Default for | Notes |
|---|---|---|
| Heroku | Rails (primary) | Pipeline ergonomics; review apps; Postgres add-on; Sidekiq Pro available. |
| Render | Rails (secondary) | Cheaper than Heroku at hobby tier; Heroku-like UX without the eco-dyno sleep. |
| Fly.io | Rails apps needing regional placement | `fly launch` recognises Rails; works well with Hotwire's SSE/WebSocket needs. |
| AWS / GCP container runtimes | Enterprise | Higher floor; pair with managed Postgres + Redis + Sidekiq. |

Deploy-target packs land alongside framework packs in PRs 4-7.

## Cost band (2026-Q2, rough)

| Tier | Heroku | Render | Fly.io |
|---|---|---|---|
| Hobby | $0 (eco dyno; sleeps) | $0 (free web; Postgres tier) | $0 (3 shared-cpu-1x) |
| Small team (10K MAU) | $50 (hobby + mini Postgres) – $150 | $25 – $60 | $20 + Postgres cluster |

Heroku is the most expensive at scale and the most ergonomic at any scale.
Stack-forge picks it when dev velocity > monthly bill; otherwise Render.

## Gotchas oc-stack-forge will flag

- **Background jobs are not optional** — every non-trivial Rails app needs
  Sidekiq (or a Solid Queue / Good Job equivalent). Stack-forge bakes the
  worker process into the deploy plan from day one; retrofitting it later
  is painful.
- **Asset pipeline drift** — Rails has had Sprockets, Webpacker, jsbundling,
  importmap, and propshaft in living memory. Stack-forge picks propshaft +
  importmap for Hotwire-shaped apps; only reaches for jsbundling/esbuild
  when the project needs npm packages at runtime.
- **N+1 queries** — ActiveRecord makes it trivial to fan out to the
  database. Stack-forge nudges toward `bullet` (dev-time linting) + the
  `strict_loading` flag (production guardrail).
- **Heroku free tier disappeared** — the "$0 hobby" line means eco dyno,
  which sleeps. If the demo demands 24/7 uptime, jump to Render or pay for
  Heroku's basic dyno.

## Status

`stable` — full coverage. Default visible (`skills.coverage.ruby.enabled`
defaults to `true`). No deprecation path planned.
