# Bun

Bun is technically a TypeScript/JavaScript runtime, not a separate language —
but it gets its own oc-stack-forge pack because the canonical toolchain
(`bun test`, `bun build`, `bun install`) diverges from Node's, and the runtime
APIs (`Bun.serve`, `Bun.file`, native SQLite) make it a different surface to
target. Picking `bun` over `typescript` is a runtime/toolchain choice, not a
language choice; oc-stack-forge models it as a sibling language pack so the
adapter graph stays simple.

## When to pick it

- Greenfield TS services where startup time and install time matter (Bun is
  3–10× faster on both versus npm+node).
- Single-binary deployments — `bun build --compile` produces a standalone
  executable, no `node_modules` shipped.
- Workloads using Bun's native APIs: `Bun.serve` for HTTP, `bun:sqlite` for
  embedded SQL, `Bun.password` for crypto.
- Test-heavy projects where the test runner being part of the runtime
  (`bun test`, ESM-native, no Jest config) removes setup friction.

Skip when: the project depends on Node-only native modules (some still don't
load under Bun's compat layer); the deploy target is Cloudflare Workers (no
Bun runtime there — use the `typescript` pack); the team is already
productive on Node and the wins don't justify the migration.

## Canonical tooling

| Concern | Tool | Notes |
|---|---|---|
| Test runner | `bun test` | ESM-native, Jest-API-compatible, runs in-process. No config file needed for most projects. |
| Build | `bun run build` | Project script. Often wraps `bun build` (bundler) or `tsc` (type emit only). |
| Lint | `biome check .` | Biome is the canonical lint+format for Bun projects; ESLint also works. |
| Format | `biome format --write .` | Built into Biome; fast enough to run on save. |
| Package manager | `bun install` | Lockfile is `bun.lockb` (binary). Compatible with `package.json`. |

## Frameworks

Bun runs most JS/TS frameworks unchanged — Hono, Elysia, Astro, SvelteKit, Vite
projects all work. Stack-forge currently packs frameworks under the
`typescript` language because the framework surface (routing, middleware, JSX)
doesn't change between Node and Bun.

Bun-native frameworks worth noting:

- **Elysia** — Bun-first TS web framework. Designed around Bun's HTTP server
  and type inference; faster than Hono on Bun by a measurable margin.
- **Hono** — runs on Bun first-class. Same API as on Node/Workers/Deno.

These are tracked under their respective framework packs (which target the
`typescript` language); pick Bun when the runtime characteristics win the
decision, then pick a framework that runs on Bun.

## Typed pipeline

Same as the TypeScript pack — Bun is TS-native at the toolchain level. The
chain `DB schema → ORM types → API spec → generated client → frontend` works
identically. Bun-specific notes:

| Stage | Tool | Why |
|---|---|---|
| ORM / schema | Drizzle | First-class Bun support; `bun:sqlite` driver included. Prisma works but loses some Bun-native perf. |
| API contract | Zod + framework-specific OpenAPI plugin | Same as TS. |
| Test integration | `bun test` runs Vitest-style tests directly | No Vitest install needed for most projects. |
| Native APIs | `Bun.serve`, `bun:sqlite`, `Bun.file` | When perf matters, dropping to Bun-native APIs is the win. |

## Default deploy targets

| Target | Default for | Notes |
|---|---|---|
| Fly.io | Long-running Bun services | Native Bun support via `fly.toml` builder; clustering via private networking. |
| Render | Simpler PaaS | Native Bun runtime; deploy from git. |
| AWS Lambda | Enterprise with existing AWS | Bun runtime available via Lambda Layers or container deploy. |
| bun.sh deploy | When it ships | Currently in preview; not the opchain default until GA. |
| Cloudflare Workers | NOT supported | Workers runtime is V8 + Workers APIs, not Bun. Use `typescript` pack instead. |

Deploy-target packs land in PR 7. Until then oc-stack-forge falls back to the
hardcoded matrix in `SKILL.md`.

## Cost band (2026-Q2, rough)

| Tier | Fly.io | Render | AWS Lambda |
|---|---|---|---|
| Hobby | $0–5 | $0 (free tier) | $0 (1M req free) |
| Small team (10K MAU) | $10–25 | $19+ (Starter) | $10–30 |

Bun's smaller container size and faster cold starts tend to shave 10–20% off
PaaS costs vs equivalent Node services at the same workload.

## Gotchas oc-stack-forge will flag

- **Native module compat** — most Node native modules work, but the long tail
  (`better-sqlite3`, some image libs, some crypto libs) still fails. Audit
  `package.json` for native deps before committing to Bun.
- **Bun is a moving target** — minor version bumps occasionally change
  behavior. Pin the Bun version in CI and on deploy.
- **Cloudflare Workers ≠ Bun** — common confusion. Workers is V8 + Workers
  APIs. If the deploy target is Workers, you're on the `typescript` pack
  regardless of local dev runtime.
- **Workspaces** — Bun's workspace support is solid but newer than pnpm/npm;
  third-party monorepo tooling (Turborepo, Nx) sometimes lags.

## Status

`stable` — full coverage in v1.4. Default visible
(`skills.coverage.bun.enabled` defaults to `true`). Bun reached 1.0 in 2023
and has been production-stable since; the pack reflects current consensus.
