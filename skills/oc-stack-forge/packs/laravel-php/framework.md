# Laravel

Laravel is the dominant PHP web framework — and one of the rare batteries-included
frameworks where "everything just works." Routing, ORM (Eloquent), queues, scheduler,
auth, mail, validation, broadcasting, file storage — all first-party, all integrated.
Stack-forge picks Laravel automatically when the language pack is `php` and the
surface is web-facing. The Rails-style productivity story is the value proposition;
the ecosystem (Forge, Vapor, Nova, Horizon, Telescope) pushes it past Rails on the
operational side.

## When to pick it

- Any web-facing PHP service: REST APIs, server-rendered web apps (Blade), admin
  panels, internal tooling, hybrid full-stack (Livewire + Alpine.js, or Inertia +
  React/Vue).
- CRUD-heavy apps where Laravel's scaffolding (`php artisan make:model -mcr`) shortens
  the path to a working route + controller + migration + factory + seeder.
- Workloads that benefit from the integrated ecosystem: Horizon for queue dashboards,
  Telescope for local debugging, Nova for admin UIs, Cashier for Stripe billing.
- Teams that want Rails productivity but prefer PHP. The hosting cost story is
  consistently better than Rails at small scale.

Skip when: the workload is API-only at high scale and latency-critical (use Lumen
or a lighter framework, or pick Go/Rust); the surface is a CLI or library (use plain
PHP); the workload is edge-runtime (no PHP there).

## Canonical tooling

| Concern | Tool | Notes |
|---|---|---|
| Test runner | `phpunit` | Inherited from PHP language pack. Laravel ships with PHPUnit configured; Pest is the popular alternative. `php artisan test` is the canonical CLI runner. |
| Build | `composer install --no-dev` | Inherited from PHP. Frontend assets via `npm run build` (Vite, integrated since Laravel 9.19). |
| Lint | `phpcs` | Inherited from PHP. Laravel Pint (`./vendor/bin/pint`) is the framework-blessed code style fixer; opinionated PSR-12 + Laravel-specific rules. |
| Dev server | `php artisan serve` | Built-in dev server. Use `php artisan queue:work` + `php artisan schedule:work` to mirror production behaviour locally. |
| Generator | `php artisan make:*` | Idiomatic scaffolds (`make:model`, `make:controller`, `make:migration`, etc.); oc-stack-forge defers to these for greenfield. |

## When oc-stack-forge picks Laravel

The language → framework decision is short:

```
language = php
purpose ∈ {web-api, web-app, admin-panel, internal-tool, cms}
→ Laravel
```

When the workload is "WordPress plugin", "library", or "CLI tool", oc-stack-forge picks
plain PHP (or WordPress's plugin scaffolding) instead of Laravel.

## Eloquent vs. raw SQL

Laravel's ORM (Eloquent) is the productivity story but has scaling limits:

| Use Eloquent | Use Query Builder / raw SQL |
|---|---|
| CRUD on aggregate roots | Reporting queries (joins + aggregates) |
| Validation + accessors + relationships | Bulk inserts / updates |
| Single-record reads with eager loads | Anything where N+1 risk is high |
| Standard model lifecycle hooks | Window functions, CTEs, set operations |

Stack-forge's audit pass flags Eloquent collection iteration that loads related models
without `with()` eager loading.

## Full-stack patterns

Laravel offers several full-stack approaches; oc-stack-forge defaults by team profile:

| Pattern | When | Notes |
|---|---|---|
| **API-only + SPA** | Frontend team owns the UI separately | Laravel as a JSON API; React/Vue/etc. consume it. Standard CORS + Sanctum/Passport for auth. |
| **Livewire + Alpine.js** | Single team, Rails-style productivity | Server-rendered components with client interactivity; minimal JS. Laravel's blessed full-stack story since v3. |
| **Inertia.js + React/Vue/Svelte** | Single team, but wants a real SPA UX | Inertia bridges Laravel routes to JS pages; no API layer needed. Good middle ground. |
| **Blade-only** | Internal tools, content sites | Server-rendered HTML; minimal JS via Alpine.js. Cheapest to build and host. |

## Default deploy targets

| Target | Default for | Notes |
|---|---|---|
| Laravel Forge + DigitalOcean | The opchain default for Laravel | First-party deploy story; Forge provisions LAMP on a DO droplet, manages SSL, scheduler, queue workers. |
| Laravel Vapor (AWS Lambda) | Serverless Laravel at scale | Official serverless target; Lambda + RDS + S3 + SQS wired up by Vapor. Higher operational complexity than Forge. |
| Heroku | Small Laravel apps | Easy onboarding; the official PHP buildpack works. Add Horizon as a worker dyno. |
| Render | Heroku-style alternative | Same shape as Heroku, often cheaper. Background worker support for queues. |
| Fly.io | Multi-region Laravel | Container the app + Postgres on Fly's network. Good fit for global apps. |

Deploy-target packs land in PR 7. Until then oc-stack-forge falls back to the hardcoded
matrix in `SKILL.md`.

## Gotchas oc-stack-forge will flag

- **N+1 in Eloquent** — `with()` eager loading is easy to forget. Stack-forge audits
  flag `->all()` or `->get()` followed by relation access in a loop. Enable
  `Model::preventLazyLoading()` in non-production to catch these at dev time.
- **Queue workers without supervisor** — `php artisan queue:work` in a tmux session
  is a frequent prod-shaped footgun. Stack-forge insists on Supervisor / Horizon for
  queue workers in production.
- **`.env` committed accidentally** — `.env` is gitignored by default, but secrets
  leak via `.env.example` with real values, or via `.env.production` that someone
  adds. Stack-forge audits the repo for committed env files with non-placeholder values.
- **Migration order vs. seeders** — running migrations and seeders in the wrong order
  (e.g., seeders that reference tables not yet migrated) breaks fresh deploys.
  Stack-forge advises `php artisan migrate --seed --force` as the canonical CI step.
- **Mass assignment / `$fillable` drift** — adding columns to a model without updating
  `$fillable` causes silent assignment failures. Stack-forge audits flag `Model::create()`
  / `Model::fill()` calls in tests that pass fields not in `$fillable`.

## Status

`stable` — full coverage in v1.4. Default visible
(`skills.coverage.laravel-php.enabled` defaults to `true`). Laravel 11.x is the
canonical target; 10.x LTS supported. Laravel ≤ 9 is out of scope — upgrade first.
