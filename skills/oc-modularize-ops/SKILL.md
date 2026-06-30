---
name: oc-modularize-ops
displayName: OC · Modularize Ops
version: 1.7.0
shortDesc: "Decompose a monolith with provably zero loss — golden fixtures from real data as the oracle. Willing to say don't."
phases: [plan, build]
triAgent: false
tryable: true
commands:
  - /oc-modularize
  - /oc-modularize assess
  - /oc-modularize characterize
  - /oc-modularize plan
  - /oc-modularize extract
  - /oc-modularize verify
  - /oc-modularize diff
  - /oc-modularize status
  - /oc-modularize abandon
description: >
  Monolith decomposition operator. Decides whether modularization is even the right call
  (and is willing to say no), captures golden fixtures from REAL data for every boundary
  as an equivalence oracle, plans the seams + data ownership, and proves zero
  functionality/data loss by replaying the fixtures. Supports parallel-copy and
  strangler-fig strategies. Hands the bulk code-move + live cutover to oc-migration-ops
  (Structural type) and per-module deployment to oc-fleet-ops. Use for /oc-modularize,
  "break up the monolith", "extract a service from a live system", "split this codebase
  safely", "golden fixtures", "no functionality loss". For a behaviour-git-diffable
  repo/package reorg, use oc-migration-ops Structural instead. Trigger when decomposing a
  LIVE monolith carrying real traffic.
governance:
  breaking_change_policy: skills/CHANGELOG.md
  last_reviewed: 2026-06-26
  owner: opchain
---

# Modularize Ops

Take a monolith — a codebase, a container, or a large deployment — and decompose it into
modules or services **without losing functionality or data**. The signature commitment of
this skill is not "it splits cleanly" but "the split is **provably** behavior- and
data-preserving," verified against **real** input/output captured at every boundary the
split crosses. Anyone can move files. The hard, valuable part — the part this skill owns —
is the proof that nothing changed.

The second, quieter commitment is that this skill is **willing to recommend not doing it**.
A monolith carrying real traffic with no real coupling pain does not need to become a
distributed system, and a premature split trades one well-understood problem for a network
tax plus a pile of distributed-systems complexity. Phase 0 is a genuine gate that can return
*"don't modularize, and here's why."* That honesty is the point — it mirrors how
`oc-migration-ops` is willing to say *"break this into sequential migrations / don't do this
all at once."*

This is **not** a code-mover. modularize-ops is the **decomposition brain plus the
equivalence oracle**: it decides *whether* and *how* to split, captures the golden fixtures
that define correctness, plans the seams and data ownership, and proves equivalence by
replaying those fixtures. The bulk code-move and the live cutover are **delegated to
`oc-migration-ops`'s Structural type** (`/oc-migrate execute`), and deployment of the
resulting modules is **delegated to `oc-fleet-ops`**. modularize-ops owns the decision and
the proof, not a second implementation of `git mv`.

---

## /oc-modularize — Command Reference

```
MODULARIZE OPS COMMANDS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  DECIDE
  /oc-modularize              Resume or start; show recommendation + strategy + next module
  /oc-modularize assess       Score modularization fitness — CAN return "don't modularize"

  CHARACTERIZE  (the signature move)
  /oc-modularize characterize Capture golden fixtures from REAL data at every boundary

  PLAN
  /oc-modularize plan         Seams + data ownership + strategy (parallel-copy | strangler)

  EXTRACT  (one module at a time)
  /oc-modularize extract [m]  Seam contract + façade/adapter; emit Structural plan for the move

  PROVE
  /oc-modularize verify       Replay fixtures → assert equivalence + data integrity
  /oc-modularize diff         Show monolith-behavior vs modularized-behavior per boundary

  UTILITIES
  /oc-modularize status       Checkpoint status (recommendation, strategy, modules)
  /oc-modularize abandon      Archive checkpoint (.bak) + warn about mid-extraction façades

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  Type any command to begin. /oc-modularize to see this again.
```

