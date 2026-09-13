---
name: oc-security-hardening
displayName: OC · Security Hardening
version: 1.9.0
license: Apache-2.0
shortDesc: "Remediation operator: execute hardening fixes and stand the per-deploy hardening gate. Auditor finds; this fixes."
phases: [build]
triAgent: false
tryable: false
commands:
  - /oc-harden
  - /oc-harden baseline
  - /oc-harden fix
  - /oc-harden csp
  - /oc-harden gate
  - /oc-harden verify
  - /oc-harden status
description: >
  Security remediation and enforcement operator — the execution half of the
  security pair. oc-security-auditor assesses (/oc-hardening audits the posture);
  oc-security-hardening executes (/oc-harden writes the fixes): security
  headers, staged CSP rollout, TLS/WAF/rate-limit config as code, secrets
  hygiene, dependency-pinning policy. Maintains `.opchain/hardening.yaml` — the
  declared-controls manifest — and stands the per-deploy gate that verifies it,
  the "before every deploy" step auditor findings never had. Use for
  /oc-harden, /oc-harden baseline, /oc-harden fix, /oc-harden csp, /oc-harden
  gate, "harden this", "fix the security findings", "the pen test found",
  "add security headers", "roll out CSP", "rate limit this endpoint", "rotate
  secrets", "block deploys on security regressions", "security baseline". NOT
  assessment (oc-security-auditor), NOT code-bug fixing (oc-code-auditor's
  Fixer), NOT dependency vuln scanning (oc-bug-check — this skill owns pinning
  policy, not the scan).
governance:
  breaking_change_policy: skills/CHANGELOG.md
  last_reviewed: 2026-08-28
  owner: opchain
  docs:
    - { path: SKILL.md, kind: contract, lifecycle: stable }
    - { path: references/hardening-manifest.md, kind: reference, lifecycle: stable }
---

# Security Hardening

**On first invocation, read `references/orchestrator.md` and follow its welcome protocol.**

The execution half of opchain's security pair. oc-security-auditor answers
*"where are we exposed?"* — STRIDE, OWASP mapping, posture scores. This skill
answers *"then close it, and prove it stays closed"*: it turns findings into
merged config and code, records every applied control in a manifest, and wires
the gate that re-verifies the manifest before every deploy.

**The verb pair, so nobody trips on it:** `/oc-hardening` (auditor) *audits*
the hardening posture. `/oc-harden` (this skill) *does* the hardening.

**Not an offensive tool:** this skill never runs exploits, scanners, or
penetration tests against any target, its own included — verification is
limited to reading the repo's config, running the project's own test suite,
and fetching response headers from the project's own deploy targets. External
pen-test *reports* are consumed as findings to fix, never reproduced.

## Command Reference

```text
SECURITY HARDENING COMMANDS

  /oc-harden               Show this menu
  /oc-harden baseline      Apply the stack-aware secure baseline
  /oc-harden fix           Remediate a specific auditor finding
  /oc-harden csp           Staged CSP rollout: report-only → enforce
  /oc-harden gate          Install / verify the pre-deploy hardening gate
  /oc-harden verify        Re-verify manifest controls (all, or one by id)
  /oc-harden status        Manifest health, unmanaged-control scan, last verify

  /checkpoint              Show oc-security-hardening checkpoint
```

## The manifest: `.opchain/hardening.yaml`

Every control this skill applies is recorded with **how it verifies** (format:
`references/hardening-manifest.md`):

```yaml
# excerpt of .opchain/hardening.yaml
controls:
  - id: headers.hsts
    control: "HSTS max-age=31536000; includeSubDomains"
    applied_in: "src/index.js (securityHeaders middleware)"
    verify: { method: http, url: "/", header: "Strict-Transport-Security" }
    source_finding: "oc-security-auditor 2026-08-22 header sweep (5/8)"
  - id: api.rate-limit.mcp
    control: "POST /mcp per-IP rate limit + checkpoint TTL"
    applied_in: "src/index.js + KV binding"
    verify: { method: test, cmd: "npx --no -- vitest run tests/mcp-route.test.js" }
```

The manifest is the skill's spine: `fix`/`baseline`/`csp` append to it,
`verify` replays it, `gate` enforces it. A control not in the manifest does not
exist as far as the gate is concerned — which is the point: undocumented
hardening rots silently.

**Execution trust boundary.** The manifest is executable repository
configuration, not passive data. Replay it only from a reviewed, trusted
checkout. Never pass `verify.test.cmd` through a shell: tokenize it into argv,
reject shell metacharacters/redirects/substitutions, forbid remote package
downloads (`npx` must use `--no`), and allow only repository-local scripts or
installed binaries. Resolve `config.path` inside the project root after
symlinks. Resolve `http.url` only against the explicitly selected HTTPS deploy
origin, without redirects or credentials; an absolute/cross-origin URL is a
FAIL. An empty `verify` list is also a FAIL. If the project has no runner that
enforces this envelope, use `manual` and show the exact command for human
approval rather than executing free-form manifest text.

