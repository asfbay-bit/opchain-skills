# Site release surfaces — the per-release checklist

> **Why this file exists.** Every release, a scattered set of site pages and
> components hard-code "the current release." They drift — the site keeps saying
> v1.5 after v1.6 ships. This is the exhaustive, file-anchored list of every
> release-coupled surface, so `oc-release-ops` can roll them all forward and
> *nothing* is missed. Added in v1.6 (the sprint that got tired of missing one).
>
> Companion to `version-locations.md` (which covers the **skill** version
> locations — `skills/*/SKILL.md` frontmatter + the lockstep bump). This file
> covers the **site** surfaces.

## The build-PR vs deploy-moment split (read first)

opchain's hardest rule: **the site must not claim shipped what isn't live in
prod.** So release-coupled surfaces fall into two groups:

- **Forward surfaces** — "what's coming / being built." Safe to update in the
  build PR, because they describe the in-flight release, not a live claim.
- **Live-claim surfaces** — "what's currently shipped/live." These assert prod
  state. Flip them at the **deploy moment** (the release-cut step, coupled with
  `npm run deploy`), exactly as the v1.5 cut did in PR #311. Flipping them in a
  pre-deploy PR makes the site lie until the deploy lands, and trips the
  deploy-lag canary (`.github/workflows/deploy-lag.yml`).

