# PM-MCP Protocol (v1.3+)

Canonical runtime contract for opchain skills that read and write project-management
tickets through MCP servers. v1.2 introduced the prose; v1.3 makes it executable.

This document is referenced by `oc-integrations-engineer` (canonical owner) and by every
downstream PM-aware skill: `oc-app-architect`, `oc-git-ops`, `oc-deploy-ops`, `oc-monitoring-ops`,
and `oc-release-ops`. **All concrete MCP tool invocations made by those skills must
follow this contract.**

---

## 1. Concrete tool-name registry

Skills must call MCP tools by their **actual concrete name** as exposed to Claude
Code, not by placeholder identifiers like `mcp.<provider>.get_issue`.

The registry below is the source of truth. When a session detects a new tool name
(MCP server upgrades), update this table and re-run `npm run validate-pm-mcp`.

| Operation | Linear | GitHub Issues | Jira (Atlassian MCP) |
|---|---|---|---|
| **Read one issue** | `mcp__claude_ai_Linear__get_issue` | `mcp__mcp-server-github__issue_read` | `mcp__atlassian__jira_get_issue` * |
| **List issues** | `mcp__claude_ai_Linear__list_issues` | `mcp__mcp-server-github__list_issues` | `mcp__atlassian__jira_search` * |
| **List comments** | `mcp__claude_ai_Linear__list_comments` | (use `issue_read` — comments inline) | `mcp__atlassian__jira_get_comments` * |
| **Add comment** | `mcp__claude_ai_Linear__save_comment` | `mcp__mcp-server-github__add_issue_comment` | `mcp__atlassian__jira_add_comment` * |
| **Create issue** | `mcp__claude_ai_Linear__save_issue` (no `id`) | `mcp__mcp-server-github__issue_write` (action=create) | `mcp__atlassian__jira_create_issue` * |
| **Transition state** | `mcp__claude_ai_Linear__save_issue` (with `state`) | `mcp__mcp-server-github__issue_write` (with state) | `mcp__atlassian__jira_transition_issue` * |
| **List statuses** | `mcp__claude_ai_Linear__list_issue_statuses` | (none — uses string labels) | `mcp__atlassian__jira_get_transitions` * |
| **Get team / project** | `mcp__claude_ai_Linear__get_team` / `get_project` | (org / repo via URL) | `mcp__atlassian__jira_get_project` * |

\* Jira tool names are **expected** based on Atlassian's published MCP surface. Skills
should consult `.opchain/pm.yaml` `tool_overrides` map when the deployed MCP server
exposes different names. The validator warns rather than errors on Jira mismatches
because Atlassian's tool surface is still stabilising as of 2026-05.

### Tool-override escape hatch

`.opchain/pm.yaml` may include a `tool_overrides` map for environments where the
MCP server is forked or namespaced:

```yaml
tool_overrides:
  get_issue: "mcp__corp-linear-broker__get_issue"
  add_comment: "mcp__corp-linear-broker__save_comment"
  # any operation may be overridden; unspecified ops fall through to the registry
```

Regulated environments (HIPAA / FedRAMP / CMMC) almost always need this — the
broker / redactor sits in front of the upstream MCP server. See the
`mcp-enterprise-f500` and `mcp-enterprise-defense` scenarios.

---

## 2. Retry & backoff

PM-MCP calls are network calls and fail. The skill is responsible for retrying
read calls and idempotent write calls within a bounded budget, then deferring the
write to the checkpoint queue if the budget is exhausted.

### Policy

```
max_attempts:        3
backoff_schedule:    1s, 3s, 9s   (exponential, factor 3)
jitter:              ±20% per delay
abort_on_4xx:        true (except 429)
abort_on_429:        false — honour Retry-After if present, else schedule
total_budget:        15 seconds (sum of delays + call latencies)
```

### What counts as retriable

| Failure | Retry? | Reason |
|---|---|---|
| Network timeout / DNS / TCP reset | yes | Transient |
| 5xx from MCP server | yes | Transient |
| 429 (rate-limit) | yes | Transient; honour `Retry-After` |
| 401 / 403 | **no** | Auth / scope problem; surface and stop |
| 404 (issue not found) | **no** | Treat as "not found"; ask user to confirm id |
| 422 (validation) | **no** | Skill produced an invalid payload; surface for fix |
| Schema / parse error in response | **no** | Surface; do not loop |

