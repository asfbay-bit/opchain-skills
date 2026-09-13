---
name: oc-qa-ops
displayName: OC · QA Ops
version: 1.9.0
license: Apache-2.0
shortDesc: "Test-pyramid design: coverage strategy, contract-test planning, load-test planning. Strategy, not execution."
phases: [plan, build]
triAgent: false
tryable: true
commands:
  - /oc-qa
  - /oc-qa pyramid
  - /oc-qa coverage
  - /oc-qa contracts
  - /oc-qa loadplan
  - /oc-qa audit
  - /oc-qa status
description: >
  Test-strategy designer: owns the test pyramid, coverage budgets, contract-test
  matrix, and load-test planning — the strategy layer split out of oc-bug-check.
  oc-bug-check runs the tests in under two minutes at the commit gate; oc-qa-ops
  decides which tests should exist and where. Writes `.opchain/qa.yaml`, which
  oc-bug-check's test check reads when present. Use for /oc-qa, /oc-qa pyramid,
  /oc-qa coverage, /oc-qa contracts, /oc-qa loadplan, /oc-qa audit, "test
  strategy", "test pyramid", "coverage budget", "what should we test", "contract
  testing", "plan a load test", "too many e2e tests", "our tests are slow",
  "test debt", "flaky tests", "unit vs integration". Invoked by oc-app-architect
  Phase 2 to author 06-testing.md. NOT test execution (oc-bug-check), NOT
  load-test execution or perf budgets (oc-scale-ops), NOT first-party API
  conformance authoring (oc-api-dev), NOT writing the tests themselves (the
  build loop's Generator, or /oc-audit test-bootstrap for untested codebases).
governance:
  breaking_change_policy: skills/CHANGELOG.md
  last_reviewed: 2026-08-28
  owner: opchain
  docs:
    - { path: SKILL.md, kind: contract, lifecycle: stable }
    - { path: references/qa-manifest.md, kind: reference, lifecycle: stable }
---

# QA Ops

**On first invocation, read `references/orchestrator.md` and follow its welcome protocol.**

QA Ops owns the **strategy layer of testing**: what tests should exist, at which
level of the pyramid, with what coverage, verifying which contracts, under what
load. It does not run tests — oc-bug-check does that at the commit gate, CI does
it on every PR, and oc-scale-ops executes load tests. QA Ops decides what those
runners should be running.

The one-sentence split: **oc-bug-check answers "do the tests pass?"; oc-qa-ops
answers "are these the right tests?"**

## Command Reference

```text
QA OPS COMMANDS

  /oc-qa                 Show this menu
  /oc-qa pyramid         Design (or redesign) the test pyramid for this repo
  /oc-qa coverage        Set or revise coverage budgets
  /oc-qa contracts       Build the contract-test matrix
  /oc-qa loadplan        Plan load tests: scenarios, SLOs, targets
  /oc-qa audit           Gap-audit the existing suite against the pyramid
  /oc-qa status          Show current strategy + last audit verdict

  /checkpoint            Show oc-qa-ops checkpoint
```

## `/oc-qa pyramid`

Design the test pyramid for the repo at hand. Not a lecture on testing theory —
a concrete, repo-specific allocation:

1. **Inventory what exists.** Test framework(s), suite shape, counts per level,
   runtime per level, CI wiring. Read the oc-app-architect and oc-api-dev
   checkpoints for what the system is supposed to do.
2. **Declare the levels** for THIS repo (typical: unit / integration / contract
   / e2e — but a CLI tool, a Worker, and a data pipeline get different
   pyramids). For each level: what belongs there, what must NOT be tested
   there, target runtime, and which gate runs it (commit gate / CI / nightly).
3. **Allocate.** Where should new tests for a given change land by default?
   The pyramid answers this mechanically ("handler logic → unit; route wiring
   → integration; cross-service shape → contract; user flow → e2e, sparingly").
4. **Anti-pattern rules.** Name the repo's specific test smells (snapshot tests
   of volatile output, e2e tests that restate unit assertions, mocks of code
   you own) so the build loop's Evaluator can cite them.

Output: the pyramid section of `.opchain/qa.yaml` (format:
`references/qa-manifest.md`) + a human summary. When invoked from
oc-app-architect Phase 2, the human summary IS `06-testing.md`; the yaml lands
in `.opchain/qa.yaml` either way.

## `/oc-qa coverage`

Set coverage budgets that gates can actually enforce:

- **Global floor** (line/branch %) — set at measured current coverage, never
  above it (Principle 2); ratchet up in later PRs.
- **Per-directory overrides** — core logic budgeted high; glue/config exempt.
- **New-code expectation** — the number the build loop's Evaluator holds
  sprints to (oc-app-architect Phase 6 reads this instead of inventing one).

Budgets land in `.opchain/qa.yaml`. **oc-bug-check's test check reads them when
the file exists**; a budget miss is reported as WARN and never flips
oc-bug-check's PASS/FAIL — unless a human opts in by setting
`coverage.enforce: fail` in the manifest (see `references/qa-manifest.md`).

If the runner emits no coverage, the budget is unenforceable — say so, and emit
the concrete wiring change (coverage-provider dependency + runner flag + CI
step) as part of this command's output. Wiring the measurement is in scope
here even though running it is not.

## `/oc-qa contracts`

Build the contract-test matrix: every boundary where two independently-changing
parties must agree on a shape.

| Boundary type | Contract source | Who authors the tests |
|---|---|---|
| First-party API ↔ its clients | OpenAPI/GraphQL schema | **oc-api-dev** (conformance suite) — QA Ops places it in the pyramid, does not re-author |
| Third-party API you consume | Recorded fixtures / provider docs | QA Ops plans; oc-integrations-engineer builds |
| Service ↔ service (internal) | Shared schema/types | QA Ops plans; built in-repo |
| Data producer ↔ consumer | Data contract | **oc-data-ops** (Contract-Verifier) — referenced, not duplicated |

The matrix records: boundary, contract artifact, test location, owner (who
authors — the routing column above, persisted as `contracts[].owner`), gate
that runs it, and the drift signal (what fails when the other side moves).

Failure mode: an `owner: oc-api-dev` row with no oc-api-dev checkpoint present
means the conformance suite that would author those tests doesn't exist yet —
flag the row in the matrix output and instruct the user to run `/oc-api test`
(or `/oc-api build`). Never leave the row silently ownerless.

## `/oc-qa loadplan`

Plan — not run — load tests: which scenarios (steady-state, spike, soak),
against which endpoints and target environment, at what RPS/latency SLOs,
gated where. **Execution and perf budgets belong to oc-scale-ops**
(`/oc-scale loadtest`, `/oc-scale budget`): the plan lands in
`.opchain/qa.yaml`'s `load_plan:` block — oc-scale-ops executes from there
(the manifest is the handoff contract; `skill_state` is private to this skill).
Note the handoff in the checkpoint's `context_primer.key_decisions`. A load plan without an SLO, a duration,
and a `target` environment is not a plan; refuse to emit one.

## `/oc-qa audit`

Gap-audit the existing suite against the declared pyramid:

- Levels with zero tests that the pyramid says must exist.
- Declared gates that don't actually run (`pyramid.levels[].gate` naming a
  gate the repo has no wiring for).
