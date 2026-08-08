#!/usr/bin/env node
// Test harness for the opchain next-skill suggestion Stop hook.
//
// Same discipline as test-gate.cjs, for the same reason: SILENT and CRASHED
// both produce empty stdout, so a harness that only checks "did it print" will
// score a broken hook as a passing one. Every case distinguishes them.
//
// The suite's real job is proving the SILENCE rules, not the speaking rule.
// A suggestion hook that speaks too often gets the whole plugin uninstalled;
// the measured naive version fired ~33 times/week with byte-identical text.
//
// Run: node plugins/opchain/hooks/test-suggestion.cjs

"use strict";
const { spawnSync } = require("child_process");
const path = require("path");
const fs = require("fs");
const os = require("os");

const HOOK = path.join(__dirname, "next-suggestion.cjs");
const scratches = [];
let sessionSeq = 0;

function sh(args, cwd) {
  return spawnSync("git", args, { cwd, encoding: "utf8" });
}

/** A scratch repo with controllable checkpoints. */
function mkRepo({ enrolled = true, commits = ["init"] } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "oc-sug-"));
  scratches.push(dir);
  sh(["init", "-q", "-b", "main"], dir);
  sh(["config", "user.email", "t@t"], dir);
  sh(["config", "user.name", "t"], dir);
  fs.writeFileSync(path.join(dir, "README.md"), "x\n");
  sh(["add", "-A"], dir);
  for (const msg of commits) sh(["-c", "core.hooksPath=/dev/null", "commit", "-qm", msg, "--allow-empty"], dir);
  if (enrolled) fs.mkdirSync(path.join(dir, ".checkpoints"), { recursive: true });
  return dir;
}

function writeCp(dir, skill, body) {
  fs.writeFileSync(
    path.join(dir, ".checkpoints", `${skill}.checkpoint.json`),
    JSON.stringify({ skill, updated_at: new Date().toISOString(), ...body }, null, 2),
  );
}

function run(dir, sessionId, env = {}) {
  const payload = JSON.stringify({
    hook_event_name: "Stop",
    session_id: sessionId,
    cwd: dir,
    stop_hook_active: false,
    ...(env.stopActive ? { stop_hook_active: true } : {}),
  });
  const childEnv = { ...process.env, ...(env.vars || {}) };
  const r = spawnSync("node", [HOOK], { input: payload, encoding: "utf8", env: childEnv });
  if (r.status !== 0 || r.error) {
    return { verdict: "CRASHED", msg: (r.stderr || "").split("\n")[0].slice(0, 70) };
  }
  const out = (r.stdout || "").trim();
  if (!out) return { verdict: "SILENT", msg: "" };
  try {
    const j = JSON.parse(out);
    if (j.decision) return { verdict: "BLOCKED", msg: "emitted a decision field — must never happen" };
    return { verdict: "SPOKE", msg: (j.systemMessage || "").slice(0, 74) };
  } catch {
    return { verdict: "MALFORMED", msg: out.slice(0, 70) };
  }
}

/** Establish the session baseline (first Stop is always silent by design). */
function prime(dir) {
  const sid = `s${++sessionSeq}-${Date.now()}`;
  run(dir, sid);
  return sid;
}

const cases = [];
function t(name, expect, fn) {
  cases.push({ name, expect, fn });
}

t("not an opchain repo", "SILENT", () => {
  const d = mkRepo({ enrolled: false });
  return run(d, prime(d));
});

t("first Stop of session (baseline)", "SILENT", () => {
  const d = mkRepo();
  writeCp(d, "oc-code-auditor", { status: "in_progress", next_actions: ["Fix the parser"] });
  const sid = `fresh-${Date.now()}`;
  return run(d, sid); // no prime — this IS the first Stop
});

t("no change since last Stop", "SILENT", () => {
  const d = mkRepo();
  writeCp(d, "oc-code-auditor", { status: "in_progress", next_actions: ["Fix the parser"] });
  const sid = prime(d);
  return run(d, sid); // fingerprint identical -> standing state, not an event
});

t("checkpoint changed -> speaks", "SPOKE", () => {
  const d = mkRepo();
  writeCp(d, "oc-code-auditor", { status: "in_progress", next_actions: ["Fix the parser"] });
  const sid = prime(d);
  writeCp(d, "oc-code-auditor", { status: "complete", next_actions: ["Fix the parser"] });
  return run(d, sid);
});

