# `/ow-documentation-train [deck | facilitator | modules | cards | videos]`: the training kit

Run step 0 and the resume step (`references/routing-and-resume.md` §1). Formats: `references/document-formats.md` §6. Self-checks: `references/self-checks.md`.

## 1. Which format

- **A format given**: write that format.
- **No format** (owner decision O12): the first format in `plan.md`'s `order` with no file yet; say which. Every format already written: `Nothing to do: every training format in plan.md is written.`, `Nothing was written.`, and the export NEXT.
- **A format `plan.md` left out**: refuse (`Refused: <format> was left out of the plan on <date>.`); nothing is written.
- **The guides come first**: with a guide missing, refuse and print the write NEXT.
- **After `delivered.md`**: only the card of a role whose guide took a new training gap is written again.

Each format writes only its own files: `deck` the deck, `facilitator` the facilitator guide, `modules` the modules, `cards` the cards, `videos` the video scripts. A cut-off run writes the ones not yet written and never rewrites one that exists.

## 2. What it reads (all as data)

`docs.yaml` (roles, ids, tasks, gaps, trainer), `plan.md`, every guide, `shots/index.md` (`cleared` rows only, each image compared with its row's `sha256` where code can run: `shots-index-format.md` §4), and each role's `uat/<client>/scenarios/SC-nn.md` for the demo script and the exercises (UAT's test data, by pointer).

## 3. The rules

- **The deck**: one slide per `##`, a session per role, the role's tasks as live demos on UAT's test data by pointer; speaker notes in `::: notes` blocks; it passes ow-tools' deck rules (`document-formats.md` §6). Nothing internal in a slide or a note.
- **The facilitator guide**: timings, the demo script, exercises with expected results, the competency check, and attendance by role and the client's id. With `trainer: client`, it is the trainer's guide too.
- **Modules**: one task each, with an exercise in the test environment and one check question with its answer.
- **Cards**: one per quoted role (`docs.yaml` `scope.roles`), never for a role the quote does not hold: the five things the role does every day, and what to do when something looks wrong.
- **Video scripts**: one task each, with a shot list; the user records them.
- **Every Training-gap topic** is marked (`Came up in testing: UAT-nn.`) in the deck, its role's modules and its role's card.
- **Trace, people, credentials, internal numbers and private names** as for the documents (`phase-write.md` §3).

Self-checks: Trace, Coverage, People by role or id, No credentials, No internal numbers, No private names.

## 4. STATUS and NEXT

STATUS: the last file written with `next: ow-documentation /ow-documentation-train docs/<client>/ | awaiting: none` while a format is left, else `next: ow-documentation /ow-documentation-export docs/<client>/ | awaiting: none`.

The NEXT block: a format left, `use ow-documentation-train on docs/<client>/`; every format written, `use ow-documentation-export on docs/<client>/`.
