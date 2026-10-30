# opchain (Claude Code plugin)

> **Opchain 2.0.4.** Released September 14–21, 2026. Includes the verified 1.9.2 repairs, shared runtime, updater, Hindsight and Evolve, plus the 2.0.3 release-surface cleanup and the 2.0.4 bug fixes. See the [changelog](https://opchain.dev/changelog#v2-0) and the [2.0.0 release record](../../docs/releases/2.0-production-release.md).

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
| 36 skills | ✅ | ✅ |
| Git commit verification | ❌ | ✅ after successful `/oc-enroll` |
| Pipeline state injected at session start | ❌ | ✅ |
| "What to run next" after a skill finishes | ❌ | ✅ |
| Real slash commands | ❌ (declared in SKILL.md, none registered) | ✅ 16 (below) |

## Install

```
/plugin marketplace add asfbay-bit/opchain-skills
/plugin install opchain
/oc-enroll
```

Run `/oc-enroll` successfully in each repository. **Installing the plugin
installs no gate.** The 2026-10-08 effectiveness audit found a repository that
ran seven days and 193 commits with the plugin installed and nothing enrolled;
until `/oc-enroll` succeeds, no hook in that repository checks anything.
`/oc-enroll --doctor` tells you which state you are in. `/oc-enroll --ci` adds
the CI workflow that makes the same checks hold for pull requests, and
`/oc-enroll --claude-md` writes the repository's verbs into `CLAUDE.md`.

## Registered slash commands

The plugin registers 16 slash commands, one file each in `commands/`:

| Command | Skill owner | Runs |
|---|---|---|
| `/oc-update` | oc-update | update the installed skills and shared runtime |
| `/oc-hindsight` | oc-hindsight | review local learning history |
| `/oc-evolve` | oc-evolve | test a proposed learning rule |
| `/oc-enroll` | oc-bug-check | installs and activates per-repository Git verification |
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

`/oc-enroll` is a repository setup command, not a next-skill handoff target.

**Command coverage.** The first eight shipped in v1.8.2 and cover the edges the
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

Version 2.0 registers `/oc-update`, `/oc-hindsight` and `/oc-evolve` as shown
above. `/oc-enroll` separately sets up commit verification for each repository.

## The gates

**Git `pre-commit` → candidate verification.** Run `/oc-enroll` in each repository.
The packaged installer copies the verifier into the Git common directory, installs
its final commit decision, and activates `.opchain/` only after successful setup.
The runtime remains available if the plugin artifact is later removed.

The verifier checks the actual staged candidate, including partial staging, in an
isolated checkout. Its receipt binds the candidate tree, policy, check results,
and toolchain. Missing checks and unsupported results block the commit. Checks
receive isolated Git metadata and dependencies beside candidate package files.

An existing foreign hook makes enrollment **BLOCKED**, with a nonzero exit and
an explicit integration snippet. It is preserved for deliberate composition;
enrollment must not claim success until the final verifier decision is installed.
The registered plugin hooks are **SessionStart, UserPromptSubmit and Stop**;
none of them gates a tool call. The old `PreToolUse` parser remains a
compatibility test fixture, not an authorization boundary. Git hooks cover
ordinary commits from any agent or terminal.

**Git `post-commit` → bypass record.** Git runs `post-commit` even under
`--no-verify`, so this is where a bypass becomes a fact instead of a convention.
When HEAD's tree has no PASS receipt, the hook asks the runtime to write
`.git/opchain/bypasses/v1/<sha>.json` and append to the bug-check checkpoint's
`skill_state.bypasses`, and prints
`[opchain] ⚠ commit <sha> bypassed the gate — recorded`. The reason is read from
the commit's `Opchain-Bypass:` trailer (`/oc-bugcheck bypass` writes it). Silent
when a receipt covers the tree. It never blocks: a post-commit hook cannot.

**Git `pre-push` → bypass guard.** Reads the refs being pushed, asks the runtime
(`bypass-list`) which outgoing commits have neither a PASS receipt nor an
`Opchain-Bypass:` trailer, and refuses the push while any remain, listing them
with the amend command. Merge commits and commits already on the remote are not
examined. A commit a rebase or cherry-pick rewrote is excused only when the
original it was picked from had a PASS receipt or an `Opchain-Bypass:` trailer;
the reason text in its record proves nothing. If the outgoing range can't be
computed (for example, a force-push over remote commits this clone never
fetched), the push is refused. `OPCHAIN_PUSH_BYPASS=1 git push …` is the loud escape hatch: it prints
what it let through. History that predates enrollment needs it once.
`evidence:pr` lists the same commits in the PR gate, so the count survives the
squash merge that discards the local checkpoint.

**`/oc-enroll --doctor`** is the preflight the 2026-10-08 audit asked for after
counting 14 exit-127 gate runs (vitest, astro, tsc "command not found" from
worktrees whose `node_modules` was a `.vite`-only cache) and six FAILs from a
`.bugcheck.json` with no `verification` block. It installs nothing and prints
PASS/FAIL for: enrollment, the runtime copy (WARN when stale), each managed
hook, the policy's `verification` block, every declared command (resolvable in
`node_modules/.bin` or on PATH; `npm run <script>` must exist in the right
`package.json`), and `node_modules/` validity for the root and every `--prefix`
directory a command names.

