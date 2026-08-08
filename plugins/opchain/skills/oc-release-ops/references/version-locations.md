# Version locations in the opchain repo

`/oc-release bump` rewrites every location below in lockstep. If you add a
new place that displays a version string, add it here AND to
`scripts/check-version-lockstep.mjs` (when that script exists; for v1.3
the check lives in this skill's `/oc-release verify` step).

---

## Required locations

These must all match the release version. `/oc-release verify` fails if any
diverge.

| Path | What | Pattern |
|---|---|---|
| `skills/<id>/SKILL.md` (every directory) | Frontmatter `version:` field | `version: 1.3.0` |
| `site/src/pages/styleguide.astro` | Top-of-page badge | `v1.3.0` |
| `site/src/pages/index.astro` | Homepage release-pill href + label | `href="/changelog#v1.3"` `<span>v1.3</span>` |
| `site/src/components/Header.astro` | Menu-bar release chip href + label | `CURRENT_RELEASE = "v1.3"` `CURRENT_RELEASE_HREF = "/changelog#v1-3"` |
| `site/src/pages/changelog.astro` | Most recent `<section class="release release--current">` | `<span class="rel-tag">v1.3</span>` |

The pill/chip labels use the **major.minor** form (`v1.3`, not `v1.3.0`)
because the changelog page anchors are major.minor; patches roll into the same
anchor. The homepage uses `/changelog#v1.3`; the Astro changelog card IDs use
hyphenated anchors like `/changelog#v1-3`.

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
  not a stale version number. As of v1.3 there are no version pins here.
- `skills/README.md` — same.
- Any blog / external pages — out of scope for oc-release-ops; the user owns
  those surfaces.

---

## Future location additions

When adding a new place that surfaces the release version:

1. Add a row to the "Required locations" table above.
2. Update `scripts/validate-pm-mcp.mjs` family of validators (or add
   `scripts/check-version-lockstep.mjs`) to assert lockstep.
3. Make sure `/oc-release bump` writes it.
4. Add a regression test under `tests/oc-release-ops-*.test.js`.

Adding a version surface without updating this file is a oc-release-ops bug;
`/oc-release verify` should catch the divergence on the next release.
