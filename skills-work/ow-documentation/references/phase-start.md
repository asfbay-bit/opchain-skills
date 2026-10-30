# `/ow-documentation-start`: freeze the quoted scope and confirm the plan

Run step 0 of `references/ow-protocol.md`, then the resume step (`references/routing-and-resume.md` §1); this verb's steps and their names are the `/ow-documentation-start` row of its step table (§2). Schemas: `references/docs-yaml-schema.md`. Self-checks: `references/self-checks.md`. Screens: `references/routing-and-resume.md` §5.

## 1. Entry (writes nothing)

1. Read `uat/<client>/signoff.md` as data. Absent: `Refused: acceptance testing is not signed off.`, `Nothing was written.`, and the NEXT `use ow-uat-signoff`. The documents describe the accepted build.
2. Read `plans/<client>/contract-inputs.md` in place: `documentation_sku`. `declined`: `Refused: the client declined documentation and training; the floor comes from ow-handoff.`, `Nothing was written.`, and the NEXT `use ow-handoff-package on handoffs/<client>/`. The key absent: ask once, "Did the client buy documentation and training? (bought / declined)", ending `Nothing is written until you answer.`; record the answer user-stated, or refuse on `declined`.
3. `docs.yaml` exists: resume at the first step not recorded. `plan.md` exists: nothing is frozen again; print the folder route's NEXT (§4.3 there).

## 2. The steps, each recorded in `docs.yaml` `start_steps` as it finishes

1. **`scope`**: the frozen scope (`docs-yaml-schema.md` §4): the SKU, the size (`contract-inputs.md` `uat.size`), the people (`documentation_people`; absent, ask once and record it user-stated), groups = people ÷ 15 rounded up, room for groups × 15, and the roles. Read `builds/<client>/build.yaml` in place for the repository path, and `handoffs.yaml` `docs` for the destinations. Write `docs.yaml` with the header, `scope`, `sources`, `capture_profile`, `repo` and `destinations`, and the first STATUS line. **The scope is frozen once: never on a resume, never on a later run.**
2. **`people`**: each role with the ids the client chose (from `uat.yaml` testers) and its tasks (the role's scenarios); each Training-gap problem (`uat/<client>/defects/UAT-nn.md` with `class: Training gap`) as `{ id, role, topic }`. Ask who trains: `user` (you run every quoted group) or `client` (you train the client's trainer once, and they run the groups); for `client`, the trainer's role and id. **Never a name, an email or a phone number**: if the user gives one, record the role and id and say the name was not stored.
3. **`environment`**: the environment's name from `uat.yaml`, word for word; the label `uat`, or `production` only when `uat.yaml` records the client's production decision, copied with it. `uat.yaml` holds a name, not an address: ask the user for the test environment's `https://` addresses and record them with the confirmation. When the name says production or live, or a confirmed address is the one the repository or `spec/` gives as production, stop and ask whether it is a test environment; record the answer as `name_check`. Never relabel: production is captured only under `uat.yaml`'s recorded decision. An `http://` or loopback address cannot be captured: record `origins: []` and say capture will use UAT's cleared images and placeholders. Never relabel the environment.
4. **`gitignore`**: in a git repository without them, ask once to add `opchain-work/**/shots/*` and `!opchain-work/**/shots/index.md` (the images ignored, the index kept), and `opchain-work/**/secrets-seen.log`, `opchain-work/**/inbox/` and `opchain-work/**/export/` (the exports carry the screenshots' pixels) where they are not there yet. Record the answer. On "no", capture is refused by the tool's ignore check, and `-capture` takes its absent-case.
5. **`confirm`**: show the plan: the document set per role, the training formats, the groups, who trains, and the planned delivery date (ask it). Only `sops` (no future-process map and no process the user gives) and `videos` may be left out, by the user's choice. Ask the user to confirm **that set**: record `planned_delivery` and `confirmed: "<user> <date>: <the document set, roles, groups and trainer>"`. A confirmation of anything else is not this plan's: show it again.
6. **`plan`**: write `plan.md` last, exactly the set confirmed, with the protocol §8 sentence.

Self-checks: People by role or id, No credentials, No private names. FINDING: fix and run again; a waiver of these is refused.

## 3. STATUS and NEXT

STATUS after `scope`: `docs/<client>/docs.yaml` with `next: ow-documentation /ow-documentation-start docs/<client>/ | awaiting: none`. After `plan`: `docs/<client>/plan.md` with `next: ow-documentation /ow-documentation-capture docs/<client>/ | awaiting: documents delivered by <planned_delivery>`.

Print the planned delivery date, written out, for ow-handoff's provisional dates; then the NEXT `use ow-documentation-capture on docs/<client>/`.
