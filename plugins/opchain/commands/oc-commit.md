---
description: Commit through the gate rather than around it
---

Invoke the `oc-git-ops` skill for the commit.

Run `/oc-bugcheck` first — the commit gate will block `git commit` otherwise, and
working around the block with `--no-verify` defeats the only enforcement opchain
has.
