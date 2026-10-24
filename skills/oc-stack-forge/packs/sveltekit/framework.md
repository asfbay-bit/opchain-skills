# SvelteKit

SvelteKit is the official application framework for Svelte. It pairs a
compiler-first UI library (Svelte compiles components to surgical DOM ops,
no virtual DOM) with a Remix-style routing model (file-system routes,
`+page.server.ts` loaders, `+page.svelte` views, form actions). The bundle
output is small enough that SvelteKit + a real CMS can fit in a Cloudflare
Worker for most sites.

Stack-forge picks SvelteKit when the language pack is `typescript` and the
workload wants the smallest production JS payload without giving up SSR.

## When to pick it

- Marketing sites, blogs, content-heavy apps where bundle size dominates
  the perf budget.
- Teams who prefer Svelte's syntax (`{#each}`, `$:`, stores) over JSX.
- Edge-first deployments where each KB of bundled JS costs cold-start time.
- Internal tools that benefit from form-action ergonomics like Remix but
  with smaller payloads.

Skip when: the team is React-locked (Remix is the closer fit); the app is
purely API + native mobile (no web frontend at all); migration cost from an
existing React app is high (Svelte's mental model is different enough that
"port it over a weekend" rarely works).

## Canonical tooling

| Concern | Tool | Notes |
|---|---|---|
| Test runner | `vitest` | Inherited from typescript language pack. `@testing-library/svelte` for component tests; `@playwright/test` for E2E. |
| Build | `npm run build` | Runs `vite build` with the SvelteKit adapter wired in. |
| Lint | `eslint .` | Inherited from typescript. `eslint-plugin-svelte` for Svelte-aware rules. |
| Dev server | `npm run dev` | `vite dev` — HMR; preserves Svelte component state on hot reload. |
| Routing | File-system routes | `src/routes/` with `+page.svelte`, `+layout.svelte`, `+page.server.ts`, `+page.ts`. |

## Default deploy targets

| Target | Default for | Notes |
|---|---|---|
| Cloudflare Workers | Edge-first SvelteKit apps | `@sveltejs/adapter-cloudflare` is first-class; the opchain default. |
| Vercel | When the team is Vercel-native | `@sveltejs/adapter-vercel`; native preview deploys. |
| Netlify | Marketing-leaning sites | `@sveltejs/adapter-netlify`; functions for server work. |
| Node | Self-hosted long-running | `@sveltejs/adapter-node`; output is a standalone Node server. |
| Static | Pure SSG sites | `@sveltejs/adapter-static`; no server runtime needed. |

Deploy-target packs land in PR 7. Until then oc-stack-forge falls back to the
hardcoded matrix in `SKILL.md`.

## Load function contract

SvelteKit uses universal load functions (run on server + client) plus
server-only variants:

```ts
// +page.server.ts — server-only, runs on every request.
export async function load({ params, fetch, locals }) {
  return { post: await db.posts.find(params.id) };
}

// +page.ts — universal, runs server-first then client on navigation.
export async function load({ data, fetch }) {
  return { ...data, related: await fetch(`/api/related/${data.post.id}`) };
}

// +page.svelte — view.
<script lang="ts">
  let { data } = $props();
</script>
```

The two-tier load model lets you decide per-route whether work happens
server-side, client-side, or both. Stack-forge picks `+page.server.ts` for
data that touches the DB or secrets and `+page.ts` for derived fetches.

## Gotchas oc-stack-forge will flag

- **Adapter mismatch** — picking the wrong adapter (e.g. node when you want
  cloudflare) causes confusing deploy failures. Stack-forge writes the
  adapter into the scaffold based on the chosen deploy target.
- **Universal vs server-only loaders** — putting secrets in a universal
  loader leaks them to the client. Stack-forge audits for this.
- **Form action vs API route** — form actions are co-located with pages;
  API routes (`+server.ts`) are separate. For non-form mutations, use API
  routes. Stack-forge guides the choice by data flow shape.
- **Svelte 5 runes** — Svelte 5 swapped reactive declarations (`$:`) for
  runes (`$state`, `$derived`, `$effect`). Project age determines which
  syntax is in play. New scaffolds get Svelte 5 + runes.

## Status

`stable` — full coverage in v1.4. Default visible
(`skills.coverage.sveltekit.enabled` defaults to `true`). Targets
SvelteKit 2 + Svelte 5 (runes-first).
