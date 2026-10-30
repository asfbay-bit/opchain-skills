"use strict";
// opchain skill router — shared core for the UserPromptSubmit hook
// (../route-prompt.cjs) and the offline eval (scripts/route-eval.mjs).
//
// Dependency-free CommonJS, Node 20+ (global fetch, AbortController).
//
// ── What it computes ────────────────────────────────────────────────────────
// Given a user prompt + a small repo-state object, ask TypeSafe/Jev which
// opchain skill (if any) owns the request, and which verb of that skill. The
// recipe is TypeSafe's skill_suggestion cookbook, two requests:
//
//   request 1  Choice `which` over EVERY routable skill (≤160-char idea-level
//              descriptions + an explicit `none`) and three Noul gates:
//                acts       the request acts on files/services (not prose only)
//                procedure  it is best served by a documented procedure
//                prose      it is answerable in prose alone  (inverted)
//              gate = mean(acts, procedure, 1 − prose)
//   request 2  rerank the top-3 with full descriptions (+ notFor), plus per
//              candidate `fits::<id>` Noul and a speculative verb Choice
//              `verb::<id>` (options = that skill's verbs + `unspecified`).
//              Speculative fan-out: all three candidates' questions go in one
//              request; only the winner's answers are read.
//
// State sent with both requests (default, context off):
//   { request, repo }
// With T.context (OPCHAIN_ROUTE_CONTEXT=1), opt-in and experimental:
//   { request, conversation: { previous_request, assistant_last }, repo }
// plus the follow-up/conversation instruction rules. Every request, context on
// or off, carries REQUEST_RULES (a question about a skill is not a request to
// run it; judge the action, not the content it describes). assistant_last is the END
// of the assistant's previous message (≤400 chars); previous_request is the
// developer's previous prompt (≤200 chars); both are redacted here as well as
// at the source. Context is off by default because on the 2026-10-09 blind-
// labelled eval it cut precision from 0.81 to 0.51 for no recall gain: bare
// assents ("yes", "go", "done") after a PR or deploy turn became suggestions.
//
// Decision: null unless gate ≥ T.gate, rerank top ≠ none with probability
// ≥ T.minTopProb, fits ≥ T.fits, and p = min(top probability, fits, gate)
// ≥ T.minP.
// Evidence gate: every skill stays a Choice OPTION (so it absorbs probability
// instead of misrouting to oc-git-ops), but only skills in spec.suggestAllow
// (scripts/route-spec.overrides.json `suggest.allow`) may be SUGGESTED. A
// winner outside the list returns no decision with the reason
// `skill X not in suggest allowlist (no labelled evidence)`. An explicit
// mention (the user named the skill) is exempt; T.suggestAll
// (OPCHAIN_ROUTE_SUGGEST_ALL=1) turns the gate off for eval and diagnostics.
// Verb = the Choice answer when it is a declared verb with probability ≥ T.verb,
// else the skill's baseVerb. A verb in the spec entry's `menuVerbs` (it only
// prints the skill's command menu) yields no decision unless T.allowMenus.
// Output text is the ONE line the audit measured at 72/72 compliance
// (docs/audits/2026-10-08 §3.1, I-08), with the verb's description appended:
//
//   opchain route (p=0.91): invoke the Skill tool with skill "oc-git-ops" and
//   args "/oc-git-sync" (Full workflow: branch (from convention) → commit →
//   push → PR). Skip this if the request means something else.
//
// ── TypeSafe API (docs.typesafe.ai, verified 2026-10-08) ────────────────────
//   POST https://api.typesafe.ai/v1/systemone
//   Authorization: Bearer $TYPESAFE_API_KEY · Content-Type: application/json
//   body     { state: string|object, model, questions: { id: Question } }
//   Question { type:"choice", instructions, criteria:{ key: description } }  ≤255 keys
//            { type:"noul",   instructions, criteria?:{ true, false } }
//   answer   { type:"choice", choice, probabilities:{k:p}, confidence }
//            { type:"noul",   noul: p }
//   usage    { input_tokens, output_tokens } · errors 401/422/429/529
//   confidence(choice) = (pmax − 1/n) / (1 − 1/n)
//   model pinned to jev-1.13.0 (alias jev-latest exists; pinned on purpose so
//   cached decisions and eval numbers mean the same thing next month).

const fs = require("fs");
const os = require("os");
const path = require("path");
const crypto = require("crypto");
// The shared Jev client (transport, redaction, answer readers). Everything it
// exports that this module used to define is re-exported below unchanged.
const client = require("./jev-client.cjs");

const { DEFAULT_ENDPOINT, DEFAULT_MODEL, MAX_OPTIONS, httpTransport, fixtureTransport, redactSecrets, redactDeep, clamp01, computeConfidence, assertOptionCount, addUsage } = client;
// Tiered `fits` bar, tuned on the 2026-10-09 blind-labelled eval (574 prompts, 41 positives
// after dropping ambiguous rows): every non-core skill produced ~12% precision at 0.5, so
// they need 0.9 to stay quiet on ordinary conversation. Core 0.6, measured on this request
// shape (context off, allowlist on), two identical runs: precision 0.860/0.864, recall
// 0.902/0.927, silent on `none` 0.987 (holdout 0.923 / 0.960 / 0.991), against the first
// router's 0.830 / 0.951 / 0.982 at 0.4. At 0.4 this shape lets 5 more ordinary prompts
// through in both runs (precision 0.745/0.750), so 0.4 is not kept. An explicit `fits`
// (OPCHAIN_ROUTE_FITS, or the eval harness's open query `fits: 0`) overrides both tiers.
//
// minP floors the combined p = min(top, fits, gate): each part clearing its own bar is not
// enough. In the 2026-10-19→22 shadow log the suggestions with p < 0.6 were two "Turn on
// Auto-fix for PR N" prompts (a rerank top of 0.43 / 0.52 over `none` passed minTopProb
// 0.35) and a "close to merge?" question; every hand-checked right one had p ≥ 0.66.
// OPCHAIN_ROUTE_MIN_P overrides it.
const CORE_SKILLS = Object.freeze([
  "oc-git-ops", "oc-deploy-ops", "oc-code-auditor", "oc-bug-check", "oc-release-ops", "oc-docs-forge", "oc-repo-ops",
]);
const DEFAULT_THRESHOLDS = Object.freeze({
  gate: 0.5, fits: null, coreFits: 0.6, otherFits: 0.9, core: CORE_SKILLS, minTopProb: 0.35, minP: 0.6, verb: 0.5, suggestAll: false,
  context: false, allowMenus: false,
});
function fitsThreshold(T, skill) {
  if (T.fits !== null && T.fits !== undefined) return T.fits;
  return (T.core || CORE_SKILLS).includes(skill) ? T.coreFits : T.otherFits;
}
const DEFAULT_CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const SHORTLIST_SIZE = 3;
const NONE = "none";
const UNSPECIFIED = "unspecified";

// Conversation context limits (shared by the hook and scripts/route-eval.mjs).
const PREVIOUS_REQUEST_MAX = 200;
const ASSISTANT_LAST_MAX = 400;

