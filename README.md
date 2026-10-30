# opchain

> Opchain 2.0.4 · 36 skills · released September 14–21, 2026.

A coordinated set of Claude skills covering the full software development
pipeline — discover, spec, design, build, audit, ship, scale. One skill
per phase. A shared JSON checkpoint protocol carries context across
sessions and skills, so work resumes where you left off.

**Site & docs:** https://opchain.dev

---

## install

### Claude Code — plugin (recommended)

Ships complete skills and plugin hooks for session context and suggestions.
Run `/oc-enroll` in each repository to enable the Git commit gate. Installing the
plugin alone does not enroll repositories or enable learning.

```
/plugin marketplace add asfbay-bit/opchain-skills
/plugin install opchain
```

### Claude Code — zip (skills only, no hooks)

```bash
curl -L https://opchain.dev/opchain-skills.zip -o opchain-skills.zip
unzip opchain-skills.zip -d .claude/skills/
claude
> /oc-discover
```

### Claude.ai / Claude Desktop

Download complete skill ZIPs from [Install](https://opchain.dev/install/), then use
your host's supported skill upload flow. Keep references and runtime files with
each skill. Local runtime commands require Node.js 22.13 or newer and a host that
can execute them; a hosted chat without local tools cannot run those commands.

### Team (check into git)

```bash
git add .claude/skills/
git commit -m "chore: add opchain skills"
git push
```

### Upgrade

For an existing repo installation, ask your coding agent to run:

```text
/oc-update check
/oc-update
```

If you use 1.9 or earlier and the updater is missing, copy the upgrade prompt at
the top of [Install](https://opchain.dev/install/). It checks the host and published
release, then installs the complete package. The updater preserves checkpoints,
local tracking consent, usage history and unrelated skills, and backs up replaced
Opchain files. Global plugin installations use the host's supported plugin update.

Open a new agent session afterward and run `/oc-update check` to verify the
installed package. Learning remains off until explicitly enabled; provider access
and an external reviewer must be configured separately.

### ow- planning skills (client work: the fit call to the care month)

The nine `ow-` skills under [`skills-work/`](./skills-work/) plan and run client
work: `ow-start`, `ow-build-plan`, `ow-build`, `ow-uat`, `ow-documentation`,
`ow-handoff`, `ow-draft`, `ow-research` and `ow-care`. They are text only, work on
any host, carry their own versions (the table in
[`skills-work/README.md`](./skills-work/README.md)) and share one protocol,
[`skills-work/ow-protocol.md`](./skills-work/ow-protocol.md), which every skill
also carries at `references/ow-protocol.md`. They are not in the `opchain`
plugin or in `opchain-skills.zip`.

**Claude Code.** From this repository, copy the skills you want into the project
you work in (a client workspace, never this repository):

```bash
git clone --depth 1 https://github.com/asfbay-bit/opchain-skills.git
cp -R opchain-skills/skills-work/ow-start opchain-skills/skills-work/ow-build-plan .claude/skills/
```

Or take every skill from the zip (per-skill zips are at
`https://opchain.dev/work/<id>.zip`):

```bash
curl -L https://opchain.dev/opchain-work-skills.zip -o opchain-work-skills.zip
unzip opchain-work-skills.zip -d .claude/skills/
```

**Claude.ai / Claude Desktop.** Upload a per-skill zip (`https://opchain.dev/work/<id>.zip`)
through your host's skill upload flow. Each zip is the complete skill folder.

**Verify.** Each installed skill is a folder `.claude/skills/<id>/` holding
`SKILL.md`, `references/ow-protocol.md` (identical to `skills-work/ow-protocol.md`)
and `skill.edges.yaml`:

```bash
ls .claude/skills/ow-start/SKILL.md .claude/skills/ow-start/references/ow-protocol.md
grep -m1 '^  version:' .claude/skills/ow-start/SKILL.md
```

Then start a new Claude Code session and run `/ow-start`. ow-start's first screen
asks for the client folder; the skill's version is on its header line. The same
check runs at every opchain.dev build from an empty folder
(`scripts/check-work-install.mjs` in the source repository).

### ow-tools (Claude Code add-on for the ow- planning skills)

`plugins/ow-tools/` **runs code on your machine**: local call transcription with
speaker separation, branded PDF and Word export, date and arithmetic checks, and
a session-start list of open workstreams. It comes from its own marketplace, so
an administrator can approve it without approving anything else here:

```
/plugin marketplace add https://raw.githubusercontent.com/asfbay-bit/opchain-skills/main/plugins/ow-tools/.claude-plugin/marketplace.json
/plugin install ow-tools@opchain-work-tools
```

Then run `/ow-tools` to see what your machine still needs. ow-tools installs
nothing itself. See [plugins/ow-tools/README.md](./plugins/ow-tools/README.md).

The marketplace entry follows this repository's `main` until the first release
that ships ow-tools; from then on it names that release's tag (`ref: v<semver>`),
which this repository carries as a tag of its own, so an ow-tools update is a
new release, never a mirror sync. [`SECURITY-MANIFEST.md`](./plugins/ow-tools/SECURITY-MANIFEST.md)
lists every file with its SHA-256; its own hash is published apart from this
repository at `https://opchain.dev/work/ow-tools-security-manifest.sha256`
(see [SECURITY.md](./SECURITY.md)).

---

## skills

| skill | what it does |
|---|---|
| `oc-app-architect` | Discover → spec → build, with Generator/Evaluator QA loop |
| `oc-stack-forge` | Stack advisor across Cloudflare, Vercel, AWS, Supabase, etc. |
| `oc-ux-engineer` | Design Planner → Generator → Evaluator harness |
| `oc-dash-forge` | Dashboards and dense-data UIs (spec + React prototype) |
| `oc-integrations-engineer` | Third-party API integrations (Slack, Stripe, OAuth) |
| `oc-api-dev` | First-party API design (OpenAPI, GraphQL, SDKs) |
| `oc-claude-api` | Claude API apps: model routing, prompt caching, tool use |
| `oc-rag-forge` | RAG systems: vector DBs, embeddings, chunking, retrieval eval |
| `oc-agent-forge` | Claude Agent SDK apps: topology, tool budgets, harness loops |
| `oc-prompt-ops` | Prompts as code: versioning, eval datasets, regression detection |
| `oc-qa-ops` | Test-pyramid design: coverage budgets, contract-test matrix, load plans |
| `oc-data-ops` | Data pipelines: ingestion, dbt layering, observable data contracts |
| `oc-signal-forge` | Question → trustworthy metric: instrument, harvest, verify, wire |
| `oc-code-auditor` | Auditor → Fixer → Verifier; 5-layer pre-deploy sweep |
| `oc-security-auditor` | Threat modeling, OWASP hardening, attack-surface review |
| `oc-security-hardening` | Executes the fixes + per-deploy hardening gate (`/oc-harden`) |
| `oc-compliance-ops` | Control register + audit-ready evidence bundles at deploy time |
| `oc-bug-check` | Pre-commit QA gate: types, lint, tests, anti-patterns, secrets |
| `oc-docs-forge` | PR documentation packets, README/changelog/ADR upkeep |
| `oc-repo-ops` | Repo hygiene + PR readiness gate: catalogs, generated files |
| `oc-git-ops` | Branches, commits, PRs, sync |
| `oc-deploy-ops` | Audit gate → staging → production with rollback |
| `oc-fleet-ops` | Self-managed fleets: IaC, multi-container rollouts, day-2 ops |
| `oc-modularize-ops` | Live-monolith decomposition with golden-fixture proof |
| `oc-monitoring-ops` | Post-deploy observability — uptime, errors, alerts |
| `oc-scale-ops` | Load tests, perf budgets, caching, capacity planning |
| `oc-migration-ops` | DB / framework / auth / platform migrations |
| `oc-cost-ops` | LLM cost attribution, budget gates, model-tier routing |
| `oc-telemetry-ops` | Opt-in local usage metering, anonymized dashboard aggregates |
| `oc-reverse-spec` | Reverse-engineer existing code into spec docs |
| `oc-release-ops` | Version bumps, changelogs, release announcements |
| `oc-orchestrator` | Cross-skill status and routing (`/oc-ops`) |
| `oc-checkpoint-protocol` | Shared session-persistence schema (bundled in every skill) |
| `oc-update` | Updates complete skill and runtime files while preserving local state |
| `oc-hindsight` | Source-backed lessons, retrieval evaluation and external review |
| `oc-evolve` | Task-tested rule proposals with regression checks and external approval |

Full descriptions, triggers, and examples: https://opchain.dev/skills

---

## the checkpoint protocol

Every skill writes a JSON checkpoint to `.checkpoints/` in your project.
Skills read each other's checkpoints to make informed decisions — context
flows forward without manual handoffs.

- `oc-deploy-ops` reads `oc-code-auditor` — CRITICAL findings block deploy
- The build evaluator reads `oc-ux-engineer` — grades frontend against the
  approved design spec
- `oc-git-ops` reads `oc-app-architect` — names branches by sprint

Schema lives in
[`skills/oc-checkpoint-protocol/SKILL.md`](./skills/oc-checkpoint-protocol/SKILL.md).

---

## this repository

This is a public, force-push snapshot mirror of the skill source. The site,
build system, and internal tooling live in a private upstream repo; only
the product (this directory) is published here, refreshed on every change
to `main` upstream.

See [CONTRIBUTING.md](./CONTRIBUTING.md) for how issues and PRs flow back
into the upstream repo.

---

## license

Apache-2.0 — see [LICENSE](./LICENSE) and [NOTICE](./NOTICE). Releases up to and including v1.8.2 were published under MIT.
