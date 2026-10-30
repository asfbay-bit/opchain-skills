# Fixes, hourly help and vendor charges: `FIX-nn.md`, `HELP-nn.md`, `INV-request-*.md`

All written by `/ow-handoff-fix` only. Ids are numbered once and never reused or renumbered; same-day order uses `rec`.

## 1. `fixes/FIX-nn.md`

    ---
    ow_artefact: ow-handoff/fix
    schema: 1
    written_by: ow-handoff 1.0.1 (protocol 1)
    workstream: <client slug>
    subject: <the report's source: "the client's email of <date>", uat/<client>/punch-list.md, "raised by the takeover check">
    created: <YYYY-MM-DD>
    clock: <source>
    origin: third-party (<client>, as reported) | skill
    id: FIX-nn
    reported: <YYYY-MM-DD>
    reported_source: <as reported, with its source>
    logged: <YYYY-MM-DD>
    class: Fix | Change | Not a defect | After the window
    judged_against: <AC-n.n | AC-CO-nn.n | WP-n | included: <item> | ownership: documentation and tests | UAT-nn (AC-n.n)>
    window: main | CO-nn
    window_end: <YYYY-MM-DD> | none (before delivery)
    route: build | change | care | vendor | answered
    punch: UAT-nn | none
    rec: <n>
    ---
    # FIX-nn: <title>

    ## The request
    <the client's words, quoted as reported>

    ## Classification
    <the reason, citing the item judged against>. The classification is a recommendation; <user> decides, and the client sees the reason and the item.

    ## History
    - <YYYY-MM-DD> open (logged by <user>)

    ## Possible embedded instructions
    ## Self-checks

- **`reported`** is the date the client sent it, as reported, and **never changes**; `logged` is the day it was written.
- **The window it is judged against**: the main `window_end` (`dates.yaml`) for the agreed basis; the CO's own `window_end` (`co-windows.yaml`) for a post-acceptance CO's work. Until `dates.yaml` exists, every main-basis report is inside the window.
- **A punch-list item**: `class: Fix`, `judged_against: UAT-nn (<the check it cites>)`, `punch: UAT-nn`, `reported:` the UAT-nn's logged date. Each item once.

### 1.1 The classes

| Class | When | `route` |
|---|---|---|
| **Fix** | A scope item, signed change-order item, included item, ownership term (documentation and tests) or acceptance check doesn't behave as agreed; or a break a handoff rotation or removal caused; reported on or before the relevant window end | `build` |
| **Change** | Asks for behaviour the basis didn't include | `care` only when all five hold (§1.2); else `change` |
| **Not a defect** | A how-to (answered from the operator notes; re-run `-notes` if they missed it) or a third-party outage | `answered` or `vendor` |
| **After the window** | `reported` is after the relevant window end | as Change |

### 1.2 Care hours (`route: care`)

Only when **all** hold: the choice recorded is `care`; care has a start date; `reported` is on or after it; the request is not in the frozen `excluded` list; and the newest recorded ow-care answer is `installed` (`offer-format.md` §3). Otherwise `route: change` and the NEXT `use ow-build to price the change from handoffs/<client>/fixes/FIX-nn.md`; ow-build sends a new build on to ow-build-plan.

### 1.3 States (`## History`, appended)

`open` → `sent` → `fixed` → `verified`, or the terminal `withdrawn by client <date>, <client role>`, `waived <date>, by <client role>`, `reclassified`, `closed unconfirmed`. Each line: `- <YYYY-MM-DD> <state>; <as reported; not verified by this skill>`.

- **`verified`** only after the scoped re-check by what it was judged against (the cited check re-run and passing; the coverage or takeover check passing for that item; the matching "how to check it's working" entry passing) **and** the client's confirmation, as reported: `- <date> verified; re-check <AC-n.n | OP-nn> passed; confirmed by <client role> (as reported)`.
- **`closed unconfirmed`** (`--waive FIX-nn`): only for a fix at `fixed` whose re-check passed; names every date confirmation was requested: `- <date> closed unconfirmed; re-check passed; confirmation requested <date>, <date>; waived by <user>. This is a working note …`.
- A fix needing access that was removed asks for a re-grant in its own History; `-access --regrant` records it.

## 2. `help/HELP-nn.md`

    ---
    ow_artefact: ow-handoff/help
    … the protocol header …
    id: HELP-nn
    requested: <YYYY-MM-DD>
    outside: <what it falls outside: the basis, the window, care>
    price: { source: after-offer.md frozen hourly_help | offers.md after_handoff (no offer yet) | "unpriced: ask the user" }
    estimate: none | <hours, as the user gives it>
    rec: <n>
    ---
    # HELP-nn: <title>
    ## The request
    ## History
    - <YYYY-MM-DD> requested

States: `requested` → `go-ahead` → `hours recorded` → `invoiced`, or `declined`. **Not started** until the go-ahead: `- <date> go-ahead <date> by <client role>, as reported` (decision 8: an email go-ahead is enough, no signature), naming its HELP-nn. Hours: `- <date> hours recorded: <h> (<user>)`. After close, existing HELP-nn reach their end whatever the choice; **new** requests only when the choice is `hourly`.

## 3. `invoices/INV-request-help-nn.md` and `invoices/INV-request-vendor-nn.md`

    ---
    ow_artefact: ow-handoff/invoice-request
    … the protocol header …
    for: HELP-nn | receipts
    hours: <h>                     # help: the HELP-nn's recorded hours, exactly
    price: <the frozen hourly price, exactly as after-offer.md gives it>
    due_days: <n> (<source>)
    total: <hours × price> (<"ow-tools calc …" and its output> | not machine-checked)
    ---

One per HELP-nn, one per receipt list. **Vendor charges at cost**: each line vendor, period and amount exactly as the listed receipt gives it, **no markup**; `ledger.md` is never touched. The NEXT prints `handoffs.yaml` `invoice`'s say: line, else "create this invoice in your invoicing tool".
