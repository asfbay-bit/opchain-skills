---
name: oc-git-ops
displayName: OC · Git Ops
version: 1.9.0
license: Apache-2.0
shortDesc: Branch, commit, PR, sync, and release-tag workflows. `/oc-git-release` closes the release ledger; PM-aware (v1.3+).
phases: [build]
triAgent: false
tryable: true
commands:
  - /oc-git
  - /oc-commit
  - /oc-pr
  - /oc-push
  - /oc-git-sync
  - /oc-git-release
  - /oc-git-init
  - /oc-git-status
  - /oc-git-convention
description: >
  Git workflow: branch, commit, PR, sync, release tag. Chains to (when you invoke it):
  oc-bug-check before every commit and the oc-docs-forge → oc-repo-ops pre-PR gate before
  every PR. Owns the release tag that oc-release-ops hands off. Use for /oc-git, /oc-commit,
  /oc-pr, /oc-push, /oc-git-sync, /oc-git-release, "commit this", "push to git", "create a PR",
  "tag the release", "sync to repo", or any git operation.
---

# Git Ops

**On first invocation, read `references/orchestrator.md` and follow its welcome protocol.**

Move code from Claude's workspace to a git repository with proper branch management,
commit structure, and PR descriptions. This is the bridge between "Claude built it"
and "it's in version control."

## /oc-git — Command Reference

When the user types `/oc-git`, display this menu:

```
GIT OPS COMMANDS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  WORKFLOW
  /oc-git-init         Clone repo + set up workspace for a project
  /oc-commit           Stage + commit with structured message
  /oc-pr               Generate PR description from commits/checkpoint
  /oc-push             Push branch to remote
  /oc-git-sync         Full workflow: branch (from convention) → commit → push → PR
  /oc-git-release      Tag a merged release + push the tag (closes the ledger)

  UTILITIES
  /oc-git-status       Show current branch, staged changes, remote state, diff since last commit
  /oc-git-convention   Show/set naming conventions for this project
  /checkpoint          Show checkpoint status

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  Type any command to begin. /oc-git to see this again.
```

---

## How This Skill Works

```
CLAUDE WORKSPACE                    GIT REPO
<workspace>/project/                github.com/user/project
                                    
  Built files          ──────►      Feature branch
  + checkpoint data    ──────►      Structured commits
  + audit report       ──────►      PR description
```

The typical flow:
1. Clone the user's repo (or confirm it's already cloned)
2. Create a feature branch following project conventions
3. Copy/move built files into the repo working tree
4. Run the pre-commit gate: oc-bug-check must PASS before any commit
5. Make structured commits (one per logical unit)
6. Push the branch
7. Run the pre-PR gate: oc-docs-forge (PR docs packet) → oc-repo-ops (readiness
   check); docs edits the packet makes are committed (through the bug-check gate)
   and pushed before the readiness check
8. Generate a PR description from the checkpoint + commit log + docs packet

---

## Phase 0: Repository Setup (/oc-git-init)

### First Time

```bash
# Clone the repo
git clone <repo-url> <workspace>/<project-name>
cd <workspace>/<project-name>

# Verify remote
git remote -v

# Check default branch
git symbolic-ref refs/remotes/origin/HEAD | sed 's@^refs/remotes/origin/@@'
```

### Returning (repo already cloned)

```bash
cd <workspace>/<project-name>
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
- `feat/storefront-checkout-module`
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

## Commit Structure (/oc-commit)

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
| PASS | Proceed to `git add` + `git commit`, editing nothing in between. The PASS is bound to `skill_state.verified_tree`, so any change after the run invalidates it (oc-bug-check § Commit gate contract). |
| FAIL | **ABORT.** Surface the failing checks and offer the user `/oc-bugcheck fix` (auto-fix lint/format). If they choose to commit anyway, that is an explicit bypass: record it with `/oc-bugcheck bypass`, then commit with `OPCHAIN_BYPASS=1 git commit …` or `git commit --no-verify`. The record is the accountability trail; on its own it does not clear the commit-gate hook. Do NOT call `git commit` until the verdict flips to PASS or the user explicitly bypasses. |
| UNSUPPORTED | **Not a pass.** Bug-check did not recognize the stack and skipped types, lint, tests and build. Surface that; commit only if the user explicitly bypasses, as for FAIL. |
| (no checkpoint) | Bug-check hasn't run — invoke it first. |

> **This gate is advisory unless the commit-gate hook is installed.** The opchain
> plugin ships a `PreToolUse(Bash)` hook (`hooks/pre-commit-gate.cjs`) that blocks
> `git commit` unless the bug-check checkpoint records a PASS bound to the current
> working tree; the opchain.dev repo registers that same file in its
> `.claude/settings.json`. The hook arms only in a repo that already has a
> `.checkpoints/` or `.opchain/` directory (or when `OPCHAIN_GATE=1` is set);
> elsewhere it allows every commit. `OPCHAIN_BYPASS=1` or `--no-verify` clears it.
> The **skills bundle does not ship it** — with the zip alone, nothing mechanically
> enforces the table above; treat it as a contract you are choosing to honour. To
> get real enforcement, install the opchain plugin rather than the skills zip.

---

## PR Description (/oc-pr)

### Auto-Generated from Context

Pull from all available sources to build a comprehensive PR description:

1. **Commit log** — `git log main..HEAD --oneline`
2. **App-architect checkpoint** — which roadmap tasks this covers, the Phase 6
   sprint contract and evaluator scores
3. **Code-auditor checkpoint** — findings addressed, remaining issues
4. **Docs-forge checkpoint** — `skill_state.pr_body_fragment` (the `## Documentation`
   section) and `pr_comment_marker` for the optional docs comment

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

