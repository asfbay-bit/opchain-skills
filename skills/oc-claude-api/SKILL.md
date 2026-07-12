---
name: oc-claude-api
displayName: OC · Claude API
version: 1.8.1
shortDesc: Build, debug, and migrate Claude API apps — model routing, prompt caching, tool use, version-migration playbooks.
phases: [build, ai-native]
triAgent: false
tryable: true
commands:
  - /oc-claude-api
  - /oc-claude-api migrate
  - /oc-claude-api cache-audit
  - /oc-claude-api tool-use
  - /oc-claude-api cost
description: >
  Build, debug, and optimize Claude API / Anthropic SDK apps. Apps built with
  this skill include prompt caching by default. Also migrates existing Claude
  API code between model versions (4.6 → 4.7, retired-model replacements). Use
  for /oc-claude-api, "Anthropic SDK", "prompt caching", "cache hit rate",
  "tool use", "model migration", "extended thinking", "batch API", "files API",
  "memory", "citations". Trigger liberally on Claude API work.
governance:
  breaking_change_policy: skills/CHANGELOG.md
  last_reviewed: 2026-06-21
  owner: opchain
  docs:
    - { path: SKILL.md, kind: contract, lifecycle: stable }
---

# Claude API

**On first invocation, read `references/orchestrator.md` and follow its welcome protocol.**

First-party harness for building, debugging, and optimizing applications on the
Claude API / Anthropic SDK. Owns model routing, prompt caching (on by default),
tool-use design, batch/streaming patterns, and version-migration playbooks. Apps
built or touched through this skill ship prompt caching from the first commit and
carry token-ceiling guardrails per phase.

