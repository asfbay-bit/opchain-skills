# skills-work/: the ow- catalog

The ow- skills are opchain's planning family for client work: the fit call and its recap (`ow-start`), then the Build Plan, the build, the handoff and the care that follows it. They ship together as opchain v2.1.0, built one skill at a time; each carries its own version, starting at 1.0.0. Designs: `docs/plans/2026-10-06-ow-start-intake-redesign.md` and its siblings; the rules they follow come from `docs/audits/2026-09-18-ow-pack-design-audit.md` ("Cross-talk contract", "Authoring standard").

| Skill | Status |
|---|---|
| `ow-start` | 1.2.0: the 20-minute fit call, prep and recap; meeting and decision logs; the `care-takeover` path (`CHANGELOG.md`) |
| `ow-build-plan` | 1.3.0: the Build Plan offer, plan and fixed quote, with contract inputs and the build request; research findings as evidence; the documentation line's people and when it is invoiced; the fixed-fee care onboarding quote (`CHANGELOG.md`) |
| `ow-build` | 1.0.0: the client side of a signed build: the builder driven one sprint at a time (named only in `handoffs.yaml`), weekly updates, demos, change orders, invoice requests and readiness for UAT |
| `ow-uat` | 1.0.2: the client's user acceptance test: the frozen basis, a scenario per check, tester packs by role, sessions, triage and the rapid fix phase, numbered sign-off requests, deemed acceptance and the delivery backstop on the contract calendar, and the addendum flow (`CHANGELOG.md`) |
| `ow-documentation` | 1.0.1: the bought documentation and training line after sign-off: the frozen scope, screenshots through ow-tools, guides, SOPs, the runbook and the developer handover, the training kit, export and the repository copy, delivery, and the rollout through the 30-day close (`network: declared`, Connected bundle; `CHANGELOG.md`) |
| `ow-handoff` | 1.0.1: the handoff after sign-off: the frozen basis and window terms, accounts moved into the client's name, the redacted secrets scan through ow-tools `scan-secrets`, operator notes (the floor, or an index into the delivered runbook), the Handoff notes with the takeover check, the window dates once, fixes, hourly help and each change order's own window, the after-handoff offer with every term frozen, access removal from five sources, and the close (`network: none`, Core bundle; `CHANGELOG.md`) |
| `ow-draft` | 1.0.0: drafts from evidence: client reports and proposals, marketing, your own documents and announcements a client sends, as documents, decks, sheets, emails and posts; voices from samples, briefs, permissions, cited evidence items, frozen candidates with ten self-checks, your sign-off and the client's, and delivery (export, a repository copy on a branch you made, a confirmed connector push) (`network: declared`, Connected bundle; `CHANGELOG.md`) |
| `ow-care` | 1.0.0: monthly care after a handoff (from `care-start.md`) or for a system someone else built (through a fixed-fee onboarding review): the terms frozen once, each request logged and classified with its reply target, hours in quarter-hours with the frozen rollover rule and a go-ahead before any extra hour, the monthly health check through ow-tools `health` and a checklist, the monthly report and invoice request, operator notes and access with a purpose and a removal step, tier and terms changes, notice and the end (`network: none`, Core bundle; `CHANGELOG.md`) |
| `ow-research` | 1.0.2: research from sources it opened, through the host's own web tools (or your files): queries approved before the first search, every request logged before it is sent, findings with levels and quoted sources; open framework texts you downloaded, recorded unpinned (`network: declared`, Connected bundle; `CHANGELOG.md`) |

## What is in this folder

