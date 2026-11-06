---
name: oc-update
displayName: OC · Update
version: 2.1.0
license: Apache-2.0
shortDesc: Update repo-local Opchain skills and helpers in one command, preserving telemetry and checkpoints.
phases: [foundation]
triAgent: false
tryable: false
commands:
  - /oc-update
  - /oc-update check
  - /oc-update doctor
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
| `/oc-update doctor`, "which Opchain is this session loading?", "why are there two copies?" | `node <skill-dir>/scripts/update.mjs doctor` (read-only; `--json` for machine output; see below) |
| Update only this repo's Opchain plugins | `node <skill-dir>/scripts/update.mjs plugins` (`--check` for read-only) |
| "Add the Opchain plugin to this repo", "use the plugin instead of local skills" | `node <skill-dir>/scripts/update.mjs --with-plugins` (`=ow-tools` or `=opchain,ow-tools` only when named; see Adding plugins) |
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

## Plugins

After skills, the updater keeps this repository's first-party Claude Code plugins
current: `opchain@opchain` and `ow-tools@opchain-work-tools`, when the repo's
`.claude/settings.json` (project scope) or `.claude/settings.local.json` (local
scope) enables them **and** names the known Opchain marketplace source. It runs
the `claude` CLI itself (`plugin marketplace update`, then `plugin update <id>
--scope project|local`) and reports `id: before → after` or `already current`.
Report those lines as printed. Do not run `/plugin` commands, edit settings files
or touch the plugin cache yourself.

- **Run `plugins` after a successful update.** When an update (not `--check`)
  exits 0, 2 or 4 and its output has no `Plugins:` line, an updater from before
  this feature ran; run `node <skill-dir>/scripts/update.mjs plugins` once so the
  plugin step runs from the updater that was just installed.
- **Restart.** When the output says "Restart Claude Code to load the new hooks",
  tell the user: the running session keeps the old hooks until restart.
- **Local scope** installs (enabled in `settings.local.json`) are updated for this
  user only; say they are not shared with the repo.
- **Skipped, not failed:** a plugin with an unrecognised marketplace source, one
  enabled but not installed for this user, and **user-scope** installs (they
  belong to the whole machine; `/plugin update <id>` in Claude Code). Without the
  `claude` CLI on PATH the step prints `plugins: skipped (Claude Code CLI not
  found)` with the `/plugin` commands to run, and skills still exit 0. Codex has
  no plugin system; its `.agents/skills` updates are skills only.
- `--check` makes no CLI call: `opchain@opchain` is compared with the release
  (it ships in lockstep with the skills); `ow-tools` shows its installed version
  only.

## Adding plugins and the duplicate guard

`--with-plugins` adds plugins at **project scope**, through the CLI
(`plugin marketplace add <known source> --scope project`, then `plugin install
<id> --scope project`); the CLI writes `.claude/settings.json`.

- A bare `--with-plugins` adds `opchain@opchain` **only**. Add
  `ow-tools@opchain-work-tools` only when the user names it
  (`--with-plugins=ow-tools` or `=opchain,ow-tools`): it runs code on the
  machine. Never add it on your own initiative. Unknown names are refused.
- Already enabled from the known source: reported as "already enabled"; the
  update step keeps it current.
- The output says "enabled for you, NOT yet for the repo — commit
  `.claude/settings.json`". Relay that, offer the commit, and say a restart is
  needed. Do not commit without the user's go-ahead.
- Refused, with nothing changed: a Codex-only install (`.agents/skills` and no
  `.claude/skills`; Codex has no plugin system), `--check`, `--target`, and an
  Opchain source checkout. Without the CLI it prints the `/plugin` commands.

**Duplicate guard.** The opchain plugin carries the same skills as the
receipt-managed `.claude/skills/oc-*` copies, so a repo with both loads every
skill twice.

- Plain `/oc-update` with both surfaces warns once (`duplicate: …`), still
  updates both, and exits 0. Relay the warning and ask the user which surface to
  keep. Do not pick for them.
- `--with-plugins` that adds opchain to a repo with local copies is **refused**
  unless the user chose `--drop-local-skills` (plugin only) or `--keep-both`.
- `--drop-local-skills` is the **only** path that removes skills. It removes the
  receipt-managed `.claude/skills/oc-*` files that still match their recorded
  digest, through the usual backup and recovery journal, and updates the
  receipt. Customised files are kept and listed. `.agents/skills`,
  `.codex/skills` and non-Opchain skills are never touched. It runs only once the
  opchain plugin is enabled and installed here; if the install failed or the CLI
  is missing, local skills are kept. Pass it only on the user's explicit choice.
  Afterwards the removal is uncommitted: offer the commit as for an install.
- In a plugin-only repo, plain `/oc-update` does not re-create `.claude/skills`
  copies; it updates `.agents/skills` if present, and the plugin step updates
  the plugin.

## `/oc-update doctor`

Read-only. It enumerates every surface a session can load Opchain from — the host's
plugin cache, this repository's `.claude/skills`, `.agents/skills` and legacy
`.codex/skills`, copies inside `.claude/worktrees/*`, and a global `~/.claude/skills` —
with each surface's frontmatter `version:` and, for a source checkout, how many commits
it is behind `origin/main`. The Claude config directory is `$CLAUDE_CONFIG_DIR` when set,
else `~/.claude`. A plugin install counts only when it loads in this repository: user
scope, or project/local scope whose `projectPath` is this repository (another repository's
project install is ignored). A plugins table lists `opchain@opchain` and
`ow-tools@opchain-work-tools` (version only; it ships no oc- skills) with the installed
version and scope, whether `.claude/settings.json` enables it repo-wide, and whether the
repository's marketplace source is the known one. It then flags, one line each:

- **duplicate surfaces** — the same skill ids loaded from two places (e.g. 36 repo-local
  + 36 plugin-cache copies, which doubles every session's skill descriptions);
- **version mismatches** — surfaces that disagree on `version:` (the plugin cache serving
  an older hook than the repo, a worktree on a prior release);
- **uncommitted installs** — skill files the updater wrote that `git status` still shows
  as modified or untracked;
- **parked checkouts** — a source checkout N commits behind `origin/main`, whose sessions
  run that older version's hooks and settings.

Report the table and the flags; fix nothing. The remedy for a duplicate is to remove
one surface (usually the repo-local copy once the plugin is installed). For the plugin +
`.claude/skills` pair the finding names it: `/oc-update --drop-local-skills` (the user's
choice; see the duplicate guard above). For a parked checkout, fast-forward or retire it.

**Uncommitted installs.** `update.mjs` writes files and never commits. After a
successful update, check `git status`; if the installed files are modified or
untracked, say so explicitly — "installed but NOT committed; other worktrees and
clones still run <previous version>" — and offer the commit. An install left on an
unmerged feature branch keeps every worktree cut from `main` on the previous version
indefinitely, and nothing else warns about it.

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
- **Exit 4:** skills installed and verified, but a plugin update or install
  failed (the `FAILED —` line names it; with `--drop-local-skills`, local skills
  were kept). Report both halves: skills done, plugin not. Do not
  re-run the skill update to fix a plugin. **Exit 6** is exit 2 and exit 4 together.
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