---

## Boundary vs `oc-migration-ops` Structural (read this first)

`oc-migration-ops`'s **Structural** type already auto-detects *"Split the monorepo"* and
already owns `files_moved` / `imports_updated` state. It is fully wired. The two skills must
**not both fire on the same request**, so the routing trigger is explicit and unambiguous:

| Signal | Routes to |
|---|---|
| Live monolith, real prod traffic, must prove no functionality/data loss with a real-data oracle | **oc-modularize-ops** |
| Repo/package reorg where imports move and behaviour is git-diffable (no live-traffic equivalence risk) | **oc-migration-ops** Structural |

**Deconfliction note.** When a request matches both, modularize-ops runs **first** (assess →
characterize → plan → verify), then **emits a Structural migration plan** that
`oc-migration-ops /oc-migrate execute` runs for the actual code-move and cutover.
modularize-ops never silently competes with the Structural auto-detect. It owns the
**decision + the oracle**; migration-ops owns the **move**. If you find yourself moving
files in this skill, you are in the wrong skill.

---

## Operating model — gated ops phases

This is an `-ops` skill: a linear sequence of **gated** phases, not a tri-agent loop. Two
gates are real decision points (marked ★) — the should-we? gate and the strategy gate. Each
phase writes its result to the checkpoint before the next can start.

```
assess ──★should-we?──► characterize ──► plan ──★strategy?──► extract (×N) ──► verify ──► cutover handoff
 (is it      (CAN say     (golden          (seams +              (seam contract   (replay      (→ migration-ops
  worth it?)   "no")        fixtures from    data ownership +      + façade; bulk    fixtures →   Structural execute
                            REAL data)        strategy)            move delegated)   equivalence  for move+cutover,
                                                                                     + integrity)  → fleet-ops deploy)
```

The `plan` phase of this skill covers **assess / characterize / plan**; the `build` phase
covers **the seam contracts + façade adapters + the fixture-capture harness + the
equivalence verifier**. The bulk module code-move is delegated to `oc-migration-ops` — which
is exactly why this skill's `build` output is contracts, façades, fixtures, and a verifier,
and *not* moved modules.

### Phase 0 — Assess (`/oc-modularize assess`) — *can say "don't"*

Inventory the monolith (reuse `oc-reverse-spec` if it has already documented the system).
Then score modularization **fitness honestly**, weighing the real drivers against the
anti-signals:

| Justifies a split | Anti-signal (leave it a monolith) |
|---|---|
| independent scaling needs per area | premature — no real coupling pain yet |
| team-ownership boundaries forming | small team, one deploy cadence is fine |
| deploy-coupling / blast-radius pain | a split would just add a network tax + distributed-systems complexity |
| divergent runtime/lib needs | the "modules" are deeply chatty — latency would regress |

The output of this phase is a **recommendation that may be `"don't modularize"` with the
reasons**, or a candidate module map with rationale. This is a true gate, not a formality.
A split that adds a network hop between two chatty code paths, or that fractures one team's
single deploy cadence into four, is a net loss — and the skill says so. Write
`recommendation` to the checkpoint before proceeding.

### Phase 1 — Characterize (`/oc-modularize characterize`) — the signature move

For **every boundary a split would cross** — endpoints, APIs, queue consumers, DB access
patterns, cross-module calls, cron jobs — capture **golden fixtures from real data**:

- **Record real `(input → output)` pairs** at each boundary: request/response for an
  endpoint, message-in/message-out for a queue consumer, query → rows for a DB access
  pattern. Sample from prod or a **prod-faithful replica**.
- **From real data, not mock.** Mock data is explicitly **disallowed** as the equivalence
  oracle. The entire value of the proof rests on the fixtures reflecting what actually
  happens in production — a hand-written mock proves only that the system matches your
  assumptions, which is exactly the thing a split puts at risk.
