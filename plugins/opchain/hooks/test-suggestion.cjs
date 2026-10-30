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

/**
 * A transcript fixture in Claude Code's JSONL shape: one assistant message per
 * skill, each carrying a `tool_use` block named "Skill" (what the hook reads to
 * learn which skills this session already invoked).
 */
function transcript(dir, skills) {
  const file = path.join(dir, "transcript.jsonl");
  const lines = [
    JSON.stringify({ type: "user", message: { role: "user", content: "go" } }),
    ...skills.map((skill, i) =>
      JSON.stringify({
        type: "assistant",
        message: {
          role: "assistant",
          content: [
            { type: "text", text: "Running it." },
            { type: "tool_use", id: `toolu_${i}`, name: "Skill", input: { skill, args: "" } },
          ],
        },
      })),
    JSON.stringify({ type: "assistant", message: { role: "assistant", content: [{ type: "text", text: "Done." }] } }),
  ];
  fs.writeFileSync(file, lines.join("\n") + "\n");
  return file;
}

function run(dir, sessionId, env = {}) {
  const payload = JSON.stringify({
    hook_event_name: "Stop",
    session_id: sessionId,
    cwd: dir,
    stop_hook_active: false,
    ...(env.stopActive ? { stop_hook_active: true } : {}),
    ...(env.transcript ? { transcript_path: env.transcript } : {}),
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
    return { verdict: "SPOKE", msg: (j.systemMessage || "").slice(0, 74), full: j.systemMessage || "" };
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
// `match` (optional) is checked against the full systemMessage of a SPOKE
// verdict: "it spoke" is not enough when the case is about WHAT it names.
function t(name, expect, fn, match) {
  cases.push({ name, expect, fn, match });
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
}, /next → \/oc-deploy\s/);

t("handoff: no command, no checkpoint", "SPOKE", () => {
  // oc-security-auditor has no plugin command and, before it first runs, no
  // checkpoint. The notice must name it, not re-target oc-code-auditor.
  const d = mkRepo();
  writeCp(d, "oc-code-auditor", { status: "in_progress", next_actions: ["x"] });
  const sid = prime(d);
  writeCp(d, "oc-code-auditor", {
    status: "complete",
    next_actions: ["Hand off to oc-security-auditor for the threat model"],
  });
  return run(d, sid);
}, /next → "run oc-security-auditor"/);

t("earliest-named handoff wins", "SPOKE", () => {
  const d = mkRepo();
  writeCp(d, "oc-app-architect", { status: "in_progress", next_actions: ["x"] });
  const sid = prime(d);
  writeCp(d, "oc-app-architect", {
    status: "complete",
    next_actions: ["Hand off to oc-integrations-engineer, then oc-deploy-ops at launch"],
  });
  return run(d, sid);
}, /next → "run oc-integrations-engineer"/);

t("'run <skill>' non-command target", "SPOKE", () => {
  // The action names no other skill, so the finishing skill is the target; it
  // has no registered command, so the notice degrades to a quoted skill name.
  const d = mkRepo();
  writeCp(d, "oc-stack-forge", { status: "in_progress", next_actions: ["x"] });
  const sid = prime(d);
  writeCp(d, "oc-stack-forge", { status: "complete", next_actions: ["Re-run the pack comparison with the Postgres option"] });
  return run(d, sid);
}, /next → "run oc-stack-forge"\s/);

t("object-form next_actions", "SPOKE", () => {
  const d = mkRepo();
  writeCp(d, "oc-code-auditor", { status: "in_progress", next_actions: [{ text: "x", done_when: "y" }] });
  const sid = prime(d);
  writeCp(d, "oc-code-auditor", {
    status: "complete",
    next_actions: [{ text: "Hand off to oc-deploy-ops for staging", done_when: "staging is green" }],
  });
  return run(d, sid);
}, /next → \/oc-deploy\s.*Hand off to oc-deploy-ops for staging/);

t("user_decision blocker is surfaced", "SPOKE", () => {
  const d = mkRepo();
  writeCp(d, "oc-release-ops", { status: "in_progress", next_actions: ["x"] });
  const sid = prime(d);
  writeCp(d, "oc-release-ops", {
    status: "blocked",
    blockers: [{ needs: "user_decision", description: "patch or minor?", proposed_resolution: "Confirm the semver" }],
  });
  return run(d, sid);
}, /waiting on your decision: Confirm the semver/);

t("blocker w/o proposed_resolution", "SPOKE", () => {
  // No proposed_resolution: the blocker's description is the action shown.
  const d = mkRepo();
  writeCp(d, "oc-release-ops", { status: "in_progress", next_actions: ["x"] });
  const sid = prime(d);
  writeCp(d, "oc-release-ops", {
    status: "blocked",
    blockers: [{ needs: "user_decision", description: "Decide patch or minor for the next cut" }],
  });
  return run(d, sid);
}, /next → \/oc-release\s.*waiting on your decision: Decide patch or minor/);

t("same words after a new HEAD: deduped", "SILENT", () => {
  // Same suggestion as the previous Stop with a commit in between. The dedup
  // key is per-commit, but identical notice TEXT is never repeated within a
  // session (2026-10-08 audit: byte-identical notices were the complaint).
  const d = mkRepo();
  writeCp(d, "oc-bug-check", { status: "complete", next_actions: ["Triage the audit findings"] });
  const sid = prime(d);
  writeCp(d, "oc-bug-check", { status: "complete", next_actions: ["Triage the audit findings"], phase: "a" });
  const first = run(d, sid);
  if (first.verdict !== "SPOKE") return { verdict: `FIRST_${first.verdict}`, msg: first.msg };
  sh(["-c", "core.hooksPath=/dev/null", "commit", "-qm", "next", "--allow-empty"], d);
  writeCp(d, "oc-bug-check", { status: "complete", next_actions: ["Triage the audit findings"], phase: "b" });
  return run(d, sid);
});

// ── 2026-10-08 audit: handoff targets, same-skill suppression, scaffold text ──

t("handoff: audited -> /oc-commit", "SPOKE", () => {
  // The action names no other skill, so the §3 handoff of the skill that just
  // finished is the target — not /oc-audit, which is what just ran.
  const d = mkRepo();
  writeCp(d, "oc-code-auditor", { status: "in_progress", next_actions: ["x"] });
  const sid = prime(d);
  writeCp(d, "oc-code-auditor", { status: "complete", next_actions: ["Triage the remaining medium findings"] });
  return run(d, sid);
}, /next → \/oc-commit \(or \/oc-deploy staging after pre-deploy\)\s/);

t("handoff: bug-check -> /oc-commit", "SPOKE", () => {
  const d = mkRepo();
  writeCp(d, "oc-bug-check", { status: "in_progress", next_actions: ["x"] });
  const sid = prime(d);
  writeCp(d, "oc-bug-check", { status: "complete", next_actions: ["All checks pass; commit the tree"] });
  return run(d, sid);
}, /next → \/oc-commit\s/);

t("handoff: release -> /oc-git-release X", "SPOKE", () => {
  // The semver is read from the checkpoint (step/progress/action) so the
  // suggestion is typeable as-is.
  const d = mkRepo();
  writeCp(d, "oc-release-ops", { status: "in_progress", next_actions: ["x"] });
  const sid = prime(d);
  writeCp(d, "oc-release-ops", {
    status: "in_progress",
    step: "v9.9.9-bump-applied",
    next_actions: ["Release PR merged; owner-signed tag, then staging"],
  });
  return run(d, sid);
}, /next → \/oc-git-release 9\.9\.9\s/);

t("handoff: explicit skill still wins", "SPOKE", () => {
  // An action that names a downstream skill is more specific than the table.
  const d = mkRepo();
  writeCp(d, "oc-code-auditor", { status: "in_progress", next_actions: ["x"] });
  const sid = prime(d);
  writeCp(d, "oc-code-auditor", { status: "complete", next_actions: ["Hand off to oc-deploy-ops for staging"] });
  return run(d, sid);
}, /next → \/oc-deploy\s/);

t("session already invoked the target", "SILENT", () => {
  // The session ran /oc-commit (opchain:oc-commit) already; telling it to run
  // /oc-commit again is the measured no-op.
  const d = mkRepo();
  writeCp(d, "oc-bug-check", { status: "in_progress", next_actions: ["x"] });
  const sid = prime(d);
  writeCp(d, "oc-bug-check", { status: "complete", next_actions: ["All checks pass; commit the tree"] });
  return run(d, sid, { transcript: transcript(d, ["opchain:oc-commit"]) });
});

t("session running the skill itself", "SILENT", () => {
  // 17/24 consumer-repo notices told the session running oc-app-architect to
  // run oc-app-architect. Its handoff (/oc-build) is still oc-app-architect.
  const d = mkRepo();
  writeCp(d, "oc-app-architect", { status: "in_progress", next_actions: ["x"] });
  const sid = prime(d);
  writeCp(d, "oc-app-architect", { status: "in_progress", next_actions: ["Build sprint 3: the settings screen"] });
  return run(d, sid, { transcript: transcript(d, ["oc-app-architect"]) });
});

t("transcript names another skill", "SPOKE", () => {
  // Negative control: a transcript that invoked something unrelated does not
  // suppress the handoff.
  const d = mkRepo();
  writeCp(d, "oc-bug-check", { status: "in_progress", next_actions: ["x"] });
  const sid = prime(d);
  writeCp(d, "oc-bug-check", { status: "complete", next_actions: ["All checks pass; commit the tree"] });
  return run(d, sid, { transcript: transcript(d, ["opchain:oc-bugcheck", "oc-reverse-spec"]) });
}, /next → \/oc-commit\s/);

t("unreadable transcript path", "SPOKE", () => {
  const d = mkRepo();
  writeCp(d, "oc-bug-check", { status: "in_progress", next_actions: ["x"] });
  const sid = prime(d);
  writeCp(d, "oc-bug-check", { status: "complete", next_actions: ["All checks pass; commit the tree"] });
  return run(d, sid, { transcript: path.join(d, "does-not-exist.jsonl") });
}, /next → \/oc-commit\s/);

t("scaffold placeholder is not an action", "SILENT", () => {
  // `checkpoint.mjs update` on a missing file writes this sentence; it shipped
  // on main for one skill and was re-advertised five times.
  const d = mkRepo();
  writeCp(d, "oc-security-auditor", { status: "in_progress", next_actions: ["x"] });
  const sid = prime(d);
  writeCp(d, "oc-security-auditor", {
    status: "in_progress",
    phase: "scaffold",
    next_actions: ["Define the first real next action for this skill."],
  });
  return run(d, sid);
});

t("short action is skipped, next used", "SPOKE", () => {
  // "Fix it" is under 12 characters; the first real action after it is used.
  const d = mkRepo();
  writeCp(d, "oc-code-auditor", { status: "in_progress", next_actions: ["x"] });
  const sid = prime(d);
  writeCp(d, "oc-code-auditor", {
    status: "complete",
    next_actions: ["Fix it", "Define the first real next action for this skill.", "Hand off to oc-deploy-ops for staging"],
  });
  return run(d, sid);
}, /next → \/oc-deploy\s.*Hand off to oc-deploy-ops/);

t("only short actions -> silent", "SILENT", () => {
  const d = mkRepo();
  writeCp(d, "oc-code-auditor", { status: "in_progress", next_actions: ["x"] });
  const sid = prime(d);
  writeCp(d, "oc-code-auditor", { status: "complete", next_actions: ["Fix it", "TBD"] });
  return run(d, sid);
});

// ── run ─────────────────────────────────────────────────────────────────────
let failed = 0;
console.log("opchain next-suggestion hook\n");
console.log("  CASE                                EXPECT   GOT      NOTE");
console.log("  " + "─".repeat(104));
for (const c of cases) {
  const { verdict, msg, full } = c.fn();
  const matched = !c.match || (verdict === "SPOKE" && c.match.test(full || ""));
  const ok = verdict === c.expect && matched;
  if (!ok) failed++;
  const note = verdict === c.expect && !matched ? `wrong text: ${String(full).slice(0, 80)}` : msg;
  console.log(`  ${ok ? "✓" : "✗"} ${c.name.padEnd(34)}${c.expect.padEnd(9)}${verdict.padEnd(9)}${note}`);
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
