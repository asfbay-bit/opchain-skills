---
description: Deploy: audit gate, then staging, then production
---

Invoke the `oc-deploy-ops` skill.

Staging must come from `main`. If the project's deploy tooling enforces a
staging-from-main rule, do not work around it (or bypass its escape hatch)
unless the user explicitly asks for a branch preview and understands staging
will not reflect production.
