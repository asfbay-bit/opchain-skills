---
description: Install the exact-candidate Git commit boundary in this repository
---

Implements the `oc-bug-check` enrollment contract. This is repository setup,
not a next-skill handoff. Resolve the current repository root, then run:

```sh
node "${CLAUDE_PLUGIN_ROOT}/scripts/install-git-drivers.mjs" --enroll --repo "$(git rev-parse --show-toplevel)"
```

This explicit enrollment copies the packaged verifier and receipt runtime beneath
the repository's Git common directory, installs the final-decision `pre-commit`
hook, and creates `.opchain/` only after setup succeeds.

If setup exits nonzero or prints `BLOCKED`, stop. Never overwrite an existing
foreign hook. Show the user the exact manual integration snippet emitted by the
installer and do not claim commit enforcement until their hook manager runs it.
