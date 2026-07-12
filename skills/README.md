# opchain dev skills ecosystem

A full concept-to-ops software development pipeline for Claude Code, Claude.ai,
and Codex — one skill per phase, a shared checkpoint protocol that carries
context across sessions.

## Installation (Claude.ai / Cowork)

1. Go to Settings → Customize → Skills
2. Upload each .zip file
3. Delete any existing tri-dev skill (merged into oc-app-architect)

## Installation (Claude Code)

1. Unzip all skills into `.claude/skills/` in your repo
2. Claude Code auto-discovers them at startup

## Installation (Codex / any MCP agent)

Codex Agent Skills use the same `SKILL.md` format as Claude Code, so two options:

1. **Drop-in skills** — unzip into `.codex/skills/` (project) or `~/.codex/skills/`
   (global). Codex auto-discovers them and triggers by description, the same way
   Claude Code does.
2. **MCP server** — point Codex (or any MCP client: Claude Desktop, Cursor,
   Windsurf) at the hosted opchain endpoint for the full pipeline — catalog,
   routing, the orchestrator protocol, and checkpoints. In `~/.codex/config.toml`:

   ```toml
   [mcp_servers.opchain]
   url = "https://opchain.dev/mcp"
   ```

Full walkthrough (including a local stdio server): https://opchain.dev/install

## Skills

| Skill | Phase | Role |
|---|---|---|
| oc-checkpoint-protocol    | foundation  | Session persistence (bundled in all skills) |
| oc-orchestrator           | foundation  | `/oc-ops` — multi-project registry, status, routing |
| oc-docs-forge             | plan+build  | Documentation generator for every PR: PR body/comments, README/catalog docs, product docs, changelog, ADR upkeep |
| oc-repo-ops               | build       | Repository hygiene and PR readiness gate: docs packet, generated files, catalog parity, cleanup |
| oc-reverse-spec           | plan        | Code → spec docs |
| oc-stack-forge            | plan        | Universal stack advisor |
| oc-ux-engineer            | plan+build  | Tri-design harness |
| oc-dash-forge             | plan        | Dashboards + dense data UI (spec + React prototype) |
| oc-scale-ops              | plan        | Scaling readiness |
| oc-app-architect          | plan+build  | Unified planning + build harness |
| oc-integrations-engineer  | plan+build  | API integration harness (third-party APIs you consume) |
| oc-api-dev                | plan+build  | First-party API design + build harness (OpenAPI, versioning, SDKs) |
| oc-migration-ops          | plan+build  | `/oc-migrate` — DB / framework / auth / platform migrations |
| oc-agent-forge            | build+ai-native | Claude Agent SDK apps: topology, tool budgets, harness loops, agent eval |
| oc-claude-api             | build+ai-native | Claude API apps: model routing, prompt caching, tool use, migration playbooks |
| oc-prompt-ops             | build+ai-native | Prompt-as-code: versioning, eval datasets, regression and drift detection |
| oc-rag-forge              | build+ai-native | RAG systems: vector DB choice, embeddings, chunking, hybrid search, retrieval eval |
| oc-cost-ops               | build       | LLM cost attribution, budget gates, and model-tier routing recommendations |
| oc-telemetry-ops          | build       | Opt-in local usage metering and anonymized aggregate dashboard feed |
| oc-signal-forge           | build       | Product-analytics signal builder: question to trustworthy metric |
| oc-modularize-ops         | plan+build  | Live-monolith decomposition with golden-fixture equivalence proof |
| oc-fleet-ops              | build       | Self-managed fleet deployment and multi-container operations |
| oc-code-auditor           | build       | Auditor → Fixer → Verifier |
| oc-bug-check              | build       | Pre-commit QA gate: type, lint, tests, secrets, build, deps, anti-patterns |
| oc-security-auditor       | build       | Threat modeling, OWASP hardening, attack-surface review |
| oc-git-ops                | build       | Git workflow |
| oc-release-ops            | build       | Release cadence: plan, draft, bump, announce, ship |
| oc-deploy-ops             | build       | Deployment pipeline |
| oc-monitoring-ops         | build       | Post-deploy observability — uptime, errors, alerts, incidents |

## More info

https://opchain.dev
