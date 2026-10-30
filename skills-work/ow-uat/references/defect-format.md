# Problems: `defects/UAT-nn.md`

Written only by `-defect`: it logs a problem, triages it, and records each later event as one more history line. Ids run on from the highest `UAT-nn`.

## 1. The file

    ---
    <protocol header: ow_artefact: ow-uat/defect; subject: the run (or report) it came from>
    id: UAT-03
    ---
    # UAT-03: <what went wrong, in a few words>

    from: RUN-01, SC-01 (order coordinator oc-T1)      # or: a report by <client role>, arrived <date>
    class: Defect | Change | Training gap | Environment or data | Duplicate
    severity: blocker | major | minor | cosmetic
    status: <current state, section 3>
    basis: <the check, scope item, change order, included item or ownership term>, as frozen in uat/<slug>/agreed/<file>
    triaged: <YYYY-MM-DD>
    round: <n>                                         # class Defect only

    ## What happened
    <what the tester did, expected and saw, by pointer; no real record values>

    ## Reason (for the client)
    <one or two sentences: the class, and the basis item it was judged against; never at odds with the status (section 5)>

    ## History
    - <YYYY-MM-DD> rec <n>: <event, section 4>

`class:` and every other field line start at the beginning of the line; other skills read them.

## 2. Severity and class

**Severity:** **blocker** (a role cannot do its job) · **major** (a wrong result, a missed expected result, or a workaround needed) · **minor** · **cosmetic**. A problem from a `fail` of a required scenario is major or higher.

| Class | Test (against `agreed/`) | Then | Terminal states |
|---|---|---|---|
| **Defect** | A scope item, check, change-order item, included item or ownership term in `agreed/` does not behave as agreed. A check a fix broke is a new Defect, `regression of UAT-mm`. A problem from an `--addendum` scenario is judged against that change order | Free; the rapid fix phase | `retested-pass`, `moved to punch list` (minor or cosmetic only), `withdrawn by client <role> <date>` |
| **Change** | Asks for behaviour the basis did not include | NEXT to price it (ow-build); signed before any work | `raised as change request`; as a condition, `condition met` or `condition lapsed` (section 5) |
| **Training gap** | Works as agreed; the tester did not know how | No fix | `passed to documentation` |
| **Environment or data** | The test set-up was wrong | Fixed in the set-up | `closed` when its scenario's re-run passes |
| **Duplicate** | The same as an existing UAT-nn | Linked | `closed -> UAT-mm` |

**Severity gates count for class Defect only** (escalation, the sign-off exit criteria, supersession). A Change or a Training gap never blocks sign-off, whatever severity was typed, unless it is a recorded condition. The class is a recommendation: the user decides, and the client sees the reason and the basis item cited.

## 3. Status

`open -> sent -> fixed -> retested-pass`, or `retested-fail` (back to `sent`, the next round). **Open** in the exit criteria and the bounds means any state that is not terminal. `fixed` needs the **build label** the builder reported, as the user gives it: a fix report is data, and no label means no `fixed`.

## 4. History lines

One line per event, `- <YYYY-MM-DD> rec <n>: <event>`, in this fixed wording:

- `logged from RUN-nn SC-nn (<result>, <cases>)` · `logged from a report by <client role>, arrived <date>` · `logged from a passing run, RUN-nn SC-nn`
- `triaged <class>, <severity>, against <basis item>`
- `sent to the builder (round <k>)` · `fixed, build <label> (reported by the builder; recorded by <user>)` · `set-up fixed <date>: <what was done> (as reported)` (class Environment or data)
- `retested-pass in RUN-nn` · `retested-fail in RUN-nn (round <k+1>)`
- `extension requested, client cause: <event>` · `extended, client cause, CO-nn` · `extended, builder cause (no charge)`
- `escalated to <user>: open past <n> fix rounds` or `… past <n> business days from triage (<date>)`
- `condition: CO-nn, <client role>, <date>` · `condition met: CO-nn added to agreed/ (rec <n>)` · `condition lapsed: CO-nn declined <date>` · `condition too big for a change order (<requests.md row>); blocks until withdrawn` · `condition withdrawn by <client role> <date>`
- `moved to punch list` · `passed to documentation` · `closed (RUN-nn passed)` · `closed -> UAT-mm` · `raised as change request` · `withdrawn by client <role> <date>`
- `qualifying report: names <check> with steps` · `reproduced by the builder` · `cannot reproduce notice sent <date> (within 3 business days of arrival | late: <n> business days)` · `not qualifying: no failing check or no steps; asked for details`
- `request <n> will be superseded` (when this event supersedes a written request)
- `after sign-off` (logged after the signature date; it goes to the handoff as a covered fix)

