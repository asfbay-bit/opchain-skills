#!/usr/bin/env node
// Test harness for the opchain PreToolUse commit gate.
//
// Two properties this harness MUST have, both learned the hard way:
//
//  1. ALLOW vs CRASHED must be distinguishable. A hook that throws writes
//     nothing to stdout, and "nothing on stdout" is how a hook says *allow*.
//     So a broken gate looks exactly like a passing one. That fail-open
//     silently neutered this gate for its first three runs (it was named .sh
//     under `"type": "module"`, so node refused to load it at all).
//
//  2. Fixtures must be HERMETIC. v1 of this harness pointed its DENY cases at
//     the live repo root. That repo later grew a real passing checkpoint, the
//     gate correctly allowed, and all four DENY cases inverted — the suite went
//     red for a reason that had nothing to do with the gate. A test whose
//     verdict depends on unrelated repo state cannot be trusted in either
//     direction. Every case below builds its own scratch repo.
//
// Run: node plugins/opchain/hooks/test-gate.cjs

"use strict";
const { spawnSync } = require("child_process");
const path = require("path");
const fs = require("fs");
const os = require("os");

const GATE = path.join(__dirname, "pre-commit-gate.cjs");
const GC = "git " + "commit"; // split so this file's text can't trip a live gate
const scratches = [];

function sh(args, cwd, env) {
  return spawnSync("git", args, { cwd, encoding: "utf8", env: { ...process.env, ...(env || {}) } });
}

/**
 * Build an isolated repo.
 *   opts.enrolled  — create .checkpoints/ (opt-in marker)
 *   opts.verdict   — last_run_verdict to record (null = no checkpoint file)
 *   opts.bindTree  — true: bind to the real index tree; "wrong": a bogus hash
 *   opts.ageMin    — how long ago the run was, in minutes
 *   opts.dirty     — modify a TRACKED file without staging
 *   opts.untracked — add a new untracked file
 *   opts.raw       — write this exact string as the checkpoint body
 */
function mkRepo(opts = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "oc-gate-"));
  scratches.push(dir);
  sh(["init", "-q", "-b", "main"], dir);
  sh(["config", "user.email", "t@t"], dir);
  sh(["config", "user.name", "t"], dir);
  fs.writeFileSync(path.join(dir, "app.js"), "reviewed();\n");
  fs.writeFileSync(path.join(dir, ".gitignore"), ".checkpoints/\n");
  sh(["add", "-A"], dir);
  sh(["-c", "core.hooksPath=/dev/null", "commit", "-qm", "init"], dir);

  if (opts.enrolled !== false) fs.mkdirSync(path.join(dir, ".checkpoints"), { recursive: true });

  if (opts.verdict || opts.raw) {
    const cpFile = path.join(dir, ".checkpoints", "oc-bug-check.checkpoint.json");
    if (opts.raw !== undefined) {
      fs.writeFileSync(cpFile, opts.raw);
    } else {
      // Bind to the FULL working-tree state, the same way the gate computes it
      // (v3). In a fully-committed fixture this equals the index tree; for
      // dirty/untracked fixtures it differs, which is exactly what should DENY.
      const idx = path.join(os.tmpdir(), `oc-fx-${process.pid}-${Math.random().toString(36).slice(2)}`);
      const scEnv = { GIT_INDEX_FILE: idx };
      try {
        const realIdx = path.join(dir, ".git", "index");
        if (fs.existsSync(realIdx)) fs.copyFileSync(realIdx, idx);
        sh(["add", "-A", "--", "."], dir, scEnv);
        var tree = sh(["write-tree"], dir, scEnv).stdout.trim();
      } finally {
        fs.rmSync(idx, { force: true });
      }
      const at = new Date(Date.now() - (opts.ageMin || 0) * 60000).toISOString();
      const st = { last_run_verdict: opts.verdict };
      if (opts.bindTree === true) st.verified_tree = tree;
      if (opts.bindTree === "wrong") st.verified_tree = "0".repeat(40);
      fs.writeFileSync(cpFile, JSON.stringify({ updated_at: at, skill_state: st }, null, 2));
    }
  }

  // Post-checkpoint mutations: the gate must notice these.
  if (opts.dirty) fs.appendFileSync(path.join(dir, "app.js"), "eval(process.env.PAYLOAD);\n");
  if (opts.untracked) fs.writeFileSync(path.join(dir, "evil.js"), "exfiltrate();\n");
  return dir;
}

