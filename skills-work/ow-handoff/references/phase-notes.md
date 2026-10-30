# Phase: `/ow-handoff-notes` (and `--walkthrough <date>`)

Writes `handoffs/<client>/operator-notes.md` (`operator-notes-format.md`). Re-running it rewrites the notes; it is how a FINDING on them clears.

## 1. Entry

- No `handoff.yaml` `frozen:`: `Refused: the handoff is not started.` and the start NEXT.
- No `accounts.md`: `Refused: accounts.md is missing.`, `Nothing was written.`, and the accounts NEXT. Rotate entries must exist before delivery, so the notes wait for the accounts.
- **The line bought** (`handoff.yaml` `documentation_sku: bought`) and no `docs/<client>/delivered.md`: `Refused: the documents are not delivered yet.`, `Nothing was written.`, and the NEXT `use ow-documentation-delivered on docs/<client>/`. One form per state: no floor is written to be replaced.

## 2. Steps

### `/ow-handoff-notes`

1. **`sources`**: read what the form needs. **Floor**: the builder's docs (`doc_paths`), `acceptance-record.md` and each addendum, the alert and run-log setup in the repository, the services the user confirms ("alerts configured in <service>: <list> | none"), and the user's notes. **Index** (the line bought and delivered): `docs/<client>/runbook.md` (its `ops:` and each `OP-nn` title), `docs.yaml`, `deliveries.yaml`, `delivered.md`.
2. **`entries`**: the operator tasks in the form `operator-notes-format.md` §3 gives.
3. **`rotate`**: one rotate entry per secret in `accounts.md` and in every `secrets-seen.log` read, ids continuing after the highest in use.
4. **`coverage`**: Operator-task coverage, against the runbook when the line was bought; a gap in an included item is a FINDING whose resolution is a Fix (`use ow-handoff-fix on handoffs/<client>/`).

### `/ow-handoff-notes --walkthrough <date>`

1. **`record`**: append the walk-through line under `## Walk-through`.

## 3. Screen

    DONE: operator notes -> handoffs/<client>/operator-notes.md (<n> entries, <floor | index>)

then the self-check line and the package NEXT (a coverage FINDING: the fix NEXT first).
