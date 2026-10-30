# The package and the dates: `package.yaml`, `handoff-notes.md`, `dates.yaml`, `co-windows.yaml`, the emails

## 1. `package.yaml` (written by `/ow-handoff-package` only)

    ow_artefact: ow-handoff/package
    schema: 1
    written_by: ow-handoff 1.0.1 (protocol 1)
    workstream: <client slug>
    subject: handoffs/<client>/handoff-notes.md
    created: <YYYY-MM-DD>
    clock: <source>
    origin: skill
    package_steps:
      - { step: notes, rec: <n>, date: <YYYY-MM-DD> }
    planned_send: { date: <YYYY-MM-DD>, provisional: true, source: "<user> <YYYY-MM-DD>" }
    planned_end: { date: <YYYY-MM-DD>, provisional: true }
    planned_removal: { date: <YYYY-MM-DD>, provisional: true }
    planned_care_start: { date: <YYYY-MM-DD>, provisional: true } | none
    calc:
      - { command: "ow-tools calc date --from <date> --days <n>", output: "<as printed>" } | not machine-checked
    export: { command: "ow-tools export handoffs/<client>/handoff-notes.md --out handoffs/<client>/export/", exit: <n>, output: "<as printed>" } | not available (no ow-tools here)
    read_through: none | "<user> <YYYY-MM-DD>: handoff-notes.md and the email read for secrets"
    gitignore_warning: none | "export/ and secrets-seen.log are not git-ignored here"
    symlinks_out: []             # repository paths that resolve outside the repository: reported, never read or cited
    revisions: []
    embedded: []
    self_checks: { … }
    note: This is a working note made by an AI assistant at your instruction. It is not a signature or an official record.

- **Provisional dates** (before delivery): `planned_send` is asked. `planned_end` = `planned_send` + `fix_window_days` calendar days. `planned_removal` = `planned_end` minus the frozen lead in business days, on `profile.md`'s time zone and holidays (absent: weekends only, said). `planned_care_start` = the day after `planned_end`, only when the choice recorded is care with no agreed start. With the line bought, `-package` runs only after `docs/<client>/delivered.md`, so `planned_send` is on or after its `delivered:` date; `docs.yaml` `planned_delivery` serves only the waiting screen and its STATUS awaiting.
- **No `*price*` key**, ever; no amount.
- **`--revision`** (after delivery): one entry per run, `{ date, rec, why }`, and **no date moves**: the notes print the recorded dates from `dates.yaml`.

## 2. `handoff-notes.md`: the six sections

Written by `-package`. Header as protocol §4 (`ow_artefact: ow-handoff/handoff-notes`). The body is for the client: no confidence labels, no tool words, dates written out (protocol §12).

    # Handoff notes: <Client>
    ## Your accounts
    ## Operator notes
    ## Acceptance record
    ## Taking it over
    ## Your fixes
    ## What happens next

| Section | Holds |
|---|---|
| Your accounts | `accounts.md`'s rows **without** the Source · confidence column; transfer items as done or pending; a row below HIGH marked "to confirm" |
| Operator notes | `operator-notes.md`'s entries (the index form: each id and title with "see the runbook"); the escalation line, with the chosen tier's reply target when the choice is already recorded |
| Acceptance record | ow-uat's `acceptance-record.md` table, unchanged, with the sign-off (signed or deemed) and evidence by cleared pointer only; then each `acceptance-addendum-CO-nn.md` present, with its confirmation date |
| Taking it over | where the code lives, how to run the tests, how to deploy, where the docs are, **each citing a repository path** (`README.md#tests`, `docs/deploy.md`, the CI config). With the line bought: the handover path `deliveries.yaml` records (`repo.handover_path`); with `repo: none`, the handover delivered as documents and the floor read of the repository. The last test result "as reported". The scan result; NOT-CHECKED prints "this repository has not been scanned for committed secrets" |
| Your fixes | what counts as a fix and how to report one. Before delivery: "<N> days from the day you receive these notes, until <provisional end, written out>". After delivery (a revision): the recorded end. Each change order accepted after sign-off: "<N> days from <its acceptance date>, until <its end date>" from `co-windows.yaml` |
| What happens next | from `after-offer.md`; undecided: the three options with their frozen terms, and the access-removal date (provisional before delivery) as the date to decide by |