- **PII handling.** Redact or synthesize-preserving-shape where the payload carries
  sensitive data, but keep the **behavioral signal** intact (a redacted field still
  exercises the same code path). This phase **loops `oc-security-auditor`** to vet the
  capture before any fixtures are written to disk — see *Risks (R1)*. `modularization/fixtures/`
  is gitignored by default with explicit opt-in.
- **Coverage gate.** Every crossed boundary needs fixtures, **including error paths and edge
  cases** — the 404, the malformed message, the empty result set, the timeout. A split that
  preserves the happy path but silently changes a 500 into a 200 has lost functionality.
  **No fixture → no split** for that seam. Period.

These fixtures become the **equivalence oracle** consumed in Phase 4. `fixture_coverage` in
the checkpoint tracks `boundaries_total` vs `boundaries_with_fixtures`; they must be equal
before the strategy gate clears.

### Phase 2 — Plan seams (`/oc-modularize plan`) — *strategy gate*

Define the module boundaries, the **seam contracts** between them (the explicit interface
each module exposes and consumes), and **data ownership** — which module owns which tables.
Shared data is the hard case: resolve each shared table by **split**, **duplicate**, or
**promote to a shared service**, and record the choice. Then choose the strategy:

| Strategy | Shape |
|---|---|
| **Parallel-copy** *(preferred)* | duplicate the codebase, modularize the **copy**, keep the prod monolith serving untouched, and swap over only once the copy is verified equivalent. Lowest blast radius — prod is never mid-surgery. |
| **Strangler-fig / in-place** | extract one module at a time behind a façade, route traffic to it incrementally, and let the monolith shrink over time. Use when a full parallel copy is impractical. |

The strategy gate (★) requires: `recommendation: modularize`, full fixture coverage, a seam
contract per boundary, and a data-ownership decision per shared table. Write `strategy` to
the checkpoint here.

### Phase 3 — Extract (`/oc-modularize extract [module]`)

Produce, **one module at a time**: the module's **seam contract** and a **façade/adapter**
that keeps the monolith working while the module is carved out. The **bulk code-move itself
is delegated** — modularize-ops emits a **Structural migration plan** and hands it to
`oc-migration-ops /oc-migrate execute`, the real ecosystem mechanism for moving code with
verification gates.

This is the deliberate division of labor (see *Risks (R3)*): modularize-ops is the
**decomposition brain + equivalence oracle**, *not* a second code-mover. That is why this
skill's `build`-phase output is **seam contracts + façades + fixtures + the verifier**, and
never "moved modules" in its own checkpoint. Extract one module, verify it, then extract the
next — never extract the whole map at once.

### Phase 4 — Verify (`/oc-modularize verify`) — the equivalence proof

**Replay the golden fixtures** against the modularized system and assert **semantic
equivalence** with the monolith's recorded outputs, boundary by boundary. Equivalence, not
byte-identity — normalize for things that are legitimately allowed to differ (timestamps,
non-deterministic ordering) and assert on the behavioral payload. On top of behavioral
equivalence, assert **data integrity**:

- **row counts** match across the new seam,
- **checksums** on owned data are preserved,
- **no orphaned references** dangle across the boundary you just cut.

This is the *"perfect split, no data loss"* proof. A FAIL means **fix the extraction or roll
it back** — never paper over a divergence. `/oc-modularize diff` renders monolith-behavior
vs modularized-behavior per boundary so the exact point of divergence is visible, not buried
in a pass/fail. "It compiles" and "the tests pass" are not this gate; **fixture replay is**.

### Phase 5 — Cutover handoff

Hand the verified module set off — as a **named artifact, not conversation** (see *Handoff
contract* below):

- **`oc-migration-ops` (Structural type)** — the bulk code-move + the **live cutover**
  mechanics (dual-write, traffic shift, decommission) via `/oc-migrate execute`.
- **`oc-fleet-ops`** — **deploy** the resulting containers across the target environment.

---

## Session Persistence (Checkpoint Protocol)

