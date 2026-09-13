#!/usr/bin/env node
// Test harness for the opchain PreToolUse commit gate.
//
// Three properties this harness MUST have, all learned the hard way:
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
//  3. The DOCS are a fixture too. oc-bug-check's SKILL.md documented the
//     verdict at `skill_state.last_run.verdict` with no tree hash, while this
//     gate read `last_run_verdict` and wanted `verified_tree` — so a skill that
//     followed its own docs was denied by the gate that ships, and nothing here
//     noticed, because every fixture was hand-built in the gate's own shape.
//     The "SKILL.md" cases build their checkpoint from the skill's documented
//     JSON and its documented tree recipe, so the next drift fails this suite.
//
// Run: node plugins/opchain/hooks/test-gate.cjs

"use strict";
const { spawnSync } = require("child_process");
const path = require("path");
const fs = require("fs");
const os = require("os");

const GATE = path.join(__dirname, "pre-commit-gate.cjs");
// The plugin's own materialised copy of the skill (drift-checked against skills/
// in pretest), so this read stays inside the plugin and works in the mirror.
const SKILL_MD = path.join(__dirname, "..", "skills", "oc-bug-check", "SKILL.md");
const GC = "git " + "commit"; // split so this file's text can't trip a live gate
const scratches = [];

function sh(args, cwd, env) {
  return spawnSync("git", args, { cwd, encoding: "utf8", env: { ...process.env, ...(env || {}) } });
}

/**
 * The full working-tree state, hashed the way the gate does (v3): `git add -A`
 * into a scratch copy of the index, minus the bug-check checkpoint (GATE-11).
 * Deliberately independent of SKILL.md — the "SKILL.md" fixtures use the
 * documented recipe instead.
 */
function fullTree(dir) {
  const idx = path.join(os.tmpdir(), `oc-fx-${process.pid}-${Math.random().toString(36).slice(2)}`);
  const scEnv = { GIT_INDEX_FILE: idx };
  try {
    const realIdx = path.join(dir, ".git", "index");
    if (fs.existsSync(realIdx)) fs.copyFileSync(realIdx, idx);
    sh(["add", "-A", "--", "."], dir, scEnv);
    sh(["rm", "--cached", "-f", "-q", "--ignore-unmatch", "--", ".checkpoints/oc-bug-check.checkpoint.json"], dir, scEnv);
    return sh(["write-tree"], dir, scEnv).stdout.trim();
  } finally {
    fs.rmSync(idx, { force: true });
  }
}