### Why these numbers

- Discovery / sprint-plan flows are **synchronous from the user's perspective**.
  A 15-second worst-case keeps the agent responsive.
- 3 attempts handles the dominant transient class (single packet loss, MCP server
  restart, brief rate-limit) without amplifying outages.
- Jitter (±20%) prevents synchronised retry storms when many sessions share an
  MCP server.

---

## 3. Idempotency

PM writes from agent flows are inherently retried (sessions resume; users invoke
`--retry-pm`; transient failures cause re-tries). Every write must be idempotent.

### Idempotency markers

Every comment body composed by an opchain skill **must** include an HTML-comment
marker of the form:

```html
<!-- opchain:<skill>:<event>:<correlation-id> -->
```

Where:
- `<skill>` = the producing skill (`oc-app-architect`, `oc-git-ops`, `oc-deploy-ops`,
  `oc-monitoring-ops`, `oc-release-ops`).
- `<event>` = the named event the comment represents (`sprint-contract`,
  `pr-opened`, `pr-merged`, `staging-verified`, `prod-shipped`, `incident-fired`,
  `release-announced`, ...).
- `<correlation-id>` = a stable id that uniquely identifies the event for that
  ticket. For sprint comments: `sprint-N`. For PR events: the PR number.
  For deploy events: the deploy-ticket id. For incidents: the alert-event id.

### Pre-write check

Before calling `add_comment`, the skill **must**:

1. Fetch existing comments via `list_comments` (or `get_issue` with comments
   inline for GitHub).
2. Search the comment bodies for the exact marker.
3. If a marker match exists, **skip the write**. Log the skip to the checkpoint
   under `pm_idempotent_skips[]` with `{ticket, marker, observed_at}`.

The pre-write check is a single MCP read; it adds latency but prevents
duplicate-comment spam during retries and resumed sessions.

### Issue creation idempotency

Auto-created tickets (deploy tickets, incident tickets) include the marker in
the issue **description** rather than in a comment. Before creation, the skill
calls `list_issues` filtered by:
- The configured `team_or_project`.
- The configured issue type (`deploy`, `incident`).
- A description-text query for the marker.

If a match exists, the skill **reuses** the existing ticket id rather than
creating a new one.

---

## 4. Deferred-action queue

When retries are exhausted (or the user is offline / MCP unconfigured / a 4xx
makes the write infeasible *now*), the intended write is recorded to the
calling skill's checkpoint and surfaced for later flushing.

### Checkpoint schema

Every skill that performs PM writes adds a top-level `pm_deferred_actions`
array to its checkpoint (alongside the existing `skill_state`):

```json
{
  "pm_deferred_actions": [
    {
      "id": "deferred-2026-05-07T18:21:33Z-a3f1",
      "skill": "oc-app-architect",
      "verb": "/oc-roadmap",
      "operation": "add_comment",
      "provider": "linear",
      "tool_name": "mcp__claude_ai_Linear__save_comment",
      "ticket_id": "PROJ-142",
      "marker": "<!-- opchain:oc-app-architect:sprint-contract:sprint-1 -->",
      "payload": {
        "issue_id": "PROJ-142",
        "body": "Sprint 1: Runtime PM-MCP made real ..."
      },
      "queued_at": "2026-05-07T18:21:33Z",
      "last_attempt_at": "2026-05-07T18:21:48Z",
      "attempts": 3,
      "last_error": "MCP server returned 503",
      "retriable": true
    }
  ]
}
```

### Field semantics