- Inverted pyramids (e2e-heavy, unit-light) with the runtime cost quantified.
- Untested contracts from the matrix.
- Coverage vs. budget, per directory. No coverage data at all is itself a GAP
  finding, with the measurement wiring (provider + runner flag + CI step) as
  the prescribed fix.
- Flaky/quarantined tests and `.only`/skip debt.

Verdict per finding: GAP (missing — a test, or the gate meant to run it),
INVERTED (wrong level), DEBT (exists but rotten). No verdict without a
file-level citation. If no pyramid has been
declared yet, run `/oc-qa pyramid` first — an audit against no strategy is
just an opinion.

## Checkpoint Integration

The shared checkpoint schema, write rules and resume protocol live in
`references/checkpoint-protocol.md`, bundled with this skill. This section adds only
what is specific to oc-qa-ops.

Location: `{project-dir}/.checkpoints/oc-qa-ops.checkpoint.json`

```json
{
  "skill": "oc-qa-ops",
  "phase": "strategy",
  "status": "complete",
  "progress_summary": "Pyramid + budgets declared; suite audit found 3 gaps.",
  "context_primer": {
    "key_decisions": [
      "Four levels: unit / integration / contract / e2e; e2e capped at smoke flows.",
      "Coverage floor 70% lines global, 90% src/lib; new-code expectation 80%.",
      "Load plan in .opchain/qa.yaml load_plan, handed to oc-scale-ops for execution."
    ],
    "generated_files": [".opchain/qa.yaml"]
  },
  "skill_state": {
    "manifest_path": ".opchain/qa.yaml",
    "pyramid_declared": true,
    "coverage_budget": { "global_lines": 70, "new_code": 80 },
    "contract_matrix_count": 4,
    "load_plan": { "exists": true, "handed_to": "oc-scale-ops" },
    "last_audit": { "sha": "abc123", "date": "2026-08-28", "gaps": 3, "inverted": 1, "debt": 2 }
  }
}
```

## Cross-Skill Reads

| Reads from | Why |
|---|---|
| oc-app-architect | Spec + punch list → what needs test coverage; Phase 6 contracts |
| oc-api-dev | First-party API surface → contract-matrix rows |
| oc-data-ops | Data contracts → contract-matrix rows (referenced, not duplicated) |
| oc-bug-check | Current gate behavior + suite runtime |
| oc-scale-ops | Platform limits that shape load scenarios |
| oc-code-auditor | Findings + test-bootstrap output feed the gap-audit; its bootstrap honors the pyramid when `.opchain/qa.yaml` exists |

| Read by / chains to | Why |
|---|---|
| oc-bug-check | Reads `.opchain/qa.yaml` budgets at its test check (when present) |
| oc-app-architect | Phase 2 invokes `/oc-qa pyramid` for 06-testing.md; Phase 6 Evaluator holds sprints to the new-code budget |
| oc-scale-ops | Receives the load plan for execution |
| oc-api-dev | Receives contract-test rows for its conformance suite |
| oc-integrations-engineer | Builds the contract-matrix rows with `owner: oc-integrations-engineer` (consumed third-party boundaries) |
| oc-code-auditor | Reads the `.opchain/qa.yaml` pyramid + `coverage.overrides` when `/oc-audit test-bootstrap` generates a starter suite |

## Principles

1. **Strategy before enforcement.** Never tighten a gate against a budget
   nobody declared.
2. **Honest budgets.** A floor above measured reality is a lie that gets
   bypassed; ratchet up, don't decree.
3. **Every test has a level and every level has a gate.** A test nobody runs
   is documentation; a level nobody owns is a gap.
4. **Hand off execution.** The moment the question becomes "run it," it
   belongs to oc-bug-check, CI, or oc-scale-ops.
5. **Additive gate contract.** `.opchain/qa.yaml` absent → every downstream
   gate behaves exactly as before this skill existed.