function run(command, cwd, toolName = "Bash") {
  const payload = JSON.stringify({ tool_name: toolName, tool_input: { command }, cwd });
  // Scrub gate-relevant ambient vars (OC-04 r2): OPCHAIN_GATE=1 exported in a
  // dev/CI shell would flip the "unenrolled repo" case to DENY and falsely red
  // the suite — the exact non-hermeticity this harness exists to prevent.
  const env = { ...process.env };
  delete env.OPCHAIN_GATE;
  delete env.OPCHAIN_BYPASS;
  const r = spawnSync("node", [GATE], { input: payload, encoding: "utf8", env });
  if (r.status !== 0 || r.error) {
    return { verdict: "CRASHED", detail: (r.stderr || "").split("\n")[0].slice(0, 80) };
  }
  const out = (r.stdout || "").trim();
  if (!out) return { verdict: "ALLOW", detail: "" };
  try {
    const d = JSON.parse(out).hookSpecificOutput;
    return {
      verdict: d.permissionDecision === "deny" ? "DENY" : "ALLOW",
      detail: (d.permissionDecisionReason || "").split("\n")[0].slice(0, 58),
    };
  } catch {
    return { verdict: "MALFORMED", detail: out.slice(0, 58) };
  }
}

// ── fixtures ────────────────────────────────────────────────────────────────
const clean = mkRepo({ verdict: "PASS", bindTree: true });          // honest fresh PASS
const dirty = mkRepo({ verdict: "PASS", bindTree: true, dirty: true });   // tracked file changed after the run
const untrk = mkRepo({ verdict: "PASS", bindTree: true, untracked: true });
const failed = mkRepo({ verdict: "FAIL" });
const unsupported = mkRepo({ verdict: "UNSUPPORTED" });
const noCp = mkRepo({});
const notEnrolled = mkRepo({ enrolled: false });
const wrongTree = mkRepo({ verdict: "PASS", bindTree: "wrong" });
const staleNoTree = mkRepo({ verdict: "PASS", ageMin: 45 });
const freshNoTree = mkRepo({ verdict: "PASS", ageMin: 1 });
const nullCp = mkRepo({ raw: "null" });
const noTimestamp = mkRepo({ raw: JSON.stringify({ skill_state: { last_run_verdict: "PASS" } }) });

