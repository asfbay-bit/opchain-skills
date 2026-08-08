# Local Metering

The metering store is a single local SQLite file, `.checkpoints/usage.sqlite`,
**gitignored** (unlike the tracked checkpoint JSONs — see `.gitignore`). It records
*that* a skill/phase ran and what it cost — never *what* was in the prompt. Writes
happen only when telemetry is enabled (`telemetry_handle.enabled === true`).

## Why SQLite, not JSON

Usage is append-heavy, time-series-shaped, and queried by aggregate (`COUNT`,
`SUM`, `GROUP BY skill`). A growing JSON array would be slow to append and a merge-
conflict magnet (the exact bug the checkpoint protocol warns about). SQLite is a
single local file, zero-server, perfect for local-first aggregation, and it's
gitignored so it never enters version control or conflicts.

## Schema

Two tables. No table stores prompt text, file contents, file paths, or any user
identifier.

```sql
-- One row per metered skill run.
CREATE TABLE IF NOT EXISTS runs (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  handle        TEXT NOT NULL,      -- anonymous local id (telemetry_handle.id), NOT user-derived
  skill         TEXT NOT NULL,      -- e.g. "oc-app-architect"
  phase         TEXT,               -- e.g. "build", "spec" (skill-defined; nullable)
  command       TEXT,               -- the verb only, e.g. "/oc-build" (no args)
  model_tier    TEXT,               -- "haiku" | "sonnet" | "opus" | "fable" (tier, not full id)
  cost_usd      REAL,               -- attributed by oc-cost-ops (nullable if not costed)
  input_tokens  INTEGER,            -- counts only, never content
  output_tokens INTEGER,
  outcome       TEXT,               -- "pass" | "fail" | "complete" | null
  started_at    TEXT NOT NULL,      -- ISO-8601 UTC
  duration_ms   INTEGER
);

-- Optional finer-grained events within a run (eval rounds, gate results).
CREATE TABLE IF NOT EXISTS events (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  run_id     INTEGER NOT NULL REFERENCES runs(id),
  kind       TEXT NOT NULL,         -- "eval" | "gate" | "sprint" | ...
  label      TEXT,                  -- short, non-identifying (e.g. "sprint-2")
  score      REAL,                  -- eval score if applicable (rubric-relative)
  at         TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_runs_skill   ON runs(skill);
CREATE INDEX IF NOT EXISTS idx_runs_started ON runs(started_at);
```

### What is deliberately NOT a column

- prompt / system-prompt text, message content, tool I/O
- file paths, file names, repo names, project names
- user name, email, machine name, IP, any stable user identifier
- the full model ID (only the *tier* — `opus`, not `claude-opus-4-8` — which is
  all the `/dashboard` distribution needs)

The schema is the privacy guarantee in structural form: if a field that could
identify a person or leak content isn't a column, it can't be recorded.

## Write path

```
skill run (telemetry enabled?) ──yes──► INSERT INTO runs(...)   [local sqlite]
                                │
                                └──no──► no-op (zero writes)
```

- The owning skill (or oc-cost-ops, which already has the token counts) inserts a
  `runs` row at the end of a metered run.
- `cost_usd` is filled from oc-cost-ops's attribution when available; null otherwise.
- Disabled telemetry takes the no-op branch — **verified by the "opt-out → zero
  writes" test**: with `enabled: false`, a run produces no INSERT.

## Lifecycle

| Command | Effect |
|---|---|
| `/oc-telemetry enable` | create the file + schema if absent; set `telemetry_handle.enabled = true`, mint a random `handle` |
| `/oc-telemetry disable` | set `enabled = false`; **stop writing** (the file is kept — deleting it is the user's call) |
| `/oc-telemetry status` | report enabled state, store path, `SELECT COUNT(*) FROM runs` |

The store is purely local. It is never uploaded; only the derived aggregate
(`aggregation.md`) ever leaves the machine, and only when the user runs
`/oc-telemetry export`.
