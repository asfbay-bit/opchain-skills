# Agent Topology

How many agents, arranged how. The Planner picks the **simplest topology that hits
the target** and earns every escalation with a fixture that proves the flatter shape
can't do the job. Each added subagent is a token-cost multiplier, a latency-variance
source, and a new coordination failure mode — they are not free parallelism.

> **Before any topology: should this be an agent at all?** If the task is fully
> specifiable up front (one input → one output, no exploration — extract a field,
> classify, summarize, translate), it's a single LLM call or a code-orchestrated
> workflow, not an agent. Agents earn their cost only when the task is multi-step,
> hard to specify in advance, and the model must decide its own trajectory, *and*
> the cost of an error is recoverable (tests, review, rollback). If it doesn't clear
> that bar, hand back to `oc-claude-api` for a workflow.

## The four shapes

### Single-agent
One loop, one tool allowlist, one model. The model explores its tools sequentially
until the goal is met or the call ceiling is hit.

- **Use when:** a single goal, sequential tool use, no independent subtasks that
  could run in parallel.
- **Cost:** lowest — one context, one model, no coordination.
- **This is the strong default.** Most "agent" work is single-agent. Start here.

### Orchestrator-worker
A lead agent decomposes the task, spawns workers for independent subtasks, fans out,
and joins the results. Workers run isolated tool loops with their own context.

- **Use when:** the task fans out into independent subtasks — research N sources,
  review M files, check K candidates — that genuinely parallelize.
- **Cost:** lead model cost + (N × worker cost). Workers usually run a **cheaper
  model** (e.g. `claude-haiku-4-5`) — that routing decision comes from
  `oc-claude-api`, not from this skill.
- **Coordination risk:** workers don't share context; the lead must pass each worker
  everything it needs, and over-spawning (a worker per trivial lookup) is the most
  common trajectory defect the Evaluator catches.

### Pipeline
Fixed, ordered stages where each stage's output feeds the next: extract → transform
→ validate → emit. **Code** orchestrates the order; agents (or plain calls) do the
stages.

- **Use when:** the stages are fixed and known before runtime.
- **Cost:** one model call (or sub-loop) per stage — often the cheapest correct shape
  because most stages don't need exploration and aren't agents at all.
- **Note:** only promote a stage to an agent if that stage genuinely needs to explore.
  A pipeline of plain LLM calls with one agentic stage is common and good.

### Hierarchical
Orchestrator → sub-orchestrators → workers. Subtasks themselves decompose into
sub-subtasks. Deep, recursive work.

- **Use when:** the task is deep enough that a single orchestrator can't hold the
  decomposition — rare.
- **Cost:** highest — every level multiplies tokens and adds a coordination layer.
- **Earn it.** Only reach for hierarchical when a fixture demonstrates the
  orchestrator-worker shape can't hold the depth. Depth > 1 in most agent SDKs is
  also the most error-prone surface.

## Decision table by task shape

| Task shape | Topology | Parallelism | Cost | Coordination risk |
|---|---|---|---|---|
| One input → one output, no exploration | **Not an agent** (call/workflow) | — | lowest | none |
| Single goal, sequential tools | **Single-agent** | none | low | none |
| Independent subtasks, parallelizable | **Orchestrator-worker** | high | lead + N×worker | over-spawn, context handoff |
| Fixed ordered stages | **Pipeline** | per-stage | per-stage | stage-contract drift |
| Recursive decomposition | **Hierarchical** | high | highest | depth, lost goals |

## When to add subagents (and the cost of doing so)

Add a subagent only when **all** of these hold:

1. The subtask is **independent** — it doesn't need the parent's running context to
   make progress, only a clear brief.
2. The work **parallelizes** — N subtasks can run at once and the join is cheaper
   than doing them serially in one loop.
3. A fixture **shows the flatter topology missing the target** — too slow, too
   many serial tool calls, or context-window pressure that a fan-out relieves.

The cost of each subagent you add:

- **Tokens.** A worker re-reads its brief and runs its own tool loop. Two workers is
  roughly two extra contexts.
- **Latency variance.** The join waits on the slowest worker; one stuck worker
  stalls the whole task.
- **Coordination failure modes.** Briefs that under-specify, results that don't
  compose, workers that duplicate each other's work. The Evaluator scores
  trajectory validity precisely to catch these.
- **Cache pressure.** Spawning a subagent on a different model is the *right* way to
  use a cheaper model mid-task (switching the main loop's model invalidates its
  cache) — but it's still a separate context to warm.

Rule of thumb: if you can't name the independent subtasks before building, you don't
need an orchestrator yet. Ship single-agent, evaluate, and let a fixture tell you
where the fan-out is needed.

## Model routing across the topology

Which model runs each node — orchestrator vs worker, effort level per tier — is
`oc-claude-api`'s decision, read from its checkpoint. The common pattern is a strong
model on the orchestrator (it does the planning and the join) and a cheaper, faster
model on the workers (they do narrow, well-briefed subtasks). Agent Forge designs
the *shape*; oc-claude-api fills in *which model per node*.