## Documentation

[Inserted verbatim from the oc-docs-forge checkpoint (`skill_state.pr_body_fragment`).
The oc-repo-ops gate fails closed if this section is missing. If no user-facing docs
changed, oc-docs-forge says so explicitly and explains why — silence is not a pass.]

## Testing

- [ ] Unit tests pass (`npm test`)
- [ ] Type check passes (`tsc --noEmit`)
- [ ] Manual testing completed
[If oc-app-architect Phase 6: "Evaluated by oc-app-architect evaluator: X.X/10 (sprint N)"]

## Audit Status

[If oc-code-auditor ran: "Pre-deploy audit: Grade [X], [N] findings ([M] addressed in this PR)"]
[If not: "No code audit run — consider `/oc-audit pre-deploy` before merging"]
[Pre-PR gate: "oc-docs-forge packet ✓ · oc-repo-ops verdict PASS" — from the gate checkpoints]

## Deployment Notes

[Any migration steps, env var additions, or config changes needed]
[Auto-detected from: new migration files, .env.example changes, wrangler.toml changes]

Refs: TICKET-1234
```

### Pre-PR Gate (auto-invokes oc-docs-forge, then oc-repo-ops)

**Before creating any PR, run the v1.8 quality-gate rail.** This is the canonical
pre-PR gate — oc-git-ops does NOT write its own docs packet or hygiene checks.
Docs Forge owns the PR documentation packet; Repo Ops decides whether the
repository is clean enough to open the PR.

```
Skill(skill="oc-docs-forge", args="/oc-docs pr")
```

Then read `.checkpoints/oc-docs-forge.checkpoint.json` and insert
`skill_state.pr_body_fragment` (the `## Documentation` section) into the PR body.
If `pr_comment_marker` is set, post the docs comment after the PR opens.

```
Skill(skill="oc-repo-ops", args="/oc-repo verify")
```

Then read `.checkpoints/oc-repo-ops.checkpoint.json` for the verdict. A verdict
is only evidence about the code it checked: both checkpoints record
`skill_state.verified_for_sha`, and each must equal `git rev-parse HEAD` on the
branch you are about to open. A squash merge leaves a PASS bound to a branch tip
that never reaches `main`, so a later session can find a PASS for code that no
longer exists.

| Verdict | Action |
|---|---|
| PASS, `verified_for_sha` equals the branch HEAD | Proceed to `gh pr create` |
| PASS, but `verified_for_sha` is missing or differs from the branch HEAD | **Stale.** Re-run `/oc-docs pr`, then `/oc-repo verify`, before `gh pr create`. |
| FAIL | **ABORT.** Surface `skill_state.blocking_findings` and offer the user `/oc-repo clean` (safe fixes) or `/oc-docs pr` (regenerate a stale packet). Do NOT open the PR until the verdict flips to PASS. |
| (no checkpoint) | The gate hasn't run — invoke oc-docs-forge, then oc-repo-ops, first. |

Required order (from the oc-repo-ops Every-PR Gate): bug-check (already run
before every commit, including any docs-packet commit) → docs-forge → repo-ops →
PR.

### Creating the PR

