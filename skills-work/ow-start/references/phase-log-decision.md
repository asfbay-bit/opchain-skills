# Phase: log a decision (`/ow-start-log-decision <workstream>`)

Run step 0 of `references/ow-protocol.md` first. Format: `references/logs-schema.md` §5. Self-checks: `references/self-checks-logs.md`. Handling and the repository check as in `references/phase-prep-meeting.md` §1, recorded in the decision's header.

## 1. One decision per file

- **No workstream given**: never guess. If exactly one workstream fits what was asked (one with a prepared, unlogged meeting; one holding that id; one with notes whose decisions are not logged yet), name it and ask the user to confirm it; otherwise list the workstreams that fit and ask which workstream. Write nothing until the user answers.
- **From a meeting** ("log the decisions in …/MTG-nn/notes.md"): read the notes' Decisions and the `subject:` of every `DEC-nn.md` in the workstream. Offer each `D<n>` that has no `DEC-nn` yet (its `subject:` is `logs/<workstream>/meetings/MTG-nn/notes.md#D<n>`), and write **only the ones the user picks**. All logged already, or notes with no decisions: say so in the words of `references/logs-status-and-index.md` §5 and write nothing.
- **With only a workstream**: if a logged meeting of the workstream has decisions with no `DEC-nn` yet, offer them first, as from a meeting; otherwise, or if the user declines them, log one on its own.
- **On its own**: ask for the decision, its context and the options considered, with a source for each (a file, a meeting, or `you`).
- The next id is one more than the highest `DEC-nn` in the workstream.

## 2. Every field

Ask for what is missing: **Context** (why, with sources) · **Options** (each with its main trade-off) · **Decision** · **Decided by** (a role) and the date · **Confirmed** (`confirmed by <client role> by email on <date>, as reported`, then protocol §8's working-note sentence, or `internal`) · **Review on** (a date, or `no review`) · **Supersedes** (an earlier `DEC-nn`, or `none`). If it follows another skill's record, link that file by path (`references/logs-status-and-index.md` §4); never copy from it.

## 3. Changing a decision

A decision is **never edited**. To change one, write a new `DEC-nn` whose `supersedes:` names the old one; the old file stays byte for byte. If the old decision has an open review line, close it (below).

## 4. Checks, then write once

Run the self-checks for this verb (Trace, People by role, No client text in STATUS, Never edited, No private names). Fix while any is FINDING. Then write `DEC-nn.md` with the results in its Self-checks section: the file is never edited afterwards, so they go in now.

## 5. STATUS (last)

- A review date: path `logs/<workstream>/decisions/DEC-nn.md`, `next: ow-start /ow-start-action logs/<workstream>/ | awaiting: DEC-nn review by <YYYY-MM-DD>`.
- Superseding a decision whose newest line is an open review: one more line for the old decision, `next: none (closed: superseded by DEC-nn) | awaiting: none (superseded <YYYY-MM-DD>)`.
- No review and nothing superseded: no line.

## 6. Finish

Print the after-log-decision NEXT block from SKILL.md.
