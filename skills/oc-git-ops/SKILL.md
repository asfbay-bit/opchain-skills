---
name: oc-git-ops
displayName: OC · Git Ops
version: 1.7.0
shortDesc: Branch, commit, PR, sync workflows. v1.2 is PM-aware — `/oc-git-sync TICKET-1234` reads ticket; transitions on merge.
phases: [build]
triAgent: false
tryable: true
commands:
  - /oc-git
  - /oc-commit
  - /oc-pr
  - /oc-push
  - /oc-git-sync
description: >
  Git workflow: branch, commit, PR, sync. Use for /oc-git, /oc-commit, /oc-pr, /oc-push,
  "commit this", "push to git", "create a PR", "sync to repo", or any git
  operation. Trigger liberally.
---

# Git Ops

**On first invocation, read `references/orchestrator.md` and follow its welcome protocol.**

Move code from Claude's workspace to a git repository with proper branch management,
commit structure, and PR descriptions. This is the bridge between "Claude built it"
and "it's in version control."

## /oc-git-ops — Command Reference

When the user types `/oc-git-ops`, display this menu:

```
GIT OPS COMMANDS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  WORKFLOW
  /oc-git-init         Clone repo + set up workspace for a project
  /git-branch       Create a feature branch from convention
  /oc-git-commit       Stage + commit with structured message
  /oc-git-pr           Generate PR description from commits/checkpoint
  /git-push         Push branch to remote
  /oc-git-sync         Full workflow: branch → commit → push → PR

  UTILITIES
  /oc-git-status       Show current branch, staged changes, remote state
  /git-diff         Show what's changed since last commit
  /oc-git-convention   Show/set naming conventions for this project
  /checkpoint       Show checkpoint status

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  Type any command to begin. /oc-git-ops to see this again.
```

---

## How This Skill Works

```
CLAUDE WORKSPACE                    GIT REPO
/home/claude/project/               github.com/user/project
                                    
  Built files          ──────►      Feature branch
  + checkpoint data    ──────►      Structured commits
  + audit report       ──────►      PR description
```

The typical flow:
1. Clone the user's repo (or confirm it's already cloned)
2. Create a feature branch following project conventions
3. Copy/move built files into the repo working tree
4. Make structured commits (one per logical unit)
5. Push the branch
6. Generate a PR description from the checkpoint + commit log

---

## Phase 0: Repository Setup (/oc-git-init)

### First Time

```bash
# Clone the repo
git clone <repo-url> /home/claude/<project-name>
cd /home/claude/<project-name>

# Verify remote
git remote -v

# Check default branch
git symbolic-ref refs/remotes/origin/HEAD | sed 's@^refs/remotes/origin/@@'
```

### Returning (repo already cloned)

```bash
cd /home/claude/<project-name>
git fetch origin
git checkout main && git pull origin main
```

### Authentication

Git operations require auth. Check in this order:

1. **SSH key** — `ls ~/.ssh/id_*` (preferred for push)
2. **Git credential helper** — `git config credential.helper`
3. **GitHub token** — check env `GITHUB_TOKEN` or `GH_TOKEN`
4. **Ask the user** — "I need git push access. Can you provide a GitHub token
   or set up SSH?"

Store auth method in the checkpoint so future sessions don't re-ask.

---

## Branch Naming Convention

### Default Convention

```
<type>/<short-description>

Types:
  feat/     New feature
  fix/      Bug fix
  refactor/ Code restructure (no behavior change)
  chore/    Dependencies, config, tooling
  docs/     Documentation only
  test/     Test additions or fixes
  deploy/   Deployment-related changes
```

Examples:
- `feat/pintrack-substance-module`
- `fix/auth-session-expiry`
- `chore/update-wrangler-config`
- `deploy/add-staging-workflow`

### Convention from Checkpoint

