# Netlify

The JAMstack-first deploy platform. Stack-forge picks Netlify when the
workload is "mostly static site with a sprinkle of dynamic" — content
sites, marketing pages, documentation, and SPA/SSR apps whose backend
surface fits inside Functions. Generous free tier; the right answer for
small teams that want zero-config Git-driven deploys.

## When to pick it

- Static site generators (Astro, Eleventy, Hugo) and SSG-leaning frontends
  where the build is the deploy. Netlify's build minutes + CDN are the
  whole product.
- SvelteKit / Remix / Astro apps using their **first-party Netlify
  adapters** — SSR routes deploy as Netlify Functions, static routes go
  to the CDN, all from one build.
- Teams that want **PR preview deploys** as a default workflow. Every
  pull request gets a unique URL with the built site.
- Marketing/content sites that need cheap form handling, basic auth, and
  CDN edge personalization without standing up a backend.

Skip when: the workload is API-first with no static surface (a real
backend host like Railway/Fly/Heroku is a better fit), or the project
needs WebSocket / long-lived connections (Functions are request/response
only).

## Canonical deploy mechanics

| Mechanism | Use case | Notes |
|---|---|---|
| Git integration | Default for teams | Connect a repo; pushes to the tracked branch build + deploy via the configured build command. PR previews are automatic. |
| `netlify deploy` (CLI) | One-shot from a local checkout | Uploads the built `dist/` directly; useful for emergency rollbacks. `--prod` promotes to production. |
| Drop deploy | Static-only, no git | Drag-and-drop a `dist/` folder via the dashboard. Demo-grade only. |
| Build plugins | Custom build pipelines | npm-installable plugins hook the build lifecycle (image optimisation, sitemap generation, etc.). |

Netlify's build runs in a container with a configurable Node version,
package manager, and build command — most adapters auto-configure this.
A `netlify.toml` at the repo root pins the build command, publish
directory, environment variables, and any redirect/header rules.

## Supported runtimes

Netlify is **JavaScript-first by build**. The build container can run any
language as a shell command, but the **runtime** (Functions + Edge
Functions) is JS-only:

| Surface | Runtime | Notes |
|---|---|---|
| Static site build | Anything | Build container runs whatever shell command you give it. Astro, Hugo, Jekyll, Eleventy all work. |
| Functions | AWS Lambda Node 20 | Background Functions and Scheduled Functions both available; same Lambda underneath. |
| Edge Functions | Deno | V8 isolates with the Deno API surface; ~50ms cold-start, run at the CDN edge. |

The first-party adapters that ship as **oc-stack-forge framework packs**:

| Framework pack | Netlify adapter | Notes |
|---|---|---|
| sveltekit | `@sveltejs/adapter-netlify` | Auto-routes SSR pages to Functions, static pages to CDN. |
| remix | `@remix-run/netlify` | Loader/action functions deploy as Netlify Functions. |
| (astro) | `@astrojs/netlify` | Astro is not yet a oc-stack-forge framework pack; adapter is mentioned here for completeness. |

## Pricing band (2026-Q2, rough)

| Tier | Cost | What you get |
|---|---|---|
| Free | $0 | 100GB bandwidth, 300 build min/mo, 125k Function invocations/mo. Enough for a hobby site indefinitely. |
| Pro | $19/month/seat | 1TB bandwidth, 25k build min, 2M Function invocations, password-protected previews. |
| Enterprise | Custom | SAML SSO, audit logs, SLA, dedicated edge. |

Bandwidth overage is **$55 per 100GB** on Pro — a meaningful cliff for
content sites that go viral. Stack-forge will flag projects that plan
high-bandwidth media delivery on Netlify without a CDN-image strategy.

## Gotchas oc-stack-forge will flag

- **Function cold starts** — first hit after idle can be 1-3s. SSR apps
  whose homepage is a Function will feel slow on the first request from
  each region. Edge Functions are faster (≤50ms) but more constrained.
- **Build minute exhaustion** — slow builds add up. Cache `node_modules`,
  use incremental builds where the framework supports it.
- **No background workers** — Functions are request-scoped; long jobs
  fail. Use a real backend (Railway / Fly / Heroku) or a queue service
  (Inngest, Trigger.dev) when the workload needs durable async.
- **Custom domains + SSL** — Netlify's DNS is solid, but mixing external
  DNS with Netlify-managed records causes `Mixed-DNS` warnings; pick one
  side and stick to it.
- **Env vars: build vs. runtime** — variables set in the dashboard are
  available at both build and runtime by default. Variables marked
  "build only" are stripped from the function bundle; double-check the
  scope before storing secrets.
- **Form handling lock-in** — Netlify Forms is convenient but project-
  scoped; migrating off means re-pointing client code.

## Status

`stable` — full coverage. No coverage flag is emitted (deploy-target
packs are sub-selections only). Stack-forge surfaces Netlify as a
`supportedPlatforms` option for the framework packs that have a
first-party adapter (sveltekit, remix) once cross-wiring lands in PR 8+.
