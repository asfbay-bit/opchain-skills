# Tool Budgets

A tool allowlist is not free. Every tool schema sits in the prompt (context-window
cost) and adds another way for the model to pick wrong (tool-selection cost). The
Planner budgets tools the way it budgets tokens: the smallest set that covers the
task, with the rare tools kept out of context until they're needed, and a hard
ceiling so a runaway loop fails loud.

## Allowlists — smallest set that covers the task

- **Default to the minimum.** Start with the tools the task provably needs. A
  12-tool agent where 4 tools cover 95% of trajectories is carrying 8 schemas and 8
  wrong-pick paths in every prompt.
- **One concern per tool, clear names.** `run_tests` beats `tools`. The model picks
  tools from descriptions — write them prescriptively (*when* to call, not just
  what it does); recent models reach for tools more conservatively, so a "call this
  when…" description measurably lifts the right-call rate.
- **Bash for breadth, dedicated tools to gate/render/audit.** A `bash` tool gives
  the agent broad leverage but hands the harness an opaque command string. Promote
  an action to a dedicated tool when you need to:
  - **gate it** — a `send_email` / `open_pr` / `delete_record` tool can be
    confirmation-gated; `bash -c "curl -X POST …"` can't.
  - **render it** — a question-asking tool can pop a modal and block the loop.
  - **audit it** — typed arguments are inspectable; an opaque command isn't.
  - **parallelize it** — a read-only tool can be marked parallel-safe; bash can't be
    told a `grep` is safe to run alongside a `git push`.

## Deferred-load — keep schemas out of context (tool-search)

When the agent *might* need a large library of tools but only a few per task, don't
load every schema into the base prompt. Mark the rare tools `defer_loading: true`
and add the tool-search tool; the model searches the library and the matching
schemas are **appended** to the request (not swapped in), so the cached prefix
survives.

Two server-side variants:

| Tool type | `name` | Matching |
|---|---|---|
| `tool_search_tool_regex_20251119` | `tool_search_tool_regex` | regex over tool names/descriptions |
| `tool_search_tool_bm25_20251119` | `tool_search_tool_bm25` | BM25 keyword relevance |

Rules and gotchas:

- The tool-search tool **must not** be deferred, and **at least one** tool in
  `tools` must be non-deferred — otherwise the API returns `400 All tools have
  defer_loading set`.
- Keep the common-path tools loaded (non-deferred) and defer the long tail.
- Because schemas are appended on search rather than swapped, the prompt cache is
  preserved — this is the cache-safe way to scale the tool set. (Caching mechanics
  are owned by `oc-claude-api`.)

## Per-run call ceilings — fail loud, not silent

Set a maximum tool-call count per task (e.g. 25–50, tuned to the fixture suite). A
loop with no ceiling that gets stuck — same tool, same args, no progress — will burn
the token budget silently until something else times out. With a ceiling:

- Exceeding it is a **logged, surfaced failure**, not a silent stall.
- The Evaluator can write a fixture that *should* hit the ceiling (an out-of-scope
  request) and assert the agent fails loud instead of flailing.
- For agentic loops on supporting models, a **task budget** (`output_config.
  task_budget`, beta) tells the model how many tokens it has so it self-paces and
  wraps up gracefully — distinct from `max_tokens` (a hard per-response cap the model
  doesn't see). Whether to use it is part of the model routing from `oc-claude-api`;
  the *ceiling* (a harness guard) is always Agent Forge's.

## Parallel tool calls

One assistant turn may contain multiple `tool_use` blocks. The harness should:

- **Run read-only tools concurrently** — `read_file`, `list_dir`, `grep`, retrieval
  lookups. Concurrent reads cut wall-clock latency materially.
- **Serialize anything with side effects** — writes, external POSTs, `git push`.
  A dedicated tool can be marked parallel-safe or not; a bash command can't, so the
  harness must serialize all bash.
- **Return all results in ONE user message.** Execute every `tool_use` block from a
  turn, then send all `tool_result` blocks back in a single user message. Splitting
  them across messages silently trains the model to stop making parallel calls. For a
  failed tool, return a `tool_result` with `is_error: true` — don't drop it.

## Guarding against runaway loops

Three guards, all owned by the harness:

1. **Call ceiling** (above) — hard cap on tool calls per task.
2. **No-progress detection** — track the last few `(tool, args)` pairs; if the agent
   repeats the same call with the same arguments and gets the same result, break and
   surface it rather than looping.
3. **Subagent cap** — bound the number of workers an orchestrator may spawn, so a
   bad decomposition can't fan out unboundedly.

Tool errors are part of the guard surface too: a failing tool must return an
`is_error` result the agent can recover from (try another approach, abstain) — not
crash the loop. The Evaluator injects a transient tool error as a fixture and asserts
retry-with-backoff recovers.