t("same suggestion twice -> deduped", "SILENT", () => {
  const d = mkRepo();
  writeCp(d, "oc-bug-check", { status: "complete", next_actions: ["Triage the audit findings"] });
  const sid = prime(d);
  writeCp(d, "oc-bug-check", { status: "complete", next_actions: ["Triage the audit findings"], phase: "a" });
  run(d, sid); // speaks
  writeCp(d, "oc-bug-check", { status: "complete", next_actions: ["Triage the audit findings"], phase: "b" });
  return run(d, sid); // same key -> silent
});

t("stale action (PR already merged)", "SILENT", () => {
  const d = mkRepo({ commits: ["init", "feat: land the thing (#403)"] });
  writeCp(d, "oc-git-ops", { status: "complete", next_actions: ["Merge PR #403 and tag it"] });
  const sid = prime(d);
  writeCp(d, "oc-git-ops", { status: "complete", next_actions: ["Merge PR #403 and tag it"], phase: "x" });
  return run(d, sid);
});

t("'no work pending' status-note", "SILENT", () => {
  const d = mkRepo();
  writeCp(d, "oc-stack-forge", { status: "complete", next_actions: ["No stack-forge work pending — all packs live"] });
  const sid = prime(d);
  writeCp(d, "oc-stack-forge", { status: "complete", next_actions: ["No stack-forge work pending — all packs live"], phase: "x" });
  return run(d, sid);
});

t("empty next_actions", "SILENT", () => {
  const d = mkRepo();
  writeCp(d, "oc-ux-engineer", { status: "complete", next_actions: [] });
  const sid = prime(d);
  writeCp(d, "oc-ux-engineer", { status: "complete", next_actions: [], phase: "x" });
  return run(d, sid);
});

t("stop_hook_active guard", "SILENT", () => {
  const d = mkRepo();
  writeCp(d, "oc-code-auditor", { status: "in_progress", next_actions: ["Fix it"] });
  const sid = prime(d);
  writeCp(d, "oc-code-auditor", { status: "complete", next_actions: ["Fix it"] });
  return run(d, sid, { stopActive: true });
});

t("OPCHAIN_SUGGEST=0 mute", "SILENT", () => {
  const d = mkRepo();
  writeCp(d, "oc-code-auditor", { status: "in_progress", next_actions: ["Fix it"] });
  const sid = prime(d);
  writeCp(d, "oc-code-auditor", { status: "complete", next_actions: ["Fix it"] });
  return run(d, sid, { vars: { OPCHAIN_SUGGEST: "0" } });
});

t("malformed checkpoint JSON", "SILENT", () => {
  const d = mkRepo();
  fs.writeFileSync(path.join(d, ".checkpoints", "oc-bad.checkpoint.json"), "{not json");
  const sid = prime(d);
  fs.writeFileSync(path.join(d, ".checkpoints", "oc-bad.checkpoint.json"), "{still not json");
  return run(d, sid);
});

t("names the downstream skill's command", "SPOKE", () => {
  const d = mkRepo();
  writeCp(d, "oc-code-auditor", { status: "in_progress", next_actions: ["x"] });
  const sid = prime(d);
  writeCp(d, "oc-code-auditor", { status: "complete", next_actions: ["Hand off to oc-deploy-ops for staging"] });
  return run(d, sid);
});

t("user_decision blocker is surfaced", "SPOKE", () => {
  const d = mkRepo();
  writeCp(d, "oc-release-ops", { status: "in_progress", next_actions: ["x"] });
  const sid = prime(d);
  writeCp(d, "oc-release-ops", {
    status: "blocked",
    blockers: [{ needs: "user_decision", description: "patch or minor?", proposed_resolution: "Confirm the semver" }],
  });
  return run(d, sid);
});

// ── run ─────────────────────────────────────────────────────────────────────
let failed = 0;
console.log("opchain next-suggestion hook\n");
console.log("  CASE                                EXPECT   GOT      NOTE");
console.log("  " + "─".repeat(104));
for (const c of cases) {
  const { verdict, msg } = c.fn();
  const ok = verdict === c.expect;
  if (!ok) failed++;
  console.log(`  ${ok ? "✓" : "✗"} ${c.name.padEnd(34)}${c.expect.padEnd(9)}${verdict.padEnd(9)}${msg}`);
}
for (const d of scratches) fs.rmSync(d, { recursive: true, force: true });
// Clear this run's session state files so repeat runs are hermetic.
for (const f of fs.readdirSync(os.tmpdir())) {
  if (f.startsWith("opchain-suggest-")) {
    try { fs.rmSync(path.join(os.tmpdir(), f), { force: true }); } catch { /* ignore */ }
  }
}
console.log(`\n  ${cases.length - failed}/${cases.length} passed`);
process.exit(failed ? 1 : 0);
