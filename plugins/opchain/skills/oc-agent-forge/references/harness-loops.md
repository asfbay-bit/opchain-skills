# Harness Loops

The loop is the control structure the agent runs inside: how it alternates between
thinking, acting (tool calls), and observing results — and, critically, how it
*stops*. The Planner picks the loop shape from the task shape, then the Builder wires
the termination condition, context management, and retry policy that make it
production-safe.

## The three loop shapes

### React (think → act → observe → repeat)
The model thinks, calls a tool, reads the result, thinks again, and repeats until the
goal is met or the ceiling is hit. The trajectory is decided turn-by-turn.

- **Use when:** the task is open-ended and the path isn't knowable up front —
  debugging, research, exploration.
- **Cost:** the most tool round-trips, because each step is a fresh model call.
- **Implementation:** the SDK's tool runner drives this for the common case; drop to
  a manual agentic loop when you need approval gates or custom logging.

### Plan-execute (plan all steps → execute each)
The model produces a plan up front, then the harness executes the steps in order.
Re-planning happens only on failure.

- **Use when:** the task has a knowable structure before acting — a known sequence of
  operations, a checklist, a migration.
- **Cost:** fewer model calls (one big plan, then execution), but rigid — a wrong
  plan is expensive to recover from.
- **Tradeoff:** less adaptive than react. Good when the structure is stable, brittle
  when the environment surprises the plan.

### Reflect / critique (act → self-review → retry)
The model acts, then a critique step (same or a separate model) reviews the output
against the goal and either accepts it or sends it back for another pass.

- **Use when:** output **quality** matters more than latency — code that must pass
  review, a deliverable that must meet a rubric.
- **Cost:** roughly 2× latency for the extra review pass; higher quality per task.
- **Note:** a fresh-context critic (a subagent that doesn't see the actor's
  rationale) catches more than self-critique. This mirrors the Evaluator pattern.

## Termination conditions (non-negotiable)

Every loop must be able to stop. An agent that can't terminate is a bug, not an
agent. Wire at least:

- **Goal met** — the model signals completion (terminal stop reason, or a `done`
  tool / structured-output gate the harness checks).
- **Call ceiling hit** — the per-run tool-call cap from the tool budget. Hitting it
  is a logged failure, not a silent stall.
- **No-progress detected** — the same `(tool, args)` repeated with the same result;
  break and surface rather than loop.
- **Subagent cap** — an orchestrator can't spawn workers unboundedly.

In the loop body: loop until the stop reason is terminal; append the full assistant
`content` each turn so tool-use (and thinking) blocks are preserved; return every
`tool_result` — including `is_error: true` for failures — in a single user message.
Set a `max_continuations` bound for server-side tools that can `pause_turn`, so a
resumable pause can't spin forever.

## Context-window / compaction management

A long-running loop fills the context window. Manage it **before** the window is
exhausted — the strategy is part of the loop design, the mechanics are owned by
`oc-claude-api`:

- **Compaction** — when the conversation approaches the limit, earlier context is
  summarized server-side into a compaction block. **Append the full `response.content`
  every turn** (not just the text) — the compaction block must be preserved or the
  state is silently lost.
- **Context editing** — *clears* stale tool results / thinking blocks rather than
  summarizing. Use it when old tool outputs are no longer relevant and you want a
  lean transcript without a summary pass.
- **Memory** — for state that must survive across sessions (not just within one
  loop), persist to a memory surface the agent reads on the next run.

Choose by horizon: context editing and compaction operate within a run (prune vs
summarize); memory is for cross-session persistence. Long agents often use all three.

## Retries

Tool calls fail transiently — a network blip, a rate limit, a flaky external API.
The loop must recover, not crash:

- **Retry-with-backoff** transient tool failures (timeouts, 429s, 5xx). The SDKs
  retry the *model* call automatically (429/5xx with backoff); the harness owns
  retries of the *tool* execution.
- **Surface, don't swallow.** A failed tool returns a `tool_result` with
  `is_error: true` and an informative message so the agent can try a different
  approach or abstain — never a dropped result or an exception that kills the loop.
- **Bound the retries.** A tool that fails N times is a real failure; stop retrying
  and let the agent route around it or terminate.

The Evaluator injects a transient tool error as a fixture and asserts the loop
recovers — retry policy is something the fixture suite tests, not something taken on
faith.

## Keeping the cache intact across the loop

(Mechanics owned by `oc-claude-api`; called out here because the loop is where it
breaks.) Don't swap tools or models mid-loop — both invalidate the cached prefix.
Use tool-search to *append* tool schemas for dynamic discovery, and spawn a subagent
on a cheaper model rather than switching the main loop's model. A loop that reshapes
its own prompt prefix every turn caches nothing.
