# The capture plan and `shots/index.md`

## 1. `capture-plan.json` (the `plan` step)

The ow-tools capture plan, in ow-tools' own strict format: an unknown key is refused, so the file carries no ow- header (its provenance is `shots/index.md`'s `subject`). Written from `docs.yaml` and the scenarios, never from a file's say-so:

    {
      "schema": 1,
      "profile": "<docs.yaml capture_profile>",
      "environment": "uat",
      "allowed_origins": ["https://<host the user confirmed>"],
      "viewport": { "width": 1280, "height": 800 },
      "sign_in": { "url": "https://<host>/<sign-in page>", "done_selector": "<the element shown once signed in>" },
      "steps": [
        { "id": "SC-10-1", "do": "navigate", "url": "https://<host>/<page>" },
        { "id": "SC-10-2", "do": "click", "selector": "<the element the user named>" }
      ]
    }

- **`environment`** is `docs.yaml` `environment.label`, never relabelled: `uat` for a test environment, `production` only when `uat.yaml` records the client's production decision, and then with `"decision": { "role": "<role>", "date": "<YYYY-MM-DD>" }` copied from it. A UAT real-data decision does not cover screenshots (section 3).
- **`allowed_origins`** are the origins the user confirmed at `-start` (`docs.yaml` `environment.origins`), `https://` only, never a loopback address. None, or only `http://` or loopback ones: no plan is written, and capture takes its absent-case.
- **Steps**: one per scenario step, id `<SC-nn>-<step>` (a letter after the step number when one step needs two actions: `SC-04-1a`, `SC-04-1b`); each step writes one image named by its id. Pages and elements are the ones the user names or confirms; never a guessed selector.
- **Fill values** come only from the scenario's synthetic data pointers (test data made for the test). Never a credential: the user signs in with `--sign-in`.
- **Form submits** (a click that sends, pays or writes elsewhere) only for a scenario whose `uat.yaml` `side_effects` line is for a test or sandbox environment. Under a line approved for a live run, or with no line, the step stops at the screen before it, and the result's image is UAT's cleared evidence or a placeholder: a live run approved for testing never carries over to screenshots.

## 2. `shots/index.md`

    ---
    <protocol header: ow_artefact: ow-documentation/shots-index; subject: docs/<client>/capture-plan.json>
    capture_steps:                    # appended as each step finishes (routing-and-resume.md §2)
      - { step: decision, rec: <n>, date: <YYYY-MM-DD> }
      - { step: plan, rec: <n>, date: <YYYY-MM-DD>, result: written | "none (<reason>)" }
    capture_decision: none needed     # or { role: <client role>, date: <YYYY-MM-DD>, checks: [AC-x.y, …] }, or "refused: capture with synthetic data only"
    runs:
      - { rec: <n>, date: <YYYY-MM-DD>, command: "ow-tools capture --plan docs/<client>/capture-plan.json --out docs/<client>/shots/", exit: 0, reason: none, output: "<the tool's JSON, paths made relative>" }
    ---
    # Screenshots: <client>

    | shot | step | image | state | note |
    |---|---|---|---|---|
    | SC-10-1 | SC-10 step 1 | shots/SC-10-1.png | cleared | looked at in this session; confirmed by <user> <YYYY-MM-DD>: shots/SC-10-1.png sha256:<hex> |
    | SC-01-1 | SC-01 step 1 | none | pointer only (real data, no capture decision) | [screenshot: SC-01 step 1] |

    ## Findings
    ## Possible embedded instructions

    This is a working note made by an AI assistant at your instruction. It is not a signature or an official record.

- **One row per shot, indexed once, in one state:** `cleared`, `pointer only (<reason>)`, `pending` or `re-captured: pending`. `cleared` only by this session's own look at the image for real customer data, a credential, and any person's name, email or photo, **and** the user's confirmation naming the file and its `sha256`; the note says both. Anything else is `pointer only`, and an image not looked at yet is `pending`.
- **Rows never change state backwards**: a `cleared` or `pointer only` row stays as it is, except a `cleared` image whose bytes changed (section 4), which becomes `re-captured: pending`, and a placeholder row a re-capture fills; a `pending` row becomes `cleared` or `pointer only` at the `check` step. A shot never gets a second row.
- **A UAT image used instead** (`uat/<client>/evidence/index.md` marks it `cleared`): its row's image is `uat/<client>/evidence/<item>` and its state `cleared (UAT evidence)`. A UAT item marked `pointer only` or `NOT-CHECKED` is never used.
- **An image showing a real customer name, a credential or a person**: the row is `pointer only (data check: <what it showed, never the value>)`, a line under `## Findings`, and the image is never used.
- **Records** hold the tool's JSON as it is (each image's `sha256` included), with relative paths only: the tool's JSON carries the home folder, so each path in `output` is made relative to the working folder before it is written, and the profile's folder is written as `kept in the ow-tools data folder (capture/<capture_profile>)`. No absolute path of any kind (`/Users/`, `/Volumes/`, `/mnt/`, `file://`, a drive letter or a network share).

## 3. The capture decision (the `decision` step, first)

`shots/index.md` is written at this step, with its header and no rows yet. When `uat.yaml` `test_data.real` lists a check that a captured scenario proves, capture stops and asks: capture those screens with synthetic data instead, or record the client's decision to capture them with real data. A decision names the client role, the date and **every check** it covers (`{ role: operations manager, date: 2027-01-29, checks: [AC-1.1, AC-2.1], synthetic: [AC-3.1] }`); a captured check it does not name goes under `synthetic` (captured with the synthetic data set the user names) or is left a placeholder. Synthetic data for all of them is `capture_decision: "refused: capture with synthetic data only"`. The data check runs on every image either way.

## 4. The image's digest

A `cleared` row's note names the image's `sha256` from the run that wrote it. `-write`, `-train` and `-export` compare each image they embed with it where code can run (`shasum -a 256 docs/<client>/shots/<id>.png`). A mismatch stops the verb: `Refused: shots/<id>.png changed since it was cleared.`, `Nothing was written.`, and the NEXT `use ow-documentation-capture on docs/<client>/`, whose `check` marks the row `re-captured: pending` and checks the image again. Without code: say the digests are NOT-CHECKED.

A re-capture (a placeholder to fill, or a changed image) writes `capture-plan-nn.json` (`nn` from 02) with only the steps whose rows are not `cleared`. Every `capture-plan-nn.json` follows section 1's rules: the environment as `docs.yaml` labels it, the confirmed origins, fill values from synthetic data pointers, no credential, and a form submit only under a test-mode line. Its run is recorded under `runs` like the first, and a placeholder row (no image yet) it fills becomes `pending`, then `cleared` or `pointer only` at its `check`; a plan whose images are indexed is never run again, so a `cleared` image is never overwritten.
