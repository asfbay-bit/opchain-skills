#!/usr/bin/env node
// opchain plugin — PreToolUse(Bash) gate on `git commit`.
//
// This is the one mechanism in opchain that makes a check run without the user
// asking for it by name. Skill-description matching produced zero autonomous
// invocations across 87 measured transcripts; a PreToolUse deny produces 100%,
// because it is not a suggestion.
//
// ── v2, after an adversarial audit found five real bypasses in v1 ────────────
// Every fix below has a reproduction in test-gate.cjs. The v1 defects were:
//
//   GATE-01  `git commit -a`, `-am`, `<pathspec>`, and `git add -A && commit`
//            all defeated the tree binding, because `git write-tree` hashes the
//            index as it stands BEFORE the command runs — and those forms stage
//            their content afterwards. Verified: an `eval(process.env.PAYLOAD)`
//            appended to a tracked file committed cleanly past a green gate.
//            Fixed by computing the PROSPECTIVE tree (what the commit will
//            actually contain) in a scratch index.
//   GATE-01b `--no-verify` was matched against the raw command, so a commit
//            *message* mentioning it disabled the gate. Fixed by matching the
//            quote-stripped string, in argument position.
//   GATE-03  Any uncaught throw produced empty stdout, and empty stdout means
//            ALLOW. `JSON.parse("null")` reached a property access and did
//            exactly that. Fixed by a top-level handler that denies.
//   GATE-04  `git -C <dir> commit` and `sh -c '…'` were not detected, because
//            options taking a separate value token broke the matcher. `git -C`
//            is how an agent commits from a worktree. Fixed.
//   GATE-05  A checkpoint with no `updated_at` skipped the freshness backstop,
//            so the cheapest forgery was `{"last_run_verdict":"PASS"}` with no
//            timestamp at all. Fixed by denying when the time is unknowable.
//
// The through-line: every one of these failed OPEN. A gate whose error path is
// "allow" is a formality, not a gate. Hence rule 0.
//
// Rules:
//   0. FAIL CLOSED. Any state we cannot evaluate is a deny, never an allow.
//   1. NODE, NOT BASH+JQ. The repo-local ancestor soft-skips when `jq` is
//      missing, so a fresh container silently has no gate. Node always exists.
//   2. VERDICTS BOUND TO CONTENT. `write_checkpoint` is a public MCP tool and
//      the agent authors the file, so a bare `verdict: PASS` is self-attestation.
//      Binding it to a tree hash makes a stale or forged PASS NON-MATCHING.
//   3. OPT-IN PER REPO. Plugins install globally. A gate that denies commits in
//      unrelated repos gets uninstalled, taking the protection with it.
//   4. UNSUPPORTED != PASS. A gate that could not read your stack must not
//      report green.
//
// Contract: stdin is the hook JSON; stdout is either nothing (allow) or a
// PreToolUse deny object; exit 0 either way.

"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawnSync } = require("child_process");

const FRESH_MS = 10 * 60 * 1000;

function allow() {
  process.exit(0);
}

function deny(reason) {
  process.stdout.write(
    JSON.stringify({
      hookSpecificOutput: {
        hookEventName: "PreToolUse",
        permissionDecision: "deny",
        permissionDecisionReason: reason,
      },
    }),
  );
  process.exit(0);
}

// RULE 0. Without this, any thrown error exits non-zero with empty stdout —
// which the hook contract reads as "allow". v1 shipped that hole (GATE-03).
process.on("uncaughtException", (e) => {
  deny(
    `opchain: the commit gate errored (${e && e.message}) and refuses to allow an ` +
      "unverified commit. This is a bug in the gate — please report it. To proceed " +
      "anyway: `git commit --no-verify`.",
  );
});

function git(args, cwd, env) {
  const r = spawnSync("git", args, {
    cwd,
    encoding: "utf8",
    env: env ? { ...process.env, ...env } : process.env,
  });
  return r.status === 0 ? (r.stdout || "").trim() : null;
}

// ── parse hook input ────────────────────────────────────────────────────────
let input;
try {
  input = JSON.parse(fs.readFileSync(0, "utf8") || "{}");
} catch {
  allow(); // malformed harness input is not the user's problem
}
if (!input || typeof input !== "object" || input.tool_name !== "Bash") allow();

const rawCommand = String((input.tool_input && input.tool_input.command) || "");

