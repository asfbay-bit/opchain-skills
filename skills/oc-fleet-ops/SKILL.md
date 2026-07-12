---
name: oc-fleet-ops
displayName: OC · Fleet Ops
version: 1.8.1
shortDesc: "Provision and operate containers across self-managed infra — k8s/Nomad/Compose/VMs. Terraform when it fits, not always."
phases: [build]
triAgent: false
tryable: true
commands:
  - /oc-fleet
  - /oc-fleet topology
  - /oc-fleet provision
  - /oc-fleet deploy
  - /oc-fleet verify
  - /oc-fleet scale
  - /oc-fleet drain
  - /oc-fleet rollback
  - /oc-fleet status
description: >
  Multi-container / orchestration deployment operator for self-managed infrastructure.
  Declares topology (containers/services × target environment), provisions infra with the
  right IaC tool (Terraform/OpenTofu when it fits, else Ansible/cloud-init/k8s-manifests/
  Helm/Nomad/Compose), rolls the fleet with a rollout strategy, verifies fleet-wide health,
  and operates day-2 (scale/drain/replace/rollback). Specifically lands the modules
  oc-modularize-ops carves out of a monolith. Use for /oc-fleet, "deploy multiple
  containers", "kubernetes", "terraform", "orchestrate containers", "on-prem deployment",
  "deploy to VMs", "self-managed infra", "container fleet". Complements oc-deploy-ops
  (single-app managed PaaS): managed app → deploy-ops; multi-container/self-managed/IaC →
  fleet-ops. Trigger on multi-container / IaC / self-managed deployment.
governance:
  breaking_change_policy: skills/CHANGELOG.md
  last_reviewed: 2026-06-26
  owner: opchain
---

# Fleet Ops

**On first invocation, read `references/orchestrator.md` and follow its welcome protocol.**

Deploy and operate **one-or-more containers across arbitrary, self-managed environments**
— the territory `oc-deploy-ops` routes elsewhere today. Where deploy-ops is opinionated
about a *single app on a managed PaaS* (Workers, Render, Fly, Shuttle), Fleet Ops owns
the messier other half: multi-container orchestration (k8s/Nomad/Compose/Swarm),
infrastructure-as-code (Terraform *and its alternatives*), and arbitrary environments
(on-prem Linux VMs, GCE, bare metal). It is also the skill that **lands the modules
`oc-modularize-ops` carves out of a former monolith** — once the seams are proven, the
fleet is where those modules actually run.

This is **not** a tri-agent forge and **not** a managed-PaaS deployer. It is a gated ops
operator: declare what runs where, provision the infra with the IaC tool that fits (not
Terraform by reflex), roll the fleet behind a strategy, verify health across *every*
replica and cross-service edge, then operate day-2 — scale, drain, replace, roll back.
The IaC apply step is the highest-blast-radius operation in the entire opchain catalog,
so it is gated behind a mandatory dry-run/plan that **never auto-applies**.

> Mnemonic: **deploy-ops pushes one app to a platform; fleet-ops stands up and runs a
> fleet on infra you own.** deploy-ops ↔ fleet-ops are **peers**, not a chain — the
> orchestrator routes by "managed app vs self-managed fleet" (see Boundaries). When a
> project carries both checkpoints, that's the disambiguator.

---

## /oc-fleet — Command Reference

```
FLEET OPS COMMANDS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  PLAN & PROVISION
  /oc-fleet              Show fleet status for the current project (this menu if none)
  /oc-fleet topology     Declare containers/services × target environment(s)
  /oc-fleet provision    Stand up infra with the right IaC tool (gated dry-run first)

  DEPLOY & VERIFY
  /oc-fleet deploy       Roll the fleet with a rollout strategy (rolling/blue-green/canary)
  /oc-fleet verify       Fleet-wide health: every replica, every cross-service edge

  DAY-2 OPERATE
  /oc-fleet scale        Scale replicas/nodes to a target (applies; never decides)
  /oc-fleet drain        Cordon + drain a node for maintenance / replace a container
  /oc-fleet rollback     Roll the whole fleet back to last-good

  UTILITIES
  /oc-fleet status       Current topology, fleet_health, last deploy, rollback availability
  /checkpoint            Show checkpoint status

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  Type any command to begin. /oc-fleet to see this again.
```

---

## How This Skill Fits the Build Pipeline

```
oc-modularize-ops (module set) ──┐
oc-stack-forge (infra decision)──┼──► oc-fleet-ops ──► running fleet
oc-scale-ops (replica targets) ──┘        │            on self-managed infra
oc-app-architect (07-devops.md)──┘        │
                                          ▼
          topology ─► provision ─★plan-gate─► deploy ─► verify ─► operate
                                          │
                                          ▼
                                  oc-monitoring-ops
                                  (post-deploy observability across the fleet)
```

