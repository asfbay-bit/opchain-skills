# `/ow-uat-defect`: log, triage and follow each problem

Run step 0 and the resume step (`references/routing-and-resume.md` §1); a basis mismatch blocks triage (logging still works). Format and every rule: `references/defect-format.md`. Self-checks: `references/self-checks.md`.

**Step 0 after sign-off:** mark each UAT-nn on `punch-list.md` `moved to punch list` if it is not already. Then: a new problem from the main scenarios is refused (`defect-format.md` §7); one from an `--addendum` scenario is logged and judged against its change order.

1. **Log** each problem once: from a run (a `fail` or `blocked` scenario, or a problem noted on a passing one) or from a client report (record when it **arrived**). A report after a request was sent: qualifying or not (`defect-format.md` §6). The same problem as an existing UAT-nn: Duplicate.
2. **Triage** against `agreed/`: class, severity, the basis item cited, the reason the client sees. Severity gates are for class Defect only.
3. **Follow**, one history line per event, each with its `rec`:
   - a Defect goes to the builder (`handoffs.yaml` `build`); `fixed` only with the build label the user gives; the retest is a new run;
   - a Change: NEXT to price it; a condition, with its change order (signed: `--add-co`; declined: lapsed). Read ow-build's `builds/<client>/changes/CO-nn.md` status and, for a condition, its `builds/<client>/changes/requests.md` row in place: `too big for a change order` blocks until the client withdraws it (owner decision O6). Rewrite the client reason each time the condition is set, met, lapses or is withdrawn, so it always says whether it blocks sign-off (`defect-format.md` §5);
   - **bounds** (`defect-format.md` §5): a blocker or major Defect past `fix_rounds` or `fix_business_days` is escalated; extensions are builder cause (no charge) or client cause (requested on **every** UAT-nn the event affects, one change order for one event). An escalation never stops you recording anything else;
   - **supersession**: a reproduced blocker or major, a late cannot-reproduce notice, a new condition, or a `fixed` on a UAT-nn from the main scenarios, recorded after a live request was written: append `request <n> will be superseded` to the UAT-nn and to `STATUS.md` (only `-signoff` writes `signoff-requests.yaml`);
   - minors and cosmetics may move to the punch list (Defects only); a Training gap is `passed to documentation`; an Environment or data problem is `closed` when its scenario's re-run passes.
4. **Self-checks**: Triage cites the basis, Fix bounds, People by role or id, No credentials, No internal numbers (the reason the client sees), No private names, No false pass (no reason or NEXT calls a UAT-nn fixed unless its latest event is `retested-pass`).
5. Write each UAT-nn.

STATUS: `uat/<client>/defects/UAT-nn.md` (the last one written) with `next: ow-uat /ow-uat-run uat/<client>/` while a fix waits for its retest, `next: ow-build /ow-build-change uat/<client>/defects/UAT-nn.md` for a Change or an extension, `next: ow-uat /ow-uat-signoff uat/<client>/` once every exit criterion holds; `awaiting: fix of <UAT-nn> by <its bound date>` while one is with the builder, with `(request <n> will be superseded)` when it supersedes one.

The NEXT block, by what was recorded: a Change or an extension request, `use ow-build to price the change from uat/<client>/defects/UAT-nn.md` (one NEXT naming every UAT-nn of one extension event); a Defect sent, handoffs.yaml `build`; a condition's change order signed, `use ow-uat-plan to add CO-nn to uat/<client>/`; a fix recorded, `use ow-uat-run on uat/<client>/`; criteria met, `use ow-uat-signoff on uat/<client>/`; after sign-off, `use ow-handoff-fix on handoffs/<client>/`.
