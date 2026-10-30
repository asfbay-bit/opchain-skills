# Document formats

Every document is Markdown first, the one source for every format. Each carries the protocol header (`subject:` the file it was made from) and follows the ow-tools export preflight: exactly one H1, no skipped heading levels, alt text on every image (`![<what it shows>](<file>)`, nothing else in the brackets), a header row on every table, link text that is not a bare address, and no raw HTML. Each ends with its self-check table between `<!-- ow:internal -->` and `<!-- ow:end-internal -->`, each on a line of its own, as the last thing in the file; nothing internal appears anywhere else, a deck's speaker notes included.

## 1. Sources and images, in every document

- **The internal section** holds the self-check table, findings and quoted embedded instructions only. Our hours, rates, costs or overruns go in no client document, its internal section included.
- **Every step, command and path cites its source** in square brackets at the end of its line: a scenario step `[SC-10 step 1]`, a scenario `[SC-10]`, an acceptance check `[AC-1.2]`, a map row `[map/future.md item 2]` or `[map/roles.md order coordinator]`, a change order `[CO-01]`, a problem from testing `[UAT-01]`, a training gap the rollout found `[RG-01]`, a repository file `[README.md]`, or the user `[user-stated <YYYY-MM-DD>]`; a setting only a vendor's console shows is `[user-confirmed <YYYY-MM-DD>]`. Every id cited exists in the files read. A step with no source is not written: it goes under `## Open items`.
- **Images**: one per step, the line after it, indented three spaces: `![<alt>](../shots/<shot id>.png)` for an image `shots/index.md` marks `cleared`, or a UAT evidence item its index marks `cleared`; otherwise the placeholder `[screenshot: <SC-nn> step <k>]`. A placeholder blocks `-export` until it is filled or the step's image line is removed with the user's say-so.
- **Training gaps**: every Training-gap topic from testing is marked where its role meets it, with the line `Came up in testing: UAT-nn.` (in the role's guide, its card, its modules and the deck). A gap the rollout found is marked `Came up in the rollout: RG-nn.` in its role's guide and card.

## 2. A guide per role: `guides/<role>.md`

    ---
    <protocol header: ow_artefact: ow-documentation/guide; subject: docs/<client>/plan.md>
    role: <role>
    tasks: [SC-nn, …]
    gaps: [UAT-nn, …]
    ---
    # <Role> guide: <client>

    ## What changed for you
    ## <task, in the role's words>          (one section per task: the role's scenarios)
    When you'd do it: <…> [SC-nn]
    1. <one action> [SC-nn step 1]
       ![<alt>](../shots/SC-nn-1.png)
    What you should see: <the expected result> [SC-nn]
    If it goes wrong: <the exception path> [<source>]
    ## Open items

Every task of the role (each of its scenarios) has a section. *What changed for you* comes from `map/roles.md` (today and after).

## 3. An SOP per process: `sops/SOP-nn.md`

One per item of `plans/<client>/map/future.md` (a quick-quote job: from `quick-scope.md` and the user, user-stated). SOPs describe the way of working, not the software; each software step links to its guide (`see the <Role> guide, "<task>"`).

    ---
    <protocol header: ow_artefact: ow-documentation/sop; subject: plans/<client>/map/future.md>
    id: SOP-nn
    process: map/future.md item <n>
    review: <YYYY-MM-DD>
    ---
    # SOP-nn: <the process>

    ## Purpose
    ## Who does what          (a table by role)
    ## When
    ## Steps
    ## Exceptions and who handles them
    ## Escalation
    ## Records kept
    ## Review

**Records kept and for how long: only as the client stated it**, cited `[user-stated <date>]`; never inferred. Not stated: `The client has not said how long these are kept; ask before setting a period.` The review date is the user's, written out.

## 4. The runbook: `runbook.md`

The full version of ow-handoff's operator notes. Entries use ow-handoff's fixed form and its `OP-nn` ids:

    ---
    <protocol header: ow_artefact: ow-documentation/runbook; subject: docs/<client>/docs.yaml>
    ops: [OP-01, …]                 # every id ever used, retired ones included
    ---
    # Runbook: <client>

    ## Users and permissions
    ## Settings
    ## Operator tasks
    ### OP-01: <title>
    - **When:** <the alert, the day, the sign>
    - **Check:** <where to look; the run log by its location>
    - **Do:** <the steps>
    - **If that fails:** <who to contact, by role>
    - **Source:** <the repository file and line, the alert id, the check, or user-confirmed <date>>
    ## Run logs
    ## Monthly and quarterly tasks
    ## Vendor-side settings
    ## Backups and restore
    ## Rotating secrets
    ## Open items

- **Ids** start at `OP-01` and are **never renumbered or reused**. An update appends the next id after the highest in this file's `ops:` and, where it exists, in `handoffs/<client>/operator-notes.md`'s `ops:` (ow-handoff's rotate entries), so no id is ever used twice; a retired entry stays, its title ending `(retired <YYYY-MM-DD>)` and a `- **Retired:** <date>: <why>` line under its fields. ow-handoff's rotate entries continue after the runbook's highest id.
- **Coverage**: one entry per alert in the repository's alert configuration, its Source naming the file and the alert's id (`alerts.yaml: <id>`); one check-a-run entry per scheduled job, naming its run log; one entry whose title starts `Retry`, or a `not applicable: <reason>` line under `## Operator tasks`; an entry per acceptance check worth repeating ("how to check it's working").
- **Rotating secrets**: one paragraph linking the Handoff notes' operator notes, where each rotate entry lives. No rotate entry is written here, and no secret value anywhere: secrets by name only (`SHOP_API_TOKEN`).
- **Backups and restore** where the build has them; otherwise `not applicable: <reason>`.

## 5. The developer handover: `handover/*.md`

For the next engineer. Four files: `handover/README.md` (what was built, the architecture from `spec/02-architecture.md` and the repository, where things are), `handover/run-and-deploy.md` (`## Set up locally`, `## Run the tests`, `## Deploy`, `## Roll back`), `handover/configuration.md` (configuration, and `## Secrets (names only)`), `handover/decisions.md` (decisions and why, from the plan, the sprint contracts and the change orders; `## Known limits`; `## Out of scope`). Each ends with `## Open items`.

- **A command** is written in backticks on a line ending `(from <repository file>)`; **it appears verbatim in that file**. A command not found in the repository is never written: it becomes an open item ("No rollback steps were found in README.md or docs/: ask whoever built it").
- **A path** in backticks exists in the repository. **A setting or secret** is its name in capitals (`SHOP_API_TOKEN`), never its value.

## 6. The training kit: `training/`

| Format | File | Holds |
|---|---|---|
| Live-session deck | `training/deck.md` | The H1 is the title only. One slide per `##`; nothing between the title and the first slide; no `###` outside notes; at most one image or table per slide, and it comes last on the slide (pandoc puts text that follows an image on a slide of its own, and the export refuses the deck); speaker notes in `::: notes` … `:::` blocks, holding nothing internal. A session per role: `## <Role>: <task>` slides, the role's tasks as live demos on UAT's test data (by pointer) |
| Facilitator guide | `training/facilitator.md` | `## Timings`, `## Demo script` (UAT's test data by pointer), `## Exercises` (each with `Expected result:`), `## Competency check`, `## Attendance` (by role and the client's id; never a name) |
| Self-paced modules | `training/modules/M-nn.md` | One task each (header `id`, `role`, `task: SC-nn`): `## Lesson`, `## Exercise` (in the test environment), `## Check question`, `## Answer` |
| Quick-reference cards | `training/cards/<role>.md` | One page per quoted role (header `role`): `## Every day` (exactly five numbered items) and `## When something looks wrong` |
| Video scripts | `training/videos/V-nn.md` | One task each (header `id`, `task: SC-nn`): `## Script` and `## Shot list` (a table: shot · on screen · source) |

Ids `M-nn`, `V-nn` and `G-nn` are numbered once and never reused or renumbered.
