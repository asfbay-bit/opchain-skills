# Python

The default choice for data-shaped workloads, ML/AI integration, and
batteries-included web apps where convention beats configuration. Stack-forge
picks Python when "compute over data" or "ship the admin panel today" is the
dominant pressure.

## When to pick it

- Data processing, ML feature pipelines, or any workload that wants to call
  into `numpy` / `pandas` / `torch` without an interop dance.
- Solo founders / small teams who want a working admin panel, ORM,
  migrations, and auth on day one (→ Django).
- API services where Pydantic-derived schemas + auto-generated OpenAPI are a
  feature, not a chore (→ FastAPI).
- Scripting glue: cron jobs, ETL, infra automation.

Skip when: the workload is latency-sensitive at the millisecond level
(Go/Rust), or the team wants the API and frontend to share types in-process
(TypeScript).

## Canonical tooling

| Concern | Tool | Notes |
|---|---|---|
| Test runner | `pytest` | The de-facto default; `unittest` works but pytest is what oc-stack-forge recommends. |
| Build | `python -m build` | PEP 517 / `pyproject.toml` modern packaging. |
| Lint + format | `ruff check .`, `ruff format .` | Replaces flake8 + isort + black; one tool, one config. |
| Type checker | `mypy` (preferred) or `pyright` | Pydantic models give you runtime + type-time validation. |
| Package manager | `pip` (default), `uv` (faster), `poetry` (lockfile-driven) | Stack-forge stays agnostic; defers to whichever lockfile is present. |
| Virtualenv | `venv` (default), `uv venv`, `poetry env` | Always; system Python is never the right answer in production. |

## Frameworks (land in later v1.4 PRs)

These are the python-language frameworks oc-stack-forge will recommend once
their packs ship in PRs 4-7:

- **Django** — full-stack, batteries-included; admin panel, ORM, migrations,
  auth. Default pick for solo / small-team server-rendered apps.
- **FastAPI** — async API framework; Pydantic-driven OpenAPI generation; the
  default when the workload is API-only.
- **Flask** — micro-framework; default when the project is genuinely small
  or there's a strong reason to avoid Django/FastAPI conventions.

PR 2 ships the language pack only. Framework packs (and the bidirectional
`frameworks: [django, fastapi, flask]` entry on this pack) arrive in PRs 4-7.

## Typed pipeline

`DB schema → ORM models → Pydantic models → OpenAPI → openapi-typescript
client`. Python's type chain hops out of the language at the API boundary —
Pydantic and SQLAlchemy carry types in-process; the frontend typically
generates a TypeScript client from the emitted OpenAPI spec.

| Stage | Django default | FastAPI default | Notes |
|---|---|---|---|
| ORM / schema | Django models | SQLAlchemy 2.x | Django includes migrations; SQLAlchemy pairs with Alembic. |
| API contract | DRF + drf-spectacular | Pydantic → auto OpenAPI | FastAPI emits OpenAPI for free; DRF needs the plugin. |
| Validation | DRF serializers | Pydantic | Pydantic doubles as runtime validator and type source. |
| Client | `openapi-typescript` | `openapi-typescript` | Generated from the emitted OpenAPI spec. |

When oc-app-architect Phase 2 detects a first-party API surface and oc-stack-forge
has picked Python, control passes to `oc-api-dev` to author the OpenAPI surface
explicitly and generate the SDK.

## Default deploy targets

| Target | Default for | Notes |
|---|---|---|
| Render | Django (primary), FastAPI | Heroku ergonomics, generous free tier; Postgres is one click. |
| Fly.io | FastAPI workloads needing edge placement | Regional VMs without configuring a CDN. |
| AWS Elastic Beanstalk / ECS | Enterprise with existing AWS | Higher floor, more knobs. |
| Cloud Run | Containerised stateless services | Scales to zero; pairs cleanly with Cloud SQL. |
| Cloudflare Workers (Python) | Beta runtime | Edge Python is in preview; oc-stack-forge does not default to it yet. |

Deploy-target packs land alongside framework packs in PRs 4-7.

## Cost band (2026-Q2, rough)

| Tier | Django on Render | FastAPI on Fly.io |
|---|---|---|
| Hobby | $0 (free web + Postgres) | $0 (3 shared-cpu-1x) |
| Small team (10K MAU) | $14 (starter) – $50 | $20 + Postgres cluster |

Check vendor pricing at decision time — these are anchors, not commitments.

## Gotchas oc-stack-forge will flag

- **Python version skew** — production `3.11` vs dev `3.13` is a common
  source of subtle bugs. Stack-forge insists on pinning via `pyproject.toml`
  + a `python-version` file (or `uv`-managed envs).
- **Sync vs async confusion** — Django + DRF is sync; FastAPI is async by
  default. Mixing the two without `asyncio.to_thread` or `sync_to_async`
  causes silent stalls. Stack-forge flags projects that try to share code
  between the two without an explicit boundary.
- **The GIL** — CPU-bound workloads do not parallelise with threads. Stack-
  forge nudges toward `multiprocessing`, `concurrent.futures`, or moving the
  hot path to Go/Rust via FFI.
- **Postgres connection pooling** — Render / Fly / Cloud Run all spawn
  short-lived workers. Without PgBouncer (or `asyncpg.create_pool` with a
  cap) Postgres connection counts spike and the DB starts refusing
  connections. Stack-forge bakes this into its FastAPI deploy guidance.

## Status

`stable` — full coverage. Default visible (`skills.coverage.python.enabled`
defaults to `true`). No deprecation path planned.