/** First ```lang block inside SKILL.md's `heading` section (up to the next ##/### heading). */
function docBlock(heading, lang) {
  const md = fs.readFileSync(SKILL_MD, "utf8");
  const at = md.indexOf(`\n${heading}\n`);
  if (at < 0) throw new Error(`oc-bug-check SKILL.md has no "${heading}" section`);
  const body = md.slice(at + heading.length + 2);
  const next = body.search(/^#{2,3} /m);
  const section = next < 0 ? body : body.slice(0, next);
  const m = section.match(new RegExp("^```" + lang + "\\n([\\s\\S]*?)^```", "m"));
  if (!m) throw new Error(`oc-bug-check SKILL.md "${heading}" has no \`\`\`${lang} block`);
  return m[1];
}

/**
 * A checkpoint written by following SKILL.md literally: its skill_state example
 * with only the run-specific VALUES substituted — the tree printed by its own
 * recipe, and the current time. Nothing the docs omit is added here, so if
 * SKILL.md drops or renames a field the gate needs, the gate denies and the
 * suite fails. That is the whole point of this fixture.
 */
function documentedCheckpoint(dir) {
  const r = spawnSync("sh", ["-c", docBlock("### Commit gate contract", "bash")], { cwd: dir, encoding: "utf8" });
  const tree = (r.stdout || "").trim().split("\n").pop();
  if (!/^[0-9a-f]{40}(?:[0-9a-f]{24})?$/.test(tree || "")) {
    throw new Error(`SKILL.md tree recipe printed no tree hash (exit ${r.status}): ${(r.stderr || r.stdout || "").slice(0, 200)}`);
  }
  const st = JSON.parse(docBlock("### skill_state", "json"));
  const now = new Date().toISOString();
  if ("verified_tree" in st) st.verified_tree = tree;
  if (st.last_run && typeof st.last_run === "object") st.last_run.at = now;
  return { skill: "oc-bug-check", updated_at: now, status: "complete", skill_state: st };
}

/**
 * Build an isolated repo.
 *   opts.enrolled   — create .checkpoints/ (opt-in marker)
 *   opts.wip        — uncommitted work present WHEN THE GATE RAN (an unstaged
 *                     edit + a new file) — the normal case, since you check
 *                     before you commit. Bare `git write-tree` misses all of it.
 *   opts.verdict    — last_run_verdict to record (null = no checkpoint file)
 *   opts.bindTree   — true: bind to the full working tree; "wrong": a bogus hash
 *   opts.ageMin     — how long ago the run was, in minutes
 *   opts.checkpoint — (tree, at, dir) => whole checkpoint, for shapes the
 *                     verdict/bindTree options can't express
 *   opts.documented — write the checkpoint SKILL.md describes (see above)
 *   opts.raw        — write this exact string as the checkpoint body
 *   opts.dirty      — AFTER the run: modify a TRACKED file without staging
 *   opts.untracked  — AFTER the run: add a new untracked file
 *   opts.track      — track .checkpoints/ instead of ignoring it, as
 *                     oc-checkpoint-protocol recommends (GATE-11): "dir" leaves
 *                     it untracked-but-visible; "file" also commits an earlier
 *                     bug-check checkpoint, so the run rewrites a tracked file
 *   opts.stage      — AFTER the checkpoint write: `git add -A` into the real index
 *   opts.otherCheckpoint — AFTER the run: write another skill's tracked checkpoint
 */
function mkRepo(opts = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "oc-gate-"));
  scratches.push(dir);
  sh(["init", "-q", "-b", "main"], dir);
  sh(["config", "user.email", "t@t"], dir);
  sh(["config", "user.name", "t"], dir);
  fs.writeFileSync(path.join(dir, "app.js"), "reviewed();\n");
  fs.writeFileSync(path.join(dir, ".gitignore"), opts.track ? "node_modules/\n" : ".checkpoints/\n");
  if (opts.track === "file") {
    fs.mkdirSync(path.join(dir, ".checkpoints"), { recursive: true });
    fs.writeFileSync(
      path.join(dir, ".checkpoints", "oc-bug-check.checkpoint.json"),
      JSON.stringify({ updated_at: "2026-01-01T00:00:00Z", skill_state: { last_run_verdict: "FAIL" } }),
    );
  }
  sh(["add", "-A"], dir);
  sh(["-c", "core.hooksPath=/dev/null", "commit", "-qm", "init"], dir);

  if (opts.enrolled !== false) fs.mkdirSync(path.join(dir, ".checkpoints"), { recursive: true });

  if (opts.wip) {
    fs.appendFileSync(path.join(dir, "app.js"), "alsoReviewed();\n");
    fs.writeFileSync(path.join(dir, "new.js"), "reviewedToo();\n");
  }

  const cpFile = path.join(dir, ".checkpoints", "oc-bug-check.checkpoint.json");
  if (opts.raw !== undefined) {
    fs.writeFileSync(cpFile, opts.raw);
  } else if (opts.documented) {
    fs.writeFileSync(cpFile, JSON.stringify(documentedCheckpoint(dir), null, 2));
  } else if (opts.verdict || opts.checkpoint) {
    // In a fully-committed fixture the full working tree equals the index tree;
    // for dirty/untracked fixtures it differs, which is exactly what should DENY.
    const tree = fullTree(dir);
    const at = new Date(Date.now() - (opts.ageMin || 0) * 60000).toISOString();
    let cp;
    if (opts.checkpoint) {
      cp = opts.checkpoint(tree, at, dir);
    } else {
      const st = { last_run_verdict: opts.verdict };
      if (opts.bindTree === true) st.verified_tree = tree;
      if (opts.bindTree === "wrong") st.verified_tree = "0".repeat(40);
      cp = { updated_at: at, skill_state: st };
    }
    fs.writeFileSync(cpFile, JSON.stringify(cp, null, 2));
  }

  // Staging after the run: the gate must NOT count this (GATE-11 for the checkpoint).
  if (opts.stage) sh(["add", "-A"], dir);

  // Post-checkpoint mutations: the gate must notice these.
  if (opts.dirty) fs.appendFileSync(path.join(dir, "app.js"), "eval(process.env.PAYLOAD);\n");
  if (opts.untracked) fs.writeFileSync(path.join(dir, "evil.js"), "exfiltrate();\n");
  if (opts.otherCheckpoint) {
    fs.writeFileSync(path.join(dir, ".checkpoints", "oc-release-ops.checkpoint.json"), '{"step":"after the run"}\n');
  }
  return dir;
}

