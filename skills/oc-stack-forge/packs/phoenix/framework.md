# Phoenix

Phoenix is the default web framework for Elixir — and the dominant story
inside the ecosystem. It pairs a Rails-style mental model (routes,
controllers, contexts, views) with the BEAM's concurrency model, plus
**LiveView** for server-rendered interactivity that pushes DOM diffs over a
persistent WebSocket. Stack-forge picks Phoenix automatically when the
language pack is `elixir` and the surface is web-facing.

## When to pick it

- Any web-facing Elixir service: APIs, server-rendered UIs, internal tools.
- LiveView-shaped workloads — admin panels, dashboards, multi-user
  collaborative editors — where pushing DOM diffs from the server beats the
  SPA + API tax.
- Real-time channels (chat, presence) on top of Phoenix Channels, which sit
  cleanly on the BEAM's per-process isolation.
- Teams who like Rails's productivity story but want better concurrency.

Skip when: you only need a CLI or background worker (use plain Elixir +
OTP); the API surface is so small it doesn't justify a framework (Plug
directly is fine); the team needs Phoenix-specific features but on a
non-Elixir runtime — they don't exist outside BEAM.

## Canonical tooling

| Concern | Tool | Notes |
|---|---|---|
| Test runner | `mix test` | Phoenix tests are ExUnit. `Phoenix.LiveViewTest` for LiveView assertions. |
| Build | `mix compile` | Same as the Elixir language pack. `mix phx.gen.release` for production releases. |
| Lint | `mix credo --strict` | Same as Elixir base. Phoenix scaffolding has a clean credo profile. |
| Asset pipeline | `mix assets.deploy` | esbuild + tailwind built in since Phoenix 1.7. No webpack. |
| Generator | `mix phx.gen.live`, `mix phx.gen.json`, `mix phx.gen.html` | Idiomatic scaffolds; oc-stack-forge defers to these for greenfield. |

## When oc-stack-forge picks Phoenix

The language → framework decision is short:

```
language = elixir
purpose ∈ {web-api, web-app, real-time, internal-tool, admin-panel}
→ Phoenix
```

When the workload is "pure background worker" or "CLI tool" or "library",
oc-stack-forge picks plain Elixir + OTP without Phoenix.

## LiveView vs. SPA

Phoenix LiveView is a strong default but not always the right call:

| Use LiveView | Use SPA + Phoenix API |
|---|---|
| Users are geographically close to the server | Cross-continent users (WS RTT becomes felt) |
| State is server-authoritative (admin, dashboards) | Heavy client-side state (rich editors, games) |
| Single team owning full stack | Separate frontend team with React/Vue/Svelte preference |
| Offline support not needed | PWA / offline support required |

Stack-forge's advisory flags LiveView when the workload signals match and
escalates to SPA when latency or offline concerns dominate.

## Default deploy targets

| Target | Default for | Notes |
|---|---|---|
| Fly.io | The opchain default for Phoenix | Built-in support for `fly launch`; clustering for LiveView and Channels via private networking. |
| Gigalixir | Pure Phoenix shops | Heroku-style; native BEAM clustering and hot upgrades. |
| AWS ECS / Fargate | Enterprise with existing AWS | Container `mix release` output; manage clustering via libcluster. |
| Render | Small single-node Phoenix | Simpler than Fly but loses clustering ergonomics. |

Deploy-target packs land in PR 7. Until then oc-stack-forge falls back to the
hardcoded matrix in `SKILL.md`.

## Gotchas oc-stack-forge will flag

- **LiveView WebSocket fan-out at scale** — broadcasting to many subscribers
  is a per-process cost. Phoenix.PubSub is great up to ~50k connections per
  node; beyond that, look at sharded pubsub or external brokers.
- **N+1 in Ecto** — `Repo.preload` and `Ecto.Query.preload/3` are easy to
  forget. Stack-forge's audit pass flags missing preloads in iterated queries.
- **Asset pipeline migration** — pre-1.7 Phoenix used webpack/brunch.
  Migrating to esbuild is a one-time project. Stack-forge advisories cover
  this when scaffolding into an older app.
- **Releases vs. mix deploy** — `mix release` is the production path. Do not
  `mix run` in production; you lose distillery-era release ergonomics and
  hot upgrade story.

## Status

`stable` — full coverage in v1.4. Default visible
(`skills.coverage.phoenix.enabled` defaults to `true`). Phoenix 1.7+ is the
canonical target; older versions are out of scope.