**`/oc-enroll --ci`** writes `.github/workflows/opchain-evidence.yml` from
`templates/opchain-evidence.yml` and vendors the verifier (and, when the package
carries it, the `evidence:pr` gate) into `.opchain/runtime/`, so pull requests
run `verify-candidate run` and the Docs/Repo evidence check without the plugin
installed on the runner. It refuses to overwrite an existing workflow without
`--force`. Dependabot pull requests skip the evidence step; the verifier is their
gate. **`/oc-enroll --claude-md`** creates or updates a marked section of
`CLAUDE.md` from `templates/CLAUDE.opchain.md`.

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

**`UserPromptSubmit` → skill router — experimental preview** (`hooks/route-prompt.cjs`).
Asks TypeSafe/Jev which opchain skill, if any, owns the prompt. It is off until
you set `TYPESAFE_API_KEY` (a key from TypeSafe; calls are made under your
TypeSafe account and its terms);
without one the hook exits before any network, git or log work. **Shadow mode
is the default**: with `OPCHAIN_ROUTE_MODE` unset it routes and logs but injects
nothing, from a detached background process, so the prompt never waits on it.
It has an offline eval and a first shadow-period read (2026-10-23: hand-labelled
precision 0.71 against the 0.8 bar for live mode). Whether it changes skill use
can only be measured once suggestions are shown. `OPCHAIN_ROUTE_MODE=live` is
**unsupported** until the shadow-period go/no-go records a GO. Live mode injects the one line the 2026-10-08 audit
measured at 72/72 compliance, with the chosen step's description after the
verb:

```
opchain route (p=0.91): invoke the Skill tool with skill "oc-git-ops" and args "/oc-git-sync" (Full workflow: branch (from convention) → commit → push → PR). Skip this if the request means something else.
```

It never suggests a verb that only prints a skill's command menu (`/oc-git`,
`/oc-deploy` with no step); it stays silent instead. With
`OPCHAIN_ROUTE_AB=1` alongside live mode, only half your sessions (fixed per
session id) get the line; the rest log what they would have got, so
`route:eval -- outcomes` can compare the two.

