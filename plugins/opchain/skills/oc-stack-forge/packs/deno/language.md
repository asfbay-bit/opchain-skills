# Deno

Like Bun, Deno is a TypeScript/JavaScript runtime — not a separate language —
but the toolchain (`deno test`, `deno task`, `deno lint`), the permission
model, and the deno.json contract make it a distinct oc-stack-forge surface. The
stand-out feature is permissions: a Deno program can't read the filesystem,
open the network, or read env vars without explicit `--allow-*` flags. That
makes Deno the natural pick when the workload has multi-tenant or
untrusted-input characteristics.

## When to pick it

- Multi-tenant runtimes where per-tenant code needs sandboxed defaults
  (Deno's permission model is the cleanest mainstream answer to "run user
  code safely").
- Edge deployments on Deno Deploy — global, instant, no cold start (Workers
  is the alternative; pick Deno Deploy when the team prefers Web Standard
  APIs over Workers-specific bindings).
- Scripting and tooling where the team values "no `node_modules`" and
  per-module URL imports.
- TypeScript-native projects that don't want a bundler/transpiler step
  (Deno runs `.ts` files directly).

Skip when: the project depends on Node-only native modules (npm: specifier
helps but isn't 100%); the deploy target is Cloudflare Workers (use
`typescript` pack); the team needs the npm ecosystem with no friction (Bun
is closer to that experience).

## Canonical tooling

| Concern | Tool | Notes |
|---|---|---|
| Test runner | `deno test` | Built in. Permissions default-deny — pass `--allow-*` flags or use `--allow-all` in CI. |
| Build | `deno task build` | Tasks defined in `deno.json`. `deno compile` for single-binary output. |
| Lint | `deno lint` | Built in, deno-aware (catches `console.log` left in code, etc.). |
| Format | `deno fmt` | Built in. No prettier needed. |
| Package manager | `deno add` (jsr/npm: specifiers) | Lockfile is `deno.lock`. URL imports still supported for legacy code. |

## Frameworks

Deno runs most JS/TS frameworks via npm: specifiers — Hono, Astro, SvelteKit
all work. The Deno-native framework story:

- **Fresh** — Deno-native, islands-architecture web framework. Server-rendered
  with selective hydration. Designed for Deno Deploy.
- **Hono** — Deno first-class; same API across Node/Bun/Workers/Deno.
- **Oak** — Express-style web framework for Deno. Older, less recommended now
  in favor of Hono.

These are tracked under their respective framework packs (which target the
`typescript` language); pick Deno when the runtime/permission characteristics
win the decision, then pick a framework that runs on Deno.

## Typed pipeline

TypeScript is the default file extension (Deno runs `.ts` natively). The chain
`DB schema → ORM types → API spec → generated client → frontend` works
identically to the TypeScript pack:

| Stage | Tool | Why |
|---|---|---|
| ORM / schema | Drizzle (npm: specifier) | Best Deno-native experience. Prisma also works via npm. |
| API contract | Zod + framework-specific OpenAPI plugin | Same as TS. |
| Test integration | `deno test` with `--allow-*` scoping | Use `--allow-net=api.example.com` not `--allow-all` for representative test coverage. |
| Permissions | `--allow-read=./data --allow-net=:8080` | Pin to minimum scope in CI; oc-stack-forge audits for blanket `--allow-all`. |

## Default deploy targets

| Target | Default for | Notes |
|---|---|---|
| Deno Deploy | Edge-first Deno apps | Native fit. Global edge, no cold start, integrated KV store. |
| Fly.io | Long-running Deno services | Container the Deno binary; clustering via private networking. |
| Render | Simpler PaaS | Native Deno runtime; deploy from git. |
| AWS Lambda | Enterprise with existing AWS | Deno Lambda runtime via container or community layers. |
| Cloudflare Workers | NOT supported | Workers is V8 + Workers APIs, not Deno. Use `typescript` pack. |

Deploy-target packs land in PR 7. Until then oc-stack-forge falls back to the
hardcoded matrix in `SKILL.md`.

## Cost band (2026-Q2, rough)

| Tier | Deno Deploy | Fly.io | Render |
|---|---|---|---|
| Hobby | $0 (1M req free) | $0–5 | $0 (free tier) |
| Small team (10K MAU) | $10–20 (Pro) | $10–25 | $19+ (Starter) |

Deno Deploy is cheapest at small scale because it bills per-request without
per-instance minimums.

## Gotchas oc-stack-forge will flag

- **Permissions in CI** — `--allow-all` in CI defeats the permission model.
  Stack-forge audits for blanket flags and recommends scope-pinned flags.
- **npm: specifier edge cases** — most npm packages work via `npm:lodash@4`
  style imports, but native modules and packages with deep `require()` chains
  still fail. Audit deps before commitment.
- **URL imports drift** — earlier Deno style imported modules from URLs
  (`https://deno.land/std/...`). Modern Deno uses jsr: and npm: specifiers;
  legacy code may need migration when std lib URLs change.
- **Deno Deploy ≠ Cloudflare Workers** — both are global edge JS runtimes
  but with different bindings (Deno KV vs Workers KV/D1) and different APIs.
  Pick early; switching costs are non-trivial.

## Status

`stable` — full coverage in v1.4. Default visible
(`skills.coverage.deno.enabled` defaults to `true`). Deno reached 2.0 in
late 2024 with stabilized npm compatibility; the pack reflects post-2.0
defaults.
