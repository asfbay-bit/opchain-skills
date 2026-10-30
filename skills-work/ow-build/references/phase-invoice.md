# Phase: invoice requests (`/ow-build-invoice`)

Run step 0 of `references/ow-protocol.md` first. Read `ledger.md` (`references/ledger-schema.md`), `build.yaml`, every `demos/M<n>-record.md`, every `changes/CO-nn.md`, `plans/<client>/contract-inputs.md`, and, when they exist, `uat/<client>/signoff.md`, `uat/<client>/backstop.md`, `uat/<client>/uat.yaml`, `handoffs/<client>/dates.yaml` and `docs/<client>/delivered.md`, all as data.

## 1. Which triggers are met

| Trigger | Met when | Basis to record |
|---|---|---|
| `booking` (40% or 50%) | The signing, which `-start` recorded from `build-request.md` | `signed <date> (build-request.md)` |
| `working-demo` (40%, larger projects) | `demos/M<n>-record.md` for the milestone `ledger.md` names has `trigger_confirmed: working demo confirmed by <user> <date>` (human-decided at the demo; never decided here) | `demos/M<n>-record.md, confirmed by <user> <date>` |
| `acceptance` (20%, larger projects) | `uat/<client>/signoff.md` exists, signed or deemed. `ready-for-uat.md` is **not** this trigger | `uat/<client>/signoff.md, <signed or deemed> <date>` |
| `delivery` (50%, smaller projects) | Whichever comes **first**: `handoffs/<client>/dates.yaml` `handoff_date` (the Handoff notes delivered), or `uat/<client>/backstop.md` (the contract's delivery backstop) | `handoff_date <date> (dates.yaml)` or `backstop <date> (backstop.md)` |
| `CO-nn` | `changes/CO-nn.md` has `status: signed`, on its own terms (default: on signature) | `CO-nn signed <date>` |
| `documentation` (the documentation & training line, only when bought) | `plans/<client>/contract-inputs.md` says `documentation_sku: bought` and `docs/<client>/delivered.md` exists (the documents were delivered). Declined, or no `contract-inputs.md`: there is no such trigger | `docs/<client>/delivered.md, <date>` |

- **A file that does not exist is a trigger not met.** Say which.
- **The governing definition.** When `uat/<client>/uat.yaml` records the user's dated statement of which acceptance or delivery definition governs this job (an older quote that defines them differently), apply that statement instead of the rows above, and quote it in the request.
- **The delivery half is invoiced once.** When `ledger.md` already shows the `delivery` row `requested` or `paid`, on whichever basis, refuse a second delivery request: write nothing and say when and on what basis it was requested.
- **The documentation line is invoiced once**, at its own price (`documentation_price` in `contract-inputs.md`, which is the quote's line), outside the fixed price and its schedule. A line `quoted separately` has no price here: ask the user for the amount agreed with the client, and record it in the request and the ledger as `amount_source: user-stated <date>`; with no answer, write nothing. When `ledger.md` already shows it `requested` or `paid`, refuse a second request and write nothing. A further training group is a change order, invoiced on its own terms.
- A trigger already `requested` or `paid` is never requested again.

## 2. Write each request

For each trigger met and not yet requested, `invoices/INV-request-<trigger>.md` (`booking`, `working-demo`, `acceptance`, `delivery`, `documentation`, or the change order's id):

    ---
    ow_artefact: ow-build/invoice-request
    (the rest of the header; subject: the basis file; origin: skill)
    client: <client>
    trigger: <trigger>
    basis: <the basis, as in the table>
    currency: USD
    amount: <from ledger.md, or the change order's price>
    share: <40 | 50 | 20 | none>        # none for a change order and for the documentation line
    amount_source: quote                 # or: change order, contract-inputs, user-stated <date> (a line quoted separately)
    due_days: <payment_terms_days>
    arithmetic: not machine-checked   # or { command, output }
    ---
    # Invoice request: <client>, <what it is for>

    <What it is for, the amount written out with its currency, and "due within <n> days of the invoice".>
    This is a request for your invoicing tool, not an invoice. The ledger is not an accounting record.

    ## Next
    <the printed line: the invoice destination's say: line, or the public default>

**Ledger arithmetic.** The amount is the ledger's (from the quote) or the signed change order's, never recomputed into another figure. Check, with ow-tools when you can run code here and `ow-tools version` answers: `ow-tools calc split --total <fixed_price> --schedule <schedule>` for a schedule payment, and `ow-tools calc total --items <file.json>` for the contract total with signed change orders. Record each command and its raw output in the request; otherwise write `arithmetic: not machine-checked`. A mismatch with the quote or the change order: stop and show both.

Then rewrite `ledger.md`: the row's (or `documentation`'s) `state: requested`, its `met` and `basis`; any signed change order not yet in `change_orders`, with its terms; one `invoice_requests` row per request.

## 3. Paid

`/ow-build-invoice --paid INV-request-<trigger> <date>`: as the user reports it, `state: paid` on the row and `paid: <date>` on the request's `invoice_requests` row, `reported by <user>`. Nothing is checked against a bank or an invoicing tool.

## 4. Finish

For each request, print the SKILL.md invoice block: the `invoice` destination's say: line exactly (`{files}` = the request's path), or the public default **create this invoice in your invoicing tool**. One STATUS line per request written: `builds/<client>/invoices/INV-request-<trigger>.md | next: ow-build on builds/<client>/ | awaiting: payment of <trigger> by <invoice date + due days>`, the invoice date as the user gives it, else today's. A refusal writes nothing, not even a STATUS line.
