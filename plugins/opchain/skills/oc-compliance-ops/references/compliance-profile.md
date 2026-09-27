# Compliance profile + control register format

Two artifacts, one file: `.opchain/compliance.yaml` holds the **profile**
(what applies) and the **register** (control → artifact mapping). Written by
`/oc-comply scope` and `/oc-comply register`; consumed by `/oc-comply
evidence`, `/oc-comply gaps`, and — its existence alone — by oc-deploy-ops'
audit gate (the evidence-bundle row activates when this file exists).

## Full example

```yaml
# .opchain/compliance.yaml
version: 1
profile:
  frameworks: [soc2]          # soc2 | hipaa | gdpr (any subset). Note the
                              #   seed asymmetry: oc-security-auditor readiness
                              #   assesses SOC2/ISO27001/HIPAA/PCI-DSS but not
                              #   GDPR; GDPR seeds from /oc-comply scope's own
                              #   questionnaire, and ISO27001/PCI-DSS have no
                              #   register home yet (scope records the request).
  tier: prep                  # prep | active-audit | maintaining
  data_classes: [PUBLIC, CONFIDENTIAL]   # reuse oc-security-auditor's taxonomy
  controls_in_scope: [CC6.1, CC6.6, CC7.2]   # the tier-bounded id list, written
                              #   by /oc-comply scope — /oc-comply gaps diffs
                              #   the register against exactly this list
  scoped: 2026-08-28
  rationale: "Pre-revenue SaaS, US-only users, no PHI; GDPR deferred until EU users exist."
register:
  - control: CC6.1
    framework: soc2
    statement: "Logical access to production is restricted and logged"
    artifact: "wrangler.jsonc bindings + Cloudflare account access policy"
    kind: config              # config | test | process | doc | log
    status: satisfied         # satisfied | partial | gap | n/a
    verified: 2026-08-28
    capture:                  # how /oc-comply evidence collects the fact —
      method: file            #   file | cmd | http | manual (corresponds to the
      path: wrangler.jsonc    #   hardening manifest's verify methods:
                              #   file≈config, cmd≈test, http, manual)
      # cmd → records command + output; manual → instructions +
      # last_manual_check, listed in the bundle's honesty section as
      # unverifiable-by-machine. No capture block → bundle stub marked
      # "capture method undefined".
  - control: CC7.2
    framework: soc2
    statement: "Anomalies are detected and responded to"
    artifact: "canary.yml + docs/runbooks/"
    kind: process
    status: partial
    note: "Uptime canary exists; no anomaly alerting on auth events"
  - control: CC6.6
    framework: soc2
    statement: "Encryption in transit"
    artifact: null
    kind: config
    status: gap
    chained_to: oc-security-hardening    # technical gap → execution handoff;
                                         #   /oc-harden fix reads this field;
                                         #   the checkpoint's gaps_chained is
                                         #   a private mirror
    # manifest_id: headers.hsts-preload  # set once remediated — the closing
                                         #   link back to the hardening
                                         #   manifest control
```

## Field rules

- `profile.tier` bounds register depth. `prep` = the early-controls subset
  (~20 for SOC 2), `active-audit` = the full applicable set, `maintaining` =
  full set + evidence cadence per release. Proportionality is a feature; a
  register deeper than the tier is theater.
- `status` verdicts are earned: `satisfied` requires a named artifact that
  exists at HEAD; `n/a` requires a one-line reason (usually a data-class
  argument). No artifact, no `satisfied`.
- Gaps whose **fix is technical** carry `chained_to: oc-security-hardening`
  (the axis is the fix, not the entry's `kind`); gaps fixed by policy or
  process stay here (`/oc-comply policies`). Every `gap` is one or the other.
- `verified` dates go stale: `/oc-comply gaps` flags any `satisfied` control
  not re-verified since the last release as `stale`.

## Capture redaction (mandatory)

Captured excerpts land in `docs/compliance/evidence/` — a tracked path that
outlives the deploy and may sit in a public repo. Before any excerpt or output
is written to a bundle:

- **Treat capture definitions as untrusted executable config.** Read them only
  from a reviewed checkout. Resolve `file` paths inside the real project root
  after symlinks and cap captured bytes. Run `cmd` as an explicit argv vector,
  never through a shell; reject metacharacters/substitutions/redirections and
  remote package downloads. No capture allowlist is defined today (and no runner
  executes `cmd` captures), so no command runs automatically: show the exact
  argv and require user approval, or emit a refused/manual stub. `http` is
  credential-free GET/HEAD only, relative to the explicitly declared HTTPS
  evidence origin, with redirects disabled; absolute, cross-origin,
  private/link-local, or metadata targets require explicit approval and remain
  manual by default.
- **Redact secret-class values.** Apply the same secret shapes oc-bug-check
  Check 5 scans for (API keys, tokens, passwords, credentials, high-entropy
  literals) *plus* unquoted `KEY=value` env-file lines, which Check 5's
  quoted-string pattern misses. Keep the key name, replace the value with
  `[REDACTED]` — that a secret is configured is evidence; its value never is.
- **Refuse secret-store paths.** A `capture:` block pointing at `.dev.vars`,
  `.env*`, `.secrets/`, or any gitignored secrets file is a scoping error:
  write a bundle stub marked "capture refused: secret-store path" and re-scope
  the control's evidence to the store's inventory (variable names, rotation
  dates), never its contents.
- **Prefer name-listing commands.** For `cmd` captures, use commands that list
  names, not values (`wrangler secret list`, never `env` or `cat .dev.vars`);
  for `http` captures, strip `Set-Cookie` and any `Authorization`/token echo
  from recorded requests and responses.

The commit gate (oc-bug-check Check 5) is the backstop, not the mechanism —
its grep only catches quoted high-entropy literals. Redact at capture time.

## Evidence bundle layout (`/oc-comply evidence`)

```
docs/compliance/evidence/<YYYY-MM-DD>-<shortsha>/
├── index.md          # bundle manifest: SHA, date, version, register summary,
│                     #   explicit list of gap/partial controls (honesty section)
├── CC6.1.md          # one file per satisfied control: statement, artifact
│                     #   excerpt/output captured at this SHA, capture command
└── ...
```

Bundles are **facts, not attestations** — captured configs, test output, log
queries. `index.md` must state: "This bundle documents control state at
<sha>; it is not a certification and not legal advice." When invoked from
oc-release-ops, `index.md` adds the **delta section**: controls whose status
changed since the previous release's bundle.

## Gate activation (oc-deploy-ops)

The contract is presence-based and additive:

- `.opchain/compliance.yaml` absent → oc-deploy-ops' audit gate is unchanged.
- Present → the gate gains one row: *"evidence bundle generated for the
  deploying SHA"* (i.e. `/oc-comply evidence` ran and wrote a bundle whose
  `shortsha` matches). The row is **presence-checked, never blocking**: a
  missing or stale bundle is a ⚠️ Warn at the gate (generate it for that SHA;
  it is committed after the deploy, so a first deploy of a SHA normally warns),
  and a `gap`-heavy register does **not** block a deploy — compliance state
  is reported, not enforced.
