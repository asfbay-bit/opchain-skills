# ow-start changelog

Per-skill versions (`catalogs.json` `versionPolicy: per-skill`; owner decision O7 of OW-08). The family's v2.1.0 release entry cites each skill's version. Every change to `SKILL.md` or a reference bumps this skill; data, example and test edits ride without a bump (OW-04 ruling O9) and are listed here as data edits.

## 1.2.0 (2026-10-29): amendment S1, the care-takeover path

Amendment S1 of `docs/plans/2026-10-16-ow-care-design.md` §12, built with ow-care 1.0.0 (OW-07; contract `sprints/release-2.1/ow-07/contract.md`). The owner's 2026-10-17 ruling (OW-08 round 1) gives ow-start one minor version per sprint: this is the one for OW-07.

- **A new path kind, `care-takeover`.** An `offers.md` path may have `kind: care-takeover`: a running system the client wants looked after, with no build in scope. The recap header's `path_kind` gains the value (`references/intake-record-schema.md`). Extract proposes it like any other path, and infers no tier and no price (`references/phase-extract.md` §5).
- **Its NEXT** is a fixed-fee onboarding review, quoted by ow-build-plan: `use ow-build-plan to quote onboarding on intake/<client>/intake-record.md` (`/ow-build-plan-quote --quick --onboarding`), with a Hands-off row and a NEXT template in the body and a hands-off row in `skill.edges.yaml`.
- **Data edit, no bump of its own:** the shared invented `examples/offers.md` gains `## path: care-takeover`, byte-identical in every ow- skill that ships it.

## Unreleased: data edits from OW-06 (ow-handoff 1.0.0)

No version bump (OW-04 ruling O9); no `SKILL.md` or reference text changed:

- `examples/handoffs.yaml` and `examples/offers.md`: as ow-uat's. Its index row on `handoffs/<client>/after-offer.md` (`created`, `choice`) now checks live against ow-handoff's text; it needed no edit.

## Unreleased: data edits from OW-10 (ow-draft 1.0.0)