If an oc-app-architect checkpoint exists, derive the branch name from it:
- Sprint 1 build → `feat/sprint-1-auth-flow`
- Code audit fix → `fix/audit-f001-rate-limiting`
- Deploy setup → `deploy/ci-cd-pipeline`

### /oc-git-convention

Set or view the project's naming conventions:

```bash
# Store in project config
cat > .git-ops-config.json << 'EOF'
{
  "branch_prefix": "feat|fix|refactor|chore|docs|test|deploy",
  "commit_format": "conventional",
  "default_base": "main",
  "pr_template": true,
  "auto_lint_before_commit": true
}
EOF
```

---

## Commit Structure (/oc-git-commit)

### Conventional Commits

```
<type>(<scope>): <description>

[optional body]

[optional footer]
```

| Type | When |
|---|---|
| `feat` | New feature for the user |
| `fix` | Bug fix |
| `refactor` | Code change that doesn't fix a bug or add a feature |
| `chore` | Tooling, deps, config |
| `docs` | Documentation |
| `test` | Adding or fixing tests |
| `ci` | CI/CD changes |
| `style` | Formatting (no logic change) |

### Commit Granularity

One commit per logical unit of work. Rules of thumb:

| Change Size | Commit Strategy |
|---|---|
| Single file fix | 1 commit |
| New component (file + test + styles) | 1 commit |
| New feature (multiple files) | 1 commit per layer: schema → API → frontend → tests |
| Full sprint | 3-6 commits following the build order |
| Config/tooling changes | 1 commit, separate from feature work |

### Auto-Commit from oc-app-architect Phase 6 Sprints

When oc-app-architect completes a Phase 6 sprint, oc-git-ops can auto-structure commits:

```bash
# Read the sprint contract for commit scoping
# Each contract deliverable becomes one commit

# Example for Sprint 1: Auth
git add src/db/migrations/ src/db/schema.ts
git commit -m "feat(db): add users and sessions tables"

git add src/auth/ src/middleware/session.ts
git commit -m "feat(auth): implement WebAuthn passkey flow"

git add src/auth/__tests__/ tests/
git commit -m "test(auth): add unit + integration tests for passkey auth"
```

### Pre-Commit Gate (auto-invokes oc-bug-check)

**Before staging files or running `git commit`, invoke the oc-bug-check skill.**
This is the canonical pre-commit gate — oc-git-ops does NOT run its own
ad-hoc lint/type/test checks. Bug-check owns the seven-check suite
(types, lint, tests, anti-patterns, secrets, build, deps) and decides
PASS or FAIL.

```
Skill(skill="oc-bug-check", args="/oc-bugcheck run")
```

Then read `.checkpoints/oc-bug-check.checkpoint.json` for the verdict.

| Verdict | Action |
|---|---|
| PASS | Proceed to `git add` + `git commit` |
| FAIL | **ABORT.** Surface the failing checks and offer the user `/oc-bugcheck fix` (auto-fix lint/format) or `/oc-bugcheck bypass` (logged override). Do NOT call `git commit` until verdict flips to PASS or the user explicitly bypasses. |
| (no checkpoint) | Bug-check hasn't run — invoke it first. |

The runtime also has a `PreToolUse(Bash)` hook at
`.claude/hooks/pre-commit-bugcheck.sh` that blocks `git commit` when the
oc-bug-check checkpoint is missing or stale (>10min) or has a non-PASS
verdict. The hook is the safety net; this section is the contract that
keeps the assistant from tripping it.

---

## PR Description (/oc-git-pr)

### Auto-Generated from Context

Pull from all available sources to build a comprehensive PR description:

1. **Commit log** — `git log main..HEAD --oneline`
2. **Tri-dev checkpoint** — sprint contract, evaluator scores
3. **Code-auditor checkpoint** — findings addressed, remaining issues
4. **App-architect checkpoint** — which roadmap tasks this covers

### PR Template