// How the model should read `conversation` and `repo`. Sent as named fields of
// an instructions object (the API accepts string | object).
const CONTEXT_RULES = Object.freeze({
  follow_ups:
    "Short follow-ups such as \"merge\", \"yes\", \"go\", \"do it\" or \"ship it\" refer to `conversation.assistant_last` (the end of the assistant's previous message, where it proposes next steps): resolve what the developer is approving from there and judge THAT action, not the bare words.",
  conversation:
    "`conversation.previous_request` is the developer's previous message; use it to resolve references such as \"that\", \"it\" or a bare PR or issue number. Either conversation field may be null.",
  repo:
    "`repo.open_pr` set (not false or null) means a pull request already exists for this branch, so a bare \"merge\" is a PR merge. `repo.dirty` counts uncommitted files and `repo.ahead` counts commits on this branch not yet on origin/main (unpushed or unmerged work). `repo.checkpoint`, when present, is a pipeline skill that was working in this repository within the last day; it is background, never a reason to pick that skill for an unrelated request. Fields may be absent or null when unknown.",
});

// Sent with every request, context on or off. The 2026-10-23 shadow analysis
// (docs/audits/2026-10-23-jev-router-shadow-performance.md §2) traced two of
// the four false suggestions to a question that named a skill, and two of the
// three misses to `fits` judging the content a PR described, not "open a PR".
const REQUEST_RULES = Object.freeze({
  request_vs_question:
    "A request asks the assistant to DO a skill's work now. A message that asks whether, where or why that work happened, or whether a skill should be part of a plan, is a question about the skill, not a request to run it.",
  verb_not_content:
    "Judge the action the request asks for, not the subject matter it describes: \"open a PR that records the release\" is a pull-request action, and the release is only its content.",
});

// The other two false suggestions were "Turn on Auto-fix for PR N" → oc-git-ops.
const NONE_DESCRIPTION =
  "No opchain skill applies: a plain question, general coding or writing help, a one-off command, a setting of the coding assistant or its desktop app (Auto-fix, CI monitoring, model, permissions), or work no listed skill owns.";
const UNSPECIFIED_DESCRIPTION =
  "The request names no particular step of this skill; it should start at the skill's default entry point.";

/** Env overrides: OPCHAIN_ROUTE_GATE / OPCHAIN_ROUTE_FITS (0..1), OPCHAIN_ROUTE_SUGGEST_ALL=1, OPCHAIN_ROUTE_CONTEXT=1. */
function thresholdsFromEnv(env = process.env, base = DEFAULT_THRESHOLDS) {
  const out = { ...DEFAULT_THRESHOLDS, ...base };
  const gate = clamp01(env.OPCHAIN_ROUTE_GATE);
  const fits = clamp01(env.OPCHAIN_ROUTE_FITS);
  const minP = clamp01(env.OPCHAIN_ROUTE_MIN_P);
  if (gate !== null && env.OPCHAIN_ROUTE_GATE !== undefined && env.OPCHAIN_ROUTE_GATE !== "") out.gate = gate;
  if (fits !== null && env.OPCHAIN_ROUTE_FITS !== undefined && env.OPCHAIN_ROUTE_FITS !== "") out.fits = fits;
  if (minP !== null && env.OPCHAIN_ROUTE_MIN_P !== undefined && env.OPCHAIN_ROUTE_MIN_P !== "") out.minP = minP;
  if (env.OPCHAIN_ROUTE_SUGGEST_ALL === "1" || env.OPCHAIN_ROUTE_SUGGEST_ALL === "true") out.suggestAll = true;
  if (env.OPCHAIN_ROUTE_CONTEXT === "1" || env.OPCHAIN_ROUTE_CONTEXT === "true") out.context = true;
  return out;
}

// ── Transports ──────────────────────────────────────────────────────────────
// httpTransport / fixtureTransport live in ./jev-client.cjs (shared with every
// Jev use) and are re-exported here under the same names.

// ── Request builders ────────────────────────────────────────────────────────

function routableSkillIds(spec) {
  return Object.keys(spec.skills)
    .filter((id) => spec.skills[id].baseVerb && Object.keys(spec.skills[id].verbs || {}).length > 0)
    .sort();
}

// Context mode is read off the state: `conversation` is present only when
// T.context is on. Off, the follow-up and conversation rules are left out as
// well as the fields: on 2026-10-09 the follow-up rule alone (with empty
// context) added 4 false suggestions on bare assents, and context on cut
// precision from 0.81 to 0.51 (scratch/route-eval-v2-comparison.md).
function hasContext(state) {
  return Boolean(state && typeof state === "object" && Object.prototype.hasOwnProperty.call(state, "conversation"));
}

function rulesFor(state) {
  return hasContext(state) ? { ...REQUEST_RULES, ...CONTEXT_RULES } : { ...REQUEST_RULES, repo: CONTEXT_RULES.repo };
}

function followUpRule(state) {
  return hasContext(state) ? { follow_ups: CONTEXT_RULES.follow_ups } : {};
}

function noulQuestion(criterion, state) {
  return {
    type: "noul",
    instructions: { criterion, ...followUpRule(state) },
    criteria: { true: "Yes, this is true of the request.", false: "No, this is not true of the request." },
  };
}

function buildRequest1(spec, state) {
  const criteria = {};
  for (const id of routableSkillIds(spec)) criteria[id] = spec.skills[id].index;
  criteria[NONE] = NONE_DESCRIPTION;
  assertOptionCount(criteria, "request1.which");
  return {
    state,
    questions: {
      which: {
        type: "choice",
        instructions: {
          task: hasContext(state)
            ? "A developer sent `request` to a coding assistant that has the opchain skill set installed; `conversation` is the exchange just before it and `repo` describes the repository the assistant is working in. Which single opchain skill should handle the request? Each option describes the kind of work that skill owns. Choose `none` when the request is a plain question, general coding help, or anything no listed skill owns."
            : "A developer sent `request` to a coding assistant that has the opchain skill set installed; `repo` describes the repository the assistant is working in. Which single opchain skill should handle the request? Each option describes the kind of work that skill owns. Choose `none` when the request is a plain question, general coding help, or anything no listed skill owns.",
          ...rulesFor(state),
        },
        criteria,
      },
      acts: noulQuestion(spec.gates.acts, state),
      procedure: noulQuestion(spec.gates.procedure, state),
      prose: noulQuestion(spec.gates.prose, state),
    },
  };
}

function fullText(skill) {
  return skill.notFor ? `${skill.full} ${skill.notFor}` : skill.full;
}

