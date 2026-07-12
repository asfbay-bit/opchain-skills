---
name: oc-agent-forge
displayName: OC · Agent Forge
version: 1.8.1
shortDesc: Scaffold Claude Agent SDK apps — subagent topology, tool budgets, harness loops, agent eval. Tri-agent.
phases: [build, ai-native]
triAgent: true
tryable: true
commands:
  - /oc-agent
  - /oc-agent eval
  - /oc-agent loop
description: >
  Claude Agent SDK build harness with a Planner/Builder/Evaluator loop. Owns
  subagent topology, tool-budget design, harness loop shapes, and agent
  evaluation. Use for /oc-agent, "Claude Agent SDK", "build an agent",
  "subagent", "tool budget", "agent loop", "harness", "multi-agent",
  "agent eval", "orchestrator-worker". Model routing comes from oc-claude-api;
  agent-forge owns topology + harness shape. Trigger liberally on agent work.
governance:
  breaking_change_policy: skills/CHANGELOG.md
  last_reviewed: 2026-06-21
  owner: opchain
  docs:
    - { path: SKILL.md, kind: contract, lifecycle: stable }
---

# Agent Forge

**On first invocation, read `references/orchestrator.md` and follow its welcome protocol** (if present; otherwise fall back to the shared `skills/orchestrator.md`).

Tri-agent build harness for Claude Agent SDK apps: the **Planner** decides the
agent topology (single-agent vs orchestrator-worker vs pipeline vs hierarchical),
the tool budget, and the harness loop shape → the **Builder** materialises the
harness, tool allowlist, and termination logic against the Claude Agent SDK → the
**Evaluator** runs the agent against a task fixture suite with isolated context and
gates it on task-success / trajectory / tool-efficiency thresholds.

An agent is not "give the model some tools and a while-loop." Every default — how
many subagents, which tools are in the allowlist, when the loop stops, how much
context is carried turn-to-turn — moves a measurable number: task success, token
cost, tool-call count, or wall-clock latency. The only honest way to set those
defaults is to run the agent against fixtures and score the trajectory. This skill
exists to make the agent harness an *evaluated* artifact, not a vibe.

This is the agent-harness counterpart to `oc-claude-api`. **Model routing — which
model runs the orchestrator, which runs a worker, effort levels, prompt caching,
thinking mode — comes FROM `oc-claude-api`.** Agent Forge owns the layer above the
model: topology, tool budget, loop shape, and the eval. The two skills compose;
they do not overlap.

---

## /oc-agent — Command Reference

```
AGENT FORGE COMMANDS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  TRI-AGENT HARNESS
  /oc-agent              Design + build an agent end-to-end (Planner → Builder → Evaluator)
  /oc-agent plan         Pick topology, tool budget, loop shape (Planner)
  /oc-agent build        Materialise the harness + tool allowlist (Builder)
  /oc-agent eval         Score the agent against a task fixture suite (Evaluator)

  HARNESS DESIGN
  /oc-agent topology     Choose single-agent / orchestrator-worker / pipeline / hierarchical
  /oc-agent tools        Design the tool allowlist + call ceilings + deferred-load
  /oc-agent loop         Design / tune the harness loop (react / plan-execute / reflect)

  EVALUATION
  /oc-agent fixtures     Build or extend the task fixture suite (input → expected outcome)
  /oc-agent trace        Replay one fixture and dump the full trajectory (debug)
  /oc-agent regress      Re-run the fixture suite and gate on success/cost regression

  UTILITIES
  /checkpoint            Show checkpoint status

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  Type any command to begin. /oc-agent to see this again.
```

---

## Tri-Agent Architecture

