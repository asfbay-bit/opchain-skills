# TypeScript

The opchain default for full-stack web work — API + frontend in the same
language, with native type safety and the broadest deploy-target coverage in
the catalog. Stack-forge picks TypeScript first when the team has no strong
language pull and the workload looks like "API behind a UI."

## When to pick it

- Full-stack JS/TS where the API and frontend share types.
- Edge-first deployments (Cloudflare Workers, Vercel Edge) — TypeScript is the
  first-class runtime there.
- Teams already on `npm`/`pnpm`/`bun`; the tooling Just Works.
- API-first services that want OpenAPI generation without leaving the
  language.

Skip when: the workload is data/ML-heavy (Python wins), latency-sensitive
single-binary microservices (Go or Rust win), or the team has a strong
incumbent in another language with no migration appetite.

## Canonical tooling

| Concern | Tool | Notes |
|---|---|---|
| Test runner | `vitest` | Fast, ESM-native, plays well with Astro / Vite / Hono. |
| Build | `npm run build` | Project script; usually wraps `tsc` + bundler. |
| Lint | `eslint .` | TypeScript ESLint plugin set; flat-config in newer projects. |
| Format | `prettier --write .` | Optional but oc-stack-forge defaults to assuming it's present. |
| Package manager | `npm` (default), `pnpm`, `bun` | Stack-forge stays agnostic; defers to lockfile present. |

## Frameworks (land in later v1.4 PRs)

These are the typescript-language frameworks oc-stack-forge will recommend once
their packs ship in PRs 4-7:

- **Hono** — edge-first API framework; default for Cloudflare Workers.
- **Astro** — content + lightly-dynamic sites; the opchain.dev site uses it.
- **Next.js** — SSR + app router; default for Vercel.
- **Remix** — SSR with web-standards data loading.
- **SvelteKit** — leaner SSR alternative.
- **Express / Fastify** — Node-runtime APIs without edge constraints.

PR 2 ships the language pack only. Framework packs (and their bidirectional
`frameworks: […]` entries on this pack) arrive in PRs 4-7.

## Typed pipeline

`DB schema → ORM types → API spec → generated client → frontend`. TypeScript
is the only language in the catalog where this chain can be entirely
in-process — DB types, API contract, and client all the same source-of-truth
language. Default recommendations:

| Stage | Tool | Why |
|---|---|---|
| ORM / schema | Drizzle (preferred), Prisma | Drizzle stays close to SQL; Prisma is heavier but generates richer types. |
| API contract | Zod + `@hono/zod-openapi`, or tRPC | Zod is universal; tRPC eliminates the OpenAPI hop entirely for TS↔TS. |
| Client | `openapi-fetch` (REST), tRPC client | tRPC for monorepos; openapi-fetch when the API serves non-TS clients too. |
| Validation | Zod / Valibot | Same library on both sides — request validation = type generation. |

When oc-app-architect Phase 2 detects a first-party API surface and oc-stack-forge
has picked TypeScript, control passes to `oc-api-dev` to materialise the chain
(OpenAPI authoring, typed handlers, SDK generation).

## Default deploy targets

| Target | Default for | Notes |
|---|---|---|
| Cloudflare Workers | Edge APIs, static-leaning sites | The opchain default. Cheapest at low scale; D1 / KV / R2 in the same account. |
| Vercel | Next.js apps | Native support; generous free tier; auto-preview deployments. |
| Fly.io | Long-running Node services | When the workload is too stateful for edge runtime constraints. |
| AWS Lambda | Enterprise with existing AWS | Pair with API Gateway; SAM or SST for deployment. |
| Render | Server-rendered apps wanting Heroku ergonomics | Lower friction than AWS, more capable than Vercel for backends. |

Deploy-target packs land alongside the framework packs in PRs 4-7. Until then
oc-stack-forge falls back to its hardcoded recommendation table in `SKILL.md`.

## Cost band (2026-Q2, rough)

| Tier | Workers | Vercel | Fly.io |
|---|---|---|---|
| Hobby | $0 | $0 | $0 (3 shared-cpu-1x) |
| Small team (10K MAU) | $5–25 | $20 (Pro) + edge functions | $20 + Postgres cluster |

Check vendor pricing at decision time — these are anchors, not commitments.

## Gotchas oc-stack-forge will flag

- **ESM vs CommonJS** — modern bundlers and Workers demand ESM; some legacy
  npm packages still ship CJS-only. Stack-forge nudges toward ESM-first
  dependencies.
- **Edge runtime constraints** — no `fs`, no native modules, no long-lived
  background timers. If the project needs any of those, pivot deploy target
  to a container runtime (Fly.io / Render / AWS).
- **Type drift between client and server** — without a typed pipeline, the
  client gradually stops matching the API. The `oc-api-dev` skill exists to
  prevent that; oc-stack-forge flags projects that pick TypeScript without
  committing to the typed pipeline.

## Status

`stable` — full coverage. Default visible (`skills.coverage.typescript.enabled`
defaults to `true`). No deprecation path planned.
