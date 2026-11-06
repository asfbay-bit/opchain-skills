#!/usr/bin/env node
// opchain plugin — PreToolUse(Bash) hook. Holds the agent to the router's suggestion.
//
// ── Why this exists ─────────────────────────────────────────────────────────
// docs/audits/2026-11-05-jev-performance-since-install.md §4: in live mode the
// router named the right skill on 11 of 13 shown suggestions, and the agent
// used it on 4. On 3 it ran the raw command the skill wraps (`gh pr merge`,
// `wrangler d1 migrations apply`) instead. A suggestion is a hint; a
// PreToolUse deny is the one mechanism agents have always obeyed
// (pre-commit-gate.cjs). So when THIS turn's prompt was routed live to a skill,
// and the agent reaches for that skill's raw command without having invoked
// the skill, the first attempt is denied with the exact Skill call to make.
//
// ── Block once, then allow (owner ruling 2026-11-05) ────────────────────────
// The same raw command class retried in the same turn goes through and is
// logged as an override: a deliberate choice, or the owner's explicit ask for
// the raw command, is never stuck. This is a nudge, not a security boundary.
//
// ── What it catches ─────────────────────────────────────────────────────────
//   gh pr merge                                  → oc-git-ops     (/oc-merge)
//   gh pr create                                 → oc-git-ops     (/oc-git-sync)
//   npm run deploy*, wrangler deploy, scripts/deploy.mjs,
//   wrangler d1 migrations apply … --remote      → oc-deploy-ops  (/oc-deploy)
// only when the session's newest routing record is for the prompt being
// answered now (its outcome window is still open), was injected (live mode,
// not the A/B control arm), suggested that skill, and the skill has not been
// invoked in the window yet. Anything else, and every failure, allows.
//
// ── Log ─────────────────────────────────────────────────────────────────────
// Appends { type: "redirect", at, session_id, for_prompt_hash, for_route_at,
// class, skill, args, action: "block" | "override" } to the router log, which is also the
// state the block-once rule reads. `route-eval outcomes` reports them.
//
// ── Env ─────────────────────────────────────────────────────────────────────
//   OPCHAIN_ROUTE_REDIRECT=0   disable
//   OPCHAIN_ROUTE_LOG          the router's JSONL log (same default as route-prompt.cjs)

"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");
const dispatch = require("./lib/route-dispatch.cjs");

const TRANSCRIPT_TAIL_BYTES = 2 * 1024 * 1024;
const LOG_TAIL_BYTES = 512 * 1024;

// Raw command class → the skill whose work it is, and the verb to suggest when
// the routing decision carries none.
const CLASS_SKILL = Object.freeze({
  gh_pr_merge: { skill: "oc-git-ops", verb: "/oc-merge" },
  gh_pr_create: { skill: "oc-git-ops", verb: "/oc-git-sync" },
  deploy: { skill: "oc-deploy-ops", verb: "/oc-deploy" },
});

function tailLines(file, maxBytes) {
  let fd = null;
  try {
    const st = fs.statSync(file);
    const size = Math.min(st.size, maxBytes);
    if (!size) return [];
    const buf = Buffer.alloc(size);
    fd = fs.openSync(file, "r");
    fs.readSync(fd, buf, 0, size, st.size - size);
    const lines = buf.toString("utf8").split("\n");
    if (size < st.size) lines.shift();
    return lines;
  } catch {
    return [];
  } finally {
    if (fd !== null) {
      try {
        fs.closeSync(fd);
      } catch {
        /* ignore */
      }
    }
  }
}

function parseJsonLines(lines) {
  const out = [];
  for (const line of lines) {
    const t = line.trim();
    if (!t || t[0] !== "{") continue;
    try {
      out.push(JSON.parse(t));
    } catch {
      /* partial line */
    }
  }
  return out;
}

/** The raw classes this hook acts on that `command` runs, in CLASS_SKILL order. */
function redirectClasses(command) {
  const on = dispatch.rawCommandClasses(command);
  return Object.keys(CLASS_SKILL).filter((k) => on[k]);
}

/**
 * Decide for one Bash call. Pure apart from its inputs:
 *   { command, sessionId, logRecords, transcriptRecords }
 * → { action: "allow" } | { action: "block" | "override", cls, skill, args, route }.
 * logRecords are the router log's records (file order), transcriptRecords the
 * session transcript's.
 */