function buildRequest2(spec, state, shortlist) {
  const ids = shortlist.filter((id) => spec.skills[id]);
  if (!ids.length) throw new Error("buildRequest2: empty shortlist");
  const rerank = {};
  for (const id of ids) rerank[id] = fullText(spec.skills[id]);
  rerank[NONE] = NONE_DESCRIPTION;
  assertOptionCount(rerank, "request2.rerank");
  const questions = {
    rerank: {
      type: "choice",
      instructions: {
        task: `These opchain skills were shortlisted for \`request\` (with ${hasContext(state) ? "`conversation` and `repo`" : "`repo`"} as context). Read each full description, including what the skill is NOT for, and choose the one that should handle the request. Choose \`none\` if none of them fits well.`,
        ...rulesFor(state),
      },
      criteria: rerank,
    },
  };
  for (const id of ids) {
    const skill = spec.skills[id];
    questions[`fits::${id}`] = {
      type: "noul",
      instructions: {
        question: `The request is squarely the kind of work ${skill.displayName} (${id}) owns.`,
        skill: fullText(skill),
        ...rulesFor(state),
      },
      criteria: {
        true: "The skill is a good fit for this request.",
        false: "The skill is a poor fit, only tangentially related, or the request is better served without it.",
      },
    };
    const verbs = { ...skill.verbs, [UNSPECIFIED]: UNSPECIFIED_DESCRIPTION };
    assertOptionCount(verbs, `request2.verb::${id}`);
    questions[`verb::${id}`] = {
      type: "choice",
      instructions: {
        question: skill.verbQuestion,
        options: `Each option is a step of ${skill.displayName}; the request is in \`request\`.`,
        ...followUpRule(state),
      },
      criteria: verbs,
    };
  }
  return { state, questions };
}

// ── Decision ────────────────────────────────────────────────────────────────

function probsOf(answer) {
  return answer && answer.probabilities && typeof answer.probabilities === "object" ? answer.probabilities : {};
}

function shortlistFrom(answers1, spec, size = SHORTLIST_SIZE) {
  const probs = probsOf(answers1 && answers1.which);
  const ranked = Object.entries(probs)
    .filter(([id]) => id !== NONE && spec.skills[id])
    .sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1))
    .map(([id]) => id);
  if (!ranked.length && answers1 && answers1.which && answers1.which.choice && answers1.which.choice !== NONE && spec.skills[answers1.which.choice]) {
    ranked.push(answers1.which.choice);
  }
  return ranked.slice(0, size);
}

function gateScore(answers1) {
  if (!answers1) return null;
  const parts = [];
  const acts = clamp01(answers1.acts && answers1.acts.noul);
  const procedure = clamp01(answers1.procedure && answers1.procedure.noul);
  const prose = clamp01(answers1.prose && answers1.prose.noul);
  if (acts !== null) parts.push(acts);
  if (procedure !== null) parts.push(procedure);
  if (prose !== null) parts.push(1 - prose);
  if (!parts.length) return null;
  return parts.reduce((a, b) => a + b, 0) / parts.length;
}

function round(x, d = 4) {
  return x === null || x === undefined ? x : Math.round(x * 10 ** d) / 10 ** d;
}

/** True when spec.suggestAllow is absent (no gate) or lists the skill. */
function isSuggestable(spec, skill) {
  const allow = spec && spec.suggestAllow;
  return !Array.isArray(allow) || allow.includes(skill);
}

/**
 * Full evaluation: { decision|null, reason, gate, shortlist, needsRerank, suppressed? }.
 * `needsRerank` is true when request 1 passed its gates and request 2 has not
 * been made yet (answers2 null) — route() uses it to skip the second call.
 */
function evaluate(spec, answers1, answers2, thresholds) {
  const T = { ...DEFAULT_THRESHOLDS, ...(thresholds || {}) };
  const gate = gateScore(answers1);
  const shortlist = shortlistFrom(answers1, spec);
  const base = { decision: null, gate: round(gate), shortlist, needsRerank: false };
  if (!answers1 || !answers1.which) return { ...base, reason: "request 1 returned no `which` answer" };
  if (gate === null) return { ...base, reason: "request 1 returned no gate answers" };
  if (gate < T.gate) return { ...base, reason: `gate ${gate.toFixed(2)} < ${T.gate}` };
  if (answers1.which.choice === NONE) return { ...base, reason: "request 1 chose none" };
  if (!shortlist.length) return { ...base, reason: "no routable skill in request 1 probabilities" };
  if (!answers2) return { ...base, needsRerank: true, reason: "rerank pending" };

  const rerank = answers2.rerank;
  if (!rerank || !rerank.choice) return { ...base, reason: "request 2 returned no `rerank` answer" };
  const skill = rerank.choice;
  if (skill === NONE) return { ...base, reason: "rerank chose none" };
  if (!spec.skills[skill]) return { ...base, reason: `rerank chose unknown skill ${skill}` };
  const probabilities = probsOf(rerank);
  const top = clamp01(probabilities[skill]);
  if (top === null) return { ...base, reason: `rerank has no probability for ${skill}` };
  if (top < T.minTopProb) return { ...base, reason: `rerank top ${top.toFixed(2)} < ${T.minTopProb}` };
  const fits = clamp01(answers2[`fits::${skill}`] && answers2[`fits::${skill}`].noul);
  if (fits === null) return { ...base, reason: `no fits answer for ${skill}` };
  const fitsBar = fitsThreshold(T, skill);
  if (fits < fitsBar) return { ...base, reason: `fits ${fits.toFixed(2)} < ${fitsBar} for ${skill}` };
  const p = Math.min(top, fits, gate);
  const minP = Number.isFinite(T.minP) ? T.minP : 0;
  if (p < minP) return { ...base, reason: `p ${p.toFixed(2)} = min(top, fits, gate) < ${minP} for ${skill}` };

  const entry = spec.skills[skill];
  const verbAnswer = answers2[`verb::${skill}`];
  let verb = entry.baseVerb;
  let verbProbability = null;
  let verbReason = "base verb";
  if (verbAnswer && verbAnswer.choice) {
    const p = clamp01(probsOf(verbAnswer)[verbAnswer.choice]);
    verbProbability = p;
    if (verbAnswer.choice === UNSPECIFIED) verbReason = "verb unspecified → base verb";
    else if (!entry.verbs[verbAnswer.choice]) verbReason = `verb ${verbAnswer.choice} not declared → base verb`;
    else if (p === null || p < T.verb) verbReason = `verb ${verbAnswer.choice} p=${p === null ? "?" : p.toFixed(2)} < ${T.verb} → base verb`;
    else {
      verb = verbAnswer.choice;
      verbReason = `verb ${verb} p=${p.toFixed(2)}`;
    }
  }
  // Evidence gate: the winner cleared every threshold but has no labelled
  // positives behind it. Report what was suppressed so logs and the eval can
  // show what gating removes.
  if (!T.suggestAll && !isSuggestable(spec, skill)) {
    return { ...base, suppressed: skill, reason: `skill ${skill} not in suggest allowlist (no labelled evidence)` };
  }
  // A verb that only prints the skill's command menu is not a step the agent can
  // take. 7 of 11 oc-git-ops shadow suggestions resolved to `/oc-git` (the menu),
  // every "merge" prompt among them (2026-10-23 integration analysis). Say
  // nothing instead; T.allowMenus keeps them for the eval's offline sweep.
  const menu = isMenuVerb(entry, verb);
  if (menu && !T.allowMenus) return { ...base, reason: `verb ${verb} is ${skill}'s menu (no step named)` };
  const confidence = Number.isFinite(Number(rerank.confidence)) ? Number(rerank.confidence) : computeConfidence(probabilities);
  const decision = {
    skill,
    verb,
    args: verb,
    verbDescription: entry.verbs[verb] || null,
    ...(menu ? { menu: true } : {}),
    p: round(p),
    confidence: round(confidence),
    probabilities,
    gate: round(gate),
    fits: round(fits),
    topProbability: round(top),
    verbProbability: round(verbProbability),
    reason: `rerank ${top.toFixed(2)} · fits ${fits.toFixed(2)} · gate ${gate.toFixed(2)} · ${verbReason}`,
  };
  return { ...base, decision, reason: decision.reason };
}

