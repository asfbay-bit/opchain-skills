---
description: Install the exact-candidate Git commit boundary in this repository
---

Implements the `oc-bug-check` enrollment contract. This is repository setup,
not a next-skill handoff. Installing the plugin installs no gate: until this
command succeeds, no hook checks anything in this repository. Resolve the
current repository root, then run:

```sh
node "${CLAUDE_PLUGIN_ROOT}/scripts/install-git-drivers.mjs" --enroll --repo "$(git rev-parse --show-toplevel)"
```

This explicit enrollment copies the packaged verifier and receipt runtime beneath
the repository's Git common directory, installs three managed hooks, and creates
`.opchain/` only after setup succeeds:

- `pre-commit` — reruns the declared checks on the exact staged candidate and
  writes the receipt that is the final commit decision.
- `post-commit` — runs even under `--no-verify`. When HEAD's tree has no PASS
  receipt it writes `.git/opchain/bypasses/v1/<sha>.json`, appends to the
  bug-check checkpoint's `skill_state.bypasses`, and prints a warning. The reason
  comes from the commit's `Opchain-Bypass:` trailer.
- `pre-push` — refuses to push any commit that has neither a PASS receipt nor an
  `Opchain-Bypass:` trailer, listing the commits. Commits a rebase or cherry-pick
  rewrote are excused. `OPCHAIN_PUSH_BYPASS=1 git push` is the loud escape hatch;
  use it once for history that predates enrollment.

Enrollment then writes the managed opchain section of the repo-root `AGENTS.md`
for agents that do not read `CLAUDE.md` (Codex, Cursor, Copilot): read
`.checkpoints/` first, pick the matching skill, the commit-gate rules above, and
vendored `oc-*` skills change only through the updater. It names no version
(`.opchain-install.json` does), only the text between its markers changes, and
`/oc-update` refreshes it. It is skipped when `AGENTS.md` is a symlink or has a
line reading `<!-- opchain:agents-section off -->`, and with `--no-agents-md`.
Offer to commit `AGENTS.md`.

If setup exits nonzero or prints `BLOCKED`, stop. Never overwrite an existing
foreign hook. Show the user the exact manual integration snippet emitted by the
installer and do not claim commit enforcement until their hook manager runs it.

Other modes, with the user's arguments in `$ARGUMENTS`:

- `--doctor` — installs nothing. Prints PASS/FAIL per item: enrollment, runtime,
  each hook, the `.bugcheck.json` `verification` block, whether every declared
  command resolves (`node_modules/.bin` or PATH, `npm run` scripts exist), and
  whether `node_modules/` is a real install rather than a `.vite`-only cache.
  Run it when a gate FAILs with exit 127 or on a fresh worktree.
- `--ci [--force]` — enrolls, vendors the verifier into `.opchain/runtime/`, and
  writes `.github/workflows/opchain-evidence.yml` so every pull request runs
  `verify-candidate run` and the `evidence:pr` gate without the plugin. Never
  overwrites an existing workflow without `--force`. Tell the user to commit both.
- `--claude-md` — creates or updates the managed opchain section of `CLAUDE.md`
  naming this repository's verbs (`/oc-commit`, `/oc-pr` or `/oc-git-sync`,
  `/oc-deploy`, `/oc-bugcheck`, `/oc-enroll`) and the rule that commits go
  through the gate, PRs carry the docs packet, and `--no-verify` never happens
  without `/oc-bugcheck bypass`.
- `--agents-md`: creates or updates the managed opchain section of `AGENTS.md`
  without enrolling. Enrollment already writes it (see above); this refreshes it
  by hand, and adds the gate rules only once the repository is enrolled. Both
  flags can be combined: `--claude-md --agents-md`.
- `--no-agents-md`: enroll without writing the `AGENTS.md` section.