```
AGENT INTENT
(from oc-app-architect: "this app needs an agent / does multi-step work / uses tools")
        │
        ▼
┌──────────────────┐
│   AGENT          │  Picks topology (single / orchestrator-worker / pipeline /
│   PLANNER        │  hierarchical), tool budget (allowlist + ceilings), loop
│                  │  shape (react / plan-execute / reflect). Declares targets.
└────────┬─────────┘   Pulls model routing from oc-claude-api.
         │
         ▼
┌──────────────────────────────────────────────┐
│       AGENT LOOP (per harness / config)      │
│                                              │
│  ┌────────────┐  config     ┌─────────────┐  │
│  │   AGENT    │◄─negotiate──►│   AGENT     │  │
│  │  BUILDER   │             │  EVALUATOR  │  │
│  │            │──harness───►│             │  │
│  │  Builds    │             │  Runs the   │  │
│  │  loop +    │             │  fixture    │  │
│  │  tools +   │◄──failures──│  suite,     │  │
│  │  topology  │             │  scores     │  │
│  └────────────┘             └─────────────┘  │
│       │                           │          │
│       │  Task-success ≥ target?   │          │
│       └───────────────────────────┘          │
└──────────────────────────────────────────────┘
         │
         └──► Regression gating (ongoing, in CI)
```

### Why Three Agents for an Agent?

1. **Self-graded agents always pass.** Whoever builds the harness picks the
   topology, the tool list, and the stop condition — then watches it complete one
   happy-path task and calls it done. The Evaluator runs a *fixture suite* (input →
   known-correct outcome) with isolated context and reports task-success rate,
   trajectory validity, and tool-efficiency. "It worked when I tried it" is not a
   measurement. See `references/agent-eval.md`.

2. **A working trajectory hides an expensive one.** An agent can reach the right
   answer via 40 tool calls, three redundant subagents, and a context window that
   compacts twice — and a success-only metric calls that a pass. Token cost,
   tool-call count, and step count are first-class metrics, because the difference
   between a shippable agent and an unshippable one is usually cost and latency, not
   correctness.

3. **Every knob is a tradeoff with no obvious default.** More subagents raise
   parallelism but multiply token cost and add coordination failure modes; a larger
   tool allowlist raises capability but bloats the context and slows tool selection;
   a reflect loop raises quality but doubles latency. The only honest way to set
   these is to move one knob, re-run the fixtures, and keep the change if the metric
   improved. That is the Builder ↔ Evaluator loop.

---

## Phase 1: Agent Planner (`/oc-agent plan`)

### Planner Persona

The Planner is an agent engineer who has shipped production agents and has the
scars to prove that the simplest topology that works is almost always right. Key
behaviors:

- **Start at the simplest tier and earn every escalation.** A single agent with a
  tight tool loop handles most tasks. Reach for orchestrator-worker only when the
  task genuinely fans out into independent subtasks; reach for a pipeline only when
  the stages are fixed and ordered; reach for hierarchical only when subtasks
  themselves decompose. Each added subagent is a token-cost multiplier and a new
  coordination failure mode — see `references/agent-topology.md`.
- **Decide whether this even needs an agent.** If the task is fully specifiable up
  front (extract a field, classify, summarize), it's a single LLM call or a
  code-orchestrated workflow, not an agent. Agents earn their cost only when the
  task is multi-step, hard to specify in advance, and the model needs to decide its
  own trajectory. If it doesn't clear that bar, hand back to `oc-claude-api` for a
  workflow and stop.
- **Budget the tools before writing them.** A tool allowlist is a context-window
  cost (every schema sits in the prompt) and a tool-selection cost (more tools = more
  ways to pick wrong). Default to the smallest allowlist that covers the task; defer
  rarely-used tools behind tool-search so their schemas stay out of context until
  needed. Set a per-run call ceiling so a runaway loop fails loud instead of
  burning budget silently. See `references/tool-budgets.md`.
- **Pick the loop shape from the task shape.** React (think→act→observe) for
  open-ended exploration; plan-execute (plan once, then run the steps) for tasks with
  a knowable structure; reflect/critique (act, then self-review and retry) when
  output quality matters more than latency. See `references/harness-loops.md`.
- **Pull model routing from oc-claude-api — do not re-decide it.** Which model runs
  the orchestrator, which runs each worker, the effort level, thinking mode, and
  prompt-caching strategy are oc-claude-api's call. The Planner consumes that
  routing and designs the topology and loop on top of it.
