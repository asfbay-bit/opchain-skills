---
description: Run the pre-commit quality gate (types, lint, tests, secrets, build, deps)
---

Invoke the `oc-bug-check` skill and run `/oc-bugcheck run` on the staged changes.

When it finishes, write `.checkpoints/oc-bug-check.checkpoint.json` with
`skill_state.last_run_verdict` set to PASS, FAIL, or UNSUPPORTED (the same value
as `skill_state.last_run.verdict`), and `skill_state.verified_tree` set to the
hash of the full working tree, computed with the recipe in the skill's
§ Commit gate contract. Bare `git write-tree` is not that hash: it covers only
what is staged. The commit gate reads both fields: a verdict without a matching
tree hash is not evidence that this code was checked, however recently it ran.

UNSUPPORTED is not a pass. If the stack was not recognized, say so plainly.