```markdown
## Summary

[2-3 sentences: what this PR does and why]

**Linked ticket:** [TICKET-1234](ticket-url)

## Changes

[Auto-generated from commit messages, grouped by type]

### Features
- [feat commits]

### Fixes
- [fix commits]

### Other
- [remaining commits]

## Testing

- [ ] Unit tests pass (`npm test`)
- [ ] Type check passes (`tsc --noEmit`)
- [ ] Manual testing completed
[If oc-app-architect Phase 6: "Evaluated by oc-app-architect evaluator: X.X/10 (sprint N)"]

## Audit Status

[If oc-code-auditor ran: "Pre-deploy audit: Grade [X], [N] findings ([M] addressed in this PR)"]
[If not: "No code audit run — consider `/oc-audit pre-deploy` before merging"]

## Deployment Notes

[Any migration steps, env var additions, or config changes needed]
[Auto-detected from: new migration files, .env.example changes, wrangler.toml changes]

Refs: TICKET-1234
```

### Creating the PR

```bash
# If gh CLI is available
gh pr create --title "[type]: [description]" --body-file /tmp/pr-description.md

# If not, output the description for the user to paste
echo "PR description saved to: /mnt/user-data/outputs/pr-description.md"
echo "Create the PR manually and paste this description."
```

---

## Full Sync Workflow (/oc-git-sync)

One command that runs the entire flow:

```
/oc-git-sync [description]
```

1. **Detect context** — read checkpoints for project, skill, and current state
2. **Determine branch name** — from checkpoint or description
3. **Create branch** — `git checkout -b <branch>`
4. **Stage changes** — intelligently stage (skip build artifacts, node_modules)
5. **Structure commits** — group by logical unit
6. **Run oc-bug-check gate** — invoke `Skill(skill="oc-bug-check", args="/oc-bugcheck run")`. **FAIL aborts the sync** — surface the failing checks and stop. The user can `/oc-bugcheck fix`, `/oc-bugcheck bypass`, or address the failures and re-run `/oc-git-sync`.
7. **Push** — `git push -u origin <branch>`
8. **Generate PR description** — from all available context
9. **Create PR** — via gh CLI or output for manual creation

At each step, show progress. If any step needs user input, ask once and continue.

### Post-Sync Handoff

After `/oc-git-sync` completes successfully:
- If a oc-deploy-ops config exists for this project, suggest:
  "Changes pushed. Run `/oc-deploy staging` to deploy to staging?"
- If no oc-deploy-ops config exists, suggest:
  "Changes pushed. Run `/oc-deploy init` to set up deployment, or `/oc-audit pre-deploy` for a quality check."

---

## Project Governance Awareness

If a `GOVERNANCE.md` file exists in the project root (generated by oc-app-architect or
the project-governance skill), read it before committing. Respect:
- **Naming conventions** — file naming, branch naming overrides
- **Directory structure** — where new files should be placed
- **Version tracking** — which documents are master copies vs. working drafts
- **Git strategy** — branching model (if different from oc-git-ops defaults)

If governance conventions conflict with oc-git-ops defaults, governance wins — it's
project-specific, oc-git-ops defaults are generic.

---

## Checkpoint Integration

### Checkpoint Location
`{project-dir}/.checkpoints/oc-git-ops.checkpoint.json`

### When to Write

| Event | What to Save |
|---|---|
| Repo cloned/verified | Repo URL, default branch, auth method |
| Branch created | Branch name, base branch, purpose |
| Commits made | Commit SHAs, messages, file counts |
| Push completed | Remote URL, branch pushed, timestamp |
| PR created | PR URL, PR number |
| **PR merged** | Append `{ number, title, merge_method, merge_sha, merged_at }` to `skill_state.merged_prs`. Re-stamp `updated_at`. |

### Post-Merge Update

Restamp `merged_prs` at sensible inflection points — after a review wave, when a
release ships, or when a session ends — not once per merge. The single update is:

```bash
node scripts/checkpoint.mjs update oc-git-ops \
  "--skill_state.merged_prs+:json={...}" \
  "--step=last-merge-#${PR_NUM}" \
  "--status=complete"
```