| Field | Required | Description |
|---|---|---|
| `id` | yes | Stable id; format `deferred-<iso-ts>-<4-hex>`. |
| `skill` | yes | Producing skill. |
| `verb` | yes | The user-facing verb that produced this (`/oc-roadmap`, `/oc-git-sync`, ...). |
| `operation` | yes | Logical op: `get_issue`, `add_comment`, `save_issue`, `transition`. |
| `provider` | yes | `linear` / `jira` / `github-issues`. |
| `tool_name` | yes | Resolved concrete tool name from the registry (after `tool_overrides`). |
| `ticket_id` | when applicable | Source ticket id (omit for create operations). |
| `marker` | for writes | Idempotency marker the eventual flush must include. |
| `payload` | yes | Exact arguments to pass when flushing; opaque to the queue. |
| `queued_at` | yes | First-attempt time. |
| `last_attempt_at` | yes | Most recent attempt. |
| `attempts` | yes | Count. |
| `last_error` | yes | Short human-readable error string. |
| `retriable` | yes | `false` if the failure was 4xx-non-429 (do not auto-flush). |

### `--retry-pm` flush behaviour

Every PM-aware verb accepts a `--retry-pm` flag. The flush sequence:

1. Read the calling skill's checkpoint.
2. Filter `pm_deferred_actions` to those where `retriable === true`.
3. For each, replay the call using the registry retry policy (Section 2).
4. On success: remove the entry from the queue, append a record to
   `pm_flush_log[]` with `{id, flushed_at, result_id}`.
5. On failure: bump `attempts`, update `last_attempt_at` and `last_error`.
6. After the pass, surface a one-line summary to the user:
   `flushed 4 / failed 1 — see pm_deferred_actions[] for the failure`.

If `--retry-pm` is invoked with no queued actions, the skill prints
`no deferred PM actions queued`.

### When to mark `retriable: false`

| Failure | retriable |
|---|---|
| Transient network / 5xx / 429 | true |
| 401 — re-auth required | false (set, surface, stop) |
| 403 — scope violation / cross-team | false (surface to user; never auto-flush) |
| 404 — ticket no longer exists | false |
| 422 — invalid payload | false (skill bug; surface for fix) |

`retriable: false` entries persist in the queue for traceability but are
**never** flushed by `--retry-pm`. The user must clear them explicitly via
`/<verb> --retry-pm --force` (which prompts for each non-retriable entry).

---

## 5. Cross-skill consistency rules

These rules apply to every PM-aware skill. The validator (Section 6) enforces them.

1. **No placeholder names.** A skill must not write `mcp.<provider>.<verb>` in
   prose; either use the registry name or cite this protocol doc by reference.
2. **Markers everywhere.** Every comment / issue created by a skill must include
   an idempotency marker per Section 3.
3. **Pre-write check before every comment.** No skill may add a comment without
   first listing comments and matching markers.
4. **Defer, don't fail.** A failed PM write **must** never block the originating
   verb's primary output (sprint plan still produced; commit still made; deploy
   still ships). The defer-and-flush path is the only acceptable error
   handling.
5. **State names from `pm.yaml`.** A skill must not hard-code state strings;
   resolve via `.opchain/pm.yaml` `states` map.
6. **Tool overrides honoured.** A skill must consult `tool_overrides` before
   the registry default.
7. **Cite this doc.** Each skill's PM-MCP section must contain an explicit
   `See [pm-mcp-protocol.md] in oc-integrations-engineer/references` reference.

---

## 6. Validator (`npm run validate-pm-mcp`)

The validator (`scripts/validate-pm-mcp.mjs`) gates the build. It checks:

| Check | Failure mode | Severity |
|---|---|---|
| Each of the 5 PM-aware SKILL.md files contains the section anchor `## PM-Tool MCP Integration`. | Missing anchor | **error** |
| None of those 5 SKILL.md files contain the placeholder `mcp.<provider>.` pattern. | Drift back to v1.2 prose | **error** |
| Each PM-aware SKILL.md references this protocol doc. | Missing citation | **error** |
| `.opchain/pm.yaml` parses as valid YAML with required keys (`provider`, `team_or_project`, `issue_types`, `states`). | Config malformed | **error** |
| `states` keys include at minimum `in_progress`, `in_review`, `done`. | Missing core states | **error** |
| State names referenced in SKILL.md prose (`in_review`, `done`, `blocked`, `staging-verified`, `shipped`, `rolled-back`) appear in `pm.yaml` `states` or are documented in this protocol's "extended state vocabulary" appendix. | State drift | **warn** |
| Provider in `pm.yaml` is one of `linear` / `jira` / `github-issues`. | Unknown provider | **error** |
| All concrete tool names referenced in SKILL.md files exist in the registry table for the configured provider. | Tool name typo | **error** |

