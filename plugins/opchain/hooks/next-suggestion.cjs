#!/usr/bin/env node
// opchain plugin — Stop hook. Tells the USER which skill to invoke next.
//
// ── Why this exists ─────────────────────────────────────────────────────────
// Measured across 87 transcripts: a skill fires 66.0% of the time when the user
// names it in their prompt, and 5.4% when they don't. Zero of 54 invocations
// were autonomous. Every attempt to make skill A invoke skill B has failed,
// because that requires the model to act on prose and it demonstrably doesn't.
//
// So this hook does not try. It puts a skill NAME in front of the person with
// the 66% hit rate, at the moment they're deciding what to do next. It converts
// an unnamed invocation into a named one. That is the entire mechanism.
//
// ── Channel (settled by experiment, 2026-07-24) ─────────────────────────────
// A probe emitted `systemMessage` and `hookSpecificOutput.additionalContext` in
// ONE Stop-hook JSON object and observed where each landed:
//
//   additionalContext -> arrives in the MODEL's context, AND forces a
//                        continuation turn (costs tokens + latency every run).
//   systemMessage     -> does NOT reach the model.
//
// That refutes plugin-dev/skills/hook-development/SKILL.md:292 ("systemMessage:
// Message shown to Claude") for Stop hooks. We use `systemMessage` precisely
// because it does not reach the model and does not force a turn.
//
// RESIDUAL UNCERTAINTY, stated honestly: the probe proved systemMessage isn't a
// model channel; it could not prove from inside the session that the user sees
// it. If it turns out to be discarded, this hook is an inert no-op — it emits,
// nothing renders, the turn ends normally, nothing breaks. That asymmetry is
// why this channel was chosen over `decision: "block"`, which reaches both
// audiences but costs a turn every single time and is wrong to default to.
// If the field proves invisible, swap the emit() body to a block decision.
//
// ── The trigger: transitions, not state ─────────────────────────────────────
// The naive version ("show the top queued action at end of turn") was measured
// against this repo and rejected: 10 of 13 checkpoints carry a next_action, so
// it fires EVERY turn; at 38 sessions/week that's ~33 byte-identical notices.
// Worse, the top-ranked action here ("triage the remaining audit findings")
// carries no PR/version token any staleness check can match, and the audit
// protocol forbids closing that checkpoint while criticals are open — so acting
// on the suggestion RE-ARMS it. That is a wallpaper generator, and wallpaper
// gets the whole plugin uninstalled.
//
// Instead: fire only when a checkpoint actually CHANGED during this session.
// "A skill just finished — here's the handoff" is an event with a real cadence.
// "oc-code-auditor is still in progress" is a standing condition, and standing
// conditions already belong to the SessionStart hook, where they're reported.
//
// Contract: stdout is either nothing (silent) or one JSON object. Always exit 0.
// Never emits a `decision` field, so it cannot block, cannot loop, and cannot
// force a turn.

"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawnSync } = require("child_process");

function silent() {
  process.exit(0);
}

// Any unhandled throw must be silence, never a broken turn. This hook is a
// convenience; it has no business degrading a session if it has a bug.
process.on("uncaughtException", () => process.exit(0));

if (process.env.OPCHAIN_SUGGEST === "0") silent();

let input = {};
try {
  input = JSON.parse(fs.readFileSync(0, "utf8") || "{}");
} catch {
  silent();
}
if (!input || typeof input !== "object") silent();

// Documented loop guard. We never block, so this can't fire — but the repo's
// older Stop hook omits it, and that omission is a latent bug worth not copying.
if (input.stop_hook_active === true) silent();

function git(args, cwd) {
  const r = spawnSync("git", args, { cwd, encoding: "utf8" });
  return r.status === 0 ? (r.stdout || "").trim() : null;
}

const cwd = input.cwd || process.cwd();
const repoRoot = git(["rev-parse", "--show-toplevel"], cwd) || cwd;
const cpDir = path.join(repoRoot, ".checkpoints");
if (!fs.existsSync(cpDir)) silent(); // not an opchain project

// ── read checkpoints ────────────────────────────────────────────────────────
let files;
try {
  files = fs.readdirSync(cpDir).filter((f) => f.endsWith(".checkpoint.json"));
} catch {
  silent();
}
if (!files.length) silent();

const cps = [];
for (const f of files) {
  try {
    const d = JSON.parse(fs.readFileSync(path.join(cpDir, f), "utf8"));
    if (d && typeof d === "object" && d.skill) cps.push(d);
  } catch {
    /* a malformed checkpoint is doctor's problem, not this hook's */
  }
}
if (!cps.length) silent();

// ── the transition gate ─────────────────────────────────────────────────────
// Fingerprint = which checkpoints exist and when each was last written. If that
// is unchanged since the previous Stop in this session, no skill finished and
// there is nothing new to say.
const fingerprint = cps
  .map((d) => `${d.skill}@${d.updated_at || "?"}`)
  .sort()
  .join("|");

const stateFile = path.join(
  os.tmpdir(),
  `opchain-suggest-${String(input.session_id || "nosession").replace(/[^\w.-]/g, "")}.json`,
);

let prior = null;
try {
  prior = JSON.parse(fs.readFileSync(stateFile, "utf8"));
} catch {
  /* first Stop of the session */
}

function remember(extra) {
  try {
    fs.writeFileSync(stateFile, JSON.stringify({ fingerprint, ...extra }));
  } catch {
    /* best effort */
  }
}

