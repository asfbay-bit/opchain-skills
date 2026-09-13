# `.opchain/hardening.yaml` — the hardening manifest format

Every control oc-security-hardening applies, with **how it verifies**. Appended
by `/oc-harden baseline`, `/oc-harden fix`, `/oc-harden csp`; replayed by
`/oc-harden verify`; enforced at a chokepoint by `/oc-harden gate`. A control
absent from this file is invisible to the gate — recording is not optional.

## Full example

```yaml
# .opchain/hardening.yaml
version: 1
controls:
  - id: headers.hsts
    control: "HSTS max-age=31536000; includeSubDomains"
    applied_in: "src/index.js (securityHeaders middleware)"
    applied: 2026-08-28
    source_finding: "oc-security-auditor 2026-08-22 header sweep (5/8)"
    verify:
      method: http
      url: "/"
      header: "Strict-Transport-Security"
      expect: "max-age=31536000"
  - id: csp.stage
    control: "Content-Security-Policy rollout"
    stage: report-only        # inventory | report-only | reviewed | enforce
    stage_history:            # append-only — one stamp per transition
      - { stage: inventory, date: 2026-08-21 }
      - { stage: report-only, date: 2026-08-28 }
    applied_in: "src/index.js"
    review_window_ends: 2026-09-04
    verify:
      method: http
      url: "/"
      header: "Content-Security-Policy-Report-Only"
  - id: api.rate-limit.mcp
    control: "POST /mcp per-IP rate limit + checkpoint TTL"
    applied_in: "src/index.js + KV binding"
    source_finding: "oss-readiness-audit PX-01"
    verify:
      method: test
      cmd: "npx --no -- vitest run tests/mcp-route.test.js"
  - id: headers.hsts-preload
    control: "HSTS preload directive"
    applied_in: "src/index.js (securityHeaders middleware)"
    source_finding: "oc-compliance-ops register CC6.6"   # compliance-chained
                    # entries use exactly this form so the register's
                    # manifest_id can close the loop
    verify:
      method: config
      path: "src/index.js"
      contains: "includeSubDomains; preload"
  - id: platform.tls-mode
    control: "Cloudflare SSL/TLS = Full (Strict)"
    applied_in: "Cloudflare dashboard (no config-as-code surface)"
    verify:
      method: manual
      instructions: "Dashboard → SSL/TLS → Overview; confirm Full (Strict)"
      last_manual_check: 2026-08-28
```

## Verify methods

| method | Semantics | Gate behavior on failure |
|---|---|---|
| `http` | Fetch `url` (relative to the deploy target), optionally with `request_method: POST` + a literal `json` mapping; assert `header`/`expect`, `status`, `body_contains`, and/or a runner-supported `response_shape` | FAIL — blocks |
| `test` | Run `cmd`; exit 0 = pass | FAIL — blocks |
| `config` | Assert a file contains/matches (`path`, `contains` or `pattern`) | FAIL — blocks |
| `manual` | Cannot be machine-verified; carries `instructions` + `last_manual_check` | **Loud skip** — printed with its `instructions`; blocks only if `max_age_days` set and exceeded (the failure then states the age) |

**`http` timing soundness:** an `http` check verifies a *currently live*
target, never the deploying SHA. All HTTP checks are therefore loud skips in
pre-deploy mode, including HTTP-only controls, and are mandatory when the gate
is replayed **post-staging-deploy** (between staging smoke and prod promote)
against the staging URL, then again post-prod as drift watch. Pair an HTTP check
with a `config` or `test` check when the same control must also gate the
deploying SHA. `url` resolves against the environment being verified.

Rules:

- **Treat this file as executable config.** Replay only a reviewed, trusted
  checkout. A runner must use argv execution with no shell and an explicit
  read-only allowlist (`npm test`, `npm run test*|check*|lint*|validate*`,
  check/lint/validate/test Node scripts, and local `vitest run`); reject shell
  metacharacters, redirects, substitutions, remote `npx` downloads, and
  binaries/scripts outside the project. `config.path` must remain inside the
  real project root after symlink resolution. `http.url` must be relative to
  the explicitly selected HTTPS deploy origin, with redirects and credentials
  disabled. HTTP methods are restricted to GET/POST; POST bodies must be
  literal JSON mappings and receive only content-type plus the target Origin.
  If that safety envelope is unavailable, mark the check `manual`
  and require approval of the exact command rather than executing it.
- Every control needs a `verify` block — a single method mapping, **or a list
  of method mappings (all must pass)**. The list form is how a gate-blocking
  control pairs a `config` check (verifiable at the deploying SHA) with an
  `http` check (drift watch on the live target):

  ```yaml
      verify:
        - method: config
          path: "src/index.js"
          contains: "Strict-Transport-Security"
        - method: http
          url: "/"
          header: "Strict-Transport-Security"
          expect: "max-age=31536000"
  ```

  No method fits → the control is mis-scoped (split it until something is
  checkable) or genuinely `manual` (allowed, but permanently visible as the
  weak spot it is).
- `id` is dot-namespaced; established families: `headers.*`, `csp.*`, `api.*`,
  `platform.*`, `secrets.*`, `deps.*`, `data.*` (retention / data-handling
  controls), and `detect.*` (detection-class controls, consumed by
  oc-monitoring-ops for alert/runbook mapping).
- A manifest that exists but cannot be parsed, or contains a control with a
  missing/unknown `verify` method, is a **FAIL-class gate result** (fail
  closed) — the gate reports the schema error, never skips it. A `csp.stage`
  entry missing `stage_history` is treated as having no `reviewed` stamp.
- An empty `verify: []` is missing verification and therefore FAIL-class.
- `source_finding` traceability is required for `fix`-originated entries,
  recommended for baseline entries — it's what lets oc-security-auditor's
  `/oc-security compare` and oc-compliance-ops' register consume this file.
- `csp.stage` is a **single entry** whose `stage:` field advances in order
  (`inventory → report-only → reviewed → enforce`); every transition appends a
  `{stage, date}` stamp to the append-only `stage_history`. The gate refuses
  `stage: enforce` unless `stage_history` contains a `reviewed` stamp, and
  flags a `report-only` entry whose `review_window_ends` passed more than
  14 days ago (the unenforced-forever failure mode).

## Gate wiring (`/oc-harden gate`)

Install the replay at the chokepoint the project already has, in this order of
preference:

1. **Deploy script step** — the strongest: runs at the moment of truth.
2. **CI job** — every PR, catches drift earliest.
3. **oc-deploy-ops audit-gate row** — when the project ships via oc-deploy-ops,
   the gate reads this manifest and adds "hardening manifest verifies at this
   SHA" beside the oc-code-auditor and oc-security-auditor rows. Absent
   manifest → gate unchanged (additive contract).

Tier 3 is agent-run prose, not machine enforcement — a direct platform deploy
bypasses it. Treat it as interim: report the installed tier from `/oc-harden
gate` and `/oc-harden status`, and offer the tier-1/2 wiring whenever the
project has a deploy script or CI.

The replay itself is always the same: iterate `controls[]`, run each `verify`,
fail closed on any FAIL-class miss, print `manual` entries loudly with their
age. Output lands in the checkpoint (`skill_state.last_verify`).
