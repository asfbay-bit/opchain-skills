# `/ow-uat-signoff`: requests, the signature, deemed acceptance, the backstop, addenda

Run step 0 and the resume step (`references/routing-and-resume.md` §1); a basis mismatch blocks every mode. Formats: `references/signoff-schemas.md`. Dates on the contract calendar: `references/contract-calendar.md`. Self-checks: `references/self-checks.md`.

## 1. Every mode first: request statuses

Read `uat.yaml`, every run, every UAT-nn and `signoff-requests.yaml`. Mark each `drafted` or `sent` request `superseded` as `signoff-schemas.md` §3 says (by `rec`; for `--signed` and `--deemed`, as of that date). Plain, `--sent`, `--signed` and `--deemed` refuse once `signoff.md` exists: NEXT `use ow-handoff-start on uat/<client>/`.

## 2. The exit criteria (plain, `--sent`, `--signed`, `--deemed`)

Refuse, naming **every** gap, while any is true:

1. A **required scenario** for a check in `agreed/` is not `pass` in a run whose `build` equals the **latest build label** (the latest `fixed` on a UAT-nn from the main scenarios, or the latest delivery of a change order in `agreed/`, by `rec`). In practice: one confirmation run of every required scenario after the last fix. A role scenario passing does not stand in for its required one.
2. A scenario's latest run is `fail` or `blocked` and no UAT-nn names it.
3. A blocker or major **Defect** is not terminal, or a **condition** is neither met nor lapsed (a too-big condition blocks until withdrawn).
4. A minor or cosmetic **Defect** is not terminal and not on the punch list. Exempt, for `--signed` or `--deemed` on request n: those logged after request n was written; they go to `punch-list.md` as "reported after request <n>; not on the signed list".
5. An Environment or data UAT-nn is not `closed`.

Signed change orders dated after the freeze, not in `agreed/` and not extensions, do not block: the request lists them as post-acceptance once the user confirms that, or runs `--add-co` first; record the answer in the row.

## 3. Plain: write request n

