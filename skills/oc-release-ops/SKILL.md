---
name: oc-release-ops
displayName: OC · Release Ops
version: 1.9.0
license: Apache-2.0
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
  - /oc-release verify
  - /oc-release status
  - /oc-release rollback
description: >
  Release-cadence operator. Plan, draft, bump, announce, and ship versioned
  releases of opchain (or any opchain-managed project). Reads sprint
  checkpoints, proposes the next semver, drafts the /changelog entry from
  what actually shipped, bumps every skill version atomically, and hands
  off to oc-git-ops + oc-deploy-ops. Use for /oc-release, /oc-release plan, /oc-release
  draft, /oc-release bump, /oc-release announce, /oc-release ship, "cut a release",
  "ship v1.3", "draft the changelog", "what's in this release", "version bump".
  The release tag itself is oc-git-ops (/oc-git-release).
---

# Release Ops

**On first invocation, read `references/orchestrator.md` and follow its welcome protocol.**

Release-ops sits between `oc-git-ops` and `oc-deploy-ops` at release boundaries. The
recurring "scope → sprint plan → changelog → version bump → ship" pattern that
opchain itself uses (and that any opchain-managed project will eventually want)
is what this skill owns. opchain has cut its own releases with it since v1.3.

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
  /oc-release announce       Check the homepage release bar + release ticket + announcement copy

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
│   /oc-release    │  the release-coupled site surfaces (release bar, header
│   bump        │  chip, badges) — one atomic change for a minor; a
│               │  patch's site rows follow the tag in a site PR.
└───────┬───────┘
        │
        ▼
┌───────────────┐  composes release announcement (release ticket via PM-MCP +
│   /oc-release    │  internal announcement copy + external blog/social copy);
│   announce    │  per oc-integrations-engineer pm-mcp-protocol.md.
└───────┬───────┘
        │
        ▼
┌───────────────┐  invokes /oc-release verify; hands the branch to oc-git-ops
│   /oc-release    │  /oc-git-sync, then /oc-git-release after merge; then
│   ship        │  /oc-deploy staging → /oc-deploy prod.
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

Produce a `/changelog` entry ready for review. Follow
`references/changelog-recipe.md` for the voice and section order, and
`references/site-release-surfaces.md` (L4, L5, F2–F4) for where the entry goes
on the page.

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

The draft goes into `site/src/pages/changelog.astro` as the release's
`<article class="hero-card hero-card--next" id="vN-N">` card in the Coming Next
tab (forward surface F2). For a minor release, the release PR (before the tag)
turns it into the open `hero-card hero-card--released is-open` card with
`<span class="hero-ver">vN.N.0 · shipped <Mon DD, YYYY></span>`, and the heroes
age per the five-hero rule (live-claim surface L4). A patch release does not get
its own hero: after the tag, its site PR extends the open hero's version/date
range and adds a compact `<article class="rel-card">`.

### Validation

Check after drafting (these are review checks, not rows of `/oc-release verify`):
- Each "What's new" item ≤ 280 characters (changelog page reading rhythm).
- Each scenario callout is ≤ 600 characters.
- "Compatibility" section is non-empty.
- The card's `hero-ver` date is the planned ship date, in `Mon DD, YYYY` form.

Write checkpoint: phase `draft-approved`.

---

## Phase 3: `/oc-release bump`

Atomic version bump across the catalog.

### What gets bumped

- `skills/*/SKILL.md` frontmatter `version:` field, in lockstep with the
  release version. (v1.2 precedent: every skill version equals the release
  version.)
- `release-seal.json` `catalogVersion`, preserving its schema and resetting
  `generation` to 1; increment only when intentionally replacing that version's
  untagged reviewed baseline. Refresh `publisherWorkflowSha256` from the exact
  `.github/workflows/publish-mcp-registry.yml` blob that the tag will execute,
  and `serverJsonSha256` from the exact MCP registry payload it will publish.
