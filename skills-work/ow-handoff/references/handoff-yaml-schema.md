# `handoff.yaml`: the frozen basis and window terms

Written by `/ow-handoff-start` only (its `--keep-frozen` and `--refreeze` modes append one entry each). Every other verb reads it first (`routing-and-resume.md` §1). It holds **no window date**: `dates.yaml` (written once by `-delivered`) holds those, and `package.yaml` the provisional ones.

## 1. The file

    ow_artefact: ow-handoff/handoff
    schema: 1
    written_by: ow-handoff 1.0.1 (protocol 1)
    workstream: <client slug>
    subject: uat/<client>/signoff.md
    created: <YYYY-MM-DD>
    clock: tool | host-supplied | user-stated | assumed
    origin: skill
    acceptance: { kind: signed | deemed, date: <YYYY-MM-DD>, request: <n> }
    build_label: <signoff.md's build_label>
    project: larger | smaller            # the payment schedule from contract-inputs.md (smaller: the two-payment schedule)
    agreed_basis:
      - { file: agreed/<file>, from: uat/<client>/agreed/<file>, dated: <YYYY-MM-DD>, digest: sha256:<hex> }
    post_acceptance_cos: [CO-nn]         # signoff.md's list, plus any non-extension CO signed after the sign-off date
    fix_window_days: { value: <n>, source: <where it came from> }
    access_removal_lead_business_days: { value: <n>, source: <where it came from> }
    payment_due_days: { value: <n>, source: <where it came from> }
    documentation_sku: bought | declined (<source>)
    repo: <build.yaml builder.repo, relative> | none
    doc_paths: { readme: <path>, deploy: <path>, docs: <path>, ci: <path>, confirmed: "<user> <YYYY-MM-DD>" }
    gitignore: { asked: <YYYY-MM-DD>, answer: added | no | not a git repo, lines: [...] }
    start_steps:
      - { step: terms, rec: <n>, date: <YYYY-MM-DD> }
    kept_frozen: []
    refrozen: []
    embedded: []
    frozen: <YYYY-MM-DD>                 # written last: the start's last step
    note: This is a working note made by an AI assistant at your instruction. It is not a signature or an official record.

- **No `*price*` key and no amount.** ow-build-plan's files carry `documentation_price`, `fixed_price` and `payments`; this file copies none of them, under any name. `project` is the payment schedule's kind, never an amount.
- **Sources.** `fix_window_days`: `plans/<client>/contract-inputs.md`, then `quote.md`'s client part, then `offers.md` `after_handoff` (a default the user confirms: `offers.md after_handoff, confirmed by <user> <date>`), then the user (`user-stated <date>`). With no value, ask; **never compute an end date without one**. `access_removal_lead_business_days`: `offers.md`, else ask. `payment_due_days`: `contract-inputs.md`, else the user.
- **`documentation_sku`** as `contract-inputs.md` gives it (`documentation_sku: bought` or `declined`); absent: ask once, record it user-stated.
- **`doc_paths`** are found in the client's repository (README, `docs/`, the CI config) and confirmed by the user, else asked. Each is a repository-relative path that resolves inside the repository (`self-checks.md` §7).
- **`gitignore`** (`phase-start.md` step `gitignore`): the answer to the one question, asked once in a git repository where the lines are absent.

## 2. The entries the modes append

    kept_frozen:
      - { file: agreed/<file>, upstream_dated: <YYYY-MM-DD>, kept: <YYYY-MM-DD>, by: <user>, rec: <n> }
    refrozen:
      - { file: agreed/<file>, upstream_dated: <YYYY-MM-DD>, refrozen: <YYYY-MM-DD>, by: <user>, digest: sha256:<hex>, rec: <n> }

One entry per run, naming one file. `--keep-frozen` copies nothing; `--refreeze` re-copies that one file and nothing else.
