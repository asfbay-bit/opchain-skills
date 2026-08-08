# Migration Playbooks

Step-by-step migration of existing Claude API code across model versions, plus
retired-model replacement. The deliverable is a **diff PR**, eval-gated before
merge — never a silent in-place rewrite. Breaking-change facts here are sourced
from the bundled `claude-api` skill's `shared/model-migration.md`; verify against
it for the authoritative, always-current list.

## Step 0 — Confirm scope before any edit

If the user didn't name a specific file, directory, or file list, **ask before
editing**. "Migrate my codebase", "upgrade to Sonnet 4.6", "move my project to
Opus 4.8" are *ambiguous* — they say what, not where. Offer the common scopes
(whole working dir / a subdirectory / a named file list) and wait for the answer.
Proceed without asking only when the prompt names an exact file, a specific
directory, or an explicit list.

On large repos, size the scope first:

```sh
rg -l "<old-model-id>" --type-not md | cut -d/ -f1 | sort | uniq -c | sort -rn
```

Confirm `git status` is clean before surveying.

## Step 1 — Classify each file

Not every file with the old model ID is an API caller. The action differs:

| Bucket | Looks like | Action |
|---|---|---|
| **Calls the API** | `messages.create(model=...)`, request payloads | Swap the ID **and** apply the breaking-change checklist |
| **Defines/serves the model** | Model registries, OpenAPI specs, routing configs, enums | Old entry stays. **Add the new model alongside** by default — never blind-replace (de-registers a live model) |
| **Opaque string ref** | UI fallback constants, capability gates, test fixtures | Usually swap, but check sub-cases below |
| **Suffixed variant** | `claude-X-fast`, `-1024k`, dated snapshots | Routing IDs, not public IDs. Verify in the registry; if no new equivalent, leave it and flag |

Sub-cases for opaque string refs: capability gates (`if 'opus-4-6' in id:`) →
**add the new ID alongside**, don't replace; registry-assert tests → add a new
assertion, keep the old; generated snapshots → **regenerate**, don't hand-edit.

Grep for intentional sync markers (`MODEL LAUNCH`, `KEEP IN SYNC`,
`@model-update`) *before* the broad model-ID grep — those point at the
load-bearing changes.

## Step 2 — Apply the per-target breaking-change checklist

`[BLOCKS]` = causes a 400 / wrong behavior if missed (a code edit). `[TUNE]` =
quality/cost recommendation.

### 4.6 → 4.7 (and any older → 4.7)

- `[BLOCKS]` `thinking: {type: "enabled", budget_tokens: N}` → `{type: "adaptive"}` + `output_config.effort`. Delete `budget_tokens` plumbing.
- `[BLOCKS]` Remove `temperature`, `top_p`, `top_k` (all 400 on 4.7).
- `[BLOCKS]` Remove last-assistant-turn prefills → use `output_config.format` (structured outputs) or a system-prompt instruction.
- `[BLOCKS]` If reasoning is shown to users, add `thinking.display: "summarized"` (default is `"omitted"` → empty thinking text).
- `[BLOCKS]` At `effort` of `xhigh`/`max`, set `max_tokens` ≥ 64000 (and stream).
- `[TUNE]` Re-baseline tokens with `count_tokens` (4.7 counts higher than 4.6); re-tune `effort` (use `xhigh` for coding/agentic, `high` minimum for intelligence-sensitive work).

### 4.7 → 4.8

- `[BLOCKS]` Swap the model string to `claude-opus-4-8`. **No new breaking changes** — same request surface as 4.7.
- `[TUNE]` Re-tune prompts: 4.8 narrates more (add a silence-default if too chatty), is warmer/less hedged, asks more often (add small-decisions-don't-ask guidance), under-reaches for search/subagents/memory/custom tools (add explicit triggering). Consider mid-session `role:"system"` messages for context the app learns mid-session.

### → Fable 5 (explicit opt-in only)

- `[BLOCKS]` Model string `claude-fable-5`.
- `[BLOCKS]` Remove **all** `thinking` config — thinking is always on; `{type: "disabled"}` and `{type: "enabled", budget_tokens: N}` both 400. Omit the param.
- `[BLOCKS]` Remove assistant prefill.
- `[BLOCKS]` Confirm the org meets 30-day data retention (ZDR orgs 400 on every request).
- `[BLOCKS]` Add `stop_reason == "refusal"` handling before reading `content`; opt into a fallback by default (server-side `fallbacks` param, beta `server-side-fallback-2026-06-01`, fallback target `claude-opus-4-8`).
- `[TUNE]` Plan for minutes-long turns (timeouts, streaming, async check-ins); run an effort sweep including low/medium; A/B with prior-model prompt scaffolding removed (over-prescriptive prompts reduce Fable 5 quality).

### Retired-model replacement (these 404)

| Retired | Replacement |
|---|---|
| `claude-3-7-sonnet-20250219` | `claude-sonnet-4-6` |
| `claude-3-5-haiku-20241022` | `claude-haiku-4-5` |
| `claude-3-opus-20240229` | `claude-opus-4-8` |
| `claude-3-5-sonnet-2024*` | `claude-sonnet-4-6` |

## Step 3 — Explain every edit

Migration edits look arbitrary without context. For each, state what changed and
why, tied to the specific API/behavioral shift. Be especially explicit about
system-prompt edits (quote before/after, mark `[TUNE]` vs `[BLOCKS]`) — never
present an optional prompt change as mandatory.

## Step 4 — Eval-gate the rollout

Hand the diff to `oc-prompt-ops` for a regression run against the golden set
before merge. A model bump can shift output shape, length, and tool-use rate even
when nothing 400s — the eval catches regressions the checklist can't.

## Step 5 — Open the PR

Route the diff through `oc-git-ops` (`/oc-git-pr`). The PR body lists: source →
target model, files touched (with bucket from Step 1), the `[BLOCKS]` items
applied, and the eval result.

## Step 6 — Verify

```python
TARGET = "claude-opus-4-8"
resp = client.messages.create(model=TARGET, max_tokens=64, messages=[...])
assert resp.model.startswith(TARGET), resp.model
```

Inspect `resp.stop_reason`, `resp.usage`, and tool-use/thinking behavior against
expectations. Note: changing the model string invalidates the existing prompt
cache — the first request on the new model writes the cache fresh.