- **Declare the metric targets up front.** "task-success ≥ 0.90 on the fixture
  suite, ≤ 25 tool calls per task at p95, ≤ $0.40 per task" before building. A
  target the Planner can't justify from the product's tolerance for a wrong or
  expensive answer isn't a real target.

### Planner Workflow

1. Read upstream context: the agent intent from `oc-app-architect`
   `02-architecture.md` / `11-ai-architecture.md`, and the **model routing** from
   the `oc-claude-api` checkpoint (orchestrator model, worker model, effort,
   thinking, caching).
2. Confirm this needs an agent (vs a single call / workflow). If not, hand back.
3. Walk the **topology decision tree** → `references/agent-topology.md`.
4. Design the **tool budget** (allowlist, call ceilings, deferred-load) →
   `references/tool-budgets.md`.
5. Pick the **harness loop shape** (react / plan-execute / reflect) →
   `references/harness-loops.md`.
6. Declare metric targets and write the **Agent Design** doc for approval.

### Agent-Topology Decision Tree

```
Is the task fully specifiable up front (one input → one output, no exploration)?
   └─► NOT AN AGENT — single LLM call or code-orchestrated workflow (oc-claude-api)

Single goal, model explores tools sequentially, no independent parallel subtasks?
   └─► SINGLE-AGENT            one loop, one tool allowlist, one model
       (the strong default — start here, escalate only on evidence)

Task fans out into independent subtasks that can run in parallel
(research N sources, review M files, check K candidates)?
   └─► ORCHESTRATOR-WORKER     a lead agent spawns workers, fans out, joins results
       (workers usually run a cheaper model — e.g. Haiku — via oc-claude-api routing)

Fixed, ordered stages where each stage's output feeds the next
(extract → transform → validate → emit)?
   └─► PIPELINE                staged; code orchestrates the order, agents do the stages
       (often not even an agent per stage — only stages that need exploration are)

Subtasks themselves decompose into sub-subtasks (deep, recursive work)?
   └─► HIERARCHICAL            orchestrator → sub-orchestrators → workers
       (rare; highest coordination cost — earn it with a fixture that proves the depth)
```

Full tradeoff table (parallelism / cost / coordination-risk / when-to-use) in
`references/agent-topology.md`. The cost of every added subagent is real: more
tokens, more latency variance, more failure surface. Add one only when a fixture
shows the flatter topology can't hit the target.

### Tool-Budget Design (quick map)

| Lever | Default | Why |
|---|---|---|
| Allowlist size | Smallest set that covers the task | Each tool schema sits in context + adds a wrong-pick path |
| Deferred-load (tool-search) | Defer rarely-used tools | Keeps schemas out of context until the model searches for them |
| Per-run call ceiling | Set one (e.g. 25–50) | A runaway loop fails loud instead of burning budget silently |
| Parallel tool calls | Allow for read-only tools | Concurrent reads cut latency; serialize anything with side effects |
| Bash vs dedicated tool | Bash for breadth, promote to gate/render/audit | A dedicated `send_email` tool can be confirmation-gated; `bash -c curl` can't |

Tool-search (`tool_search_tool_regex_20251119` / `_bm25_20251119`) with
`defer_loading: true` on the rare tools keeps a large library out of the prompt and
preserves the cache (schemas are *appended* on search, not swapped). Full
mechanics in `references/tool-budgets.md`.

### Harness Loop Shapes (quick map)

| Loop | Shape | Use when | Cost |
|---|---|---|---|
| **React** | think → act → observe → repeat | Open-ended; trajectory unknown up front | Most tool round-trips |
| **Plan-execute** | plan all steps once → execute each | Structure is knowable before acting | Fewer model calls; rigid |
| **Reflect / critique** | act → self-review → retry on failure | Output quality > latency | ~2× latency; higher quality |

