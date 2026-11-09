<!-- opchain:managed-section v1 -->
## opchain

This repository is enrolled in opchain. These are its verbs; the hooks and CI
behind them are the gate, the verbs are how you go through it.

| Verb | Use it for |
|---|---|
| `/oc-enroll` | repository setup: installs the pre-commit, post-commit and pre-push hooks and the verifier runtime. `/oc-enroll --doctor` says whether the gate will run here. |
| `/oc-bugcheck` | run the checks on the staged candidate before committing; `/oc-bugcheck bypass` records a deliberate bypass and writes its trailer |
| `/oc-commit` | the commit, through the enrolled gate |
| `/oc-pr` or `/oc-git-sync` | the pull request, carrying the docs packet (`pr-docs-v1`) and readiness verdict (`pr-readiness-v1`) CI requires |
| `/oc-merge <pr>` | merging a reviewed pull request: checks green, head pinned with `--match-head-commit`, this repository's merge method |
| `/oc-deploy` | audit gate, staging, production |

Rules:

- Commits go through the enrolled gate. `git commit` runs the verifier on the
  exact staged tree and writes a receipt; a commit without one is a bypass.
- Pull requests carry the docs packet. Open them with `/oc-pr`, not a bare
  `gh pr create`; the opchain-evidence workflow fails a head whose
  `.checkpoints/` handoffs do not cover its tree.
- Never `git commit --no-verify` without `/oc-bugcheck bypass`. The post-commit
  hook records every bypass and the pre-push hook refuses to push one that has
  no `Opchain-Bypass:` trailer quoting who approved it and why. Those records
  are local: CI sees only the trailers, so a bypass that also skips the push
  hook is not caught there. Do not rely on CI to catch it.
- The opchain-evidence workflow runs from the pull request, so it is only an
  independent gate when `.github/workflows/` and `.opchain/` need CODEOWNERS or
  required review (or an organization-required workflow) to change.
<!-- /opchain:managed-section -->
