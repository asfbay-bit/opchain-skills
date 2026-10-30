# The price book: `opchain-work/price-book.yaml` (schema 1)

The price book is the user's own data, not skill text. Copy `examples/price-book.yaml` to `opchain-work/price-book.yaml` and replace every number: the example's numbers are invented placeholders, and no real price belongs in a shared or public file. This skill reads the price book and never edits it (protocol §4: `origin: user`).

Every price is a number in `currency`, with at most two decimals. A key this skill needs and cannot find stops the step that needs it; it never fills one in.

| Key | Shape | Used by |
|---|---|---|
| `currency` | ISO code, e.g. `USD` | every amount |
| `care_onboarding` | `{ sizes: { S, M, L }, size_by_systems: { S, M, L }, payment: on_signature \| on_delivery }`: a care takeover's onboarding review (amendment P4); each size a fixed fee, each `size_by_systems` rule the systems and integrations it covers, in the user's words | `-quote --quick --onboarding` only |
| `build_plan_fees` | `{ one_system, two_systems, three_plus_or_mvp }`: the Build Plan's own fee per tier | `-offer`, `-start`, the quote's credit line |
| `build_plan_weeks` | `{ one_system, two_systems, three_plus_or_mvp }`: plan length in weeks | `-offer`, `-start` |
| `build_plan_schedule` | `{ one_system, two_systems, three_plus_or_mvp }`, each `{ collection_business_days, delivery_business_days }`: business days from the start date to the collection deadline and to plan delivery. Missing: `-start` asks and records `user-stated` | `-start` |
| `units` | list of `{ id, label, price, includes?, size?, feasibility? }` | `-quote` |
| `modifiers` | list of `{ id, when, multiply?, add_unit? }` | `-quote` |
| `uat` | `{ sizes: { S, M, L }, per_extra_role, extension: { per_session_or_round } }`; each size `{ price, tester_roles, sessions, fix_rounds, fix_business_days }` | `-quote` (required on every build quote; a feasibility test and an onboarding review carry no testing line) |
| `documentation_training` | `{ sizes: { S, M, L }, per_extra_group_of_15, quote_separately_above }` | `-quote` (optional line) |
| `size_threshold` | amount: a fixed price at or above it pays 40/40/20, below it 50/50 | `-quote` |
| `payment_terms_days` | days an invoice is due in | `-offer`, `-quote` |
| `quote_validity_days` | days an offer or quote stays valid | `-offer`, `-quote` |
| `build_plan_credit_days` | days after plan delivery the Build Plan fee is credited against a signed build | `-quote` |
| `quick_quote_max_units` | the most price-book units a quick quote may hold | `-quote --quick` |

## Units

- `id`: lower case with hyphens, unique. A work package cites units by id.
- `label`: what the client would call it.
- `includes`: what every package built from this unit includes (error handling and alerts, run logs, acceptance tests, operator notes, and so on). The quote prints it under the package.
- `feasibility: true`: marks the unit a feasibility test is priced from (the example's `feasibility-test`). A feasibility quote uses that unit and nothing else (`references/phase-quote.md` §3.1); a book with no such unit leaves a feasibility test unpriced, and the quote stops and asks. Mark one unit at most.
- `size`: `S`, `M` or `L`, only on a **product** unit (an internal tool, a portal, a new product) whose size sets the testing and training lines. The build's size is the largest `size` among the product units on the quote; with none on the quote, ask the user and record `build_size_source: user-stated`.

## Modifiers

- `when` is the written condition. A modifier applies only when an `evidence.md` row shows the condition, cited on the quote line (`data-messy: evidence.md E-07 "…"`). No row, no modifier.
- `multiply: <factor>` multiplies the affected lines; `add_unit: <id>` adds that unit once. Each modifier has one of the two.

## Testing and training lines

- **User acceptance testing · <size>** is required on every quote. Price = `uat.sizes.<size>.price` + `uat.per_extra_role` × (tester roles − `tester_roles` included, when more). Fewer roles than included does not lower it. `uat.extension.per_session_or_round` is an internal rate for client-caused overruns: it is never on the client's part of the quote.
- **Documentation & training · <size>** is a recommended line the client can decline. Price for up to 15 people = `documentation_training.sizes.<size>`, plus `per_extra_group_of_15` for each further group of up to 15. Above `quote_separately_above` people: "quoted separately", with no price.

## Related user files

- `offers.md` → `after_handoff.fix_window_days`: the number of days of fixes printed on the quote (ow-handoff reads the same key later). `ownership`: the fixed ownership text for the plan. `contract_clauses`: the contract step's standard clauses, copied unchanged into `contract-inputs.md`. See `examples/offers.md`.
- `brand.yaml`: read by the ow-tools add-on for exports, never by this skill. See `examples/brand.yaml`.
