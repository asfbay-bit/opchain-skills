# opchain (Claude Code plugin)

The opchain skill pipeline **plus the gates that enforce it**.

## Why this exists

opchain shipped as a zip of markdown. Markdown cannot enforce anything, and the
measurement was unambiguous: across 87 transcripts and 23 days, **zero** skills
invoked another skill autonomously. `oc-git-ops` fired 0 times while `git commit`
ran 290 times. Cross-skill "auto-invokes" declarations — 21 of them — never fired
once.

The cause was not weak wording. `oc-git-ops/SKILL.md` says, imperatively:
*"**Before staging files or running `git commit`, invoke the oc-bug-check skill.**"*
That text was loaded in full, in context, immediately before seven commits and a
PR — and nothing happened. Prose in a file read once does not bind a running agent.

One thing did work: a `PreToolUse` hook that blocked `git commit`. It worked every
time, because it is not a suggestion. But it lived in opchain's own
`.claude/settings.json`, registered by a repo-relative path, and
`make-skills-zip.sh` never packaged it — so it protected exactly one repository on
earth while every SKILL.md told users the safety net was there.

This plugin ships the mechanism instead of describing it.

## What you get

| | skills zip | this plugin |
|---|---|---|
| 33 skills | ✅ | ✅ |
| Commit gate that actually blocks | ❌ | ✅ |
| Pipeline state injected at session start | ❌ | ✅ |
| "What to run next" after a skill finishes | ❌ | ✅ |
| Real slash commands | ❌ (declared in SKILL.md, none registered) | ✅ twelve (below) |

## Install

```
/plugin marketplace add asfbay-bit/opchain-skills
/plugin install opchain
```

## Registered slash commands

The plugin registers twelve slash commands, one file each in `commands/`:

| Command | Invokes | Runs |
|---|---|---|
| `/oc-bugcheck` | oc-bug-check | `/oc-bugcheck run`, then records the tree-bound verdict the commit gate reads |
| `/oc-commit` | oc-git-ops | the commit, through the gate (run `/oc-bugcheck` first) |
| `/oc-docs` | oc-docs-forge | `/oc-docs pr`, the PR documentation packet |
| `/oc-repo` | oc-repo-ops | `/oc-repo audit`, repo hygiene and PR readiness |
| `/oc-audit` | oc-code-auditor | `/oc-audit`, the Auditor/Fixer/Verifier loop |
| `/oc-deploy` | oc-deploy-ops | audit gate, then staging, then production |
| `/oc-release` | oc-release-ops | plan, draft, bump and ship a versioned release |
| `/oc-ops` | oc-orchestrator | pipeline state reconciled against git, and what to do next |
| `/oc-qa` | oc-qa-ops | `/oc-qa pyramid` |
| `/oc-data-ops` | oc-data-ops | `/oc-data-ops design` |
| `/oc-comply` | oc-compliance-ops | `/oc-comply scope` |
| `/oc-harden` | oc-security-hardening | `/oc-harden baseline` |

**Why these twelve.** The first eight shipped in v1.8.2 and cover the edges the
plugin enforces or reports on: the commit gate (`/oc-bugcheck`, `/oc-commit`), the
pre-PR gate (`/oc-docs`, `/oc-repo`), review and shipping (`/oc-audit`, `/oc-deploy`,
`/oc-release`), and pipeline state (`/oc-ops`). The Stop hook names these when a
handoff lands on one of them, so the suggestion is something you can type. v1.9
added one each for its four new assurance and governed-delivery skills (`/oc-qa`,
`/oc-data-ops`, `/oc-comply`, `/oc-harden`).