This skill mirrors `oc-migration-ops`'s persistence discipline, because **a half-extracted
monolith sitting behind a façade is exactly the orphan risk** the checkpoint protocol exists
to guard against. Leaving a session with one module half-carved-out and no record of it is
how a split silently rots.

- **Resume on start.** On `/oc-modularize` (no subcommand), read the checkpoint and show
  `recommendation`, `strategy`, the list of extracted modules, and **which module is next**;
  offer *continue / restart / show*.
- **Concurrent guard.** **One active modularization per project.** If a checkpoint has
  `status: in_progress`, **block** a new `/oc-modularize assess` or `/oc-modularize plan`
  until the current one is completed, verified, or explicitly abandoned. Two concurrent
  decompositions on one codebase is a guaranteed seam collision.
- **`/oc-modularize abandon`.** Archive the checkpoint (`.bak`) and **warn**: *"the monolith
  may be mid-extraction behind a façade; run `/oc-modularize verify` to check current health
  before starting over."* Abandoning is allowed — abandoning silently is not.

---

## Boundaries — what oc-modularize-ops does NOT own

| Concern | Owner |
|---|---|
| Bulk code-move + live cutover (dual-write, traffic shift) | `oc-migration-ops` (Structural `/oc-migrate execute`) |
| Deploying the resulting modules | `oc-fleet-ops` |
| Documenting the existing monolith | `oc-reverse-spec` |
| Greenfield architecture | `oc-app-architect` |
| The engine swap (DB / framework / platform) itself | `oc-migration-ops` |

The throughline: modularize-ops owns the **decision** and the **equivalence proof**.
Everything that physically moves code, moves traffic, or stands up infrastructure is
delegated to a skill built for that act.

---

## Cross-skill wiring

| Reads from | Why |
|---|---|
| `oc-reverse-spec` | current architecture / module map |
| `oc-app-architect` | spec, data model |
| `oc-code-auditor` | coupling hotspots — natural seams |
| `oc-scale-ops` | which areas need independent scaling (a real split driver) |

| Chains to | Why |
|---|---|
| `oc-migration-ops` | emit a Structural migration plan for the move + live cutover |
| `oc-fleet-ops` | deploy the carved-out modules |
| `oc-code-auditor` | audit each extracted module |
| `oc-git-ops` | commit per extraction |

> **Resolves an existing seam.** 1.7 adds a note to `oc-migration-ops`'s **Structural** type
> pointing live, real-traffic decompositions at `oc-modularize-ops` and stating the
> deconfliction trigger above. The Structural type stays the home for git-diffable reorgs;
> this skill takes the live-equivalence-risk cases.

---

## Handoff contract — the modularize → migration → fleet chain

The orchestrator passes context through **checkpoints, not conversation** (orchestrator.md
§3, *Context Passing*). So this chain needs a **named payload**, not "ingest it directly":

- **oc-modularize-ops writes** `skill_state.modules[]`, with per module:
  `{ id, seam_contract, owns_data[], image_hint, equivalence_verified }`.
- **oc-migration-ops reads** that set to build the Structural cutover plan — which module
  moves, what data it owns, where the dual-write boundaries sit.
- **oc-fleet-ops `topology` reads** the same `modules[]` to seed containers
  (`module.id → container`, `module.image_hint → image`).

The shared, named artifact is `modularization/module-map.json`, referenced by both
downstream skills. The handoff is that file, not a sentence in chat.

---

## PM-Tool MCP Integration (parent + per-module child, like migration-ops)

Mirrors `oc-migration-ops`'s parent + step-child mirror. The runtime contract (tool names,
retry/backoff, idempotency markers, `pm_deferred_actions[]`) is deferred to
`oc-integrations-engineer/references/pm-mcp-protocol.md`; this skill only shapes the writes:

- **Parent ticket** on `/oc-modularize plan`: title *"Modularize: {monolith} → N modules"*,
  type `epic` / `chore` from `pm.yaml`, body = strategy + abort criteria + fixture coverage.
