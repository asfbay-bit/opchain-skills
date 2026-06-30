# Agent Eval

An agent harness is only shippable once it's evaluated. The Evaluator runs the agent
against a **task fixture suite** with isolated context and reports three things:
did it succeed, was the trajectory clean, and was it efficient. "It worked when I
tried it" is not a measurement — one happy-path demo tells you nothing about the
other 23 tasks.

## Building a task fixture suite

A fixture is `input → checkable expected outcome`. The suite is the agent's
analogue of a goldset.

- **Each fixture has a checkable outcome.** Not "a good result" but something a
  grader can verify: a file exists with a specific field, a PR was opened against the
  right branch, the returned JSON has a numeric `total`, the agent abstained on an
  out-of-scope request. Vague expected outcomes produce noisy evals.
- **Cover the distribution, not just the happy path.** Include:
  - **success cases** — typical tasks the agent must complete.
  - **graceful-failure cases** — out-of-scope or impossible requests; the agent must
    abstain or fail loud, not flail and burn the call ceiling.
  - **ceiling cases** — tasks that *should* hit the call ceiling; assert it fails
    loud, doesn't hang.
  - **error-injection cases** — a transient tool error is injected; assert
    retry-with-backoff recovers and the loop doesn't crash.
- **Size it to be meaningful.** Start at ≥ 20 fixtures; grow it every time a real
  failure escapes — that failure becomes a regression fixture.
- **Store it next to the harness** (`agent/fixtures.jsonl`) and version it. The
  fixture suite *is* the spec for "the agent works."

## The three metric families

### Task-success
Did the agent reach the checkable outcome? Reported as an aggregate rate over the
suite with a per-fixture breakdown of the failures. This is the headline number, but
it is not sufficient alone (see trajectory and efficiency).

### Trajectory
*How* it reached the outcome. A task that succeeds via a redundant subagent, a tool
called five times with identical args, or a context compaction that dropped the goal
is a **flawed pass** — count it against trajectory validity even though the answer was
right. Trajectory metrics catch the difference between a correct agent and a correct
*and shippable* agent.

- **trajectory-valid rate** — fraction of successes with no redundant work / no
  lost-goal compaction / no over-spawn.
- **per-fixture trajectory notes** for the defects, so the Builder knows which knob
  to move.

### Tool-efficiency / cost
The price of the trajectory. The cheapest correct path is the target, not any correct
path.

- **tool-calls per task** (report p95, not just mean — the tail is what burns budget).
- **tokens per task / cost per task** — accumulate `usage` across the loop;
  per-attempt usage is the source of truth.
- **subagents spawned per task** — over-spawn is the most common orchestrator-worker
  defect.
- **p95 wall-clock** — latency budget.

## The Evaluator's scoring rubric

The Evaluator runs with **isolated context** — it sees the fixtures and the live
agent, not the Builder's harness rationale. For each fixture:

| Dimension | What it measures | How it's scored |
|---|---|---|
| **Outcome** | Did the checkable expected outcome occur? | binary pass/fail per fixture → aggregate rate |
| **Trajectory** | Redundant work / lost goal / over-spawn? | valid / flawed-pass / invalid per fixture |
| **Tool-efficiency** | Calls, tokens, subagents, latency vs target | measured per fixture → p95 + mean |
| **Failure handling** | Graceful abstain / loud-ceiling / error-recovery on the negative fixtures | pass/fail per negative fixture |

A fixture that produces the right outcome via a flawed trajectory is reported as a
**flawed pass** — surfaced, not silently counted as a clean win. The verdict (PASS /
FAIL for the round) is against the declared targets *and* the regression deltas, not
absolutes alone.

## Regression gating

Once the harness passes, freeze the config and run the fixture suite in CI.

- **Gate on deltas, not just absolutes.** A change that lifts task-success from 0.90
  to 0.92 but doubles tool-calls per task made the agent *worse* to ship. Every
  Evaluator report includes a delta vs the last passing config.
- **Move one knob per iteration.** Topology tier, allowlist, call ceiling, loop
  shape, subagent cap — change one, re-run, attribute the delta. Bundled changes hide
  which one helped.
- **Watch for silent drift.** Model deprecations (the routing model retires), tool
  changes (a tool's schema or behavior shifts), and corpus growth (for
  retrieval-backed agents) all degrade a frozen agent without a code change. The CI
  fixture run catches it. `oc-monitoring-ops` watches the same metrics on live
  traffic — task-success drift, tool-error rate, cost/latency per task, ceiling-hit
  rate.

The Evaluator's output (per-metric values vs targets, failure analysis, round number,
delta) is written to `agent/eval-round-M.md` and summarized into the checkpoint's
`last_eval` block.
