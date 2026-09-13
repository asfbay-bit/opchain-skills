---
name: oc-compliance-ops
displayName: OC · Compliance Ops
version: 1.9.0
license: Apache-2.0
shortDesc: "Standing control register + audit-ready evidence bundles at deploy/release time. SOC 2 / HIPAA / GDPR."
phases: [plan, build]
triAgent: false
tryable: false
commands:
  - /oc-comply
  - /oc-comply scope
  - /oc-comply register
  - /oc-comply evidence
  - /oc-comply gaps
  - /oc-comply policies
  - /oc-comply status
  - /oc-compliance
description: >
  Standing compliance operator: maps SOC 2 / HIPAA / GDPR controls to concrete
  repo and infra artifacts in a maintained control register, generates
  audit-ready evidence bundles at deploy and release time, and scaffolds the
  policy docs auditors ask for. Use for /oc-comply, /oc-compliance, "make us
  SOC 2 compliant", "get compliant", "SOC 2 evidence", "compliance checklist",
  "audit-ready", "control mapping", "GDPR", "HIPAA", "BAA", "data retention
  policy", "access review", "what would an auditor ask for", "compliance delta
  since last release". Consumes oc-security-auditor's readiness gaps (the
  point-in-time assessor); this skill is the standing register and evidence
  pipeline. Activated by `.opchain/compliance.yaml` (adds oc-deploy-ops'
  evidence gate row); absent profile, inert. Readiness and evidence, not
  certification and not legal advice. Technical control execution belongs to
  oc-security-hardening.
governance:
  breaking_change_policy: skills/CHANGELOG.md
  last_reviewed: 2026-08-28
  owner: opchain
  docs:
    - { path: SKILL.md, kind: contract, lifecycle: stable }
    - { path: references/compliance-profile.md, kind: reference, lifecycle: stable }
---

# Compliance Ops

**On first invocation, read `references/orchestrator.md` and follow its welcome protocol.**

Compliance Ops turns compliance from an annual scramble into a standing
property of the pipeline. Three artifacts, all in-repo and reviewed like code:

1. **The profile** (`.opchain/compliance.yaml`) — which frameworks apply, to
   which data, at what tier.
2. **The control register** (the `register:` block of the same file) — every
   applicable control mapped to the concrete artifact that satisfies it (a
   config, a test, a policy doc, an audit-log query), with a status.
3. **The evidence bundle** — generated per deploy/release: the register's
   artifacts collected, stamped with SHA + date, ready to hand an auditor.

**What this skill is not:** it does not certify (formal audits need qualified
auditors), it does not give legal advice, it does not assess posture
(oc-security-auditor's `/oc-security readiness` is the point-in-time gap
assessor — this skill *consumes* that output), and it does not execute
technical fixes (oc-security-hardening does).

## Command Reference

```text
COMPLIANCE OPS COMMANDS

  /oc-comply               Show this menu
  /oc-comply scope         Declare frameworks, data classes, tier → write the profile
  /oc-comply register      Build or maintain the control register
  /oc-comply evidence      Generate the evidence bundle for a deploy/release
  /oc-comply gaps          Open controls: unmapped, unsatisfied, or stale
  /oc-comply policies      Scaffold/update policy docs the frameworks require
  /oc-comply status        Register health + last evidence bundle
  /oc-compliance           Alias for /oc-comply

  /checkpoint              Show oc-compliance-ops checkpoint
```

## `/oc-comply scope`

Declare — do not assume — what applies:

