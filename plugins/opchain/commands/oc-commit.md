---
description: Commit through the gate rather than around it
---

Invoke the `oc-git-ops` skill for the commit.

Run `/oc-enroll` first if the repository is not enrolled, then `/oc-bugcheck`.
Enrollment must succeed before continuing; a foreign-hook `BLOCKED` result is not
a warning. The installed Git hook makes the final decision on the exact staged
candidate. `git commit --no-verify` deliberately bypasses local enforcement, so a
protected CI check remains the independent boundary.