This is the **Claude-in-the-loop** counterpart to the rest of the pipeline. If
you're building an LLM feature — a chatbot, an extraction pipeline, an agent, an
LLM judge — this skill owns the request layer: which model, how it's cached, how
tools are wired, and how the code moves when a model version bumps. It does **not**
own agent topology or harness loops (that's `oc-agent-forge`), retrieval
(`oc-rag-forge`), or prompt versioning + eval datasets (`oc-prompt-ops`). It owns
the Claude API surface those skills build on.

> **Accuracy contract.** Model IDs, prices, parameters, and breaking changes in
> this skill and its reference docs are sourced from the bundled `claude-api`
> skill, not from memory. When in doubt about a model ID, a price, a beta header,
> or a deprecated parameter, invoke `claude-api` (or read its `shared/` files)
> rather than inventing one. The most recent models are **Fable 5**
> (`claude-fable-5`), **Opus 4.8** (`claude-opus-4-8`), **Sonnet 4.6**
> (`claude-sonnet-4-6`), and **Haiku 4.5** (`claude-haiku-4-5`).

## How This Skill Fits the Build Pipeline

```
APP-ARCHITECT (planning)                 TRI-DEV (building)
  Phase 2: Spec ──"AI app?"──▶ oc-claude-api model-routing decision tree
                                         │  writes 05-llm-design.md
  Phase 5: Scaffold ──auto-calls──▶ oc-claude-api request-layer scaffold
                                         │  (caching + token ceilings baked in)
                                         ▼
                          oc-agent-forge (topology/loop) ──reads model routing──┐
                          oc-rag-forge   (retrieval)      ──reads model routing──┤
                          oc-prompt-ops  (eval/versioning)──reads model routing──┘
```

**App-architect auto-invokes oc-claude-api in Phase 2** when the discovery
interview flags an AI app — triggers are "AI app", "agent", "chatbot", "LLM in
the loop", "summarize/extract/classify with a model", "Claude", "Anthropic". The
decision tree runs, picks the per-phase model, and records the request-layer plan
in `05-llm-design.md`. The user doesn't call `/oc-claude-api` separately for new
projects — but they can invoke it directly to migrate, audit caching, design
tools, or set cost guardrails on existing code.

Model routing is **owned here and read by siblings.** `oc-agent-forge` decides
subagent topology and tool budgets but reads this skill's per-task model choice;
`oc-rag-forge` reads it for the answer-synthesis model; `oc-prompt-ops` reads it
to pin the model its eval datasets run against.

---

## /oc-claude-api — Command Reference

```
CLAUDE API COMMANDS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  BUILD / DEBUG
  /oc-claude-api          Design or debug a Claude API integration
  /oc-claude-api tool-use Schema-first tool-use patterns (defer-load, parallel)

  OPTIMIZE
  /oc-claude-api cache-audit  Audit prompt-cache hit rate (target ≥ 60%)
  /oc-claude-api cost         Token-ceiling + per-phase cost guardrails

  LIFECYCLE
  /oc-claude-api migrate  Migrate code across model versions → diff PR
  /checkpoint             Show checkpoint status

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  Type any command to begin. /oc-claude-api to see this again.
```

---

## Model-Routing Decision Tree

The first decision on any Claude API task is **which model per phase**. Default
toward capability, drop to cheaper tiers only when the task is genuinely simple or
high-volume. Read `references/model-routing.md` for the full table; the shape:

```
What is this call doing?
│
├─ Spec authoring, architecture, code audit, migration, hard reasoning,
│  long-horizon agentic work
│     └─▶ claude-opus-4-8         (the default for intelligence-sensitive work)
│        └─ most demanding / overnight autonomous runs → claude-fable-5
│
├─ Build, reverse-spec, codegen, balanced agentic loops, tool-heavy work
│     └─▶ claude-sonnet-4-6       (best speed/intelligence balance)
│
└─ Cheap repetitive phases: classification, routing, extraction, label-gen,
   high-volume summarization
      └─▶ claude-haiku-4-5        (fastest, cheapest; 200K context)
```

**Routing principles**

- **Don't downgrade silently for cost.** The model choice is the caller's; default
  to `claude-opus-4-8` for anything intelligence-sensitive and surface a cheaper
  option, don't impose it.
- **One model per cached prefix.** Caches are model-scoped — switching models
  mid-conversation invalidates the cache. For a cheaper sub-task, spawn a subagent
  on the cheaper model (Haiku) rather than swapping the main loop's model.
- **Use exact model ID strings, never date-suffixed aliases** (`claude-sonnet-4-6`,
  not `claude-sonnet-4-6-20251114`). Pull IDs from `references/model-routing.md`.
- **Effort over a thinking budget.** On 4.6+ models, control depth with
  `output_config.effort` (`low`→`max`; `xhigh` on Opus 4.7/4.8) and adaptive
  thinking (`thinking: {type: "adaptive"}`). `budget_tokens` is removed on Fable 5
  / Opus 4.8 / 4.7 (400) and deprecated on 4.6.

---

## Prompt Caching Is the Default

Every integration this skill builds ships prompt caching from the first commit —
not as a later optimization pass. Prompt caching is a **prefix match**: any byte
change anywhere in the prefix invalidates everything after it. Get the prompt
assembly order right (stable content first, volatile content last) and most
caching works for free.

What to cache, in render order (`tools` → `system` → `messages`):

- **Tool definitions** — deterministic, sorted by name, never reshuffled per request.
- **System prompt** — frozen. No `datetime.now()`, no per-user IDs, no conditional
  sections interpolated into it. Inject dynamic context later in `messages`.
- **Large shared context** — retrieved docs, few-shot examples, big preambles —
  breakpoint at the end of the *shared* span, before the varying question.

`cache_control: {type: "ephemeral"}` gives a 5-minute TTL (`ttl: "1h"` for bursty
traffic). Max 4 breakpoints per request. Verify with
`usage.cache_read_input_tokens` — zero across repeated identical-prefix requests
means a silent invalidator is at work. Full placement patterns, cost math, and the
silent-invalidator audit checklist live in `references/prompt-caching.md`.

### `/oc-claude-api cache-audit` — target ≥ 60% hit rate

`cache-audit` traces the prompt-assembly path, classifies every input by
stability, checks rendered order matches stability order, and reports the cache
hit rate against a **≥ 60%** target. Output:

```markdown
## Prompt Cache Audit

### Hit rate
- cache_read / (cache_read + cache_creation + input): 41%  ← BELOW 60% TARGET

### Silent invalidators found
| Location | Pattern | Fix |
|---|---|---|
| system prompt header | `f"Current date: {datetime.now()}"` | Move to a user-turn message |
| tools=build_tools(user) | tool set varies per user | Freeze + sort deterministically |

### Breakpoint placement
- system block: present, but invalidated upstream by the date interpolation
- Recommended: 1 breakpoint on last (frozen) system block; 1 on last shared-context block

### Verdict: FAIL — fix the two invalidators, re-audit
```

---

## Tool-Use Patterns

Three patterns, schema-first throughout. Full code shapes in
`references/tool-use.md`.

1. **Schema-first design.** Write the JSON Schema (or Zod / Pydantic) first; the
   tool description is *prescriptive about when to call*, not just what it does
   ("Call this when the user asks about current prices"). Recent Opus models reach
   for tools conservatively — trigger conditions in the description give measurable
   lift. Use `strict: true` on the tool definition (with `additionalProperties:
   false` + `required`) to guarantee inputs validate.
2. **Deferred-load (tool search).** With a large tool library, mark tools
   `defer_loading: true` and add a `tool_search_tool_regex_20251119` /
   `_bm25_20251119` tool. Claude searches and loads only the relevant schemas.
   Schemas are *appended*, not swapped — the prompt cache survives. Never defer
   *every* tool (400) — the search tool and at least one real tool stay loaded.
3. **Parallel tool calls.** One assistant message may carry multiple `tool_use`
   blocks. Execute concurrently and return **all** `tool_result` blocks in a
   **single** user message — splitting them across messages silently trains Claude
   to stop calling tools in parallel. A failed tool returns `tool_result` with
   `is_error: true` — don't drop it.

Prefer the SDK's tool runner (`client.beta.messages.tool_runner` /
`toolRunner`) for the loop unless you need human-in-the-loop approval, custom
logging, or conditional execution — then use the manual agentic loop.

