---
name: oc-release-ops
displayName: OC · Release Ops
version: 1.8.1
shortDesc: Plan, draft, bump, announce, ship a release. Closes the loop from sprints to /changelog to oc-git-ops to oc-deploy-ops.
phases: [build]
triAgent: false
tryable: true
commands:
  - /oc-release
  - /oc-release plan
  - /oc-release draft
  - /oc-release bump
  - /oc-release announce
  - /oc-release ship
description: >
  Release-cadence operator. Plan, draft, bump, announce, and ship versioned
  releases of opchain (or any opchain-managed project). Reads sprint
  checkpoints, proposes the next semver, drafts the /changelog entry from
  what actually shipped, bumps every skill version atomically, and hands
  off to oc-git-ops + oc-deploy-ops. Use for /oc-release, /oc-release plan, /oc-release
  draft, /oc-release bump, /oc-release announce, /oc-release ship, "cut a release",
  "ship v1.3", "tag the release", "draft the changelog", "what's in this
  release", "version bump". Trigger liberally on release-cadence work.
---

# Release Ops

**On first invocation, read `references/orchestrator.md` and follow its welcome protocol.**

Release-ops sits between `oc-git-ops` and `oc-deploy-ops` at release boundaries. The
recurring "scope → sprint plan → changelog → version bump → ship" pattern that
opchain itself uses (and that any opchain-managed project will eventually want)
is what this skill owns. v1.3 dogfoods this skill for its own release.

**Boundary:** oc-release-ops is **not** a deployer. It produces the artefacts a
release needs (changelog entry, version bumps, release announcement, release
ticket) and hands off to `oc-git-ops` for the merge / tag and `oc-deploy-ops` for
staging + prod. Every action is reversible up to the moment `oc-deploy-ops`
ships.

---

## /oc-release — Command Reference

```
RELEASE OPS COMMANDS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  END-TO-END
  /oc-release                Show this menu
  /oc-release ship           Run the full pipeline: plan → draft → bump → announce → hand off

  STEPWISE
  /oc-release plan           Propose the next semver from changelog gaps + sprint outputs
  /oc-release draft          Draft the /changelog entry from sprint checkpoints + merged PRs
  /oc-release bump           Bump every skill version + styleguide badge atomically
  /oc-release announce       Compose homepage release-pill + release ticket + announcement copy

  UTILITIES
  /oc-release status         Where in the pipeline am I?
  /oc-release verify         Pre-ship sanity gate (tests / catalog / validator / build)
  /oc-release rollback       Revert the last bump if not yet shipped

  SESSION
  /checkpoint             Show oc-release-ops checkpoint
  /checkpoint show        Full checkpoint JSON
  /checkpoint reset       Archive and restart

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  Type any command to begin. /oc-release to see this again.
```

---

## Pipeline

```
RELEASE TRIGGER
       │
       ▼
┌───────────────┐  reads sprint checkpoints, /changelog gaps, merged PRs since
│   /oc-release    │  the last release; proposes next semver per the decision tree
│   plan        │  in references/semver-decisions.md.
└───────┬───────┘
        │
        ▼
┌───────────────┐  composes the /changelog entry from sprint deliverables +
│   /oc-release    │  PR titles + skill-version diffs; produces draft markdown
│   draft       │  ready for human review.
└───────┬───────┘
        │
        ▼
┌───────────────┐  rewrites every skills/<id>/SKILL.md `version:` field +
│   /oc-release    │  styleguide badge; updates homepage release-pill href and
│   bump        │  copy; commits as one atomic change.
└───────┬───────┘
        │
        ▼
┌───────────────┐  composes release announcement (release ticket via PM-MCP +
│   /oc-release    │  internal announcement copy + external blog/social copy);
│   announce    │  per oc-integrations-engineer pm-mcp-protocol.md.
└───────┬───────┘
        │
        ▼
┌───────────────┐  invokes /oc-release verify → npm run prebuild gates;
│   /oc-release    │  hands the branch to oc-git-ops /oc-git-sync and tells the user
│   ship        │  to run /oc-deploy staging → /oc-deploy prod.
└───────────────┘
```

---

## Phase 1: `/oc-release plan`

The first step. Decides the next semver and the release theme.

### Inputs read

- `.checkpoints/*.checkpoint.json` — every skill's progress since last release.
- `skills/*/SKILL.md` `version:` frontmatter — current versions across the catalog.
- `site/src/pages/changelog.astro` — last shipped release's entry (its tag is
  the last shipped semver).
- `git log <last-release-tag>..HEAD --oneline` — merged commits since the last
  release (oc-release-ops resolves the last tag from the changelog page if there
  is no git tag).

### Outputs

