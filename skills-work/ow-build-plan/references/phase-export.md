# Phase: export (`/ow-build-plan-export`)

Run step 0 of `references/ow-protocol.md` first. Markdown is the source of truth; the PDF and Word files are generated from it and never edited and read back.

## 1. Assemble `build-plan.md` (Build Plan mode)

Read the map, `scope.md`, `acceptance.md`, `risks.md`, `plan.yaml` and `offers.md` (`ownership`). Write `plans/<client>/build-plan.md`: the header (`ow_artefact: ow-build-plan/build-plan`, `subject: plans/<client>/scope.md`), then one H1 and these sections in order:

| Section | From |
|---|---|
| `## Summary` | the problem and the recommended change, five sentences |
| `## How it works today` | `map/current.md` |
| `## What should change` | `map/future.md` |
| `## Who does what` | `map/roles.md` |
| `## Systems and data` | `map/systems.md`, `map/data.md` |
| `## Scope` | the work packages |
| `## Out of scope` | never empty |
| `## Acceptance checks` | `acceptance.md`, every check |
| `## Risks` | each with likelihood, impact, mitigation and owner |
| `## Assumptions and client dependencies` | `scope.md` |
| `## Ownership` | `offers.md` `ownership`; with none, ask the user and record it `user-stated` |
| `## Open questions` | every remaining UNKNOWN, with who can answer |

Client voice: no confidence labels, evidence ids, quotes or tool words; leave out every `## Self-checks` section and every working-file header. Process steps stay numbered lists; an image needs alt text. Quick mode has no plan: the client documents are `quick-scope.md` and `quote.md`.

## 2. Self-check: builder-neutral

Same-session self-check: the same assistant that wrote the plan, applying a checklist; a discipline, not an independent review. Agent-checked. It passes when `build-plan.md` names:

- none of the user's prices, fees or rates, and no amount from `price-book.yaml` or `quote.md`. The client's own figures stay: volumes, times and what today's process costs them (the cost of a miss the map records) are facts about the client, not a price;
- no tool, service or method that is only the user's own (from `profile.md`, `offers.md` or `price-book.yaml`: their business name, unit ids and labels);
- no wording from these skills: no `ow-` name, no "opchain", no check names and no tool words (checkpoint, evaluator, rubric, gate);
- a technology only where the client's systems require it.

A FINDING lists each line; fix `build-plan.md` (or the file it came from) and run again. **Export refuses while any self-check in the plan is FINDING** (this one, or the scope's and the quote's), unless the user types a waiver naming it: "export with <check> FINDING waived by <name>, <date>"; record the waiver in the report.

## 3. Export

For `build-plan.md` and `quote.md` (quick mode: `quick-scope.md` and `quote.md`): if you can run code here and `ow-tools version` answers, run `ow-tools export <file> --out plans/<client>/export/`. ow-tools removes the header and everything between the `ow:internal` markers (the quote's internal appendix, the quick scope's self-checks), checks the structure and writes `<name>.pdf` and `<name>.docx`. Exit 3: say which requirement is missing and take the absent-case. Exit 4: show the reason, fix the Markdown, run again. Otherwise: "The PDF and Word files need the ow-tools add-on, which is not installed here." Print the finished Markdown of each document without its header and without everything between the `ow:internal` markers (never the quote's internal appendix), and say the documents could not be generated here.

## 4. `export/export-report.md`

Header (`ow_artefact: ow-build-plan/export-report`), then: the self-check results (builder-neutral, and the scope's and quote's as last recorded), any waiver, and for each document either the ow-tools command and its raw report (hashes as reported, with its own wording) or "not generated here: the ow-tools add-on is not installed". It states: structure checked in the source this tool generated; this is not a conformance test.

## 5. STATUS and NEXT

Append: `… | plans/<client>/export/export-report.md | next: ow-build-plan /ow-build-plan-quote plans/<client>/ | awaiting: client's answer by <valid_until>; Build Plan credit by <credit_deadline>` (quick mode, or a plan with `fee: none`: `awaiting: client's answer by <valid_until>`). Remind the user to ask the client to remove any read-only access the plan used (the access log in `evidence.md`), and suggest a calendar reminder for the validity date, and one for the credit deadline when the quote has one. Print the export NEXT block from SKILL.md. Nothing is sent: the user sends the documents.