- `server.json`, `.claude-plugin/marketplace.json` and
  `plugins/opchain/.claude-plugin/plugin.json` `version` fields.
- The release-coupled site surfaces in `references/version-locations.md` and
  `references/site-release-surfaces.md`, on a schedule set by the release type.
  `check-release-surfaces.mjs` (CI) requires the site's live-claim line to match
  the newest `skills/CHANGELOG.md` heading at major.minor level:
  - **Minor:** the bump PR also flips every probed live-claim surface (header
    chip, release bar, stat chip, open hero + aging, Skill Library callout,
    styleguide badge, architecture labels) and recounts the tab, before the tag.
    A PR that adds the heading without them fails CI. Tag and deploy in the same
    sitting; v1.9.0's #476 sat a day before the tag landed on #477.
  - **Patch:** the bump is a product-only PR (the major.minor line does not
    change). After the tag, a site PR carries the patch-only surfaces: the open
    hero's range + a patch `rel-card`, the tab recount, and the styleguide
    badge's full patch version.

### Atomicity

For a minor release the bump is one git commit (or a single file write batch in
a Claude Code session). Partial bumps leave the catalog in a state where
`scripts/gen-skills-catalog.mjs` may still validate but the homepage and
styleguide disagree on version — confusing to readers. For a patch, the styleguide
and changelog range lagging the catalog between the tag and the site PR is
intended, not a partial bump. Always run
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
4. **Homepage release bar** — the announce phase checks it against
   `references/site-release-surfaces.md`: the `rb-tag` "vN · shipped" label
   (L2) and stat chip (L3) name the release being shipped, while the bar's
   `href` points at the **next** release's card (`/changelog#vN-N`, hyphenated;
   F1). Do not repoint the href at the shipped release.

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

1. For a minor release, confirm the release PR flips the live-claim site surfaces
   (`references/site-release-surfaces.md`, Minor column, L1–L10) alongside the
   bump; a patch's release PR is product-only. Then run `/oc-release verify` — the pre-tag rows of the gate. Hard-blocks on any
   failure. (The tag row cannot pass yet: the tag is created in step 3.)
2. Invoke `oc-docs-forge` for the release docs packet:
   - Run `/oc-docs pr` so the release PR carries its `## Documentation` section,
     the changelog entry, and any README/product-doc upkeep the release requires.
   - (oc-git-ops then runs its own pre-PR gate — `/oc-docs pr` + oc-repo-ops
     `/oc-repo verify` — before the PR opens; a stale packet or dirty repo blocks it.)
3. Hand off to `oc-git-ops`:
   - Invoke the oc-git-ops skill (read its SKILL.md per oc-orchestrator §3 active
     chaining).
   - Run `/oc-git-sync v<semver>` with the bump commit. oc-git-ops opens / merges
     the release PR.
   - After the merge, from an `origin/main` checkout, run
     `npm run release-sequence -- --stage pre-tag --version <semver>` (opchain.dev
     repo): it expects the tag gate to report the new version's missing tag, and
     checks the release surfaces and a clean tree.
   - **After the PR merges, run `/oc-git-release <semver>`.** This is the step
     that was missing until v1.8.3: the tag, and the push that fires
     `publish-mcp-registry.yml`. Ten releases (v1.0–v1.7) shipped without it
     because this handoff named no verb and oc-git-ops had none to name.
     `npm run deploy` now refuses a release whose catalog version has no tag, so
     skipping this step blocks the deploy rather than silently shipping.
   - Then run the post-tag row of the gate: `node scripts/check-release-tag.mjs`
     must exit 0.
   - **Patch only:** open and merge the site PR (Patch column of
     `references/site-release-surfaces.md`: L4 range + `rel-card`, L5 recount, L7
     full version) through the same pre-PR gate, before deploying.
4. Hand off to `oc-deploy-ops` — always after the tag:
   - Invoke oc-deploy-ops.
   - Run `/oc-deploy staging` first; user eyeballs.
   - Run `/oc-deploy prod` on user confirmation.
