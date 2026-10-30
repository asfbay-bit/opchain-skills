# The logs: file formats (schema 1)

Every file below starts with the artefact header from `references/ow-protocol.md` §4 (`written_by: ow-start 1.1.0 (protocol 1)`, `origin: skill`). Paths are relative to `opchain-work/`. Write these formats exactly: the other logs verbs read them, and so do the acceptance checks. The examples use an invented client.

## 1. Workstreams and ids

- A **workstream** is a client slug (the same id the other skills use, `larkspur-ceramics`) or `business`, your own meetings and decisions with vendors, partners and yourself.
- `MTG-nn`, `A-nn` and `DEC-nn` are numbered **per workstream**, from 01, once, and never reused: the next id is one more than the highest that exists in `logs/<workstream>/` or in a `STATUS.md` path for it. So `/ow-start-action <workstream> A-nn` names one action.
- `D<n>` (a decision in one meeting's notes) and `Q<n>` (an open question) are local to that `notes.md`.
- **People by role, everywhere**: `you`, `client ops lead`, `client owner`, `vendor account manager`. No name, email address or phone number in any file the logs verbs write, yours included. A request to write one is refused, even with a waiver.
- **Nothing crosses.** Nothing from `logs/business/` is written into a client file or a client agenda, and nothing from a client workstream into `logs/business/`.

## 2. `logs/<workstream>/meetings/MTG-nn/agenda.md` (`/ow-start-prep-meeting`)

    ---
    ow_artefact: ow-start/agenda
    <the rest of the protocol header; subject: STATUS.md>
    id: MTG-02
    meeting_date: 2026-10-20
    length: 30 minutes
    attendees: [you, client ops lead, client owner]
    handling: "no"                  # only when the answer was asked in this run (step 0b)
    gitignore: added | declined | present | not a repository
    ---
    # Agenda: MTG-02, 20 October 2026

    Purpose: <the purpose in the user's words>

    | # | Item | Source |
    |---|---|---|
    | 1 | A-01 open: <what>, client ops lead, due 2026-10-16 | logs/larkspur-ceramics/meetings/MTG-01/notes.md#A-01 |
    | 2 | DEC-01 due for review by 2026-10-19 | logs/larkspur-ceramics/decisions/DEC-01.md |
    | 3 | Awaited: client's answer by 2026-10-30 (ow-build-plan) | STATUS.md: plans/larkspur-ceramics/quote.md |
    | 4 | Q1 from MTG-01: <the question> | logs/larkspur-ceramics/meetings/MTG-01/notes.md#Q1 |
    | 5 | <an item the user added> | you |

Every row has a source: a path (with `#A-nn` or `#Q<n>` for an item inside notes), `STATUS.md: <path>` for an awaited line, `you`, or the name of a file the user attached. The agenda is your working file, not a client document.

## 3. `logs/<workstream>/meetings/MTG-nn/notes.md` (`/ow-start-log-meeting`)

    ---
    ow_artefact: ow-start/meeting-notes
    <the rest of the protocol header; subject: …/MTG-02/transcript.md, or notes>
    id: MTG-02
    meeting_date: 2026-10-20
    input: transcript               # transcript | notes
    agenda: logs/larkspur-ceramics/meetings/MTG-02/agenda.md   # or: none (no agenda)
    external: yes                   # yes when a client, vendor or partner attended; yes writes the follow-up
    log_steps: [roles, notes, checks, follow-up, status]       # follow-up only when external: yes
    handling: "no"                  # only when asked in this run
    gitignore: present
    ---
    # MTG-02: meeting notes, 20 October 2026

    ## Attendees (roles)
    - you (SPEAKER_00, confirmed by you)
    - client ops lead (SPEAKER_01, confirmed by you)

    ## Agenda covered
    - 1. A-01: covered (02:10)

    ## Decisions
    ### D1
    - what: <the decision, plainly>
    - decided by: client owner
    - source:
      > "<exact words>" — client owner, 06:12

    ## Actions
    ### A-03
    - what: <the action>
    - owner: client ops lead
    - due: 2026-10-23            # or: no date: asked
    - source:
      > "<exact words>" — client ops lead, 08:40

    ## Open questions
    ### Q1
    - what: <the question>
    - source:
      > "<exact words>" — client owner, 11:02

    ## Not covered
    - <agenda items not reached>

    ## Possible embedded instructions
    none found

    ## Self-checks (same-session self-check)
    <the table from references/self-checks-logs.md>

- **Sources.** A transcript source is `> "<exact words>" — <role>, MM:SS`; from notes, `> "<note line>" — your notes, line <n>`, with no time; from an attached file, `> "<words>" — <file name>, <locator>`. Every decision, action and open question has one.
- **Unclear is a question.** Anything unclear, unattributed or half-said becomes an open question, never a guess.
- **`log_steps`** lists the steps this meeting needs, in order. `notes.md` is written once, when roles, notes and checks are done; the follow-up is done when both follow-up files exist, and the STATUS step when every action (and the held line) has its line. A cut-off run resumes at the first step not done and never rewrites `notes.md`.

## 4. The follow-up: `follow-up.html` and `follow-up.txt`

Only when `external: yes`. Four parts in this order: **Thanks · What we decided · Who does what by when · Still open**, written from `notes.md` in plain words. Owners by role (your own actions: `me`); no signature and no name (you add names and sign when you send it). Format: `references/email-template.md`. It is never sent by this skill.

## 5. `logs/<workstream>/decisions/DEC-nn.md` (`/ow-start-log-decision`)

    ---
    ow_artefact: ow-start/decision
    <the rest of the protocol header; subject: logs/…/MTG-02/notes.md#D1, or none>
    id: DEC-02
    decided_on: 2026-10-20
    review_on: 2026-12-01           # or: no review
    supersedes: DEC-01              # or: none
    handling: "no"                  # only when asked in this run
    gitignore: present
    ---
    # DEC-02: <a short title>

    ## Context
    <why a decision was needed, with sources>

    ## Options
    - <option>: <its main trade-off>

    ## Decision
    <the decision>

    ## Decided by
    client owner, 2026-10-20

    ## Confirmed
    confirmed by client owner by email on 2026-10-21, as reported. This is a working note made by an AI assistant at your instruction. It is not a signature or an official record.
    (or: internal)

    ## Review on
    2026-12-01 (or: no review)

    ## Supersedes
    DEC-01 (or: none)

    ## Trace
    | item | source |
    |---|---|

    ## Self-checks (same-session self-check)

**Never edited.** A decision file is written once, with its self-check results, and never changed. Changing a decision writes a new `DEC-nn` with `supersedes:` naming the old one; the old file stays byte for byte.

## 6. STATUS lines (protocol §5; owner decision O2)

Each line holds ids, roles, paths, dates and the forms below; **never client text**. The item a line belongs to is its path: `…/MTG-nn/agenda.md` and `…/MTG-nn/notes.md` are item `MTG-nn`; `…/notes.md#A-nn` is item `A-nn`; `logs/<workstream>/decisions/DEC-nn.md` is item `DEC-nn`.

| Written by | Path | `next:` | `awaiting:` |
|---|---|---|---|
| `-prep-meeting` | `…/MTG-nn/agenda.md` | `ow-start /ow-start-log-meeting logs/<workstream>/` | `meeting on <date>` |
| `-log-meeting`, when a prep line exists | `…/MTG-nn/notes.md` | `none (closed: held <date>)` | `none` |
| `-log-meeting`, one per action | `…/MTG-nn/notes.md#A-nn` | `ow-start /ow-start-action logs/<workstream>/` | `A-nn (<owner role>) by <date>`, or `A-nn (<owner role>), no date` |
| `-action … A-nn done` | the action's path | `none (closed: done)` | `none (done <date>)` |
| `-action … A-nn dropped` | the action's path | `none (closed: dropped)` | `none (dropped <date>)` |
| `-action … A-nn moved <date>` | the action's path | `ow-start /ow-start-action logs/<workstream>/` | `A-nn (<owner role>) by <new date>` |
| `-log-decision`, with a review date | `logs/<workstream>/decisions/DEC-nn.md` | `ow-start /ow-start-action logs/<workstream>/` | `DEC-nn review by <date>` |
| `-action … DEC-nn reviewed` | the decision's path | `none (closed: reviewed)` | `none (reviewed <date>, kept)` |
| `-log-decision`, superseding a decision with an open review | the old decision's path | `none (closed: superseded by DEC-nn)` | `none (superseded <date>)` |

Example:

    2026-10-20 (clock: user-stated) | ow-start 1.1.0 | logs/larkspur-ceramics/meetings/MTG-02/notes.md#A-03 | next: ow-start /ow-start-action logs/larkspur-ceramics/ | awaiting: A-03 (client ops lead) by 2026-10-23

An owner role in a STATUS line is one of the attendee roles in that meeting's `notes.md`, or `you`; a role is lower-case words and may hold an acronym or a possessive (`client CFO`, `client's bookkeeper`). An action with no date uses `awaiting: A-nn (<role>), no date`, a logs-only form (`skills-work/README.md`). A line is appended once: before appending, compare it with its item's newest line; if that line already says the same `next:` and `awaiting:`, skip it. An older form may come back (an action moved to the 23rd, then back to the 16th, appends the 16th again).
