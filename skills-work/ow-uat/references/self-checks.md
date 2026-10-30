# Self-checks

Each check reports OK, FINDING or NOT-CHECKED (reason), labelled: *same-session self-check: the same assistant that wrote the output, applying a checklist; a discipline, not an independent review.* A verb refuses while a check that runs in it is FINDING. Outside `-signoff`, the user may waive a check by typing a waiver that names it, which is recorded with the date. **No credentials, People by role or id, Data check and No private names are never waived**: a typed waiver for one of them is refused, and the verb stays stopped.

| Check | Runs in | Passes when |
|---|---|---|
| Acceptance coverage | `-plan`, `-signoff` (plain, `--sent`, `--signed`) | Every check in `agreed/` has a required scenario; at sign-off, it passes on the latest build label (exit criterion 1) |
| No false pass | `-run`, `-signoff` | Below |
| Triage cites the basis | `-defect` | Every UAT-nn names the basis item it was judged against |
| Fix bounds | `-defect` | No open class-Defect UAT-nn past `fix_rounds`, or past `fix_business_days` from its triage, without an extension or escalation entry. A FINDING never blocks writing that entry, or work on other UAT-nn |
| Data check | `-plan`, `-pack`, `-run`, `-signoff` | Below |
| People by role or id | every verb | Below |
| No credentials | every verb | Below |
| Test access listed | `-signoff --signed`, `--deemed` | The test-account list asked for before `signoff.md` exists (it may be empty) and every entry has environment and created-by |
| No internal numbers | every client output | Below |
| No private names | every verb | No private skill or business name (the catalog's blocklist) and no skill outside the family in any file; a destination's own say: line printed exactly is the user's |

## No internal numbers (owner decision D1)

An internal number is **ours only**. Client outputs are the tester packs (Markdown, HTML, PDF, Word), the results template, sign-off requests and their exports, the acceptance record, the punch list, acceptance addenda, and the reason a UAT-nn gives the client. None of them carries, in any wording:

- **our hours or effort on fixes or on the test** ("we spent two days on the fix", "the retest took us a morning", "a day and a half of developer time");
- **our rates and the price book's internals**: the UAT extension rate, the per-role add-on as a rate, unit prices, modifiers or multipliers ("extra sessions are charged at our session rate");
- **our cost or margin** ("this fix cost us more than the UAT line", "we lose money on another round");
- **our overruns against our own plan or estimate** ("the fixes ran past what we had planned").

**Allowed**, because they are the client's or are quoted contract terms: the quoted UAT line (its price, roles, sessions, fix rounds and fix days); session dates and test durations ("session 2 runs from 10:00 to 12:00", "allow two hours"); counts ("10 of 10 cases passed", "3 records created"); a signed change order's price; payment terms ("due within 14 days"); deemed and backstop dates; fix dates and rounds against the quoted bounds, including an overrun of them at no charge (owner decision O7: "fixed on 14 January, after the 5 business days quoted, at no charge"); the client's own figures, ratios and schedule.

The check is by meaning, not by word list: a paraphrase of our effort, rate, cost or overrun is the same finding. An implied claim (an idiom, a hint) is this check's to catch; the acceptance checker is a regression net for the categories above (owner decision D2).

## No false pass

Every pass has a run with `run_by` and `source`. A result the user ran or read out is never written under a tester's role. Checks whose only pass is `user alone` are listed in the request under "Checked by the builder; not tested by your people". **No client sentence credits such a check to the client's people** ("your team confirmed AC-3.1", "your bookkeeper signed off the invoices") or says a UAT-nn is fixed, resolved or working unless its latest event is `retested-pass` on the latest build label. Allowed: "checked by the builder", "the bookkeeper ran SC-06 and it passed" when the run says so, "fixed in build <label>; retest due" before the retest.

## Data check

No scenario, pack export or evidence reused forward shows real customer data, a credential, or a person's name, email or photo.

- **Data**: a scenario, pack or record cites data **by pointer** (source, record ids or locator, count, fields) and passed cases **as a count**. A table of record values, a pasted order line, or a field value copied from the client's system is a FINDING. A table is judged by what its rows hold, never by its length: rows with emails, phone numbers, card-like numbers, ID-like values or names (a customer, client or store column) are record values; a schedule or a table of counts is not (owner decision OD-7). Test data is not a record value (owner decision R3-4): a payment provider's published test card (Stripe's `4242 4242 4242 4242` set, and Visa's `4111 1111 1111 1111`) in a test-mode scenario, and a record id marked as made for the test (in the sandbox, a test order, created by SC-nn) in a scenario or the clean-up list. A real card shape, or an id with no such mark, still is.
- **Evidence**: only items `cleared` in `evidence/index.md` are cited forward. A video is `NOT-CHECKED`, so pointer only.

## People by role or id

No file this skill writes holds a tester's personal name, email or phone number. Testers are a role and the id the client chose (`ops-T2`); the client contact is a role. Allowed: role names, tester ids, and the user's own name where a record says who recorded it ("recorded by Robin"). Imported originals kept in `evidence/` are pointer only and outside this check (they are on the handoff's local-copy list).

## No credentials

No file this skill writes holds a login, password, key or token: not a labelled secret value (`password: …`), not a key- or token-shaped string, not a login inside an address (a user name and password before an `@` in a link). Allowed: "your login comes from the client operations lead", "ask the operations manager to reset the bookkeeper tester's login", "use the payment provider's test mode". A value seen in a paste, an import or an evidence file is appended to `secrets-seen.log` (kind, tester role, source, session; never the value) and NEXT prints `ask <client contact role> to reset the <role> tester's login`. If the check could only pattern-match, it is NOT-CHECKED, and `-pack` and `-signoff` need the user's dated read-through confirmation, recorded in `pack.yaml`, the request's row, `backstop.md` or the addendum.