## `/oc-harden baseline`

Apply the secure baseline for the detected stack, control by control, each one
a reviewable diff + a manifest entry:

- **HTTP headers** — the auditor's 8-header set, implemented in the platform's
  idiom (Worker middleware, `vercel.json`, nginx conf).
- **Platform config as code** — TLS mode, WAF rules, bot protection, rate
  limits, expressed in `wrangler.jsonc`/terraform/etc. where the platform
  allows; dashboard-only settings get a manifest entry with
  `verify: {method: http|manual}` so drift is at least detectable.
- **Secrets hygiene** — no plaintext secrets: the *scan* stays oc-bug-check
  Check 5. Its bare `grep` commands fail the `test` allowlist, so record the
  control as `verify: {method: test}` only when the project wraps them in a
  repository script the runner accepts (`npm run check:secrets` or
  `node scripts/check-secrets.mjs`);
  otherwise record it as `manual` with the Check 5 command set in
  `instructions`. This skill owns the env-var inventory, the rotation note per
  secret, and — when the user asks to rotate — executing rotation via the
  platform's secret store (`wrangler secret put` and kin), or explicitly
  handing to `/oc-deploy env` and saying so.
- **Dependency pinning policy** — lockfile discipline, pin-vs-range rules,
  update cadence. The *scan* stays oc-bug-check Check 7; this is the policy it
  scans against.

Baseline respects the auditor's proportionality tiers: read the tier
(Lite/Standard/Comprehensive) from the oc-security-auditor checkpoint's
`context_primer.key_decisions` or `progress_summary` — never its private
`skill_state` — and apply that depth. Tier not recorded there → ask the user;
no auditor checkpoint → apply Lite and recommend `/oc-security posture` for
anything more.

## `/oc-harden fix`

Remediate one finding end-to-end:

1. Pull the finding: the oc-security-auditor posture report or its PM
   tickets (its checkpoint carries counts and tier, not findings);
   oc-code-auditor findings whose fix is control-class per the tie-breaker
   below (code-auditor marks these `route: oc-security-hardening` in its
   findings report, which is conversation output with no committed path — ask
   for it if it is not in this session); an oc-compliance-ops register control
   in `.opchain/compliance.yaml` with `status: gap` and
   `chained_to: oc-security-hardening`; or an external report the user
   supplies (pen test, bug bounty, platform audit) — record it verbatim in
   `source_finding`.
2. Implement the fix as a normal change — smallest reviewable diff, tests
   where testable.
3. Append the manifest entry with `source_finding` traceability.
4. Verify immediately (`verify` for just this control).
5. Update the remediation queue in the checkpoint; after a batch, suggest
   re-assessing the touched pillar (`/oc-security posture`, or `/oc-security
   headers` after a header batch) and then `/oc-security compare` to confirm
   the score moved — compare alone diffs snapshots and never re-assesses.

The boundary with oc-code-auditor's Fixer is the **class of the fix, not the
file it lands in**. If the fix is expressible as a declarative control with a
`verify` method (a header present, a limit enforced, a policy set), it is this
skill's — even when the diff lands in `src/`, as it always does on Workers. If
the fix changes what the application does for legitimate users (authz
decisions, input validation, query construction), it is oc-code-auditor's
Fixer. Cross-reference either way.

## `/oc-harden csp` — staged rollout

CSP is the control most likely to break production, so it gets its own staged
verb:

1. **Inventory** — every script/style/font/frame source actually in use
   (crawl the built site, not the docs).
2. **Report-only** — ship `Content-Security-Policy-Report-Only` with a
   collection endpoint or log sink; run it across real traffic for an agreed
   window.
3. **Review violations** — separate real gaps from policy errors; tighten.
4. **Enforce** — flip to `Content-Security-Policy`; keep report-only running
   one more window as regression watch.

Each stage transition stamps the single `csp.stage` manifest entry and appends
to its `stage_history`; the gate refuses an `enforce` stage with no prior
`reviewed` stamp in the history (a big-bang CSP outage is one failure mode; a
report-only entry whose review window quietly lapsed is the other — the gate
flags that too).

## `/oc-harden gate`

Stand the per-deploy verification step — as strong as the chokepoint it lands
on:

- **In any project:** wire manifest verification into the chokepoint that
  already exists — preferring the deploy script step, then a CI job, then the
  oc-deploy-ops audit-gate row (`references/hardening-manifest.md` has the
  ranking rationale). The replay:
  - **Timing:** `config`/`test` controls verify at the deploying SHA; `http`
    controls verify the *currently live* environment and replay
    post-staging-deploy — details in the reference's timing-soundness note.
  - **Fail closed:** on any regressed control, and on an unparseable manifest
    or missing/unknown `verify` method (a schema error is a FAIL, never a
    skip).
  - **Manual:** loud-skip, printed with its `instructions`, blocking only
    when `max_age_days` is set and exceeded (only then does opchain's runner,
    `scripts/check-hardening.mjs`, print the age). Show `last_manual_check`
    yourself when reporting the gate.