## 5. Bounds, extensions and conditions

**Per Defect.** A round is one send, fix and retest of that UAT-nn; days count from its `triaged` date on `profile.md`'s calendar. `fix_rounds` and `fix_business_days` come from `uat.yaml` and never change. A blocker or major Defect still open past them is **escalated** to the user. The escalation never blocks recording it, an extension, or work on any other UAT-nn, and nothing is signed off with an open blocker or major Defect.

- **Builder cause:** in-scope Defects stay free whatever the bounds. `extended, builder cause (no charge)`. A retest of a fix that failed on the builder's side is always builder cause.
- **Client cause** (testers absent from a scheduled session, scenarios added after `-plan`, a client-owned environment not ready): first `extension requested, client cause: <event>` on **each** affected UAT-nn, then, once the change order is signed, `extended, client cause, CO-nn`. One client-side event is one change order, cited by every UAT-nn it affects.
- **What the client may read** (owner decision O7): dates and rounds measured against the quoted bounds ("fixed on 14 January, after the 5 business days quoted, at no charge"). Never our hours, our effort or the extension rate.

**Conditions.** A client may make a Change a condition of sign-off: `condition: CO-nn, <client role>, <date>`. Signed: NEXT `use ow-uat-plan to add CO-nn to uat/<slug>/`; once the change order is in `agreed/` the condition is **met** and its checks gate like any other. Declined (its `CO-nn.md` status): `condition lapsed`. **Too big for a change order** (owner decision O6): read ow-build's `builds/<slug>/changes/requests.md` row for the UAT-nn in place; a result of `too big for a change order` records `condition too big …; blocks until withdrawn`, and the condition keeps blocking sign-off until the client withdraws it (`condition withdrawn by <client role> <date>`). It never lapses on its own.

**The client reason follows the status.** The reason is not written once at triage: rewrite it when a condition is set (it blocks sign-off until its change order is in `agreed/`, or until withdrawn when too big), met (its checks gate like any other), lapses or is withdrawn (it no longer blocks). A reason that says a blocking condition "does not block sign-off" is a finding. Before a fix is retested the reason says the fix is at no charge, never that it is fixed.

## 6. Reports after a request was sent

A client report that names a failing acceptance check **with steps** to reproduce is a **qualifying** report. Record when it **arrived**.

- Reproduced by the builder: a blocker or major Defect; it supersedes the request (`request <n> will be superseded`, also appended to `STATUS.md`).
- Not reproduced: `cannot reproduce notice sent <date>`. The notice counts only if sent **within 3 business days of the report arriving**, on the contract calendar (`references/contract-calendar.md`). A timely notice keeps the request `sent` and moves its deemed date out (5 business days after the notice). A late one does not: warn, and the report supersedes the request like a reproduced one.
- No failing check named, or no steps: `not qualifying`; it does not stop the clock, and NEXT suggests asking the client for the missing details.
- A minor or cosmetic logged after a request was written never supersedes it.

## 7. After sign-off

Once `signoff.md` exists `-defect` logs no new UAT-nn except from `--addendum` scenarios, and prints `use ow-handoff-fix on handoffs/<slug>/`. A UAT-nn logged after the signature date but before `--signed` was run is marked `after sign-off` and goes the same way. Step 0 after sign-off: mark each UAT-nn on `punch-list.md` `moved to punch list`.