5. After `/oc-deploy prod`, close the release ticket via PM-MCP with the
   **Production shipped** marker
   `<!-- opchain:oc-release-ops:shipped:v<semver> -->` from the per-event table
   below (one marker per event, so a re-run finds the first write).
6. Write checkpoint: phase `shipped`, status `complete`.

### `/oc-release verify` (the gate)

**Agent-executed.** No script runs this whole table for you. The mechanical
subset in the opchain.dev repo is `npm run release-sequence -- --stage pre-merge`,
then (from `origin/main`, before signing) `--stage pre-tag --version <semver>`;
run those first, then the checkpoint rows below. Rows run in order; the gate
aborts on the first failure (rows marked warn-class report and continue).

| Check | Stage | Implementation |
|---|---|---|
| Catalog validates | pre-tag | `npm run gen-catalog` |
| PM-MCP integration validates | pre-tag | `npm run validate-pm-mcp` |
| Flag registry mirror is current | pre-tag | `npm run gen-flags` |
| Tests pass | pre-tag | `npm test` |
| Site builds | pre-tag | `npm run site:build` |
| Live-claim site surfaces (changelog Just-Released hero, header chip, release bar, stat chip, Skill Library callout, styleguide badge, architecture labels) agree on one release line, at minor level (`v1.9`), with the newest `skills/CHANGELOG.md` entry | pre-tag | `node scripts/check-release-surfaces.mjs` |
| Release-PR docs packet current | pre-tag | oc-docs-forge `/oc-docs verify` — checkpoint `verified_for_sha` matches HEAD, PR body fragment has `## Documentation` |
| Repo is PR-ready | pre-tag | oc-repo-ops `/oc-repo verify` — verdict PASS |
| All skill versions match the release version | pre-tag | `node scripts/check-release-tag.mjs --json` — `version` must equal `<semver>` and `reason` must be exactly `missing-tag` (any other reason means the bump or seal is incomplete) |
| Compliance delta bundle exists (conditional, v1.9) | pre-tag | only when `.opchain/compliance.yaml` exists: oc-compliance-ops `/oc-comply evidence` ran for this release with the delta section; absent profile, row skipped. **Warn-class:** a missing delta bundle is reported in the verify output and the chain continues — matching the deploy gate's presence-checked row (compliance is reported, never enforced) |
| Release is tagged and pushed | **post-tag** — runs after `/oc-git-release`, never before | `node scripts/check-release-tag.mjs` exits 0 — the same check `npm run deploy` runs, so the gate you run and the gate that blocks you cannot disagree |

In a project other than opchain.dev (multi-project mode below), the rows that
name opchain scripts or site files do not apply: run the project's own test and
build commands, check the version locations listed in `.opchain/release.yaml`,
and keep the docs-packet, repo-readiness and tag rows. A missing opchain script
is not a gate failure there.

---

## Phase 6: `/oc-release rollback`

If the release was bumped but **not yet shipped** (`/oc-deploy prod` not yet run):

1. `git revert` the bump commit.
2. Restore the previous `/changelog` section ordering.
3. Reset the release-coupled site surfaces the bump touched
   (`references/site-release-surfaces.md`) to the prior version.
4. Write checkpoint: phase `rolled-back`.

If the release **has shipped**, do NOT use `/oc-release rollback` — invoke
`oc-deploy-ops /oc-deploy rollback` to revert the worker, then file a fresh release with
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

The shared checkpoint schema, write rules and resume protocol live in
`references/checkpoint-protocol.md`, bundled with this skill. This section adds only
what is specific to oc-release-ops.

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

The shape the v1.9 cut wrote. `current_release` is the release in flight;
`prior_release` is the last one shipped; each later key is the evidence block for
one stage, written when that stage completes.

