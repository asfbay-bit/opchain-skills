---
ow_artefact: ow-start/offers
schema: 1
written_by: user (created from the ow- example)
workstream: none
subject: none
created: 2026-10-06
clock: user-stated
origin: user
---
# Offers and fit: INVENTED EXAMPLE

This is an invented example, shipped the same in every ow- skill that reads it. Replace every line with your own paths and the clients you serve. ow-start reads the `fit` and `path:` sections to propose one path after each call; ow-build-plan reads `ownership`, `after_handoff` and `contract_clauses` for the plan, the quote and the contract inputs; ow-uat reads `uat` for acceptance testing; ow-handoff reads `after_handoff` for the offer after delivery. No skill edits this file. It names paths and terms; build prices live in `price-book.yaml`. The prices below, in `after_handoff`, are invented placeholders like every number there: put your own in.

Each path is a `## path: <id>` section. `kind` is one of `defined-work`, `build-plan`, `feasibility`, `care-takeover` or `not-a-fit`; `systems` is `1`, `2`, `3+` or `none`. `propose when` is what the call has to show; `after yes` is what the recap says happens next.

## fit

- Independent shops and small firms of about 3 to 40 people.
- Work that lives in everyday business software and shared spreadsheets.
- A problem the client can describe in one sentence.
- Someone on the call who can approve the next step.

## path: defined-work

- label: A defined piece of work
- kind: defined-work
- systems: none
- propose when: one clear, small job (one workflow, two tools connected, a report, a fix, a small website); the data is clean; the approach is obvious
- after yes: I send a short written scope with a fixed quote, and work starts when you sign it.

## path: build-plan-1

- label: Build Plan, 1 system
- kind: build-plan
- systems: 1
- propose when: a larger build inside one system; or the data is messy or sensitive; or the approach is not yet clear
- after yes: I send a one-page offer for the Build Plan with its fee and dates, and we start from a short list of samples you send.

## path: build-plan-2

- label: Build Plan, 2 systems
- kind: build-plan
- systems: 2
- propose when: as for 1 system, with two systems involved
- after yes: I send a one-page offer for the Build Plan with its fee and dates, and we start from a short list of samples you send.

## path: build-plan-3plus

- label: Build Plan, 3 or more systems or a new product
- kind: build-plan
- systems: 3+
- propose when: as for 1 system, with three or more systems involved, or a new product
- after yes: I send a one-page offer for the Build Plan with its fee and dates, and we start from a short list of samples you send.

## path: feasibility

- label: Feasibility check
- kind: feasibility
- systems: none
- propose when: the client's real question is whether software, or AI, could do this at all
- after yes: I send a short quote for a time-boxed test on your own examples: its price, what it tests, and what you get, a findings note with a go or no-go.

## path: care-takeover

- label: Care for an existing system
- kind: care-takeover
- systems: none
- propose when: the client wants care for a running system someone else built, with no new build in scope
- after yes: I send a fixed-fee quote for an onboarding review of the systems and access; after that review, you choose whether and when to start a care plan.

## path: not-a-fit

- label: Not the right fit
- kind: not-a-fit
- systems: none
- propose when: the client is outside the fit list above
- after yes: nothing further; say so plainly and kindly, with a suggestion of where else to look if there is one.

## ownership

The work is yours: it lives in your own repository and accounts, under your name, with your data. You receive the documentation and the tests with it.

## after_handoff

What follows delivery. ow-build-plan reads `fix_window_days` for the quote's fix window; ow-handoff reads the whole section, and freezes every term below in the client's `after-offer.md` when it makes the offer, so a later edit here changes no client's terms. Every tier name, hour count and price here is an invented placeholder: put your own in.

```yaml
fix_window_days: 30                    # the quote prints "30 days of fixes"; the signed terms win later
access_removal_lead_business_days: 3
care_tiers:                            # placeholders: your own names, hours, reply times and prices
  - { name: Light, hours: 3, reply_business_days: 3, price: 1500 }
  - { name: Regular, hours: 6, reply_business_days: 2, price: 3000 }
  - { name: Full, hours: 15, reply_business_days: 1, price: 6000 }
billing: prepaid monthly
rollover: { share: 0.5, of: unused, months: 1 }
rollover_wording: half of the unused hours roll over for one month
notice_days: 30
excluded: [out-of-hours on-call, new builds]
hourly_help: { price: 1000 }          # placeholder: your own hourly price
urgent_price: 1200                     # optional; placeholder
```

## uat

What acceptance testing reads. `defaults` are used only when a signed quote has no UAT line (a quote from before the line existed); the test then records its bounds as "not quoted (offers default)", and more tester roles than expected are never a change. Every value here is an invented placeholder.

```yaml
uat:
  defaults: { sessions: 2, fix_rounds: 1, fix_business_days: 3 }   # only when the quote has no UAT line
  min_testers_per_role: 1          # testers asked for per role, by id
  follow_up_business_days: 5       # an unanswered request with no deemed-acceptance clause: suggest taking it up after this
```

## contract_clauses

Empty on purpose. Your contract step drafts the standard clauses; once you have approved their wording, add them here and `/ow-build-plan-quote --accepted` copies them unchanged into `contract-inputs.md`. Until then it writes "contract clauses: not set".

```yaml
# contract_clauses:
#   deemed_acceptance: { ref: "", business_days: 0, calendar: "", wording: "" }
#   delivery_backstop: { ref: "", business_days: 0, calendar: "", wording: "" }
```