**Takeover check.** A missing test suite, deploy instructions or developer docs is a FINDING and a **Fix** (`fix-format.md`, `reported:` the date the skill raised it, `reported_source: raised by the takeover check`), sent to the `build` destination before delivery. **Never a made-up command**: every command in the section appears verbatim in the repository file it cites.

**Exports.** `ow-tools export handoffs/<client>/handoff-notes.md --out handoffs/<client>/export/` writes `export/handoff-notes.{pdf,docx}` and `.export.json`. Without it: `export/handoff-notes.md`, a client copy with no ow- header and no internal text, and the screen says the PDF and Word documents could not be generated here. The client never gets the source Markdown.

## 3. `dates.yaml` (written once, by `/ow-handoff-delivered` only)

    ow_artefact: ow-handoff/dates
    schema: 1
    written_by: ow-handoff 1.0.1 (protocol 1)
    workstream: <client slug>
    subject: handoffs/<client>/package.yaml
    created: <YYYY-MM-DD>
    clock: <source>
    origin: skill
    delivered: Handoff notes delivered <YYYY-MM-DD>, recorded by <user>; delivery not verified by this skill
    handoff_date: <YYYY-MM-DD>
    window_end: <YYYY-MM-DD>
    access_removal_date: <YYYY-MM-DD>
    holidays: profile.md | none (weekends only)
    calc:
      - { command: "ow-tools calc date --from <handoff_date> --days <n>", output: "<as printed>" }
      - { command: "ow-tools calc date --from <window_end> --business-days -<n> --holidays <list>", output: "<as printed>" }
    moved: [planned_end, planned_removal, planned_care_start] | []
    note: This is a working note made by an AI assistant at your instruction. It is not a signature or an official record.

- `window_end` = the **later** of `planned_end` and `handoff_date` + `fix_window_days` calendar days (no `package.yaml`: `handoff_date` + N).
- `access_removal_date` = `window_end` minus the frozen lead, in **business** days.
- Without ow-tools: `calc: not machine-checked`.
- **Written once.** A second `-delivered` prints `Nothing to do: the window dates were recorded on <date>.`

## 4. `co-windows.yaml` (written by `/ow-handoff-fix` only; rows appended, never edited)

    ow_artefact: ow-handoff/co-windows
    schema: 1
    written_by: ow-handoff 1.0.1 (protocol 1)
    workstream: <client slug>
    subject: uat/<client>/acceptance-addendum-CO-nn.md
    created: <YYYY-MM-DD>
    clock: <source>
    origin: skill
    rows:
      - { co: CO-nn, accepted: <YYYY-MM-DD>, window_end: <YYYY-MM-DD>, recorded: <YYYY-MM-DD>, rec: <n> }

One row per `uat/<client>/acceptance-addendum-CO-nn.md`: `accepted` is the addendum's `confirmed:` date; `window_end` = `accepted` + the frozen `fix_window_days` calendar days. A CO's window is its own: it neither waits for delivery nor stretches to the main `window_end`. It never moves `access_removal_date`.

## 5. The three emails (client copies; skill-written HTML and text)

| File | Writer | Says |
|---|---|---|
| `export/handoff-email.{html,txt}` | `-package` | a short cover note for the Handoff notes; the fix window "until <provisional end>" |
| `export/window-correction-email.{html,txt}` | `-delivered`, only when a provisional date moved | each new date: the end, the removal (decide-by) and the care start, written out |
| `export/close-email.{html,txt}` | `-close` | `close-format.md` §3 |

Each is a client output: no credential, no internal number, no person's name, no other workstream's name, no `ow:internal` text. **This skill sends none of them**; the user sends each and says so.