- `ow-protocol.md`: the shared protocol (version 1). Every ow- skill carries a byte-identical copy at `references/ow-protocol.md`. Edit this source, then run `node scripts/check-skill-contracts.mjs --write` to refresh the copies; the check fails while any copy differs.
- `<id>/SKILL.md` plus `references/` and `examples/`: text only. No scripts, no hooks, no network text; only `.md .txt .json .yaml .yml .csv` files. Code the family needs (transcription, document export, the redacted secrets scan ow-handoff runs, `ow-tools scan-secrets`) lives in the separate `ow-tools` add-on, which is not in this folder.
- The one exception to "no network text": a skill whose frontmatter says `network: declared` (today `ow-research`, `ow-documentation` and `ow-draft`) may name the host's own web tools and real official sources. It still ships no code and declares no `allowed-tools`: every request goes through the host's tools with the host's permission prompts on (unless the user has set the host to allow web requests without asking), and the skill's own rules (`ow-research/references/web-rules.md`) say what may leave the machine.
- ow-documentation declares it because its text names the test environment's `https://` origins a capture plan allows, and the document connectors an export may push through with the user's confirmation. Its `references/delivery-rules.md` says what may leave the machine.
- ow-draft declares it because a connector in the session can push its exported files to a `handoffs.yaml` `drafts` destination after you confirm each file; it never opens a web page or searches, and its shipped text still passes the `network: none` scan (a test runs it). Its `references/delivery-rules.md` says what may leave the machine.
- ow-care is `network: none`: its text names one ow-tools call that uses the network, `ow-tools health`, which runs only the read-only checks a user-confirmed `health.yaml` lists, under the add-on's own network rules (`plugins/ow-tools/README.md`); the skill itself opens no page and makes no request, and the `network: none` scan passes its text. A check the add-on cannot run is `not checked (reason)`, never OK.
- `<id>/skill.edges.yaml`: the skill's edges as data (ow- cross-talk contract R15), described below.

## Edges (`skill.edges.yaml`)

An edge between two ow- skills is a file one writes and the other reads, plus the NEXT block the user acts on. Each skill lists its edges in `skill.edges.yaml` (schema 1), beside its SKILL.md; the body's "Reads from" and "Hands off to" tables say the same in words. Paths are relative to `opchain-work/`; a placeholder such as `<client>` matches any placeholder in the same place.

```yaml
schema: 1
skill: ow-example
routes:                    # optional: the verb other skills hand files to ("use ow-example on <path>")
  verb: /ow-example
  reference: references/routing.md       # the routing rules; must cite every path below
  paths: [intake/<client>/intake-record.md, plans/<client>/]
writes:                    # every file this skill writes, with the one verb that writes it
  - { path: plans/<client>/scope.md, verb: /ow-example-scope }
  - { path: plans/<client>/contract-inputs.md, verb: /ow-example-quote --accepted }   # a mode of a verb is its own writer
  - { path: plans/<client>/quote.md, verb: /ow-example-quote, modes: [--quick] }      # one writer verb that also writes the file in another mode
  - { path: profile.md, verb: /ow-example-setup, seeded_by: /ow-example-extract }     # created by another of its own verbs, first run only
  - { path: offers.md, verb: /ow-example-setup, once: true }                          # created once from the example; then the user's
  - { path: STATUS.md, verb: /ow-example-scope, append: true }                        # only for append-only logs the protocol names
append_logs:               # optional: logs only this skill writes, from several of its verbs (owner decision O2)
  - uat/<client>/secrets-seen.log
reads:
  - from: ow-start         # a family skill, a planned skill, an add-on, "user" (files the user owns) or "any"
    path: intake/<client>/recap.md
    fields: [path_id, path_kind]
    if_absent: what the skill does without it (never "proceed as if passed")
    if_mismatch: what it does when the fields are not as expected
    shared: true           # optional: a workspace file at the top of opchain-work/ (profile.md), not a handoff
  - from: ow-example-plan
    path: plans/<client>/scope.md
    in_place: true         # optional: read where an earlier skill left it, carried by every hop (owner decisions O1, OD-1)
    if_absent: what the skill does without it
    if_mismatch: what it does when it does not parse
  - from: ow-start         # a named row (owner decision O6, OW-10): read only when the user names the file
    named: true
    reference: references/phase-evidence.md          # must cite the path
    path: logs/<workstream>/decisions/DEC-nn.md
    if_absent: Not named, not read
    if_mismatch: Cite it by path with its ow_artefact
  - from: ow-build         # an index row (owner decision O1): another skill's file listed by path and header keys only
    index: true
    reference: references/logs-status-and-index.md   # must cite the path
    path: builds/<client>/changes/CO-nn.md
    fields: [created, status]                         # header keys only, never a body section
    if_absent: No row
    if_mismatch: List the path with no date in its header
hands_off:
  - when: The quote is ready
    to: ow-example         # a family skill, planned skill or add-on; or `destination: contract` (a handoffs.yaml key) for work leaving the family
    verb: /ow-example-quote --accepted   # a verb (and mode) the receiver owns
    say: use ow-example to record the acceptance on plans/<client>/
    files:
      - { path: plans/<client>/quote.md, fields: [valid_until] }
      - { path: plans/<client>/scope.md, in_place: true }   # optional: handed on for a reader further down the chain (OD-1)
    if_unavailable: what the written files already give, and how to do the next step by hand
```

