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
