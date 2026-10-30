# ow-draft changelog

Per-skill versions (`catalogs.json` `versionPolicy: per-skill`). Every change to `SKILL.md` or a reference bumps this skill; data, example and test edits ride without a bump and are listed here as data edits.

## Unreleased: data edits with ow-handoff 1.0.0

No version bump (data and example edits ride without one); no `SKILL.md` or reference text changed: `examples/handoffs.yaml` gains the lines ow-handoff reads for `build` and `invoice` (a covered fix or approved hourly help; hourly help and vendor charges), byte-identical in every ow- skill that ships it.

## 1.0.0 (2026-10-21): brief, evidence, draft, candidate, sign-off and delivery

Design: `docs/plans/2026-10-16-ow-draft-design.md` (decisions 1 to 8; its build notes record every departure). Contract: `sprints/release-2.1/ow-10/contract.md`.

- **Eight verbs, five modes.** `/ow-draft` (the resume screen, and `on <path>` for a handed-over findings file, recommendation, workstream or draft folder), `-voice` (a voice from 3 to 5 samples; `--approve`), `-brief` (kind, type, audience, key message, destination, `offer`; `--revise`; `--permission` for what a client lets you name or quote), `-evidence` (`E-nn` items from findings, named family files, your files and what you state), `-write` (by four type modules: document, deck, sheet, comms), `-freeze` (a candidate and its client form, digests, the ten checks; `--waive`), `-signoff` (yours, and `--client` for client comms) and `-deliver` (the export, a repository copy on a branch you made, a confirmed connector push).
- **One step table** (`references/routing-and-resume.md` §2), keyed on the verb and its mode, and one resume rule for every key.
- **Closed screens** (`references/routing-and-resume.md` §5): refusals, no-ops and questions print only their prescribed lines, slots typed.
- **The folder route's screens** (`references/routing-and-resume.md` §3, §4.3, §4.4): `/ow-draft` prints `Drafts: <n>` and one prescribed row per draft folder (`<path> · <stage> · <verb> · awaiting: <awaiting>`), or the welcome; `/ow-draft on <path>` names the folder's stage from a closed list of ten and asks before it runs anything; both record nothing, so a re-run prints the same screen.
- **`network: declared`** (Connected bundle): `references/delivery-rules.md` says the one thing that may leave the machine, a confirmed push of listed client files to a `handoffs.yaml` `drafts` destination, never under a handling level read as a union. It never opens a web page or searches.
- **Research findings in**: ow-research's answered NEXT (`use ow-draft-evidence on research/<ws>/RS-nn-<slug>/findings.md`) is read here: findings only from `### F-nn` blocks under `## Findings`, each item copying its claim, level, URL and `retrieved` date exactly.
- Data edits in the same PR, which need no bump in the other skills: the shared `examples/handoffs.yaml` gains the `drafts` key and its commented shape in every copy.
