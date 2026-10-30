# Phase: `/ow-handoff-delivered <date>`

Records the day the user sent the Handoff notes and writes `dates.yaml` **once** (`package-and-dates.md` §3). The delivery date comes through the protocol's time-source ladder; the delivery is recorded as reported: "delivery not verified by this skill".

## 1. Entry

- No `handoff.yaml` `frozen:`: `Refused: the handoff is not started.`
- No `package.yaml`, or `package_steps` short of `email`: `Refused: the Handoff notes are not packaged.` and the package NEXT. (A `package.yaml` the user never made, with notes delivered by hand: the dates come from delivery + N, with no correction email.)
- `dates.yaml` exists: `Nothing to do: the window dates were recorded on <date>.`, `Nothing was written.`
- A check that runs here is FINDING: refuse.

## 2. Steps

1. **`correction`**: work out `handoff_date`, `window_end` (the later of `planned_end` and delivery + `fix_window_days` calendar days) and `access_removal_date` (minus the frozen lead in business days, on `profile.md`'s holidays; absent: weekends only, said), through `ow-tools calc date` or labelled `not machine-checked`. When any differs from its provisional date, draft `export/window-correction-email.{html,txt}` naming each new date: the end, the removal (decide-by) and the care start. No date moved: nothing is written at this step.
2. **`dates`**: write `dates.yaml`, last.

## 3. NEXT

    DONE: delivered <date> -> handoffs/<client>/dates.yaml (window ends <date>)

then the self-check line, and in this order: the delivery-payment NEXT, only on a smaller project (`handoff.yaml` `project: smaller`) when `builds/<client>/ledger.md` does not show the delivery half invoiced or requested (it may have been under ow-uat's backstop), and following a governing delivery definition recorded in `uat/<client>/uat.yaml`; the documentation rollout NEXT, when the line was bought; then the offer NEXT.
