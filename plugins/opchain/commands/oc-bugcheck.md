---
description: Run the pre-commit quality gate (types, lint, tests, secrets, build, deps)
---

If this repository is not explicitly enrolled, run `/oc-enroll` first. A successful
enrollment installs the packaged verifier at the Git commit boundary; a `BLOCKED`
foreign-hook result must stop the workflow.

Then invoke the `oc-bug-check` skill and run `/oc-bugcheck run`. Its checkpoint is
workflow history, not commit authorization. At `git commit`, the installed Git hook
reruns the declared checks on the immutable effective staged candidate and writes
the external receipt that makes the final decision.

UNSUPPORTED is not a pass. If the stack was not recognized, say so plainly.
