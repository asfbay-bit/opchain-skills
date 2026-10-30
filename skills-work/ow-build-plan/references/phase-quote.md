# Phase: quote (`/ow-build-plan-quote`, `--quick`, `--quick --onboarding`, `--accepted <date>`, `--signed <date>`)

Run step 0 of `references/ow-protocol.md` first. Every price comes from the user's `price-book.yaml` (`references/price-book-schema.md`) or from the user, recorded as theirs. **This skill never estimates a price.**

## 1. Which mode

| Call | Needs | Writes |
|---|---|---|
| `/ow-build-plan-quote` | `plan.yaml`, `scope.md`, `acceptance.md`, `risks.md`, `evidence.md` | `quote.md`, `quote-items.json` |
| `/ow-build-plan-quote --quick` | `intake/<client>/intake-record.md` (or a written request) | `quick-scope.md`, `quote.md`, `quote-items.json` |
| `/ow-build-plan-quote --quick --onboarding` | the same, with a recap whose `path_kind` is `care-takeover` | `quick-scope.md`, `quote.md`, `quote-items.json` (§3.2) |
| `/ow-build-plan-quote --accepted <date>` | `quote.md` | `contract-inputs.md` |
| `/ow-build-plan-quote --signed <date>` | `quote.md` and `contract-inputs.md` | `build-request.md` |

A missing input: say which file and offer the verb that writes it. Never continue as if it existed.

**A quote is written once.** Before `-quote` or `--quick` writes anything, look in the folder:

- `quote.md` exists and the client has accepted it (`contract-inputs.md` exists), or it has been exported (`export/quote.*` or an export line in `STATUS.md`): **refuse to write `quote.md` or `quote-items.json`.** Say the quote is done and offer the next step instead: `--accepted <date>` if no `contract-inputs.md` exists, `--signed <date>` if no `build-request.md` exists.
- If the user wants a different quote after that, there is no second quote in this folder: say that a different quote is a new Build Plan or a follow-on (`-offer` or `-start` in a new `plans/<client>-<n>/` folder), and stop. This skill never writes a second quote file, and never rewrites an exported or accepted quote.
- `quote.md` exists but was never exported or accepted: say so, show its date, and ask before writing over it.

## 2. Price the work (`-quote` and `--quick`)

1. **Lines.** For each work package, list the price-book units it consists of, each with a quantity and a one-line reason. A unit id that is not in the price book is not a unit.
2. **A package with no matching unit stops the quote.** Say which package, and ask the user to price it. Record their answer on that line exactly as `priced by <user name>, <date>, reason: <their words>`. Never suggest a number.
3. **Modifiers** apply only through their written `when`, citing the `evidence.md` row that shows the condition: `data-messy: evidence.md E-07 "we fix the codes by hand every Monday"`. The quoted words must be in that row. No row, no modifier; tell the user which modifier was considered and why it does not apply. In the pricing lines, a `multiply` modifier is written on the line it changes (`data-messy x1.25`); an `add_unit` modifier adds its own line, with the added unit and `<modifier id> adds` in the modifier column (`data-sensitive adds`).
4. **The build's size** is the largest `size` among the product units on the quote; with none, ask the user (`build_size_source: user-stated`).
5. **User acceptance testing · <size>** (required). Tester roles come from `scope.md` (or `quick-scope.md`) `## UAT approach`, by role name. Price = size price + `per_extra_role` × (roles − included roles, when more).
6. **Documentation & training · <size>** (optional, recommended). Ask how many people will be trained. Up to 15: the size price; each further group of up to 15: `per_extra_group_of_15`; above `quote_separately_above`: "quoted separately", no price.
7. **Arithmetic.** Write `plans/<client>/quote-items.json` (the build lines and the testing line, as `[{ "label", "quantity", "unit_price" } | { "label", "amount" }]`). If you can run code here and `ow-tools version` answers, run `ow-tools calc total --items plans/<client>/quote-items.json --currency <currency>` and `ow-tools calc split --total <fixed price> --schedule <40/40/20 or 50/50>`, and record each command and its raw output in the internal appendix. Otherwise write `arithmetic not machine-checked` in the header and the appendix, and ask the user to check the sums.
8. **Fixed price** = build lines + the testing line. Documentation & training is not in it: it is its own line.
9. **Payment schedule.** Fixed price at or above `size_threshold`: 40% to book · 40% at the working demo · 20% at acceptance. Below it: 50% to book · 50% at delivery. Shares that do not divide evenly put the remainder on the last payment. Invoices due in `payment_terms_days`. The schedule covers the fixed price. Documentation & training is outside it: when taken, it is **invoiced when the documents are delivered**, and the payment terms say so.
10. **Dates.** `issued` from the protocol's ladder; `valid_until` = issued + `quote_validity_days`. Build Plan mode only: `credit_deadline` = `plan.yaml` `plan_delivery` + `build_plan_credit_days`, and the credit line names the fee from `plan.yaml`. A plan on signed work (`fee: none`) has no credit line and no `credit_deadline`. Through `ow-tools calc date` when it answers, recorded; otherwise marked not machine-checked.
11. **Fix window.** `fix_window_days` from `offers.md` → `after_handoff`; rendered "<N> days of fixes". No value: ask the user and record `fix_window_source: user-stated`.
12. **Milestones**, each ending in a **working demo**, by work package; plus a written update each week.
13. **Vendor subscriptions** the build needs, by name, from the map's systems; ask the user to confirm. Billed directly to the client, without a markup.

