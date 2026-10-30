# Phase: `/ow-handoff-fix` (every mode)

Logs, classifies and follows each report and hourly-help job to its end (`fix-format.md`). It alone writes `co-windows.yaml`. Every mode runs `windows` first.

## 1. Entry

- No `handoff.yaml` `frozen:`: `Refused: the handoff is not started.`
- A basis mismatch is open (`routing-and-resume.md` §1.4): `Refused: the agreed basis does not match uat/<client>/agreed/<file>.` and the `--keep-frozen` / `--refreeze` NEXT.
- A report against a post-acceptance CO with no `uat/<client>/acceptance-addendum-CO-nn.md`: `Refused: CO-nn has no acceptance addendum yet.`, `Nothing was written.`, and ow-uat's NEXT (`use ow-uat-defect on uat/<client>/` when the CO's addendum scenarios exist, else `use ow-uat-plan to write the addendum for CO-nn in uat/<client>/`). That CO is not accepted; nothing is logged.
- A check that runs here is FINDING: refuse, except a FINDING whose resolution is the Fix being written.

## 2. Steps

### `/ow-handoff-fix --windows` (a bare `-fix`, no report)

1. **`windows`**: append one `co-windows.yaml` row for every `acceptance-addendum-CO-nn.md` that has none (`package-and-dates.md` §4). Rows are never edited.

### `/ow-handoff-fix` (a report)

1. **`windows`**: as above.
2. **`log`**: write `fixes/FIX-nn.md`: `reported` as reported with its source, the class and the item judged against, the window (main, or the CO's own), the route (`fix-format.md` §1.1, §1.2). A report sent on or before its window end and logged after close reopens the workstream: STATUS `awaiting: FIX-nn (covered, reported <date>) after close`.

### `/ow-handoff-fix --punch`

1. **`windows`**: as above.
2. **`punch`**: one covered FIX-nn per `uat/<client>/punch-list.md` item not yet logged, in the list's order, each citing its UAT-nn and the check it cites, `reported` = the UAT-nn's logged date. Every item logged: `Nothing to do: every punch-list item is logged.`

### `/ow-handoff-fix --status FIX-nn`

1. **`windows`**. 2. **`status`**: append one state line to its `## History` (`fix-format.md` §1.3); `verified` only with the scoped re-check and the client's confirmation.

### `/ow-handoff-fix --help`, `--go-ahead HELP-nn`, `--hours HELP-nn`

- `--help`: 1. **`windows`**. 2. **`help`**: write `help/HELP-nn.md` (`requested`). After close, only when the choice is `hourly`: `Refused: new hourly help after close needs the choice hourly.`
- `--go-ahead`: 1. **`windows`**. 2. **`go-ahead`**: append the go-ahead naming its HELP-nn, date and client role, as reported.
- `--hours`: 1. **`windows`**. 2. **`hours`**: append the hours line. 3. **`invoice`**: write `invoices/INV-request-help-nn.md` at the frozen price, one per HELP-nn. Before its go-ahead: `Refused: work on HELP-nn waits for the client's go-ahead.`

### `/ow-handoff-fix --vendor`, `--waive FIX-nn`

- `--vendor`: 1. **`windows`**. 2. **`vendor`**: write `invoices/INV-request-vendor-nn.md` at cost from the listed receipts.
- `--waive`: 1. **`windows`**. 2. **`waive`**: append `closed unconfirmed`, naming every date confirmation was requested; only for a fix at `fixed` whose re-check passed.

## 3. NEXT

A Fix, approved hourly help: `handoffs.yaml` `build` with the file (public default "give {files} to whoever builds it"). A Change or After the window not routed to care: `use ow-build to price the change from handoffs/<client>/fixes/FIX-nn.md`. `route: care` after close with ow-care installed: `use ow-care on handoffs/<client>/fixes/FIX-nn.md`. Hours recorded, vendor charges: `handoffs.yaml` `invoice` (public default "create this invoice in your invoicing tool").