`node scripts/check-skill-contracts.mjs` holds the family to these rules:

- **Complete.** Every skill has the file; every reads row has an absent and a mismatch case and every hands-off row an unavailable branch; each reads path and each `say:` line appears in the body's tables; every writer verb is one the skill declares, and every mode (`--accepted`, a `modes:` flag) is one its body cites in backticks; every hands-off `verb:` belongs to the receiving skill.
- **Routes.** A say of the form "use <id> on <path>" lands on <id>'s `routes:` verb, for a path its `routes.paths` cover. The receiver's routing reference exists, cites every routed path, and is named beside `<verb> on <path>` in the body's "## Verbs" table.
- **Protocol lines.** Every NEXT template line that says "use <id>" is followed by its `It will read:` and `[no folder attached: …]` lines (protocol §9); a slash hint's mode is one its owner documents.
- **NEXT templates match.** Every hands-off to a family skill has a NEXT template in the body that says exactly its `say:`, and every NEXT template's say is an edges row (contract R15); a `destination:` row has a NEXT or IF IT IS NOT AVAILABLE line naming its handoffs.yaml key. An add-on's handoff is printed by its own absent-case text.
- **Reciprocal.** Every file a skill hands to another family skill has a reads row for it in the receiver (with the fields it needs among those handed off), and every reads row naming a family skill has a hands-off row in that producer, unless it is `shared:` (allowed only for top-level workspace files; the producer must write it) or `in_place: true` (owner decisions O1 and OD-1, 2026-10-17: a file read where an earlier stage left it, such as the plan's scope read during acceptance testing; the producer must write it, and a chain of hand-offs from the producer to the reader must list the file, or a field of it, at **every** hop). A hop that hands on a file for a reader further down the chain marks the entry `in_place: true`: it need not write the file itself (some family skill does), and its receiver reads it or hands it on in place again. A planned skill or an add-on has no edges file yet; its rows are checked once it does.
- **Index rows** (owner decision O1, OW-08). A reads row with `index: true` lists a file another skill writes, copying nothing: it reads from a family skill, a planned skill or an add-on; its `fields` are header keys only (identifier-shaped, and documented as header keys in a built producer's text), and never a key that holds money, a note or a person (`price`, `fixed_price`, `acceptance_note`, a key documented with an amount or a user's name); the reference it names cites its path; and a producer with an edges file writes the path. It needs no hand-off row, no chain and no body row; the reference is where it is described.
- **Named rows** (owner decision O6, OW-10). A reads row with `named: true` reads a file a family skill writes only when the user names it (a decision, meeting notes, a plan's map). It reads from a family or planned skill, never `user` or `any` (an open set of files the user names stays the `from: any` row, with its deny-list); it is never also `index`, `in_place` or `shared`; the reference it names cites its path; the producer writes the path; and no hand-off carries the file to the reader (a handed-off file is a plain reads row). The body's "Reads from" table still names it.
- **One writer.** No file has two writer verbs across the family. Paths compare as one file whatever their spelling: a leading `opchain-work/`, `./` and `..` segments, letter case, and a follow-on folder's `<client>-<n>` placeholder are all normalised. The exceptions are an append-only log the protocol names (`STATUS.md`, protocol §4), which every writer declares with `append: true`, and a skill-local append log (owner decision O2, 2026-10-17): a path in one skill's `append_logs`, which several of that skill's verbs append to (`append: true`) and no other skill writes.
- **NEXT targets resolve.** A NEXT block says "use <family id>", and its slash verb belongs to that skill (a planned skill's verbs are declared in `catalogs.json` `plannedVerbs`); or it names a handoffs.yaml destination (`` handoffs.yaml `contract` ``) that a family `examples/handoffs.yaml` declares.

## Logs-only STATUS forms

Protocol v1 §5 gives `awaiting: none, or <what> by <YYYY-MM-DD>`. ow-start's logs (1.1.0) add one form the protocol does not have, ratified by the owner on 2026-10-17 (OW-08, after round 1): an action with no due date says `awaiting: A-nn (<role>), no date`. It is used only on a `logs/<workstream>/meetings/MTG-nn/notes.md#A-nn` line, never by another skill, and the protocol file stays byte-identical. The ow-tools SessionStart hook reads such a line with no due date and still shows it; the siblings' resume rules key on `next:` and are not affected. Every logs form is in `ow-start/references/logs-schema.md` §6.

## How it is checked

`catalogs.json` at the repo root lists both catalogs. `npm run gen-catalog` and `npm run check-skill-contracts` (both in `pretest` and `prebuild`) iterate it:

- **Frontmatter**: only the Agent Skills keys (`name`, `description`, `license`, `allowed-tools`, `metadata`, `compatibility`); catalog fields sit under `metadata` as strings. The description names the skill id in its first 200 characters and has no angle brackets.
- **Packaging**: text files only, no hidden or executable files, no network text in a `network: none` skill, and a SKILL.md body under 5,000 tokens.
- **Contracts**: every `/ow-` verb cited is declared (one merged verb index with the oc- catalog); every NEXT block leads with `use <skill id>` and carries its `IF IT IS NOT AVAILABLE` line; Reads-from rows have absent and mismatch cases; Hands-off rows have an unavailable branch; each skill's `skill.edges.yaml` is reciprocal with the others, with one writer per file (Edges, above).
- **Family names** (design §8.1): no ow- skill file names an oc- skill, a private skill (`privateNames` in `catalogs.json`, today `llc-ops`) or a business (`brandNames`), however it is spaced, hyphenated, underscored, joined or cased. The ow- acceptance checkers read the same rule (`familyNameRules` in `scripts/check-skill-contracts.mjs`). Handoffs that leave the family go through the user's own `opchain-work/handoffs.yaml`.
- **Acceptance**: `node scripts/ow-start-acceptance.mjs` (the intake cases, and the logs cases through `scripts/ow-start-logs-acceptance.mjs`), `node scripts/ow-build-plan-acceptance.mjs`, `node scripts/ow-build-acceptance.mjs`, `node scripts/ow-uat-acceptance.mjs`, `node scripts/ow-documentation-acceptance.mjs`, `node scripts/ow-draft-acceptance.mjs` and `node scripts/ow-handoff-acceptance.mjs` check the golden runs in `tests/fixtures/ow-start/`, `tests/fixtures/ow-build-plan/`, `tests/fixtures/ow-build/`, `tests/fixtures/ow-uat/`, `tests/fixtures/ow-documentation/` and `tests/fixtures/ow-draft/`; each folder's README says how to check a real run.
- **Acceptance (ow-care)**: `node scripts/ow-care-acceptance.mjs` checks the golden runs in `tests/fixtures/ow-care/cases/` (every verb, both ways in, the bare and `on <path>` routes, the tool and no-tool branches), grading each approval a run records against the user's own words in `session/answers.md`; `--prepare <case> <folder>` lays a case out to run the skill in, and `<case> <folder>` checks a real run. The goldens are hand-written, so they show the checker, not a model run; the folder's README says what else it holds.
- **Acceptance (ow-research)**: `node scripts/ow-research-acceptance.mjs` checks the golden runs in `tests/fixtures/ow-research/` against a recorded, invented web (`web/pages.yaml`); its test runs it under the ow-tools network fence, so it opens no socket.

## Distribution (REL-01)

Since REL-01 the ow- catalog ships through three outputs of its own, listed in `catalogs.json` `outputs`:

- **Zips.** `public/opchain-work-skills.zip` (every skill folder, `ow-protocol.md`, this README, LICENSE, NOTICE) and `public/work/<id>.zip` (one skill with LICENSE and NOTICE inside), built by `scripts/make-work-skills-zip.sh` (run by `npm run make-zip`, which chains it). Served at `https://opchain.dev/opchain-work-skills.zip` and `https://opchain.dev/work/<id>.zip`. The public `opchain-skills.zip` stays oc- only, so `/skills.json` `catalogVersion` (the lockstep oc- semver the update-check hook reads) is untouched.
- **Docs.** `public/docs/work/<id>/` (SKILL.md, references/, CHANGELOG.md), `public/docs/work/ow-protocol.md` and this README, by `scripts/sync-work-docs.sh` (run by `npm run sync-docs`, which chains it). The oc- tree `public/docs/<id>/`, which the hosted MCP server streams from, stays oc- only.
- **Mirror.** `.github/workflows/mirror-public.yml` copies `skills-work/` whole to `asfbay-bit/opchain-skills`, and pushes every `v*` release tag to the mirror as a tag of the same name (for the ow-tools marketplace pin). `mirror/README.md` has the install and verify steps a user follows.

**The gate.** Both scripts refuse any tree holding a non-ow- skill, and refuse to remove or write anything until `node scripts/gen-skills-catalog.mjs` and `node scripts/check-skill-contracts.mjs` pass for the exact tree being shipped (they read `OPCHAIN_WORK_SKILLS_DIR`). Then `scripts/check-work-install.mjs` (run by `scripts/build-site.sh`, the last prebuild step, against the final `public/`) unzips the built artefacts into an empty folder's `.claude/skills/` and compares every file, every `references/ow-protocol.md` copy and the docs tree with this folder, byte for byte. All three run in `prebuild` (no new npm script: the root `package.json` is bundled into five oc- skills, so a new script there changes tracked skill files); `tests/work-distribution.test.js` plants catalog failures and checks the refusal leaves earlier zips in place.

**Versions and the tag.** Each skill keeps its own version and CHANGELOG; ow-tools keeps its own. None is tagged alone: one signed tag per release, `v<lockstep oc- version>`, covers both catalogs, and the release's `skills/CHANGELOG.md` entry lists the ow- versions shipped under it. `check-release-tag` reads `skills/` only, on purpose (`docs/governance/RELEASING.md` §2a).

## Not in the oc- outputs, on purpose

The ow- catalog is in no oc- build output: not the dev plugin (`plugins/opchain/skills`), not `opchain-skills.zip`, not `public/docs/<id>/`, not the flag registry, not the hosted MCP catalog (`catalogs.json` gives those `outputs` `null`). The scripts that write them (`sync-plugin-skills`, `sync-skill-bundles`, `make-skills-zip`, `sync-docs`, `gen-mcp-catalog`) refuse a source tree holding any non-oc- skill, so `OPCHAIN_SKILLS_DIR=skills-work` fails before anything is deleted or written. There is also no `.claude/skills/` link for ow- skills in this repo (CI requires every link there to point into `skills/`).

To try an ow- skill locally, copy or link its folder under `skills-work/` into the `.claude/skills/` folder of the project you work in (for example a client workspace), never into this repo's.
