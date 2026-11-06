# Shared learning runtime — contract 1

The dependency-free ESM core separates event identity, provenance and signature
validation from scorecards, lesson retrieval and rule lifecycle. `learning.mjs`
exports `handleLearning(args, { root, trustedKeys, now? })`; it returns JSON and
throws on invalid input. The caller owns presentation and exit status. The `now`
injection exists for tests; production callers use the actual clock.

## Commands and state

```
status
config enable|disable [scorecard|hindsight|evolve]
history ingest <events.json>
history list
scorecard report
hindsight stage <candidate.json>
hindsight activate <id> <approval.json>
hindsight query [skill]
hindsight retire <id>
evolve stage <candidate.json>
evolve adopt <id> <evaluation.json> <approval.json>
evolve revalidate <id> <evaluation.json> <approval.json>
evolve query [skill]
evolve retire <id>
```

The product router prefixes these commands with `learning`. All input paths are
resolved against the consumer root. Runtime state is `.opchain/learning/state.json`;
immutable history arrays in `.opchain/learning/history/*.json` are included in every
history read. Repeated ingestion cannot increase event counts. State uses atomic
replacement and a writer lock; an interrupted writer leaves `.write-lock` for
manual inspection. No automated force-unlock is provided. This is local workflow
state, not a tamper-proof or distributed transaction ledger.

Learning delivery defaults **off**. Explicitly set
`.opchain/self-improvement.json` to `{"enabled":true}` using `config enable`.
Optional boolean feature keys `scorecard`, `hindsight`, `evolve` disable individual
features. `OPCHAIN_SELF_IMPROVEMENT=off` or
`OPCHAIN_SELF_IMPROVEMENT_OFF=1` disables all retrieval. Per-feature
`OPCHAIN_HINDSIGHT=off`, `OPCHAIN_EVOLVE=off`, `OPCHAIN_SCORECARD=off` and the
corresponding `_OFF=1` names also disable retrieval. `0` and `false` are accepted
alongside `off`. Environment variables cannot override a disabled config.

Switches are checked on every read. Disabled retrieval does not load stored
learned state. No learned material is persisted into `CLAUDE.md`, `AGENTS.md`, or
other automatically loaded instruction files. Already loaded model context cannot
be recalled; start a new session after disabling previously delivered material.
`status.active` counts lifecycle labels, not verified or currently eligible items;
only `query.items` has passed current evidence, trust, expiry and switch checks.

## Canonical event schema

An ingestion file is an array:

```json
[{
  "schemaVersion": 1,
  "runId": "external-evaluation-run-123",
  "skill": "oc-app-architect",
  "rubric": "functionality",
  "at": "2026-09-01T12:00:00Z",
  "score": 4,
  "max": 10,
  "dimensions": {"errorPaths": 3},
  "sourceRefs": ["sprints/sprint-1/eval-round-1.md"]
}]
```

`schemaVersion`, `max` (default 10), `dimensions`, and references are optional.
`run_id` and `evidence_ref` are supported legacy aliases; `sourceRef` accepts one
reference. Other fields must be explicitly normalized by an adapter. The canonical
ID is `ev_` plus SHA-256 of sorted-key canonical JSON for `{runId,skill,rubric}`.
Without a run ID, the normalized semantic event is hashed instead; indistinguishable
legacy events cannot be assigned invented recurrence. Different payloads sharing an
ID fail, including changed timestamps, scores, or dimensions. References are merged
separately and never determine identity. A known ID may be supplied as `eventId`,
but must match the derived ID. Normalized `history list` output supplies candidate
evidence IDs.

Scorecards normalize scores to 0..1. A recurring weakness requires three distinct
results below 0.6 on the same skill and rubric. A decline requires two complete
three-event windows with a lower recent mean. Reports are deterministic descriptive
advisories; they do not claim causal attribution or statistical significance.

## Candidate contract

```json
{
  "schemaVersion": 1,
  "kind": "lesson",
  "skill": "oc-app-architect",
  "rubric": "functionality",
  "text": "Check error paths against the sprint contract before handoff.",
  "proposedAt": "2026-09-10T12:00:00Z",
  "expiresAt": "2026-12-01T12:00:00Z",
  "evidenceEventIds": ["ev_<hash1>", "ev_<hash2>", "ev_<hash3>"]
}
```

The placeholders must be replaced with actual canonical event IDs. All evidence
must exist, precede proposal, and demonstrate the same recurring weak rubric.
`stage` returns the immutable candidate digest as `id`, `evidenceDigest`, and
`projectId`. It never activates a candidate. Changing any candidate field requires
staging and approving a new digest. Retired candidates cannot be reactivated.

