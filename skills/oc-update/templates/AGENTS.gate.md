### Commits Go Through the Gate

This repository is enrolled in the opchain commit gate.

- The gate is plain git hooks: `pre-commit`, `post-commit` and `pre-push`. They
  run for any agent or person that runs `git commit` or `git push` here.
- `pre-commit` reruns the checks declared in `.bugcheck.json` on the exact
  staged tree and writes a receipt. When it refuses a commit, stop. Read the
  output, fix the cause, stage again and commit again.
- Never use `git commit --no-verify` (or `OPCHAIN_BYPASS=1`) unless the user
  approved a bypass, and record it with a trailer quoting who approved it and
  why: `git commit --trailer "Opchain-Bypass: <reason>"`. `post-commit`
  records every commit that has no passing receipt, and `pre-push` refuses to
  push one without an `Opchain-Bypass:` trailer.
- To run the checks before committing where `.opchain/runtime/` is vendored,
  stage your changes and run
  `node .opchain/runtime/scripts/verify-candidate.mjs run --repo .`