---

## Migration Playbooks — `/oc-claude-api migrate`

Moves existing Claude API code across model versions (4.6 → 4.7 → 4.8, Mythos
Preview → Fable 5) and replaces retired models. Produces a **diff PR**, not a
silent in-place rewrite. Full per-target breaking-change checklists in
`references/migration-playbooks.md`.

The flow is fixed:

1. **Confirm scope first.** If the user didn't name a specific file, directory, or
   file list, *ask* before editing — "migrate my codebase" / "upgrade to Sonnet
   4.6" is ambiguous (what, not where). Never start editing on an ambiguous scope.
2. **Classify each file.** Not every file with the old ID is an API caller — model
   registries, capability gates, and test fixtures need different handling (add
   alongside vs. swap vs. regenerate). See the classification table in the playbook.
3. **Apply the per-target breaking-change checklist.** `[BLOCKS]` items (e.g.
   `budget_tokens` → adaptive thinking, strip `temperature`/`top_p`/`top_k`, remove
   last-assistant-turn prefills) are code edits; `[TUNE]` items (effort, prompt
   re-tuning) are recommendations.
4. **Explain every edit**, especially system-prompt changes, tied to the specific
   API or behavioral shift that motivates it.
5. **Eval-gate the rollout.** Hand the diff to `oc-prompt-ops` for a regression run
   against the golden set before merge, then open the PR via `oc-git-ops`.
6. **Verify.** One test request, assert `response.model.startswith(target)`.

---

## Cost Guardrails — `/oc-claude-api cost`

Sets and enforces token ceilings per phase so an LLM feature can't run away with
spend. Levers, cheapest-first:

- **Right-size `max_tokens`.** Non-streaming default `~16000` (under SDK HTTP
  timeouts); streaming default `~64000`; classification `~256`. Lowballing
  truncates mid-thought and forces a retry — the opposite of cheap.
- **Prompt caching.** Cache reads cost ~0.1× input price; a ≥ 60% hit rate is the
  single biggest cost lever on repeated-context workloads.
- **Per-phase model floor.** Route classification/extraction to Haiku, balanced
  work to Sonnet, reserve Opus/Fable for the phases that need them.
- **Task Budgets** (beta, Fable 5 / Opus 4.8 / 4.7) for agentic loops — the model
  sees a running countdown and self-moderates. Distinct from `max_tokens`, which is
  an enforced ceiling the model doesn't see.
- **Batch API** for non-latency-sensitive jobs — 50% of standard price.

> **Deeper cost ops land in v1.6.** Cross-project spend dashboards, per-route cost
> budgets, and live cost-regression alerts route through `oc-cost-ops` once it
> ships. Until then, this command sets static per-phase ceilings and surfaces them
> in the checkpoint; it does not yet track live spend.

---

## Cross-Skill Integration

