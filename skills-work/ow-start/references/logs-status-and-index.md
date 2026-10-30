# The logs: actions, the log screen, resume and the index

File formats and the STATUS forms: `references/logs-schema.md`. The words every logs screen uses: section 5. Run step 0 of `references/ow-protocol.md` first; `/ow-start-log`, `/ow-start` and `/ow-status` read no client material, so they skip its handling question.

## 1. `/ow-start-action <workstream> <id> <state>`

States: `A-nn done`, `A-nn dropped`, `A-nn moved <YYYY-MM-DD>`, `DEC-nn reviewed`.

1. Read `STATUS.md` and take the **newest line per item** for the workstream (section 3). **No workstream given**: never guess. If exactly one workstream fits what was asked (one with a prepared, unlogged meeting; one holding that id; one with notes whose decisions are not logged yet), name it and ask the user to confirm it; otherwise list the workstreams that fit and ask which workstream. Write nothing until the user answers.
2. **Refuse** when the id has no line in this workstream, or its newest line is already closed (`next: none (closed: …)`), or the state does not fit the id (`DEC-nn done`). Print `Refused:` and why, `Nothing was written.`, then `Open in <workstream>:` with the open ids and their awaiting dates, and the self-check results (section 5).
3. Otherwise append exactly one line, in the form `references/logs-schema.md` §6 gives for that state. `moved` keeps the owner role from the newest line. Nothing else is written; the notes and the decision file are never edited.
4. Print `Appended:` and the line, then `Open in <workstream>:` and each open item in its STATUS form (`A-nn (<role>) by <date>`, `DEC-nn review by <date>`), then the results of this verb's self-checks (No client text in STATUS, No private names). No NEXT block.

## 2. `/ow-start-log <workstream>`

One screen. **It writes nothing.** **No workstream given**: never guess. If only one workstream has logs, name it and ask the user to confirm it; otherwise list the workstreams that fit and ask which workstream. Write nothing until the user answers. An empty workstream: say `Nothing logged yet for <workstream>`.

- **Meetings**: each `MTG-nn` with its date and state (prepared, held, logged), then the other skills' meeting records from the index (section 4).
- **Open actions**: the newest line per `A-nn` that is open, with owner role and due date, soonest first.
- **Decisions**: each `DEC-nn` with `decided_on` and `review_on`, superseded ones marked, then the other skills' decision records from the index.
- **Reviews due**: open `DEC-nn review by <date>` lines.
- Mark an item "reported overdue" only when today's date is known (protocol §6) and is past its date.
- Run this verb's self-checks on the screen before printing it (Index copies nothing, People by role, No private names; `references/self-checks-logs.md`) and print their results under it.

`business` has no index rows: the index lists client files only. Nothing from `logs/business/` appears on a client's screen, and nothing from a client's files on `business`.

## 3. Resume: `/ow-start` and `/ow-status`

- **Intakes** keep their 1.0.0 behaviour: for `intake/<slug>/…` lines, the newest line per workstream.
- **Logs**: for `logs/<workstream>/…` lines, the **newest line per item** (`MTG-nn`, `A-nn`, `DEC-nn`; logs-schema §6). An item is open while its newest line is not closed. Closing one action never hides another.
- Show the open logs items under their workstream, next to the open intakes: prepared meetings, open actions (owner role, due), reviews due. Soonest due first.
- A logs line belongs to no other skill's group, and never changes how another skill's lines are grouped.
- Mark an item "reported overdue" only when today's date is known and is past its due date. Write nothing.
- **`/ow-status`** (1.1.0's text, moved here word for word): Run step 0. One screen: open intakes (client · last step · next · awaiting, with its date) and open logs items (workstream · item · owner role · due), by the same rule. Mark an item "reported overdue" only when today's date is known from the protocol's ladder and is past the due date. Write nothing.

## 4. The index (decision L5; owner decision O1)

`/ow-start-log <client>` lists what other skills already recorded for the client, **by path, the date in the file's header (`created`) and the one header key its row names**. It reads only those header keys: never a body line, never another header key, never an amount or a person's name in any form, and it copies nothing into any file. No row reads a money, note or person key. A skill that is not installed, or has not run, has no rows. A file whose header cannot be read is listed by path with "no date in its header".

| Kind | Producer | Path | Header keys read |
|---|---|---|---|
| Meeting (fit call) and its path | ow-start | `intake/<client>/recap.md` | `created`, `path_label` |
| Meeting (Build Plan workshop) | ow-tools | `plans/<client>/workshops/W<n>/transcript.md` | `created` |
| Meeting (demo) | ow-build | `builds/<client>/demos/M<n>-record.md` | `created`, `demo_date` |
| Meeting (acceptance testing session) | ow-uat | `uat/<client>/runs/RUN-nn.md` | `created`, `session_date` |
| Meeting (monthly care call) | ow-care | `care/<client>/reports/M-nn.md` | `created` |
| Decision (quote accepted) | ow-build-plan | `plans/<client>/contract-inputs.md` | `created`, `accepted` |
| Decision (plan signed) | ow-build-plan | `plans/<client>/build-request.md` | `created`, `signed` |
| Decision (a change order, by its status: signed or declined once decided) | ow-build | `builds/<client>/changes/CO-nn.md` | `created`, `status` |
| Decision (acceptance) | ow-uat | `uat/<client>/signoff.md` | `created`, `acceptance` |
| Decision (what follows the handoff) | ow-handoff | `handoffs/<client>/after-offer.md` | `created`, `choice` |
| Decision (who trains) | ow-documentation | `docs/<client>/docs.yaml` | `created`, `trainer` |
| Decision (care terms changed) | ow-care | `care/<client>/terms-addendum-<date>.md` | `created` |

The decision log never repeats one of these. A `DEC-nn` may link to one by path ("follows `builds/<client>/changes/CO-02.md`").

Screen form, one line per file:

    builds/larkspur-ceramics/changes/CO-01.md · 2026-11-30 · status: signed

## 5. Screen words (every logs verb)

Each logs screen uses these words, so a run can be checked against what it did:

- **A refusal** starts `Refused:` and says why (the id, the file or the request). A request to skip a check that can never be waived, or to write a name, is refused in the words of `references/self-checks-logs.md`, and the verb goes on.
- **Nothing to do.** A refusal, and a verb that finds nothing to do, print `Nothing was written.` Notes with no decisions: say the notes `records no decisions`. A meeting with every step done: say it is `fully logged`.
- **A question** that waits for the user (which workstream, who is who by role, redo or new meeting, which decision a new one replaces) ends `Nothing is written until you answer.` (`-log`: `Nothing is shown until you answer.`).
- **No result claimed.** A refusal, a verb with nothing to do and a question print no `DONE:` line, no `Appended:` line and no NEXT block, and never say an item changed state.
- **Self-checks.** A verb that writes, `-action` (also when it refuses) and `-log` print one line of results: `Self-checks (same-session self-check):` and each check it ran, by name, with OK, FINDING or NOT-CHECKED (reason).
- **NEXT.** A verb that writes prints exactly one NEXT block from SKILL.md, every line of it: the `DONE:` line; the say, with its slash hint; `It will read:`; the no-folder line; and `IF IT IS NOT AVAILABLE:`. Or `NEXT: none.` with its line.
