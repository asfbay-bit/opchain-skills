# `/ow-documentation-delivered <date>`: record the delivery

Run step 0 and the resume step (`references/routing-and-resume.md` §1). Schema: `references/deliveries-schema.md` §2 and §3. Self-checks: `references/self-checks.md`.

## 1. Entry

1. **Nothing exported** (`deliveries.yaml` missing, or `export_steps` short of `push`): `Refused: nothing has been exported yet.`, `Nothing was written.`, and the export NEXT.
2. **Already delivered** (`delivered.md` exists): `Nothing to do: the documents were recorded as delivered on <date>.`, `Nothing was written.` An update inside the line, exported since (`deliveries.yaml` `updates`), is recorded with `--update <date>` (section 3).
3. **A FINDING** in a check that runs here: refuse, as `-export` does.

## 2. Record it (written once)

Ask the delivery date if it was not given (the day the documents reached the client, as the user reports it). Write `delivered.md` once: `delivered: <date>` and `Documents delivered <date written out>, recorded by <user>; delivery not verified by this skill.`, with what `deliveries.yaml` lists. **It is never edited.** Nothing is sent to the client by this skill.

Then read `builds/<client>/ledger.md` in place: the documentation line's state.

**NEXT, in this order:**

1. `use ow-build to invoice the documentation line`, **once**: only when `ledger.md` does not already show the line `requested` or `paid` (amendment B4). Shown requested or paid: no invoice NEXT; say it is already in the ledger.
2. `use ow-handoff-notes on handoffs/<client>/`: the Handoff notes now point to the runbook's `OP-nn` entries (amendment H3).
3. `use ow-documentation-rollout on docs/<client>/`: the rollout plan.

## 3. `--update <date>` (owner decision O7)

Only after `delivered.md` and an exported update (`deliveries.yaml` `updates`). Write `delivered-update-nn.md` once: its `delivered:` date, `update_of: docs/<client>/delivered.md`, the files of that update, and the gap it answers. It is never invoiced: ow-build reads only `delivered.md`. A second `--update` for the same update: nothing to do.

Self-checks: People by role or id, No credentials, No private names.

## 4. STATUS

`docs/<client>/delivered.md` with `next: ow-documentation /ow-documentation-rollout docs/<client>/ | awaiting: none` when the ledger already shows the line, else `next: ow-build /ow-build-invoice docs/<client>/delivered.md | awaiting: none`. `--update`: `docs/<client>/delivered-update-nn.md` with `next: ow-documentation /ow-documentation-rollout docs/<client>/ | awaiting: none`.
