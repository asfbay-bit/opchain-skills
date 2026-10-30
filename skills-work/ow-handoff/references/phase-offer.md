# Phase: `/ow-handoff-offer` (and `--rerun`)

Writes `after-offer.md` and `export/after-offer.html` (`offer-format.md`).

## 1. Entry

- No `handoff.yaml` `frozen:`: `Refused: the handoff is not started.`
- `close.md` exists: `Refused: the offer is closed; the workstream closed on <date>.`, `Nothing was written.`
- A check that runs here is FINDING: refuse.
- `after-offer.md` exists: the run is `--rerun`.

## 2. Steps

### `/ow-handoff-offer`

1. **`terms`**: copy `offers.md` `after_handoff` unchanged into `## Frozen terms`, every tier and term (H4: `rollover` structured, `rollover_wording` beside it, `urgent_price` when offered); write the recommendation with its cited signals and the decide-by date. No `after_handoff`: no offer, `choice: undecided`, and "add an after_handoff section to offers.md".
2. **`choice`**: append the client's choice as the user reports it (`care`, `hourly`, `none`, `undecided`), with `decided_on`, `recorded_by` and, for care, the tier, the care start and the ow-care answer, asked (`offer-format.md` §3). Set the header's `choice`.
3. **`html`**: `export/after-offer.html`.

### `/ow-handoff-offer --rerun`

1. **`choice`**: append a new choice; keep every earlier one; the frozen terms do not change.

## 3. Screen

    DONE: offer, choice <choice> -> handoffs/<client>/after-offer.md

then the self-check line and the access NEXT.
