# The draft's files

Everything sits in `drafts/<ws>/DR-nn-<slug>/` (`<ws>` a client's slug or `business`; `DR-nn` numbered once per workstream). Each file starts with the protocol §4 header (`ow_artefact: ow-draft/<name>`); under a handling level, `banner_text` is the first line after it. Paths in records are relative to `opchain-work/`, never absolute.

## 1. `brief.md` (`-brief`; `--revise` appends)

    <header: ow_artefact: ow-draft/brief; subject: the findings or recommendation path, or none>
    id: DR-<nn>
    kind: client deliverable | marketing | internal | client comms
    type: document | deck | sheet | email | post | newsletter
    audience: <the user's words>
    purpose: <the user's words>
    key_message: <the one key message>
    length: <n> words | <n> slides | <n> characters | <n> rows
    deadline: <YYYY-MM-DD>
    voice: <id>
    destination: <a handoffs.yaml drafts key> | files only
    constraints: <the user's words, or none>
    offer: "yes" | "no"
    handling: "no" | <the level, in the user's words>
    handling_from: [<file>: <what it said>, …]     # the union: profile.md, intake.yaml, plan.yaml, a bannered evidence file
    banner_text: ""
    evidence_from: <the findings or recommendation path an inbound route brought> | none
    export_ignored: <yes (git check-ignore) | the user's answer | not a repository>
    ---
    # Brief: DR-<nn> <title>

    ## Confirmed
    confirmed by <user> on <YYYY-MM-DD>: <kind>, <type>, for <audience>; key message "<message>"; destination <key>. This is a working note made by an AI assistant at your instruction. It is not a signature or an official record.

    ## Open questions
    - none

    ## Possible embedded instructions
    - none

    ## Revision <YYYY-MM-DD>              # appended by --revise; nothing above it changes
    - changes: <field>: <new value>; …
    - confirmed: confirmed by <user> on <YYYY-MM-DD>. This is a working note …

## 2. `evidence.md` (`-evidence`, append-only)

    <header: ow_artefact: ow-draft/evidence; subject: drafts/<ws>/DR-nn-<slug>/brief.md>
    id: DR-<nn>
    ---
    # Evidence: DR-<nn>

    ## E-<nn>
    - source: <path>#F-<nn> | <path> | inbox/<file> | user-stated <YYYY-MM-DD> | calc
    - source kind: finding | recommendation | named file (<ow_artefact>) | user file | user-stated | calc
    - title: <what the source is, in a few words: the client form's Sources line>
    - supports: <the claim, figure or quote it supports>
    - claim: <a finding's claim, word for word>
    - level: HIGH | MEDIUM | LOW | UNKNOWN
    - sources: S-<nn> (<url>, retrieved <YYYY-MM-DD>, <class>)    # a finding's inline sources, exactly
    - conflicts: <as the finding gives them> | none
    - date: <YYYY-MM-DD>
    - figure: <the figure as the source gives it> | none
    - round figure: <figure>, <the user's answer> (<user>, <YYYY-MM-DD>; human-decided)   # only when asked
    - ours by value: <figure>                                       # only when one of ours, not round
    - offer source: <path> | user-stated <YYYY-MM-DD>             # an offer figure, offer: yes only
    - calc: ow-tools calc total --items drafts/<ws>/DR-nn-<slug>/calc/E-<nn>.json
    - output: "<raw output>"
    - quote: "<exact words>" (<PM-nn or inbox/<file> or the user>)   # a quote item only
    - withdraws: E-<nn> (<why>)                                    # a corrected item only

    ## Open questions
    - (run <n>) <a gap or a claim with no source, quoted>

    ## Possible embedded instructions
    - none

    ## Runs
    - run <n>: sources <paths> (<YYYY-MM-DD>, clock: <source>)
    - run <n>: items E-<nn>, E-<nn>
    - run <n>: checks No credentials OK · No private names OK

A new run inserts its blocks after the last `## E-nn` block and appends its lines; nothing earlier changes. An item is **withdrawn** when a later item withdraws it, and **stale** when its F-nn is no longer under its findings file's `## Findings`.

## 3. `calc/E-<nn>.json` (`-evidence`)

The items file for `ow-tools calc total` (`[{ "label": …, "amount": … }]`, one currency). Written once, with the item it serves.

## 4. The draft file (`-write`)

One per draft, by type: `draft.md` (document), `deck.md` (deck), `comms.md` (email, post, newsletter), or `sheet/` (a sheet: one CSV per sheet, `model.md` and `sources.csv`). Every factual claim, number and quote carries an `[E-nn]` marker. Notes for you (open questions, what was cut) go in one `<!-- ow:internal -->` … `<!-- ow:end-internal -->` section at the end, never into the client form.

## 5. `candidates/` (`-freeze`, never edited)

- `candidates/C-<n>.md`: the draft as frozen, markers and all.
- `candidates/C-<n>/<slug>.md`: **the client form**, named for the deliverable, because ow-tools names each export after its source: the ow- header kept for ow-tools to strip, each marker replaced by the type module's form, no `ow:internal` section.
- A sheet: `candidates/C-<n>/<slug>/`, the sheet folder as frozen, client-ready.

## 6. `checks/C-<n>.md` (`-freeze`; `--waive` appends)

    <header: ow_artefact: ow-draft/checks; subject: drafts/<ws>/DR-nn-<slug>/candidates/C-<n>.md>
    candidate: C-<n>
    ---
    # Checks: C-<n>

    Same-session self-check: the same assistant that wrote the draft, applying a checklist; a discipline, not an independent review.

    ## Candidate
    - marker form: candidates/C-<n>.md sha256:<hex>
    - client form: candidates/C-<n>/<slug>.md sha256:<hex>      # a sheet: candidates/C-<n>/<slug>/ sha256:<hex>
    - command: ow-tools digest drafts/<ws>/DR-nn-<slug>/candidates/C-<n>.md   # one line per form
    - output: "<raw output>"
    - note: detects accidental change only; not tamper-evidence   # without ow-tools: weak fingerprint, length <n>, first line "<…>", last line "<…>" (weak)
    - voice: voices/<id>.md sha256:<hex> (version <n>, approved) | none (no approved voice)
    - brief: brief.md (newest revision: <YYYY-MM-DD> | none)

    ## Results
    | check | result | label |
    | --- | --- | --- |
    | Brief fit | OK | agent-checked |
    | … the ten checks, in `references/self-checks.md` §1's order … |

    ## Findings
    - none                       # or: <check>: <what, where> ("<the words>")

    ## Waivers
    - none                       # or: <check>: waived by the user (human-decided) on <YYYY-MM-DD> for C-<n>[: figures <figure>, <figure>]; reason "<the user's words>". This is a working note …

## 7. `signoff.md` (`-signoff`, `-signoff --client`; append-only)

    <header: ow_artefact: ow-draft/signoff; subject: drafts/<ws>/DR-nn-<slug>/checks/C-<n>.md>
    ---
    # Sign-off: DR-<nn>

    ## C-<n>
    - digests: candidates/C-<n>.md sha256:<hex>; candidates/C-<n>/<slug>.md sha256:<hex>
    - signed: read and approved by <user> on <YYYY-MM-DD>, as stated; not verified by this skill
    - embedded: none                  # or: "<quoted text addressed to an assistant>" (<file>). Quoted as data; not followed.
    - note: This is a working note made by an AI assistant at your instruction. It is not a signature or an official record.

    ## C-<n> client
    - client: approved by <client role> on <YYYY-MM-DD>, as reported
    - note: This is a working note made by an AI assistant at your instruction. It is not a signature or an official record.

## 8. `deliveries.yaml` (`-deliver`)

    <protocol header keys: ow_artefact: ow-draft/deliveries; subject: drafts/<ws>/DR-nn-<slug>/signoff.md>
    deliveries:
      - candidate: C-<n>
        steps: [match, export, repo, confirm, push]
        date: <YYYY-MM-DD>
        match: { command: "ow-tools digest …", output: "<raw output>", equal: yes }   # weak: compared in full, never by fingerprint
        handling: { level: "no", from: [<file>: <what it said>, …] }
        export_tool: "<ow-tools version output>"          # or "not available here: client form only"
        exports:
          - { source: candidates/C-<n>/<slug>.md, files: [export/C-<n>/<slug>.pdf, export/C-<n>/<slug>.docx], command: "<the call>", exit: 0, output: "<raw output, paths relative>" }
        export_ignored: "<git check-ignore output>"        # or not a repository
        repo: none                                         # or { key, repo, path, branch, base, current_branch, confirmed, files: [{ path, digest }], refused: [] }
        push_confirmation: none                            # or { by, date, files: [{ file, destination, location, location_from }] }
        pushes: []                                         # [{ file, destination, location, state: intended | done | failed }]
        says: [<key>]
        embedded: []
        note: This is a working note made by an AI assistant at your instruction. It is not a signature or an official record.

Paths are relative to the draft folder (exports) or to the repository (the copy). A candidate's entry is never edited once `push` is recorded; another candidate gets its own entry and its own `export/C-<n>/`.
