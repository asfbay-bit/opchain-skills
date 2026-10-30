# Runs, evidence and `secrets-seen.log`

## 1. A run: `runs/RUN-nn.md`

One file per session, written by `-run` once and **never edited**: a retest is a new run. The marker of a run is the file itself, so `-run` writes its `evidence/index.md` rows first and `RUN-nn.md` last.

    ---
    <protocol header: ow_artefact: ow-uat/run; subject: the results file it imported, or uat/<slug>/uat.yaml>
    id: RUN-01
    rec: <n>
    session: <n from uat.yaml schedule, or "extra">
    kind: session | no-show | retest
    session_date: <YYYY-MM-DD>        # when the session took place, never when it was imported
    imported: <YYYY-MM-DD>
    build: <label> (<where it was reported: ready-for-uat.md | UAT-nn fixed | CO-nn delivered>) | not reported
    ---
    # RUN-01: session 1, <date written out>

    | scenario | proves | tester | result | cases | run_by | source | note | records created | evidence |
    |---|---|---|---|---|---|---|---|---|---|
    | SC-01 | AC-1.1 | order coordinator oc-T1 | fail | 9 of 10 | order coordinator | results file results-session-1.csv | … | none | none |

    ## Dropped at import
    - <each name column or name in a note, and each credential, by what it was; never the value>

- **`build`** is the label of the latest build change on or before `session_date`: `ready-for-uat.md`'s label, a `fixed` entry on a UAT-nn, or a change order's delivery in `uat.yaml` `events`, compared by `rec` when two fall on one day. Results from a session held before a fix but imported after it carry the label from before the fix.
- **`run_by`** per row: the tester's role (`order coordinator`) when a tester ran it and the result came in their results file; `user with <client role>` when the user ran it beside a client person; `user alone` when the user ran it with no client person. A result the user ran or read out is never written under a tester's role.
- **`source`** per row: `results file <name>` (stored in `evidence/`), or `user-stated (as reported)`.
- **`result`**: `pass` means the expected result was met in full; anything short of it is `fail`; `blocked` when it could not be run; `not run`. **`cases`**: cases passed out of cases required (`9 of 10`).
- **No-show run**: every scenario `not run`, the note `client did not attend; invited <dates>`, and `STATUS.md` gets `awaiting: client testers for <role> since <date>` (or `awaiting: client-owned test environment since <date>`).

## 2. `evidence/` and `evidence/index.md`

Files testers send, and every filled results file `-run` imports, are kept in the git-ignored `evidence/` folder as the user saved them. `-run` is the only writer of `evidence/index.md`:

| item | from | kind | state | note |
|---|---|---|---|---|
| results-session-1.csv | RUN-01 | results file | pointer only (imported results file) | dropped: a name column; a credential |
| oc-T1-confirmation.png | RUN-01 SC-04 | screenshot | cleared | checked in this session; confirmed by <user> <date> |

**One state per item, from the data check:** `cleared` · `pointer only (<reason>)` · `NOT-CHECKED (<format it cannot inspect, e.g. video>)`, the last treated as pointer only. The check looks for real customer data, a credential, and any person's name, email or photo. An image is `cleared` only by this session's own look at it, with the user's confirmation recorded; anything else is pointer only. **Only `cleared` items are ever cited forward** (the acceptance record, the documentation). Imported originals stay pointer only: they are on the handoff's local-copy list.

## 3. At import

- Drop any column whose header names a person (`name`, `tester name`, `full name`, `email`, `phone`) and any name, email or phone number found in a note; say what was dropped, never what it said.
- A credential in an import (a labelled password, a key- or token-shaped string, a login in an address) is not copied; the run is written without it, `secrets-seen.log` gets an entry, and NEXT prints `ask <client contact role> to reset the <role> tester's login`. The imported file stays in `evidence/` as a pointer only; redacting or removing it is the user's recorded decision and blocks nothing.
- A row that does not parse is listed, never guessed.

## 4. `secrets-seen.log`

A log only this skill writes (owner decision O2); every verb may append to it, none rewrites a line. One line per credential seen, after the protocol header block:

    <YYYY-MM-DD> (clock: <source>) | ow-uat <version> | rec <n> | kind: <password | key | token | login in an address> | role: <tester role> | source: <file, row or line> | session: <n or none>

**Never the value**, not even part of it, a hint, or its length.