```json
{
  "current_release": {
    "semver": "1.9.0",
    "theme": "Assurance and governed delivery ops",
    "phase": "bump-applied",
    "started_at": "2026-08-28",
    "shipped_at": null,
    "release_ticket_id": "REL-201"
  },
  "prior_release": { "semver": "1.8.3", "tag": "v1.8.3", "source_sha": "…", "shipped_at": "…" },
  "catalog":      { "version": "1.9.0", "skills": 33, "previous_skills": 29 },
  "pre_merge":    { "verdict": "PASS", "workflow_steps": [], "warnings": [], "failed": [] },
  "release_seal": { "catalog_version": "1.9.0", "generation": 1, "verified_for_sha": "…" },
  "release_pr":   { "number": 477, "url": "…", "merge_sha": "…", "merged_at": "…" },
  "tag":          { "name": "v1.9.0", "tag_object": "…", "peeled_commit": "…", "signing_fingerprint": "…" },
  "publisher":    { "tag_run_id": "…", "registry_status": "…", "published_at": "…" },
  "staging":      { "status": "verified", "url": "https://staging.opchain.dev", "version_id": "…" },
  "production":   { "status": "verified", "url": "https://opchain.dev", "health_version": "…", "rollback_used": false },
  "roadmap":      { "milestone_number": 1, "milestone_status": "closed", "label": "roadmap:shipped" },
  "monitoring":   { "baseline_pr": "…", "canary_conclusion": "…", "deploy_lag_conclusion": "…" },
  "post_release_drift": { "detected_at": "…", "ledger": "…" }
}
```

`release_ticket_id` appears only when a PM tool is configured. Where the When to
Write fields live: plan fields (`proposed_semver` → `current_release.semver`,
theme, headline items) in `current_release`; draft, bump and verify results in
`progress_table` rows plus the `catalog` / `pre_merge` / `release_seal` blocks;
announce paths in `context_primer.generated_files`; ship results in `release_pr`,
`tag`, `staging`, `production` and `monitoring`; rollback in `current_release.phase`
(`rolled-back`) with the prior versions in `prior_release`.

### Cross-Skill Reads

| Reads from | Why |
|---|---|
| every skill's `*.checkpoint.json` | What shipped per skill since last release |
| `oc-app-architect.checkpoint.json` | Sprint outputs feed the changelog draft |
| `oc-git-ops.checkpoint.json` | Merged-PR list feeds "What's new" bullets |
| `oc-docs-forge.checkpoint.json` | Release-PR docs packet verified before ship |
| `oc-deploy-ops.checkpoint.json` | Last-shipped commit SHA |
| `oc-compliance-ops.checkpoint.json` | Compliance delta bundle for the verify gate's conditional row |

| Read by | Why |
|---|---|
| `oc-docs-forge` | Release notes, changelog, and version surfaces feed the release docs packet |
| `oc-repo-ops` | Release PR surfaces and changelog expectations feed the readiness gate |

The release tag is enforced by `scripts/check-release-tag.mjs`, which
`npm run deploy` imports; oc-deploy-ops does not read this checkpoint for it.

---

## PM-Tool MCP Integration (v1.3+)

oc-release-ops creates a **release ticket** per release and updates it through
the pipeline.

The runtime contract — concrete tool names, retry policy, idempotency
markers, the `pm_deferred_actions[]` schema — lives in
`oc-integrations-engineer/references/pm-mcp-protocol.md`, in that skill (not bundled
with this skill; install the full catalog, or oc-integrations-engineer alongside it).
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
6. **Hand off, don't ship.** oc-release-ops produces artefacts; oc-git-ops merges
   and tags, oc-deploy-ops ships. Three skills, one pipeline — and the seams
   between them are held by machinery, not by this sentence. `/oc-release verify`
   and `npm run deploy` both call `scripts/check-release-tag.mjs`; a release that
   skips the oc-git-ops tag cannot reach production.
7. **Reversibility until prod.** Every step before `/oc-deploy prod` is reversible.
   After prod, fix forward with a new release.
8. **Dogfood the cadence.** opchain itself uses oc-release-ops for its own
   releases — the v1.3 release shipped via `/oc-release ship v1.3.0`.
