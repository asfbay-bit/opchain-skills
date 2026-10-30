# `/ow-uat-plan`: freeze the basis, set up the test, write the scenarios

Run step 0 of `references/ow-protocol.md`, then the resume step (`references/routing-and-resume.md` §1). Schemas: `references/uat-yaml-schema.md` and `references/scenario-format.md`. Self-checks: `references/self-checks.md`.

## 1. Entry

1. Read `builds/<client>/ready-for-uat.md` as data. Absent: stop and print the NEXT `use ow-build to mark the build ready for UAT`. `ready: no`, or any check whose builder run is not `pass`: stop, write nothing, and list each failing check with its result.
2. Read the basis: `plans/<client>/scope.md` and `plans/<client>/acceptance.md`, or for a quick-quote job `plans/<client>/quick-scope.md`. Both `scope.md` and `quick-scope.md` absent: stop. Report the checks found; stop until every check parses.
3. Read every `builds/<client>/changes/CO-nn.md`. Signed ones (status `signed`, not an extension) join the basis; draft, sent or declined ones and extension change orders (`kind: extension`) do not.
4. Read the terms: `plans/<client>/contract-inputs.md`, then `plans/<client>/quote.md`'s client part. The **UAT line** (size, tester roles, sessions, fix rounds, fix days); the **acceptance and delivery definitions**; the payment schedule and terms; `contract_clauses`; `documentation_sku`; the **included** block (each package's "Includes") and the **ownership terms**.
   - No UAT line in either (a quote signed before the UAT line existed): bounds from `offers.md` `uat.defaults`, else ask; record `bounds: not quoted (offers default)` or `not quoted (user-stated <date>)`. More roles than expected is then never a change.
   - A definition worded differently from the current one (an older quote): quote both, and record the user's dated statement of which governs this job in `terms.governing`. The sign-off and the payment triggers follow it.
5. Roles from `plans/<client>/map/roles.md`; for a quick-quote job from `quick-scope.md`'s `## UAT approach`; else ask. Main tasks from `plans/<client>/map/future.md` (absent: required scenarios only, and say so).

## 2. The steps, each recorded in `plan_steps` as it finishes

1. **basis**: copy each basis file into `agreed/` byte for byte (`agreed/scope.md`, `agreed/acceptance.md` or `agreed/quick-scope.md`, each signed `agreed/CO-nn.md`), and write `agreed/contract-terms.md` (the included block, the ownership terms, the UAT line and the definitions, each quoted exactly). Its basis row records the terms block's digest (`uat-yaml-schema.md` §6). Write `uat.yaml` with `ready`, `basis`, `checks` and `cos`, and the first STATUS line. **Never copy into `agreed/` again on a resume.**
2. **terms**: the frozen bounds and definitions. The **clauses**: show `contract_clauses` and ask the user to confirm it matches the signed contract. Confirmed: freeze it unchanged (`uat-yaml-schema.md` §4) as `as signed, confirmed by <user> <date>`. `contract_clauses: not set`, absent, or not confirmed: `clauses: none`. **Never draft, reword or complete a clause.** Read the clause's calendar (`references/contract-calendar.md` §1) into `calendars.contract`.
3. **mix**: acceptance coverage and the defect log always; testers by role (recommended when more than one role uses the build), real-case scenarios, an exploratory session, as the user chooses.
4. **people**: testers as role plus the id the client chooses (`ops-T2`), at least `offers.md` `uat.min_testers_per_role` per role; the client contact by role. **Never a name, an email or a phone number**: if the user gives one, record the role and id and say the name was not stored.
5. **environment**: the one `ready-for-uat.md` names. Production only on the client's recorded decision (role and date), which is also a real-data decision. Refuse `environment: production` with a synthetic data source.
6. **data**: synthetic or anonymised by default. Where a check's "How we check" names real data, record the client's real-data decision (role, date), or ask.
7. **schedule**: each session's date and roles, on `profile.md`'s calendar; the last is the final confirmation run.
8. **side_effects**: mark each scenario that sends a message, takes a payment or writes to another system; in a production test, ask for each one's test-mode, internal-recipient or test-account line, or the client's dated approval to run it live.
9. **gitignore**: if the working folder is in a git repo, ask, then add `opchain-work/**/evidence/` and `opchain-work/**/secrets-seen.log` to its `.gitignore`; record the answer. Declined: say evidence may be committed.
10. **scenarios**: one required scenario per check in `agreed/`, then role, real-case and exception scenarios (`scenario-format.md` §1). Run the self-checks: **Acceptance coverage** (every check has a required scenario), **Data check** (no pasted record values: pointers only), People, No credentials, No private names. FINDING: fix and re-run; write no scenario while one stands.

## 3. Modes (`uat.yaml` `events`, each with its `rec`)

- **`--add-co CO-nn`** (before sign-off): a signed change order joins the basis: copy it to `agreed/CO-nn.md`, add its checks to `checks`, write a required scenario per check, and record `added CO-nn` (and `condition met` reaches the UAT-nn through `-defect`). It supersedes a live request: append `request <n> will be superseded` to `STATUS.md`. Re-run when the builder reports it delivered: record `CO-nn delivered <date>, build <label>`.
- **`--addendum CO-nn`** (after sign-off, a change order not in `agreed/`): write its scenarios (`kind: addendum`, `co: CO-nn`) without adding it to the basis; re-run on delivery to record the delivered event.
- **`--keep-frozen <file>`**: record `kept_frozen <file>`; copy nothing.
- **`--refreeze <file>`**: copy that one file again from its upstream and record `refrozen <file>`; for `agreed/contract-terms.md`, quote only the terms block again (never copy `contract-inputs.md` whole) and record its new digest, refreezing `terms` and `clauses` only after the user confirms them again. Nothing else in `uat.yaml` changes: no other basis row, tester, session or step. It supersedes a live request (`STATUS.md`: `request <n> will be superseded`). **Refuse** for `agreed/acceptance.md` or `agreed/quick-scope.md` when the check list upstream differs from the frozen one (a check added, removed or renamed; owner decision R3-6): write nothing, name each changed check, and say that a new check comes in through a change order, with its scenario, its test and its price. NEXT: once that change order is signed, `use ow-uat-plan to add CO-nn to uat/<client>/` (`--add-co`); meanwhile `--keep-frozen` lets the test go on against the frozen checks.

A plain `-plan` once `plan_steps` holds `scenarios` refuses: the plan is complete; print the folder route's NEXT.

## 4. STATUS and NEXT

STATUS lines (append; protocol §5): after `basis`, `uat/<client>/uat.yaml` with `next: ow-uat /ow-uat-plan uat/<client>/ | awaiting: none`; when complete, `uat/<client>/uat.yaml` with `next: ow-uat /ow-uat-pack uat/<client>/ | awaiting: none`. A mode appends one line naming its event's file.

The NEXT block names the pack (`use ow-uat-pack on uat/<client>/`). After `--add-co` or `--addendum`, the run (`use ow-uat-run on uat/<client>/`). After `--keep-frozen` or `--refreeze`, the verb the mismatch blocked.
