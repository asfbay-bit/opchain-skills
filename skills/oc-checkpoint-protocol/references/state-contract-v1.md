# Checkpoint state contract v1

This reference is the public contract shared by checkpoint files, MCP
transports, and cross-skill consumers. The executable definitions live in
`src/lib/mcp/checkpoint-contract.js` and `src/lib/mcp/checkpoint-store.js`.

## Compatibility

- New files continue to stamp `protocol_version: "1.1"`.
- Readers continue to accept wire `"1.0"` and `"1.1"`.
- Every field introduced here is optional on an existing checkpoint. A
  consumer that requires one of these fields validates it at its read boundary
  and fails closed if it is absent or malformed.
- This contract does not introduce evaluation history or any other 2.0 field.

## Lifecycle timestamps

`updated_at` remains required for wire compatibility. New writers also set
`record_updated_at` to the same instant whenever the checkpoint record changes.
Metadata-only writes do not change `verified_at` or `candidate`.

```json
{
  "updated_at": "2026-09-13T18:00:00Z",
  "record_updated_at": "2026-09-13T18:00:00Z",
  "verified_at": "2026-09-13T17:55:00Z",
  "candidate": {
    "kind": "git_commit",
    "id": "0123456789abcdef"
  }
}
```

`verified_at` is meaningful only with immutable `candidate` identity. A
consumer must never treat a fresh `record_updated_at` as fresh verification.
Legacy readers use `updated_at`; lifecycle-aware readers use
`record_updated_at ?? updated_at`.

## Finding lifecycle

Aggregate severity counts are not open-finding counts. Producers may publish a
top-level `findings` array whose entries carry an explicit lifecycle:

```json
{
  "id": "F-003",
  "severity": "high",
  "status": "verified",
  "record_updated_at": "2026-09-13T18:00:00Z",
  "verified_at": "2026-09-13T17:55:00Z",
  "candidate": { "kind": "git_commit", "id": "0123456789abcdef" }
}
```

Allowed statuses are `open`, `fixed`, `verified`, `accepted`, and `dismissed`.
`verified` requires `verified_at` plus candidate identity. Other statuses may
not be presented as verified evidence.

## Typed handoffs

Cross-skill state that another skill must consume belongs in the additive
top-level `handoffs` array, not in undocumented `skill_state` keys. Every entry
has a stable id, its own contract version, producer identity, and immutable
artifact or candidate identity.

Supported v1 handoff types:

| Type | Required typed payload |
|---|---|
| `verification.verdict` | `payload.verdict` is `PASS`, `FAIL`, or `INCOMPLETE`; `verified_at` and `candidate` are required. |
| `architecture.module-map` | `artifact` with `kind` + `id`; payload describes the module-map version/reader fields. |
| `evidence.reference` | `artifact` with `kind` + `id`; payload describes purpose and consuming boundary. |

```json
{
  "id": "bugcheck-0123456-policy-v1",
  "contract_version": "1.0",
  "type": "verification.verdict",
  "created_at": "2026-09-13T17:55:00Z",
  "verified_at": "2026-09-13T17:55:00Z",
  "producer": { "skill": "oc-bug-check", "run_id": "run-42" },
  "candidate": { "kind": "git_commit", "id": "0123456789abcdef" },
  "payload": { "verdict": "PASS", "policy": "pre-commit-v1" }
}
```

Consumers call `getCheckpointHandoff(checkpoint, { type, id?, artifactId? })`.
The reader validates the full envelope and selected handoff, rejects unknown
types, and rejects ambiguous matches. It does not read private `skill_state`.

## Atomic store API

The store API is version `"1.0"`. Providers declare:

```js
{
  apiVersion: "1.0",
  capabilities: {
    durability: "process" | "filesystem" | "remote",
    scope: "session" | "project",
    atomicReplace: true | false,
    compareAndSwap: true | false
  },
  createSession(),
  hasSession(session),
  read(skill, session),
  write(skill, session, checkpoint, { expectedRevision })
}
```

A versioned read returns `{ checkpoint, revision }`. A compare-and-swap write
returns `{ revision }` and throws `CheckpointConflictError` when the supplied
revision is stale. A local gate-connected provider must be project-scoped,
survive process restart, atomically replace files, and implement
compare-and-swap. Hosted/session stores remain advisory and must not be
promoted into local verification receipts.

The local stdio MCP provider persists one file per skill under
`<project>/.checkpoints` and persists issued session UUIDs in a separate local
registry. A syntactically valid but unissued UUID is rejected. Every issued
session accesses the same project-and-skill checkpoint namespace, so a later
local session can resume prior project work. Its expected-revision policy is
explicit:

- omitted: atomic, unguarded replacement for compatibility;
- `null`: create-only; it conflicts if a record already exists;
- a revision string: update-only when it matches the current record.

C2 implements that provider with an OS-managed advisory lock and
write-then-rename replacement. The OS releases the lock when its holder dies;
no process steals locks based on age or PID guesses. It validates envelopes at
the local MCP boundary and returns the resulting revision on reads and writes.

The durable local provider supports macOS when `/usr/bin/lockf` is executable
and Linux when `flock` is executable on `PATH`. It checks this when the provider
is constructed and fails before creating `.checkpoints`, issuing a session, or
writing state. Other operating systems are explicitly unsupported by this
provider. The repository makes no Windows promise for the local MCP transport;
the hosted MCP remains available independently of this local capability.

### Local and hosted trust boundaries

The issued local session is a transport capability within one project. It
prevents clients from inventing an identifier, but it is not a security
boundary against another process running as the same OS user with access to
the project files. Hosted sessions remain separately authenticated and
advisory; remote JSON cannot authorize a local verification receipt.

## Canonical CLI writer

The copied `scripts/checkpoint.mjs` artifact remains self-contained. Its
`update`, `done`, and `reset` commands acquire the same per-skill OS advisory
lock policy as local MCP; validated writes use a same-directory temporary file
and atomic rename. Each accepted write stamps both `updated_at` and
`record_updated_at`. Supported hosts and failure behavior are identical to the
local provider: macOS with `/usr/bin/lockf`, Linux with `flock` on `PATH`, and an
explicit refusal elsewhere.
