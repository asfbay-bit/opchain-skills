# `contract-inputs.md` (schema 1)

Written only by `/ow-build-plan-quote --accepted <date>`. It holds what any contract needs and nothing tool-specific, for whoever drafts the contract; the later stages (acceptance testing, the handoff) read it too. **It is contract input, not a contract**, and it says so.

The header carries the machine-readable keys; the body says the same in plain words. Copy values from `quote.md` and the user's files; never compute a new price here.

    ---
    ow_artefact: ow-build-plan/contract-inputs
    schema: 1
    written_by: ow-build-plan 1.3.0 (protocol 1)
    workstream: <slug>
    subject: plans/<client>/quote.md
    created: <YYYY-MM-DD>
    clock: <source>
    origin: skill
    client: <client>
    accepted: <YYYY-MM-DD>
    acceptance_note: client accepted <date>, recorded by <user name>; not verified by this skill
    parties: { client: <as the user supplies it>, provider: <as the user supplies it> }
    quote: plans/<client>/quote.md
    scope: plans/<client>/scope.md                 # or quick-scope.md
    acceptance_checks: plans/<client>/acceptance.md   # or quick-scope.md
    currency: USD
    fixed_price: <amount>
    schedule: 40/40/20 | 50/50
    payments: [<amount>, …]
    payment_terms_days: <n>
    valid_until: <YYYY-MM-DD>
    credit_deadline: <YYYY-MM-DD>                  # the quote's, when it has a Build Plan credit; else none
    build_plan_fee: <amount>                       # the quote's, when it has a Build Plan credit; else none
    fix_window_days: <n>
    fix_window_wording: <n> days of fixes
    uat: { size: M, tester_roles: [<role>, …], test_mix: <text>, sessions: <n>, fix_rounds: <n>, fix_business_days: <n>, price: <amount> }
    documentation_sku: bought | declined
    documentation_price: <amount, "quoted separately", or none>
    documentation_people: <n>                      # quote.md documentation_training.people, bought or declined
    acceptance_definition: <the quote's acceptance sentence>
    delivery_definition: <the quote's delivery sentence, or none above size_threshold>
    contract_clauses: not set                      # or the block below, copied unchanged from offers.md
    vendor_subscriptions: [<names>]
    ---

**`documentation_people`** is the people count the documentation line was quoted for, copied from `quote.md` `documentation_training.people` whether the line was bought or declined. It is a top-level key of its own, **never nested under `documentation_sku`**: acceptance testing digests the `documentation_sku` line with its indented lines, so a key nested there would change that digest.

**The Build Plan credit** is copied from the quote, never worked out here. Only a Build Plan quote on a plan with a fee has one. A quick quote, or a plan on signed work (`plan.yaml` `fee: none`, delivery mode), has none: write `credit_deadline: none` and `build_plan_fee: none`, and say nothing about a credit in the body. (A feasibility test leaves both keys out; see the last section.)

`contract_clauses`, when `offers.md` has the block (the user adds it once their contract step has drafted the standard clauses):

    contract_clauses:
      deemed_acceptance: { ref: <clause ref>, business_days: <n>, calendar: <name>, wording: "<text>" }
      delivery_backstop: { ref: <clause ref>, business_days: <n>, calendar: <name>, wording: "<text>" }

Copy it unchanged; never draft, shorten or reword a clause. With no block, write `contract_clauses: not set` and, in the body, "Contract clauses: not set."

## Body

    # Contract inputs: <client>

    This is contract input, not a contract. It records what was quoted and accepted, for whoever drafts the contract.
    Client accepted <date>, recorded by <user name>; not verified by this skill. This is a working note made by an AI assistant at your instruction. It is not a signature or an official record.

    ## Parties
    ## What is agreed          (the scope and acceptance checks, by file and id; not copied)
    ## Price and payment       (fixed price, milestones each ending in a working demo, schedule, due days; documentation & training, when taken, invoiced when the documents are delivered)
    ## Change rule             (the quote's sentence, unchanged)
    ## Dates                   (valid until; the Build Plan credit deadline only when the quote has one)
    ## Ownership               (offers.md `ownership` text, or the plan's Ownership section)
    ## Vendor subscriptions    (billed directly to the client, without a markup)
    ## After delivery          (<n> days of fixes, and what that covers)
    ## User acceptance testing (size, tester roles by role, test mix, sessions, fix rounds and days)
    ## Documentation & training (bought or declined, as the user recorded the client's choice; the people quoted; invoiced when the documents are delivered)
    ## Acceptance and delivery (the two definitions, word for word)
    ## Contract clauses        (the block, or "not set")
    ## Next
    (the accepted NEXT block as printed: its NEXT: line is the contract say: line exactly, with {files} filled, or the public default, and nothing else; then the IF IT IS NOT AVAILABLE and signing lines)

## A feasibility quote (`mode: feasibility`)

`contract-inputs.md` for a feasibility test holds just the test (owner decision 2026-10-16). Header keys: the protocol header, then `client`, `mode: feasibility`, `accepted`, `acceptance_note`, `parties`, `quote`, `scope` (`plans/<client>/quick-scope.md`), `currency`, `fixed_price`, `schedule`, `payments`, `payment_terms_days`, `valid_until`, `deliverables: [findings note, go or no-go]` and `contract_clauses`. **None of** `fix_window_days`, `fix_window_wording`, `uat`, `documentation_sku`, `documentation_price`, `documentation_people`, `acceptance_definition`, `delivery_definition`, `vendor_subscriptions`, `credit_deadline` or `build_plan_fee`.

Body sections: `## Parties`, `## What is tested` (by reference to `quick-scope.md`), `## What you get` (the findings note and the go or no-go), `## Price and payment`, `## Dates` (valid until), `## Contract clauses`, `## Next` (the accepted NEXT block, as for any quote).

Rules: no unit price, modifier or internal rate (they stay in `quote.md`'s internal appendix); people by role, never by name, apart from the parties; dates written out in the body.

## An onboarding review quote (`mode: onboarding`)

The feasibility form's sibling (amendment P4, 1.3.0): just the review. Header keys as the feasibility form, with `mode: onboarding`, `onboarding_size: S | M | L`, `payment: on_signature | on_delivery` (from the quote) and `deliverables: [onboarding review, health baseline, first operator notes, recommended care tier]`; the same build keys are left out, and `scope` is `plans/<client>/quick-scope.md`. Body sections: `## Parties`, `## What is reviewed` (by reference to `quick-scope.md`), `## What you get` (the review's eight parts, delivered as a document), `## Price and payment`, `## Dates`, `## Contract clauses`, `## Next` (the onboarding signed NEXT block: `use ow-care to onboard plans/<client>/`). The same rules apply. It is input for a contract, never a contract or evidence of a signed one, and no care tier is sold by it.