By default the router sees the prompt and the repository state (branch name,
ahead/behind, dirty count, open PR, enrollment, and, when a core pipeline skill
such as oc-git-ops wrote an in-progress checkpoint in the last 24 hours, that
checkpoint's skill, phase and first next action, up to 200 characters), redacted
for credentials before they are sent to TypeSafe (`api.typesafe.ai`). Names in
the branch or that next action are sent as written. Desktop-app reminder blocks
at the start of a prompt are stripped and not sent; a brief from another
session is reduced to its `Task:` paragraph. It makes up to two requests
per prompt, with decisions cached locally for 24 hours. Conversation context (the previous prompt and
the end of the assistant's last message, ≤400 chars, also redacted) is
**opt-in** with `OPCHAIN_ROUTE_CONTEXT=1` and experimental: on the 2026-10-09
eval it cut precision from 0.81 to 0.51, because bare "yes" / "go" after a PR
or deploy turn became suggestions. It suggests nothing below p = min(top, fits, gate) 0.6, and only skills on the evidence
allowlist (`suggestAllow` in `hooks/route-spec.json`) unless you name the skill
yourself; a typed `/oc-*` command routes without a model call, unless it is
negated ("don't run /oc-deploy"), asked about, or part of a path.
Every routed prompt is logged to `$TMPDIR/opchain-route-log.jsonl`, and on the
next prompt the hook adds a bounded outcome record for the previous one (what
was suggested, which skills and git/deploy commands followed in the reply turn).
`npm run route:eval -- outcomes` turns that log into the day-8 go/no-go for
switching to live. It rescores each routed prompt from the session transcripts,
subagents included, and falls back to the hook's record only when a transcript
is gone. Hand labels in `route-labels.jsonl` beside the log override its proxy
(`route:eval -- label --list`, then `label <session> <hash> <skill|none|ambiguous>`),
and live mode needs every suggestion labelled
(`docs/runbooks/skill-router-eval.md` §6 in the source repo). Needs
`TYPESAFE_API_KEY`; silent without it, outside opchain projects, on slash
commands, and on any failure. `OPCHAIN_ROUTE=0` disables it.

The router's transport, redaction and answer readers are the shared Jev client
(`hooks/lib/jev-client.cjs`), re-exported by `hooks/lib/route-dispatch.cjs`
unchanged. Beside `hooks/route-spec.json` ships `hooks/jev-questions.json`, the
generated registry of Jev uses (the router is J1; the others are eval-only or
planned and have no caller in the plugin). Both files are generated by
`scripts/gen-route-spec.mjs` in the source repo and drift-checked together;
`route:eval -- jev <use>` scores a use against its gold set
(`docs/plans/2026-10-24-jev-integration-plan.md` in the source repo).

**`Stop` → what to run next** (`hooks/next-suggestion.cjs`). When a skill
finishes, names the next one — as something you can type:

```
opchain · next → /oc-deploy   (oc-code-auditor just wrote a checkpoint: hand off to oc-deploy-ops for staging)
```

The target is the first opchain skill the action names, other than the one that
just finished. If that skill has a registered command, the notice shows the
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

- **Native session hooks require Claude Code.** Git commit verification works
  for ordinary commits through the enrolled repository regardless of agent.
  Protected CI must independently verify the received commit; local receipts are
  not a remote trust boundary.
- **Enforcement is gate edges only.** A hook can intercept `git commit`. Nothing
  intercepts "you are about to design a screen, consult ux-engineer" — there is
  no tool call to hang it on. Composition skills stay user-invoked. The Stop hook
  *suggests* them and the commands make them typeable, which moves invocation
  from the 5.4% lane to the 66% lane — but a suggestion is not a gate, and this
  README will not pretend otherwise.
- **The suggestion needs a checkpoint to fire.** It keys off checkpoint writes,
  so a skill that finishes without writing one is invisible to it. That is the
  same coverage gap the checkpoint protocol has always had, not a new one.
- **`git commit --no-verify` still skips the pre-commit gate.** What it no
  longer does is disappear: `post-commit` records it and `pre-push` refuses it
  until it carries an `Opchain-Bypass:` trailer. A user with repository access
  can still delete the hooks or set `OPCHAIN_PUSH_BYPASS=1`; both leave the
  commit without a receipt, which `evidence:pr` and the consumer CI workflow
  report. Local hooks cannot produce a trusted CI result.
- **A rebase voids receipts.** Receipts bind to trees; a rebased commit has a
  new tree and no receipt. The hooks record the rewrite and excuse it on push;
  CI re-verifies the received head. Rebinding evidence to the merge-base
  projection is tracked separately (audit I-05).

## Testing

```
node hooks/test-gate.cjs        # compatibility parser cases (not registered enforcement)
node hooks/test-suggestion.cjs  # 19 cases — next-skill suggestion
```

The harness distinguishes ALLOW from CRASHED — a hook that throws writes nothing
to stdout, and "nothing on stdout" is how a hook says *allow*. A broken gate looks
exactly like a passing one. That fail-open silently neutered this gate for its
first three test runs; the suite exists so it cannot happen again.
