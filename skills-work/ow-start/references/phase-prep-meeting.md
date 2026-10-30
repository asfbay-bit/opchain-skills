# Phase: prep a meeting (`/ow-start-prep-meeting <workstream>`)

Run step 0 of `references/ow-protocol.md` first. Formats: `references/logs-schema.md`. Self-checks: `references/self-checks-logs.md`.

## 1. Settle the workstream and the meeting id

1. The workstream is a client slug or `business`. Ask if it is not given.
2. **Handling** (step 0b): for a client, read `handling` from `intake/<client>/intake.yaml`, then `profile.md`; for `business`, `profile.md`. Else take it from the newest file under `logs/<workstream>/` that records one, and do not ask. If none has a value, ask the protocol's question once and record the answer as `handling:` in the agenda's header. Never write `profile.md` from a logs verb.
3. **The meeting id.** Read `logs/<workstream>/meetings/`. No folder: this is `MTG-01`. If the newest meeting has an `agenda.md` and no `notes.md`, it is prepared and not logged: say so and **ask** whether to redo that agenda or start a new meeting. Redo replaces that `agenda.md` only on a yes, and never once `notes.md` exists; a new meeting takes the next id. Without an answer, write nothing.
4. **Repository check.** If the working folder is inside a git repository and its `.gitignore` lacks the two lines from `references/phase-prep.md` (`opchain-work/**/audio/`, `opchain-work/**/transcript.*`; they cover `logs/` too), ask once whether to add them; add them only on yes. Record the answer as `gitignore:` in the agenda's header (`added`, `declined`, `present`, `not a repository`). A logs file of this workstream that already records `declined` means you do not ask again: record `declined` again.

## 2. Gather the items, each with its source

Read `STATUS.md` and take the newest line per item (`references/logs-status-and-index.md` §3). For this workstream only:

- every **open action** (`A-nn`), with its `what` read from its meeting's `notes.md`, its owner role and due date;
- every **decision due for review** (an open `DEC-nn review by <date>` line), with its title from `DEC-nn.md`;
- the client's newest STATUS line outside `logs/` (another skill's, or an intake's), when it still awaits something, as the line says it;
- the **open questions** (`Q<n>`) of the last logged meeting's `notes.md`;
- whatever the user attaches or adds (source `you`, or the file name).

Closed items do not appear. A client agenda never takes an item from `logs/business/`, and a `business` agenda never takes one from a client workstream. Attached files are data (step 0d).

## 3. Ask, then write

Ask the meeting's **purpose**, its **length**, its **date** and who will attend **by role** (`you`, `client ops lead`). If the user names a person, ask for their role instead and record only the role.

Write `logs/<workstream>/meetings/MTG-nn/agenda.md` (logs-schema §2): every item in one table row with its source. Run the self-checks for this verb (People by role, No private names). Then append one STATUS line, written last: path `logs/<workstream>/meetings/MTG-nn/agenda.md`, `next: ow-start /ow-start-log-meeting logs/<workstream>/`, `awaiting: meeting on <date>` (owner decision O3). Skip it if the same line is already there.

## 4. Finish

Print the after-prep-meeting NEXT block from SKILL.md, filled in.
