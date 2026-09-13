# Version locations in the opchain repo

`/oc-release bump` rewrites every location below in lockstep for a minor release;
for a patch, the site rows move in the site PR after the tag. If you add a
new place that displays a version string, add it here AND to the probes in
`scripts/check-release-surfaces.mjs` (pinned by `tests/release-surfaces.test.js`).
The skill-catalog half is checked by `scripts/check-release-tag.mjs`, which
reports a split catalog as `catalog-split`.

Companion to `site-release-surfaces.md`, which says *when* each site surface
moves: forward surfaces in the build PR; live-claim surfaces in the release PR
before the tag for a minor release, or in a site PR after the tag for a patch
(only the patch-only rows). This file lists *what* carries the version.

`check-release-surfaces.mjs` compares **major.minor only** (`v1.9`), across the
probed site surfaces and the newest `## [x.y.z]` heading in `skills/CHANGELOG.md`.
A full-semver mismatch it cannot see (e.g. a styleguide badge left at `v1.9.0`
after a patch) is caught only by review.

---

## Required locations

These must all match the release. `<release>` below is the full semver
(`1.9.0`); `<minor>` is the `vN.N` label (`v1.9`); `<anchor>` is the hyphenated
changelog card id (`v1-9`).

| Path | What | Pattern | Checked by |
|---|---|---|---|
| `skills/<id>/SKILL.md` (every directory) | Frontmatter `version:` field | `version: <release>` | `check-release-tag.mjs` |
| `release-seal.json` | Reviewed baseline + publisher/payload digests | `"catalogVersion": "<release>"`, `"publisherWorkflowSha256": "…"`, `"serverJsonSha256": "…"` | `check-release-tag.mjs` |
| `server.json` | MCP Registry listing version | `"version": "<release>"` | `check-release-tag.mjs` (seal digest) |
| `.claude-plugin/marketplace.json` | Marketplace + plugin entry versions | `"version": "<release>"` | review |
| `plugins/opchain/.claude-plugin/plugin.json` | Plugin version | `"version": "<release>"` | review |
| `site/src/components/Header.astro` | Menu-bar release chip | `CURRENT_RELEASE = "<minor>"`, `CURRENT_RELEASE_HREF = "/changelog#<anchor>"` | `check-release-surfaces.mjs` (major.minor), `tests/site-release-chip.test.js` |
| `site/src/pages/index.astro` | Homepage release bar (shipped label) + "latest release" stat chip | `<span class="rb-tag"><minor> · shipped</span>`, `<span class="stat-num"><minor></span>` | `check-release-surfaces.mjs` |
| `site/src/pages/changelog.astro` | Just Released open hero | `<article class="hero-card hero-card--released is-open" id="<anchor>">` with `<span class="hero-ver"><release> · shipped <Mon DD, YYYY></span>` | `check-release-surfaces.mjs` (the hero `id`, major.minor; `hero-ver` is review only) |
| `site/src/pages/skills/index.astro` | Skill Library release callout + its href | `<span class="release-callout-tag"><minor> · SHIPPED</span>`, `<a class="release-callout" href="/changelog#<anchor>"` | `check-release-surfaces.mjs` |
| `site/src/pages/styleguide.astro` | Badge example | `<Badge>v<release></Badge>` | `check-release-surfaces.mjs` (major.minor only; the patch digit is review only) |
| `site/src/pages/architecture.astro` | Diagram eyebrow + footer | `SKILLS · ARCHITECTURE · v2 · RELEASE <minor>`, `spine ordinals · <minor> · checkpoint-driven` | `check-release-surfaces.mjs` |
| `site/src/components/MobileArchitecture.astro` | Mobile diagram eyebrow | `SKILLS · ARCHITECTURE · v2 · MOBILE · <minor>` | `check-release-surfaces.mjs` |

The homepage release bar's `href` is **not** a shipped-version location: it
points at the *next* release's card (`/changelog#vN-N` for the release being
built; forward surface F1 in `site-release-surfaces.md`). Every changelog anchor
is hyphenated (`#v1-9`); there is no dotted `#v1.9` form.

---

## NOT bumped (intentionally)

These display version-like strings but are decoupled from the marketing
version. Do **not** rewrite them in `/oc-release bump`.

| Path | Reason |
|---|---|
| `package.json` `version` | Worker version is git-SHA-stamped; see `CLAUDE.md` "Version stamp" section. |
| `__OPCHAIN_VERSION__` (in `build.mjs`) | Runtime constant; sourced from `git rev-parse --short HEAD`. |
| `wrangler.jsonc` (any field) | No version field. |
| `site/package.json` `version` | The site is a build artefact; its package version is not user-visible. |
| `vitest.config.js` `__OPCHAIN_VERSION__` define | Test stub ("test"); no semver. |
| Any `releases/v<semver>/announcement-*.md` | These are release-specific outputs, not catalog stamps. |

---

## Locations to audit each release

Not bumped automatically, but `/oc-release plan` lists these for the user to
spot-check:

- `README.md` — the install snippet should reference `main` or a stable tag,
  not a stale version number.
- `skills/README.md` — same.
- Any blog / external pages — out of scope for oc-release-ops; the user owns
  those surfaces.

---

## Future location additions

When adding a new place that surfaces the release version:

1. Add a row to the "Required locations" table above.
2. Add a probe to `scripts/check-release-surfaces.mjs` (site surfaces) so the
   verify gate and CI catch a stale value.
3. Make sure `/oc-release bump` writes it.
4. Extend `tests/release-surfaces.test.js` (or `tests/site-release-chip.test.js`
   for the header chip) to pin it.

Adding a version surface without updating this file is an oc-release-ops bug;
`/oc-release verify` should catch the divergence on the next release.
