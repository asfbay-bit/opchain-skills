---
description: Code quality audit with the Auditor/Fixer/Verifier loop
---

Invoke the `oc-code-auditor` skill and run `/oc-audit`.

Record findings by severity in the checkpoint. Do NOT set `status: complete` while
any critical or high finding is unresolved — mark the loop `open` and put the next
fix in `next_actions[0]`. An audit that closes over open findings reads as done
forever.