Every loop needs an explicit **termination condition** (goal met / call ceiling hit
/ no-progress detected), **context management** (compaction or context-editing when
the window fills), and a **retry policy** for transient tool failures. Full
treatment in `references/harness-loops.md`.

### Gate: Agent Design Approval

Present the design: topology (+ why this tier and not the flatter one), tool budget
(allowlist + ceilings + what's deferred), loop shape, the model routing inherited
from oc-claude-api, and the declared metric targets. Confirm with the user. Write
checkpoint: phase `planned`.

---

## Phase 2: Build Loop (`/oc-agent build`)

### Step 1: Build Contract

**Builder proposes:**

```markdown
## Agent Build Contract

### Deliverables
- Harness loop (react | plan-execute | reflect) with an explicit termination condition
- Tool allowlist wired to the Claude Agent SDK; rare tools behind tool-search (deferred)
- Per-run tool-call ceiling + runaway-loop guard (fail loud at the ceiling)
- Topology: single-agent | orchestrator-worker | pipeline | hierarchical
  (worker model routing pulled from oc-claude-api, not re-decided here)
- Context management: compaction / context-editing wired before the window fills
- Retry-with-backoff on transient tool failures; structured tool-error surfacing
- A task fixture suite (≥ 20 input→expected-outcome cases) for the Evaluator

### Testable Criteria
1. The loop terminates on every fixture (goal met OR ceiling hit — never hangs)
2. The call ceiling is enforced; exceeding it is a logged failure, not a silent stall
3. Deferred tools load only when searched for (verify schemas aren't in the base prompt)
4. Tool failures return is_error results the agent can recover from, not crashes
5. The fixture suite exists and every case has a checkable expected outcome

### Metric Targets (from Planner)
- task-success ≥ 0.90 on the fixture suite
- tool-calls per task ≤ 25 at p95
- cost per task ≤ $0.40
- p95 wall-clock ≤ [budget]
```

**Evaluator reviews** and pushes back if:
- There's no fixture suite (you cannot evaluate an agent without checkable outcomes)
- The loop has no hard termination condition (an agent that can't stop is a bug, not an agent)
- The call ceiling is missing (a runaway loop will burn the token budget silently)
- Tool errors crash the loop instead of surfacing as recoverable `is_error` results
- Targets are absent or unjustified

### Step 2: Builder Implements

Builder reads the **model routing from the `oc-claude-api` checkpoint** and wires
the harness on top of it rather than choosing models itself:

| Topology | Loop driver | Model routing (from oc-claude-api) | Agent SDK surface |
|---|---|---|---|
| Single-agent | One tool loop (SDK tool runner or manual loop) | One model (e.g. `claude-opus-4-8`, effort from routing) | `messages` + tool runner, or a manual agentic loop |
| Orchestrator-worker | Lead loop spawns worker loops, fans out + joins | Orchestrator on the strong model; workers on a cheaper model (e.g. `claude-haiku-4-5`) per routing | Subagents; workers run isolated tool loops |
| Pipeline | Code orchestrates ordered stages | Per-stage model per routing (cheap stages → cheap model) | One `messages` call (or sub-loop) per stage |
| Hierarchical | Orchestrator → sub-orchestrators → workers | Tiered per routing | Nested subagents |

Implementation discipline:
- **Tool runner vs manual loop.** Use the SDK's tool runner for the common case
  (it drives the call→execute→loop cycle); drop to a manual agentic loop when you
  need approval gates, custom logging, or conditional execution. Loop until the stop
  reason is terminal; append the full assistant `content` each turn so tool-use
  blocks are preserved; return every `tool_result` (including `is_error: true` for
  failures) in a single user message.
- **Keep the cache intact.** Don't swap tools or models mid-loop (that invalidates
  the whole prefix). Use tool-search to *append* tool schemas for dynamic discovery,
  and spawn a subagent on the cheaper model rather than switching the main loop's
  model. Caching rules come from `oc-claude-api`.
- **Manage context before it fills.** Wire compaction or context-editing per the
  loop design so a long run doesn't blow the window — preserve compaction blocks on
  every turn.
- **Guard the loop.** Enforce the per-run call ceiling, detect no-progress (same
  tool, same args, repeated), and bound subagent count.

### Step 3: Agent Evaluator

The Evaluator runs with **isolated context** — it sees the fixture suite and the
live agent, not the Builder's harness rationale.

**Evaluator Persona.** An agent QA engineer who trusts the fixture suite over a
demo. Key behaviors:

- **Run the whole fixture suite, not one happy-path task.** Report aggregate
  task-success with a per-fixture breakdown for the failures.
- **Score the trajectory, not just the answer.** A task that succeeds via a
  redundant subagent, a tool called five times with the same args, or a context
  compaction that lost the goal is a *flawed pass* — report the trajectory defect.
- **Measure cost and tool-efficiency as first-class metrics.** Tokens per task,
  tool-calls per task, subagents spawned, wall-clock. The cheapest correct
  trajectory is the target, not just any correct one.
- **Probe the known failure modes**: tasks that should fail gracefully (out-of-scope
  request → does the agent abstain, or flail and burn the ceiling?), tasks that
  should hit the call ceiling (does it fail loud?), and tasks with a transient tool
  error injected (does retry-with-backoff recover, or does the loop crash?).
- **Gate on regression, not just absolutes.** A change that lifts task-success from
  0.90 to 0.92 but doubles tool-calls per task made the agent *worse* to ship.
  Report deltas vs the last passing config.

**Evaluator Report** saved to `agent/eval-round-M.md`:

```markdown
## Agent Evaluation — Round [M]

### Config Under Test
- Topology: orchestrator-worker (1 lead + ≤4 workers)
- Loop: react, call-ceiling 30 | Models: lead claude-opus-4-8, workers claude-haiku-4-5
- Tools: 6 in allowlist, 9 deferred (tool-search)

### Task-Success (fixtures: 24 tasks)
| Metric | Value | Target | Pass? |
|---|---|---|---|
| task-success | 0.92 | ≥ 0.90 | PASS |
| trajectory-valid (no redundant work) | 0.83 | ≥ 0.85 | FAIL |

### Efficiency
| Metric | Value | Target | Pass? |
|---|---|---|---|
| tool-calls / task (p95) | 22 | ≤ 25 | PASS |
| cost / task | $0.31 | ≤ $0.40 | PASS |
| subagents / task (mean) | 2.1 | — | — |

### Failure Analysis
- 2 fixtures failed: both spawned a redundant research worker for a single-source lookup
- 1 fixture hit the ceiling correctly (out-of-scope request — failed loud ✓)
- Injected tool-error fixture: retry recovered ✓

### Delta vs Round [M-1]
- task-success +0.02; trajectory-valid −0.04 (new worker over-spawns). Regression.

### Verdict: PASS / FAIL
[If FAIL: which metric, which fixtures, which knob to move]
```

Scoring rubric details (how task-success / trajectory / tool-efficiency are
computed, the Evaluator's grading rubric) live in `references/agent-eval.md`.

### Step 4: Iterate or Advance

- **PASS**: The agent is shippable. Freeze the harness config, commit the fixture
  suite, register the regression suite with CI, hand off to `oc-claude-api` for any
  final model/caching tuning and `oc-deploy-ops` for the runtime.
- **FAIL + rounds remaining**: Feed the failure analysis to the Builder. Move *one*
  knob (topology tier, allowlist, call ceiling, loop shape, subagent cap), re-run.
- **FAIL + max rounds**: Escalate to user with all round reports and the metric
  trajectory.

Max iterations: 3. Each iteration moves one variable so the delta is attributable.

---

## oc-claude-api Collaboration (model routing vs harness shape)

This is the single most important boundary in this skill. **The two skills compose;
neither re-decides the other's layer.**

| oc-claude-api owns (the model layer) | oc-agent-forge owns (the harness layer) |
|---|---|
| Which model runs the orchestrator and each worker | The topology that decides there *is* an orchestrator and workers |
| Effort level, thinking mode, prompt-caching strategy | The loop shape (react / plan-execute / reflect) and termination |
| The tool-use *contract* (schema shape, strict mode, parallel) | The tool *budget* (allowlist size, call ceilings, what's deferred) |
| Context-window size + compaction mechanics | *When* the loop compacts and how context is carried turn-to-turn |
| Fallbacks, refusal handling, batch/streaming choices | The fixture suite + task-success / trajectory / efficiency eval |

Order of operations: `oc-claude-api` runs first when an AI app is detected (it's the
hub). Agent Forge reads the routing decision from its checkpoint and builds the
topology and loop on top. If the eval reveals the agent is too slow or too
expensive, the fix might be a *harness* change (fewer subagents, tighter ceiling) or
a *model* change (cheaper worker, lower effort) — Agent Forge owns the first,
hands the second back to `oc-claude-api`.

---

## Boundaries (what oc-agent-forge does NOT own)

| Concern | Owner | Why |
|---|---|---|
| Model choice, effort, thinking, prompt caching, fallbacks | `oc-claude-api` | The model layer; Agent Forge builds the harness on top of its routing |
| Retrieval / vector DB for an agent that searches a corpus | `oc-rag-forge` | Agent Forge calls retrieval as a tool; rag-forge owns the retrieval config |
| The app/data model the agent operates on | `oc-app-architect` | Agent Forge is invoked *by* it for the agent surface |
| The first-party API the agent's tools call | `oc-api-dev` | Agent Forge consumes tools; api-dev designs the API |
| Third-party tool integrations (Slack, GitHub MCP, OAuth) | `oc-integrations-engineer` | Agent Forge declares the tool need; integrations wires the external service |
| Prompt versioning / eval datasets for a *single prompt* | `oc-prompt-ops` | Agent Forge evals the *agent trajectory*; prompt-ops evals one prompt |
| Deploying + monitoring the live agent | `oc-deploy-ops` / `oc-monitoring-ops` | Agent Forge hands off a frozen, evaluated harness |
| Capacity / throughput at projected agent volume | `oc-scale-ops` | Agent Forge declares the per-task budget; scale-ops sizes the fleet |

Agent Forge's output is an *evaluated agent harness* (topology + tool budget + loop)
plus a regression fixture suite. Sibling skills route the model, provide tools,
deploy, and monitor around it.

---

## Cross-Skill Integration

| Skill | How it connects |
|---|---|
| **oc-app-architect** | Auto-invokes Agent Forge when `02-architecture.md` calls for an agent / multi-step autonomous work / "does work for me". Agent Forge returns the topology + harness into `11-ai-architecture.md`. |
| **oc-claude-api** | **The hub.** Owns model routing (orchestrator/worker models, effort, thinking, caching, fallbacks). Agent Forge pulls that routing and builds topology + loop on it — it never re-picks the model. |
| **oc-rag-forge** | When the agent retrieves over a corpus, rag-forge owns the retrieval config; Agent Forge wires it as a tool in the allowlist. |
| **oc-integrations-engineer** | Supplies third-party tools (MCP servers, OAuth'd APIs) that land in the agent's tool allowlist. |
| **oc-api-dev** | Supplies first-party API operations the agent's tools call; the spec is the tool contract. |
| **oc-prompt-ops** | Owns single-prompt versioning + evals. Agent Forge's fixture suite is the *trajectory* analogue; the two regression suites run side by side. |
| **oc-deploy-ops** | Receives the frozen harness config + fixture suite; gates prod on the regression suite passing. |
| **oc-monitoring-ops** | Watches the live agent: task-success drift, tool-error rate, cost/latency per task, loop-ceiling hits. |
| **oc-scale-ops** | Sizes the agent fleet at projected task volume against the per-task token + tool budget. |

---

## Checkpoint Integration

### Checkpoint Location
`{project-dir}/.checkpoints/oc-agent-forge.checkpoint.json`

### When to Write

| Event | What to Save |
|---|---|
| Plan approved | Topology, tool budget, loop shape, inherited model routing, targets |
| Build contract negotiated | Deliverables, criteria, fixture-suite size |
| Builder completes | Harness path, allowlist, deferred tools, subagent cap, ceiling |
| Evaluator runs | Per-metric values vs targets, failure analysis, round number |
| Regress runs | Pass/fail + delta vs last frozen config |

### skill_state

```json
{
  "topology": "orchestrator-worker",
  "model_routing": {
    "source": "oc-claude-api",
    "orchestrator": "claude-opus-4-8",
    "worker": "claude-haiku-4-5",
    "effort": "high"
  },
  "loop": { "shape": "react", "call_ceiling": 30, "subagent_cap": 4 },
  "tools": {
    "allowlist": ["search", "read_file", "run_tests", "open_pr", "list_dir", "grep"],
    "deferred": 9,
    "deferred_via": "tool_search_tool_bm25_20251119",
    "parallel_safe": ["read_file", "list_dir", "grep"]
  },
  "context_mgmt": { "strategy": "compaction", "trigger_tokens": 150000 },
  "fixtures": { "path": "agent/fixtures.jsonl", "tasks": 24 },
  "targets": { "task_success": 0.90, "tool_calls_p95": 25, "cost_per_task_usd": 0.40 },
  "last_eval": {
    "round": 3,
    "verdict": "PASS",
    "metrics": { "task_success": 0.92, "tool_calls_p95": 22, "cost_per_task_usd": 0.31 }
  }
}
```

### Cross-Skill Reads

| Reads from | Why |
|---|---|
| oc-app-architect | `02-architecture.md` / `11-ai-architecture.md` agent intent + task description |
| oc-claude-api | Model routing — orchestrator/worker models, effort, thinking, caching (the input) |
| oc-rag-forge | Retrieval config to wire as a tool (when the agent searches a corpus) |
| oc-integrations-engineer | Third-party tools (MCP/OAuth) for the allowlist |

| Read by | Why |
|---|---|
| oc-claude-api | Harness shape informs final model/caching tuning (e.g. worker model, effort) |
| oc-deploy-ops | Frozen harness config + regression fixture suite as a deploy gate |
| oc-monitoring-ops | Task-success / cost / tool-error metrics to watch in prod |
| oc-scale-ops | Per-task token + tool budget to size the fleet |

---

## Principles

1. **The agent harness is an evaluated artifact, not a vibe.** Every config ships
   with a fixture suite and a task-success number. "It worked when I tried it" is not
   a measurement.
2. **Start at the simplest topology and earn every escalation.** Single-agent is the
   default. Add a subagent only when a fixture proves the flatter topology can't hit
   the target — each one is a cost multiplier and a new failure mode.
3. **Decide whether it even needs an agent.** Fully-specifiable tasks are a single
   call or a workflow. Agents earn their cost only on multi-step, hard-to-specify,
   model-driven work.
4. **Model routing comes from oc-claude-api; agent-forge owns topology + harness.**
   Don't re-pick the model. Build the loop and topology on top of the routing.
5. **Budget the tools.** The smallest allowlist that covers the task; defer the rare
   tools behind tool-search so their schemas stay out of context; set a call ceiling.
6. **A working trajectory hides an expensive one.** Score cost, tool-calls, and
   subagent count alongside success. The cheapest correct trajectory is the target.
7. **Every loop must be able to stop.** An explicit termination condition (goal /
   ceiling / no-progress) is non-negotiable. An agent that can't stop is a bug.
8. **Move one knob per iteration.** Topology tier, allowlist, ceiling, loop shape,
   subagent cap — change one, re-run the fixtures, attribute the delta.
9. **Gate on regression, not just absolutes.** A change that lifts success but
   doubles cost made the agent worse to ship. Report deltas vs the last passing config.
10. **Freeze and regress.** Once the harness passes, freeze it and run the fixture
    suite in CI. Model deprecations and tool changes cause silent drift.
