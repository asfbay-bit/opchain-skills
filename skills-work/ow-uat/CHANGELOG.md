# ow-uat changelog

Per-skill versions (`catalogs.json` `versionPolicy: per-skill`). Every change to `SKILL.md` or a reference bumps this skill; data, example and test edits ride without a bump (OW-04 ruling O9) and are listed here as data edits.

## Unreleased: data edits from OW-06 (ow-handoff 1.0.0)

No version bump (OW-04 ruling O9); no `SKILL.md` or reference text changed:

- `skill.edges.yaml`: the sign-off hand-off to ow-handoff carries the files ow-handoff reads in place (`plans/<client>/contract-inputs.md`, `quote.md`, `map/systems.md`, `evidence.md`; `builds/<client>/build.yaml`, `ledger.md`, `changes/CO-nn.md`), and the after-sign-off hand-off gives `punch-list.md` its fields (OW-06 ruling O2).
- `examples/handoffs.yaml` and `examples/offers.md`: ow-handoff's `build` and `invoice` files, and the invented `after_handoff` care terms (H4), byte-identical in every copy.

## Unreleased: data edits from OW-10 (ow-draft 1.0.0)

No version bump (OW-04 ruling O9); no `SKILL.md` or reference text changed: `examples/handoffs.yaml` gains the `drafts` key (where a finished draft goes: a repository folder by `repo` and `path`, and a say: line, an optional `location:` and a post's `limit` per other destination) and its commented shape with invented, neutral keys, byte-identical in every ow- skill that ships it.

## Unreleased: data edits from OW-05 (ow-documentation 1.0.0)

No version bump (OW-04 ruling O9); no `SKILL.md` or reference text changed:

- `skill.edges.yaml`: the hand-off to ow-documentation (`use ow-documentation-start on uat/<client>/`) lists every file ow-documentation reads where an earlier stage left it, each `in_place: true`: the signed plan's `contract-inputs.md`, `scope.md`, `quick-scope.md`, `map/roles.md` and `map/future.md`; ow-build's `build.yaml`, `ledger.md` and `changes/CO-nn.md`; and the builder's `spec/02-architecture.md`, `spec/04-integrations.md` and `spec/scope-and-milestones.md` (OW-05 ruling O2). The acceptance checker's hand-off pin follows.
- `examples/handoffs.yaml` gains the `docs` key and its commented shape (with an optional `location:` for a connector push), byte-identical in every ow- skill that ships it.

## 1.0.2 (2026-10-19): Visa's published test card is test data

- **Visa's published test card** (owner decision 2026-10-19, `references/self-checks.md`): `4111 1111 1111 1111` in a test-mode scenario is test data, like Stripe's published cards; a number one digit off, or any other card shape, is still a finding.
- Data edits in the same PR: the acceptance checker's published test card list carries it; a new golden (`plan-addendum-test-card`) writes an addendum scenario that pays in test mode with it, and a plant with a number one digit off is caught. The goldens keep the 1.0.0 they were written with.

## 1.0.1 (2026-10-19): refreeze through a change order, test data, and the evaluation round 3 minors

From the OW-04 round 3 report (`sprints/release-2.1/ow-sprint-3/eval-round-3.md`, PASS at 7.8) and the owner's decisions of 2026-10-19, taken in one follow-up PR.

- **A changed check list is not refrozen** (owner decision R3-6, `references/phase-plan.md`): `--refreeze agreed/acceptance.md` or `agreed/quick-scope.md` refuses when the check list upstream differs from the frozen one, writes nothing and names each changed check. A new check comes in through a change order, with its scenario, its test and its price, then `--add-co`; `--keep-frozen` lets the test go on meanwhile. Sign-off counts every check in `agreed/`, so it never passes a check nobody tested.
- **Test data is not a record value** (owner decision R3-4, `references/self-checks.md`): a payment provider's published test card in a test-mode scenario, and a record id marked as made for the test (in the sandbox, a test order, created by a scenario) in a scenario or the clean-up list. A real card shape or an unmarked id is still a finding. A customer, client or store column holds names.
- **The terms block with no code** (`references/uat-yaml-schema.md` §6): the UAT line's price and test mix are compared with the line `contract-terms.md` quotes, and a part removed upstream is a difference too. A byte-order mark at the start of `contract-inputs.md` is ignored.
- **The backstop on its own date** (`references/phase-signoff.md`): a clause that says it does not apply, or never falls due, on the backstop date does not move it there.
- Data edits in the same PR: the acceptance checker carries each rule above (the published test card list, the no-code price and test mix, negated backstop wording, plural and client column headers, the byte-order mark, and the round 3 plain-wording slips), with new goldens for the refused refreeze and the test data, and every round 3 plant kept as a test. The goldens keep the 1.0.0 they were written with.

## 1.0.0 (2026-10-19): the client's user acceptance test

Design: `docs/plans/2026-10-09-ow-uat-design.md`. Contract: `sprints/release-2.1/ow-sprint-3/contract.md`. Three evaluation rounds (6.6, 7.1, 7.8 PASS).
