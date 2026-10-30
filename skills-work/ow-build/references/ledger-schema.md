# `ledger.md` (schema 1)

`builds/<client>/ledger.md` holds the payment schedule from the signed quote, each payment trigger's state, the signed change orders that carry a price, and every invoice request. **`-start` creates it; after that `-invoice` is its only writer**, so the state of a payment changes in one place. Every verb reads it first.

**The ledger is not an accounting record**: it records what the quote says and what you report (sent, paid). It says so in its first line.

    ---
    ow_artefact: ow-build/ledger
    schema: 1
    written_by: ow-build 1.0.0 (protocol 1)
    workstream: <slug>
    subject: plans/<slug>/quote.md
    created: <YYYY-MM-DD>
    clock: <source>
    origin: skill
    client: <client>
    currency: USD                        # from quote.md
    fixed_price: 17450.00                # from quote.md
    schedule: 40/40/20                   # 40/40/20 (larger) or 50/50 (smaller), from quote.md
    payment_terms_days: 14               # from quote.md: invoices due within N days
    working_demo: M1                     # 40/40/20 only: whose demo is the working-demo payment
    working_demo_source: user-stated 2026-11-10   # or "quote" when the quote has one milestone
    payments:
      - { trigger: booking, share: 40, amount: 6980.00, state: due, met: 2026-11-09, basis: signed 2026-11-09 (build-request.md) }
      - { trigger: working-demo, share: 40, amount: 6980.00, state: not met }
      - { trigger: acceptance, share: 20, amount: 3490.00, state: not met }
    documentation: { sku: bought, amount: 4000.00, state: not met }   # or: documentation: none (declined, or no contract-inputs.md)
    change_orders: []                    # { id: CO-nn, amount, terms: on signature, signed: <date>, state }
    invoice_requests: []                 # { file, trigger, amount, written: <date>, paid: <date> | none }
    arithmetic:                          # or: arithmetic: not machine-checked
      command: ow-tools calc split --total 17450.00 --schedule 40/40/20
      output: '{"total":"17450.00","schedule":"40/40/20","amounts":["6980.00","6980.00","3490.00"]}'
    ---
    # Ledger: <client>

    This is not an accounting record. It holds the payment schedule from the signed quote, the signed change orders and the invoice requests, with what you report about them.

    ## Payments
    | trigger | share | amount | state |
    |---|---|---|---|
    ...

    ## Change orders
    ## Invoice requests

## Triggers

| `schedule` | `trigger` rows, in order |
|---|---|
| 40/40/20 | `booking` 40 · `working-demo` 40 · `acceptance` 20 |
| 50/50 | `booking` 50 · `delivery` 50 |

`amount` is copied from the quote's `payments`, never recomputed into something else. `state` moves `not met` → `due` (the trigger is met; `met` and `basis` say when and from which file) → `requested` (an `INV-request-<trigger>.md` exists) → `paid` (as you report it, with the date). A signed change order is added to `change_orders` by `-invoice`, with its own terms (on signature, unless the change order says otherwise).

## The documentation & training line

When `contract-inputs.md` says `documentation_sku: bought`, `-start` copies the line into `documentation` with its price (`documentation_price`, the quote's line); a line `quoted separately` is copied as `amount: none (quoted separately)`, and `-invoice` asks the agreed amount and records it `user-stated`. It sits outside the fixed price and its schedule, and has one trigger: the documents delivered (`docs/<client>/delivered.md`), invoiced once. Declined, or no `contract-inputs.md`: `documentation: none`, and there is no such trigger.

## The working-demo payment (40/40/20)

The quote has one working-demo payment. When its Milestones list has one milestone, that milestone's demo is it (`working_demo_source: quote`). When it has more than one, `-start` asks you which milestone's demo the payment follows and records the answer `user-stated` with its date. The quote does not say, so this skill never picks one.

## Arithmetic

At `-start`, check that the payments add up to `fixed_price` and match the schedule: with ow-tools, `ow-tools calc split --total <fixed_price> --schedule <schedule>` and record the command and raw output; otherwise add by hand and write `arithmetic: not machine-checked`. `-invoice` does the same for the contract total with change orders (`calc total --items <file.json>`) and records it in the request.

## Never here

Hours, rates, margin, unit prices or the builder's name. The quote's internal appendix stays in `quote.md`.