When `oc-release-ops` runs the cut: update forward surfaces in the release PR,
then flip live-claim surfaces in the same PR **only if it deploys immediately
after merge** (the #311 pattern). If merge and deploy are decoupled, hold the
live-claim flips until deploy.

---

## Live-claim surfaces (flip AT DEPLOY)

| # | Surface | File | What changes each release |
|---|---|---|---|
| L1 | Header version chip | `site/src/components/Header.astro` | `CURRENT_RELEASE = "vN"` + `CURRENT_RELEASE_HREF = "/changelog#vN"` |
| L2 | Homepage release bar (shipped) | `site/src/pages/index.astro` | `<span class="rb-tag">vN · shipped</span>` + its description line |
| L3 | Homepage stat chip | `site/src/pages/index.astro` | `<span class="stat-num">vN</span>` (the "latest release" stat) |
| L4 | Changelog — Just Released hero | `site/src/pages/changelog.astro` | promote the newly-live release to the open `hero-card--released` (`#vN`, `hero-ver "vN.0 · shipped <date>"`); keep it **and every release shipped ≤ 21 days ago** as collapsed `hero-card--released` "previous release" heroes (above the *earlier releases* divider); demote any hero now older than 21 days to a compact `rel-card`. See *The 21-day active window* below. |
| L5 | Changelog — tab counts | `site/src/pages/changelog.astro` | `Just Released <span class="tab-count">K shipped</span>` (K++) |
| L6 | Roadmap timeline — shipped flip | `site/src/data/roadmap-static.ts` | the now-live release leaves `in-progress` (shipped releases live in the changelog release-history, not the forward timeline — per the file's own header) |
| L7 | styleguide Badge example | `site/src/pages/styleguide.astro` | `<Badge>vN.N.N</Badge>` (cosmetic component demo) |

### The 21-day active window (L4 detail)

Newly-released entries stay prominent as **heroes** for **21 days**, then age
into the compact "earlier releases" `rel-card` list. In the *Just Released* tab:

- **Newest release** → the one open `hero-card--released is-open` ("latest release" badge).
- **Every release shipped ≤ 21 days ago** → a collapsed `hero-card--released`
  ("previous release" badge), above the `earlier releases` divider.
- **Releases shipped > 21 days ago** → a compact `rel-card`, below the divider.

Enforced **manually at each release cut** — it is *not* date-driven at build
time. When `oc-release-ops` cuts a release, walk the hero list and:

1. **Age out:** demote any "previous release" hero whose `shipped <date>` is now
   > 21 days old to a `rel-card` — move it below the `earlier releases` divider,
   swap `hero-card hero-card--released` → `rel-card`, the `hero-head` block →
   `rc-row` (with `ver-pill ver-pill--past` + `rc-title` + `rc-date` +
   `rc-summary`), and `card-body-inner hero-body-inner` → `card-body-inner`.
2. **Promote:** add the newly-shipped release as the open hero and demote the
   prior open hero to a collapsed "previous release" hero.

The `hero-ver "... · shipped <Mon DD, YYYY>"` date is the source of truth for
the 21-day age — these hand-authored cards carry no separate machine-readable
ship date. (Reverse of step 1 — promoting a `rel-card` back to a hero — applies
if a release re-enters the window, e.g. a date correction.)

## Forward surfaces (update IN THE BUILD PR)

| # | Surface | File | What changes each release |
|---|---|---|---|
| F1 | Homepage release bar (next) | `site/src/pages/index.astro` | `<span class="rb-tag rb-tag-next">vN+1 · next</span>` |
| F2 | Changelog — Coming Next card | `site/src/pages/changelog.astro` | the release being built moves to `hero-card--next` (`#vN`); its body reflects what actually shipped in the sprints |
| F3 | Changelog — Coming Next tab count | `site/src/pages/changelog.astro` | `Coming Next <span class="tab-count">vN</span>` |
| F4 | Changelog — Planned tab | `site/src/pages/changelog.astro` | shift the planned cards forward (`#vN+1`/`#vN+2`/…); keep ≥6 votable `[data-vote-target]` items |
| F5 | Roadmap timeline — buckets | `site/src/data/roadmap-static.ts` | building release → `in-progress`; next themes → `planned`; refresh `generated_at`, blurbs, `OPC-` vote ids |
| F6 | Architecture diagrams (version annotations) | `site/src/components/MobileArchitecture.astro` + the desktop `architecture` page | the `vN` band badges + "NEW vN" phase/pack annotations; add the release's new skills/phase where the diagram narrates the pipeline |
| F7 | Per-skill OG cards | `site/src/layouts/Base.astro` (`ROUTE_OG_IMAGES`) + `scripts/gen-og.mjs` | add `/skills/<new-skill>` → `/og/skills-<new-skill>.png` for each new skill, and add the skill to the gen-og generation list so the PNG exists |
| F8 | Skill library | `/skills` index + `/skills/[id]` | auto-discovered from `skills/*/SKILL.md` (no manual edit) — but confirm the new skills appear and any phase chips cover their `phases:` |

## Coupled tests (update in lockstep)

| Surface | Test that pins it |
|---|---|
| Header chip `CURRENT_RELEASE` + `_HREF` (L1) | `tests/site-release-chip.test.js` — pins the exact `const CURRENT_RELEASE = "vN"` / `_HREF = "/changelog#vN-N"` strings. **Bump these literals in lockstep with L1.** |
| Changelog DOM/tabs/anchors (L4/L5/F2/F3/F4) | `site/tests/e2e/changelog-and-scenarios.spec.ts` — hero id, `hero-ver`, tab counts, deep-link anchors, vote-target count. **Rewrite these assertions whenever the changelog cards move panels.** |
| `/dashboard`, route smoke | `site/tests/e2e/routes.spec.ts` |
| Skill count | `tests/mcp-route.test.js` (`parsed.skills.length`) |

## The straggler check

After a release cut + deploy, run the guard (a CI test) that greps the
live-claim surfaces for the *previous* release literal. See
`scripts/check-release-surfaces.mjs` (added v1.6) — it asserts no live-claim
surface still references a superseded release once `CURRENT_RELEASE` has moved.

## Procedure (oc-release-ops drives this)

1. **In the build PR:** update all **Forward** surfaces (F1–F8) + their coupled
   tests. CI green.
2. **At the deploy cut:** flip all **Live-claim** surfaces (L1–L7) + their
   coupled changelog tests, in the PR that is deployed immediately after merge.
3. `npm run deploy:staging` → eyeball the rolled-forward surfaces on
   `staging.opchain.dev` → `npm run deploy`.
4. Run the straggler check; close the deploy-lag issue if open.