- **In the oc-deploy-ops chain:** when `.opchain/hardening.yaml` exists,
  oc-deploy-ops' pre-deploy audit gate includes the row "hardening manifest
  verifies at this SHA" alongside the two auditor rows. Absent manifest →
  gate unchanged (additive contract). This row is agent-run prose, not machine
  enforcement: it fires only when deploys go through `/oc-deploy`, and a
  direct platform deploy (`wrangler deploy` and kin) bypasses it. When it is
  the only wiring installed, say so in the gate report, set
  `gate.machine_enforced: false` in the checkpoint, and offer the
  deploy-script or CI wiring as the upgrade.

## `/oc-harden verify`

The same replay, run ad hoc — after a fix, before a release, or when drift is
suspected. Full replay of `controls[]` by default; `/oc-harden verify
<control-id>` re-verifies a single control (what `fix` step 4 invokes). Output
lands in the checkpoint's `skill_state.last_verify`.

## `/oc-harden status`

Manifest health (control counts by verify outcome), the remediation queue, and
`last_verify`. Also report the gate tier: machine-enforced (deploy script /
CI) or agent-run (deploy-ops row). Also the **unmanaged-control scan**: controls applied outside
`/oc-harden` (oc-code-auditor's Fixer, a human PR) are detected by scanning
for known control classes present in code but absent from the manifest; run
`/oc-harden fix` with the existing control as the external finding (record its
origin in `source_finding`) to backfill the entry.

## Checkpoint Integration

The shared checkpoint schema, write rules and resume protocol live in
`references/checkpoint-protocol.md`, bundled with this skill. This section adds only
what is specific to oc-security-hardening.

Location: `{project-dir}/.checkpoints/oc-security-hardening.checkpoint.json`

```json
{
  "skill": "oc-security-hardening",
  "phase": "remediation",
  "status": "in_progress",
  "progress_summary": "Baseline applied (11 controls); 2 auditor HIGHs remediated, 1 queued; gate wired into deploy audit.",
  "context_primer": {
    "key_decisions": [
      "CSP at stage 2 (report-only) until 2026-09-04 review window closes.",
      "Cloudflare dashboard-only settings tracked as verify:manual — drift detectable, not enforceable."
    ],
    "generated_files": [".opchain/hardening.yaml"]
  },
  "skill_state": {
    "manifest_path": ".opchain/hardening.yaml",
    "controls": { "total": 14, "verified": 12, "failed": 0, "manual": 2 },
    "csp_stage": "report-only",
    "remediation_queue": [
      { "finding": "x-frame-options-missing", "source": "oc-security-auditor", "status": "queued" }
    ],
    "gate": { "installed": true, "chokepoint": "oc-deploy-ops audit gate", "machine_enforced": false },
    "last_verify": { "sha": "abc123", "date": "2026-08-28" }
  }
}
```

## Cross-Skill Reads

| Reads from | Why |
|---|---|
| oc-security-auditor | Tier (`context_primer`) → baseline depth; findings from its posture report / PM tickets → remediation queue |
| oc-code-auditor | Infra-adjacent findings agreed to belong here |
| oc-compliance-ops | Technical `gap` controls chained in for execution (`.opchain/compliance.yaml` register, `chained_to: oc-security-hardening`) |
| oc-stack-forge | Platform idiom for expressing controls as code (its `context_primer` stack decision and `packs/<stack>/pack.yml`) |
| oc-deploy-ops | Deploy chokepoint the gate hooks into |

| Read by / chains to | Why |
|---|---|
| oc-deploy-ops | Gate row "hardening manifest verifies" when the manifest exists |
| oc-security-auditor | `/oc-security compare` after remediation batches; findings marked addressed |
| oc-compliance-ops | Executed controls become register evidence |
| oc-monitoring-ops | Reads detection-class controls (`detect.*` ids) from the manifest during `/oc-monitor audit` and `/oc-monitor alerts`, mapping each to an alert + runbook |

## Principles

1. **The boundary is the class of the fix, not the file.** Declarative,
   verifiable controls here — even when the diff lands in `src/`; changes to
   what the app does for legitimate users go to oc-code-auditor's Fixer.
   Cross-reference, never duplicate.
2. **No control without a verify method.** Unverifiable hardening is a hope,
   not a control; `manual` is allowed but always visible.
3. **Staged over big-bang.** Report-only before enforce; smallest reviewable
   diff per control; production breakage is a security regression too.
4. **The manifest is the contract.** If it's not in `.opchain/hardening.yaml`,
   the gate doesn't defend it and the next agent doesn't know it exists.
5. **Additive gate contract.** No manifest → every downstream gate behaves
   exactly as before this skill existed.
6. **Close the loop with the assessor.** Remediation isn't done until the
   auditor's next compare reflects it.