// Quoted literals are data, not syntax. Strip them ONCE and use the result for
// every structural decision — v1 stripped for the commit match but not for the
// bypass match, so a commit message could turn the gate off (GATE-01b).
//
// Neutralise backslash-escaped quotes FIRST. `-m "he said \" --no-verify \""` is
// one bash argument, but a naive `"[^"]*"` span ends at the inner escaped quote
// and leaves `--no-verify` exposed in `stripped` (GATE-01b, round 2). Replacing
// `\"` and `\'` with a placeholder before the quote pass keeps escaped quotes
// as message content, not span boundaries.
const stripped = rawCommand
  .replace(/\\\n/g, " ")
  .replace(/\\["']/g, "\x00")
  .replace(/'[^']*'|"[^"]*"/g, "");

/**
 * Does this command actually INVOKE `git commit`?
 *
 * Substring matching is wrong and harmful: it blocks `echo "git commit"`,
 * heredocs, and `grep -r 'git commit' docs/`. (The repo-local ancestor does
 * exactly that, and it blocked this file's own test runs twice.) False
 * positives teach people to bypass, which costs the true positives too.
 *
 * So: `git` must be in command position — start of string, or after a shell
 * separator or group opener — and `commit` must be its subcommand. Global
 * options taking a SEPARATE value token (`-C <dir>`, `-c <k=v>`) are consumed
 * explicitly; v1 missed those (GATE-04).
 */
const CMD_POS = String.raw`(?:^|[;&|\n(){]|&&|\|\||\bdo\b|\bthen\b|\belse\b)`;
const ENVPFX = String.raw`(?:[A-Za-z_][A-Za-z0-9_]*=\S*\s+)*`;
// Prefix commands that exec git transparently — `nice git`, `stdbuf -oL git`,
// `time git`, `flock /l git`, `xargs git`. Allow a bounded chain of them, each
// with its own flags/one value, between command position and git (GATE-04 r2).
const PREFIX = String.raw`(?:(?:nice|stdbuf|time|setsid|flock|ionice|timeout|env|command|sudo|nohup|xargs)(?:\s+-\S+|\s+[^\s-]\S*)*\s+)*`;
// `git`, or an absolute/relative path to it (`/usr/bin/git`) — GATE-04 r2.
const GIT = String.raw`(?:[^\s;&|()]*/)?git`;
const GITOPT = String.raw`(?:(?:-[cC]|--git-dir|--work-tree|--namespace|--exec-path)\s+\S+\s+|-[^\s]+\s+|--\S+\s+)*`;
const GIT_COMMIT = new RegExp(`${CMD_POS}\\s*${ENVPFX}${PREFIX}${GIT}\\s+${GITOPT}commit(?![-\\w])`);

// Wrappers that execute a nested command string (`sh -c '…'`, `eval "…"`).
// That text lives INSIDE quotes, so `stripped` deleted it. For these, re-scan a
// variant where the quote characters become whitespace — keeping the nested
// command as syntax rather than discarding it as data. Scoped to wrapper
// commands only, so an ordinary `-m "…"` message is still treated as data.
const WRAPPER = /(?:^|[;&|\n(){]|&&|\|\|)\s*(?:sh|bash|zsh|env|eval|xargs|command|sudo|timeout|nohup)\b/;
const unquoted = rawCommand.replace(/\\\n/g, " ").replace(/['"]/g, " ");

// Inside a wrapper's argument the nested command follows `-c` and whitespace,
// not a shell separator, so the strict command-position anchor cannot match.
// Having already established this IS a wrapper invocation, accept `git … commit`
// at any whitespace boundary within it.
const GIT_COMMIT_LOOSE = new RegExp(String.raw`(?:^|\s)${ENVPFX}${PREFIX}${GIT}\s+${GITOPT}commit(?![-\w])`);

if (
  !(
    GIT_COMMIT.test(stripped) ||
    (WRAPPER.test(stripped) && GIT_COMMIT_LOOSE.test(unquoted))
  )
) {
  allow();
}

const cwd = input.cwd || process.cwd();
const repoRoot = git(["rev-parse", "--show-toplevel"], cwd) || cwd;

/** Only gate repos that asked for it — rule 3. */
if (
  !(
    process.env.OPCHAIN_GATE === "1" ||
    fs.existsSync(path.join(repoRoot, ".checkpoints")) ||
    fs.existsSync(path.join(repoRoot, ".opchain"))
  )
) {
  allow();
}

// Explicit, logged bypass — matched on `stripped`, in argument position, so a
// commit message mentioning the flag cannot trigger it (GATE-01b).
if (/(?:^|\s)(?:--no-verify|OPCHAIN_BYPASS=1)(?:\s|$)/.test(stripped)) {
  process.stderr.write("[opchain] ⚠ commit gate bypassed explicitly (--no-verify / OPCHAIN_BYPASS=1)\n");
  allow();
}

// ── read the bug-check verdict ──────────────────────────────────────────────
const cpPath = path.join(repoRoot, ".checkpoints", "oc-bug-check.checkpoint.json");

const INVOKE =
  'Run the gate, then retry:\n\n    Skill(skill="oc-bug-check", args="/oc-bugcheck run")\n\n' +
  "If it returns PASS the commit proceeds. If FAIL, fix what it surfaces. If\n" +
  "UNSUPPORTED, the gate could not read this stack — that is not a pass; either\n" +
  "add stack support or bypass deliberately with `git commit --no-verify`.";

if (!fs.existsSync(cpPath)) {
  deny(`opchain: oc-bug-check has not run in this repo, so this commit is unverified.\n\n${INVOKE}`);
}

let cp;
try {
  cp = JSON.parse(fs.readFileSync(cpPath, "utf8"));
} catch (e) {
  deny(`opchain: .checkpoints/oc-bug-check.checkpoint.json is not valid JSON (${e.message}).\n\n${INVOKE}`);
}
if (!cp || typeof cp !== "object" || Array.isArray(cp)) {
  deny(`opchain: .checkpoints/oc-bug-check.checkpoint.json is not a JSON object.\n\n${INVOKE}`);
}

const st = (cp.skill_state && typeof cp.skill_state === "object" && cp.skill_state) || {};
const verdict = String(st.last_run_verdict || st.verdict || "").toUpperCase();

if (verdict === "UNSUPPORTED") {
  deny(
    "opchain: oc-bug-check returned UNSUPPORTED — it did not recognize this stack,\n" +
      "so types, lint, tests and build were never run. An absence of findings is not\n" +
      "a pass.\n\nAdd stack support (skills/oc-bug-check/SKILL.md § Stack-Specific\n" +
      "Adaptations) or bypass deliberately with `git commit --no-verify`.",
  );
}
if (verdict !== "PASS") {
  deny(`opchain: last oc-bug-check verdict was ${verdict || "(none recorded)"}, not PASS.\n\n${INVOKE}`);
}

const verifiedTree = st.verified_tree || st.verified_for_tree || null;

// ── freshness: an unknowable time is not freshness (GATE-05) ────────────────
const ts = Date.parse(cp.updated_at || "");
if (Number.isNaN(ts)) {
  deny(
    "opchain: the oc-bug-check checkpoint records a PASS but no readable `updated_at`,\n" +
      "so there is no way to tell when — or whether — it ran.\n\n" +
      INVOKE,
  );
}
if (!verifiedTree && Math.abs(Date.now() - ts) > FRESH_MS) {
  const mins = Math.floor(Math.abs(Date.now() - ts) / 60000);
  deny(
    `opchain: oc-bug-check passed ${mins}m ago and recorded no tree hash, so there is\n` +
      "no way to tell whether it covered the code you are committing.\n\n" +
      INVOKE,
  );
}

// ── bind the verdict to the FULL working-tree state ─────────────────────────
/**
 * v2 tried to PREDICT what a command would stage — parse the shell, classify
 * `-a` vs pathspec vs `git add … &&`, hash a matching scratch index. A re-audit
 * broke it three ways in a day (`git add <path> && commit`, `-C <ref>`,
 * `--fixup`). Predicting arbitrary bash with a regex is unwinnable, and every
 * missed form fails OPEN.
 *
 * v3 stops predicting. It binds the PASS to the ENTIRE current state of the
 * repo — every tracked modification and every untracked, non-ignored file —
 * computed as `git add -A` in a throwaway index. The invariant:
 *
 *     if the full working state equals what oc-bug-check verified, then NO
 *     commit form can introduce unverified content, because there is none
 *     present to introduce — staged, unstaged, or brand-new.
 *
 * This is airtight against `-a`, `-am`, pathspecs, `git add <anything> &&`,
 * `--fixup`, and forms not yet invented, because it never inspects the command
 * at all. The cost is a stricter contract: the tree must be clean relative to
 * what was verified. That is the honest meaning of "bug-check passed on this
 * code" — and oc-bug-check records `verified_tree` the same way (`git add -A`),
 * so a plain `/oc-bugcheck` run followed by an immediate commit still passes.
 */
function fullWorkingTree() {
  const scratch = path.join(os.tmpdir(), `opchain-idx-${process.pid}-${Date.now()}`);
  try {
    const rel = git(["rev-parse", "--git-path", "index"], repoRoot);
    const realIdx = rel && path.isAbsolute(rel) ? rel : path.join(repoRoot, rel || ".git/index");
    if (fs.existsSync(realIdx)) fs.copyFileSync(realIdx, scratch);
    const env = { GIT_INDEX_FILE: scratch }; // isolates all writes from the real index
    if (!fs.existsSync(scratch) && git(["read-tree", "HEAD"], repoRoot, env) === null) return null;
    if (git(["add", "-A", "--", "."], repoRoot, env) === null) return null;
    return git(["write-tree"], repoRoot, env);
  } finally {
    try {
      fs.rmSync(scratch, { force: true });
    } catch {
      /* scratch cleanup is best-effort */
    }
  }
}

if (verifiedTree) {
  const actual = fullWorkingTree();

  // RULE 0: if we cannot hash the state, we cannot claim it was verified.
  if (!actual) {
    deny(
      "opchain: could not hash the working tree (unmerged index, index.lock held, or\n" +
        "git unavailable), so the recorded PASS cannot be bound to this commit. Resolve\n" +
        "the repo state and retry, or bypass with `git commit --no-verify`.",
    );
  }

  if (verifiedTree !== actual) {
    deny(
      "opchain: the repo has changed since oc-bug-check passed, so the PASS does not\n" +
        "cover what you are about to commit.\n\n" +
        `    verified:      ${String(verifiedTree).slice(0, 12)}\n` +
        `    working tree:  ${String(actual).slice(0, 12)}\n\n` +
        "Some tracked or untracked file differs from the state that was checked. Re-run\n" +
        "the gate so the verdict covers the current code:\n\n" +
        INVOKE,
    );
  }
}

allow();
