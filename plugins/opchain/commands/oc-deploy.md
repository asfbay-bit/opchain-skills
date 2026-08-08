---
description: Deploy: audit gate, then staging, then production
---

Invoke the `oc-deploy-ops` skill.

Staging must come from `main`. `scripts/deploy.mjs` enforces this and will refuse
an off-main staging deploy; do not work around it with
`OPCHAIN_ALLOW_OFF_MAIN_STAGING=1` unless the user explicitly asks for a branch
preview and understands staging will not reflect production.
