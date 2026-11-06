# Semver decisions for opchain releases

Decision tree for `/oc-release plan`. Outputs the proposed next version given
what's merged since the last release.

---

## Semver bands

opchain uses [Semantic Versioning 2.0](https://semver.org/) with one extension
documented here: **catalog-wide lockstep** (every skill version moves to the
release version, regardless of whether each skill changed).

| Bump | Trigger |
|---|---|
| **Major** | Breaking change to a public surface — checkpoint schema, skill SKILL.md frontmatter shape, slash-command verb removal, runtime API contract. |
| **Minor** | Backward-compatible feature work — new skill, new verb, new prose patterns, new scenarios, new platform support, schema additions. |
| **Patch** | Bug fixes, dependency updates, doc tweaks, cosmetic changes only. No new behaviour. |

---

## Decision tree

Run top-to-bottom; first match wins.

1. **Did the checkpoint schema change?** (any field rename / removal in
   `checkpoint-protocol.md` schema)
   → **Major.**

2. **Did any SKILL.md remove a slash-command verb that previous releases
   exposed?**
   → **Major.**

3. **Did the oc-orchestrator pipeline-map drop or rename a skill that downstream
   skills referenced?**
   → **Major.**

4. **Was a new skill added?**
   → **Minor.** (Catalog grew; existing flows still work.)

5. **Was a new slash-command verb added to an existing skill?**
   → **Minor.**

6. **Did any SKILL.md add a new section that downstream skills can consume?**
   (e.g. v1.2's PM-Tool MCP Integration section)
   → **Minor.**

7. **Were new scenarios added to /demo?**
   → **Minor.** (The site catalog grew.)

8. **Were new platforms / stacks added to oc-stack-forge / scaffold / oc-deploy-ops
   without changing existing patterns?**
   → **Minor.**

9. **Did flag definitions change?** (registry shape change, new flag name)
   → **Minor** if additive, **Major** if a flag name was removed mid-cycle.

10. **None of the above — all merges are bug fixes / typos / dep bumps?**
    → **Patch.**

---

## Catalog-wide lockstep

Every skill's `version:` frontmatter field equals the release version, even
when the skill's prose did not change in that release. Reasons:

- Reduces "which version is current?" confusion when the user grep'd a single
  SKILL.md.
- Lets `/oc-release verify` enforce a single invariant (`every skill === release
  version`) instead of a per-skill changelog.
- Aligns with the `/changelog` page being the source of truth — entries are
  release-version-keyed, not per-skill-version-keyed.

Drawback: minor "noise" commits when a skill is unchanged but its version
bumped. Tradeoff is worth it; the v1.0 → v1.1 → v1.2 history validates this.

---

## Pre-release identifiers

opchain does not use `-rc.N` / `-alpha.N` suffixes. Reason: the marketing
version is decoupled from the runtime (worker is git-SHA-stamped). Beta-style
flighting happens at the **flag** layer, not the **version** layer. If a
release needs limited rollout, ship under a flag default-off, then default-on
in a patch release.

---

## Examples

### v1.0 → v1.1 (decision: Minor)

Triggers: full Astro site added (new infra), tri-agent harness pattern shipped
across `oc-app-architect`, `oc-code-auditor`, `oc-integrations-engineer` (new prose
patterns), oc-checkpoint-protocol v1.0 added (new shared schema), six in-action
scenarios added (catalog grew).

Rule 4 (new patterns), 6 (new sections), 7 (new scenarios) — Minor.

### v1.1 → v1.2 (decision: Minor)

Triggers: PM-Tool MCP Integration section added to 5 SKILL.md files (new
section pattern), three new scenarios added, `/changelog` page added (new
site surface), homepage v1.2 release-pill added.

Rule 6, 7, 8 — Minor.

### v1.2 → v1.3 (decision: Minor)

Triggers: 18th skill `oc-release-ops` added (Rule 4), Django/Rails/Go platform
expansion in oc-stack-forge / scaffold / oc-deploy-ops (Rule 8), three new scenarios
(Rule 7), new validator `validate-pm-mcp` (build-time invariant). No
checkpoint-schema change, no verb removal, no breaking change.

→ **Minor.**

---

## Edge cases

- **Renaming an existing skill** — major (the directory name is part of the
  catalog's stable surface; tools and docs reference it).
- **Removing a scenario** — minor (the URL `#scenario-id` 404s for anyone who
  bookmarked it; mitigate with a 301 redirect).
- **Editorial changes to `/changelog` formatting** — patch (presentation only).
- **Updating CLAUDE.md** — does not trigger a release on its own. CLAUDE.md
  is internal repo documentation, not a public surface.
- **Dependency updates only** — patch unless they include a breaking transitive
  upgrade visible to users (e.g. Astro major version bump).

When in doubt, err **toward minor** rather than patch. Minor is cheap; under-
representing the size of a change is a credibility cost.