Rules use `kind: "rule"` plus this frozen `contract`:

```json
{
  "schemaVersion": 1,
  "frozenAt": "2026-09-09T12:00:00Z",
  "minTargetImprovement": 0.1,
  "baseline": {
    "mode": "task",
    "synthetic": false,
    "runId": "baseline-run",
    "generatedAt": "2026-09-08T12:00:00Z",
    "instructionBundle": {"base": "Complete relevant instruction bytes", "rule": ""},
    "instructionsHash": "<digest of instructionBundle>",
    "toolPolicyHash": "<hash>",
    "datasetHash": "<hash of fixed target, heldout and full split manifest>",
    "modelConfigHash": "<hash>",
    "outputHash": "<hash of task outputs and grading evidence>",
    "metrics": {"target": 0.5, "heldout": 0.8, "full": 0.7}
  }
}
```

All hashes are lowercase 64-character SHA-256. `digest(value)` exported by
`core.mjs` hashes sorted-key canonical JSON, including quotes around strings.
`minTargetImprovement` must be positive; all task metrics are normalized to 0..1
with larger values better. `baseline.generatedAt <= contract.frozenAt <=
candidate.proposedAt < evaluation.generatedAt <= current time`.

A candidate evaluation carries the baseline run fields plus `schemaVersion:1`,
`candidateDigest`, `candidateRuleHash` (digest of candidate text), and
`contractDigest`. It uses a distinct `runId`, fresh `generatedAt`, fresh task
`outputHash` and metrics. Its `instructionBundle.base` must equal the complete
frozen baseline instructions, `instructionBundle.rule` must equal candidate text,
and `instructionsHash` must recompute from those bytes. Tool policy, split manifest,
and model configuration hashes must match the baseline. Target improvement must
meet the frozen minimum; neither heldout nor full-suite results may regress.
Routing-only runs and explicitly synthetic fixtures cannot authorize adoption.

The runtime validates supplied artifacts and receipts; the explicit `evaluation run` command reuses the prompt runner to call a selected provider and capture evidence. It does **not** verify task outputs independently, prove that instruction bundles include all host context, or infer runner authenticity from `synthetic:false`. The external
reviewer must inspect authentic run artifacts and the complete treatment. The
current runtime is an enforcement foundation, not evidence that a real behavioral
improvement cycle has occurred. Genuine external before/after execution remains
a release acceptance requirement.

## External approval trust

No signer enrollment command exists. The host supplies `trustedKeys` as
`{keyId: publicKeyPEM}` from independently controlled configuration outside the
consumer repository. Keys must be Ed25519. Repo-local trust, a TTY, Git trailers,
or a self-generated signer cannot establish approval.

A lesson receipt is:

```json
{
  "schemaVersion": 1,
  "keyId": "external-reviewer",
  "action": "activate-lesson",
  "projectId": "<projectId returned by stage>",
  "candidateDigest": "<id returned by stage>",
  "evidenceDigest": "<evidenceDigest returned by stage>",
  "approvedAt": "2026-09-12T12:00:00Z",
  "expiresAt": "2026-11-01T12:00:00Z",
  "signature": "<base64 Ed25519 signature>"
}
```

Signature bytes cover `approvalPayload(receipt)` from `core.mjs`: canonical JSON
of every receipt field except `signature`. Approval must follow proposal and
supporting evidence, precede the current time, and expire no later than the
candidate. For rule adoption, use action `adopt-rule` and evidence digest
`digest({history: staged.evidenceDigest, evaluation: digest(evaluation)})`.
Revalidation uses the same formula with fresh evidence and action
`revalidate-rule`. It requires a newer task run and new external approval. Rule
retrieval stops 30 days after its evaluation unless revalidated; candidate expiry
still applies, so extending the candidate lifetime requires a new staged candidate.

Every query recomputes candidate/evidence digests and verifies signatures against
current externally supplied trust. Invalid active records return rejection reasons
and no learned text. A signature proves possession of a trusted key, **not human
presence**. If the agent can edit the external key policy or access its private
keys, that environment has no independent reviewer boundary. Local policy cannot
be advertised as agent-proof.

## Runtime layout

The manifest lists repository-relative files. Each owning skill contains that same closure under `scripts/runtime/`, including the tracking helpers and durable store. Legacy checkpoint and telemetry launchers delegate into it. The prompt engine is a deterministic bundle of the existing runner, grader, schemas and HTTP adapter, generated during source synchronization. No runtime package download is needed. See the Evolve skill for the evaluation command.