The validator runs in `npm run prebuild` (alongside `gen-catalog` and
`sync-docs`) and in CI. Failure blocks the build; warnings are surfaced but do
not block.

---

## Appendix A — Extended state vocabulary

The `.opchain/pm.yaml` `states` map covers the universal subset. Some skills
introduce additional states beyond the universal set:

| State | Used by | Meaning |
|---|---|---|
| `staging-verified` | oc-deploy-ops | Smoke tests passed on staging. |
| `shipped` | oc-deploy-ops | Production deploy succeeded. |
| `rolled-back` | oc-deploy-ops | Deploy reverted; do not re-attempt without root-cause. |
| `blocked` | oc-deploy-ops, oc-app-architect | Build / deploy gate failed; needs human input. |
| `resolved-pending-postmortem` | oc-monitoring-ops | Alert auto-cleared; postmortem owed. |
| `noisy-alert` (label, not state) | oc-monitoring-ops | Tagged on the incident ticket when threshold exceeded. |

Each project's `pm.yaml` should define how to map these to its actual workflow
states under a `states.extended` map. Example:

```yaml
states:
  in_progress: "In Progress"
  in_review: "In Review"
  done: "Done"
  extended:
    staging-verified: "Staging OK"
    shipped: "Shipped"
    rolled-back: "Rolled Back"
    blocked: "Blocked"
    resolved-pending-postmortem: "Pending Postmortem"
```

The validator is permissive about extended states: a skill may reference an
extended state name without a `pm.yaml` entry; the worst-case fallback is that
the skill leaves the state unchanged and posts a comment instead.

---

## Appendix B — Worked example: `oc-git-ops /oc-git-sync PROJ-142 --retry-pm`

A concrete trace of every rule above firing in sequence, drawn from the v1.3
hero scenario.

1. User runs `/oc-git-sync PROJ-142 --retry-pm` after a previous attempt deferred
   a PR-opened comment due to a 503.
2. oc-git-ops reads `.checkpoints/oc-git-ops.checkpoint.json`, finds one entry in
   `pm_deferred_actions[]` with `marker: <!-- opchain:oc-git-ops:pr-opened:#412 -->`,
   `retriable: true`.
3. Resolves provider from `.opchain/pm.yaml` → `linear`. Resolves tool name from
   the registry: `mcp__claude_ai_Linear__save_comment`. No override applies.
4. Pre-write check: calls `mcp__claude_ai_Linear__list_comments` for `PROJ-142`,
   greps for the marker. **No match** → safe to write.
5. Write: `mcp__claude_ai_Linear__save_comment` with the deferred payload.
   Succeeds on attempt 1.
6. State transition: resolve `in_review` from `pm.yaml.states` → `"In Review"`.
   Calls `mcp__claude_ai_Linear__save_issue` with `{id, state: "In Review"}`.
7. Removes the deferred entry; appends to `pm_flush_log[]` with the new comment id.
8. Surfaces: `flushed 1 / failed 0`.

The same trace with the marker already present (e.g. user ran `--retry-pm`
twice) short-circuits at step 4: the comment is **not** re-posted; the queue
entry is removed; `pm_idempotent_skips[]` gets the record. The state
transition still proceeds because `save_issue` is naturally idempotent
(setting state to its current value is a no-op upstream).

---

## Compliance posture

In regulated environments (HIPAA / FedRAMP / CMMC):

- All MCP calls **must** route through the broker; the registry's tool names
  are replaced wholesale via `tool_overrides`.
- The deferred-action queue lives in the project checkpoint, which is itself
  written to the audit pipeline by the broker / SIEM forwarder.
- Idempotency markers must include the broker-issued correlation id (the
  `correlation_id` is appended after the `<correlation-id>` segment). This
  ties the agent flow to the broker-side audit record.
- `pm_deferred_actions[]` entries with `retriable: false` and a 403 cause are
  audit-relevant: the broker rejected a scope-violating write, and the agent
  honoured it. The audit pipeline preserves both the attempt and the rejection.

See scenarios `mcp-enterprise-f500` and `mcp-enterprise-defense` for the full
broker / redactor / audit-pipeline reference architecture.
