# PHP

Stack-forge's pick when the workload is **CRUD-shaped, content-heavy, or sits in an
ecosystem (WordPress, Magento, established Laravel codebase) that already speaks PHP.**
Modern PHP (8.1+) is a much better language than the one that gave PHP its reputation —
typed properties, enums, readonly classes, fibers — and the Laravel ecosystem rivals
Rails for productivity on classic web app shapes. Stack-forge nudges toward PHP when
the team profile signals PHP history, the hosting target is shared / commodity, or the
workload is "CMS or admin panel" rather than "edge API."

## When to pick it

- Greenfield CRUD apps where Laravel's batteries-included story shortens the path to
  a working admin + auth + queue + scheduler. Same gravity Rails has for Ruby.
- Existing PHP ecosystems — WordPress plugins, Magento extensions, legacy app
  modernisation. Stack-forge will not force a migration when the surrounding code is
  PHP.
- Workloads where hosting cost matters more than absolute performance — PHP runs on
  the cheapest shared hosting, scales horizontally cleanly, and uses commodity LAMP
  infrastructure.
- Teams who like Rails-style productivity but have stronger PHP than Ruby skills.

Skip when: the workload is latency-critical or compute-heavy (Go or Rust win); the
team has zero PHP experience and a greenfield project with no ecosystem pull (Ruby or
Python will ramp similarly fast without PHP's reputational baggage); the surface is
edge-runtime (no PHP there outside niche FaaS providers).

## Canonical tooling

| Concern | Tool | Notes |
|---|---|---|
| Test runner | `phpunit` | The standard. Pest is a popular alternative with a more expressive syntax — oc-stack-forge defers to whatever the project uses. CI runs `vendor/bin/phpunit`. |
| Build | `composer install --no-dev` | "Build" in PHP is producing a deployable vendor tree without dev dependencies. CI/CD images this directory. |
| Lint | `phpcs` | PHP_CodeSniffer; PSR-12 is the canonical ruleset. `phpstan` and `psalm` are heavier static-analysis tools that oc-stack-forge recommends adding once codebases pass ~5kLOC. |
| Format | `phpcbf` (sniffer auto-fix), `php-cs-fixer` | Both work; `php-cs-fixer` has richer rules. Pre-commit hook in most teams. |
| Package manager | Composer (Packagist) | Lockfile is `composer.lock`, committed. Stack-forge insists on lockfile + `composer install` (not `update`) in CI. |

## Frameworks

These are the php-language frameworks oc-stack-forge recommends:

- **Laravel** — the dominant full-stack framework. Stack-forge picks it for any
  greenfield PHP web app. Pairs with Eloquent ORM, Livewire/Inertia for hybrid
  full-stack, queues + scheduler built in.

Other niches oc-stack-forge will mention in advisories but does not pack:

- **Symfony** — Laravel's serious sibling; component-based architecture, used heavily
  in enterprise PHP. May get a dedicated framework pack in v1.5.
- **WordPress** — the CMS, not a framework, but oc-stack-forge will offer scaffolding
  advice for plugin/theme work. Out of v1.4 scope.
- **Slim / Lumen** — micro-frameworks for API-only services. Niche.

## Typed pipeline

PHP gained real static typing in 7+, sharpened further in 8+:

| Stage | Tool | Why |
|---|---|---|
| ORM / schema | Eloquent (Laravel default), Doctrine for Symfony / enterprise | Eloquent is ergonomic but loose; Doctrine when the team wants strict domain models. |
| API contract | Laravel API Resources + l5-swagger (OpenAPI from annotations) | Generates OpenAPI from controller annotations. `scribe` is a competitive alternative. |
| Client | `openapi-generator` | Generates typed clients from the l5-swagger spec. |
| Static analysis | `phpstan` (level 6+) or `psalm` | The closest PHP gets to a type checker. Catches whole classes of bug; worth adding to CI for any non-trivial app. |
| Validation | Laravel Form Requests, or `respect/validation` | Form Requests for HTTP boundary; Respect for arbitrary shapes. |

When oc-app-architect Phase 2 detects a first-party API surface and oc-stack-forge picks
PHP + Laravel, control passes to `oc-api-dev` to materialise the OpenAPI chain via
l5-swagger + openapi-generator.

## Default deploy targets

| Target | Default for | Notes |
|---|---|---|
| Laravel Forge + DigitalOcean | Laravel apps | First-party Laravel deploy story; Forge provisions the LAMP stack on a DO droplet. The opchain default for Laravel. |
| Laravel Vapor (AWS Lambda) | Serverless Laravel | Official serverless target; Lambda + RDS + S3 wired up by Vapor. |
| Heroku | Small PHP apps | Easy onboarding; the official PHP buildpack works fine for Laravel. |
| Render | Heroku-style alternative | Same shape as Heroku, often cheaper. |
| AWS Elastic Beanstalk | Enterprise lift-and-shift | When the team is already on AWS and wants a managed PHP runtime. |

Deploy-target packs land in PR 7. Until then oc-stack-forge falls back to the hardcoded
matrix in `SKILL.md`.

## Cost band (2026-Q2, rough)

| Tier | Forge + DO | Vapor | Heroku |
|---|---|---|---|
| Hobby | $12 (1 GB droplet + free Forge) | $0–10 (Lambda free tier) | $7 (eco dyno) |
| Small team (10K MAU) | $40–80 (2 GB droplet + managed Postgres) | $50–150 (Lambda + RDS + S3) | $50–100 + Postgres |

PHP is the cheapest mainstream backend at small scale — shared hosting starts at
$3/mo. Above small scale the pricing converges with other stacks. Check vendor pricing
at decision time.

## Gotchas oc-stack-forge will flag

- **N+1 queries in Eloquent** — `with()` eager loading is easy to forget. Stack-forge's
  audit pass flags `->all()` followed by accessor calls on relations.
- **Type juggling in older code** — pre-8.0 PHP's loose comparison (`==`) bites at
  boundary conditions. Stack-forge enforces `===` and `!==` in new code and flags
  loose-comparison usage in audits.
- **Composer lockfile drift in CI** — `composer install` (lockfile-respecting) vs.
  `composer update` (lockfile-rewriting) confusion. Stack-forge insists on
  `composer install --no-dev --optimize-autoloader` in production builds.
- **Memory limits on long-running queues** — PHP-FPM was designed for short-lived
  requests; queue workers and long jobs can leak memory across requests. Stack-forge
  recommends Laravel Horizon with auto-restart on memory threshold.
- **Session/cache filesystem locking** — file-based session storage doesn't scale across
  nodes. Stack-forge audits for `session.save_handler=files` in production configs
  and recommends Redis or database-backed sessions.

## Status

`stable` — full coverage in v1.4. Default visible
(`skills.coverage.php.enabled` defaults to `true`). PHP 8.2+ is the canonical
target; 8.1 LTS supported. PHP 7.x and earlier are out of scope — modernise first.