Fleet Ops sits next to `oc-deploy-ops` as a peer, downstream of `oc-modularize-ops`
(it deploys what modularize carved out) and `oc-stack-forge` (it actuates the infra
decision). `oc-scale-ops` decides replica/capacity **targets**; fleet-ops **applies**
them — it never decides them itself. After a fleet is up, it chains to
`oc-monitoring-ops` for continuous prod observability and `oc-git-ops` to commit the IaC.

---

## Operating model — gated ops phases

```
topology ──► provision ──★plan-gate──► deploy ──► verify ──► operate
(what runs    (IaC, tool   (dry-run    (roll the   (fleet-wide  (scale / drain /
 where)        chosen to    NEVER       fleet)      health)      replace / rollback)
               fit the env) auto-apply)
```

The shape is deliberately not a forge loop. Provisioning real infra is one-directional
and dangerous: the gate is between **plan** and **apply**, not between a builder and an
evaluator. Each phase writes its result to the checkpoint so a half-rolled fleet survives
across sessions.

### Phase 0 — Topology (`/oc-fleet topology`)

Declare **what runs where**: the set of containers/services, replica counts, the target
environment(s), networking, secrets, and state/volumes. This is the anchor every later
phase grades against.

When the input is a module map from `oc-modularize-ops`, ingest it via the named
*Handoff contract* (below) — each module becomes one (or more) container(s)
(`module.id → container`, `module.image_hint → image`). The module map
(`modularization/module-map.json`) is the shared, named artifact; topology never
re-derives the seams, it reads them.

Topology output is recorded in `skill_state` (`containers[]`, `nodes[]`, `environment`)
so `provision` and `deploy` operate against a declared, diffable target — not a verbal
description.

### Phase 1 — Provision (`/oc-fleet provision`) — IaC, *Terraform when it fits*

Stand up the infra. **The tool is chosen to fit the environment — not Terraform by
reflex** (the explicit "Terraform is not always the answer" stance):

| Tool | When |
|---|---|
| **Terraform / OpenTofu** | cloud resources, multi-provider, long-lived infra worth a state file |
| **Ansible / cloud-init** | configuring *existing* VMs, on-prem boxes, no desire for TF state |
| **k8s manifests / Helm / Kustomize** | you already have a cluster |
| **Nomad jobspecs** | a Nomad shop |
| **docker-compose** | single-host, small fleet, dev/staging |