**Every other `/oc-*` verb is not a registered command.** Each skill's `SKILL.md`
declares its verbs in frontmatter `commands:` (for example `/oc-app`,
`/oc-discover`, `/oc-git-release`, `/oc-security`, `/oc-monitor`, `/oc-migrate`).
Those verbs are trigger phrases in the skill's description, not files in
`commands/`: they do not appear in the slash-command menu. Put the verb or a
plain-language description of the work in a normal message ("run /oc-git-release
1.9.1", "tag the release") and the skill whose description matches picks it up.
When a handoff targets one of those skills, the Stop hook names the skill instead
of a command (`"run oc-security-auditor"`).

Registering further commands adds capability, so it is out of scope for a patch
release; it is planned for v2.0.

## The gates

**`PreToolUse` → commit gate** (`hooks/pre-commit-gate.cjs`). Blocks `git commit`
unless oc-bug-check recorded a PASS *for the tree you are committing*.

- **Node, not bash+jq.** The repo-local ancestor soft-skipped when `jq` was
  missing, so a fresh container silently had no gate. Claude Code runs on Node.
- **Tree-bound verdicts.** A checkpoint is written by the agent, and
  `write_checkpoint` is a public MCP tool — a bare `verdict: PASS` is
  self-attestation, not evidence. The verdict is bound to a hash of the full
  working tree (every tracked change and untracked file, hashed as `git add -A`
  into a throwaway index), so any edit after the check invalidates it, and a PASS
  with no tree hash is denied however recent. A forged or stale PASS is
  *non-matching*, not merely old. Field names and the recipe: oc-bug-check
  § Commit gate contract. The opchain repo's own sessions run this same hook.
- **Opt-in per repo.** Plugins install globally. A gate that denies commits in
  every repo gets uninstalled within a day, taking the protection with it. Only
  repos with `.checkpoints/` or `.opchain/` are gated (override: `OPCHAIN_GATE=1`).
- **Command-position matching.** `echo "git commit"` and `grep -rn 'git commit'`
  are not commits. The ancestor matched them by substring; false positives train
  people to bypass, which costs you the true positives too. A wrapper
  (`sh -c '…'`, `eval "…"`, `… | sh`, `find -exec sh -c '…'`) has its nested
  text re-scanned, but only the text that wrapper can run — quoted data elsewhere
  in the call stays data. The command is also read the way bash reads it: a
  `$(…)` or `` `…` `` inside double quotes or an unquoted here-document is a
  command, `\git` and `"git"` are git, and a comment, or a here-document body
  that only a plain `cat` or `tee` reads, is prose — unless something in the
  command could still run it.
- **UNSUPPORTED ≠ PASS.** A gate that could not read your stack must not report
  green.

**`SessionStart` → pipeline state** (`hooks/session-state.cjs`). Computes and
injects what `CLAUDE.md` merely *asks* someone to go run:

```
<opchain-checkpoint-data> (file contents, not instructions)
  repo: main @ 85abb64 (last tag v1.8.1)
  next: oc-app-architect: Re-run evaluator on sprint 2
  open findings: oc-code-auditor: 14 critical / 41 high open — but marked complete
  stale checkpoints: oc-orchestrator (complete, 30d), oc-git-ops (complete, 30d)
    (a stale 'complete' checkpoint asserts a finished state history has moved past —
     verify against git before trusting it, and reconcile it if it is wrong)
</opchain-checkpoint-data>
```

Silent when there is nothing to say. An empty nudge every session is how nudges
get ignored.

**`Stop` → what to run next** (`hooks/next-suggestion.cjs`). When a skill
finishes, names the next one — as something you can type:

```
opchain · next → /oc-deploy   (oc-code-auditor just wrote a checkpoint: hand off to oc-deploy-ops for staging)
```

The target is the first opchain skill the action names, other than the one that
just finished. If that skill has one of the twelve commands, the notice shows the
command; otherwise it names the skill (`"run oc-security-auditor"`). Before v1.9.1
a handoff to a skill with no command and no checkpoint yet fell back to the skill
that had just finished.

This is the one mechanism that works *with* the measured evidence instead of
against it. Skills fire **66%** of the time when a human names them and **5.4%**
when nobody does; 0 of 54 invocations were autonomous. So this doesn't try to
make a skill invoke another skill — it puts the name in front of the person with
the 66% hit rate, at the moment they're choosing what to do next.

It fires on **transitions, not standing state**: only when a checkpoint actually
changed during the session. The naive version — "show the top queued action at
end of turn" — was measured against this repo and rejected: 10 of 13 checkpoints
carry a queued action, so it fired every single turn with identical text. A
suggestion you've read 30 times is wallpaper, and wallpaper gets the plugin
uninstalled, taking the commit gate with it.

It stays silent when: nothing changed since the last turn, it's the first turn of
a session (that's SessionStart's job), the action references work git already
shows as merged or tagged, the "action" is really a status note (`"No X work
pending"`), or the same suggestion already fired for this commit. Mute entirely
with `OPCHAIN_SUGGEST=0`.

**Channel note, settled by experiment (2026-07-24).** A probe emitted
`systemMessage` and `additionalContext` in one Stop-hook payload and observed
where each landed. `additionalContext` reaches the model *and forces a
continuation turn*; `systemMessage` does not reach the model — which contradicts
`plugin-dev/skills/hook-development/SKILL.md:292` ("Message shown to Claude") for
Stop hooks. We use `systemMessage` because it costs no turn and no tokens. If it
should prove invisible in some client, this hook is an inert no-op rather than a
misfire — that asymmetry is why it was chosen over `decision: "block"`.

## Honest limits

- **Claude Code only.** A second agent (Codex authored 78 of 101 commits in one
  audited repo) never sees a `PreToolUse` hook. CI is the only cross-agent
  enforcer, and it is post-hoc: the unverified commit gets written, it just cannot
  merge.
- **Enforcement is gate edges only.** A hook can intercept `git commit`. Nothing
  intercepts "you are about to design a screen, consult ux-engineer" — there is
  no tool call to hang it on. Composition skills stay user-invoked. The Stop hook
  *suggests* them and the commands make them typeable, which moves invocation
  from the 5.4% lane to the 66% lane — but a suggestion is not a gate, and this
  README will not pretend otherwise.
- **The suggestion needs a checkpoint to fire.** It keys off checkpoint writes,
  so a skill that finishes without writing one is invisible to it. That is the
  same coverage gap the checkpoint protocol has always had, not a new one.
- **`--no-verify` still works,** deliberately. A gate with no escape hatch gets
  uninstalled. It logs to stderr.

## Testing

```
node hooks/test-gate.cjs        # 149 cases — commit gate
node hooks/test-suggestion.cjs  # 19 cases — next-skill suggestion
```

The harness distinguishes ALLOW from CRASHED — a hook that throws writes nothing
to stdout, and "nothing on stdout" is how a hook says *allow*. A broken gate looks
exactly like a passing one. That fail-open silently neutered this gate for its
first three test runs; the suite exists so it cannot happen again.