```bash
# If gh CLI is available
gh pr create --title "[type]: [description]" --body-file /tmp/pr-description.md

# If not, output the description for the user to paste
echo "PR description saved to: /tmp/pr-description.md"
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
5. **Run oc-bug-check gate** — invoke `Skill(skill="oc-bug-check", args="/oc-bugcheck run")` after the last edit and before any commit. **FAIL aborts the sync** — surface the failing checks and stop. The user can `/oc-bugcheck fix`, address the failures and re-run `/oc-git-sync`, or bypass explicitly as described in the Pre-Commit Gate table.
6. **Structure commits** — group by logical unit, editing nothing after step 5. The PASS covers the whole working tree, so it holds for every commit in the group; if the commit-gate hook reports that the repo changed, re-run step 5.
7. **Push** — `git push -u origin <branch>`
8. **Generate PR docs packet** — invoke `Skill(skill="oc-docs-forge", args="/oc-docs pr")` to produce the `## Documentation` body fragment (and any README/product-doc edits that must travel with the change)
9. **Commit the docs edits** — if step 8 changed files, stage them, re-run the oc-bug-check gate (step 5), commit (`docs: …`), push, and re-run `/oc-docs pr` at most once more so the packet's `verified_for_sha` is the new HEAD (if that run edits files again, stop and surface it rather than looping). Skip when step 8 changed no files.
10. **Run oc-repo-ops gate** — invoke `Skill(skill="oc-repo-ops", args="/oc-repo verify")`. **FAIL aborts the sync before the PR is created** — surface the blocking findings; the user can `/oc-repo clean` or fix and re-run.
11. **Generate PR description** — from all available context, inserting the docs packet's `## Documentation` fragment
12. **Create PR** — via gh CLI or output for manual creation

At each step, show progress. If any step needs user input, ask once and continue.

### Post-Sync Handoff

After `/oc-git-sync` completes successfully, hand off per orchestrator §3
("git-sync completes"). Deploying is a user decision, so confirm first:
- If an oc-deploy-ops config exists for this project, ask: "Changes pushed. Run
  the deploy audit and deploy to staging?" On yes, invoke
  `Skill(skill="oc-deploy-ops", args="/oc-deploy audit")`, then
  `Skill(skill="oc-deploy-ops", args="/oc-deploy staging")`.
- If no oc-deploy-ops config exists, offer `/oc-deploy init` to set up
  deployment, or `/oc-audit pre-deploy` for a quality check.

---

## Release Tagging (/oc-git-release)

`oc-release-ops` Phase 5 hands off "the merge / tag" to this skill. Until v1.8.3
there was nothing here to catch it: the command reference had no tag verb, so the
tag half of that handoff had nowhere to land.

It showed. The 2026-08-26 ledger audit found thirteen shipped releases on
`/changelog` and three tags in git — **v1.0 through v1.7 all shipped untagged.**

```
/oc-git-release <semver>
```

### Preconditions

Refuse and explain, rather than tagging anyway, if:

- HEAD is not reachable from `origin/main` (a release tag on an unmerged branch
  is worse than no tag — it points at code nobody else has).
- The project's release version does not equal `<semver>`. In the opchain.dev
  repo that is the lockstep catalog version in `skills/*/SKILL.md`; in another
  project it is every version location listed in `.opchain/release.yaml`
  (oc-release-ops multi-project mode). A tag that disagrees with the version is
  a second lie, not a fix.
- *(opchain.dev repo only)* `release-seal.json` is missing or names another
  catalog version. The seal is the reviewed baseline an eventual tag must inherit.
- A tag `v<semver>` already exists. Never move a published tag; cut the next
  patch instead. In opchain.dev, `publish-mcp-registry.yml` has already fired for
  the old one.

### Steps

1. `git fetch origin main --tags`
2. Verify the preconditions above.
3. `git tag -s v<semver> -m "release: v<semver> — <theme>"` on the reviewed
   merge commit. This is a human gate: if the signing key is unavailable, stop
   rather than substituting an unsigned or agent-authored tag.
4. *(opchain.dev repo only)* `node scripts/check-release-tag.mjs --local` —
   verify the seal, exact tagged publisher-workflow and `server.json` payload
   digests, catalog, ancestry, and tag signature **before** a push can trigger
   the OIDC publisher. Elsewhere, `git tag -v v<semver>` checks the signature.
5. `git push origin v<semver>` — in opchain.dev this is what triggers
   `.github/workflows/publish-mcp-registry.yml`. An unpushed tag republishes
   nothing.
6. Record the tag in `oc-git-ops.checkpoint.json` under
   `skill_state.release_reconciliation`, the shape the v1.9.0 cut wrote:

```json
{ "skill_state": { "release_reconciliation": {
  "release_pr": { "number": 477, "merge_sha": "…", "merged_at": "…" },
  "tag": { "name": "v1.9.0", "object_sha": "…", "peeled_commit": "…",
           "signing_fingerprint": "…", "local_gate": "PASS", "remote_gate": "PASS" }
} } }
```

7. *(opchain.dev repo only)* Verify with `node scripts/check-release-tag.mjs`
   (exit 0). This remote gate proves origin contains the same signed tag object,
   not merely a different tag that peels to the same commit. Elsewhere,
   `git ls-remote --tags origin v<semver>` confirms the push.

### This verb is not the enforcement

Documenting a verb does not make it run — this file saying so is the same prose
that failed for ten releases. The edge is held by `scripts/deploy.mjs`, which
refuses a **production** deploy when the catalog version has moved somewhere no
tag follows. `/oc-git-release` is what you run to satisfy that guard; the guard
is what makes you run it.

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