function run(command, cwd, toolName = "Bash", extraEnv = {}) {
  const payload = JSON.stringify({ tool_name: toolName, tool_input: { command }, cwd });
  // Scrub gate-relevant ambient vars (OC-04 r2): OPCHAIN_GATE=1 exported in a
  // dev/CI shell would flip the "unenrolled repo" case to DENY and falsely red
  // the suite — the exact non-hermeticity this harness exists to prevent.
  const env = { ...process.env };
  delete env.OPCHAIN_GATE;
  delete env.OPCHAIN_BYPASS;
  Object.assign(env, extraEnv);
  // An overrun is a CRASH, not a verdict: the harness kills a hook that exceeds
  // its timeout, and a killed hook writes no deny (GATE-07).
  const r = spawnSync("node", [GATE], { input: payload, encoding: "utf8", env, timeout: 5000 });
  if (r.status !== 0 || r.error) {
    return { verdict: "CRASHED", detail: (r.error ? String(r.error.code) : r.stderr || "").split("\n")[0].slice(0, 80) };
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
const arrayCp = mkRepo({ raw: JSON.stringify([{ skill_state: { last_run_verdict: "PASS" } }]) });
const invalidCp = mkRepo({ raw: "{ not json" });

// Enrolment: a repo is gated when it has .checkpoints/ or .opchain/, or OPCHAIN_GATE=1
const optedByOpchain = (() => {
  const dir = mkRepo({ enrolled: false });
  fs.mkdirSync(path.join(dir, ".opchain"));
  return dir;
})();
const flatVerdict = mkRepo({ // skill_state.verdict is read as an alias of last_run_verdict
  checkpoint: (tree, at) => ({ updated_at: at, skill_state: { verdict: "PASS", verified_tree: tree } }),
});
const aliasBound = mkRepo({ // verified_for_tree is read as an alias of verified_tree
  checkpoint: (tree, at) => ({ updated_at: at, skill_state: { last_run_verdict: "PASS", verified_for_tree: tree } }),
});
const noTimestamp = mkRepo({ raw: JSON.stringify({ skill_state: { last_run_verdict: "PASS" } }) });

// GATE-06 — the shapes that actually occur in the wild
const legacyNoTree = mkRepo({ // what the retired repo-local gate accepted
  ageMin: 1,
  checkpoint: (_tree, at) => ({ updated_at: at, skill_state: { last_run: { at, verdict: "PASS" } } }),
});
const legacyTopTree = mkRepo({ // tree recorded, but not where the gate reads it
  checkpoint: (tree, at) => ({ updated_at: at, verified_tree: tree, skill_state: { last_run: { at, verdict: "PASS" } } }),
});
const legacyBound = mkRepo({
  checkpoint: (tree, at) => ({ updated_at: at, skill_state: { last_run: { at, verdict: "PASS" }, verified_tree: tree } }),
});
const conflicting = mkRepo({ // a stale flat PASS must not outvote the run that just failed
  checkpoint: (tree, at) => ({
    updated_at: at,
    skill_state: { last_run_verdict: "PASS", last_run: { at, verdict: "FAIL" }, verified_tree: tree },
  }),
});
const bareWriteTree = mkRepo({ // the old slash-command instruction: index tree, not working tree
  wip: true,
  checkpoint: (_tree, at, dir) => ({
    updated_at: at,
    skill_state: { last_run_verdict: "PASS", verified_tree: sh(["write-tree"], dir).stdout.trim() },
  }),
});
const documented = mkRepo({ documented: true, wip: true });
const documentedDrift = mkRepo({ documented: true, wip: true, dirty: true });

// GATE-11 — a repo that tracks .checkpoints/, as oc-checkpoint-protocol recommends
const trackedNew = mkRepo({ track: "dir", verdict: "PASS", bindTree: true });
const trackedRewrite = mkRepo({ track: "file", verdict: "PASS", bindTree: true });
const trackedStaged = mkRepo({ track: "file", verdict: "PASS", bindTree: true, stage: true });
const trackedDocumented = mkRepo({ track: "file", documented: true, wip: true });
const trackedDirty = mkRepo({ track: "dir", verdict: "PASS", bindTree: true, dirty: true });
const trackedOtherCp = mkRepo({ track: "dir", verdict: "PASS", bindTree: true, otherCheckpoint: true });

// GATE-07 — a hook payload whose command is a commit, carried as data by a dry run
const dryRunPayload = JSON.stringify({ tool_name: "Bash", tool_input: { command: `${GC} -F msg.txt` }, cwd: "/x" });

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

  // GATE-05 — forgeability
  ["PASS with no updated_at", `${GC} -m x`, noTimestamp, "DENY"],

  // GATE-06 — the tree is mandatory at every age, and the documented schema is
  // the one that passes. "fresh PASS, no tree" was ALLOW until 2026-09-11: the
  // 10-minute tree-less window, in which a PASS covered edits made after it.
  ["stale PASS, no tree", `${GC} -m x`, staleNoTree, "DENY"],
  ["fresh PASS, no tree", `${GC} -m x`, freshNoTree, "DENY"],
  ["last_run.verdict only, no tree", `${GC} -m x`, legacyNoTree, "DENY"],
  ["tree at checkpoint top level", `${GC} -m x`, legacyTopTree, "DENY"],
  ["last_run.verdict only, bound", `${GC} -m x`, legacyBound, "ALLOW"],
  ["verdict fields disagree", `${GC} -m x`, conflicting, "DENY"],
  ["bare write-tree over WIP", `${GC} -am x`, bareWriteTree, "DENY"],
  ["SKILL.md schema + recipe", `${GC} -am x`, documented, "ALLOW"],
  ["SKILL.md schema, then edited", `${GC} -am x`, documentedDrift, "DENY"],

  // GATE-11 — tracking .checkpoints/ must not deadlock the tree binding. Each
  // ALLOW here was a permanent DENY before: the run hashed the tree, then wrote
  // the checkpoint carrying that hash, and the write moved the tree.
  ["tracked .checkpoints/, new PASS", `${GC} -m x`, trackedNew, "ALLOW"],
  ["tracked checkpoint rewritten", `${GC} -am x`, trackedRewrite, "ALLOW"],
  ["tracked checkpoint, staged", `git add -A && ${GC} -m x`, trackedStaged, "ALLOW"],
  ["SKILL.md recipe, tracked cp", `${GC} -am x`, trackedDocumented, "ALLOW"],
  // …and that one file is the only exemption
  ["tracked, code edited after", `${GC} -am x`, trackedDirty, "DENY"],
  ["tracked, other cp edited after", `${GC} -am x`, trackedOtherCp, "DENY"],

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

  // GATE-07 — the wrapper re-scan covers only what the wrapper can execute. The
  // first case is the Bash call denied on 2026-09-11: a dry run piping a JSON
  // payload into this gate, then an unrelated `sh -c` on the next line.
  ["JSON dry run + unrelated sh -c", `printf '%s' '${dryRunPayload}' | node plugins/opchain/hooks/pre-commit-gate.cjs\nsh -c "$RECIPE" | tail -1`, failed, "ALLOW"],
  ["quoted phrase ; sh -c", `echo '${GC}' ; sh -c 'ls'`, failed, "ALLOW"],
  ["env | grep phrase", `env | grep '${GC}'`, failed, "ALLOW"],
  ["sh -c piped out to grep phrase", `sh -c 'ls' | grep '${GC}'`, failed, "ALLOW"],
  ["bash -c wrapper", `bash -c "${GC} -am x"`, failed, "DENY"],
  ["eval wrapper", `eval "${GC} -m x"`, failed, "DENY"],
  ["sh -c, then a bare commit", `sh -c 'echo hi'; ${GC} -m x`, failed, "DENY"],
  ["separator inside -c string", `bash -c "cd /tmp && ${GC} -m x"`, failed, "DENY"],
  ["wrapper on a later line", `ls\nbash -c '${GC} -m x'`, failed, "DENY"],
  ["redirect before eval arg", `eval &>/dev/null "${GC} -m x"`, failed, "DENY"],
  ["; inside $(…) given to eval", `eval $(printf x; echo ${GC} -m y)`, failed, "DENY"],
  // stdin carries commands: the scope widens to what feeds the wrapper
  ["piped into sh", `echo '${GC} -m x' | sh`, failed, "DENY"],
  ["subshell piped into sh", `(echo '${GC} -m x') | sh`, failed, "DENY"],
  ["here-doc into bash", `bash <<'EOF'\n"git" commit -m x\nEOF`, failed, "DENY"],
  // the wrapper anchor was looser than git's — each of these ran a commit
  ["env-prefixed bash -c", `GIT_AUTHOR_NAME=x bash -c '${GC} -m y'`, failed, "DENY"],
  ["absolute-path sh -c", `/bin/sh -c '${GC} -m x'`, failed, "DENY"],
  ["nice sh -c", `nice sh -c '${GC} -m x'`, failed, "DENY"],
  ["then sh -c", `if true; then sh -c '${GC} -m x'; fi`, failed, "DENY"],
  // prefix backtracking: 26 words outran the 10s hook timeout before the fix
  ["40 prefix words, no commit", `${"time ".repeat(40)}ls ; sh -c 'ls'`, failed, "ALLOW"],
  ["40 prefix words, then commit", `${"time ".repeat(40)}${GC} -m x`, failed, "DENY"],
  // quote spans follow bash: nothing escapes inside '…', and `\\` inside "…" is one char
  ["\\' does not escape in '…'", `echo 'a\\' ; ${GC} -m x ; echo ''`, failed, "DENY"],
  ["\\\\ before closing \"", `echo "a\\\\" ; ${GC} -m x ; echo ""`, failed, "DENY"],
  ["dq JSON dry run ; sh -c", `printf "%s" "{\\"command\\":\\"${GC} -m x\\"}" | node gate.cjs ; sh -c 'ls'`, failed, "ALLOW"],

  // GATE-08 — bash reads inside quotes, so the gate must. Every DENY below ran a
  // real commit past the gate on 2026-09-11, and `bash -n` accepts each one.
  // A substitution runs inside double quotes and unquoted here-documents.
  ["$(…) inside double quotes", `echo "$(${GC} -m x)"`, failed, "DENY"],
  ["backtick substitution", "echo `" + GC + " -m x`", failed, "DENY"],
  ["backtick inside double quotes", 'echo "`' + GC + ' -m x`"', failed, "DENY"],
  ["$(…) holding its own quotes", `echo "$(echo ")" ; ${GC} -m x ; echo "(")"`, failed, "DENY"],
  ["${x:-$(…)} in double quotes", `echo "\${x:-$(${GC} -m x)}"`, failed, "DENY"],
  ["$(…) in unquoted here-doc", `cat <<EOF\n"$(${GC} -m x)"\nEOF`, failed, "DENY"],
  ["backtick in unquoted here-doc", "cat <<EOF\n`" + GC + " -m x`\nEOF", failed, "DENY"],
  ["here-doc | sh inside \"$(…)\"", `echo "$(cat <<EOF | sh\n${GC} -m x\nEOF\n)"`, failed, "DENY"],
  // quote removal happens before the command is looked up
  ["\\git", `\\${GC} -m x`, failed, "DENY"],
  ["\"git\"", `"git" commit -m x`, failed, "DENY"],
  ["g\\it", `g\\it commit -m x`, failed, "DENY"],
  ["git \"commit\"", `git "commit" -m x`, failed, "DENY"],
  ["gi\\<newline>t", `gi\\\nt commit -m x`, failed, "DENY"],
  ["\\sh -c", `\\sh -c '${GC} -m x'`, failed, "DENY"],
  ["\"sh\" -c", `"sh" -c '${GC} -m x'`, failed, "DENY"],
  // a command in argument position
  ["find -exec sh -c", `find . -exec sh -c '${GC} -m x' \\;`, failed, "DENY"],
  ["find -exec git", `find . -exec ${GC} -m x \\;`, failed, "DENY"],
  // inside a wrapper's string, nothing need separate git from what precedes it
  ["sh -c 'true;git …'", `sh -c 'true;${GC} -m x'`, failed, "DENY"],
  ["sh -c '$(git …)'", `sh -c 'echo $(${GC} -m x)'`, failed, "DENY"],
  ["sh -c '\\git …'", `sh -c '\\${GC} -m x'`, failed, "DENY"],
  // text that quotes nothing must not open a span
  ["apostrophe in <<'EOF' prose", `cat <<'EOF'\ndon't\nEOF\n${GC} -m x\necho "'"`, failed, "DENY"],
  ["apostrophe in a comment", `# don't\n${GC} -m x\necho "'"`, failed, "DENY"],
  // the shape of a real release commit the span reading let through
  ["comment apostrophe, then commit", `# verdict for the repo's own hook\nFULL=$(node -e 'x')\n${GC} -q -m "$(cat <<'EOF'\nrelease: "quoted" title\nEOF\n)"`, failed, "DENY"],
  ["$'…' escapes its quote", `echo $'a\\'' ; ${GC} -m x ; echo ''`, failed, "DENY"],
  ["((x<<=1)) is no here-doc", `echo "$( ((x<<=1))\n${GC} -m x )"`, failed, "DENY"],
  ["mis-closed span shows no flag", `cat <<'EOF'\ndon't\nEOF\n${GC} -m ' --no-verify '`, failed, "DENY"],
  // …and data stays data
  ["<<'EOF' prose with backticks", "cat > notes.md <<'EOF'\nRun `" + GC + " -m x` after the gate passes\nEOF", failed, "ALLOW"],
  ["PR body via \"$(cat <<'EOF')\"", "gh pr create --body \"$(cat <<'EOF'\n- `" + GC + "` now denies; don't `sh -c '" + GC + "'`\n- $(" + GC + " -m x) in prose\nEOF\n)\"", failed, "ALLOW"],
  ["single-quoted $(…) and backtick", "echo '$(" + GC + ")' '`" + GC + "`'", failed, "ALLOW"],
  ["escaped \\$( and \\` in dq", `echo "\\$(${GC}) \\\`${GC}\\\`"`, failed, "ALLOW"],
  ["\"git\" as an argument", `printf '%s\\n' "git" commit`, failed, "ALLOW"],
  ["find -exec grep phrase", `find . -name '*.md' -exec grep -l '${GC}' {} +`, failed, "ALLOW"],
  ["$((1<<2)) arithmetic", `echo "$((1<<2))"; git log -1 --format="%s $(date)"`, failed, "ALLOW"],
  ["genuine --no-verify, $(…) msg", `${GC} --no-verify -m "$(cat msg.txt)"`, failed, "ALLOW"],

  // GATE-09 — what the shell reading knows masks what the span reading lexes.
  // Each ALLOW below was denied on 2026-09-11; each is data.
  ["then in a comment", `ls # then ${GC} later`, failed, "ALLOW"],
  ["$( in <<\"EOF\" prose", `cat > notes.md <<"EOF"\nuse $(${GC} -m x) in prose\nEOF`, failed, "ALLOW"],
  ["\" in \"$(cat <<'EOF')\" prose", `printf '%s' "$(cat <<'EOF'\n- Don't forget: "$(${GC})" too\nEOF\n)"`, failed, "ALLOW"],
  ["sh -c, then a comment", `sh -c 'ls' # ${GC} later`, failed, "ALLOW"],
  ["tee here-doc to a file", `tee notes.md <<'EOF' >/dev/null\n${GC} -m x\nEOF`, failed, "ALLOW"],
  ["genuine --no-verify + comment", `${GC} --no-verify -m x # reviewed`, failed, "ALLOW"],
  // A killed hook writes no deny: a masked body must not be a whitespace run the
  // strict matcher rescans from every newline (masked with spaces, this took 14s).
  ["300KB data here-doc", `cat > notes.md <<'EOF'\n${"prose that won't run\n".repeat(15000)}EOF`, failed, "ALLOW"],
  // …and what could still run stays visible
  ["--no-verify only in a comment", `${GC} -m x # --no-verify`, failed, "DENY"],
  ["comment holding ;", `ls # ; ${GC} -m x`, failed, "DENY"],
  ["${x:-a #b} is no comment", `echo \${x:-a #b}; ${GC} -m x`, failed, "DENY"],
  ["dash <<'EOF', no wrapper name", `dash <<'EOF'\n${GC} -m x\nEOF`, failed, "DENY"],
  ["cat here-doc | dash", `cat <<'EOF' | dash\n${GC} -m x\nEOF`, failed, "DENY"],
  ["{ cat here-doc; } | dash", `{ cat <<'EOF'\n${GC} -m x\nEOF\n} | dash`, failed, "DENY"],
  ["cat > x.sh here-doc; sh x.sh", `cat > x.sh <<'EOF'\n${GC} -m x\nEOF\nsh x.sh`, failed, "DENY"],
  ["cat here-doc > >(dash)", `cat <<'EOF' > >(dash)\n${GC} -m x\nEOF`, failed, "DENY"],
  ["dash <(cat here-doc)", `dash <(cat <<'EOF'\n${GC} -m x\nEOF\n)`, failed, "DENY"],
  ["unquoted cat body runs $(…)", `cat > notes.md <<EOF\n$(${GC} -m x)\nEOF`, failed, "DENY"],
  // GATE-10 — exec-style prefixes that run the command after them. Each DENY was
  // verified to create a real commit under a pty on 2026-09-11 (and `bash -n`
  // accepts it); each ALLOWed past the gate before `exec`, `builtin`,
  // `caffeinate` and `script` joined the prefix chain. `doas`, `chronic`,
  // `unbuffer`, `watch` and `parallel` were probed too but were absent on the
  // box, so none could be confirmed to commit and none was added.
  ["exec git commit", `exec ${GC} -m x`, failed, "DENY"],
  ["exec -a name git commit", `exec -a nm ${GC} -m x`, failed, "DENY"],
  ["exec sh -c wrapper", `exec sh -c '${GC} -m x'`, failed, "DENY"],
  ["caffeinate git commit", `caffeinate ${GC} -m x`, failed, "DENY"],
  ["caffeinate -i git commit", `caffeinate -i ${GC} -am x`, failed, "DENY"],
  ["builtin exec git commit", `builtin exec ${GC} -m x`, failed, "DENY"],
  ["builtin eval wrapper", `builtin eval '${GC} -m x'`, failed, "DENY"],
  ["script -q /dev/null git commit", `script -q /dev/null ${GC} -m x`, failed, "DENY"],
  ["exec chained after &&", `git add -A && exec ${GC} -m x`, failed, "DENY"],
  ["$(exec git commit) in dq", `echo "$(exec ${GC} -m x)"`, failed, "DENY"],
  // …and the new prefixes leave data and non-commit subcommands alone
  ["exec a non-git command", `exec ls -la`, failed, "ALLOW"],
  ["caffeinate git status", `caffeinate git status`, failed, "ALLOW"],
  ["script recording, no command", `script session.log`, failed, "ALLOW"],
  ["script … git log (not commit)", `script -q /dev/null git log -1`, failed, "ALLOW"],
  ["builtin cd, no commit", `builtin cd /tmp`, failed, "ALLOW"],
  ["echo mentions exec commit", `echo "exec ${GC}"`, failed, "ALLOW"],
  ["grep for caffeinate phrase", `grep -rn 'caffeinate ${GC}' docs/`, failed, "ALLOW"],
  // the enlarged alternation must still parse linearly (GATE-07)
  ["40 caffeinate words, no commit", `${"caffeinate ".repeat(40)}ls ; sh -c 'ls'`, failed, "ALLOW"],
  ["40 caffeinate words, then commit", `${"caffeinate ".repeat(40)}${GC} -m x`, failed, "DENY"],

  // Documented behaviours that had no case (2026-09-11 skill-chain audit)
  ["checkpoint is a JSON array", `${GC} -m x`, arrayCp, "DENY", "Bash", {}, /checkpoint\.json is not/],
  ["checkpoint is not JSON", `${GC} -m x`, invalidCp, "DENY"],
  ["enrolled by .opchain/ only", `${GC} -m x`, optedByOpchain, "DENY"],
  ["OPCHAIN_GATE=1 on unenrolled", `${GC} -m x`, notEnrolled, "DENY", "Bash", { OPCHAIN_GATE: "1" }],
  ["OPCHAIN_BYPASS=1 token", `OPCHAIN_BYPASS=1 ${GC} -m x`, failed, "ALLOW"],
  ["verified_for_tree alias, bound", `${GC} -m x`, aliasBound, "ALLOW"],
  ["flat verdict field, bound", `${GC} -m x`, flatVerdict, "ALLOW"],
  ["xargs wrapper", `echo x | xargs ${GC} -m`, failed, "DENY"],
  ["sudo prefix", `sudo ${GC} -m x`, failed, "DENY"],
];

let failedCount = 0;
console.log("opchain commit-gate — hermetic fixtures\n");
console.log("  CASE                              EXPECT  GOT       NOTE");
console.log("  " + "─".repeat(100));
for (const [name, cmd, cwd, expect, tool, extraEnv, reason] of cases) {
  const { verdict, detail } = run(cmd, cwd, tool, extraEnv);
  // A reason pins WHY it denied, for cases where a different check would deny too.
  const ok = verdict === expect && (!reason || reason.test(detail));
  if (!ok) failedCount++;
  console.log(
    `  ${ok ? "✓" : "✗"} ${name.padEnd(32)}${expect.padEnd(8)}${verdict.padEnd(10)}${detail}`,
  );
}

for (const d of scratches) fs.rmSync(d, { recursive: true, force: true });
console.log(`\n  ${cases.length - failedCount}/${cases.length} passed`);
process.exit(failedCount ? 1 : 0);