- **Child per module** with the state machine
  `plan-pending → in_progress → equivalence-verified → done` (and `blocked` on a failed
  replay), marker `<!-- opchain:oc-modularize-ops:module:<module-id> -->`.
- Records parent + child ids in `skill_state.pm.{parent_ticket, module_tickets[]}`.
- No ticket / no PM-MCP in context → no PM write; the modularization proceeds and updates are
  deferred (`pm_deferred_actions[]`).

---

## Checkpoint

Location: `{project-dir}/.checkpoints/oc-modularize-ops.checkpoint.json`

```jsonc
"progress_table": [
  { "id": "assess",        "label": "Modularization fitness",   "status": "not_started" },
  { "id": "assess-gate",   "label": "★ Should-we? decision",    "status": "not_started" },
  { "id": "characterize",  "label": "Golden fixtures (real)",   "status": "not_started" },
  { "id": "plan",          "label": "Seams + data ownership",   "status": "not_started" },
  { "id": "plan-gate",     "label": "★ Strategy approval",      "status": "not_started" },
  { "id": "extract",       "label": "Extract modules (×N)",     "status": "not_started" },
  { "id": "verify",        "label": "Equivalence + integrity",  "status": "not_started" },
  { "id": "cutover",       "label": "Cutover handoff",          "status": "not_started" }
]
```

```jsonc
"skill_state": {
  "recommendation": "modularize | do-not-modularize",
  "strategy": "parallel-copy | strangler",
  "status": "in_progress",
  "golden_fixtures_path": "modularization/fixtures/",
  "fixture_coverage": { "boundaries_total": 18, "boundaries_with_fixtures": 18 },
  "modules": [
    { "id": "billing", "seam_contract": "modularization/seams/billing.md",
      "owns_data": ["invoices","charges"], "fixtures_captured": true,
      "extracted": true, "equivalence_verified": true }
  ]
}
```

| Event | What to Save |
|---|---|
| Fitness assessed | `recommendation` + the why |
| Fixtures captured | `golden_fixtures_path`, `fixture_coverage` |
| Strategy chosen | `strategy`, per-module `seam_contract` + `owns_data` |
| Module extracted | `modules[].extracted` |
| Equivalence proven | `modules[].equivalence_verified` |
| Handoff emitted | `modularization/module-map.json` written for migration-ops + fleet-ops |

---

## references/

Planned companion docs for this skill (not yet written):

- `modularization-fitness.md` — when to / when **not** to split; the anti-signals and the
  scoring rubric behind the should-we? gate.
- `golden-fixtures.md` — real-data capture, PII handling (redact / synthesize-preserving-shape),
  the coverage gate, and how the fixtures become the equivalence oracle.
- `seam-patterns.md` — façade / strangler-fig / parallel-copy, and splitting data ownership
  across a new seam.
- `equivalence-verification.md` — fixture replay, semantic-equivalence normalization, and the
  data-integrity checks (row counts, checksums, orphaned references).

---

## Principles

1. **Be willing to say "don't."** A bad split is worse than a monolith — it trades one
   well-understood problem for a network tax plus distributed-systems complexity. Phase 0 is
   a real gate.
2. **Real data or no oracle.** Mock fixtures cannot prove behavior preservation; they prove
   only that the system matches your assumptions, which is the thing a split puts at risk.
3. **No fixture, no split.** Every crossed boundary — happy path, error path, and edge case —
   is characterized before it is cut.
4. **One module at a time, façade always up.** Prod keeps serving throughout; the monolith is
   never mid-surgery with the lights off.
5. **Equivalence is the gate, not "it compiles."** Replay proves it; a green build and
   passing unit tests do not.
6. **Own the decision, delegate the move.** Code-move + live cutover → `oc-migration-ops`
   Structural; deploy → `oc-fleet-ops`. This skill is the brain and the oracle, not a second
   code-mover.
