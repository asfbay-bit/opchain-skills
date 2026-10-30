# `/ow-documentation-capture`: a screenshot for every task step

Run step 0 and the resume step (`references/routing-and-resume.md` §1); this verb's steps are the `/ow-documentation-capture` row of its step table. Formats: `references/shots-index-format.md`. What leaves the machine: `references/delivery-rules.md` §1. Self-checks: `references/self-checks.md`.

## 1. Entry

1. `plan.md` missing: refuse; the folder route's NEXT.
2. Read as data: `uat/<client>/uat.yaml` (`environment`, `test_data`, `side_effects`), every `uat/<client>/scenarios/SC-nn.md` (role, steps, data pointers) and `uat/<client>/evidence/index.md` (its `cleared` items).
3. **Can capture run here?** If you can run code here and `ow-tools version` answers and lists `capture`, and `docs.yaml` `environment.origins` holds an `https://` origin, take the steps. Otherwise take the absent-case (section 3). Never imitate the tool.

## 2. The steps, each recorded in `shots/index.md` `capture_steps` as it finishes

1. **`decision`**: when `uat.yaml` `test_data.real` lists a check a captured scenario proves, ask: capture those screens with synthetic data, or the client's decision to capture them with real data (role, date, and every check it covers), ending `Nothing is written until you answer.` A UAT real-data decision covers testing, not screenshots handed to a whole team. Write `shots/index.md` (header, `capture_decision`), with no rows yet.
2. **`plan`**: write `capture-plan.json` (`shots-index-format.md` §1): the environment exactly as `docs.yaml` labels it, never relabelled; production only with `uat.yaml`'s decision, passed as `decision`; the confirmed origins; fill values from synthetic data pointers only; no credential; a form submit (a click or fill that sends, pays or writes elsewhere) only where the scenario's `uat.yaml` `side_effects` line is for a test or sandbox environment. A line approved for a live run never carries over to screenshots: the step stops at the screen before the submit, and the result's image is UAT's cleared evidence or a placeholder.
3. **`run`**: `ow-tools capture --plan docs/<client>/capture-plan.json --out docs/<client>/shots/`, with `--sign-in` the first time (the user signs in in the tool's own window; never type, read or store a credential). Record the command, the exit code, any `reason`, and the tool's output as it is (each image's `sha256` included), with every path made relative and the profile's folder never written (`kept in the ow-tools data folder (capture/<capture_profile>)`).
   - Exit 0: each image is `pending`.
   - Exit 3: the absent-case (section 3).
   - Exit 4: the tool refused before writing (`plan-invalid`, `origin-not-allowed`, `origin-address-not-allowed`, `production-without-decision`, `secret-field`, `secret-value`, `not-ignored`, `not-in-shots-folder`, `profile-in-use`): say the reason in plain words and fix the plan, or take the absent-case. Nothing was written.
   - Exit 5 (`navigation-failed`, `selector-not-found`, `not-signed-in`, `screenshot-size`, `timeout`, `browser-exited`): the images in the tool's `written` list are `pending`; every other step keeps its placeholder. `selector-not-found` on a signed-out page: run again with `--sign-in`.
   - Exit 1, 128 or more, or an exit 5 with no reason: a tool failed; claim nothing about any image.
4. **`check`**: the data check on each `pending` image (`shots-index-format.md` §2, `self-checks.md` §5): look at it in this session for real customer data, a credential, and any person's name, email or photo. `cleared` only when nothing is there **and** the user confirms that file by name; the note names the image's `sha256` from the run (`shots-index-format.md` §4). A real customer name, a credential or a person: `pointer only (data check: …)`, a line under `## Findings`, never used. Write each row; the rows are the last thing written.

**Filling a placeholder later**, or an image changed since it was cleared: never run a plan whose images are indexed again. Write `capture-plan-nn.json` (`nn` from 02) with only the steps whose rows are not `cleared`, record its run under `runs`, and check its images; a `cleared` image is never overwritten.

## 3. Without ow-tools, exit 3, or no `https://` origin

Record `plan` and `run` as `none (<reason>)`. At `check`, index each step once: UAT's `cleared` evidence where it shows that step (`cleared (UAT evidence)`, image `uat/<client>/evidence/<item>`), otherwise `pointer only (no capture here: <reason>)` with its placeholder `[screenshot: <SC-nn> step <k>]`. A placeholder blocks `-export` until it is filled or removed.

Self-checks: Data check, People by role or id, No credentials, No private names.

## 4. STATUS and NEXT

STATUS: `docs/<client>/shots/index.md` with `next: ow-documentation /ow-documentation-write docs/<client>/ | awaiting: none`. NEXT: `use ow-documentation-write on docs/<client>/`. Say how many images are `cleared`, `pointer only` and `pending`, and: "The capture profile `<capture_profile>` keeps your signed-in test session; remove it when the work ends: `ow-tools capture --delete-profile <capture_profile>`."
