# Self-checks, and working on its own

Moved from SKILL.md in 1.1.0, word for word, so the body keeps room for the amendments still to come; the Research rows check is new in 1.1.0.

## Self-checks

Each is a **same-session self-check: the same assistant that wrote the document, applying a checklist; a discipline, not an independent review.** Each reports OK, FINDING or NOT-CHECKED (reason), agent-checked, where its phase file says. Fix and re-run while any is FINDING; `-export` refuses one unless the user types a waiver naming it.

| Check | Runs in | Passes when |
|---|---|---|
| Evidence trace | `-map`, `-scope` | Every HIGH or MEDIUM fact cites an `evidence.md` line that exists |
| Acceptance coverage | `-scope`, `-quote --quick` | Every package has a check with test data and a case count; error cases too |
| Out of scope present | `-scope`, `-quote --quick` | The out-of-scope list is not empty |
| Risk owners | `-scope` | Every risk has an owner and a mitigation |
| Quote integrity | `-quote` | Units or a recorded manual price on every package; modifiers cite evidence; dates, terms, testing line and fix window match the price book and `offers.md`; the internal appendix sits inside the `ow:internal` markers |
| Builder-neutral | `-export` | The plan names none of your prices, fees, rates or tooling, nor these skills' wording (the client's own figures stay) |
| Research rows | `-collect`, `-map` | Every `research` row names `RS-nn F-nn` of a findings file in this client's own research folder, keeps that finding's level, and comes from a topic with no self-check FINDING open; no fact about the client's current state (`map/current.md`, `systems/<system>.md`) rests only on research rows above MEDIUM |

## Works on its own

- Needs no other skill. Without ow-start, give it a short written request instead of an intake record; the tier is then yours to state.
- Without the ow-tools add-on: Markdown documents, dates and totals marked not machine-checked, and the meeting tool's transcripts or notes.
- Without a skill to build it, `build-request.md` is a file a person carries to whoever builds it.