The skill **picks and justifies** — the rationale is recorded in
`skill_state.iac_choice_rationale` (e.g. *"existing cluster → Helm; no new TF state
needed"*), so the choice is auditable in the PR diff, not buried in chat.

**IaC apply is gated: dry-run/plan first, never auto-apply.** This is the
`prov-gate` ★ in the checkpoint and the single most dangerous act any opchain skill
performs (see *Failure modes* and Principle 4):

- Always run the plan/dry-run (`terraform plan`, `helm diff`/`--dry-run`,
  `ansible --check`, `kubectl diff`, `nomad plan`) and surface the full diff first.
- Require **explicit target-environment confirmation** before apply — name the
  environment so prod is never applied to by accident.
- Apply only after the human approves the plan-gate.

### Phase 2 — Deploy (`/oc-fleet deploy`)

Roll the fleet: build/push images, apply manifests/plans, and deploy per-container with a
**rollout strategy** — rolling, blue-green, or canary across nodes. This is **per-node and
per-container granularity, not a single atomic push**: a fleet is many moving parts, and
the rollout marches through them with a failure threshold, not all at once.

The chosen strategy is recorded in `skill_state.rollout_strategy`, and `last_deploy` is
stamped on completion. Image references are pinned (`name:sha`) so a rollback target is
always unambiguous.

### Phase 3 — Verify (`/oc-fleet verify`)

Health across the **fleet**, not one URL. A self-managed multi-node fleet has far more
surface than a single PaaS app, so verify checks all of:

- every container/replica is healthy (`healthy == replicas` per container);
- cross-service connectivity is up (service A can actually reach service B);
- **the new module-boundary calls — the seams `oc-modularize-ops` carved (Phase 2 of
  that chain) — actually resolve** end to end;
- no node left behind (every node in `nodes[]` reporting).

`fleet_health` is written as a **tri-state**: `ok | partial | unhealthy`. A fleet can be
*partially* healthy — some replicas up, some down — which is operationally distinct from a
flat pass/fail and must not be collapsed to `ok`.

### Phase 4 — Operate (`/oc-fleet scale|drain|rollback`)

Day-2, the part deploy-ops doesn't have:

- **`/oc-fleet scale`** — apply replica/node counts to a target. Fleet-ops **actuates**;
  `oc-scale-ops` is the skill that **decides** the target (advisory). Fleet-ops never
  invents capacity numbers.
- **`/oc-fleet drain`** — cordon + drain a node for maintenance, or replace a failed
  container, rescheduling its workloads first.
- **`/oc-fleet rollback`** — roll the whole fleet back to last-good. Recorded
  `rollback_available` and the pinned prior image set make this a 30-second action.

### Failure modes (verify + operate)

A self-managed multi-node fleet has *more* failure surface than a single PaaS app, so
these are first-class, mirroring `oc-deploy-ops` / `oc-monitoring-ops`:

- **Partial rollout** → halt at the configured failure threshold and **auto-rollback the
  rolled subset**; never march a broken image across the whole fleet.
- **Undrainable node** → escalate (workloads won't reschedule) rather than force-kill.
- **Image-pull / registry-auth failure** → fail the deploy at the pull step, keep prior
  replicas serving; a registry auth problem must not take the fleet down.
- **`fleet_health` is tri-state** (`ok | partial | unhealthy`), not a flat `ok` — a fleet
  can be *partially* healthy, which the operator must be able to see and reason about.

---

## Scope discipline — first-class environments (like deploy-ops's Platform Matrix)

fleet-ops is broad; it ships 1.7 with a **first-class shortlist** rather than claiming
universal coverage (mirrors `oc-deploy-ops`'s intentionally-short Platform Matrix — better
to be excellent at three environments than mediocre at ten):

| Environment | 1.7 status |
|---|---|
| docker-compose (single host) | **first-class** |
| Kubernetes (manifests / Helm) | **first-class** |
| Linux VMs (Ansible / cloud-init), on-prem or GCE | **first-class** |
| Nomad | reachable, not first-class |
| Terraform multi-cloud (large) | reachable, not first-class |

"Reachable, not first-class" means the skill will help but doesn't carry a vetted IaC
recipe + `/demo` scenario for it yet. A later minor release promotes any of these by adding
that recipe and scenario.

---

## Boundaries — what oc-fleet-ops does NOT own

| Concern | Owner |
|---|---|
| Single app → managed PaaS (Workers/Render/Heroku/Fly/Shuttle) | `oc-deploy-ops` (**peer**, not chain) |
| Continuous prod observability (uptime/errors/SLOs) | `oc-monitoring-ops` |
| Capacity/caching/query strategy + replica **targets** | `oc-scale-ops` (advisory) — fleet-ops **actuates** replica/node counts, it never **decides** them |
| Choosing the target platform | `oc-stack-forge` |
| The engine swap / platform migration | `oc-migration-ops` |

The peer relationship with `oc-deploy-ops` is the load-bearing boundary: a managed app on
a PaaS is **not** in scope here, and a self-managed multi-container fleet is **not** in
scope for deploy-ops. Route by "managed app vs self-managed fleet" — see the orchestrator
note below.

---

## Cross-skill wiring

| Reads from | Why |
|---|---|
| `oc-modularize-ops` | the module set to deploy (via the Handoff contract / `modularization/module-map.json`) |
| `oc-stack-forge` | target infra / platform decision |
| `oc-scale-ops` | replica / capacity **targets** (fleet-ops applies; scale-ops decides) |
| `oc-app-architect` (`07-devops.md`) | deploy pattern intent |

| Chains to | Why |
|---|---|
| `oc-monitoring-ops` | post-deploy observability across the fleet |
| `oc-git-ops` | commit the IaC |

> **Resolves an existing seam:** deploy-ops's Platform Matrix currently routes bare-metal
> to *oc-migration-ops* (verbatim: *"bare-metal needs oc-migration-ops, not
> oc-deploy-ops"*). 1.7 **edits that row** to re-point self-managed/multi-node/IaC deploys
> at `oc-fleet-ops` — a behavioural change. It also registers `deploy-ops ↔ fleet-ops` as
> **peers** in the orchestrator so routing is unambiguous when a project has both
> checkpoints (managed app → deploy-ops; self-managed fleet → fleet-ops). The justification
> for the re-point: migration-ops is a *transformation engine* (engine swaps, cutovers)
> with **no provision / topology / fleet-health surface** — it was only ever the bare-metal
> pointer by default. fleet-ops gives that territory a real home.

---

## Handoff contract — the modularize → migration → fleet chain

The orchestrator passes context through **checkpoints, not conversation** (orchestrator.md
§3, *Context Passing*). So the chain needs a named payload, not "ingest it directly":

- **oc-modularize-ops writes** `skill_state.modules[]` with, per module:
  `{ id, seam_contract, owns_data[], image_hint, equivalence_verified }`.
- **oc-migration-ops reads** that set to build the Structural cutover plan (which module
  moves, what data it owns, dual-write boundaries).
- **oc-fleet-ops `topology` reads** the same `modules[]` to seed containers
  (`module.id → container`, `module.image_hint → image`). The module map is the shared,
  named artifact (`modularization/module-map.json`), referenced by both downstream skills.

Fleet-ops only deploys modules whose `equivalence_verified` is `true` — an unverified
module is not a deployable container.

---

## PM-Tool MCP Integration (fleet-deploy ticket, like deploy-ops)

Like its peer `oc-deploy-ops`, fleet-ops posts to a linked ticket when one is in context
(e.g. `/oc-fleet --ticket TICKET-1234`). It defers the runtime contract (tool names,
retry/backoff, idempotency markers, `pm_deferred_actions[]`) to
`oc-integrations-engineer/references/pm-mcp-protocol.md` and only shapes:

- **Fleet-deploy ticket** per `environment + commit` on `/oc-fleet deploy`, marker
  `<!-- opchain:oc-fleet-ops:fleet-deploy:<env>:<sha> -->`, body = topology summary +
  rollout strategy + IaC tool.
- **Per-event updates:** `rolled` / `partial-halt` / `rolled-back` transitions, each with
  its own marker; records `skill_state.pm.deploy_tickets[]`.
- No PM-MCP availability → **deploy proceeds**; updates are deferred
  (`pm_deferred_actions[]`). PM writes never block a deploy.

---

## Checkpoint

### Location
`{project-dir}/.checkpoints/oc-fleet-ops.checkpoint.json`

### Progress table

```jsonc
"progress_table": [
  { "id": "topology",   "label": "Containers × environment",  "status": "not_started" },
  { "id": "provision",  "label": "Provision infra (IaC)",     "status": "not_started" },
  { "id": "prov-gate",  "label": "★ Dry-run / plan approval",  "status": "not_started" },
  { "id": "deploy",     "label": "Roll the fleet",            "status": "not_started" },
  { "id": "verify",     "label": "Fleet-wide health",         "status": "not_started" },
  { "id": "operate",    "label": "Day-2 (scale/drain/roll)",  "status": "not_started" }
]
```

### Skill state

```jsonc
"skill_state": {
  "environment": "kubernetes | nomad | compose | vms | gce | baremetal",
  "iac_tool": "terraform | ansible | helm | nomad | compose",
  "iac_choice_rationale": "existing cluster → Helm; no new TF state needed",
  "containers": [
    { "name": "billing", "image": "billing:abc123", "replicas": 3, "healthy": 3 }
  ],
  "nodes": ["node-a","node-b"],
  "rollout_strategy": "rolling",
  "last_deploy": "2026-07-xxTxx:xxZ",
  "rollback_available": true,
  "fleet_health": "ok | partial | unhealthy"
}
```

### When to write

| Event | What to save |
|---|---|
| Topology declared | `environment`, `containers[]`, `nodes[]` |
| IaC tool chosen | `iac_tool`, `iac_choice_rationale` |
| Plan-gate approved | `prov-gate` → `done` after explicit env confirmation |
| Fleet rolled | `rollout_strategy`, `last_deploy`, `rollback_available` |
| Health verified | `fleet_health` (tri-state), per-container `healthy` counts |
| Day-2 action | scale/drain/rollback result + new `fleet_health` |

---

## references/

> Planned companion docs for the S4 build (not yet written).

- `topology-design.md` — containers × environment, networking, secrets, state.
- `iac-selection.md` — Terraform-vs-alternatives decision matrix.
- `rollout-strategies.md` — rolling / blue-green / canary on self-managed infra.
- `fleet-verification.md` — fleet-wide health, cross-service + module-boundary checks.

---

## Principles

1. **Terraform is a tool, not the answer.** Pick IaC to fit the environment; justify it
   in `iac_choice_rationale`. Cloud + state file → Terraform/OpenTofu; existing VMs →
   Ansible; existing cluster → Helm; single host → Compose.
2. **A fleet is not one URL.** Verify every replica and every cross-service edge — and the
   module-boundary calls the seams introduced — not a single health endpoint.
3. **Roll, don't big-bang.** Rolling / blue-green / canary, per-node granularity, with a
   failure threshold that halts and auto-rolls-back the rolled subset.
4. **Dry-run before apply, always.** IaC apply is the catalog's highest-blast-radius act;
   the plan-gate never auto-applies and demands explicit target-environment confirmation.
5. **30-second rollback for the whole fleet.** Record last-good (pinned images) every
   deploy so `rollback_available` is always true after a successful roll.
6. **deploy-ops's peer, not its rival.** Managed PaaS → deploy-ops; self-managed fleet →
   here. Scale targets come from scale-ops — fleet-ops actuates, it never decides.
