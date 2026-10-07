---
name: oc-update
displayName: OC · Update
version: 2.0.4
license: Apache-2.0
shortDesc: Update repo-local Opchain skills and helpers in one command, preserving telemetry and checkpoints.
phases: [foundation]
triAgent: false
tryable: false
commands:
  - /oc-update
  - /oc-update check
description: >
  Check and update Opchain skills installed in the current repository. Use for
  /oc-update, "update Opchain", "refresh my Opchain skills", or "check for Opchain
  updates". Preserves telemetry consent, usage history, checkpoints, and unrelated
  skills. Does not upgrade application dependencies or globally installed plugins.
---

# Update Opchain

**On first invocation, read `references/orchestrator.md` and follow its welcome protocol.**

Use the bundled updater for all version checks, downloads, installation, and
verification. It needs Node.js 22.13+; consumer updates also need access to
`https://opchain.dev`. Source checkout updates work offline.
Resolve `scripts/update.mjs` relative to **this loaded skill's directory**;
run it with the consuming repository as the working directory. Do not assume
the user's repository contains Opchain's development scripts or package commands.

## Commands

First distinguish an update from a first installation. Check the consuming repo's
`.claude/skills`, `.agents/skills`, and legacy `.codex/skills` for Opchain files.
First recognize an **Opchain source checkout**: a Git root with
`skills/orchestrator.md`, `skills/oc-checkpoint-protocol/SKILL.md`, and both
`scripts/sync-skill-bundles.mjs` and `scripts/sync-plugin-skills.mjs`. The updater
auto-detects this layout, including when the local skill links have not been
created yet. Run it normally; source links are supported through this path.
If an update/check request has **no repo-local installation**, report that fact
and identify the host's plugin manager as the route for a global/plugin update.
Do not run the updater's fresh-install default and silently create a duplicate
local copy. This no-local-install rule excludes the source checkout just described.
An explicit request to install in this repo authorizes the fresh
install commands below.

| Request | Run |
|---|---|
| `/oc-update`, "update Opchain" | `node <skill-dir>/scripts/update.mjs` |
| `/oc-update check`, "is an update available?" | Same command with `--check` (read-only) |
| Refresh this Opchain source checkout | Same command; `--source` explicitly requires source mode |
| Install specifically for Claude or Codex | Add `--target=claude` or `--target=codex` |
| Install for both | Add `--target=both` |
| User specifies another repo | Add `--root=<absolute-repo-path>` |

Pass arguments as separate values, quoting paths with spaces. A request to
update authorizes running the updater; a version-check request authorizes only
`--check`. Do not ask the user to handle archives, copy folders, or re-enable
telemetry. If prerequisites are missing, report the specific prerequisite.

The updater detects existing repo installs, refreshes their full skill files and
local helpers, and backs up files it replaces. Legacy `.codex/skills` copies are
also made available under `.agents/skills`. A fresh automatic install defaults
to `.claude/skills`. Global/plugin-managed installations use the host's plugin
manager; do not overwrite plugin caches or change hook configuration.

## Source checkout behavior

The current branch's `skills/` is authoritative. The updater runs that checkout's
canonical generators in a temporary copy, refreshes generated references/runtimes
and `plugins/opchain/skills`, and creates or repairs `.claude/skills` links pointing
inside the canonical tree. Existing source edits and outside work are preserved.
The plugin skills directory is a generated mirror; replaced or obsolete mirror
files are backed up. External links and real directories where source links belong
are refused. Interrupted updates retain the same recovery journal as consumer mode.

Source mode **does not fetch or pull Git, change branches, import another
worktree's candidate, or download a public release**. Report the checked-out
version and synchronization result, not "latest upstream release installed".
It can therefore work before the 2.0 release endpoint is published. Fetching or
merging newer source requires the user's separate Git-update request.

## Results and recovery

- **Exit 0:** report the installed version, updated/already-current result, and
  unchanged telemetry state. Include the backup location when one was created.
- **Exit 2:** skills installed or checked, but enabled telemetry is unhealthy.
  Report the database issue and preserve the consent flag and history. Do not
  run `enable`, `disable`, `record`, or invent an empty replacement database.
- **Exit 1:** report the error. A failed download or invalid bundle changes no
  skill files. For an installation failure, report the rollback/recovery status
  exactly as returned; do not claim completion or keep retrying.
- If a lock remains after process termination, inspect the printed backup journal
  and follow `references/recovery.md`. The shared runtime provides offline `recover` and read-only recovery checks. Never delete a lock blindly.

Checkpoint preservation is part of this operation: **do not write or reconcile
any `.checkpoints/` files as a side effect of updating, including this skill's
own checkpoint**. The root `.opchain-install.json` receipt is its install state;
it contains version and file digests, never telemetry consent. Other skills'
normal checkpoint behavior is unchanged.
Source mode uses the checked-out source and Git history instead of a consumer
receipt; it also never writes checkpoints.

An update includes the files shipped by the release. It does not authorize
commits, deployment, connecting accounts, telemetry export, or changing the
user's enabled/disabled skill settings. If discovery still shows an older
version after success, suggest a new agent session.

The bundled `scripts/opchain.mjs` is the unified runtime entrypoint. `capabilities`
reports its command/host matrix; `update` retains this skill’s behavior.
