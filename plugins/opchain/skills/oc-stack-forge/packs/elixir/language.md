# Elixir

Stack-forge's pick when the workload is **concurrency-heavy, fault-tolerant, and
soft-real-time** — chat backends, presence systems, IoT fan-in, live dashboards.
The BEAM gives you preemptive scheduling, supervisor trees, and per-request
isolated processes for free; Elixir gives that runtime an ergonomic, modern
syntax. When the team's instinct is "we need a queue + websockets + per-user
state" oc-stack-forge nudges toward Elixir before the team accidentally rebuilds
half of OTP in another language.

## When to pick it

- Connection-heavy services: chat, presence, live feeds, IoT ingest, dashboards
  that push updates.
- Workflows that fan out into many supervised tasks with per-task retry and
  isolation requirements.
- Teams that want Rails-style ergonomics (Phoenix) without the GIL pain at the
  10k-concurrent-user mark.
- Embedded LiveView surfaces where the server pushes DOM diffs and skips the
  separate frontend framework entirely.

Skip when: the workload is a thin CRUD API with no concurrency story (Python or
TypeScript win on team familiarity); compute-bound numerical work (Elixir is
slow at tight loops, and NIFs sacrifice the BEAM safety story); the team has
zero Erlang/OTP exposure and a < 6-week timeline (the supervisor mental model
is the productivity bottleneck).

## Canonical tooling

| Concern | Tool | Notes |
|---|---|---|
| Test runner | `mix test` | ExUnit; built into mix. `--cover` for coverage; `--slowest 10` for triage. |
| Build | `mix compile` | Incremental. CI uses `mix compile --warnings-as-errors`. |
| Lint | `mix credo --strict` | Style + readability rules; `--strict` catches the long-tail. |
| Format | `mix format --check-formatted` | Built in; runs in CI as a gate. |
| Package manager | `mix` (Hex.pm) | Lockfile is `mix.lock`; deps live in `deps/`. |

## Frameworks

These are the elixir-language frameworks oc-stack-forge recommends:

- **Phoenix** — full-stack web framework. The default for any web-facing
  Elixir service. Pairs naturally with LiveView for server-rendered
  interactivity without a JS framework.

Niche frameworks not yet packed: Nerves (embedded Linux), Membrane (media
pipelines), Broadway (data ingest). Stack-forge mentions these in advisory
notes when the workload signals match.

## Typed pipeline

Elixir is dynamically typed, but the ecosystem has compensating layers:

| Stage | Tool | Why |
|---|---|---|
| Schemas | Ecto.Schema + Ecto.Changeset | Source of truth for DB shape and validation; surfaces typed errors at the boundary. |
| API contract | OpenAPI via `open_api_spex`, or Phoenix-native channels for WS | OpenAPI for REST surfaces; channels for stateful socket flows. |
| Static checks | `dialyzer` (via `dialyxir`) | Optional type inference. Slow but catches whole classes of bug; worth wiring into CI on settled modules. |
| Validation | Ecto.Changeset or Norm | Changeset for DB-shaped data; Norm for arbitrary shapes. |

Stack-forge will not force Dialyzer on a new project — the cold-start cost is
real. It does recommend turning it on once the codebase passes ~5kLOC.

## Default deploy targets

| Target | Default for | Notes |
|---|---|---|
| Fly.io | Phoenix + LiveView | First-class Elixir support; clustered BEAM nodes via private networking. The opchain default for Elixir. |
| Gigalixir | Pure Elixir/Phoenix | Heroku-style PaaS purpose-built for BEAM apps; cluster + hot upgrade support. |
| AWS ECS / Fargate | Enterprise with existing AWS | Container the release; manage clustering yourself via libcluster. |
| Render | Single-node Phoenix | Fine for low-scale; loses BEAM clustering ergonomics. |

Deploy-target packs land in PR 7. Until then oc-stack-forge falls back to the
hardcoded matrix in `SKILL.md`.

## Cost band (2026-Q2, rough)

| Tier | Fly.io | Gigalixir | AWS ECS |
|---|---|---|---|
| Hobby | $0–5 (1 shared cpu) | $9 (1 free worker) | $0 if under free tier |
| Small team (10K MAU, real-time) | $30–80 (multi-region) | $100+ (clustered) | $80–200 |

Check vendor pricing at decision time. Real-time workloads push cost up faster
than CRUD APIs because each open WebSocket is a persistent process.

## Gotchas oc-stack-forge will flag

- **Cold-start mental model** — supervisor trees, processes, and message passing
  are non-trivial. Teams new to OTP need ramp-up time; oc-stack-forge advisories
  cover this when the team profile signals no Erlang experience.
- **NIF temptation** — the BEAM's safety story dies the moment you load a NIF
  that segfaults. Stack-forge flags any NIF dependency in the audit pass.
- **Hot deployments are advanced** — releases support live code reload, but the
  app code has to be written for it (versioned state, upgrade callbacks). Most
  teams ship via blue-green and skip hot upgrades entirely; that's fine.
- **Phoenix LiveView vs. SPA** — LiveView is amazing for low-latency surfaces
  (same data center as the user). Cross-continent users feel the WS round trip;
  oc-stack-forge recommends static SPA + Channels in that case.

## Status

`stable` — full coverage in v1.4. Default visible
(`skills.coverage.elixir.enabled` defaults to `true`). No deprecation path
planned.
