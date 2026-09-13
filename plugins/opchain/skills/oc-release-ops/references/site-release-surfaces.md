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

## When each surface moves (read first)

opchain's hardest rule: **the site must not claim shipped what isn't live in
prod.** So release-coupled surfaces fall into two groups:

- **Forward surfaces** — "what's coming / being built." Safe to update in the
  build PR, because they describe the in-flight release, not a live claim.
- **Live-claim surfaces** — "what's currently shipped/live." These assert prod
  state, so they land only in a PR that is merged when the tag and deploy follow
  in the same sitting. A flip sitting on `main` undeployed makes the site lie
  and creates a deploy-relevant difference from the approved release baseline
  checked by `.github/workflows/deploy-lag.yml`.

CI adds a constraint: `scripts/check-release-surfaces.mjs` (run by
`tests/release-surfaces.test.js`) requires every probed live-claim surface to
name the same **major.minor** line as the newest `## [x.y.z]` heading in
`skills/CHANGELOG.md`. It reads the open hero's `id` and the styleguide badge only
to major.minor. This is the same rule as opchain's RELEASING.md governance doc, §5:

- **Minor release (vN.N.0):** one release PR carries the version bump and the new
  CHANGELOG heading **together with** every probed live-claim surface (L1–L3, the
  L4 open-hero promotion + aging, L6, L7, L8–L10), plus the L5 recount. A PR that
  adds the heading without the flips fails CI. Merge → `/oc-git-release` tag →
  deploy, in one sitting. v1.9.0 shows why: #476 carried the bump and flips together,
  but the tag and deploy landed a day later on #477.
- **Patch release (vN.N.x):** the major.minor line does not change, so the split
  holds: a **product PR** (version bump + CHANGELOG entry) → tag → a **site PR**
  with the patch-only surfaces (L4 range extension + patch `rel-card`, L5
  recount, L7 full patch version) → deploy.
- **Either way, the deploy follows the tag.** Roadmap data (F5) is regenerated
  at deploy time, not edited in a PR.

---

## Live-claim surfaces

Ids match opchain's RELEASING.md §3b.

| # | Surface | File | Minor | Patch |
|---|---|---|---|---|
| L1 | Header version chip | `site/src/components/Header.astro` | `CURRENT_RELEASE = "vN.N"` + `CURRENT_RELEASE_HREF = "/changelog#vN-N"` (hyphenated anchor) | — |
| L2 | Homepage release bar (shipped) | `site/src/pages/index.astro` | `<span class="rb-tag">vN.N · shipped</span>` + its description line | — |
| L3 | Homepage stat chip | `site/src/pages/index.astro` | `<span class="stat-num">vN.N</span>` (the "latest release" stat) | — |
| L4 | Changelog — Just Released hero | `site/src/pages/changelog.astro` | promote the new release to the open `hero-card--released is-open` (`id="vN-N"`, `hero-ver "vN.N.0 · shipped <Mon DD, YYYY>"`); keep **five heroes total** and demote the oldest past that window to a compact `rel-card`. See *The five-hero window* below. | extend the open hero's version + date range and add a patch `rel-card` (`#vN-N-N`); a patch never creates a hero |
| L5 | Changelog — Just Released tab count | `site/src/pages/changelog.astro` | `<span class="tab-count">K shipped</span>` — recount the rendered cards | recount |
| L6 | Skill Library release callout | `site/src/pages/skills/index.astro` | `<span class="release-callout-tag">vN.N · SHIPPED</span>` + `<a class="release-callout" href="/changelog#vN-N">` | — |
| L7 | styleguide Badge example | `site/src/pages/styleguide.astro` | `<Badge>vN.N.0</Badge>` | full patch version `<Badge>vN.N.x</Badge>` |
| L8 | Architecture diagram — eyebrow | `site/src/pages/architecture.astro` | `SKILLS · ARCHITECTURE · v2 · RELEASE vN.N` | — |
| L9 | Architecture diagram — footer | `site/src/pages/architecture.astro` | `… spine ordinals · vN.N · checkpoint-driven` | — |
| L10 | Mobile architecture — eyebrow | `site/src/components/MobileArchitecture.astro` | `SKILLS · ARCHITECTURE · v2 · MOBILE · vN.N` | — |

> **Why L8–L10 are here.** The diagrams were listed only as a *forward* surface
> (F6, the version annotations), so the half of them that makes a **live claim**
> had no owner. All three still said `v1.8` after v1.9 shipped, and
> `check-release-surfaces.mjs` reported all-clear because it wasn't probing
> them. They are now probed; see *The straggler check* below.

### The five-hero window (L4 detail)

The *Just Released* tab is the release history, and nothing on it is ever
deleted. The rule (from opchain's RELEASING.md governance doc, §4, which
superseded the earlier 21-day window):