> **Do not automate this per-merge.** opchain.dev once ran a
> `.github/workflows/checkpoint-after-merge.yml` that opened a
> `bot/checkpoint-stamp-<PR>` PR on every merge to `main`. It was removed
> 2026-06-22: under branch protection the bot's auto-merge could never satisfy
> required review, so each merge left a permanent open PR, and because every PR
> appended to the same `merged_prs` array they mutually conflicted. The data is
> reconstructable from `git log`, so a CI-gated PR per merge is pure cost. See
> *Anti-pattern: don't auto-stamp `merged_prs` per merge* in the checkpoint
> protocol. Other skills' checkpoints (oc-orchestrator, oc-app-architect,
> oc-ux-engineer, etc.) stay assistant-driven because their content is contextual.

### context_primer Template

```json
{
  "key_decisions": [
    "Repo: github.com/user/aidops-core",
    "Auth: SSH key",
    "Convention: conventional commits, feat/fix/chore prefixes",
    "Last push: feat/pintrack-module → origin, 6 commits"
  ],
  "generated_files": [
    "pr-description.md"
  ]
}
```

### Cross-Skill Reads

| Reads from | Why |
|---|---|
| oc-app-architect | Roadmap tasks → PR description, phase → branch naming; Phase 6 sprint contract → commit scoping, eval scores → PR description |
| oc-code-auditor | Audit grade → PR description, findings → commit grouping |
| oc-deploy-ops | Deploy status → PR deployment notes |

---

## .gitignore Enforcement

When committing, always verify these are gitignored:

```
node_modules/
.env
.env.local
dist/
build/
.wrangler/
.checkpoints/          # Checkpoint protocol files
*.checkpoint.json.bak  # Archived checkpoints
.git-ops-config.json   # Local oc-git-ops config
```

If `.gitignore` is missing entries, add them in a separate `chore: update .gitignore`
commit before the feature commits.

---

## PM-Tool MCP Integration (v1.3+)

When the user invokes any verb with a ticket id —
`/oc-git-sync TICKET-1234`, `/oc-commit --ticket PLAT-12`, or pastes a
Linear / Jira / GitHub Issues URL — oc-git-ops reads the ticket via
the configured PM-MCP and uses it for branch, commit, and PR shape.

The runtime contract — concrete tool names, retry policy, idempotency
markers, and the `pm_deferred_actions[]` schema — lives in
[`oc-integrations-engineer/references/pm-mcp-protocol.md`](../oc-integrations-engineer/references/pm-mcp-protocol.md).
**All MCP calls below honour that contract; this section says only how
oc-git-ops shapes branch / commit / PR / state from the ticket.**

### `/oc-git-sync TICKET-1234` flow

1. Resolve provider from `.opchain/pm.yaml` (or detect from id pattern
   / URL). Apply `tool_overrides` from `pm.yaml` before falling through
   to the registry in protocol §1.
2. Call the registry-resolved `get_issue` tool (Linear:
   `mcp__claude_ai_Linear__get_issue`; GitHub:
   `mcp__mcp-server-github__issue_read`; Jira:
   `mcp__atlassian__jira_get_issue`) to fetch title, description, labels,
   priority, status, assignee. Apply the retry policy from protocol §2.
3. **Branch name** — slug `{type}/{id}-{title-kebab-truncated-50}`,
   where `type` is derived from the ticket type / labels:
   `feat`, `fix`, `chore`, `docs`, `refactor`. Default `feat` if
   ambiguous. **The ticket id is mandatory and must preserve the PM tool's
   canonical casing in the branch name** (for example,
   `feat/TICKET-1234-runtime-pm-mcp-made-real` or
   `fix/PROJ-57-auth-session-expiry`). Do not drop or rewrite the id:
   Linear / Jira / GitHub integrations auto-link PRs by detecting the ticket
   id in branch / PR metadata.
