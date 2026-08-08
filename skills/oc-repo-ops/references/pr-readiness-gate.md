# PR Readiness Gate

Repo Ops owns the repository-level gate before Git Ops opens a PR.

## Required Order

1. Docs Forge generates or verifies the PR documentation packet.
2. Repo Ops verifies repository cleanliness and docs packet presence.
3. Bug Check verifies fast quality checks before commit.
4. Git Ops creates or updates the PR.

## Blocking Findings

Block PR creation when any of these are true:

- `.checkpoints/oc-docs-forge.checkpoint.json` is missing or stale.
- The PR draft lacks a `## Documentation` section.
- README/product docs should change but do not, and no explicit follow-up exists.
- Generated files are stale or missing relative to source.
- Catalog surfaces disagree with source.
- Untracked files appear related to the PR but are neither staged nor ignored.
- Ignore rules contradict project policy.
- Touched docs contain broken internal links or references to deleted paths.
- Checkpoints reference generated files that no longer exist.

## Opchain-Specific Catalog Checks

For the Opchain repo, compare:

- `skills/*/SKILL.md`
- `skills/README.md`
- `src/lib/flags/registry.js`
- generated skill and MCP catalogs
- site skill pages
- packaged plugin/cache, when plugin distribution is in scope

## Non-Blocking Warnings

Warn on old docs, broad TODOs, long PR bodies, screenshots that may need refresh,
or follow-up docs that are reasonable but not required for this PR.