/** True when `verb` is one of the spec entry's `menuVerbs` (gen-route-spec marks them). */
function isMenuVerb(entry, verb) {
  return Boolean(entry && Array.isArray(entry.menuVerbs) && entry.menuVerbs.includes(verb));
}

function decide(spec, answers1, answers2, thresholds) {
  return evaluate(spec, answers1, answers2, thresholds).decision;
}

const VERB_DESCRIPTION_MAX = 120;

/**
 * The one line live mode injects. The tool-named form leads (72/72 in the
 * 2026-10-08 audit); the verb's own description follows so the agent knows
 * which step it is agreeing to before it loads the skill.
 */
function decisionText(decision) {
  if (!decision) return null;
  const desc = typeof decision.verbDescription === "string" ? decision.verbDescription.replace(/\s+/g, " ").trim().replace(/\.$/, "") : "";
  const what = desc ? ` (${desc.length > VERB_DESCRIPTION_MAX ? `${desc.slice(0, VERB_DESCRIPTION_MAX - 1)}…` : desc})` : "";
  return `opchain route (p=${Number(decision.p).toFixed(2)}): invoke the Skill tool with skill "${decision.skill}" and args "${decision.args}"${what}. Skip this if the request means something else.`;
}

// ── Cache ───────────────────────────────────────────────────────────────────

// Redaction (redactSecrets / redactDeep) lives in ./jev-client.cjs: nothing that
// looks like a credential may leave the machine inside a routing request, land in
// the decision cache, or be written to the route log.

/**
 * Key over everything that changes the request or the gated decision: prompt,
 * repo state, conversation, spec version, the suggest allowlist (it lives in
 * overrides and does not bump spec.version), whether gating is off, and the
 * effective thresholds (gate, fits, tiers, minTopProb, verb): a decision cached
 * under OPCHAIN_ROUTE_FITS=0.3 must not be served once the override is gone
 * (2026-10-09 audit B-08).
 */
function thresholdKey(thresholds) {
  const T = { ...DEFAULT_THRESHOLDS, ...(thresholds || {}) };
  return JSON.stringify([T.gate, T.fits ?? null, T.coreFits, T.otherFits, [...(T.core || CORE_SKILLS)].sort(), T.minTopProb, T.minP ?? 0, T.verb, Boolean(T.allowMenus)]);
}

/**
 * Repo state as the cache sees it: the counts collapse to "any / none". With
 * exact counts in the key the cache never hit in 80 shadow routes (2026-10-19
 * → 10-23), because `dirty` changes with every edit; the decision does not.
 */
function cacheRepoState(repoState) {
  if (!repoState || typeof repoState !== "object") return repoState ?? null;
  const some = (n) => (typeof n === "number" ? n > 0 : n ?? null);
  return { ...repoState, dirty: some(repoState.dirty), ahead: some(repoState.ahead), behind: some(repoState.behind) };
}

function cacheKey(prompt, repoState, spec, conversation = null, { suggestAll = false, context = false, thresholds = null } = {}) {
  return crypto
    .createHash("sha256")
    .update(String(prompt))
    .update("\u0000")
    .update(JSON.stringify(cacheRepoState(repoState)))
    .update("\u0000")
    .update(JSON.stringify(conversation ?? null))
    .update("\u0000")
    .update(String(spec && spec.version))
    .update("\u0000")
    .update(JSON.stringify((spec && spec.suggestAllow) ?? null))
    .update(suggestAll ? "\u0000all" : "\u0000gated")
    .update(context ? "\u0000ctx" : "\u0000noctx")
    .update("\u0000")
    .update(thresholdKey(thresholds))
    .digest("hex");
}

// ── Conversation + transcript helpers (hook and eval share these rules) ─────

/** Last `n` chars, marked with a leading ellipsis when cut. */
function tailText(text, n) {
  const s = String(text ?? "");
  return s.length > n ? `…${s.slice(s.length - (n - 1))}` : s;
}

/**
 * { previous_request, assistant_last } — redacted BEFORE truncation (a cut
 * through a credential could leave an unmatched fragment), then
 * previous_request head ≤200 and assistant_last tail ≤400. Empty → null.
 */
function normalizeConversation(raw) {
  const c = raw && typeof raw === "object" ? raw : {};
  const clean = (v) => (typeof v === "string" && v.trim() ? redactSecrets(v.trim()) : null);
  const prev = clean(c.previous_request);
  const last = clean(c.assistant_last);
  return {
    previous_request: prev ? prev.slice(0, PREVIOUS_REQUEST_MAX) : null,
    assistant_last: last ? tailText(last, ASSISTANT_LAST_MAX) : null,
  };
}

const HARNESS_ENVELOPE_RE = /^(\[Request interrupted by user[^\]]*\]|Request directory (approved|denied)\b)/;
// The desktop app delivers some prompts as one or more `<system-reminder>` blocks
// followed by the human's text. Treating the whole message as an envelope left
// 13 of 14 such prompts unrouted in the 2026-10-19 → 10-23 shadow window, among
// them every `run /oc-*` prompt and every brief from another session.
const LEADING_REMINDERS_RE = /^(?:\s*<system-reminder>[\s\S]*?<\/system-reminder>)+\s*/;
// A task another session hands this one opens with this line; its `Task:`
// paragraph is the request, the rest is background and reading lists.
const SESSION_BRIEF_RE = /^Background \(from the session that started this one\):/;
const BRIEF_TASK_RE = /^Task:[ \t]*\n?([\s\S]*?)(?=\n[ \t]*\n(?:[A-Z][^\n]{0,80}:[ \t]*(?:\n|$)|Done =|Shared notes)|$(?![\s\S]))/m;
const BRIEF_TASK_MAX = 1500;

