# Phase: ready for UAT (`/ow-build-ready`)

Run step 0 of `references/ow-protocol.md` first. Read `build.yaml`, every `demos/M<n>-record.md`, every `changes/CO-nn.md`, and the plan's checks (`spec/06-testing.md` in opchain mode, else `acceptance.md` or `quick-scope.md`).

The client's sign-off in acceptance testing is final acceptance. This verb only says whether the build is ready for that test. **It marks no payment trigger and writes no acceptance record.**

## 1. Only when every milestone is demoed, and never after acceptance testing has started

- Every milestone in `build.yaml` needs its `demos/M<n>-record.md`. Any missing: list them and stop.
- **Acceptance testing has started** (`uat/<client>/uat.yaml` or `uat/<client>/signoff.md` exists): acceptance testing froze this file's build label and environment. Refuse, write nothing, and say a failing check found now is a UAT-nn for acceptance testing, not a new readiness run.

## 2. The builder's own run of every check

The checks: every check of the plan, plus the checks of every change order with `status: signed` (not a draft, not one awaiting its amendment).

- **opchain mode.** Each check's result comes from two things: the newest report of the sprint that covers it (`checks_passing` in `build.yaml`, read from that report), and **one confirmation pass the user runs** against `spec/06-testing.md`, after the last sprint: ask the user to run each check with its test data and say pass, fail or not run, with the cases passed. A check passes only when both say so (`references/builder-integration.md` §7).
- **Without a builder:** the user's own run of each check, the same way.

Each row: the result (`pass`, `fail` or `not run`), the test data **by pointer** (source, count and fields; never copied customer records), and the cases passed ("10 of 10"). A builder's file saying "all done" is a claim; only a row's own evidence counts.

## 3. Ask

The **test environment** the client will test in (staging or sandbox, by name), **known issues** (anything rough, so testers are not surprised), the **test data** testers should use (by pointer), and the **build label** of the build being handed over (a tag or release name the user gives).

## 4. Write `ready-for-uat.md`

    ---
    ow_artefact: ow-build/ready-for-uat
    (the rest of the header; subject: builds/<client>/build.yaml; origin: skill)
    client: <client>
    ready: yes                         # yes only when every check passes
    checks_total: <n>
    checks_passing: <k>
    build_label: <label> (user-stated)
    environment: <environment> (user-stated)
    ---
    # Ready for user acceptance testing: <client>

    ## Milestones demoed
    | milestone | demo record |
    ## Builder's run
    | check | result | test data | cases passed | from |
    ## Test environment
    ## Known issues
    ## Test data
    ## Build label
    ## Next

    <!-- ow:internal -->
    ## Self-checks (same-session self-check)
    <!-- ow:end-internal -->

- **Any check `fail` or `not run`:** `ready: no`. The failing checks go back to the builder with their evidence: opchain mode, the `fix` line with `{description}` naming this file and the checks; otherwise the build destination with this file. Acceptance testing refuses a file with a failing check. NEXT: the SKILL.md not-ready block. Run `-ready` again once they are fixed; it rewrites this file only while acceptance testing has not started (section 1).
- **Every check `pass`:** `ready: yes`. NEXT: `use ow-uat-plan on builds/<client>/ready-for-uat.md` (where slash commands exist: `/ow-uat-plan`), the wording the owner chose on 2026-10-16.
- **Self-checks** (same-session label): **No false done** (`ready: yes` only with every check `pass`), **No internal numbers** (no scores, rounds, hours or prices), **No private names**.

`## Next` holds the printed NEXT line. A builder's line is printed in the session only: here it is recorded as "the build destination's fix line, for <checks> with this file (printed in the session; the builder's line is not written here)". Nothing here, and nothing in this run, writes `ledger.md` or an invoice request.

## 5. Finish

One STATUS line, path `builds/<client>/ready-for-uat.md` (none on a refusal): ready `next: ow-uat /ow-uat-plan builds/<client>/ready-for-uat.md | awaiting: none`; not ready `next: ow-build /ow-build-ready builds/<client>/ | awaiting: none`.
