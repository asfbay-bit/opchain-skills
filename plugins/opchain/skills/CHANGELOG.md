# opchain skills — CHANGELOG

The breaking-change + release log for the opchain skill set. Skills that carry a
`governance:` frontmatter block (15 of 33; the block is optional) point
`governance.breaking_change_policy` here. Skills are versioned in
**lockstep** — one minor bump moves the whole catalog — so entries are per
release, not per skill.

Versioning: additive capability → MINOR. A change that alters a documented
contract another skill depends on → called out as **BREAKING**. The on-disk
checkpoint `protocol_version` is tracked separately (see
`oc-checkpoint-protocol/SKILL.md`).

## [Unreleased]

### Fixed

- **Commit gate (plugin) — the tree hash is mandatory, and the documented schema
  passes.** `hooks/pre-commit-gate.cjs` allowed a PASS with no `verified_tree` for
  10 minutes, so a recent PASS also covered edits made after it. It now denies any
  PASS without a tree hash, at any age; reads `skill_state.last_run.verdict` (the
  shape oc-bug-check's SKILL.md documented, which the gate previously ignored); and
  denies when recorded verdict fields disagree. **Stricter:** a checkpoint that
  records a verdict but no `skill_state.verified_tree` is now denied where it used
  to pass for 10 minutes — re-run `/oc-bugcheck` so the run records the tree.
- **Commit gate (plugin) — a wrapper's re-scan covers only what it runs.** Once a
  wrapper (`sh -c`, `bash -c`, `eval`, `… | sh`) appeared anywhere in a command,
  the gate re-scanned the *whole* command for `git commit`, so quoted data — a JSON
  dry-run payload piped into the gate — plus an unrelated `sh -c` on the next line
  was denied as a commit. The re-scan now covers the wrapper's own command, plus
  anything piped into it or fed to it by a here-doc. **Stricter:** wrappers are
  found in the same command position as `git`, so `FOO=1 bash -c '…'`,
  `/bin/sh -c '…'`, `nice sh -c '…'` and `then sh -c '…'`, which each committed
  past the gate, now deny. The prefix grammar no longer backtracks
  exponentially (26 × `time` outran the hook's 10s timeout), and quote spans
  follow bash's rules: `\'` inside single quotes is not an escape, so
  `echo 'a\' ; git commit …` no longer hides a commit.
- **Commit gate (plugin) — commands are also read the way bash reads them.**
  Quoted text was data to every matcher, but bash reads inside it, so each of
  these committed past the gate: `echo "$(git commit -m x)"` and
  `` echo `git commit -m x` `` (substitutions run inside double quotes and
  unquoted here-documents); `\git commit`, `"git" commit` and `\sh -c '…'`
  (quotes are removed before the command is looked up);
  `find . -exec sh -c '…' \;`; `sh -c 'true;git commit …'`; and a commit after
  an apostrophe in a comment or in `<<'EOF'` prose, where `don't` opened a quote
  bash never saw. The gate now reads each command a second time with bash's
  quoting rules and treats a commit found by either reading as a commit, so no
  command it denied before is allowed now. Quoted here-document prose,
  `echo "use git commit"` and `grep 'git commit'` stay data. **Stricter:** these
  forms deny; `--no-verify` counts only where both readings see it outside
  quotes; and a command inside `"$(…)"` is judged like the same command outside
  it, so a dry run that pipes a payload naming `git commit` into `sh -c "…"` is
  denied there too.
- **Commit gate (plugin) — comments and here-document prose stay data.** Three
  data commands were denied as commits: `ls # then git commit later` (both
  readings read comments), `cat > notes.md <<"EOF"` prose mentioning
  `$(git commit …)` (the first reading lexed the body as shell), and a `"` in
  `"$(cat <<'EOF' … EOF)"` prose, which mis-paired every quote after it. What the
  bash-style reading knows now masks what the first reading lexes: a comment that
  could start no command is hidden from both, and a here-document body read only
  by a plain `cat` or `tee` — not piped, not grouped, and written to no file the
  command names again — is hidden from the first reading. Any other reader still
  has its body read as commands (`dash <<EOF`, `ssh host <<'EOF'`,
  `cat <<'EOF' | dash`, `cat > x.sh <<'EOF' … sh x.sh`), and a comment holding
  `;`, `&`, `|`, a group or a substitution is still read, because a shell can
  read `#` as a word. **Stricter:** `--no-verify` or `OPCHAIN_BYPASS=1` inside a
  comment (`git commit -m x # --no-verify`) was taken as an explicit bypass; it
  now denies.
- **Commit gate (plugin) — `exec`, `caffeinate`, `builtin` and `script` are
  transparent prefixes too.** `exec git commit` replaces the shell with git and
  committed past the gate; `exec` was simply missing from the prefix chain that
  already covered `nice`, `time` and `sudo`. So did `caffeinate git commit`,
  `builtin exec git commit`, `builtin eval 'git commit …'`, `exec sh -c '…'` and
  `script -q /dev/null git commit` (its log-file argument is a value token before
  git). Each was verified to create a real commit under a pty. **Stricter:** these
  forms now deny; `caffeinate git status`, `script … git log`, `exec ls` and
  quoted phrases like `echo "exec git commit"` stay allowed. `doas`, `chronic`,
  `unbuffer`, `watch` and `parallel` were probed too but were absent on the test
  box, so none could be confirmed to commit and none was added.
- **Commit gate (plugin) — tracking `.checkpoints/` no longer deadlocks the tree
  binding.** oc-git-ops and oc-checkpoint-protocol both tell you to track
  `.checkpoints/`, but a run must hash the tree before writing the checkpoint that
  carries the hash, and that write then moved the tree. In any repo that followed
  the docs, every honest PASS was denied as "the repo has changed", and re-running
  the gate moved the tree again. The opchain repo never saw it because it gitignores
  that one file, and so did the hook's fixtures. The gate and the documented tree
  recipe now both drop `.checkpoints/oc-bug-check.checkpoint.json` from the hash, so
  writing, rewriting or staging it no longer invalidates the PASS. Every other file,
  other skills' checkpoints included, still does. Record the tree with the updated
  recipe in oc-bug-check § Commit gate contract; a tree recorded with the old recipe
  in a repo that ignores the file is unchanged.
- **oc-bug-check** — the Checkpoint Schema documents `last_run_verdict` and
  `verified_tree`, and a new Commit gate contract section gives the exact tree
  recipe: `git add -A` into a throwaway index. The `/oc-bugcheck` command had said
  bare `git write-tree`, which misses unstaged and untracked files and so never
  matched a dirty tree. The hook suite now builds its accepted checkpoint from that
  section, so the docs and the gate cannot drift apart silently again.
- **oc-git-ops** — the Pre-Commit Gate note describes the tree-bound hook instead
  of a freshness window.
- **oc-git-ops** — `/oc-git-sync` runs the bug-check gate before it structures
  commits. It listed the commits at step 5 and the gate at step 6, an order the
  commit-gate hook refuses, since no PASS exists yet when the first commit runs.
- **oc-git-ops, oc-bug-check** — the FAIL guidance no longer presents
  `/oc-bugcheck bypass` as the override. It records the bypass; the commit still
  needs `OPCHAIN_BYPASS=1` or `--no-verify` to clear the hook. Corrected in the
  Pre-Commit Gate table and in the FAIL report template.
- **Checkpoint CLI — `status <skill>` reads its argument.** It printed the whole
  table and exited 0 whatever skill was named, so oc-deploy-ops' audit gate, which
  runs `status oc-security-auditor`, could not tell that no security assessment
  existed. It now prints that one checkpoint and exits 1 when there is none.
- **Checkpoint CLI — `update` operators combine in either order.** oc-git-ops'
  documented restamp, `--skill_state.merged_prs+:json={…}`, wrote a literal key
  named `merged_prs+` instead of appending. `+:json` and `:json+` now both append,
  a key still carrying an operator is refused, and oc-git-ops' recipe uses
  `:json+=`. An append adds one element, as documented.
- **Checkpoint CLI — the validator accepts ISO-8601 offsets** (`+00:00`) as well as
  `Z`, and **warns** when status and blockers disagree: `blocked` with no blockers,
  or `complete` with an open user decision.
- **Checkpoint CLI — `doctor` catches more drift.** It validates each file against
  its real path, so a filename that does not match its skill is now reported; it
  flags a `verified_for_sha` that is not in HEAD's history, the stale PASS a squash
  merge leaves behind; and it reports every missing `generated_files` path, not just
  the first three under ten fixed prefixes. `status --brief` skips actions whose PR
  already merged, as `next` does. A scaffolded checkpoint takes its project name
  from `package.json` instead of always writing `opchain.dev`.
- **Checkpoint merge driver** — a one-sided telemetry update (`last_run`,
  `run_history`, …) is no longer discarded when the other side has the newer
  `updated_at`. Newer-wins now applies only when both sides changed that field.
- **Session-state hook (plugin)** — a `{ text, done_when }` next action renders as
  its text instead of `[object Object]`, and "next" is the most recently touched
  in-progress work rather than the first file alphabetically, skipping work already
  awaiting your decision.
- **oc-git-ops, oc-repo-ops** — a pre-PR PASS counts only when `verified_for_sha`
  equals the branch HEAD; oc-repo-ops defines "stale" the same way.
- **oc-deploy-ops** — the audit gate is labelled agent-executed, reuses an audit only
  if it covered the deploying SHA's runtime code, blocks when no security assessment
  is on record unless a waiver is recorded, and hands off to `/oc-security posture`
  instead of an undeclared verb.
- **Every handoff names a verb its target declares, and every menu verb is
  declared.** Fifteen handoffs named subcommands the target documented but did not
  declare in `commands:` (`/oc-audit pre-deploy`, `/oc-security posture`,
  `/oc-deploy prod`, `/oc-release verify`, `/oc-scale loadtest`, …); the sixteenth,
  `/oc-security pre-deploy`, was repointed earlier in this release. Frontmatter now
  declares every verb in each skill's own command menu, 94 new verbs in all, including
  `/oc-deploy rollback`, `/oc-deploy env`, `/oc-audit fix-all` and the
  `/oc-rev-spec`, `/oc-df-status` and `/oc-git-status` family. Each was already
  documented in its skill's command menu; `/oc-deploy env`, `/oc-df-status`,
  `/oc-df-resume` and `/oc-rev-spec` also gain behaviour text. `/oc-rollback` and `/oc-git-commit`, which no skill declared, now read
  `/oc-deploy rollback` and `/oc-commit`; oc-deploy-ops hands off to
  `/oc-monitor health` instead of an undefined `/oc-monitor verify`. oc-git-ops,
  oc-stack-forge and oc-ux-engineer title their menus with their declared `/oc-git`,
  `/oc-stack` and `/oc-uxe`. The production deploy verb is `/oc-deploy prod`
  everywhere; bare `/oc-deploy` is the menu.
- **orchestrator.md — the map covers the catalog.** Upstream/Downstream rows for
  oc-checkpoint-protocol, oc-claude-api, oc-agent-forge, oc-rag-forge, oc-prompt-ops,
  oc-signal-forge, oc-modularize-ops and oc-fleet-ops; Handoff Points rows for the
  AI-app branch, the model-migration eval, validated signals and the
  modularize → migration → fleet chain. §7 is generated from frontmatter: 11 of 32
  blocks had drifted. `npm run check-skill-contracts` (in `pretest` and `prebuild`)
  fails when a cited verb is undeclared or §7 drifts. oc-code-auditor's description takes §7's routing wording
  back ("escalate to oc-bug-check / oc-security-auditor") and drops "security
  audit", which collided with oc-security-auditor.
- **oc-checkpoint-protocol matches the tooling.** Staleness is per status (7 days
  `in_progress`, 14 `complete`, 3 `blocked`), not 7 days regardless; restart archives to
  `.checkpoints/history/`, as `checkpoint reset` does, instead of a `.bak` file; `status`
  is documented as not rendering `pm_refs`, which it never did; `doctor --online`
  compares against the approved release baseline, not local HEAD; `/checkpoint` is
  described as the prose convention it is; the undefined `resumed_from` field, the
  nonexistent enterprise scenarios and the pre-1.0 "Today" section are gone; and the
  Cross-Skill Reads table matches the orchestrator map. The "never read `skill_state`"
  rule now matches the chain as built: a key its owner documents for siblings (the
  commit gate's oc-bug-check fields, for one) is a published contract; the rest stays
  private. The PM-MCP deferred-write fields are listed as optional. `references/INTEGRATION.md`
  falls back to editing the JSON when the CLI is absent and mirrors oc-app-architect's
  real gates and progress table.
- **Commit gate (plugin) — 60-second timeout.** The gate hashes the full working tree on
  every commit, and a hook killed at the old 10-second limit writes no deny, so a slow
  repository could commit unchecked. The longer limit narrows that window; a gate run
  slower than 60 seconds still allows. Nine gate behaviours with no test gained cases
  (array or invalid checkpoint, `.opchain/` enrolment, `OPCHAIN_GATE=1`,
  `OPCHAIN_BYPASS=1`, the `verdict` and `verified_for_tree` aliases, `xargs`, `sudo`).
- **Plan & design skills say what they do (Sprint 5a).** oc-app-architect runs the
  Design Evaluator itself on UI sprints (`/oc-uxe attach`) instead of waiting for an
  "auto-attach" nothing performed, and ITERATE/FAIL map the same way on both sides.
  oc-reverse-spec and oc-dash-forge write inside the project instead of claude.ai
  sandbox paths; reverse-spec hands off by copying its specs to `spec/` (asking before
  overwriting) and running `/oc-roadmap`. Spec numbering agrees everywhere (09
  documentation plan, 10 cost estimate, 11 AI architecture). oc-dash-forge's
  checkpoint follows the protocol and names its real upstream skills; oc-stack-forge
  no longer claims app-architect uses its build ordering. oc-ux-engineer's phases are
  `[plan, build]`, matching its build loop. 70 findings fixed, 7 already fixed.
- **Gate and assurance skills say what they do (Sprint 5d-1).** oc-bug-check's
  private-key grep actually matches PEM and PGP headers (it was BRE and never
  did); its verdicts are PASS, FAIL or UNSUPPORTED as the commit gate reads them,
  and a bypass is `OPCHAIN_BYPASS=1` or `--no-verify`, never the record alone.
  oc-orchestrator's ranking matches `checkpoint.mjs next`, its CLI steps apply only
  where the CLI exists, and its memory/session-file and per-app filename text is
  gone. Cross-skill reads in oc-code-auditor, oc-security-auditor,
  oc-security-hardening and oc-compliance-ops use fields their owners publish;
  oc-compliance-ops says no capture allowlist exists rather than implying one.
  60 findings fixed, 15 already fixed.
- **AI-native and instrumentation skills say what they do (Sprint 5c).**
  oc-agent-forge, oc-rag-forge, oc-prompt-ops and oc-cost-ops no longer claim
  oc-deploy-ops gates production on their suites; `/oc-prompt regress` and
  `/oc-cost gate` are agent-driven PR-time checks, not required CI jobs, and the
  nonexistent `npm run oc-prompt` recipe is gone. Siblings read model routing from
  oc-claude-api's `context_primer.key_decisions` and `11-ai-architecture.md` (not
  its private state or an unproduced `05-llm-design.md`). The `cost` block lives in
  the oc-cost-ops checkpoint, with `cost_per_eval` documented in oc-prompt-ops'
  baseline. oc-telemetry-ops documents the four verbs `scripts/telemetry.mjs` has;
  oc-signal-forge's Evaluator loop is capped at three rounds like its siblings.
  44 findings fixed, 6 already fixed, 2 deferred to the release tooling.
- **Build & integrate skills say what they do (Sprint 5b).** oc-modularize-ops,
  oc-migration-ops and oc-fleet-ops share one named artifact,
  `modularization/module-map.json`, with its shape written on every side; migration
  plans the code move for every module and holds only live cutover (and fleet only
  deploy) until `equivalence_verified`. oc-api-dev's drift check and oc-scale-ops'
  budgets are described as recommendations oc-deploy-ops does not enforce, and
  duties oc-monitoring-ops never took on are gone. Sandbox paths, undefined keys and
  a false "fixtures are gitignored" claim are corrected; abandon archives to
  `.checkpoints/history/`. 55 findings fixed, 8 already fixed, 7 won't-fix.
- **Ship-side skills and the orchestrator map say what they do (Sprint 5d-2).**
  oc-release-ops describes the real release order: a minor release flips the probed
  site surfaces in the release PR with the CHANGELOG heading, before the tag (CI's
  surface check requires it); a patch keeps product PR → tag → site PR; deploy always
  follows the tag. Its verify gate splits pre-tag from post-tag checks, its drafts
  match the hero-card changelog and five-hero rule, and `version-locations.md` is
  rebuilt from the surface checker. oc-deploy-ops runs the project's deploy script
  when there is one, detects `wrangler.jsonc`, and hands post-deploy checks to
  `/oc-monitor health`. A failed `/oc-docs verify` now clears `verified_for_sha`
  and blocks the PR at oc-repo-ops. oc-git-ops commits the docs edits before the
  readiness check and records UNSUPPORTED. orchestrator.md carries a routing row
  for every skill, the "release PR merged → `/oc-git-release`" handoff, and the map
  rows the other sweeps made stale. 67 findings fixed, 20 already fixed.
- **Every cross-skill edge is documented on both sides (Sprint 5 exit).** The
  reciprocity pass the 2026-09-11 audit never completed found 66 edges one skill
  documented and the other did not; 62 now carry the reverse row (oc-reverse-spec
  and oc-app-architect gain Read-by tables) and 4 false claims are gone, including
  the orchestrator map's app-architect → migration-ops edge, which runs the other
  way. Tri-agent skills describe the Verifier/Evaluator's separation as a
  same-session discipline, not a separate agent; `remediation_owners` is described
  as the optional `.opchain/pm.yaml` key it is; oc-monitoring-ops' description
  carves out oc-telemetry-ops.
- **The catalog is reachable (Sprint 6).** The MCP `route` tool resolves a natural
  request to every one of the 32 invocable skills (17 before), mirroring
  orchestrator.md §4, with collisions resolved deliberately ("tag the release" →
  oc-git-ops `/oc-git-release`, "build an agent" → oc-agent-forge, "kubernetes" →
  oc-fleet-ops) and pinned in tests. `/pipeline-builder` builds from the live
  catalog instead of a v1.5 table: it always includes the commit and pre-PR gates,
  and its generated CLAUDE.md describes them as they run. The plugin README lists the
  twelve registered slash commands and why only those ship. **Plugin
  `next-suggestion`**: a handoff to a skill with no plugin command is suggested by
  name instead of re-targeting the skill that just finished. The routing eval covers
  every skill, grades all collision cases with `llm_judge`, and fails on any miss.
- **orchestrator.md §7 backfill and the F6 release-surface procedure.** Two post-1.9.0
  changes to shipped text (#482, #484) that this section never recorded.
- **Every skill points at its bundled checkpoint protocol.** 29 Checkpoint sections
  never named `references/checkpoint-protocol.md`; they do now.

## [1.9.0] — 2026-09-02 — "Assurance and governed delivery ops"

Four new skills, catalog 29 → 33 (internal plan:
docs/plans/2026-08-28-v1.9-assurance-release-plan.md; roadmap
issues [#8](https://github.com/asfbay-bit/opchain-skills/issues/8)
[#9](https://github.com/asfbay-bit/opchain-skills/issues/9)
[#10](https://github.com/asfbay-bit/opchain-skills/issues/10)
[#11](https://github.com/asfbay-bit/opchain-skills/issues/11)):

- **oc-qa-ops** (`/oc-qa`) — test-pyramid design: coverage strategy,
  contract-test matrix, load-test planning. The strategy layer split out of
  oc-bug-check; writes `.opchain/qa.yaml`, which oc-bug-check's test check
  reads when present. Budget misses report as WARN by default; setting
  `coverage.enforce: fail` in the manifest (a human opt-in) flips a
  global-budget miss to FAIL at the commit gate, with the normal bypass
  protocol. No manifest, or an unparseable one, leaves oc-bug-check exactly
  as before v1.9.
- **oc-data-ops** (`/oc-data-ops`, tri-agent Designer/Builder/Contract-Verifier)
  — data pipelines: ingestion patterns, transformation layering, dbt, and
  observable data contracts (`.opchain/data-contracts/*.yaml`) with
  freshness/volume/schema verification.
- **oc-compliance-ops** (`/oc-comply`) — standing control register + audit-ready
  evidence bundles generated at deploy/release time. Activated per-project by
  `.opchain/compliance.yaml`; inert without it. Readiness and evidence, not
  certification.
- **oc-security-hardening** (`/oc-harden`) — the execution half of the security
  pair: oc-security-auditor assesses (`/oc-hardening`), this skill executes
  (`/oc-harden`) and maintains `.opchain/hardening.yaml`, adding a
  manifest-verify row to the oc-deploy-ops audit gate when present.

**Changed (deliberate, the one non-additive edit):** oc-security-auditor's
trigger phrases were re-pointed at the new security pair split — "harden this"
now routes to oc-security-hardening (`/oc-harden baseline`), several assessment
phrases were recast in audit form ("audit the CSP policy", "review WAF rules",
"check TLS config", "is it hardened"), and "how would someone attack this" was
dropped. All slash-command triggers, `/oc-hardening` included, are unchanged.

Reciprocal edges (additive): oc-app-architect Phase 2 authors
`06-testing.md` via oc-qa-ops and gains a data-heavy discovery branch to
oc-data-ops (its Phase 6 Evaluator grades against qa.yaml budgets);
oc-deploy-ops' audit gate gains two conditional manifest rows;
oc-security-auditor hands findings to oc-security-hardening; oc-scale-ops
executes oc-qa-ops load plans; oc-signal-forge chains estate-level pipelines
to oc-data-ops — plus paired rows in eight more skills (oc-api-dev,
oc-code-auditor, oc-dash-forge, oc-integrations-engineer, oc-migration-ops,
oc-monitoring-ops, oc-release-ops, oc-stack-forge), fourteen in total. The
opchain plugin registers four new slash commands (8 → 12) and suggests the new
skills from its Stop hook.

**Release-assurance hardening (rides this release; repo tooling + CI, not
catalog-skill changes):**

- The release now dogfoods its new assurance rail: a repository-specific test
  pyramid and contract matrix live in `.opchain/qa.yaml`; the first
  `oc-security-hardening` remediation closes the hosted MCP checkpoint HIGH;
  and the compliance scope is explicitly recorded as none-yet rather than
  silently skipped.
- MCP checkpoint clients now call `create_checkpoint_session` and retain its
  private token; hosted tokens are HMAC-signed so invented values cannot read
  or pre-seed state. The server validates skill ids and HTTP origins, caps
  checkpoint state at 64 KiB and request bodies at 256 KiB, rate-limits session
  creation and writes, and expires state 30 days after its latest write. The
  signing key is a required hosted secret. Email-capture KV records now carry
  their documented 365-day TTL. `.opchain/hardening.yaml` is replayed after
  input generation immediately before deploy and against the live target.
- `npm run telemetry -- status` gains a liveness guard: `enabled=true` with
  no store on disk now reports `ENABLED — NOT RECORDING ⚠`, prints
  `⚠ LIVENESS FAIL` to stderr, and **exits 1** instead of reporting a healthy
  ENABLED state over a silent sink — the exact state that sat undetected for
  24 days in 2026-06/07. Scripted callers relying on exit 0 there will now
  fail; that is the point.
- `npm run check-release-tag` now names the deploy-freeze window: when the
  tagged catalog and the working tree agree on the lockstep version but
  disagree on skill *identity* (added, removed, or swapped skills — not just
  count), the check reports the tree as the *next* release still wearing the
  old number and prescribes `/oc-release bump` + `/oc-git-release` — never a
  re-tag; staging stays open. The deploy wrapper stops offering the untagged
  escape hatch in that state.
- 13 routing eval cases (`route-016`–`route-028`) added to the
  `/oc-prompt eval` goldset (`prompts/opchain-eval/`), covering the four new
  skills and the near-miss routes (`/oc-harden` vs `/oc-hardening`, api-dev
  vs data-ops schema drift, SOC 2 assess vs evidence, qa-ops load-planning
  vs scale-ops execution).
- The full GitHub Actions surface becomes a locally runnable release sequence:
  `scripts/release-sequence.mjs` (repo-internal, not part of the catalog) maps
  every workflow to a named step across three stages (pre-merge / pre-tag /
  post-deploy) with fail/warn classes, and `tests/release-sequence.test.js`
  fails CI if a workflow is ever added without a ledger entry. Manual deploys
  no longer depend on Actions firing to be fully verified.
- The pre-tag sequence's machine-readable tag probe now actually emits JSON;
  its intended `missing-tag` success condition is covered by regression tests
  instead of failing on human-formatted output.
- The MCP Registry publisher now uses the real non-mutating `validate` command
  and preserves the established `io.github.asfbay-bit/opchain-skills` identity
  after the source-repository ownership transfer. Authentication uses the
  existing fine-grained `asfbay-bit` mirror token; the now-invalid source-repo
  OIDC permission is removed.
- Three CI pins so load-bearing catalog text cannot be silently edited away:
  the boundary cross-references in `description:` frontmatter
  (`tests/routing-disambiguation.test.js`), the not-certification /
  not-legal-advice / redaction / no-offensive-testing lines
  (`tests/liability-disclaimers.test.js`), and the telemetry liveness guard
  (`tests/telemetry-status.test.js`).
- Manifest-driven execution now states its trust boundaries: hardening checks
  forbid shell execution and cross-origin/path escape, data invariants compile
  expression-only predicates under read-only query guards, and compliance
  captures default unknown commands/origins to explicit approval or a refused
  stub.

### Compatibility

**Skill and on-disk checkpoint compatibility:** back-compatible with v1.8.3.
All 33 skills lockstep-bump to `1.9.0`; no checkpoint-file migration, commands,
or routes are removed. **All MCP checkpoint callers must now call
`create_checkpoint_session` before `read_checkpoint` or `write_checkpoint`;**
client-invented tokens and the former shared `default` session are rejected as
a security fix. The 16 pre-v1.9 hosted checkpoint records are intentionally
deleted during rollout because they cannot be bound to signed sessions; local
on-disk skill checkpoints are unaffected. The other behavioural changes are the
oc-security-auditor trigger re-point and telemetry `status` exit code above.

## [1.8.3] — 2026-08-27 — "Open seams, closed ledger"

The first Apache-2.0 release, and the one that stops the release process from
lying about itself.

### Licensing

- The opchain skill catalog, plugin, and MCP tooling are licensed under
  **Apache-2.0** (decision recorded 2026-08-22; applied 2026-08-24).
  Releases up to and including **1.8.2** were published under MIT; every
  release from **1.8.3** onward is Apache-2.0. Copyright 2026 Aidan Elsesser
  and the opchain contributors — see `LICENSE` and `NOTICE` at the repo root.
- `LICENSE` and `NOTICE` now ship inside every distributed artifact — the
  skills zip, the plugin, and every machine-readable discovery surface — so a
  consumer who never visits the repo still receives the terms.

### The release ledger closes

An audit on 2026-08-26 compared `/changelog` to `git tag` and found **thirteen
shipped releases and three tags**. v1.0 through v1.7 all shipped untagged.
`publish-mcp-registry.yml` fires on `v*` tags, so ten releases never
republished the registry pointer; `/oc-release plan`, which reads
`git log <last-release-tag>..HEAD`, had been falling back to scraping the
changelog page.

The cause was structural, not careless. `oc-release-ops` handed off "the merge
/ tag" to `oc-git-ops` — **a skill with no tag verb.** The handoff named a step
that did not exist, and nothing checked whether it happened.

- **`/oc-git-release <semver>`** — oc-git-ops finally owns the tag. It refuses
  to tag an unmerged HEAD, a semver that disagrees with the lockstep catalog, or
  a tag that already exists (a published tag is never moved; cut the next patch).
- **`scripts/check-release-tag.mjs`** — asserts the lockstep catalog version has
  a signed tag that is an ancestor of HEAD, present as the same raw tag object on
  origin, and carries the reviewed `release-seal.json` baseline. The seal binds
  the catalog to the exact publisher-workflow digest and `server.json` registry
  payload; `--local` verifies both before a tag push can trigger OIDC publishing.
  Fails closed: a split catalog, stale seal, invalid signature, unreadable
  catalog, remote mismatch, or no git is a refusal, never a pass.
- **`npm run deploy` enforces it.** A production deploy is refused when the
  catalog version moved somewhere no tag follows. Scope is narrow on purpose —
  the guard reads the lockstep catalog version, so blog and hotfix deploys never
  trip it. A guard that fired on every deploy would be switched off within a
  month.
- **`/oc-release verify`** gained a matching gate row calling the same script, so
  the check you run and the check that blocks you cannot drift apart.
- **`.github/workflows/release-ledger.yml`** — daily backstop; one tracking issue
  when a shipped release has no tag.
- **A monotonicity guard on `publish-mcp-registry.yml`** — only the newest
  release tag may publish. This makes backfilling the ten historical tags safe;
  without it, pushing `v1.3.0` today would walk the public registry pointer
  backwards from 1.8.x.

Staging is deliberately exempt: you deploy staging to review a release *before*
committing to it, and tagging an unreviewed build is backwards.

### Repository seams (OSS split groundwork)

Five seam changes let the skills tree build and ship independently of the
private site tooling — prep for inverting the public mirror:

- Input-path overrides for every skills-tree reader (S1), so readers no longer
  assume a monorepo layout.
- Flag-registry drift checks split out of the product validator (S2).
- Internal identifiers scrubbed from shipped product text (S3).
- The site builds against a vendored skills tree (S4).
- `plugins/opchain/skills` materialised, retiring the last cross-boundary test
  read (S5).

### Changed

- `/changelog` roadmap data is sourced from **GitHub Issues instead of Linear**,
  with contact details kept out of public issues. v1.9 direction is set and v2
  theme voting is open.
- Vulnerability reports become GitHub security incidents rather than ordinary
  issues.
- `gray-matter` replaced with a minimal in-repo frontmatter parser, dropping a
  dependency from the build path.

### Fixed

- **Accessibility** — scrollable code blocks on `/install`, `/pipeline-builder`
  and `/security` are keyboard-focusable, so keyboard users can scroll them.
- **Site truth sweep** — fabricated claims, incorrect counts, and scattered repo
  links corrected and centralised.

### Security & dependencies

- Open Dependabot alerts cut from **60 to 6**. Astro migrated to **7.x**,
  unblocking the esbuild and sharp advisories; vite, postcss, undici, wrangler,
  js-yaml, nanoid, dompurify, brace-expansion, svgo and others bumped. The
  residue is blocked on upstream `@lhci/cli` transitive deps.

### Compatibility

**Back-compatible with v1.8.2.** All 29 skills lockstep-bump to `1.8.3`. No
checkpoint migration; no commands or routes removed. `/oc-git-release` is
additive. The one behavioural change is that `npm run deploy` now refuses an
untagged release — deliberate, with `OPCHAIN_ALLOW_UNTAGGED_RELEASE=1` as the
loud escape hatch.

**License change:** this release is Apache-2.0, not MIT. Prior releases remain
under the terms they shipped with.

## [1.8.2] — 2026-07-24 — "Enforcement that ships"

The catalog stops describing gates it cannot enforce and starts shipping one that
works. opchain now installs as a Claude Code **plugin** carrying executable hooks —
previously the bundle was markdown only, so every "auto-invokes" claim in it was
unenforceable everywhere except the opchain.dev repo itself.

### Added
- **Claude Code plugin** (`/plugin marketplace add asfbay-bit/opchain-skills` →
  `/plugin install opchain`). Ships three hooks and eight registered slash commands
  alongside the 29 skills. The skills-only zip is unchanged and still supported.
  - **Commit gate** (`PreToolUse`) — blocks `git commit` unless oc-bug-check
    recorded a PASS bound to the full working-tree state. Fails closed.
  - **Session state** (`SessionStart`) — surfaces stale checkpoints, open findings,
    and the next action, computed from `.checkpoints/` rather than asked for.
  - **Next-skill suggestion** (`Stop`) — when a skill finishes, names the one to
    invoke next. Fires on checkpoint *transitions*, not standing state; silent when
    nothing changed. Mute with `OPCHAIN_SUGGEST=0`.

### Fixed
- **oc-bug-check** — added Swift stack support and a terminal `UNSUPPORTED` verdict
  distinct from PASS; an unrecognized stack previously reported green on code it
  never read. Secret-detection greps were scoped to TypeScript/JS includes and so
  matched nothing in Swift, Kotlin, Ruby or Java — now unscoped, plus JWT (`eyJ…`)
  and `sk_test_` patterns.
- **oc-git-ops** — removed a paragraph claiming a `PreToolUse` hook enforced the
  pre-commit gate. That hook existed in exactly one repository; the claim shipped to
  everyone. The plugin now makes it true where installed, and the text says so.
- **Checkpoint staleness detection** — `doctor`/`status` only flagged
  `in_progress` checkpoints, so a `complete` one asserting a long-shipped release
  drew no warning for 30 days. Now status-aware across `in_progress`, `complete`,
  and `blocked`.
- **Checkpoint next-action drift** — the highest-priority ranks (`user_decision`
  blockers, `failed`/`blocked` status) bypassed the stale-work filter entirely,
  which is how `next` recommended tagging a release that had shipped twelve days
  earlier. Both now route through the filter.

### Changed
- **Honesty pass, all 29 skills + the shared `orchestrator.md`.** Every
  `Auto-invokes X` and `Trigger liberally` claim removed from frontmatter and the
  bundled protocol doc. Measured across 87 transcripts: zero of 54 skill
  invocations were autonomous, so those phrases described a mechanism that has
  never once fired. Replaced with "chains to (when you invoke it)" and an explicit
  note that cross-skill edges need enforcement outside the catalog.
- Lockstep patch bump: all 29 skills → `1.8.2`.

### Compatibility
- Back-compatible with v1.8.1. No checkpoint migration, no route/command removals.
  The plugin is an additive install channel; existing zip installs keep working
  exactly as before, minus the enforcement they never actually had.

## [1.8.1] — 2026-07-12 — "Checkpoint truth without the CLI"

Consumer repos no longer lose trustworthy project status merely because they do not
carry opchain.dev's optional checkpoint CLI.

### Fixed
- **oc-orchestrator** — treats direct `.checkpoints/*.checkpoint.json` reads as the
  authoritative fallback and no longer recommends a repo-local scaffolder where it
  cannot exist.
- **oc-checkpoint-protocol** — explicitly requires agents to corroborate directly
  read checkpoint state against specs, git, tests, and release artifacts; missing CLI
  output is neither a blocker nor product progress.
- Lockstep patch bump: all 29 skills → `1.8.1`.

### Compatibility
- Back-compatible with v1.8.0. Existing checkpoint files require no migration.

## [1.8.0] — 2026-07-04 — "The quality-gate rail"

Every PR now rides a documentation + hygiene rail before it opens. The catalog
goes from 27 → **29 skills**.

### Added
- **oc-docs-forge** (`/oc-docs`) — documentation generator for every PR: the PR
  body's required `## Documentation` section (long packets overflow to a PR
  comment with marker `opchain:oc-docs-forge:pr-docs`), README/catalog/product-doc
  upkeep, changelog + ADR notes, and freshness/drift review (`/oc-docs upkeep`).
  Auto-invoked by oc-git-ops before PR creation and by release flows before
  release PRs. "No docs needed" is valid only with evidence — silence is not a pass.
- **oc-repo-ops** (`/oc-repo`) — repository hygiene and PR readiness gate:
  verifies the docs packet exists and is current, generated files + catalogs are
  in sync with source, git state is clean, and `.gitignore` policy holds. Fails
  closed and blocks the PR. Required every-PR order: oc-docs-forge → oc-repo-ops
  → oc-bug-check (already run at commit) → PR.

### Changed
- **oc-git-ops** — gains the pre-PR gate: auto-invokes oc-docs-forge then
  oc-repo-ops before every PR (mirroring the oc-bug-check pre-commit gate); the
  PR template gains a `## Documentation` section sourced from the docs-forge
  checkpoint; `.checkpoints/` is no longer gitignored by default (the checkpoint
  protocol tracks it unless the project opts out — oc-repo-ops enforces this).
- **oc-release-ops** — `/oc-release ship` invokes oc-docs-forge for the release
  docs packet before handing to oc-git-ops; `/oc-release verify` gains
  docs-packet and repo-readiness gate rows.
- **orchestrator.md** — pipeline map, upstream/downstream map, handoff points,
  routing tables, and ecosystem bullets gain the pre-PR gate rail (re-synced
  into every skill's bundled copy).
- Lockstep bump: all 29 skills → `1.8.0`.

### Not breaking
- Both new skills are additive gates. The `.checkpoints/` gitignore default in
  oc-git-ops flips to match the checkpoint protocol's documented tracking policy —
  a doc-consistency fix, not a contract change (the protocol was already the
  source of truth).

## [1.7.0] — 2026-06-26 — "Seams & Signals"

Seams between systems and the signals that prove they work. The catalog goes
from 24 → **27 skills**.

### Added
- **oc-signal-forge** (`/oc-signal`) — turns a *question* into a trustworthy
  metric: designs the instrumentation, builds the harvester + transform, and
  adversarially proves the signal answers the question before wiring it to a
  surface. The product-analytics backend none of the instrumentation skills
  owned (oc-telemetry-ops meters the pipeline; oc-dash-forge renders;
  oc-monitoring-ops watches prod). Designer/Builder/Evaluator loop.
- **oc-modularize-ops** (`/oc-modularize`) — decomposes a live monolith with
  **provably zero functionality or data loss**, using golden fixtures captured
  from real traffic as the equivalence oracle; refuses when modularization
  isn't warranted, then hands the bulk code-move + live cutover to
  oc-migration-ops's Structural type.
- **oc-fleet-ops** (`/oc-fleet`) — provisions, deploys, and operates
  one-or-more containers across self-managed environments (k8s/Nomad/Compose,
  IaC, on-prem VMs, GCE) — the bare-metal/self-managed territory oc-deploy-ops
  routes away. Mandatory dry-run/plan gate before any IaC apply.

### Changed
- **oc-deploy-ops** — Platform Matrix "What's NOT first-class" re-point: the
  bare-metal / VPS / multi-node row now routes to **oc-fleet-ops** (was the
  oc-migration-ops default pointer). deploy-ops and fleet-ops are peers —
  managed app → deploy-ops; self-managed fleet → fleet-ops.
- **oc-dash-forge** + **oc-monitoring-ops** — gain oc-signal-forge as the
  upstream that feeds validated metrics (dash-forge renders them;
  monitoring-ops enforces each signal's freshness SLA).
- Lockstep bump: all 27 skills → `1.7.0`.

### Not breaking
- No documented cross-skill contract was removed. The three new skills are
  additive; the oc-deploy-ops re-point only changes where bare-metal *routes*,
  a surface that was a default pointer, not a guarantee.

## [1.6.0] — 2026-06-25 — "The instrumented pipeline"

Cost + telemetry instrumentation. The catalog goes from 22 → **24 skills**.

### Added
- **oc-cost-ops** (`/oc-cost`) — LLM cost attribution per skill phase, budget
  gates in the checkpoint, model-tier routing recommendations, and a
  cost-regression gate that runs beside oc-prompt-ops's score gate.
- **oc-telemetry-ops** (`/oc-telemetry`) — opt-in, local-first usage metering to
  `.checkpoints/usage.sqlite`, with anonymized aggregates for the public
  `/dashboard`. Default OFF; content-free by schema.
- Checkpoint protocol **wire 1.1** — additive optional fields `cost`,
  `eval_scores`, `telemetry_handle`. Both `"1.0"` and `"1.1"` validate;
  oc-migration-ops sweeps existing checkpoints. Not breaking — old checkpoints
  stay valid and the fields are optional.
- oc-bug-check + oc-code-auditor now emit `eval_scores` against a stable rubric
  (binary verdict / letter grade unchanged — the score is additive, for trend).
- oc-monitoring-ops AI-app monitoring template (token rate, cost rate, eval
  drift, hallucination/refusal flags).
- oc-orchestrator `/oc-ops next` factors cost/budget (over-budget checkpoints
  sort first within a priority rank).

### Changed
- oc-prompt-ops: the `cost_per_eval` placeholder is now wired to oc-cost-ops
  (measured, not estimated) plus `budget_per_eval` / `regression_pct` config.
- Lockstep bump: all 24 skills → `1.6.0`.

### Not breaking
- No documented cross-skill contract changed. The wire 1.1 fields are optional
  and backward compatible; every prior checkpoint validates unchanged.

## [1.5.0] — 2026-06-22 — "Build the AI app"

Four AI-native skills added: **oc-claude-api**, **oc-rag-forge**,
**oc-agent-forge**, **oc-prompt-ops**. oc-stack-forge gained vector-DB packs;
oc-app-architect gained an AI-app `/oc-discover` branch; oc-code-auditor gained
an AI-safety rule pack. Lockstep bump: all 22 skills → `1.5.0`.

## [1.4.x] — 2026-06 — pack registry + governance + multi-mobile

oc-stack-forge pack registry (languages, frameworks, mobile, hosting), the
`governance:` frontmatter rollout, and v1.4.3 Codex / any-MCP-agent support.

## [1.3.0] — 2026-05 — PM-MCP runtime + release-ops

PM-tool MCP runtime across five skills, the platform menu
(Cloudflare/Django/Rails/Go/Rust), and **oc-release-ops** — opchain's own
release cadence, dogfooded.
