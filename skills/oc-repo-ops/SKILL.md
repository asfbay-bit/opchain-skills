---
name: oc-repo-ops
displayName: OC · Repo Ops
version: 1.8.1
shortDesc: "Repository hygiene and PR readiness gate. Ensures docs, generated files, git state, catalogs, and cleanup are PR-ready."
phases: [build]
triAgent: false
tryable: true
commands:
  - /oc-repo
  - /oc-repo audit
  - /oc-repo verify
  - /oc-repo clean
  - /oc-repo catalog
  - /oc-repo status
description: >
  Repository hygiene and PR readiness gate. Auto-invoked by oc-git-ops before
  every PR and after oc-docs-forge generates the PR documentation packet. Use for
  /oc-repo, /oc-repo audit, /oc-repo verify, "repo hygiene", "clean this repo",
  "is this PR ready", "check generated files", "catalog drift", "plugin/cache
  drift", ".gitignore policy", orphaned docs/files, stale generated artifacts,
  source-vs-doc mismatch, or any repository cleanliness question.
governance:
  breaking_change_policy: skills/CHANGELOG.md
  last_reviewed: 2026-07-01
  owner: opchain
  docs:
    - { path: SKILL.md, kind: contract, lifecycle: stable }
    - { path: references/pr-readiness-gate.md, kind: reference, lifecycle: stable }
---

# Repo Ops

**On first invocation, read `references/orchestrator.md` and follow its welcome protocol.**

Repo Ops is the repository-level cleanliness gate. It does not write the docs
packet itself; Docs Forge does that. Repo Ops verifies that the packet exists,
that repo state is clean enough to review, and that generated/catalog/source
surfaces agree before Git Ops opens a PR.

## Command Reference

```text
REPO OPS COMMANDS

  /oc-repo                 Show this menu
  /oc-repo audit           Read-only repo hygiene sweep
  /oc-repo verify          PR readiness gate, blocks on failures
  /oc-repo clean           Apply safe cleanup fixes
  /oc-repo catalog         Verify catalog, README, registry, package parity
  /oc-repo status          Show last gate verdict

  /checkpoint              Show oc-repo-ops checkpoint
```

## Every-PR Gate

`oc-git-ops` must invoke Repo Ops before creating every PR. The required order is:

1. Docs Forge generates or verifies the PR documentation packet.
2. Repo Ops verifies repository cleanliness and docs packet presence.
3. Bug Check runs the fast code gate before commit.
4. Git Ops opens the PR only after Repo Ops and Bug Check pass.

Read `references/pr-readiness-gate.md` before `/oc-repo verify`.

## `/oc-repo audit`

Read-only sweep. Report findings without editing files.

Checks:

- Git status, branch, base branch, untracked files, and ignored generated junk.
- `.gitignore` policy against the project convention.
- Generated artifacts that are missing, stale, or checked in incorrectly.
- Catalog parity: source directories, README tables, registry flags, site catalog,
  MCP catalog, packaged plugin/cache where configured.
- Documentation parity: Docs Forge checkpoint, PR body fragment, README/product
  docs, changelog/ADR expectations.
- Checkpoint consistency: stale pointers, generated files that no longer exist,
  contradictory checkpoint-vs-git state.
- Large/binary artifacts, local logs, temp files, screenshots, and accidental
  secrets that should not be in the PR.

## `/oc-repo verify`

PR readiness gate. Fail closed on:

- Missing or stale `.checkpoints/oc-docs-forge.checkpoint.json`.
- Missing `## Documentation` PR body fragment.
- Required docs update absent from the diff and no explicit follow-up.
- Catalog/source drift for surfaces affected by the PR.
- Generated files out of sync with source.
- Dirty untracked files that look related to the PR but are not staged or
  intentionally ignored.
- `.gitignore` rules that contradict project policy.
- Broken internal links in docs touched by the PR.
- Checkpoint pointers to files that no longer exist.

Warnings do not block unless strict mode is enabled, but they must appear in the
PR body or Repo Ops checkpoint.

## `/oc-repo clean`

Apply safe cleanup fixes:

- Remove obvious temp/log/build artifacts.
- Add missing ignore rules that do not conflict with the checkpoint protocol.
- Regenerate catalogs with existing project scripts.
- Ask Docs Forge to rewrite docs rather than editing large doc surfaces here.

Do not delete user-authored files unless the user explicitly asks or the file is
clearly generated and reproducible.

## `/oc-repo catalog`

For Opchain itself, verify:

- `skills/*/SKILL.md` count matches `skills/README.md`.
- `src/lib/flags/registry.js` has one registry flag per skill and command flags
  for every command verb.
- Generated catalogs are current after `npm run gen-catalog` and
  `npm run gen-mcp-catalog`.
- Skill bundle sync does not drift (`npm run sync-bundles:check`).
- Packaged plugin/cache parity is checked when the personal plugin path is in
  scope for the task.

For other repos, infer equivalent catalog surfaces from package scripts,
content collections, generated files, and docs.

## Checkpoint Integration

Location: `{project-dir}/.checkpoints/oc-repo-ops.checkpoint.json`

```json
{
  "skill": "oc-repo-ops",
  "phase": "pr-readiness",
  "status": "complete",
  "progress_summary": "Repo readiness gate passed for PR creation.",
  "context_primer": {
    "key_decisions": [
      "Docs Forge packet required before every PR.",
      ".checkpoints/ is tracked in git unless the project checkpoint protocol says otherwise."
    ],
    "generated_files": [
      ".checkpoints/oc-repo-ops.checkpoint.json"
    ]
  },
  "skill_state": {
    "verdict": "PASS",
    "blocking_findings": [],
    "warnings": [],
    "docs_packet_verified": true,
    "catalog_verified": true,
    "generated_artifacts_verified": true,
    "verified_for_sha": "abc123"
  }
}
```

## Cross-Skill Reads

| Reads from | Why |
|---|---|
| oc-docs-forge | Required PR docs packet and docs-surface decisions |
| oc-git-ops | Branch, base, commit log, PR draft, linked ticket |
| oc-bug-check | Fast gate verdict before commit |
| oc-release-ops | Release PR surfaces and changelog expectations |
| oc-checkpoint-protocol | Checkpoint tracking and git policy |

| Chains to | Why |
|---|---|
| oc-docs-forge | Missing or stale documentation packet |
| oc-bug-check | Code gate has not run or is stale |
| oc-git-ops | Gate passed; PR can be opened |
