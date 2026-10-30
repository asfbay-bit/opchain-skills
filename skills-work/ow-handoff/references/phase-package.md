# Phase: `/ow-handoff-package` (and `--revision` after delivery)

Writes `package.yaml`, `handoff-notes.md`, its exports and the cover email (`package-and-dates.md` §1, §2, §5).

## 1. Entry

- No `handoff.yaml` `frozen:`: `Refused: the handoff is not started.`
- No `accounts.md`: `Refused: accounts.md is missing.` and the accounts NEXT. No `operator-notes.md`: `Refused: operator-notes.md is missing.` and the notes NEXT.
- **The line bought and no `docs/<client>/delivered.md`**: `Refused: the documents are not delivered yet.`, `Nothing was written.`, and the NEXT `use ow-documentation-delivered on docs/<client>/`, with its `IF IT IS NOT AVAILABLE` line: the documents delivered by hand, and the date recorded user-stated in `handoff.yaml`. The STATUS awaiting names `docs.yaml`'s `planned_delivery`.
- A check that runs here is FINDING: `Refused: <check> is FINDING.`, the self-check line, `Nothing was written.`, and the NEXT of the file's own writer verb. **A key or a private name** in `accounts.md` or `operator-notes.md` can never be waived: it clears only when that file's writer runs again without it.
- `dates.yaml` exists: the run is `--revision`.

## 2. Steps

### `/ow-handoff-package`

1. **`notes`**: write `handoff-notes.md`, the six sections, and run the Takeover check: a missing test suite, deploy instructions or developer docs is a FINDING and a Fix written by `-fix` (the NEXT `use ow-handoff-fix on handoffs/<client>/`), never a made-up command. With the line bought, "Taking it over" cites the handover path `deliveries.yaml` records; `repo: none`: the handover was delivered as documents.
2. **`dates`**: ask the planned send date; record `planned_send`, `planned_end`, `planned_removal` and, for care with no agreed start, `planned_care_start`, each provisional, with `ow-tools calc date` and its output, or `not machine-checked`.
3. **`export`**: `ow-tools export handoffs/<client>/handoff-notes.md --out handoffs/<client>/export/`, the command and output recorded with relative paths. Without it: `export/handoff-notes.md`, the client copy, and the screen says the PDF and Word documents could not be generated here. When `handoff.yaml` `gitignore.answer` is `no`, the screen says `export/` and `secrets-seen.log` are not git-ignored here.
4. **`email`**: `export/handoff-email.{html,txt}`; when No credentials is NOT-CHECKED (a client output quotes a client's text, `self-checks.md` §2), the user's dated read-through of the notes and the email in `read_through`.

### `/ow-handoff-package --revision`

1. **`notes`**: rewrite `handoff-notes.md` with the recorded dates from `dates.yaml`.
2. **`export`**: as above.
3. **`revision`**: append one `revisions` entry. **No date moves.**

## 3. Screen

    DONE: Handoff notes -> handoffs/<client>/handoff-notes.md (provisional end <date>)

then the self-check line and the delivered NEXT. `--revision`: `DONE: revision <n> -> handoffs/<client>/package.yaml`.