- A proposed next semver per `references/semver-decisions.md`. Patch / minor /
  major decided from the kinds of work merged: bug-fix only → patch; backward-
  compatible feature work → minor; breaking changes / new skill → minor with
  release-note callout; auth/protocol/spec breakages → major.
- A proposed release theme name (e.g. v1.3 = "Runtime PM, real platforms,
  automated releases").
- A list of headline items, ranked by surface impact.
- A proposed list of skill versions to bump (default: all of them, in lockstep
  with the release version, per the v1.2 precedent).

### User decision points

- Approve / override the proposed semver.
- Approve / edit the theme name.
- Approve the headline-item ranking (this drives `/oc-release draft` order).

Write checkpoint: phase `plan-approved`.

---

## Phase 2: `/oc-release draft`

Produce a `/changelog` entry ready for review.

### Composition rules

- Mirror the structure of existing `/changelog` entries (summary lede →
  "What's new" → "Two new scenarios" → "Configuration" → "Compatibility" →
  "Security posture") for stylistic consistency.
- Each "What's new" bullet leads with **the user-visible change**, not the
  implementation detail. "oc-git-ops now reads ticket state via real MCP tool
  names" beats "Replaced placeholder mcp.<provider>.<verb> patterns."
- Every scenario shipped in the release gets a one-paragraph callout under
  "Scenarios" with a deep link to `/demo#<id>`.
- "Configuration" describes any new `.opchain/*.yaml` keys or env vars.
- "Compatibility" is required and explicit. Either "back-compatible with vX.Y;
  no migration required" OR a list of migration steps with a deadline.
- "Security posture" — required when the release touches auth / regulated
  flows / new external surfaces. Optional otherwise.

### File output

The draft is appended to `site/src/pages/changelog.astro` as a new
`<section class="release release--current">`, with the previous current
release demoted to `<section class="release">` and `rel-tag rel-tag--past`.

### Validation

`/oc-release verify` (run automatically after draft) gates:
- Each "What's new" bullet ≤ 280 characters (changelog page reading rhythm).
- Each scenario callout is ≤ 600 characters.
- "Compatibility" section is non-empty.
- The new `<section>` `rel-date` is the current date (YYYY-MM-DD).

Write checkpoint: phase `draft-approved`.

---

## Phase 3: `/oc-release bump`

Atomic version bump across the catalog.

### What gets bumped

- `skills/*/SKILL.md` frontmatter `version:` field, in lockstep with the
  release version. (v1.2 precedent: every skill version equals the release
  version.)
- `site/src/pages/styleguide.astro` badge (e.g. `v1.2.0` → `v1.3.0`).
- `site/src/pages/index.astro` release-pill `href` and label
  (e.g. `v1.2 → v1.3`).
- Any other site-wide version stamps documented in
  `references/version-locations.md`.

### Atomicity

The bump is one git commit (or a single file write batch in a Claude Code
session). Partial bumps leave the catalog in a state where
`scripts/gen-skills-catalog.mjs` may still validate but the homepage and
styleguide disagree on version — confusing to readers. Always run
`/oc-release bump` end-to-end; if it fails midway, revert and retry.

### What is NOT bumped

- `package.json` `"version"` — the worker version is git-SHA-stamped at build
  time per `CLAUDE.md`. Marketing version and runtime version are decoupled
  by design; do not couple them.
- `__OPCHAIN_VERSION__` — same reason.

Write checkpoint: phase `bump-applied`.

---

## Phase 4: `/oc-release announce`

Compose the announcement surfaces.

### Outputs

1. **Release ticket** in the configured PM tool (per
   `oc-integrations-engineer/references/pm-mcp-protocol.md` §3 idempotency
   rules). Marker:
   `<!-- opchain:oc-release-ops:release-ticket:v<semver> -->`. Title:
   `Release v<semver> — <theme>`. Description: the changelog summary +
   links to the new scenarios + the bump commit.
2. **Internal announcement copy** — one paragraph for whatever channel the
   user uses (Slack / email / Telegram). Generated to a file at
   `releases/v<semver>/announcement-internal.md`.
3. **External announcement copy** — same shape but tuned for blog / social.
   Generated to `releases/v<semver>/announcement-external.md`. Optional;
   the user opts in.
4. **Homepage release-pill copy** — already updated in `/oc-release bump`;
   announce phase verifies it points to the new `/changelog#v<semver>`
   anchor.

### `--retry-pm` flush

If the PM call fails, the release-ticket payload is recorded to
`oc-release-ops.checkpoint.json` `pm_deferred_actions[]` per the protocol §4.
`/oc-release announce --retry-pm` flushes later. The release proceeds; the
PM ticket is enrichment.

Write checkpoint: phase `announced`.

---

## Phase 5: `/oc-release ship`

End-of-pipeline handoff.

### Sequence

1. `/oc-release verify` — run the full pre-ship gate. Hard-blocks on any failure.
2. Invoke `oc-docs-forge` for the release docs packet:
   - Run `/oc-docs pr` so the release PR carries its `## Documentation` section,
     the changelog entry, and any README/product-doc upkeep the release requires.
   - (oc-git-ops then runs its own pre-PR gate — oc-docs-forge verify + oc-repo-ops
     `/oc-repo verify` — before the PR opens; a stale packet or dirty repo blocks it.)
3. Hand off to `oc-git-ops`:
   - Invoke the oc-git-ops skill (read its SKILL.md per oc-orchestrator §3 active
     chaining).
   - Run `/oc-git-sync v<semver>` with the bump commit. oc-git-ops opens / merges
     the release PR.
4. Hand off to `oc-deploy-ops`:
   - Invoke oc-deploy-ops.
   - Run `/oc-deploy staging` first; user eyeballs.
   - Run `/oc-deploy` (prod) on user confirmation.
5. Update homepage pill + close release ticket via PM-MCP per protocol §3
   marker `<!-- opchain:oc-release-ops:release-shipped:v<semver> -->`.
6. Write checkpoint: phase `shipped`, status `complete`.

### `/oc-release verify` (the gate)

Runs in order; aborts on the first failure:

| Check | Implementation |
|---|---|
| Catalog validates | `npm run gen-catalog` |
| PM-MCP integration validates | `npm run validate-pm-mcp` |
| Flag registry mirror is current | `npm run gen-flags` |
| Tests pass | `npm test` |
| Site builds | `npm run site:build` |
| `/changelog` has the new release entry | grep for `rel-tag.*v<semver>` |
| Release-PR docs packet current | oc-docs-forge `/oc-docs verify` — checkpoint `verified_for_sha` matches HEAD, PR body fragment has `## Documentation` |
| Repo is PR-ready | oc-repo-ops `/oc-repo verify` — verdict PASS |
| All skill versions match the release version | parse every SKILL.md frontmatter |
| Styleguide badge matches | parse `site/src/pages/styleguide.astro` |

---

## Phase 6: `/oc-release rollback`

If the release was bumped but **not yet shipped** (`/oc-deploy` not yet run):

1. `git revert` the bump commit.
2. Restore the previous `/changelog` section ordering.
3. Reset the homepage release-pill to the prior version.
4. Write checkpoint: phase `rolled-back`.

If the release **has shipped**, do NOT use `/oc-release rollback` — invoke
`oc-deploy-ops /oc-rollback` to revert the worker, then file a fresh release with
an incremented patch version that documents the rollback. oc-release-ops never
overwrites a shipped release in-place.

---

## Multi-project mode

In an opchain-managed project (where opchain itself is *not* the artefact),
oc-release-ops produces the same outputs but operates on the project's own
versioned surfaces. Configuration lives in `.opchain/release.yaml`:

```yaml
version_locations:
  - { file: "package.json", path: "version" }
  - { file: "src/version.ts", regex: "VERSION = \"(.+)\"" }
changelog_path: "CHANGELOG.md"
changelog_format: "keep-a-changelog"   # or "opchain-astro"
release_branch_pattern: "release/v{semver}"
release_ticket_type: "Release"          # from pm.yaml.issue_types
```

opchain itself uses neither — its version locations are documented in
`references/version-locations.md` because the SSOT is the catalog of
SKILL.md files, not a single `package.json`.

---

## Checkpoint Integration

### Checkpoint Location
`{project-dir}/.checkpoints/oc-release-ops.checkpoint.json`

### When to Write

| Event | What to Save |
|---|---|
| `/oc-release plan` approved | proposed_semver, theme, headline_items |
| `/oc-release draft` approved | changelog_diff_path, sections_added |
| `/oc-release bump` applied | bumped_versions[], commit_sha |
| `/oc-release announce` complete | release_ticket_id, announcement_paths |
| `/oc-release verify` ran | gate_results[], pass/fail per check |
| `/oc-release ship` complete | shipped_at, deploy_ticket_id |
| `/oc-release rollback` invoked | rolled_back_at, prior_versions[] |

### skill_state

```json
{
  "current_release": {
    "semver": "1.3.0",
    "theme": "Runtime PM, real platforms, automated releases",
    "phase": "bump-applied",
    "release_ticket_id": "REL-201",
    "started_at": "2026-05-07T19:00:00Z"
  },
  "history": [
    {
      "semver": "1.2.0",
      "theme": "PM-tool MCP integration",
      "shipped_at": "2026-05-05T22:30:00Z"
    }
  ]
}
```

### Cross-Skill Reads

| Reads from | Why |
|---|---|
| every skill's `*.checkpoint.json` | What shipped per skill since last release |
| `oc-app-architect.checkpoint.json` | Sprint outputs feed the changelog draft |
| `oc-git-ops.checkpoint.json` | Merged-PR list feeds "What's new" bullets |
| `oc-docs-forge.checkpoint.json` | Release-PR docs packet verified before ship |
| `oc-deploy-ops.checkpoint.json` | Last-shipped commit SHA |

| Read by | Why |
|---|---|
| `oc-git-ops` | Knows a release is in flight; `/oc-git-sync` shapes the release PR specifically |
| `oc-docs-forge` | Release notes, changelog, and version surfaces feed the release docs packet |
| `oc-repo-ops` | Release PR surfaces and changelog expectations feed the readiness gate |
| `oc-deploy-ops` | Treats oc-release-ops handoff as authoritative for the release tag |
| `oc-monitoring-ops` | Tags incidents in the first 24h after a release with `post-release` |

---

## PM-Tool MCP Integration (v1.3+)

oc-release-ops creates a **release ticket** per release and updates it through
the pipeline.

The runtime contract — concrete tool names, retry policy, idempotency
markers, the `pm_deferred_actions[]` schema — lives in
[`oc-integrations-engineer/references/pm-mcp-protocol.md`](../oc-integrations-engineer/references/pm-mcp-protocol.md).
**All MCP calls below honour that contract; this section says only how
oc-release-ops shapes the release ticket.**

### Release ticket creation (during `/oc-release announce`)

1. Compose release-ticket description with marker
   `<!-- opchain:oc-release-ops:release-ticket:v<semver> -->` followed by the
   changelog summary, scenario links, and the bump commit SHA.
2. Pre-create check: registry-resolved `list_issues` (Linear:
   `mcp__claude_ai_Linear__list_issues`; GitHub:
   `mcp__mcp-server-github__list_issues`) filtered to project +
   `pm.yaml.issue_types.release` (default "Release" or "Task" if missing) +
   description-text query for the marker. If found, reuse.
3. Otherwise call registry-resolved `create_issue` (Linear:
   `mcp__claude_ai_Linear__save_issue`; GitHub:
   `mcp__mcp-server-github__issue_write` action=create).
4. Record the release-ticket id in `oc-release-ops.checkpoint.json`
   `skill_state.current_release.release_ticket_id`.

### Per-event updates

| Event | Marker | Action |
|---|---|---|
| Bump committed | `<!-- opchain:oc-release-ops:bump-committed:v<semver> -->` | `add_comment` linking the bump commit. |
| Staging shipped (from oc-deploy-ops handoff) | `<!-- opchain:oc-release-ops:staging:v<semver> -->` | `add_comment` with staging URL. |
| Production shipped | `<!-- opchain:oc-release-ops:shipped:v<semver> -->` | `add_comment` with prod URL + version stamp; transition release ticket → `shipped` (resolved from `pm.yaml.states.extended`). |

### `/oc-release announce --retry-pm`

Invokes the protocol §4 flush against
`oc-release-ops.checkpoint.json` `pm_deferred_actions[]`. Filter to
`skill: "oc-release-ops"` and `retriable: true`. The release proceeds even if
the PM write fails; flush is reconciliation only.

### Failure modes

- MCP unconfigured → release proceeds; PM writes deferred per protocol §4.
- 403 (cross-team scope) → defer with `retriable: false`; surface to user;
  the bump commit and changelog entry are unaffected.

---

## Principles

1. **Releases are content, not commits.** A release is a coherent story
   about what changed and why; the commits are evidence, not the artefact.
2. **One theme per release.** Don't bundle multiple unrelated efforts; the
   user reading `/changelog` should be able to summarise the release in
   one sentence.
3. **Lockstep skill versions.** Every skill in the catalog moves to the
   release version, even those untouched. Drift breeds confusion about
   which version is "current".
4. **Marketing version ≠ runtime version.** The worker is git-SHA-stamped;
   the catalog is semver-stamped. Don't couple them.
5. **Compatibility is a contract.** Every release explicitly states
   "back-compatible with X.Y" or lists migration steps. Silence is a bug.
6. **Hand off, don't ship.** oc-release-ops produces artefacts; oc-git-ops merges,
   oc-deploy-ops ships. Three skills, one pipeline.
7. **Reversibility until prod.** Every step before `/oc-deploy` is reversible.
   After prod, fix forward with a new release.
8. **Dogfood the cadence.** opchain itself uses oc-release-ops for its own
   releases — the v1.3 release shipped via `/oc-release ship v1.3.0`.
