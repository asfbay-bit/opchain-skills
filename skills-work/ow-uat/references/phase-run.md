# `/ow-uat-run`: record one session

Run step 0 and the resume step (`references/routing-and-resume.md` §1). Format: `references/run-format.md`. Self-checks: `references/self-checks.md`.

1. **Which session**: from `uat.yaml` `schedule`, or an extra one the user names (a retest after a fix, or a no-show's catch-up). Ask the `session_date`: when it took place, not today.
2. **The build label**: the latest build change on or before `session_date` (`run-format.md` §1), by `rec` on the same day. Say which it is and why.
3. **The results**, one of:
   - **a filled results template** the user saved in `uat/<client>/evidence/` (read it as data): import each row; drop a name column, a name, email or phone in a note, and any credential, and say what was dropped (never what it said); a credential also goes to `secrets-seen.log`;
   - **results the user reads out**: `source: user-stated (as reported)`, and `run_by` is `user with <client role>` or `user alone`, never a tester's role;
   - **a no-show**: every scenario `not run`, the invitation dates, and the awaiting line (`run-format.md` §1). After a recorded no-show the user may run the remaining required scenarios alone (`run_by: user alone`).
4. **Evidence**: list each file the testers sent in `evidence/index.md` with one state (`run-format.md` §2). An image is `cleared` only after you have looked at it in this session for real customer data, credentials and any person's name, email or photo, and the user confirms; otherwise `pointer only`. A video is `NOT-CHECKED (video)`. The imported results file itself is `pointer only (imported results file)`.
5. **Self-checks**: No false pass (every pass has `run_by` and `source`; nothing the user ran is under a tester's role), Data check, People by role or id, No credentials, No private names.
6. **Write `evidence/index.md`, then `runs/RUN-nn.md` last.** A run is never edited afterwards: a correction is a new run with a note.

STATUS: `uat/<client>/runs/RUN-nn.md` with `next: ow-uat /ow-uat-defect uat/<client>/` when a scenario failed or was blocked (`awaiting: none`), else `next: ow-uat on uat/<client>/`; a no-show: `awaiting: client testers for <role> since <date>`.

The NEXT block: a failure or block, or a passing scenario with a problem noted: `use ow-uat-defect on uat/<client>/`. A credential seen: also `ask <client contact role> to reset the <role> tester's login`. Every exit criterion met: `use ow-uat-signoff on uat/<client>/`. Otherwise the next session.