function decide({ command, sessionId, logRecords, transcriptRecords }) {
  if (!sessionId || typeof command !== "string") return { action: "allow" };
  const classes = redirectClasses(command);
  if (!classes.length) return { action: "allow" };
  let route = null;
  for (let i = logRecords.length - 1; i >= 0; i--) {
    const r = logRecords[i];
    if (!r || r.session_id !== sessionId || r.type) continue; // routing records have no `type`
    route = r;
    break;
  }
  if (!route || !route.injected || !route.decision || !route.decision.skill || !route.prompt_hash) return { action: "allow" };
  const cls = classes.find((k) => CLASS_SKILL[k].skill === route.decision.skill);
  if (!cls) return { action: "allow" };
  // Is the agent still answering the routed prompt? Its outcome window must be open.
  const w = dispatch.outcomeWindow(transcriptRecords, { forPromptHash: route.prompt_hash, afterAt: route.at, before: undefined });
  if (!w || w.endReason !== "open") return { action: "allow" };
  const acc = { skill_calls: [], raw: dispatch.emptyRaw() };
  for (let i = w.start; i < w.end; i++) dispatch.addRecordActivity(acc, transcriptRecords[i]);
  const skill = route.decision.skill;
  if (acc.skill_calls.includes(skill)) return { action: "allow" };
  // The router never logs a menu verb as a decision (route-prompt silences it), so
  // the logged verb is a real step; fall back to the class's verb when it has none.
  const args = typeof route.decision.args === "string" && route.decision.args.startsWith("/") ? route.decision.args : CLASS_SKILL[cls].verb;
  // Only a block for THIS routed turn counts: a prompt repeated later in the
  // session has the same hash, so blocks are also scoped to the route's time.
  const blockedBefore = logRecords.some(
    (r) =>
      r && r.type === "redirect" && r.session_id === sessionId && r.for_prompt_hash === route.prompt_hash && r.class === cls && r.action === "block" &&
      (r.for_route_at ? r.for_route_at === route.at : typeof r.at === "string" && r.at >= route.at),
  );
  return { action: blockedBefore ? "override" : "block", cls, skill, args, route };
}

function reasonFor({ skill, args, cls }) {
  const what = cls === "gh_pr_merge" ? "merge" : cls === "gh_pr_create" ? "open the PR" : "deploy";
  return (
    `opchain route: this request was routed to ${skill} (${args}). ` +
    `To ${what}, invoke the Skill tool with skill "${skill}" and args "${args}" first; it runs the repo's policy for this step. ` +
    `If the owner asked for this exact raw command, run it again and it will go through (logged as an override).`
  );
}

function main() {
  const env = process.env;
  if (env.OPCHAIN_ROUTE_REDIRECT === "0") return;
  let input;
  try {
    input = JSON.parse(fs.readFileSync(0, "utf8"));
  } catch {
    return;
  }
  if (!input || input.tool_name !== "Bash" || !input.tool_input) return;
  const command = input.tool_input.command;
  if (!redirectClasses(command).length) return; // cheap exit: nearly every Bash call
  const logFile = env.OPCHAIN_ROUTE_LOG || path.join(os.tmpdir(), "opchain-route-log.jsonl");
  const logRecords = parseJsonLines(tailLines(logFile, LOG_TAIL_BYTES));
  const transcriptRecords = input.transcript_path ? parseJsonLines(tailLines(String(input.transcript_path), TRANSCRIPT_TAIL_BYTES)) : [];
  const sessionId = input.session_id ? String(input.session_id) : null;
  const d = decide({ command, sessionId, logRecords, transcriptRecords });
  if (d.action === "allow") return;
  try {
    fs.appendFileSync(
      logFile,
      JSON.stringify({
        type: "redirect",
        at: new Date().toISOString(),
        session_id: sessionId,
        for_prompt_hash: d.route.prompt_hash,
        for_route_at: d.route.at,
        class: d.cls,
        skill: d.skill,
        args: d.args,
        action: d.action,
      }) + "\n",
    );
  } catch {
    /* logging is best effort; without it the block-once state is lost, so allow */
    return;
  }
  if (d.action === "block") {
    process.stdout.write(
      JSON.stringify({
        hookSpecificOutput: { hookEventName: "PreToolUse", permissionDecision: "deny", permissionDecisionReason: reasonFor(d) },
      }),
    );
  }
}

if (require.main === module) {
  try {
    main();
  } catch {
    /* fail open: this hook nudges, it never guards */
  }
  process.exit(0);
}

module.exports = { CLASS_SKILL, redirectClasses, decide, reasonFor };
