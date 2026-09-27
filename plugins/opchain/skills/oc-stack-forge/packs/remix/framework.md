# Remix

Remix is the SSR-first React framework built around **web standard APIs**
(Request, Response, FormData). It picks up where Next.js's Pages Router left
off — co-located route modules with `loader` (server data) and `action`
(mutations), progressive enhancement, and a strong "the platform is the
framework" philosophy. Now a sibling of React Router under the same
maintainers; the v3 codebase is converging the two surfaces.

Stack-forge picks Remix when the language pack is `typescript` and the
workload is server-rendered, data-loading-heavy, and benefits from web-form
semantics.

## When to pick it

- Apps where progressive enhancement matters — forms work without JS, then
  layer on client behavior.
- Data-loading-heavy UIs (admin, internal tooling, content sites) where the
  `loader`/`action` model maps cleanly to the workflow.
- Teams comfortable with React but tired of fighting Next.js's app router
  conventions.
- Edge-deployed React surfaces (Remix targets edge runtimes first-class).

Skip when: the app is mostly static content (Astro wins); the team is locked
in on Next.js's app router or Server Components (Remix is route-module-first,
not RSC-first); the data flow is pure client-side SPA with little server
work.

## Canonical tooling

| Concern | Tool | Notes |
|---|---|---|
| Test runner | `vitest` | Inherited from typescript language pack. `@remix-run/testing` for route-level tests. |
| Build | `npm run build` | Runs `remix vite:build` under the hood. |
| Lint | `eslint .` | Inherited from typescript language pack. Remix has an official ESLint config. |
| Dev server | `npm run dev` | `remix vite:dev` — HMR, type-checked routes. |
| Routing | File-system routes | `app/routes/` with conventional nesting via dots in filenames. |

## Default deploy targets

| Target | Default for | Notes |
|---|---|---|
| Cloudflare Workers | Edge-first Remix apps | Remix has a Workers adapter; pairs with D1/KV/R2 in the same account. The opchain default. |
| Vercel | Remix on Vercel adapter | Native Vercel adapter; auto-preview deployments. |
| Fly.io | Long-running Remix services | Container the Node build; useful when the app needs persistent connections. |
| AWS Lambda | Enterprise with existing AWS | `@remix-run/architect` adapter; deploys to Lambda + API Gateway. |
| Netlify | Marketing-leaning sites | Native Netlify adapter; functions for server work. |

Deploy-target packs land in PR 7. Until then oc-stack-forge falls back to the
hardcoded matrix in `SKILL.md`.

## Loader / action contract

The two-function model is the productivity story:

```ts
export async function loader({ request, params }: LoaderFunctionArgs) {
  // Server-only. Runs on every navigation to this route.
  // Returns data for the component.
}

export async function action({ request, params }: ActionFunctionArgs) {
  // Server-only. Handles form submissions to this route.
  // Returns a response or redirect.
}

export default function Component() {
  const data = useLoaderData<typeof loader>(); // Typed from loader return.
  return <Form method="post">…</Form>;
}
```

Stack-forge's `oc-api-dev` integration treats `loader` as a typed GET handler
and `action` as a typed POST/PUT/DELETE handler — no separate API
definition needed when the API is co-located with the UI.

## Gotchas oc-stack-forge will flag

- **Vendor adapter drift** — each deploy target has its own adapter package.
  Switching targets is a multi-line change but not magic; audit the build
  config carefully.
- **No data revalidation by default after action** — Remix revalidates all
  active loaders after a mutation. That's usually right, but on slow loaders
  it surfaces. Use `shouldRevalidate` to opt out per-route.
- **Server-only modules** — `*.server.ts` files are stripped from client
  bundles. Forgetting the suffix can leak secrets. Stack-forge audits for
  this pattern.
- **React Router v7 convergence** — the Remix/RR merger is in flight. Pick a
  version line and stick with it for the project's lifetime; don't mix.

## Status

`stable` — full coverage in v1.4. Default visible
(`skills.coverage.remix.enabled` defaults to `true`). Targets Remix v2 and
the converged React Router v7 line.
