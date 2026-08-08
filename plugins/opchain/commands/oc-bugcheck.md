---
description: Run the pre-commit quality gate (types, lint, tests, secrets, build, deps)
---

Invoke the `oc-bug-check` skill and run `/oc-bugcheck run` on the staged changes.

When it finishes, write `.checkpoints/oc-bug-check.checkpoint.json` with
`skill_state.last_run_verdict` set to PASS, FAIL, or UNSUPPORTED, and
`skill_state.verified_tree` set to the output of `git write-tree`. The commit
gate reads both: a verdict without a matching tree hash is not evidence that
this code was checked.

UNSUPPORTED is not a pass. If the stack was not recognized, say so plainly.
