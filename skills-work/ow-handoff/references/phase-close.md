# Phase: `/ow-handoff-close` (and `--reopened`)

Closes the workstream when nothing blocks (`close-format.md`).

## 1. Entry

- No `handoff.yaml` `frozen:`: `Refused: the handoff is not started.`
- A waiver typed here: `Refused: a waiver at close covers only the items the owning verbs record.`
- `close.md` exists and a covered FIX-nn reopened the workstream: the run is `--reopened`.

## 2. Steps

### `/ow-handoff-close`

1. **`blockers`**: check every blocker in `close-format.md` §1, with today's date from the time-source ladder. Any holds: `Refused: close is blocked.`, one line per blocker, `Nothing was written.`, and the NEXT of the verb that owns the first. While blocked, STATUS shows each awaiting (`awaiting: FIX-03 (covered) before close`, `awaiting: transfer TR-01 to client`).
2. **`email`**: `export/close-email.{html,txt}`.
3. **`care-start`**: when the choice is care, `care-start.md` (`close-format.md` §4), once. Ask whether ow-care is installed and record the answer with its source and date. No care: nothing is written at this step.
4. **`close`**: `close.md`, last, with its branch.

### `/ow-handoff-close --reopened`

1. **`blockers`**: as above.
2. **`email`**: `export/close-email-<date>.{html,txt}`.
3. **`care-start-addendum`**: `care-start-addendum-<date>.md`, when care was chosen.
4. **`close-addendum`**: `close-addendum-<date>.md`, last. `close.md` and `care-start.md` are never touched.

## 3. NEXT

    DONE: closed <date> -> handoffs/<client>/close.md (<branch>)

then the self-check line, and: care with ow-care installed, `use ow-care on handoffs/<client>/care-start.md`; care without ow-care, the same NEXT with its `IF IT IS NOT AVAILABLE` line (the kept items stay with you; review them by the date in STATUS), and nothing promised; hourly, none or undecided: `NEXT: none (closed: <branch>)`.