No version bump (OW-04 ruling O9); no `SKILL.md` or reference text changed: `examples/handoffs.yaml` gains the `drafts` key (where a finished draft goes: a repository folder by `repo` and `path`, and a say: line, an optional `location:` and a post's `limit` per other destination) and its commented shape with invented, neutral keys, byte-identical in every ow- skill that ships it.

## Unreleased: data edits from OW-05 (ow-documentation 1.0.0)

No version bump (OW-04 ruling O9): `examples/handoffs.yaml` gains the `docs` key (where the documents go: the client's repository folders, and a say: line and an optional `location:` per other destination) and its commented shape, byte-identical in every ow- skill that ships it. ow-start's index row for `docs/<client>/docs.yaml` (`created`, `trainer`) needed no edit.

## Unreleased: data edits from OW-04 (ow-uat 1.0.0)

No version bump (OW-04 ruling O9); the shared examples stay byte-identical in every skill that ships them:

- `examples/offers.md` gains a `## uat` section (`defaults`, `min_testers_per_role`, `follow_up_business_days`, invented placeholders), and its opening paragraph says ow-uat reads it.
- `examples/handoffs.yaml` gains the `sign` key, and its comment says ow-uat reads `build` (a problem for the builder) and `sign` (a sign-off request).

## 1.1.1 (2026-10-18): prescribed screen words (OW-08 follow-ups)

From evaluation round 3 (`sprints/release-2.1/ow-08/eval-round-3.md`, PASS at 7.6) and the owner's decision to take its minors in one follow-up PR.

- **Screen words.** `references/logs-status-and-index.md` §5 prescribes the words every logs screen uses: a refusal starts `Refused:`; a refusal or a verb with nothing to do prints `Nothing was written.`; notes with no decisions `records no decisions`; a question ends `Nothing is written until you answer.` (`-log`: `Nothing is shown until you answer.`); a refusal, a no-op or a question prints no `DONE:`, `Appended:` or NEXT block and never says an item changed state; every verb that writes, `-action` and `-log` print one self-check line; a verb that writes prints exactly one NEXT block, every line of it. `-action` (§1.2), `-log-decision` (§1), `-log-meeting` (§0.2), the extract refusal of a `logs/` folder (`phase-extract.md` §1) and `self-checks-logs.md` point to it.
- `/ow-status`'s 1.1.0 text is back word for word in `logs-status-and-index.md` §3 (round 2 had changed its framing words).
- The description says again that the recap is due within one business day and that the skill names a path, never a price (899 of 1,024 characters).
- Data edits in the same PR: the logs goldens use the prescribed words (nine screens), their keys grade the self-check line and the whole NEXT block wherever a screen prints them, and the acceptance checker accepts logs files and STATUS lines from ow-start 1.1.0 or later (the goldens keep the 1.1.0 they were written with).

## 1.1.0 (2026-10-17): meeting and decision logs

Design: `docs/plans/2026-10-16-ow-start-logs-amendment.md` (L1–L5; build notes §11). Contract: `sprints/release-2.1/ow-08/contract.md`.

- **Five verbs.** `/ow-start-prep-meeting <workstream>` (an agenda from open actions, reviews due, awaited lines and last meeting's open questions, each with its source), `/ow-start-log-meeting <workstream> [MTG-nn]` (notes from a transcript or your notes, a client follow-up draft, one STATUS line per action), `/ow-start-action <workstream> <id> <state>` (done, dropped, moved, reviewed), `/ow-start-log-decision <workstream>` (one decision per file, never edited) and `/ow-start-log <workstream>` (one screen, with the other skills' records indexed by path and header).
- Files under `logs/<workstream>/` (a client, or `business`); people by role everywhere; no client text in STATUS; `/ow-start` and `/ow-status` show the newest line per logs item.
- New references: `logs-schema.md`, `logs-status-and-index.md`, `phase-prep-meeting.md`, `phase-log-meeting.md`, `phase-log-decision.md`, `email-template.md`, `self-checks-logs.md`. `intake-record-schema.md` examples say 1.1.0; `phase-prep.md` says its two `.gitignore` lines cover `logs/`; `phase-extract.md` refuses a `logs/` folder and names `/ow-start-log-meeting`.
- The description brings in meetings no other ow- skill records and decisions; it no longer excludes internal meetings.
- After evaluation round 1 (owner decisions of 2026-10-17): the body was trimmed to about 4,000 tokens (at least 400 of headroom under its 4,500 cap) by moving `/ow-setup`'s steps, "Works on its own" and the transcription absent-case into a new `references/phase-setup.md`, word for word; the logs verbs ask for a missing workstream instead of guessing; `-log` runs an "Index copies nothing" self-check, and `-action` prints its self-check results; a moved date may move back; roles may hold an acronym or a possessive; `awaiting: A-nn (<role>), no date` is ratified as a logs-only form.
- After evaluation round 2: `/ow-status`'s 1.0.0 column list is back, word for word, in `references/logs-status-and-index.md` §3, and the body points to it; a refusal's screen words are prescribed (`refused` and `<check> can never be waived`); the phone shapes People by role keeps out are named (ten digits run together, an international number); the shipped text no longer carries evaluation ids or names a repository script; the description keeps 167 of its 1,024 characters free.
- Versions: 1.1.0 is the logs release. The later ow-start amendments S1 (care-takeover path), S2 (`quote: vendor-eval`) and S3 (`quote: controls-readiness`) ship as 1.2.0 and later.

### Recorded here: two in-place edits to 1.0.0's text (made without a version bump)

- **#605 (OW-01, ow-build-plan 1.0.0):** the Hands-off row for delivery mode when the next stage is another session (`/ow-start-prep`, "use ow-start to prep <client>"), and its NEXT template's `[no folder attached: attach intake-record.md when you say it]` line.
- **#616 (OW-02, ow-build 1.0.0):** the K18 slash hint `(where slash commands exist: /ow-build-plan)` on the after-extract NEXT.

Data edits in the same PRs, which need no bump: #605 added `skill.edges.yaml` and changed `examples/handoffs.yaml` and `examples/offers.md`; #616 changed `examples/handoffs.yaml`.

## 1.0.0 (2026-10-14): the fit call and its recap

`/ow-start`, `/ow-start-prep`, `/ow-start-extract`, `/ow-setup`, `/ow-status` (#596). Design: `docs/plans/2026-10-06-ow-start-intake-redesign.md`. The audit follow-ups in #604 changed the acceptance checker only, not this skill's text.