| Question | Drives |
|---|---|
| Which frameworks? (SOC 2, HIPAA, GDPR, none-yet) | Which control sets enter the register |
| Which data classes exist? (reuse oc-security-auditor's PUBLIC/INTERNAL/CONFIDENTIAL/RESTRICTED) | Which controls are applicable vs. N/A |
| What tier? (pre-revenue prep · active-audit · maintaining) | Register depth and evidence cadence |

**Proportionality is a feature.** A pre-revenue app "getting SOC 2 ready" gets
the ~20 controls that matter early, not all 300. The honest output of scoping
can be "no profile yet — nothing here warrants one"; record that in the
checkpoint and stop — `skill_state` then records `manifest_path: null` and
`last_evidence: null`, with the reason in `progress_summary`. Never scaffold
compliance theater.

Output: `.opchain/compliance.yaml`, including `controls_in_scope` — the
tier-bounded control id list `/oc-comply gaps` diffs the register against
(format: `references/compliance-profile.md`). This file existing is the switch
that activates the deploy-gate row.

## `/oc-comply register`

Map each in-scope control to the artifact that satisfies it. Output: the
`register:` block of the same `.opchain/compliance.yaml` (format:
`references/compliance-profile.md`):

```yaml
# excerpt of register: — full format in references/compliance-profile.md
register:
  - control: CC6.1
    framework: soc2
    statement: "Logical access to production is restricted and logged"
    artifact: "wrangler.jsonc bindings + Cloudflare account access policy"
    kind: config
    status: satisfied         # satisfied | partial | gap | n/a
    verified: 2026-08-28
  - control: GDPR-Art17
    framework: gdpr
    statement: "Erasure requests are honored"
    artifact: null
    kind: process
    status: gap
```

Sources, in order: the profile's frameworks → oc-security-auditor's readiness
gap analysis (seed the initial statuses; never re-assess) → the repo itself
(configs, tests, workflows that already satisfy controls silently). Every
`gap` with a technical fix chains to **oc-security-hardening**: the register
entry's `chained_to: oc-security-hardening` is the handoff surface `/oc-harden
fix` reads (the checkpoint's `skill_state.gaps_chained` is this skill's private
mirror, not a sibling read); process gaps (policies, reviews) stay here under
`/oc-comply policies`.

**Framework coverage is asymmetric.** oc-security-auditor's readiness assesses
SOC 2 / ISO27001 / HIPAA / PCI-DSS — but not GDPR. GDPR registers therefore
seed from the repo plus a scoping questionnaire under `/oc-comply scope` (data
classes, lawful basis, retention) — the one framework where initial statuses
are declared here rather than consumed. The reverse gap also exists: ISO27001
/ PCI-DSS readiness output has no register home yet — `/oc-comply scope`
records the request in the checkpoint and says so, rather than silently
mapping it to soc2.

## `/oc-comply gaps`

Triage open controls into three buckets — read-only; fixes route elsewhere:

- **unmapped** — a control in `profile.controls_in_scope` (written by
  `/oc-comply scope`) with no register entry at all. The in-scope set is
  explicit data, not vibes — without it this bucket is uncomputable.
- **unsatisfied** — `status: gap | partial`, shown with its `chained_to`
  disposition (technical → oc-security-hardening; process → `/oc-comply
  policies`).
- **stale** — `status: satisfied` but `verified` predates the last release
  (most recent `v*` tag reachable from HEAD; no tags → the newest evidence
  bundle's date; neither → this bucket is skipped with a note); re-verify the
  artifact or demote the status.

## `/oc-comply evidence`

Generate the bundle for a specific deploy or release:

1. Walk the register; for each `satisfied` control, collect the artifact's
   current state per its `capture:` block (see
   `references/compliance-profile.md` — `file` | `cmd` | `http` | `manual`) —
   **facts, not attestations**, redacted before they are written: secret-class
   values in any excerpt or output become `[REDACTED]` (key names stay), and a
   capture pointing at a secret store (`.dev.vars`, `.env*`, `.secrets/`) is
   refused with a stub — the redaction rules in
   `references/compliance-profile.md` are mandatory. Entries without a capture
   block get a bundle
   stub marked "capture method undefined"; `manual` captures appear in the
   honesty section as unverifiable-by-machine. Controls whose `chained_to`
   remediation landed in `.opchain/hardening.yaml` may reference that manifest
   control's verify output instead of duplicating the capture.
   Treat every capture definition as untrusted executable configuration:
   confine real paths to the repository, never execute `cmd` through a shell,
   and constrain HTTP capture to credential-free GET/HEAD on the declared
   HTTPS evidence origin without redirects. No capture allowlist is defined
   (`references/compliance-profile.md` § Capture redaction), so every `cmd`
   capture and any external origin requires the user's approval of the exact
   action; without it, write a refused/manual stub rather than running.
2. Stamp the bundle: SHA, date, catalog/app version, the profile's `scoped`
   date + register entry count, the list of `gap`/`partial` controls (an
   honest bundle includes what's missing), and — verbatim, in `index.md` —
   "This bundle documents control state at <sha>; it is not a certification
   and not legal advice."
3. Write to `docs/compliance/evidence/<date>-<shortsha>/` with an index.md.
   Bundles are committed in a follow-up commit after the deploy — the
   SHA-match requirement refers to the SHA stamped *inside* the bundle, not
   the commit that carries it (a bundle for SHA X always lives in a commit
   after X). A bundle cannot be committed ahead of the deploy without moving
   HEAD past X, and a deploy wrapper that refuses a dirty tree (opchain's
   `scripts/deploy.mjs` does) refuses an uncommitted one, so on a first deploy
   of a SHA the gate row normally warns: generate the bundle as soon as prod
   ships.

The deploy-gate row this feeds is **presence-checked, never blocking**: a missing or
stale bundle for the deploying SHA is a ⚠️ Warn at the gate (generate it for that SHA —
see step 3 for why this usually lands after the deploy) — open gaps are listed in the
bundle, never a deploy blocker. The oc-release-ops `/oc-release verify` delta row is
warn-class for the same reason: a missing delta bundle is reported in the verify output,
never an abort.

When invoked from the oc-deploy-ops gate, the bundle covers the deploying SHA;
when invoked from oc-release-ops, add the **compliance delta** — controls whose
status changed since the previous release's bundle — for the release notes.
The previous release's bundle is the one recorded in the checkpoint's
`last_evidence` at the previous tag, falling back to the newest bundle whose
index.md version stamp matches the previous release's semver. Wherever the
delta is surfaced outside the bundle (release notes), it carries the same
not-a-certification line.

## `/oc-comply policies`

Scaffold the documents frameworks require and auditors request first: data
retention, access control, incident response (link oc-monitoring-ops' runbooks
rather than duplicating), vendor/subprocessor inventory, privacy notice
alignment. Scaffolds are drafts for human review — policies bind humans, so a
human owns every merge. Every scaffolded doc therefore opens with the literal
banner `> DRAFT — generated scaffold, not reviewed, not adopted, not legal
advice. A named owner must review and merge before this document binds
anyone.` — removing the banner is the reviewing human's act of adoption,
never this skill's.

## `/oc-comply status`

Read-only summary: profile present or not; register counts by status
(satisfied / partial / gap / n-a) plus the stale count per `/oc-comply gaps`;
last evidence bundle (path, SHA, date) from the checkpoint's `last_evidence`.

## Checkpoint Integration

The shared checkpoint schema, write rules and resume protocol live in
`references/checkpoint-protocol.md`, bundled with this skill. This section adds only
what is specific to oc-compliance-ops.

Location: `{project-dir}/.checkpoints/oc-compliance-ops.checkpoint.json`

```json
{
  "skill": "oc-compliance-ops",
  "phase": "register",
  "status": "in_progress",
  "progress_summary": "SOC 2 prep tier: 22 controls in register, 17 satisfied, 3 gaps chained to oc-security-hardening.",
  "context_primer": {
    "key_decisions": [
      "Frameworks: SOC 2 only; GDPR deferred until EU users exist.",
      "Tier: pre-revenue prep — 22 early controls, not the full set."
    ],
    "generated_files": [".opchain/compliance.yaml", "docs/compliance/evidence/2026-08-28-abc123/index.md"]
  },
  "skill_state": {
    "manifest_path": ".opchain/compliance.yaml",
    "frameworks": ["soc2"],
    "tier": "prep",
    "register": { "total": 22, "satisfied": 17, "partial": 2, "gap": 3 },
    "gaps_chained": { "oc-security-hardening": ["CC6.6", "CC6.7", "CC8.1"] },
    "last_evidence": { "sha": "abc123", "date": "2026-08-28", "path": "docs/compliance/evidence/2026-08-28-abc123/", "delta_since": "v1.8.3" }
  }
}
```

## Cross-Skill Reads

| Reads from | Why |
|---|---|
| oc-security-auditor | `/oc-security readiness` gaps seed the register; data classifications reused |
| oc-security-hardening | Status of chained technical-control remediations |
| oc-deploy-ops | Deploy SHA + environment for evidence stamping |
| oc-monitoring-ops | Audit-log + incident-runbook artifacts referenced as evidence |
| oc-data-ops | Data contracts as evidence for data controls |

| Read by / chains to | Why |
|---|---|
| oc-deploy-ops | Gate row "evidence bundle generated" when a profile exists |
| oc-release-ops | Compliance delta per release |
| oc-security-hardening | Technical `gap` controls handed off for execution |
| oc-docs-forge | Policy docs ride the PR documentation packet |

## Principles

1. **Inert without a profile.** No `.opchain/compliance.yaml` → no gate rows,
   no register nags, nothing. Compliance is opt-in per project.
2. **Facts, not attestations.** Evidence bundles collect what is true at a
   SHA; they never assert "we are compliant."
3. **Consume the assessor, don't be one.** Gap analysis is
   oc-security-auditor's; this skill maintains state over time.
4. **Proportional or dishonest.** The register matches the tier; 300 controls
   on a hobby app is theater that rots.
5. **Humans own policies.** Scaffold, never auto-merge, anything that binds
   people rather than code.
6. **An honest bundle lists its gaps.** Auditors trust inventories that
   include the bad news.