Criteria met: ask the planned send date; compute the deemed date for the first sentence (`signoff-schemas.md` §2) with ow-tools when it has the calendar capability, else the table, labelled; write `signoff-request-<n>.md` (never overwritten; a later one is n+1, which supersedes every earlier live one) and its row (`drafted`). A live request that nothing supersedes means no new one: print its `--sent` or `--signed` NEXT, and write request n+1 only when the user asks for a new request. With ow-tools, export it (`export/signoff-request-<n>.{pdf,docx}`). Self-checks: Acceptance coverage, No false pass (every builder-only pass in its own section; no sentence credits it to the client's people), Data check, People, No credentials (NOT-CHECKED needs the read-through, recorded in the row), No internal numbers, No private names.

STATUS: `next: ow-uat /ow-uat-signoff uat/<client>/ | awaiting: sending request <n> by <planned send date>`. NEXT: handoffs.yaml `sign` (public default: "send `signoff-request-<n>.md` to the client for signature"), then `use ow-uat-signoff to record the sending on uat/<client>/`.

## 4. `--sent <n> <date>`

Only on a `drafted` request: record `sent`. STATUS: `next: ow-uat /ow-uat-signoff uat/<client>/ | awaiting: sign-off by <client role> on request <n> by <deemed date, or the follow-up date>`. NEXT: `use ow-uat-signoff to record the signature on uat/<client>/`, and the deemed date if a clause is frozen.

## 5. `--signed <n> <date> <client role>` and `--deemed <n>`

Only on a request that was `drafted` or `sent` and not superseded **as of the signature (or deemed) date**. Each step goes into the row's `signing_steps` as it finishes; a cut-off run resumes at the first missing one:

1. **record**: `signed <date> by <client role> on request <n>; signature not verified by this skill`. For `--deemed`: only after the deemed date (`signoff-schemas.md` §4), only with the frozen clause and a supported calendar, and only when the user confirms after seeing the frozen clause, the three dates and the builder-run list (a request resting on builder-run checks counts as complete only if the clause covers that). Then `deemed accepted under <clause ref> on <date>; applied by <user>; client response not received`.
2. **accounts**: ask for **every test account the builder created, set or knows a password for, or signed in with**, and any tester account in production: role, environment, created-by. Never a login. Kept in the row.
3. **acceptance-record**: write `acceptance-record.md`, evidence by `cleared` pointer only.
4. **punch-list**: write `punch-list.md`, the late minors included.
5. **signoff**: write `signoff.md` **last**.

`clauses: none`, or a calendar that is not supported: `--deemed` refuses, `STATUS.md` keeps `awaiting: client sign-off on request <n> since <date>`, and NEXT suggests a follow-up and, after `offers.md` `uat.follow_up_business_days` counted on `profile.md`'s calendar (not a clause date), taking it up under the contract.

STATUS: larger project, `next: ow-build /ow-build-invoice uat/<client>/signoff.md | awaiting: none (signed on request <n>)` (or `deemed on request <n>`); smaller project, `next: ow-handoff /ow-handoff-start uat/<client>/ | awaiting: handoff delivery (signed on request <n>)` (or `deemed`). A run cut off before `signoff.md` appends no STATUS line; its resume does.

**NEXT, in this order:** step 0, `use ow-uat-defect on uat/<client>/` when `punch-list.md` has an item not yet moved; then:

1. Larger project (40/40/20): `use ow-build to invoice the acceptance payment from uat/<client>/signoff.md`. Smaller project: nothing yet.
2. `use ow-handoff-start on uat/<client>/`, now: anything reported from here on is a covered fix.
3. Only when `uat.yaml` `terms.documentation_sku` is `bought` (owner decision O5): `use ow-documentation-start on uat/<client>/`. IF IT IS NOT AVAILABLE: the scenarios, training gaps and cleared evidence stay in `uat/<client>/` for later.

## 6. The backstop (smaller projects, two-payment schedule)

- **`--readiness <date> <dependency>`**: the builder has done all it can alone and sent the client a readiness notice naming a listed client dependency still outstanding (from the scope's client dependencies). Recorded as reported in `backstop-log.yaml`.
- **`--builder-delay <days> <reason>`**: business days of delay the builder caused after the notice.
- **`--backstop`**: the backstop date is the later of acceptance + the clause's N business days and the notice + 5 business days, plus the builder-delay days, on the contract calendar. Refuse when: the project is not on the two-payment schedule; `clauses: none` or no backstop clause; the calendar is not supported; there is no readiness notice; the backstop date has not passed (it applies from the day after it, as deemed acceptance does, unless the frozen clause says in so many words that it applies on that date; wording that merely counts something "from the same day", or says it does not apply or never falls due on that date, does not: owner decision OD-4); the dependency is no longer outstanding (ask); the notes were delivered (read `handoffs/<client>/dates.yaml`); the ledger shows the delivery half invoiced (read `builds/<client>/ledger.md` in place); or `backstop.md` exists. Otherwise write `backstop.md` once.

STATUS: `next: ow-uat /ow-uat-signoff uat/<client>/ | awaiting: the backstop on <date> (signed or deemed on request <n>)` after `--readiness` or `--builder-delay`; after `--backstop`, `next: ow-build /ow-build-invoice uat/<client>/backstop.md | awaiting: none (backstop applied; signed or deemed on request <n>)`. Write "signed" or "deemed", as `signoff.md` says. NEXT: `use ow-build to invoice the delivery payment (backstop)`.

## 7. `--addendum CO-nn <date> <client role>`

For a change order not in `agreed/` at sign-off. Criteria 1 to 3 and 5, limited to that change order's checks and the UAT-nn from its scenarios: each check passes in a run whose `build` equals the latest of its delivery and any `fixed` on those UAT-nn, with no blocker or major among them open. A fix to an addendum UAT-nn never makes the main checks stale. Record `confirmed <date> by <client role>; not verified by this skill` and write `acceptance-addendum-CO-nn.md` once. It never marks a payment.

STATUS: `next: ow-handoff /ow-handoff-fix handoffs/<client>/ | awaiting: none (CO-nn confirmed; signed on request <n>)`. NEXT: `use ow-handoff-fix on handoffs/<client>/` (the change order's own fix period starts on the confirmation date).
