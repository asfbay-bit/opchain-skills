# AWS Amplify

AWS's PaaS layer. Stack-forge picks Amplify when the rest of the stack
already lives in AWS — Cognito for auth, AppSync or API Gateway for the
API surface, S3 for storage, Lambda for compute. Amplify ties them
together with a managed frontend host, CI/CD pipeline, and a CLI that
provisions the underlying AWS resources. More moving parts than the
other deploy targets in v1.4; the right pivot when AWS-native
integration outweighs PaaS simplicity.

## When to pick it

- Teams already on AWS for the rest of their infrastructure (Cognito,
  Aurora, S3, KMS, IAM SSO). Amplify is the lowest-friction way to add a
  frontend / fullstack app surface without leaving the account.
- Apps whose backend is **AppSync (GraphQL)** or **API Gateway +
  Lambda** — Amplify scaffolds these from a schema declaration.
- Mobile/web apps that need **Cognito** (auth) + **S3** (uploads) +
  **Pinpoint** (analytics) wired together with consistent IAM.
- Enterprise teams with AWS Enterprise Support, AWS Marketplace billing,
  or compliance tied to a specific AWS region / account boundary.

Skip when: the project doesn't otherwise touch AWS (the surface area is
overwhelming vs. Railway / Netlify / Vercel), or the team is small
enough that any AWS service costs more in cognitive load than the
infrastructure it replaces.

## Canonical deploy mechanics

| Mechanism | Use case | Notes |
|---|---|---|
| Git integration (Amplify Hosting) | Default for the frontend | Connect a repo; pushes to the tracked branch trigger a build via Amplify's managed CI. PR previews are built-in. |
| `amplify push` (CLI, Gen 1) | Legacy provisioning model | The Amplify CLI provisions backend resources (Cognito, AppSync, S3) from a local config. Being superseded by Gen 2. |
| `npx ampx sandbox` / `npx ampx pipeline-deploy` (Gen 2) | New code-first model | Backend defined in TypeScript (`amplify/backend.ts`); deploys via CDK under the hood. Stack-forge defaults to Gen 2 for new projects. |
| Direct CDK / SAM | When Amplify's abstractions don't fit | Drop down to raw CDK for fine-grained control; Amplify Hosting can still host the frontend. |

Amplify Hosting (the frontend half) auto-detects SSG / SSR / SPA build
output and serves it from a managed CloudFront distribution. The
backend half uses CloudFormation under the hood, which means deploys
take **minutes**, not seconds — set the team's expectations.

## Supported runtimes

Amplify Hosting builds and serves anything that produces static + JS
output:

| Language pack | Notes |
|---|---|
| typescript | The native experience. Amplify Gen 2's backend definitions are TypeScript-first. Next.js + Nuxt + SvelteKit + Astro all have first-party SSR support on Amplify Hosting. |
| bun / deno | Bun supported as a build runtime in Amplify Hosting; Deno via custom build image. Not first-class. |
| python | Frontend only — Python backends deploy as Lambda functions via Gen 2 or raw CDK; Amplify Hosting doesn't run Python at the edge. |
| go / rust | Same story: package as Lambda containers; Amplify Hosting handles the static frontend. |

Framework packs with first-party Amplify support: **Next.js**, **Nuxt**,
**SvelteKit**, **Astro**, **Remix**. (Of those, sveltekit + remix are
v1.4 oc-stack-forge framework packs; the others arrive in later releases.)

## Pricing band (2026-Q2, rough)

| Tier | Cost | What you get |
|---|---|---|
| Free | $0 | 1000 build min/mo, 5GB stored, 15GB served. Enough for hobby evaluation. |
| Hosting (Pay-as-you-go) | $0.01 / build min, $0.023 / GB stored, $0.15 / GB served | After free tier exhausts. Bandwidth is the dominant cost. |
| Backend resources | AWS-priced | Cognito MAU, AppSync requests, Lambda invocations, S3 storage — each billed at standard AWS rates. |

Amplify itself adds **minimal markup**; the bill is mostly the underlying
AWS services. A small-team Gen 2 app with Cognito + AppSync + Lambda +
DynamoDB typically lands in the $20-100/month range; **bandwidth, Lambda
invocations, and DynamoDB throughput** are the line items that scale
unpredictably.

## Gotchas oc-stack-forge will flag

- **CloudFormation deploy latency** — backend deploys take 5-15 min on
  first apply; updates are 2-5 min. Plan releases around that, especially
  for hotfixes.
- **Gen 1 vs. Gen 2 fork in docs** — most blog posts and Stack Overflow
  answers from before 2024 are Gen 1. The CLI surface is different;
  oc-stack-forge defaults new projects to Gen 2 and flags anything that
  looks like a Gen 1 migration as needing planning.
- **IAM blast radius** — Amplify provisions IAM roles with broad
  permissions by default. Production projects need to audit and tighten
  the generated policies before going public.
- **Region pinning** — Amplify Hosting + backend resources are pinned
  to one AWS region per environment. Multi-region requires deliberate
  CDK work; not the default.
- **Custom domain SSL** — DNS validation via ACM is reliable but the
  first cert can take 30+ minutes. Don't promise a launch time within
  the first hour of custom-domain setup.
- **Env vars + secrets** — Amplify env vars are CloudFormation parameters
  and end up in plain text in the template. Real secrets belong in AWS
  Secrets Manager or SSM Parameter Store; oc-stack-forge flags any project
  that stores tokens directly in Amplify env vars.
- **Cost observability is hard** — the bill spans multiple AWS services.
  Tag everything with an `Environment=prod|staging` tag from day one;
  use Cost Explorer to attribute costs back to projects.

## Status

`stable` — full coverage. No coverage flag is emitted (deploy-target
packs are sub-selections only). Stack-forge surfaces AWS Amplify as a
`supportedPlatforms` option for the typescript language pack and SSR
framework packs once cross-wiring lands in PR 8+.
