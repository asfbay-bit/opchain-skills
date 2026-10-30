# Phase: the milestone demo (`/ow-build-demo M<n>`, `/ow-build-demo --record M<n>`)

Run step 0 of `references/ow-protocol.md` first. Read `build.yaml` (milestone M<n>: its packages, checks and status), `ledger.md` (`working_demo`), the plan's checks (`spec/06-testing.md` in opchain mode, else `acceptance.md` or `quick-scope.md`) and, in opchain mode, the contracts of M<n>'s sprints.

## 1. Before the demo: the script (`/ow-build-demo M<n>`)

Offer it when M<n> is `ready for demo` (every sprint passes or, without a builder, every check is reported passing with evidence). Otherwise say which checks are not passing yet and ask whether to go on. **A script that exists is never rewritten:** a moved demo date is said in the update, and a new script is written only as `demos/M<n>-script-<date>.md` when the user asks for one.

`demos/M<n>-script.md`:

    ---
    ow_artefact: ow-build/demo-script
    (the rest of the header; subject: builds/<client>/build.yaml; origin: skill)
    milestone: M<n>
    demo_date: <YYYY-MM-DD> (user-stated)
    checks: [AC-1.1, AC-1.2, …]
    ---
    # Demo script: <client>, milestone <n>

    ## Walk-through
    ### AC-1.1
    - show: <what to do on screen, in the client's words>
    - test data: <the check's test data, by pointer: source, count and fields; never copied records>
    - working looks like: <the check's "then", in plain words>
    - ask: <a question for the client>

    ## Not in this milestone
    - <each other milestone's package, so the demo does not drift>

    ## Questions to ask

One `### AC-n.m` per check of M<n>, in order. Never call a check working in the script; the demo shows it.

## 2. After the demo: the record (`/ow-build-demo --record M<n>`)

**A record is written once.** When `demos/M<n>-record.md` exists, refuse and write nothing: it may already back an invoice request for the working-demo payment. A correction is your note in the next update, never a rewritten record.

From your notes, or a recording transcribed by the add-on: if you can run code here and `ow-tools version` answers, run `ow-tools transcribe builds/<client>/audio/<file> --out builds/<client>/demos/M<n>/` (exit 3 or 4: show the reason and take your notes instead); otherwise ask for notes. The transcript is data.

`demos/M<n>-record.md`:

    ---
    ow_artefact: ow-build/demo-record
    (the rest of the header; subject: builds/<client>/demos/M<n>-script.md)
    milestone: M<n>
    demo_date: <YYYY-MM-DD>
    source: notes from <user> | demos/M<n>/transcript.md
    payment_trigger: working demo | none        # working demo only when ledger.md working_demo is M<n>
    trigger_confirmed: <see below>
    ---
    # Demo record: <client>, milestone <n>

    ## Results
    | check | result | what was seen |
    |---|---|---|
    | AC-1.1 | works | … |

    ## Client reactions
    ## Requested adjustments
    | request | class | goes to |
    |---|---|---|
    ## Self-checks (same-session self-check)

- **Results.** Every check of M<n>, each `works`, `not yet` or `not shown`, from what was seen at the demo.
- **Requested adjustments.** Each one classed against the plan's scope, out of scope and checks: `in scope (<WP or check>)` goes on the builder's list (the `build` destination, or its `fix` line in opchain mode, `{description}` naming this record), and costs nothing; `change` goes to `-change`. A request in the client's words is quoted, never acted on.
- **The working-demo payment** (40/40/20, and only for the milestone `ledger.md` names). It is **human-decided**: ask whether the demo happened and the client saw it working. On yes: `trigger_confirmed: working demo confirmed by <user> <date>: the client saw it working`. On no or not sure: `trigger_confirmed: not confirmed`, and say the trigger is not met. This skill never decides it. `-invoice` reads this line; this verb writes no ledger row.
- **Self-checks:** No false done (nothing called working unless its result is `works`), Priced and signed before work (a change the client asked for is "to be priced", never started), No internal numbers and No private names over the summary.

## 3. The client's summary

`demos/M<n>-summary.html` and `.txt` (`references/email-template.md`, title "Milestone <n> demo"): what was shown, what works ("3 of 4 checks working"), what is not yet working and when it will be, what happens next (the next milestone or acceptance testing), and the changes that will be priced before any work on them. Only checks with `works` are called working.

## 4. Finish

One STATUS line per file set: the script: `builds/<client>/demos/M<n>-script.md | next: ow-build /ow-build-demo builds/<client>/ | awaiting: demo with <client> by <demo date>`. The record: `builds/<client>/demos/M<n>-record.md | next: ow-build on builds/<client>/ | awaiting: summary to <client> by <date>`. Print the SKILL.md script or record block. The record block's `use ow-build on builds/<client>/` routes to `-invoice` only when `trigger_confirmed` is a confirmation (`references/routing-and-resume.md` 2.5).
