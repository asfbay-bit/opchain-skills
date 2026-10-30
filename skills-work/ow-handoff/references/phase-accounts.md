# Phase: `/ow-handoff-accounts` (and `--transfer`, `--check`, `--complete`, `--waive`)

Writes `handoffs/<client>/accounts.md` (`accounts-format.md`). Nothing else edits it.

## 1. Entry

- No `handoff.yaml` `frozen:`: `Refused: the handoff is not started.` and the start NEXT.
- `close.md` exists and nothing reopened it: `Nothing to do: the workstream closed on <date>.`
- A record mode whose exact line is already in `## Records`: `Nothing to do: already recorded on <date>.`

## 2. Steps

### `/ow-handoff-accounts`

1. **`inventory`**: one row per account (`accounts-format.md` §1) from `plans/<client>/map/systems.md`; without it (a quick-quote job), from `build.yaml`, `quote.md`'s vendors and the user, marked `systems_map: none (built without a systems map)`, and the completeness prompt printed. Transfer items for every row that needs one.
2. **`scan`**: `ow-tools scan-secrets <repo> --json` where code runs (`accounts-format.md` §3); record the command, the exit and the status, the `not_read` and `not_scanned` lists, and the commit-messages line. Any exit but 0, or no ow-tools: NOT-CHECKED with its reason. Uncommitted files are listed by name as not scanned.
3. **`rotate`**: one rotate item per secret name: names-only sources, each scan hit (by path and rule id), and every line of every `secrets-seen.log` read; each with every place it is used.

### `/ow-handoff-accounts --transfer TR-nn`, `--check <account>`, `--complete`, `--waive <items>`

1. **`record`**: append the one line `accounts-format.md` §2 gives, naming exactly what was confirmed or waived, with protocol §8's sentence. A waiver of a check that is never waived is refused.

## 3. Screen

    DONE: accounts -> handoffs/<client>/accounts.md (<n> accounts, <n> transfer items, scan <status>)

then the self-check line and the notes NEXT.