const cases = [
  // matcher precision — false positives train people to bypass
  ["non-git command", "ls -la", clean, "ALLOW"],
  ["echo mentioning phrase", `echo "remember to ${GC}"`, failed, "ALLOW"],
  ["grep for the phrase", `grep -rn '${GC}' docs/`, failed, "ALLOW"],
  ["commit-tree plumbing", "git " + "commit-tree abc", failed, "ALLOW"],
  ["non-Bash tool", GC, failed, "ALLOW", "Read"],

  // verdict states
  ["no checkpoint", `${GC} -m x`, noCp, "DENY"],
  ["FAIL verdict", `${GC} -m x`, failed, "DENY"],
  ["UNSUPPORTED verdict", `${GC} -m x`, unsupported, "DENY"],
  ["unenrolled repo", `${GC} -m x`, notEnrolled, "ALLOW"],
  ["clean PASS, bound", `${GC} -m x`, clean, "ALLOW"],
  ["PASS bound to wrong tree", `${GC} -m x`, wrongTree, "DENY"],

  // GATE-05 — freshness / forgeability
  ["stale PASS, no tree", `${GC} -m x`, staleNoTree, "DENY"],
  ["fresh PASS, no tree", `${GC} -m x`, freshNoTree, "ALLOW"],
  ["PASS with no updated_at", `${GC} -m x`, noTimestamp, "DENY"],

  // GATE-03 — malformed input must not fail open
  ["checkpoint is literal null", `${GC} -m x`, nullCp, "DENY"],

  // GATE-01 — the staging bypasses. THESE ARE THE REGRESSION TESTS.
  // v3 binds to the FULL working state, so any change after the verify denies —
  // even a plain commit with the change unstaged. Stricter than index-only, and
  // sound: a dirty tree means the PASS no longer describes the repo. (v2 allowed
  // this; that weaker contract is what the `git add <path> && commit` bypass
  // exploited.)
  ["dirty tracked + plain", `${GC} -m x`, dirty, "DENY"],
  ["dirty tracked + -a", `${GC} -a -m x`, dirty, "DENY"],
  ["dirty tracked + -am", `${GC} -am x`, dirty, "DENY"],
  ["dirty tracked + --all", `${GC} --all -m x`, dirty, "DENY"],
  ["dirty tracked + pathspec", `${GC} -m x app.js`, dirty, "DENY"],
  ["untracked + add -A chain", `git add -A && ${GC} -m x`, untrk, "DENY"],
  // residuals the re-audit found in v2 — all must DENY now
  ["add <path> && commit (dirty)", `git add app.js && ${GC} -m x`, dirty, "DENY"],
  ["add <newfile> && commit", `git add evil.js && ${GC} -m x`, untrk, "DENY"],

  // GATE-01b — bypass must not match inside a message
  ["message mentions --no-verify", `${GC} -m "docs: the --no-verify hatch"`, failed, "DENY"],
  ["escaped-quote --no-verify msg", `${GC} -m "he said \\" --no-verify \\" ok"`, failed, "DENY"],
  ["genuine --no-verify flag", `${GC} --no-verify -m x`, failed, "ALLOW"],

  // GATE-04 — shell forms
  ["git -C <dir> commit", `git -C ${failed} commit -m x`, failed, "DENY"],
  ["subshell", `(cd ${failed} && ${GC} -m x)`, failed, "DENY"],
  ["sh -c wrapper", `sh -c '${GC} -m x'`, failed, "DENY"],
  // residuals the re-audit found in v2 — prefix commands & absolute path to git
  ["absolute-path git", `/usr/bin/git commit -m x`, failed, "DENY"],
  ["nice git commit", `nice ${GC} -m x`, failed, "DENY"],
  ["stdbuf -oL git commit", `stdbuf -oL ${GC} -am x`, failed, "DENY"],
  ["time git commit", `time ${GC} -m x`, failed, "DENY"],
  ["chained after &&", `git add -A && ${GC} -m x`, failed, "DENY"],
  ["env-var prefix", `GIT_AUTHOR_NAME=x ${GC} -m y`, failed, "DENY"],
];

let failedCount = 0;
console.log("opchain commit-gate — hermetic fixtures\n");
console.log("  CASE                             EXPECT  GOT       NOTE");
console.log("  " + "─".repeat(100));
for (const [name, cmd, cwd, expect, tool] of cases) {
  const { verdict, detail } = run(cmd, cwd, tool);
  const ok = verdict === expect;
  if (!ok) failedCount++;
  console.log(
    `  ${ok ? "✓" : "✗"} ${name.padEnd(31)}${expect.padEnd(8)}${verdict.padEnd(10)}${detail}`,
  );
}

for (const d of scratches) fs.rmSync(d, { recursive: true, force: true });
console.log(`\n  ${cases.length - failedCount}/${cases.length} passed`);
process.exit(failedCount ? 1 : 0);