- **Newest release** → the one open `hero-card--released is-open` ("latest release" badge).
- **The four most recent previous minor releases** → collapsed
  `hero-card--released` ("previous release" badge), above the `earlier releases`
  divider. Five heroes total.
- **Older releases, and every patch** → a compact `rel-card`, below the divider
  (a patch's `rel-card` may sit next to its minor). Topical `rel-card`s, such as
  a relicense card, may sit above the divider next to the release they shipped
  with.

Enforced **manually at each minor cut** — it is not date-driven at build time.
When `oc-release-ops` cuts a minor release, walk the hero list and:

1. **Promote:** add the newly-shipped release as the open hero and demote the
   prior open hero to a collapsed "previous release" hero.
2. **Age out:** demote the oldest collapsed hero beyond the five to a `rel-card` —
   move it below the `earlier releases` divider, swap
   `hero-card hero-card--released` → `rel-card`, the `hero-head` block → `rc-row`
   (with `ver-pill ver-pill--past` + `rc-title` + `rc-date` + `rc-summary`), and
   `card-body-inner hero-body-inner` → `card-body-inner`.

Hero bodies describe what actually shipped: when the Coming Next card (F2)
becomes the open hero, rewrite its body against the real release diff.

## Forward surfaces (update IN THE BUILD PR)

| # | Surface | File | What changes each release |
|---|---|---|---|
| F1 | Homepage release bar (next) | `site/src/pages/index.astro` | `<span class="rb-tag rb-tag-next">vN+1 · next</span>` |
| F2 | Changelog — Coming Next card | `site/src/pages/changelog.astro` | the release being built moves to `hero-card--next` (`#vN-N`, hyphenated); its body reflects what actually shipped in the sprints |
| F3 | Changelog — Coming Next tab count | `site/src/pages/changelog.astro` | `Coming Next <span class="tab-count">vN</span>` |
| F4 | Changelog — Planned tab | `site/src/pages/changelog.astro` | shift the planned cards forward (`#vN+1`/`#vN+2`/…); keep ≥3 votable `[data-vote-target]` items (the community vote weights a top 3) |
| F5 | Roadmap data — buckets | GitHub issues on `asfbay-bit/opchain-skills` → `npm run gen-roadmap` → `site/src/data/roadmap.json` | after scope selection, re-label issues: the building release → `roadmap:in-progress`, next themes → `roadmap:planned`, set milestones; vote targets are the issue numbers. The JSON is gitignored — regenerate before every deploy |
| F6 | Architecture diagrams (new skills + version annotations) | `site/src/components/MobileArchitecture.astro` + `site/src/pages/architecture.astro` | the `vN` band badges + "NEW vN" annotations, and the release's new skills drawn into the diagram. This is a procedure, not a find/replace — follow [`docs/runbooks/architecture-diagram-cycle.md`](../../../docs/runbooks/architecture-diagram-cycle.md), which covers placement (rail vs band), the house geometry conventions CI asserts, and the counts that must move with it. Note the diagrams also carry live-claim surfaces L8–L10. |
| F7 | Per-skill OG cards | `site/src/layouts/Base.astro` (`ROUTE_OG_IMAGES`) + `scripts/gen-og-images.mjs` (`npm run gen-og`) | add `/skills/<new-skill>` → `/og/skills-<new-skill>.png` for each new skill, and add the skill to the gen-og generation list so the PNG exists |
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
2. **Minor release — in the release PR, before the tag:** flip the Minor column
   (L1–L10) + their coupled changelog tests, alongside the version bump and the new
   `skills/CHANGELOG.md` heading. Run `node scripts/check-release-surfaces.mjs`
   before merging. After merge: `/oc-git-release <semver>` (signed tag).
   **Patch release:** merge the product PR (version bump + CHANGELOG entry), run
   `/oc-git-release <semver>`, then open the site PR with the Patch column (L4
   range + `rel-card`, L5 recount, L7 full version).
3. **Deploy, after the tag:** move the shipped release's roadmap issues from
   `roadmap:in-progress` to `roadmap:shipped` and close its milestone, then
   `npm run gen-roadmap && npm run deploy:staging` (the JSON is gitignored; a
   build without it ships the empty-roadmap fallback) → eyeball the rolled-forward
   surfaces on `staging.opchain.dev` → `npm run gen-roadmap && npm run deploy`.
4. Run the straggler check. After smoke evidence passes, refresh
   `.github/monitoring/release-baseline.json` with the exact Cloudflare
   deployment/version ids, traffic, and script fingerprint; run the
   control-plane + deploy-diff checks locally; and merge the reviewed baseline
   update. The default-branch deploy-lag workflow reconciles its issue — do not
   close it manually before the baseline gates pass.