4. **Commit message** — first line: `{type}({scope}): {title}`.
   Body: short paragraph summarising the change; trailer
   `Refs: TICKET-1234` (or `Closes:` if the ticket is in a
   "ready-to-close" state).
5. **PR title + body** — title begins with `[TICKET-1234]` followed by
   the concise change summary. Body is generated from the ticket
   description, the diff summary, and the auditor / oc-bug-check report
   (if present). It includes a top-line
   `**Linked ticket:** [TICKET-1234](url)` and a plain-text `Refs:
   TICKET-1234` footer so Linear can auto-link even if branch detection
   fails.
6. **PR open** — pre-write check via the `list_comments` tool (Linear)
   or `issue_read` (GitHub, comments inline) for marker
   `<!-- opchain:oc-git-ops:pr-opened:#<pr-number> -->`. If absent, call
   the registry-resolved `add_comment` tool (Linear:
   `mcp__claude_ai_Linear__save_comment`; GitHub:
   `mcp__mcp-server-github__add_issue_comment`) with body
   `<!-- opchain:oc-git-ops:pr-opened:#<pr-number> -->\nPR opened: <url>`.
   Then resolve the `in_review` state string from `pm.yaml.states` and
   call the `transition` tool (Linear / GitHub: `save_issue` /
   `issue_write` with state field; Jira:
   `mcp__atlassian__jira_transition_issue`).
7. **PR merge** (when oc-git-ops observes the merge or is invoked with
   `/oc-git-sync --closed`) — same pre-write check pattern with marker
   `<!-- opchain:oc-git-ops:pr-merged:#<pr-number> -->`; comment carries
   the merge SHA + commit subject; transition to `done` (resolved
   from `pm.yaml.states`).

### `/oc-commit` enrichment

If a ticket id appears in the user's prompt but no `/oc-git-sync`,
just enrich the commit body with `Refs: TICKET-1234` and stop —
the comment + transition is `/oc-git-sync` territory. No MCP call is
made by `/oc-commit` alone.

### Multi-ticket commits

If the staged diff spans multiple tickets (e.g. user says
"this closes PLAT-1 and PLAT-2"), use the first as the branch /
PR primary and add a `Refs:` line per additional ticket. Comment
on each via `add_comment`, each carrying its own ticket-scoped
marker `<!-- opchain:oc-git-ops:pr-opened:#<pr-number>:<ticket-id> -->`
so re-runs are idempotent per ticket.

### `/oc-git-sync --retry-pm` flush

Invokes the protocol §4 flush against
`oc-git-ops.checkpoint.json` `pm_deferred_actions[]`. Filter to
`skill: "oc-git-ops"` and `retriable: true`. Surfaces
`flushed N / failed M`.

### Failure modes

- MCP unavailable / unconfigured → fall back to slug from the user's
  prompt and generic commit message; never block the commit on
  PM-MCP. The PR still opens.
- Ticket id format unrecognised → treat as plain text in the user
  prompt; do not call MCP.
- `add_comment` retry-budget exhausted (transient) → defer per
  protocol §4 with `retriable: true`; user can `/oc-git-sync --retry-pm`
  later. The PR is unaffected.
- 403 (cross-team scope) → defer with `retriable: false`; surface
  the permission error; never auto-flush. The PR is unaffected.

---

## Principles

1. **One logical change per commit.** Not one file per commit. Not one sprint per commit.
   The unit is "one thing a reviewer can understand in isolation."
2. **Branch names tell a story.** `feat/sprint-2-crud-api` beats `update-stuff`.
3. **PR descriptions are for future-you.** Six months from now, this PR title + description
   should explain why this change exists without reading the code.
4. **Never force-push main.** Feature branches can be force-pushed (rebased). Main cannot.
5. **Commits are cheap, reverts are cheaper.** Small, atomic commits make rollbacks surgical.
6. **Auth setup happens once.** Store the method in checkpoint, never re-ask.