// A request for the ow- family (opchain.work): an `/ow-*` verb, or the family's own
// NEXT-block form, "use ow-<skill> …". The spec holds oc- skills only (catalogs.json
// keeps ow- out of every plugin output), so routing such a prompt could only
// misroute it to an oc- skill. The hook logs it as `envelope: "ow"` and stays silent.
const OW_PROMPT_RE = /^(?:(?:ok(?:ay)?|so|now|then|please|pls)[\s,]*)*(?:say\s+)?["“'`]?(?:\/ow-[a-z]|use\s+ow-[a-z])/i;

/** True when the prompt asks for an ow- skill (see OW_PROMPT_RE). */
function isOwPrompt(text) {
  return OW_PROMPT_RE.test(String(text ?? "").trim());
}

/** `text` with any leading `<system-reminder>…</system-reminder>` blocks removed, trimmed. */
function stripLeadingReminders(text) {
  return String(text ?? "").trim().replace(LEADING_REMINDERS_RE, "").trim();
}

/**
 * What the router should route for a prompt as Claude Code delivered it:
 * { body, request, envelope, brief }. `body` is the text after any leading
 * reminder blocks (the prompt hash is taken over it, so the outcome scorer can
 * find the same prompt in the transcript); `request` is what is sent to Jev:
 * the body, or a session brief's `Task:` paragraph, or null for a brief with
 * no `Task:` paragraph (not one request, so not routed). `envelope` is
 * "reminder" when blocks were stripped.
 */
function routablePrompt(text) {
  const raw = String(text ?? "").trim();
  const body = stripLeadingReminders(raw);
  const envelope = body !== raw ? "reminder" : null;
  if (!SESSION_BRIEF_RE.test(body)) return { body, request: body, envelope, brief: false };
  const m = BRIEF_TASK_RE.exec(body);
  const task = m ? m[1].trim() : "";
  return { body, request: task ? task.slice(0, BRIEF_TASK_MAX) : null, envelope, brief: true };
}

/**
 * The human-typed prompt in a transcript record, or null (tool results, meta,
 * sidechain, `<…>` envelopes, slash commands, interruption markers). Leading
 * `<system-reminder>` blocks are stripped first, so a desktop prompt behind
 * them counts. Same rules as scripts/route-eval.mjs humanPromptText.
 */
function humanText(record) {
  if (!record || record.type !== "user" || record.isMeta || record.isSidechain || !record.message) return null;
  const c = record.message.content;
  let text;
  if (typeof c === "string") text = c;
  else if (Array.isArray(c)) {
    if (c.some((b) => b && b.type === "tool_result")) return null;
    const parts = c.filter((b) => b && b.type === "text" && typeof b.text === "string").map((b) => b.text);
    if (!parts.length) return null;
    text = parts.join("\n");
  } else return null;
  text = stripLeadingReminders(text);
  if (!text || text.startsWith("<") || text.includes("<command-name>") || HARNESS_ENVELOPE_RE.test(text)) return null;
  return text;
}

/** Text blocks of a (non-sidechain) assistant record. */
function assistantTexts(record) {
  if (!record || record.type !== "assistant" || record.isSidechain || !record.message) return [];
  const c = record.message.content;
  if (typeof c === "string") return c.trim() ? [c] : [];
  if (!Array.isArray(c)) return [];
  return c.filter((b) => b && b.type === "text" && typeof b.text === "string" && b.text.trim()).map((b) => b.text);
}

function promptHash(text) {
  return crypto.createHash("sha256").update(String(text)).digest("hex").slice(0, 16);
}

/**
 * Conversation context for `currentPrompt` (already redacted) from transcript
 * records in file order. A trailing human record equal to the current prompt
 * (Claude Code may have written it before the hook ran) is skipped. The last
 * assistant message is every text block sharing the newest text-bearing
 * record's message.id, joined in order.
 */
function conversationFromRecords(records, currentPrompt) {
  let previous = null;
  let lastIdx = -1;
  let sawAssistant = false;
  for (let i = records.length - 1; i >= 0 && (previous === null || lastIdx === -1); i--) {
    const rec = records[i];
    if (!rec || rec.isSidechain) continue;
    if (rec.type === "assistant") {
      sawAssistant = true;
      if (lastIdx === -1 && assistantTexts(rec).length) lastIdx = i;
      continue;
    }
    if (previous !== null) continue;
    const text = humanText(rec);
    if (text === null) continue;
    if (!sawAssistant && redactSecrets(text) === currentPrompt) continue;
    previous = text;
  }
  let assistantLast = null;
  if (lastIdx !== -1) {
    const id = records[lastIdx].message && records[lastIdx].message.id;
    const texts = id
      ? records.filter((r) => r && r.type === "assistant" && !r.isSidechain && r.message && r.message.id === id).flatMap(assistantTexts)
      : assistantTexts(records[lastIdx]);
    assistantLast = texts.join("\n");
  }
  return normalizeConversation({ previous_request: previous, assistant_last: assistantLast });
}

// Raw command classes an outcome record tracks: Bash commands run by the
// agent, a subagent, or the user in `!` bash mode (`<bash-input>`).
// Each class matches only in command position (start of the command, or after
// `;` `&&` `||` `|` `(` `$(` `{` a newline, `then`/`do`/`else`, past env
// assignments and wrappers), so `grep "git commit"` or a quoted heredoc that
// mentions `git merge` does not count as running it.
const CMD_START = String.raw`(?:^|[;&|({\n]|\$\(|\bthen\b|\bdo\b|\belse\b)\s*(?:(?:[A-Za-z_][A-Za-z0-9_]*=\S*|env|command|time|nohup|timeout\s+\S+)\s+)*`;
const atCommand = (body) => new RegExp(CMD_START + body);
const RAW_COMMANDS = Object.freeze({
  git_commit: atCommand(String.raw`git\s+(?:-[cC]\s+\S+\s+)*commit\b`),
  git_push: atCommand(String.raw`git\s+(?:-[cC]\s+\S+\s+)*push\b`),
  // Branch sync (/oc-git-sync): `git merge origin/main`, `git rebase`; never `git merge-base`.
  git_sync: atCommand(String.raw`git\s+(?:-[cC]\s+\S+\s+)*(?:merge|rebase)(?![\w-])`),
  gh_pr_create: atCommand(String.raw`gh\s+pr\s+create\b`),
  gh_pr_merge: atCommand(String.raw`gh\s+pr\s+merge\b`),
  deploy: atCommand(String.raw`(?:npm\s+run\s+deploy\b|(?:npx\s+)?wrangler\s+(?:versions\s+)?deploy\b|node\s+(?:\S+\/)?scripts\/deploy\.mjs\b)`),
});
// Tool calls that do a raw class's work without a Bash command.
const RAW_TOOLS = Object.freeze({
  mcp__ccd_pr__set_auto_merge: "gh_pr_merge",
  mcp__ccd_host__sync_with_base_branch: "git_sync",
});
// A merge handed to the human as a command: the opchain repos squash-merge by
// hand (DCO), so a correct merge turn often ends in `gh pr merge …` in the
// assistant's text and runs nothing (2026-10-23 shadow analysis).
const MERGE_HANDOFF_RE = /`[^`\n]*\bgh\s+pr\s+merge\b[^`\n]*`/;
const RAW_CLASSES = Object.freeze([...Object.keys(RAW_COMMANDS), "merge_handoff"]);
const BASH_INPUT_RE = /^<bash-input>([\s\S]*?)<\/bash-input>/;
// A message relayed from another Claude session, as the transcript shows it.
const AGENT_MESSAGE_RE = /^Another Claude session sent a message:/;

/**
 * Is a prompt (already past leading `<system-reminder>` blocks) an envelope
 * rather than a person's turn? Task notifications, CI monitor events, `!`
 * bash input and other `<…>` blocks, an empty prompt, and a message relayed
 * from another session. They all fire UserPromptSubmit, but none is what the
 * person asked for, so none routes or closes an outcome window.
 */
function isEnvelopeBody(body) {
  const t = String(body ?? "").trim();
  return !t || t.startsWith("<") || AGENT_MESSAGE_RE.test(t);
}
// An outcome window closes at the end of the reply turn, at the next human turn,
// or this long after the prompt, whichever comes first. Before 2026-10-23 the hook
// closed it at the session's next UserPromptSubmit of any kind: of 60 shadow
// outcomes, 22 were closed by a task notification, CI event, `!` command or another
// session's message (often seconds after the prompt), and one window stayed open
// 69 h across an idle session.
const OUTCOME_WINDOW_MS = 30 * 60 * 1000;

function rawCommandClasses(command) {
  const out = {};
  for (const [k, re] of Object.entries(RAW_COMMANDS)) out[k] = re.test(String(command ?? ""));
  return out;
}

function stripPluginPrefix(name) {
  const s = String(name ?? "").trim();
  return s.startsWith("opchain:") ? s.slice("opchain:".length) : s;
}

function emptyRaw() {
  return Object.fromEntries(RAW_CLASSES.map((k) => [k, false]));
}

/**
 * Does this record start a new human turn (which closes an outcome window)? A
 * typed prompt, a slash command, or a desktop-app prompt whose text follows
 * leading `<system-reminder>` blocks. Task notifications, other envelopes,
 * `!` bash-mode input, messages relayed from another session and tool results
 * (AskUserQuestion answers included) do not.
 */
function isHumanTurn(record) {
  // humanText already accepts a prompt behind leading reminder blocks.
  const text = humanText(record);
  if (text !== null) return !AGENT_MESSAGE_RE.test(text);
  if (!record || record.type !== "user" || record.isMeta || record.isSidechain || !record.message) return false;
  const c = record.message.content;
  if (Array.isArray(c) && c.some((b) => b && b.type === "tool_result")) return false;
  const parts = typeof c === "string" ? [c] : Array.isArray(c) ? c.filter((b) => b && b.type === "text" && typeof b.text === "string").map((b) => b.text) : [];
  return parts.join("\n").includes("<command-name>");
}

/**
 * Fold one transcript record's activity into `acc` ({ skill_calls, skill_args?, raw }):
 * Skill tool calls (plugin prefix stripped; `skill_args`, when the caller passes
 * it, keeps each skill's first `args`), raw command classes from Bash
 * commands and `<bash-input>`, the tool equivalents in RAW_TOOLS, and a
 * `gh pr merge` handed over in the assistant's text. Sidechain records count
 * only with `includeSidechain` (the offline rescorer reads subagent transcripts).
 */
function addRecordActivity(acc, rec, { includeSidechain = false } = {}) {
  if (!rec || !rec.message || (rec.isSidechain && !includeSidechain)) return acc;
  const c = rec.message.content;
  if (rec.type === "user") {
    const text = typeof c === "string" ? c : "";
    const m = BASH_INPUT_RE.exec(text.trim());
    if (m) for (const [k, on] of Object.entries(rawCommandClasses(m[1]))) if (on) acc.raw[k] = true;
    return acc;
  }
  if (rec.type !== "assistant" || !Array.isArray(c)) return acc;
  for (const part of c) {
    if (!part) continue;
    if (part.type === "text" && typeof part.text === "string") {
      if (MERGE_HANDOFF_RE.test(part.text)) acc.raw.merge_handoff = true;
    } else if (part.type === "tool_use") {
      if (part.name === "Skill" && part.input && part.input.skill) {
        const id = stripPluginPrefix(part.input.skill);
        if (id && !acc.skill_calls.includes(id)) acc.skill_calls.push(id);
        if (id && acc.skill_args && !Object.prototype.hasOwnProperty.call(acc.skill_args, id)) {
          acc.skill_args[id] = typeof part.input.args === "string" ? part.input.args.slice(0, 120) : "";
        }
      } else if (part.name === "Bash" && part.input && typeof part.input.command === "string") {
        for (const [k, on] of Object.entries(rawCommandClasses(part.input.command))) if (on) acc.raw[k] = true;
      } else if (RAW_TOOLS[part.name]) acc.raw[RAW_TOOLS[part.name]] = true;
    }
  }
  return acc;
}

/**
 * The window after a routed prompt in transcript records (file order):
 * { start, startAt, anchor, end, endAt, endReason }. It opens after the human record
 * whose redacted text hashes to `forPromptHash` (the log record's
 * prompt_hash), else at the first record at or after `afterAt` (assistant
 * records cannot predate the hook that ran for their prompt). It closes at the
 * end of the reply turn (the first main-thread `end_turn`: `turn_end`), the
 * next human turn (`next_prompt`), `windowMs` after it opened (`horizon`),
 * or at the end of the records (`open`). `before` (ISO) skips prompt records
 * stamped after it, so a prompt repeated later in the session anchors on the
 * copy that was routed. Null when neither anchor is found or `deadline`
 * (epoch ms) passes.
 */
function outcomeWindow(records, { forPromptHash, afterAt, before, windowMs = OUTCOME_WINDOW_MS, endAtTurn = true, deadline } = {}) {
  let start = -1;
  let anchor = null;
  let startAt = null;
  const beforeMs = before ? Date.parse(before) : Infinity;
  for (let i = records.length - 1; i >= 0; i--) {
    if (deadline && Date.now() > deadline) return null;
    const ts = records[i] && typeof records[i].timestamp === "string" ? Date.parse(records[i].timestamp) : NaN;
    if (ts > beforeMs) continue;
    const text = humanText(records[i]);
    if (text !== null && promptHash(redactSecrets(text)) === forPromptHash) {
      start = i + 1;
      anchor = "prompt";
      startAt = records[i].timestamp || null;
      break;
    }
  }
  if (start === -1 && afterAt) {
    const idx = records.findIndex((r) => r && typeof r.timestamp === "string" && r.timestamp >= afterAt);
    if (idx !== -1) {
      start = idx;
      anchor = "time";
      startAt = afterAt;
    }
  }
  if (start === -1) return null;
  const horizon = startAt && windowMs ? Date.parse(startAt) + windowMs : Infinity;
  // endAt: when the window closed (ISO), for activity recorded elsewhere
  // (subagent transcripts); null while it is still open.
  const stamp = (rec) => (rec && typeof rec.timestamp === "string" ? rec.timestamp : null);
  for (let i = start; i < records.length; i++) {
    if (deadline && Date.now() > deadline) return null;
    const rec = records[i];
    if (isHumanTurn(rec)) return { start, startAt, anchor, end: i, endAt: stamp(rec), endReason: "next_prompt" };
    if (stamp(rec) && Date.parse(rec.timestamp) > horizon) return { start, startAt, anchor, end: i, endAt: new Date(horizon).toISOString(), endReason: "horizon" };
    // The reply turn ended: what follows answers a task notification or another
    // session's message, not this prompt.
    if (endAtTurn && rec && rec.type === "assistant" && !rec.isSidechain && rec.message && rec.message.stop_reason === "end_turn") return { start, startAt, anchor, end: i + 1, endAt: stamp(rec), endReason: "turn_end" };
  }
  return { start, startAt, anchor, end: records.length, endAt: null, endReason: "open" };
}

/**
 * What the session did after a routed prompt: { anchor, skill_calls,
 * skill_args, raw, window_end }, over the outcomeWindow() of the main-session
 * records. Null when the window has no anchor or `deadline` (epoch ms) passes.
 */
function outcomeFromRecords(records, { forPromptHash, afterAt, windowMs = OUTCOME_WINDOW_MS, deadline } = {}) {
  const w = outcomeWindow(records, { forPromptHash, afterAt, windowMs, deadline });
  if (!w) return null;
  const acc = { skill_calls: [], skill_args: {}, raw: emptyRaw() };
  for (let i = w.start; i < w.end; i++) {
    if (deadline && Date.now() > deadline) return null;
    addRecordActivity(acc, records[i]);
  }
  return { anchor: w.anchor, skill_calls: acc.skill_calls, skill_args: acc.skill_args, raw: acc.raw, window_end: w.endReason };
}

/**
 * Did the session call the suggested skill WITH the suggested verb? `args` of
 * "/oc-git-sync fix(hooks): …" follows "/oc-git-sync"; "/oc-pr" does not. Null
 * when nothing was suggested.
 */
function followedWithVerb(suggestedSkill, suggestedArgs, skillArgs) {
  if (!suggestedSkill) return null;
  if (!skillArgs || !Object.prototype.hasOwnProperty.call(skillArgs, suggestedSkill)) return false;
  const want = String(suggestedArgs ?? "").trim();
  if (!want) return true;
  const got = String(skillArgs[suggestedSkill] ?? "").trim();
  return got === want || got.startsWith(`${want} `) || got.startsWith(`${want}\n`);
}

/**
 * The live-mode A/B arm for a session (OPCHAIN_ROUTE_AB=1): "live" or
 * "control", fixed per session. Parity of the session id's first byte, or of a
 * hash of it when it is not hex, so both arms fill evenly across sessions.
 */
function abArm(sessionId) {
  const s = String(sessionId ?? "");
  const hex = /^[0-9a-f]{2}/i.test(s) ? s.slice(0, 2) : crypto.createHash("sha256").update(s).digest("hex").slice(0, 2);
  return parseInt(hex, 16) % 2 === 0 ? "live" : "control";
}

function defaultCacheDir() {
  return path.join(os.tmpdir(), "opchain-route-cache");
}

/**
 * Cache argument forms:
 *   false / null         → no cache
 *   undefined / {}       → file cache at os.tmpdir()/opchain-route-cache, 24h TTL
 *   { dir, ttlMs }       → file cache there
 *   { get, set }         → caller-provided store (the eval's FileCache)
 */
function cacheStore(cache) {
  if (cache === false || cache === null) return null;
  if (cache && typeof cache.get === "function" && typeof cache.set === "function") {
    return {
      read: (key) => {
        const hit = cache.get(key);
        return hit && typeof hit === "object" ? hit : null;
      },
      write: (key, value) => cache.set(key, value),
    };
  }
  const dir = (cache && cache.dir) || defaultCacheDir();
  const ttlMs = (cache && cache.ttlMs) || DEFAULT_CACHE_TTL_MS;
  return {
    read: (key) => {
      try {
        const file = path.join(dir, `${key}.json`);
        const st = fs.statSync(file);
        if (Date.now() - st.mtimeMs > ttlMs) return null;
        return JSON.parse(fs.readFileSync(file, "utf8"));
      } catch {
        return null;
      }
    },
    write: (key, value) => {
      try {
        fs.mkdirSync(dir, { recursive: true });
        const file = path.join(dir, `${key}.json`);
        const tmp = `${file}.${process.pid}.tmp`;
        fs.writeFileSync(tmp, JSON.stringify(value));
        fs.renameSync(tmp, file);
      } catch {
        /* cache is best effort */
      }
    },
  };
}

function top3(answer) {
  return Object.entries(probsOf(answer))
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([id, p]) => [id, round(p)]);
}

