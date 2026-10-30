# ow-build changelog

Per-skill versions (`catalogs.json` `versionPolicy: per-skill`). Every change to `SKILL.md` or a reference bumps this skill; data, example and test edits ride without a bump (OW-04 ruling O9) and are listed here as data edits. ow-build 1.0.0 shipped before this file existed; its history is in the family's v2.1.0 release entry.

## Unreleased: data edits from OW-06 (ow-handoff 1.0.0)

No version bump (OW-04 ruling O9); no `SKILL.md` or reference text changed:

- `skill.edges.yaml`: the ready hand-off to ow-uat carries `plans/<client>/map/systems.md` and `evidence.md` in place; the hand-off to ow-build-plan for a FIX-nn too big for a change order lists `handoffs/<client>/fixes/FIX-nn.md` in place; the reads row for `FIX-nn.md` gains the field `route` (its routing already branches on `route: care`; OW-06 ruling O2).
- `examples/handoffs.yaml`: as ow-uat's.

## Unreleased: data edits from OW-10 (ow-draft 1.0.0)

No version bump (OW-04 ruling O9); no `SKILL.md` or reference text changed: `examples/handoffs.yaml` gains the `drafts` key (where a finished draft goes: a repository folder by `repo` and `path`, and a say: line, an optional `location:` and a post's `limit` per other destination) and its commented shape with invented, neutral keys, byte-identical in every ow- skill that ships it.
