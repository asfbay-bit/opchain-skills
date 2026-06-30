# opchain

> skills that ship.

A coordinated set of Claude skills covering the full software development
pipeline — discover, spec, design, build, audit, ship, scale. One skill
per phase. A shared JSON checkpoint protocol carries context across
sessions and skills, so work resumes where you left off.

**Site & docs:** https://opchain.dev

---

## install

### Claude Code CLI

```bash
curl -L https://opchain.dev/opchain-skills.zip -o opchain-skills.zip
unzip opchain-skills.zip -d .claude/skills/
claude
> /oc-discover
```

### Claude.ai / Claude Desktop

1. Download any `SKILL.md` from [`skills/`](./skills)
2. Open Claude → Settings → Customize → Skills
3. Upload the file
4. Start a new conversation and trigger it by name

### Team (check into git)

```bash
git add .claude/skills/
git commit -m "chore: add opchain skills"
git push
```

### Upgrade

```bash
# .checkpoints/ is a sibling of .claude/ — never touched by this swap
rm -rf .claude/skills/
curl -L https://opchain.dev/opchain-skills.zip -o opchain-skills.zip
unzip opchain-skills.zip -d .claude/skills/
rm opchain-skills.zip
```

Verify the installed version against the published one:

```bash
curl -sS https://opchain.dev/api/health | jq .version
```

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
| `oc-code-auditor` | Auditor → Fixer → Verifier; 5-layer pre-deploy sweep |
| `oc-security-auditor` | Threat modeling, OWASP hardening, attack-surface review |
| `oc-bug-check` | Pre-commit QA gate: types, lint, tests, anti-patterns, secrets |
| `oc-git-ops` | Branches, commits, PRs, sync |
| `oc-deploy-ops` | Audit gate → staging → production with rollback |
| `oc-monitoring-ops` | Post-deploy observability — uptime, errors, alerts |
| `oc-scale-ops` | Load tests, perf budgets, caching, capacity planning |
| `oc-migration-ops` | DB / framework / auth / platform migrations |
| `oc-reverse-spec` | Reverse-engineer existing code into spec docs |
| `oc-release-ops` | Version bumps, changelogs, release announcements |
| `oc-orchestrator` | Cross-skill status and routing (`/oc-ops`) |
| `oc-checkpoint-protocol` | Shared session-persistence schema (bundled in every skill) |

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

MIT — see [LICENSE](./LICENSE).