// ── Orchestration ───────────────────────────────────────────────────────────

/**
 * route({ prompt, repoState, conversation, spec, transport, thresholds, cache })
 *   → { decision: Decision|null, trace }
 * trace = { request1: {top3, gate}, request2: {top3, fits, verb}|null,
 *           usage, ms, cached, error, reason, model, suppressed }
 * Never throws for transport failures: decision null + trace.error.
 */
/**
 * Deterministic route for a prompt that names exactly one skill outright
 * (`/oc-code-auditor`, `run /oc-audit diff`, `/oc-git-sync`). The user already
 * made the routing decision, so no model call is needed (the eval showed the
 * router scoring such a prompt at fits 0.37 — the one place it should never miss).
 * Returns null when no declared verb or skill command is named, or when two
 * different skills are named.
 *
 * A mention counts only when it reads as an instruction (2026-10-09 audit B-02:
 * "do not run /oc-deploy prod yet" routed at p=1 in live mode): the token opens
 * the prompt or a clause (after fillers such as "ok" / "please"), or follows an
 * imperative verb ("run", "use", "invoke" …) or a sequencing "then". It does not count when its
 * sentence is negated before it or its clause after it ("don't", "never",
 * "not yet"), when it sits in a question about the command ("what does
 * /oc-deploy do?"), or when it is part of a path ("/oc-audit/foo"). Those fall
 * through to the normal gated route.
 */
