# SolidStart

SolidStart is the meta-framework for **SolidJS** — a reactive UI library
built on fine-grained signals (the same model React's `useState` aspires to,
but compiled rather than reconciled). Solid components are JSX, but
under the hood they don't re-render: signal updates patch the DOM
directly. The result is React-shaped ergonomics with bundle sizes and
runtime perf closer to Svelte.

Stack-forge picks SolidStart when the language pack is `typescript` and
the team wants signals-first reactivity in JSX form — without leaving
React-style syntax behind for Svelte's templating.

## When to pick it

- React-style teams who want fine-grained reactivity without learning a
  new templating syntax.
- Performance-sensitive UIs where per-component overhead matters (charts,
  live dashboards, data grids).
- Edge-first deployments — SolidStart targets edge runtimes natively.
- Greenfield apps where the team values "JSX without the virtual DOM
  cost" and is willing to take a smaller ecosystem in exchange.

Skip when: the project depends on React-ecosystem libraries that don't
have Solid equivalents (RR/Next libraries, Material UI, etc.); the team
needs SolidStart-specific features but on a non-Solid runtime (use Solid
without Start for SPA-only work); the workload is mostly content sites
(Astro is the closer fit).

## Canonical tooling

| Concern | Tool | Notes |
|---|---|---|
| Test runner | `vitest` | Inherited from typescript language pack. `@solidjs/testing-library` for component tests. |
| Build | `npm run build` | Runs `vinxi build` (SolidStart's Vite-based builder). |
| Lint | `eslint .` | Inherited from typescript. `eslint-plugin-solid` for Solid-aware rules. |
| Dev server | `npm run dev` | `vinxi dev` — HMR, signal-preserving updates. |
| Routing | File-system routes | `src/routes/` with `index.tsx`, nested layouts via `(layout)/` groups. |

## Default deploy targets

| Target | Default for | Notes |
|---|---|---|
| Cloudflare Workers | Edge-first SolidStart apps | Via the cloudflare preset in `app.config.ts`. The opchain default. |
| Vercel | When the team is Vercel-native | `vercel-edge` or `vercel` preset; auto-preview deploys. |
| Netlify | Marketing-leaning sites | `netlify` or `netlify-edge` preset. |
| Node | Self-hosted long-running | `node-server` preset; standalone Node output. |
| Deno Deploy | Deno-flavored edge | `deno-deploy` preset; uses Deno's runtime. |

Deploy-target packs land in PR 7. Until then oc-stack-forge falls back to the
hardcoded matrix in `SKILL.md`.

## Signal contract

Solid's reactivity is the productivity story:

```tsx
import { createSignal, createResource } from "solid-js";

export default function Counter() {
  const [count, setCount] = createSignal(0);
  // No re-render — the JSX expression is wrapped by the compiler so only
  // the textContent of this <p> updates when count changes.
  return <p onClick={() => setCount(count() + 1)}>Clicked {count()}</p>;
}
```

Server data uses `createAsync` and route-level `query`/`action` primitives
that mirror Remix's loader/action split — but with signals on the client
so loading states and error boundaries fall out naturally.

## Gotchas oc-stack-forge will flag

- **Don't destructure props** — Solid props are reactive proxies. Destructuring
  breaks reactivity. Stack-forge's audit flags `const { foo } = props` in
  Solid components and recommends `props.foo` instead.
- **Signals vs. React-style state** — React-shaped intuition fights against
  Solid sometimes. The mental model swap (`signal()` calls are getters, not
  values) costs the team ~1 sprint to fully internalize.
- **Ecosystem gap** — fewer Solid-native libraries than React. Stack-forge
  flags React-only deps in the audit pass.
- **Vinxi maturity** — SolidStart's build layer (vinxi) is newer than
  Vite/Next/Remix tooling. Edge cases occasionally surface. Pin the version.

## Status

`stable` — full coverage in v1.4. Default visible
(`skills.coverage.solid.enabled` defaults to `true`). Targets SolidStart 1.x
and SolidJS 1.x signals.