// First Stop of a session establishes the baseline and says nothing. Without
// this, every session would open with a suggestion derived from state the user
// has not touched yet — which is SessionStart's job, and it already does it.
if (!prior) {
  remember({});
  silent();
}
if (prior.fingerprint === fingerprint) silent(); // nothing changed -> nothing to say

// Which checkpoints actually moved?
const priorMap = new Map(
  String(prior.fingerprint || "")
    .split("|")
    .filter(Boolean)
    .map((s) => {
      const i = s.lastIndexOf("@");
      return [s.slice(0, i), s.slice(i + 1)];
    }),
);
const changed = cps.filter((d) => priorMap.get(d.skill) !== (d.updated_at || "?"));
if (!changed.length) {
  remember({});
  silent();
}

// Most recently written wins — that's the skill that just finished.
changed.sort((a, b) => Date.parse(b.updated_at || 0) - Date.parse(a.updated_at || 0));
const source = changed[0];

// ── staleness: never suggest work git says already landed ───────────────────
// Self-contained (the plugin ships without scripts/checkpoint.mjs). Same idea:
// harvest PR/tag/version tokens from the action text and check them against
// what git already shows as merged or tagged.
const landed = new Set();
const log = git(["log", "--oneline", "-n", "300"], repoRoot) || "";
const tags = git(["tag", "--list"], repoRoot) || "";
for (const m of `${log}\n${tags}`.matchAll(/#(\d+)|\bv?(\d+\.\d+\.\d+)\b|\b([A-Z]{2,}-\d+)\b/g)) {
  const tok = m[1] ? `#${m[1]}` : m[2] ? `v${m[2]}` : m[3];
  if (tok) landed.add(tok.toLowerCase());
}
function isStale(text) {
  const toks = [];
  for (const m of String(text).matchAll(/#(\d+)|\bv?(\d+\.\d+\.\d+)\b|\b([A-Z]{2,}-\d+)\b/g)) {
    const tok = m[1] ? `#${m[1]}` : m[2] ? `v${m[2]}` : m[3];
    if (tok) toks.push(tok.toLowerCase());
  }
  // Stale only if it references something AND everything it references landed.
  return toks.length > 0 && toks.every((t) => landed.has(t));
}

function actionText(a) {
  if (!a) return "";
  if (typeof a === "string") return a;
  if (typeof a === "object" && typeof a.text === "string") return a.text;
  return "";
}

// ── pick what to say ────────────────────────────────────────────────────────
const blockers = Array.isArray(source.blockers) ? source.blockers : [];
const decision = blockers.find((b) => b && b.needs === "user_decision");

let why = "";
let actionStr = "";
if (decision) {
  why = `${source.skill} is waiting on your decision`;
  actionStr = decision.proposed_resolution || decision.description || "";
} else {
  for (const a of Array.isArray(source.next_actions) ? source.next_actions : []) {
    const t = actionText(a);
    if (t && !isStale(t)) {
      actionStr = t;
      break;
    }
  }
  why = `${source.skill} just wrote a checkpoint`;
}
if (!actionStr || isStale(actionStr)) {
  remember({});
  silent(); // nothing fresh and actionable -> say nothing
}

// Ignore "there is no work" notes parked in the action queue. Several skills use
// next_actions[] as a status field ("No stack-forge work pending — ..."), and
// surfacing those as a suggestion is worse than saying nothing.
if (/^\s*(no|none)\b.{0,40}\b(work|action|task)s?\b.{0,30}\b(pending|remain|left|outstanding)/i.test(actionStr)) {
  remember({});
  silent();
}

// ── resolve to something the user can TYPE ──────────────────────────────────
// The 8 commands the plugin actually registers. A suggestion naming one of
// these is directly typeable; anything else degrades to a quoted skill name,
// which still works because the evidence is about NAMING, not slash syntax.
const COMMANDS = {
  "oc-bug-check": "/oc-bugcheck",
  "oc-code-auditor": "/oc-audit",
  "oc-git-ops": "/oc-commit",
  "oc-deploy-ops": "/oc-deploy",
  "oc-docs-forge": "/oc-docs",
  "oc-orchestrator": "/oc-ops",
  "oc-release-ops": "/oc-release",
  "oc-repo-ops": "/oc-repo",
};
const KNOWN = new Set([...Object.keys(COMMANDS), ...cps.map((d) => d.skill)]);

// If the action text names a downstream skill, that's the handoff target —
// this is how "hand off to oc-deploy-ops" reaches deploy-ops rather than
// re-suggesting the skill that just finished.
let target = source.skill;
for (const id of KNOWN) {
  if (id !== source.skill && new RegExp(`\\b${id}\\b`).test(actionStr)) {
    target = id;
    break;
  }
}
const typeable = COMMANDS[target] || `"run ${target}"`;

// Don't repeat the same suggestion for the same commit.
const head = git(["rev-parse", "--short", "HEAD"], repoRoot) || "nohead";
const key = `${typeable}@${head}@${actionStr.slice(0, 60)}`;
if (prior.lastKey === key) {
  remember({ lastKey: key });
  silent();
}

const oneLine = actionStr.replace(/\s+/g, " ").trim().slice(0, 120);
remember({ lastKey: key });

process.stdout.write(
  JSON.stringify({
    systemMessage: `opchain · next → ${typeable}   (${why}: ${oneLine})`,
  }),
);
process.exit(0);