## 3. Quick quote (`--quick`)

For one small, defined job (the recap's `path_kind: defined-work`, or the user says so). A feasibility test (`path_kind: feasibility`) also runs as `--quick`, with the differences in §3.1. It skips the offer, the collection and the map.

1. Read the intake record. Draft the work packages and their units (§2.1).
2. **Count the units** (the sum of quantities on the build lines). Above `quick_quote_max_units`: write **no** quote and no scope. Say the job needs <n> units and the limit is <max>, recommend a Build Plan, append the STATUS line in §8 and print the refusal NEXT block from SKILL.md.
3. Ask which roles will test, by role name; never default the number, and never record a person's name.
4. Write `quick-scope.md` (header `ow_artefact: ow-build-plan/quick-scope`, `subject:` the intake record, and `handling`, the step 0 answer, since no `plan.yaml` exists):

        # Scope: <client>
        ## In scope
        ### WP-1 <name>
        - what changes: …
        ## Out of scope
        - … (at least one line)
        ## Acceptance checks
        ### AC-1.1
        (the six keys of references/acceptance-check-format.md)
        ## UAT approach
        - tester roles: <role names>
        - test mix: <what each role checks>

        <!-- ow:internal -->
        ## Self-checks (same-session self-check)
        Same-session self-check: the same assistant that wrote the scope, applying a checklist; a discipline, not an independent review. Agent-checked.
        | check | result |
        | --- | --- |
        | Acceptance coverage | OK |
        | Out of scope present | OK |
        <!-- ow:end-internal -->

   Run the two self-checks the scope phase runs, as it defines them: **Acceptance coverage** (every in-scope package has at least one check, each with test data and a whole-number case count; at least one `kind: error` check) and **Out of scope present**. Write them inside the `ow:internal` markers, so the export leaves them out. Fix and run again while either is FINDING.
5. Price it (§2) and write `quote.md` with `mode: quick`. No Build Plan fee and no credit line.

### 3.1 A feasibility test (`path_kind: feasibility`)

A feasibility quote carries **just the test** (owner decision 2026-10-16): its price, what is tested, what the client gets (a findings note and a go or no-go), the payment terms and the validity. Nothing about a build.

- **Price** only from the price book's feasibility unit: the unit marked `feasibility: true` (`feasibility-test` in the example). With no such unit, the package is unpriced and §2.2 applies.
- **No** user acceptance testing line, **no** fix window, **no** documentation & training line, no milestones, no vendor subscriptions, no acceptance or delivery sentence, no Build Plan credit. Skip §2 steps 4–6 and 11–13, and step 3 of §3 (there are no testers to ask about).
- `quick-scope.md` as in §3, without `## UAT approach`. Its acceptance checks describe how the client knows the test is done (the findings note, and the cases it covers).
- `quote.md`: the header keys of §4 without `build_size`, `build_size_source`, `uat`, `documentation_training`, `fix_window_days` and `vendor_subscriptions`, and with `mode: feasibility`; `fixed_price` = the test lines. The client part:

        # Quote: <client>

        Issued <date> · valid until <date>

        ## What is tested
        <the question, on which of the client's examples, and for how long>

        ## What you get
        A findings note: what worked, what did not, on which examples. And a go or no-go: whether a build is worth doing, and why.

        ## Price
        <amount> for the test.

        ## Payment schedule
        (the table of §2.9; invoices are due within <payment_terms_days> days)

        ## Valid until
        This quote is valid until <date>.

  then the internal appendix inside the markers: pricing lines, arithmetic, and Quote integrity with rows for the feasibility unit, dates and terms, and the markers.
- `--accepted` writes the feasibility form of `contract-inputs.md` (`references/contract-inputs-schema.md`) and asks nothing about documentation & training. `--signed` writes **no** `build-request.md` and prints **no** ow-build NEXT: see §6.

### 3.2 A care takeover's onboarding review (`--quick --onboarding`)

Amendment P4 of the ow-care design (1.3.0). `--onboarding` is only valid with `--quick`; neither flag alone starts an onboarding quote. A `care-takeover` recap (ow-start 1.2.0) routes here (`routing-and-resume.md` §2.1). It follows §3.1's pattern: **just the review**.

- **Size and price** only from the price book's `care_onboarding` block (`references/price-book-schema.md`): count the distinct systems and integrations the intake record names (ask when the intake leaves it open; record the count), take the size whose `size_by_systems` rule holds them, and price one line at that size's fee. Record the count, the size and the rule as written. When the rule does not settle the size, ask the user to settle it; never infer a price. With no `care_onboarding` block, or a size with no fee, stop with no quote and ask. The example's fees are invented placeholders, never a client's price.
- **No** user acceptance testing line, fix window, documentation & training line, milestones, vendor subscriptions, acceptance or delivery sentence, Build Plan credit or build hand-off. No care tier subscription price is charged by this quote. The quote says it buys a review of a running system, not a build and not care.
- `quick-scope.md` holds the review's eight parts (the ow-care design §4), each a `### ` heading under `## In scope`: systems and integrations (each system, what it does, who owns the account by role, how it is deployed); the least access care would need; how it runs (alerts, run logs, backups and restore, scheduled jobs: present, missing or unknown); a health baseline; the takeover check (repository, setup, tests, deploy, rollback: found with its path, or missing); risks and unknowns with their evidence; one recommended care tier with the reasons, a recommendation and no commitment; fix-first items, each routed to care hours once care starts or to a separate quote. Then `## Out of scope` (at least one line: nothing is fixed or built, and no care starts, under this review) and `## Acceptance checks` (`### AC-1.1`: the review delivered as a document with all eight parts). No `## UAT approach`; Acceptance coverage's `kind: error` rule is waived for this form, as for a feasibility scope.
- `quote.md`: §3.1's reduced header with `mode: onboarding`, `onboarding_size: S | M | L`, `systems: <count>` and `payment: on_signature | on_delivery` (from the block); `fixed_price` = the review line. The client part is §3.1's, with `## What is reviewed` (the systems and integrations counted) and `## What you get` (the review document with its eight parts, including the recommended tier and its reasons) in place of its two middle sections; `## Price and payment` says when the fee is invoiced, as `payment` says. `quote-items.json` holds the one line.
- `--accepted` writes the onboarding form of `contract-inputs.md` (`references/contract-inputs-schema.md`) and asks nothing about documentation & training. `--signed` writes **no** `build-request.md`: see §6. The signature starts no care plan; care starts only when ow-care's `-start --takeover` records the client's chosen tier and start date after the review.

## 4. `quote.md`

The header (protocol §4, `ow_artefact: ow-build-plan/quote`, `subject:` `scope.md` or `quick-scope.md`), then these keys:

    client: <client>
    handling: "no"                      # quick mode only: the step 0 answer (a plan keeps it in plan.yaml)
    mode: build-plan | quick | feasibility | onboarding
    currency: USD
    issued: <YYYY-MM-DD>
    valid_until: <YYYY-MM-DD>
    plan_delivered: <YYYY-MM-DD>        # build-plan mode
    build_plan_fee: <amount>            # build-plan mode with a fee; left out with `fee: none`
    credit_deadline: <YYYY-MM-DD>       # build-plan mode with a fee; left out with `fee: none`
    build_size: S | M | L
    build_size_source: price-book | user-stated
    build_total: <amount>
    fixed_price: <amount>
    schedule: 40/40/20 | 50/50
    payments: [<amount>, …]
    payment_terms_days: <n>
    fix_window_days: <n>
    uat: { size: M, tester_roles: 3, included_roles: 2, sessions: 3, fix_rounds: 2, fix_business_days: 5, price: <amount> }
    documentation_training: { size: M, people: 12, price: <amount or "quoted separately">, optional: true }
    vendor_subscriptions: [<names>]
    arithmetic: ow-tools calc total | not machine-checked
    dates: ow-tools calc date | not machine-checked

A quick quote, a feasibility quote and a quote on signed work (`plan.yaml` `fee: none`) have no Build Plan credit: leave `build_plan_fee` and `credit_deadline` out of the header altogether (not `none`; only `contract-inputs.md` spells the absence as `none`).

Then the client's part. Amounts are written with the currency and two decimals; dates are written out:

    # Quote: <client>

    Issued <date> · valid until <date>

    ## What I will deliver
    | # | Work package | Includes |
    |---|---|---|
    | 1 | <package> | <the unit's includes> |

    The Build Plan sets out what is out of scope, the acceptance checks and the risks.   (quick: "The scope sets out …")

    ## User acceptance testing · <size>
    <roles> tester roles (<role names>), <sessions> sessions including the final confirmation run, up to <fix_rounds> fix rounds within <fix_business_days> business days each: <amount>.

    ## Documentation & training · <size> (optional)
    Up to 15 people trained …: <amount>. You can decline this line.

    ## Fixed price
    <amount> for the work packages and user acceptance testing. If I underestimate the agreed scope, that's on me. Additional work is written down and priced before it starts.

    ## Milestones
    1. <packages>: ends in a working demo.
    You get a written update each week.

    ## Payment schedule
    | When | Share | Amount |
    |---|---|---|
    | To book | 40% | <amount> |
    Invoices are due within <payment_terms_days> days. Documentation & training, if you take it, is invoiced when the documents are delivered.

    ## Vendor subscriptions
    Billed directly to you by each vendor, without a markup: <names>, or "None needed".

    ## Build Plan credit                       (build-plan mode with a fee only; never with `fee: none`)
    The Build Plan fee of <amount> is credited against this build if signed by <credit_deadline>.

    ## After delivery
    <N> days of fixes: for <N> days after delivery, anything in the agreed scope that does not work as its acceptance checks say is fixed at no charge.

    ## Acceptance
    The build is accepted when you sign off user acceptance testing with every acceptance check passing, or as the contract's deemed-acceptance clause provides.
    Delivery: the day the Handoff notes are delivered, or as the contract's delivery-backstop clause provides.   (only below size_threshold)

    ## Valid until
    This quote is valid until <date>.

Then the **internal appendix**, wholly between the two markers, each on a line of its own, as the last thing in the file. The ow-tools export removes everything between them; anything internal outside them is a Quote integrity FINDING. Tables inside the markers use spaced delimiters (`| --- | --- |`) so no internal line repeats a client line.

    <!-- ow:internal -->
    ## Internal appendix (not for the client)

    ### Pricing lines
    | line | package | unit | qty | unit price | modifier | amount | reason |
    | --- | --- | --- | --- | --- | --- | --- | --- |
    | L1 | WP-1 | integration | 1 | 4000.00 | data-messy x1.25 | 5000.00 | email orders into the order system |
    | L3 | WP-3 | none | 1 | none | none | 1800.00 | priced by Robin, 2026-10-26, reason: label printer driver |
    | T1 | UAT M | uat.M | 1 | 2000.00 | none | 2000.00 | 2 roles included |
    | T2 | UAT extra role | uat.per_extra_role | 1 | 250.00 | none | 250.00 | 3 tester roles |

    ### Modifiers
    | modifier | condition | lines | evidence |
    | --- | --- | --- | --- |
    | data-messy | data_condition is messy | L1 | evidence.md E-07 "we fix the codes by hand every Monday" |

    ### Rates kept internal
    - UAT extension: <amount> per extra session or fix round (client-caused overruns only)

    ### Arithmetic
    - command: ow-tools calc total --items plans/<client>/quote-items.json --currency USD
    - output: <raw JSON>
    (or: arithmetic not machine-checked)

    ### Quote integrity (same-session self-check)
    Same-session self-check: the same assistant that wrote the quote, applying a checklist; a discipline, not an independent review. Agent-checked.
    | check | result |
    | --- | --- |
    | Units or recorded manual price on every package | OK |
    | Modifiers cite evidence | OK |
    | Dates and terms match the price book | OK |
    | Testing line matches uat for the build's size | OK |
    | Fix window matches fix_window_days | OK |
    | Internal appendix inside the markers | OK |
    <!-- ow:end-internal -->

## 5. Record the acceptance (`--accepted <date>`)

1. Read `quote.md`. An acceptance date after `valid_until`: say the quote expired on that date, and continue only if the user confirms the client accepted this quote as it stands; record that. There is no new quote in this folder: if the price has to change, that is a new Build Plan or a follow-on (section 1), and you stop.
2. Ask: did the client take Documentation & training? (`bought` / `declined`; never for a feasibility quote). Either way, copy the people the line was quoted for (`quote.md` `documentation_training.people`) into `contract-inputs.md` as the top-level key `documentation_people`. Ask the parties' names as the user wants them in the contract.
3. Record, word for word: `client accepted <date>, recorded by <user name>; not verified by this skill`. Add the protocol §8 approval sentence.
4. Write `contract-inputs.md` exactly as `references/contract-inputs-schema.md` says, ending with its `## Next` section.
5. Read `handoffs.yaml`. Print the accepted NEXT block from SKILL.md. Its `NEXT:` line is, after `NEXT: `, exactly one of two things and nothing else: the `contract:` entry's `say:` line with `{files}` = `plans/<client>/contract-inputs.md`, or, with no say: line, the public default `send contract-inputs.md to whoever drafts your contracts, or fill your own SOW template from it`. Never print the words `handoffs.yaml`, never explain which one was used, and never check or name what the destination is.

## 6. Record the signing (`--signed <date>`)

1. **No `contract-inputs.md`: refuse.** Say "The acceptance is not recorded yet; run `/ow-build-plan-quote --accepted <date>` first." Write nothing and append no STATUS line.
2. Record, word for word: `client signed <date>, recorded by <user name>; not verified by this skill`, with the protocol §8 approval sentence.
   **An onboarding quote** (`mode: onboarding`): write nothing. There is no build to hand over: the next thing is the review. Append the onboarding STATUS line (§8) and print the onboarding signed NEXT block from SKILL.md (`use ow-care to onboard plans/<client>/`). Steps 3 and 4 do not apply. A signed onboarding quote is never routed to ow-build and never re-quoted in the same folder.

   **A feasibility quote** (`mode: feasibility`): write nothing. There is no build to hand over: the next thing the client receives is the findings note. Append the feasibility STATUS line (§8) and print the feasibility signed NEXT block from SKILL.md (on a go, a Build Plan offer: "use ow-build-plan to write the offer for plans/<client>/"). Steps 3 and 4 do not apply.
3. Write `build-request.md` **from the plan, not the quote**: no price, fee or rate anywhere in it. Header (`ow_artefact: ow-build-plan/build-request`, `subject: plans/<client>/scope.md` or `quick-scope.md`, keys `client`, `signed`, `signing_note`), then:

        # Build request: <client>
        Signed <date written out>. This comes from the scope (the Build Plan, or the quick scope), not the quote.
        ## What to build            (the work packages, in plain words)
        ## How the client will check it   (acceptance.md or quick-scope.md, by reference, with the AC ids)
        ## Systems and data
        ## Out of scope
        ## Client dependencies
        ## Milestones               (each ends in a working demo)
        ## User acceptance testing  (size, tester roles, sessions, fix rounds and days; no price)
        ## Next
        (the signed NEXT block, filled in, as printed)
        Give this file to whoever builds it.

4. Print the signed NEXT block from SKILL.md. Its `IF IT IS NOT AVAILABLE:` line is, after the colon, exactly the `build:` say line with `{files}` = `plans/<client>/build-request.md`, or, with none, `give build-request.md to whoever builds it`. Nothing else goes on that line.

## 7. The NEXT text in files

The `## Next` sections of `contract-inputs.md` and `build-request.md` hold the same lines the session prints, filled in. A `say:` line from `handoffs.yaml` is the only text in them that comes from the user's file; nothing else names a destination.

## 8. STATUS

Append one line per run (protocol §5), with these fields after the date and `ow-build-plan 1.3.0`:

- `-quote`: path `plans/<client>/quote.md`; `next: ow-build-plan /ow-build-plan-export plans/<client>/`; `awaiting: client's answer by <valid_until>; Build Plan credit by <credit_deadline>` (quick mode, or a plan with `fee: none`: the first part only, `awaiting: client's answer by <valid_until>`).
- `--quick` refused: path `intake/<client>/intake-record.md`; `next: ow-build-plan /ow-build-plan-offer intake/<client>/intake-record.md`; `awaiting: none`.
- `--accepted`: path `plans/<client>/contract-inputs.md`; `next: ow-build-plan /ow-build-plan-quote plans/<client>/`; `awaiting: signing for the Build Plan credit by <credit_deadline>` (quick mode, or a plan with `fee: none`: `awaiting: none`).
- `--signed`: path `plans/<client>/build-request.md`; `next: ow-build /ow-build-start plans/<client>/`; `awaiting: none`.
- `--signed` on a feasibility quote: path `plans/<client>/contract-inputs.md`; `next: ow-build-plan /ow-build-plan-offer plans/<client>/`; `awaiting: none`.
- `--signed` on an onboarding quote: path `plans/<client>/contract-inputs.md`; `next: ow-care /ow-care-onboard plans/<client>/`; `awaiting: none`.
- `--signed` refused: no line.