const MENTION_FILLER = "(?:ok(?:ay)?|so|now|then|and|also|next|please|pls|yes|yep|sure|alright|great|cool|go ahead and|let'?s)";
const MENTION_LEAD_OK = new RegExp(
  `^(?:${MENTION_FILLER}[\\s,]*)*$|(?:^|\\s)(?:then|(?:run|re-?run|use|invoke|call|do|start|try|execute|launch|trigger|fire|kick off)(?:\\s+(?:the|a|an))?)$`,
);
const MENTION_NEGATION = /\b(?:not|never|no|cannot|without|avoid|skip|stop|instead|rather|hold off|[a-z]+n['’]t|(?:do|does|did|wo|ca|should|would|is|are|must)nt)\b/;
const MENTION_INTERROGATIVE = /^(?:what|what's|whats|how|why|which|where|when|who|does|do|did|is|are|was|should|shall)\b/;
const CLAUSE_BREAK = /[.!?;:,\n]|—|–|\s-\s|&&/g;
const SENTENCE_BREAK = /[.!?;\n]/g;

function lastBreak(text, re) {
  let end = 0;
  for (const m of text.matchAll(re)) end = m.index + m[0].length;
  return end;
}

function firstBreak(text, re) {
  re.lastIndex = 0;
  const m = re.exec(text);
  return m ? m.index : text.length;
}

function mentionIsInstruction(text, start, end) {
  const before = text.slice(0, start);
  const after = text.slice(end);
  const lead = before.slice(lastBreak(before, CLAUSE_BREAK)).toLowerCase().replace(/[\s`"'(]+$/, "").trim();
  if (!MENTION_LEAD_OK.test(lead)) return false;
  const sentenceHead = before.slice(lastBreak(before, SENTENCE_BREAK)).toLowerCase();
  const clauseTail = after.slice(0, firstBreak(after, CLAUSE_BREAK)).toLowerCase();
  if (MENTION_NEGATION.test(sentenceHead) || MENTION_NEGATION.test(clauseTail)) return false;
  const stop = firstBreak(after, SENTENCE_BREAK);
  if (after[stop] === "?" && MENTION_INTERROGATIVE.test(sentenceHead.trim().replace(/^[`"'(]+/, ""))) return false;
  return true;
}

function explicitMention(prompt, spec) {
  const text = String(prompt || "");
  // The lookahead rejects a token that continues as a path or file name
  // ("/oc-audit/foo", "/oc-deploy.md"); a sentence-ending "." is fine.
  const re = /(?:^|[\s`"'(])(\/oc-[a-z0-9]+(?:-[a-z0-9]+)*)(?![\/\\\w]|[.-]\w)(?:[ \t]+([a-z][a-z-]*))?/g;
  const hits = new Map();
  let m;
  while ((m = re.exec(text))) {
    const token = m[1];
    const tokenStart = m.index + m[0].indexOf(token);
    if (!mentionIsInstruction(text, tokenStart, tokenStart + token.length)) continue;
    const withSub = m[2] ? `${token} ${m[2]}` : null;
    for (const [id, entry] of Object.entries(spec.skills)) {
      if (!entry.verbs) continue;
      const verbs = Object.keys(entry.verbs);
      let verb = null;
      if (withSub && verbs.includes(withSub)) verb = withSub;
      else if (verbs.includes(token)) verb = token;
      else if (token === `/${id}`) verb = entry.baseVerb;
      if (verb && !hits.has(id)) hits.set(id, verb);
    }
  }
  if (hits.size !== 1) return null;
  const [[skill, verb]] = hits;
  return {
    skill, verb, args: verb, verbDescription: spec.skills[skill].verbs[verb] || null, p: 1, confidence: 1, probabilities: { [skill]: 1 }, gate: 1, fits: 1,
    topProbability: 1, verbProbability: null, explicit: true, reason: `explicit mention of ${verb}`,
  };
}

async function route({ prompt: rawPrompt, repoState: rawRepoState = {}, conversation: rawConversation = null, spec, transport, thresholds, cache } = {}) {
  const t0 = Date.now();
  const prompt = redactSecrets(rawPrompt);
  const repoState = redactDeep(rawRepoState);
  if (!spec || !spec.skills) throw new Error("route: spec is required");
  if (typeof transport !== "function") throw new Error("route: transport is required");
  const T = { ...DEFAULT_THRESHOLDS, ...(thresholds || {}) };
  // Conversation context is opt-in (T.context / OPCHAIN_ROUTE_CONTEXT=1); off, it
  // is neither sent nor part of the cache key.
  const conversation = T.context ? normalizeConversation(redactDeep(rawConversation)) : null;
  const named = explicitMention(prompt, spec);
  if (named) {
    return {
      decision: named,
      trace: {
        request1: null, request2: null, usage: { input_tokens: 0, output_tokens: 0 }, ms: Date.now() - t0,
        cached: false, error: null, reason: named.reason, model: null, thresholds: T,
      },
    };
  }
  const key = cacheKey(prompt, repoState, spec, conversation, { suggestAll: Boolean(T.suggestAll), context: Boolean(T.context), thresholds: T });
  const store = cacheStore(cache);
  const hit = store ? store.read(key) : null;
  if (hit && Object.prototype.hasOwnProperty.call(hit, "decision")) {
    return { decision: hit.decision, trace: { ...(hit.trace || {}), cached: true, ms: Date.now() - t0 } };
  }

  const trace = {
    request1: null,
    request2: null,
    usage: { input_tokens: 0, output_tokens: 0 },
    ms: 0,
    cached: false,
    error: null,
    reason: null,
    model: null,
    thresholds: T,
    suppressed: null,
  };
  let decision = null;
  const state = T.context
    ? { request: String(prompt), conversation, repo: repoState ?? {} }
    : { request: String(prompt), repo: repoState ?? {} };
  try {
    const res1 = await transport(buildRequest1(spec, state));
    addUsage(trace.usage, res1);
    trace.model = (res1 && res1.model) || null;
    const answers1 = (res1 && res1.answers) || {};
    let ev = evaluate(spec, answers1, null, T);
    trace.request1 = { top3: top3(answers1.which), gate: ev.gate, shortlist: ev.shortlist };
    if (ev.needsRerank) {
      const res2 = await transport(buildRequest2(spec, state, ev.shortlist));
      addUsage(trace.usage, res2);
      const answers2 = (res2 && res2.answers) || {};
      ev = evaluate(spec, answers1, answers2, T);
      const top = answers2.rerank && answers2.rerank.choice;
      trace.request2 = {
        top3: top3(answers2.rerank),
        fits: top && top !== NONE ? round(clamp01(answers2[`fits::${top}`] && answers2[`fits::${top}`].noul)) : null,
        verb: top && top !== NONE && answers2[`verb::${top}`] ? answers2[`verb::${top}`].choice : null,
      };
    }
    decision = ev.decision;
    trace.reason = ev.reason;
    trace.suppressed = ev.suppressed || null;
    trace.ms = Date.now() - t0;
    if (store) store.write(key, { decision, trace, at: new Date().toISOString() });
  } catch (err) {
    trace.error = String((err && err.message) || err);
    trace.ms = Date.now() - t0;
    decision = null;
  }
  return { decision, trace };
}

module.exports = {
  DEFAULT_ENDPOINT,
  DEFAULT_MODEL,
  DEFAULT_THRESHOLDS,
  CORE_SKILLS,
  PREVIOUS_REQUEST_MAX,
  ASSISTANT_LAST_MAX,
  CONTEXT_RULES,
  REQUEST_RULES,
  NONE_DESCRIPTION,
  RAW_COMMANDS,
  redactSecrets,
  redactDeep,
  explicitMention,
  fitsThreshold,
  isSuggestable,
  isMenuVerb,
  normalizeConversation,
  tailText,
  LEADING_REMINDERS_RE,
  OW_PROMPT_RE,
  isOwPrompt,
  stripLeadingReminders,
  routablePrompt,
  humanText,
  assistantTexts,
  promptHash,
  conversationFromRecords,
  rawCommandClasses,
  RAW_CLASSES,
  OUTCOME_WINDOW_MS,
  isHumanTurn,
  isEnvelopeBody,
  emptyRaw,
  addRecordActivity,
  outcomeWindow,
  outcomeFromRecords,
  followedWithVerb,
  abArm,
  cacheRepoState,
  DEFAULT_CACHE_TTL_MS,
  MAX_OPTIONS,
  NONE,
  UNSPECIFIED,
  thresholdsFromEnv,
  httpTransport,
  fixtureTransport,
  buildRequest1,
  buildRequest2,
  shortlistFrom,
  gateScore,
  computeConfidence,
  evaluate,
  decide,
  decisionText,
  cacheKey,
  defaultCacheDir,
  route,
};