| Skill | Relationship |
|---|---|
| `oc-app-architect` | Auto-invokes this skill in Phase 2 on AI apps; reads `05-llm-design.md` |
| `oc-agent-forge` | Owns agent topology + harness loops; **reads** this skill's model routing |
| `oc-rag-forge` | Owns retrieval; reads model routing for the answer-synthesis call |
| `oc-prompt-ops` | Owns prompt versioning + eval datasets; eval-gates `migrate` diffs before merge |
| `oc-stack-forge` | Recommends the overall stack; this skill owns the Claude request layer within it |
| `oc-integrations-engineer` | Owns third-party API auth (incl. provider clients on Bedrock/Vertex/Foundry) |
| `oc-code-auditor` | Audits the request layer for unparsed tool inputs, missing refusal handling, leaked keys |
| `oc-cost-ops` (v1.6) | Will own live spend tracking + cost-regression alerts; this skill sets static ceilings today |
| `oc-git-ops` | Opens the migration diff PR (via its pre-PR gate: oc-docs-forge docs packet → oc-repo-ops readiness) |

Boundary: this skill owns **the Claude API request surface** — model choice,
caching, tool wiring, streaming/batch, migration. It does not own agent topology,
retrieval, prompt eval, or third-party auth. Siblings own those and build on the
request layer this skill defines.

---

## Checkpoint Integration

### Checkpoint Location
`{project-dir}/.checkpoints/oc-claude-api.checkpoint.json`

### When to Write

| Event | What to Save |
|---|---|
| Model routing decided | Per-phase model map, effort levels |
| Caching wired | Breakpoint placement, measured hit rate |
| Cache audit run | Hit rate, invalidators found, verdict |
| Tools designed | Tool count, strict/defer-load/parallel flags |
| Migration run | Source/target model, files touched, breaking-change items applied, PR link |
| Cost ceilings set | Per-phase `max_tokens`, batch/cache decisions |

### skill_state

```json
{
  "model_routing": {
    "spec": "claude-opus-4-8",
    "build": "claude-sonnet-4-6",
    "classify": "claude-haiku-4-5"
  },
  "caching": { "breakpoints": 2, "hit_rate": 0.71, "ttl": "5m" },
  "tools": { "count": 6, "strict": true, "defer_load": false, "parallel": true },
  "last_migration": {
    "from": "claude-opus-4-7",
    "to": "claude-opus-4-8",
    "files": 4,
    "blocks_applied": 1,
    "pr": "https://github.com/org/repo/pull/123"
  },
  "cost": { "max_tokens_default": 16000, "batch": false, "task_budget": null }
}
```

---

## Principles

1. **Prompt caching is not optional.** Every integration ships caching from the
   first commit. A frozen system prompt and deterministic tool order are
   architectural decisions, not afterthoughts.
2. **One model per cached prefix.** Switching models mid-conversation throws the
   cache away. Spawn a cheaper subagent instead of swapping the main loop's model.
3. **Default to capability; downgrade is the caller's call.** Use `claude-opus-4-8`
   for intelligence-sensitive work and surface cheaper options — never silently
   route to Haiku to save money.
4. **Schema-first tools, prescriptive descriptions.** Write the schema first; tell
   the model *when* to call, not just what the tool does. Parse tool inputs as JSON,
   never raw-string-match.
5. **Model IDs and prices come from `claude-api`, never memory.** Stale priors are
   the most common bug — verify against the bundled skill.
6. **Migrations are diffs, not rewrites.** Confirm scope, classify each file, apply
   the breaking-change checklist, eval-gate, explain every edit, then open a PR.
7. **Right-size `max_tokens`.** Lowballing truncates and forces retries; the cheap
   path is the correctly-sized one plus caching, not a starved ceiling.
8. **Handle `stop_reason` before reading content.** `refusal`, `pause_turn`,
   `max_tokens`, and `model_context_window_exceeded` are real branches — reading
   `content[0]` unconditionally breaks on refused or paused turns.

---

## Reference docs

- `references/model-routing.md` — per-task/phase model selection with a decision table
- `references/prompt-caching.md` — `cache_control` usage, what to cache, TTL, hit-rate math
- `references/tool-use.md` — schema-first design, `tool_choice`, parallel calls, defer-load
- `references/migration-playbooks.md` — step-by-step model-version migration → diff PR