The shared checkpoint schema, write rules and resume protocol live in
`references/checkpoint-protocol.md`, bundled with this skill. This section adds only
what is specific to oc-git-ops.

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
| **PR merged** | Note `{ number, title, merge_method, merge_sha, merged_at }`, and append it to `skill_state.merged_prs` at the next inflection-point restamp below, not once per merge. |
| **Release tagged** | Write `skill_state.release_reconciliation.tag` `{ name, object_sha, peeled_commit, signing_fingerprint, local_gate, remote_gate }` and its `release_pr` (see /oc-git-release step 6). |

### Post-Merge Update

Restamp `merged_prs` at sensible inflection points — after a review wave, when a
release ships, or when a session ends — not once per merge. Where the project has the
checkpoint CLI, the single update is below; otherwise edit
`.checkpoints/oc-git-ops.checkpoint.json` directly (append to `skill_state.merged_prs`,
set `step` and `status`, restamp `updated_at`):

```bash
node scripts/checkpoint.mjs update oc-git-ops \
  "--skill_state.merged_prs:json+={...}" \
  "--step=last-merge-#${PR_NUM}" \
  "--status=complete"
```

Each `:json+=` flag appends one object; repeat the flag to record several PRs. (Up
to v1.9.0 this recipe was written `+:json=`, which the CLI parsed as a literal key
named `merged_prs+`; the CLI now accepts either order and refuses a key that still
carries an operator.) Without the CLI, edit `skill_state.merged_prs` directly.

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
    "Repo: github.com/acme/acme-core",
    "Auth: SSH key",
    "Convention: conventional commits, feat/fix/chore prefixes",
    "Last push: feat/storefront-module → origin, 6 commits"
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
| oc-bug-check | Pre-commit gate verdict (PASS / FAIL / UNSUPPORTED) → allow or block the commit |
| oc-code-auditor | Audit grade → PR description, findings → commit grouping |
| oc-docs-forge | PR docs packet (`pr_body_fragment`, `pr_comment_marker`) → PR body + docs comment |
| oc-repo-ops | PR readiness verdict + blocking findings → gate PR creation |
| oc-deploy-ops | Deploy status → PR deployment notes |

| Chains to | When |
|---|---|
| oc-bug-check | Before every commit (`/oc-commit`, `/oc-git-sync` step 5) |
| oc-docs-forge → oc-repo-ops | Before every PR (the pre-PR gate) |
| oc-deploy-ops | After `/oc-git-sync`, on user confirmation: `/oc-deploy audit` then `/oc-deploy staging` |

| Invoked by | When |
|---|---|
| oc-release-ops | `/oc-release ship`: `/oc-git-sync v<semver>` for the release PR, then `/oc-git-release <semver>` after merge |
| oc-app-architect | All build sprints pass → `/oc-git-sync` |
| oc-claude-api / oc-prompt-ops | A model-migration or prompt diff with no score regression → `/oc-pr` (the pre-PR gate runs as usual) |
| oc-modularize-ops | A commit per module extraction → `/oc-commit` |
| oc-fleet-ops | The IaC for a fleet deploy → `/oc-commit` |
| oc-migration-ops | Code changes from migration steps → `/oc-git-sync` (suggested) |

| Read by | Why |
|---|---|
| oc-release-ops | `skill_state.merged_prs` → "What's new" bullets (a documented sibling key) |
| oc-deploy-ops | Branch merged → ready to deploy |
| oc-docs-forge | Branch, commit log, PR draft, linked ticket (passed at the pre-PR handoff) |
| oc-repo-ops | Branch, base, commit log, PR draft → readiness gate |

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
.git-ops-config.json   # Local oc-git-ops config
```

Do **not** gitignore `.checkpoints/` by default — the checkpoint protocol tracks it
in git unless the project's protocol says otherwise, and oc-repo-ops enforces that
policy at the pre-PR gate. Only ignore it when the project has explicitly opted out.
That includes archived checkpoints: they rotate into the tracked
`.checkpoints/history/` directory, so there is no `.bak` pattern to ignore.

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
`oc-integrations-engineer/references/pm-mcp-protocol.md`, in that skill (not bundled
with this skill; install the full catalog, or oc-integrations-engineer alongside it).
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
   description, the diff summary, the oc-docs-forge packet (the
   `## Documentation` section), and the auditor / oc-bug-check report
   (if present). It includes a top-line
   `**Linked ticket:** [TICKET-1234](url)` and a plain-text `Refs:
   TICKET-1234` footer so Linear can auto-link even if branch detection
   fails.
6. **PR open** — only after the pre-PR gate passes (oc-docs-forge packet
   present, oc-repo-ops verdict PASS — see Pre-PR Gate above). Then
   pre-write check via the `list_comments` tool (Linear)
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
