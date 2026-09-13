---
description: Reconcile pipeline state against git ground truth and say what to do next
---

Invoke the `oc-orchestrator` skill.

Before reporting any status, reconcile against ground truth — do not trust the
checkpoints alone:

1. Read `.checkpoints/*.json` directly (repos that vendor the opchain checkpoint CLI can run `node scripts/checkpoint.mjs doctor` instead)
2. `git log --oneline -5`, `git tag --sort=-creatordate | head -3`
3. Compare what the checkpoints claim against what git shows.

If a checkpoint marked `complete` describes a release older than the latest tag,
say so first and loudly. A coordinator that reports stale state with confidence is
worse than one that reports nothing.
