# `deliveries.yaml`, `delivered.md` and a later delivery

## 1. `deliveries.yaml` (written only by `-export`)

What went where, and when. Its `export_steps` are `-export`'s record (`references/routing-and-resume.md` §2).

    <protocol header keys: ow_artefact: ow-documentation/deliveries; subject: docs/<client>/plan.md>
    export_steps:
      - { step: files, rec: <n>, date: <YYYY-MM-DD> }
    export_tool: { version: "<ow-tools version output>" }   # or "not available here: Markdown only"
    exports:
      - { source: guides/<role>.md, files: [export/guides/<role>.pdf, export/guides/<role>.docx], command: "<the call>", exit: 0, output: "<raw output, paths relative>" }
      - { source: training/deck.md, files: [export/training/deck.pptx], command: "ow-tools export docs/<client>/training/deck.md --formats pptx --out docs/<client>/export/training/", exit: 0, output: "<…>" }
      # without ow-tools: { source: guides/<role>.md, files: [export/markdown/guides/<role>.md], command: "none (no ow-tools here)" }
    repo:                                 # none: no repository named, or handoffs.yaml `docs` has no repo entry
      repository: <build.yaml builder.repo>
      branch: <the branch the user named>
      current_branch: "git branch --show-current: <output>"   # must be the branch named; without code: "not machine-checked (<user> <YYYY-MM-DD>)"
      confirmed: "<user> <YYYY-MM-DD>: branch <branch>; <every file>"
      handover_path: docs/handover/
      files:
        - { path: docs/client-handbook/<role>-guide.md, source: guides/<role>.md, digest: "sha256:<hex>" }
      refused: []                         # [{ path, why: not written by this skill | changed since <date> }]
    push_confirmation: none               # or { by: <user>, date: <YYYY-MM-DD>, files: [{ file: <export file>, destination: <docs key>, location: <where inside it>, location_from: handoffs.yaml | user-stated <YYYY-MM-DD> }] }
    pushes:
      - { file: export/guides/<role>.docx, destination: google_docs, location: <the confirmed location>, state: intended | done | failed, rec: <n> }
    says: [google_docs, wiki]              # destinations with no connector here: their say: lines were printed
    self_checks: { Coverage: OK, Data check: OK, People by role or id: OK, No credentials: OK, No internal numbers: OK, Placeholders: OK, Accessible by construction: OK, No private names: OK }   # without ow-tools: Accessible by construction: NOT-CHECKED (no ow-tools here)
    embedded: []                          # text addressed to an assistant in what -export read: [{ text: <quoted>, file: <path> }]
    note: "This is a working note made by an AI assistant at your instruction. It is not a signature or an official record."

- **An update after delivery** (section 3) adds one entry under `updates:` (`- { n: <nn>, export_steps: […], exports: […], repo: …, pushes: […] }`) in the same shape; nothing recorded for the first delivery changes.
- **Paths are relative**: to `docs/<client>/` for exports, to the repository for the repo copy. Never an absolute path or a home folder.
- **The export files go into per-type subfolders** (`export/guides/`, `export/sops/`, `export/runbook/`, `export/handover/`, `export/training/`, `export/cards/`, `export/modules/`, `export/videos/`; without ow-tools, the client copies in `export/markdown/<type>/`), so same-named sources never collide.
- **The push** names, for each file, the `docs` key and the location inside it, as the user confirmed the listing (`phase-export.md` step 3); each `pushes` row carries the same location.
- **The repo copy** is the Markdown with its ow- header and internal section removed and each image line replaced by `*Screenshot: <alt text>*`; names in the handbook folder say what each file is (`<role>-guide.md`, `<role>-card.md`, `SOP-nn.md`, `runbook.md`), and the handover keeps its own names.
- **The digest** is `sha256:` and the SHA-256 of the file as written into the repository (`shasum -a 256` where you can run code here). Where you cannot, `digest: "none (no code here)"`, and ownership is judged by comparing the file with this skill's Markdown, header stripped, saying it is not machine-checked.

## 2. `delivered.md` (written only by `-delivered`, once)

    ---
    <protocol header: ow_artefact: ow-documentation/delivered; subject: docs/<client>/deliveries.yaml>
    delivered: <YYYY-MM-DD>
    ---
    # Documents delivered: <client>

    Documents delivered <date written out>, recorded by <user>; delivery not verified by this skill.

    ## What was delivered
    <each export file and repo copy deliveries.yaml lists, by path>

ow-build reads `delivered:` to invoice the documentation line once (amendment B4); ow-handoff reads it to package the Handoff notes (H3). It is never edited.

## 3. A later delivery: `delivered-update-nn.md` (`-delivered --update <date>`, owner decision O7)

A training gap found in the rollout before day 30 updates the role's guide and card inside the line. The update's exports go to `export/update-nn/<type>/`; the first delivery's files stay as they are. `--update` writes `delivered-update-nn.md` once (`nn` one more than the highest), with `delivered: <date>`, `update_of: docs/<client>/delivered.md`, the files it delivered, and the gap it answers (`UAT-nn` or the check-in that found it). ow-build reads only `delivered.md`: an update is never invoiced again.
