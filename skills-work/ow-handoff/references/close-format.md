# Close: `close.md`, `close-addendum-<date>.md`, `care-start.md`, `care-start-addendum-<date>.md`, the close email

Written by `/ow-handoff-close` only. `close.md` and `care-start.md` are written **once**, by the first close; a close after reopening writes the addenda and never touches them.

## 1. The blockers (`-close` refuses while any holds, naming each)

`Refused: close is blocked.`, then one line per blocker, in these forms, then `Nothing was written.`:

    - the window dates are not recorded
    - the fix window ends on <YYYY-MM-DD>
    - CO-nn's fix period ends on <YYYY-MM-DD>
    - CO-nn's addendum has no row in co-windows.yaml
    - FIX-nn is <open | sent | fixed>
    - HELP-nn is at <go-ahead | hours recorded>
    - transfer TR-nn is <open | client has owner rights>
    - <What> is below HIGH and not confirmed
    - access item AX-nn is <open | held for X>
    - access item AX-nn is kept for care, but the choice is <hourly | none | undecided>

- Today must be **after** `window_end` and after the latest `window_end` in `co-windows.yaml`; between `access_removal_date` and `window_end` is still before.
- A covered FIX-nn not terminal blocks, unless the choice is care **and** the newest ow-care answer is `installed`: then it carries into care, free, its held access converted to kept for care ending "remove when FIX-nn is verified".
- A post-acceptance CO not accepted yet does not block: `close.md` lists it as "not yet accepted; its own fix period starts on its acceptance date".
- **Waivers at close** are only the ones the owning verbs recorded (`-accounts`, `-access`, `-fix`); a waiver typed at `-close` is refused: `Refused: a waiver at close covers only the items the owning verbs record.`

## 2. `close.md` (and `close-addendum-<date>.md`)

    ---
    ow_artefact: ow-handoff/close | ow-handoff/close-addendum
    … the protocol header …
    closed: <YYYY-MM-DD>
    branch: care-installed | care-not-installed | hourly | none | undecided
    ow_care: installed | not installed (<source> <YYYY-MM-DD>) | not asked (no care)
    close_steps:
      - { step: blockers, rec: <n>, date: <YYYY-MM-DD> }
    ---
    # Close: <Client>
    ## Fixes            each with its re-check ("re-checked after handoff"); withdrawn, reclassified and closed-unconfirmed listed as such
    ## Transfers        each done, quoting its confirmation as recorded; waived ones as open
    ## Access           removed or kept for care, each confirmation as recorded; waived as open
    ## Hourly help      each HELP-nn and its state
    ## Payments         each payment's state as ledger.md records it (requested, paid, not recorded), never an amount; absent: "payment status not recorded"
    ## Arrangement      the choice with its frozen terms; undecided: "no choice recorded, treated as no ongoing arrangement"
    ## Waivers          every waiver the owning verbs recorded, with its dates
    ## Not yet accepted
    ## Self-checks

## 3. The four branches

| Branch | Then |
|---|---|
| **care, ow-care installed** | Stays open under ow-care. `care-start.md` written; NEXT `use ow-care on handoffs/<client>/care-start.md` |
| **care, ow-care not installed** | Closed. Kept items listed in `close.md` and the email as `kept for care, owner: <user>` with their removal steps; STATUS keeps `awaiting: kept access review <care start + 1 month>` after the closed line. `care-start.md` written for later; the NEXT's `IF IT IS NOT AVAILABLE` line says the kept items stay with the user. **Nothing promises care will act** |
| **hourly** | Closed; `-fix` keeps taking hourly-help requests |
| **none or undecided** | Closed; undecided records "no choice recorded, treated as no ongoing arrangement" |

## 4. `care-start.md` (and `care-start-addendum-<date>.md`): what ow-care reads

    ---
    ow_artefact: ow-handoff/care-start
    … the protocol header …
    care_start: <YYYY-MM-DD>
    tier: <name, as frozen>
    reply_business_days: <as frozen>
    terms: after-offer.md (frozen <YYYY-MM-DD>)
    window_end: <YYYY-MM-DD>
    ---
    # Care start: <Client>
    ## Frozen terms          every term as after-offer.md froze it (tier, hours, reply target, billing, rollover and its wording, notice, exclusions, hourly price, urgent price)
    ## Kept access           each kept item, its removal step, "remove when care ends"
    ## Carried fixes         each FIX-nn carried in free, with its held access ending "remove when FIX-nn is verified"
    ## Waiting requests      each FIX-nn with route: care
    ## Operator notes        the OP-nn ids in operator-notes.md
    ## Accounts              account rows by role (no logins)
    ## Care chosen after the removal date   when it applies: "access was removed on <date>; care re-grants what it needs"

## 5. The close email (`export/close-email.{html,txt}`)

The client copy of `close.md`: fixes, transfers, access, hourly help, payments by state, the arrangement and its frozen terms, every waived or unconfirmed item **shown as open or unconfirmed**, by name: a waived transfer or account row, an access item removed unconfirmed (waived), a fix closed unconfirmed, and an access item removed while its transfer is waived. No internal number: HELP-nn hours and ledger amounts stay out. The user sends it.

## 6. Reopening

A report the client sent on or before the relevant window end that arrives after close is still covered: `-fix` logs it and STATUS gains `awaiting: FIX-nn (covered, reported <date>) after close`; the workstream is reopened. `-close --reopened` runs when it ends and writes `close-addendum-<date>.md`, a new close email (`export/close-email-<date>.{html,txt}`) and, when needed, `care-start-addendum-<date>.md`.
