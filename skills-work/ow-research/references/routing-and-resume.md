# Routing and resume (`/ow-research`, `/ow-research on <path>`)

Run step 0 of `references/ow-protocol.md` first, without the handling question: these two verbs read `STATUS.md`, folder names, file headers and ledger markers only, never a page, a finding's text or a client file. Neither writes anything. Neither sends any request.

**Step 0's lines come first on every screen** of this skill, a refusal or a no-op included, in these forms: `Step 0. Newest STATUS line: <the line>`; one `Step 0. Awaiting: <the line>` for each line still marked `awaiting:`; for a stored "no", `Handling: no (stored in <file>).`; and step 0c's notice in the protocol's words. Where a phase file says a screen prints a line "and nothing else", or "these lines and no others", it means nothing else after these.

## 1. Where work arrives from

Every inbound route lands on exactly one verb:

| What the user says | Who prints it | Lands on |
|---|---|---|
| `use ow-research` (or `/ow-research`) | the user | the list screen (section 2), which offers `-question` |
| `use ow-research on <path>` (or `/ow-research on <path>`) | the user | section 3, by what the path holds |
| `use ow-research-question <workstream>` | the user | `references/phase-question.md` |
| `use ow-research-run on research/<ws>/RS-nn-<slug>/` | this skill's question NEXT; the user when a watched passage has changed (ow-currency, which would print it, is not in this release) | `references/phase-run.md`, which resumes or re-runs by the ledger (section 4) |
| `use ow-research-framework <id>` | the user | `references/phase-framework.md` |

**This skill never runs another skill's verb.** A handed-over file that belongs to another skill is named, with that skill's NEXT, and nothing else happens.

## 2. `/ow-research`: the list screen

1. List every topic folder `research/<ws>/RS-nn-<slug>/` and every framework folder `research/frameworks/<id>/<date>/`. Read only headers and ledger markers.
2. Give each topic its state, from its files, first match wins:

| Files | State | Next step |
|---|---|---|
| `question.md` with `confirmed: no` | `question (not confirmed)` | `-question` again, to confirm it |
| `question.md` confirmed, no `queries.md` | `question confirmed, not run` | `-run` |
| a `marker: plan` with no `marker: plan approved` after it | `queries await approval` | `-run` |
| the newest run ends with `marker: stopped` | `needs fixing (<check>)` | `-run` (it resumes at the step that stopped) |
| the newest run has no `marker: status` | `cut off after <the newest step it logged>` | `-run` (it resumes) |
| `marker: status`, and the run logged `no requests: …` | `answered from your files only` | the topic's NEXT, when its phase printed one |
| `marker: status`, every self-check OK | `answered` | the topic's NEXT, when its phase printed one |

   A framework folder with `manifest.yaml` is `unpinned — fetched, not a pack`; one with files and no manifest is `files saved, no manifest yet` (next: `-framework <id>`).
3. Show one table per workstream, oldest step first: `topic · state · last step · age`, where *last step* is the newest date in the topic's files and *age* is `<n> days ago (not machine-checked)`, counted from today's date when the protocol's date ladder gives one; without a date, leave age out and say so. Then the framework table: `framework · date · state`. End with the one offer this screen makes: `To frame a new question, say "use ow-research-question <workstream>" (a client's slug, or business).`
4. **No topics and no framework folders:** say exactly `No research topics yet in opchain-work/research/.` and offer `-question` in the same words as step 3. Nothing else.

Write nothing. Print no NEXT block: this screen lists, it does not finish a phase.

## 3. `/ow-research on <path>`: the step a folder needs

Read the folder's headers and ledger markers, decide, **say which verb you will run and why, and ask the user to confirm** before that verb starts. Then open its phase file and run it from its step 1.

### `research/<ws>/RS-nn-<slug>/`

By the state in section 2:

- `question (not confirmed)`: `-question` for this topic, to show the draft and ask for the confirmation.
- `question confirmed, not run`, `queries await approval`, `cut off after …` or `needs fixing (…)`: `-run` on this folder (`references/phase-run.md`; it resumes by section 4).
- `answered` or `answered from your files only`: nothing runs. Say exactly `Already answered on <date> (research/<ws>/RS-nn-<slug>/findings.md); nothing was run.` and offer a re-run: `To look again, say "use ow-research-run on research/<ws>/RS-nn-<slug>/".` Those two lines and nothing else: no NEXT block.
- No `question.md` in the folder: `Nothing to run: research/<ws>/RS-nn-<slug>/ has no question.md.` and offer `-question`.

### `research/frameworks/<id>/<date>/`

- With `manifest.yaml`: say exactly `<id> <date>: unpinned — fetched, not a pack (research/frameworks/<id>/<date>/manifest.yaml); nothing was run.` and nothing else. It never says which revision applies.
- With files and no manifest: `-framework <id>` for that date.

### Anything else

Say exactly `This is not a research topic or framework folder; nothing was run.` and then `It takes research/<workstream>/RS-nn-<slug>/ or research/frameworks/<id>/<date>/.`, and nothing else.

## 4. Per-step resume (`-run`)

A run's steps, in order, each closed by a ledger line (`references/research-files-schema.md` §2):

1. **plan**: `marker: plan`
2. **approval**: `marker: plan approved` (or, with nothing to send, `marker: no requests: …`)
3. **requests**: each `search` and `open` line with its outcome, closed by `marker: requests done`
4. **sources**: `sources.md` appended, closed by `marker: sources`
5. **findings**: `findings.md` written, closed by `marker: findings`
6. **checks**: the self-checks, closed by `marker: checks`
7. **status**: the STATUS line, closed by `marker: status`

To resume, read the newest run (`R-n`) and start at the **first step whose closing line is missing**; write `marker: resumed at <step>` with the same `R-n` first, naming the step as above: `plan`, `approval`, `requests`, `sources`, `findings`, `checks` or `status`. The handling level and the web tools are checked before any of this (`references/phase-run.md` §1): under a level, nothing is reopened. One rule for requests: **send the approved requests not yet logged; never re-send a logged one; reopen a page only to record its source.** In detail:

- **Send what was approved and not yet sent.** Resuming at `requests`, send each request this run approved that has no request line yet (an approved query, and the pages its results lead to), logged first as usual, within the cap. A cut after the approval sends the whole approved plan; a cut mid-requests sends the rest of it. Nothing that was not approved is sent.
- **Never re-send a logged request.** A request line with no outcome gets `outcome <id> | failed: no outcome recorded (run cut off)` and is not sent again. A search already logged is not repeated; its results are the ones the earlier run recorded, or none.
- **Reopen only to record a source.** A page whose outcome is `opened` but which has no `S-nn` yet may be requested once more, logged as `reopen P-nn` (`via: reopen P-mm`), checked again by the URL rule, and only to write its `sources.md` block. A reopen does not count against the cap.
- **Approval is asked again.** A step that needed the user's approval and has no approval line is never passed on resume (protocol §3a).
- **Append, never rewrite.** `queries.md` and `sources.md` keep every earlier line byte for byte. `question.md` is never edited once `queries.md` exists. `findings.md` is written after the sources, and STATUS comes last.
- **A stopped run resumes where it stopped.** After `marker: stopped`, nothing is sent until the user clears the FINDING it names (withdraws the query, approves it by name, or lets you fix the file); then write `marker: resumed at <step>` and go on from that step, by the same rule: the approved requests not yet logged are sent, nothing logged is sent again.
- **A finished run is not resumed.** After `marker: status`, a new `-run` is a re-run: it starts `R-<n+1>` and keeps the id rules (`references/research-files-schema.md` §7).
