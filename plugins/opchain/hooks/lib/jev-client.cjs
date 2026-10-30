"use strict";
// opchain Jev client — the one TypeSafe/Jev transport every use shares.
//
// Dependency-free CommonJS, Node 20+ (global fetch, AbortController). Used by
// the skill router (route-dispatch.cjs, use J1), by the offline eval
// (scripts/route-eval.mjs: `run`, and `jev <use>` over the gold sets) and by
// any later use registered in scripts/jev-uses.json. The plan is
// docs/plans/2026-10-24-jev-integration-plan.md §2.
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
//
// Rules every caller inherits:
//   · The key comes from the environment (apiKeyFrom) and is never placed in an
//     error message, a log record or a request body.
//   · Everything sent is redacted first (redactSecrets / redactDeep): a pasted
//     credential must not leave the machine inside a classification request.
//   · A transport is `async (body) → response JSON`. fixtureTransport is the
//     test seam; nothing in tests reaches the network.

// Only the fixture transport reads files, so fs loads on first use: the Worker
// bundles this client for J5 (src/lib/feedback-triage.js) and never calls it.
let fsModule = null;
const fs = () => (fsModule ??= require("node:fs"));

const DEFAULT_ENDPOINT = "https://api.typesafe.ai/v1/systemone";
const DEFAULT_MODEL = "jev-1.13.0";
const API_KEY_ENV = "TYPESAFE_API_KEY";
const MAX_OPTIONS = 255;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** The api key from `env`, or null. Never log the value. */
function apiKeyFrom(env = process.env) {
  const v = env && env[API_KEY_ENV];
  return typeof v === "string" && v.trim() ? v.trim() : null;
}

// ── Redaction ───────────────────────────────────────────────────────────────

// Nothing that looks like a credential may leave the machine inside a routing request,
// land in the decision cache, or be written to the route log. A pasted key is the
// common case (the router's own first eval run routed a prompt containing one).
const SECRET_PATTERNS = [
  /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?(?:-----END [A-Z ]*PRIVATE KEY-----|$)/g,
  /\bapikey_[A-Za-z0-9_-]{16,}/g,
  /\bsk-(?:ant-|proj-|live-|test-)?[A-Za-z0-9_-]{20,}/g,
  /\bgithub_pat_[A-Za-z0-9_]{30,}/g,
  /\bgh[pousr]_[A-Za-z0-9]{30,}/g,
  /\bxox[abprs]-[A-Za-z0-9-]{10,}/g,
  /\bAKIA[0-9A-Z]{16}\b/g,
  /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/g,
  /\bBearer\s+[A-Za-z0-9._~+\/=-]{20,}/gi,
  /\b[a-f0-9]{48,}\b/gi,
];
// Linear time on any input (2026-10-09 audit B-07): unbounded `*` on BOTH sides
// of the keyword backtracked quadratically on a long word run ("KEYKEY…"), so a
// 240 KB prompt could outlast the hook timeout. Now the name is ONE greedy
// identifier run (a run that is not followed by `=`/`:` fails in O(run) at its
// only word-boundary start), and the keyword test happens in the replacer, so
// names of any length still redact.
// The value is only looked ahead at, so a non-secret assignment does not consume
// a secret one glued to it ("a=12345678;API_KEY=…").
const SECRET_ASSIGNMENT = /\b([A-Za-z0-9_]+)(\s*[=:]\s*)(["']?)(?=[^\s"']{8})/g;
const SECRET_NAME = /KEY|TOKEN|SECRET|PASSWORD|PASSWD/i;
const SECRET_VALUE = /[^\s"']+/y;
const REDACTED = "[REDACTED]";

function redactAssignments(text) {
  let out = "";
  let last = 0;
  SECRET_ASSIGNMENT.lastIndex = 0;
  let m;
  while ((m = SECRET_ASSIGNMENT.exec(text))) {
    if (!SECRET_NAME.test(m[1])) continue;
    SECRET_VALUE.lastIndex = SECRET_ASSIGNMENT.lastIndex;
    const v = SECRET_VALUE.exec(text);
    out += text.slice(last, SECRET_ASSIGNMENT.lastIndex) + REDACTED;
    last = SECRET_VALUE.lastIndex;
    SECRET_ASSIGNMENT.lastIndex = last;
    if (!v) break; // unreachable: the lookahead guaranteed a value
  }
  return out + text.slice(last);
}

function redactSecrets(text) {
  let out = String(text ?? "");
  for (const re of SECRET_PATTERNS) out = out.replace(re, REDACTED);
  return redactAssignments(out);
}

function redactDeep(value) {
  if (typeof value === "string") return redactSecrets(value);
  if (Array.isArray(value)) return value.map(redactDeep);
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, redactDeep(v)]));
  return value;
}

// ── Transports ──────────────────────────────────────────────────────────────

async function safeText(res) {
  try {
    return await res.text();
  } catch {
    return "";
  }
}

/**
 * HTTP transport: async (body) → response JSON. One retry on 429/529 after
 * `retryDelayMs`; every other non-2xx throws. The api key is never placed in
 * an error message (the message is built from status + the server's body).
 */
function httpTransport({
  apiKey,
  model = DEFAULT_MODEL,
  timeoutMs = 3000,
  fetchImpl = globalThis.fetch,
  endpoint = DEFAULT_ENDPOINT,
  retryDelayMs = 500,
} = {}) {
  if (!apiKey) throw new Error("httpTransport: apiKey is required");
  if (typeof fetchImpl !== "function") throw new Error("httpTransport: no fetch implementation");
  return async function transport(body) {
    const payload = JSON.stringify({ ...body, model: body.model ?? model });
    for (let attempt = 1; ; attempt++) {
      const ctl = new AbortController();
      const timer = setTimeout(() => ctl.abort(), timeoutMs);
      let res;
      try {
        res = await fetchImpl(endpoint, {
          method: "POST",
          headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
          body: payload,
          signal: ctl.signal,
        });
      } catch (err) {
        clearTimeout(timer);
        const e = new Error(`typesafe request failed: ${err && err.name === "AbortError" ? `timeout after ${timeoutMs}ms` : err.message || err}`);
        e.cause = err;
        throw e;
      }
      clearTimeout(timer);
      if (res.ok) return res.json();
      if ((res.status === 429 || res.status === 529) && attempt === 1) {
        await sleep(retryDelayMs);
        continue;
      }
      const text = await safeText(res);
      const e = new Error(`typesafe ${res.status}: ${text.slice(0, 200)}`);
      e.status = res.status;
      throw e;
    }
  };
}

/**
 * Canned transport for tests and the hook's OPCHAIN_ROUTE_TRANSPORT_FIXTURE
 * seam (OPCHAIN_ROUTE_TRANSPORT_CAPTURE adds a body capture file). File shape:
 * { request1: <response>, request2: <response> } chosen by
 * whether the outgoing body carries the `which` question; or { error: "msg" }
 * to simulate a transport failure. A flat { answers: {...} } is returned for
 * both requests.
 */
function fixtureTransport(fixture, { captureFile } = {}) {
  const data = typeof fixture === "string" ? JSON.parse(fs().readFileSync(fixture, "utf8")) : fixture;
  return async function transport(body) {
    // captureFile (hook: OPCHAIN_ROUTE_TRANSPORT_CAPTURE) records every outgoing
    // body as JSONL so tests can see exactly what would have been sent.
    if (captureFile) {
      try {
        fs().appendFileSync(captureFile, JSON.stringify(body) + "\n");
      } catch {
        /* capture is a test aid */
      }
    }
    if (data.error) throw new Error(String(data.error));
    const isFirst = body && body.questions && Object.prototype.hasOwnProperty.call(body.questions, "which");
    const picked = isFirst ? data.request1 : data.request2;
    const res = picked ?? data;
    return structuredClone(res);
  };
}

// ── One request ─────────────────────────────────────────────────────────────

function assertOptionCount(criteria, label) {
  const n = Object.keys(criteria || {}).length;
  if (n > MAX_OPTIONS) throw new Error(`${label}: ${n} options exceeds the ${MAX_OPTIONS}-option limit`);
  if (n < 2) throw new Error(`${label}: a choice needs at least two options`);
}

/** Throw on a question the API would reject (unknown type, a Choice with <2 or >255 options). */
function validateQuestions(questions) {
  if (!questions || typeof questions !== "object" || !Object.keys(questions).length) throw new Error("ask: questions is required");
  for (const [id, q] of Object.entries(questions)) {
    if (!q || typeof q !== "object") throw new Error(`ask: question ${id} is not an object`);
    if (q.type === "choice") assertOptionCount(q.criteria, `ask: ${id}`);
    else if (q.type !== "noul") throw new Error(`ask: question ${id} has unknown type ${JSON.stringify(q.type)}`);
  }
}

function usageOf(res) {
  const u = res && res.usage;
  return { input_tokens: (u && Number(u.input_tokens)) || 0, output_tokens: (u && Number(u.output_tokens)) || 0 };
}

function addUsage(total, res) {
  const u = usageOf(res);
  total.input_tokens += u.input_tokens;
  total.output_tokens += u.output_tokens;
  return total;
}

/**
 * ask({ transport, state, questions, model? }) → { answers, usage, model, ms }.
 * `state` is redacted before it is sent. Throws what the transport throws
 * (callers that must never throw, like the hook, catch at their boundary).
 */
async function ask({ transport, state, questions, model } = {}) {
  if (typeof transport !== "function") throw new Error("ask: transport is required");
  validateQuestions(questions);
  const t0 = Date.now();
  const body = { state: redactDeep(state ?? {}), questions };
  if (model) body.model = model;
  const res = await transport(body);
  return {
    answers: (res && res.answers) || {},
    usage: usageOf(res),
    model: (res && res.model) || null,
    ms: Date.now() - t0,
  };
}

// ── Answer readers ──────────────────────────────────────────────────────────

function clamp01(x) {
  const n = Number(x);
  if (!Number.isFinite(n)) return null;
  return Math.min(1, Math.max(0, n));
}

/** The Noul probability of answer `id`, clamped to [0, 1], or null when absent. */
function noul(answers, id) {
  const a = answers && answers[id];
  return a && Object.prototype.hasOwnProperty.call(a, "noul") ? clamp01(a.noul) : null;
}

/** { choice, probability, probabilities, confidence } of Choice answer `id`, or null when absent. */
function choice(answers, id) {
  const a = answers && answers[id];
  if (!a || typeof a.choice !== "string") return null;
  const probabilities = a.probabilities && typeof a.probabilities === "object" ? a.probabilities : {};
  const confidence = Number.isFinite(Number(a.confidence)) ? Number(a.confidence) : computeConfidence(probabilities);
  return { choice: a.choice, probability: clamp01(probabilities[a.choice]), probabilities, confidence };
}

/** (pmax − 1/n) / (1 − 1/n), the API's confidence for a Choice. */
function computeConfidence(probabilities) {
  const vals = Object.values(probabilities || {}).map(Number).filter(Number.isFinite);
  const n = vals.length;
  if (n < 2) return n === 1 ? 1 : 0;
  const pmax = Math.max(...vals);
  return Math.max(0, (pmax - 1 / n) / (1 - 1 / n));
}

module.exports = {
  API_KEY_ENV,
  DEFAULT_ENDPOINT,
  DEFAULT_MODEL,
  MAX_OPTIONS,
  REDACTED,
  apiKeyFrom,
  redactSecrets,
  redactDeep,
  httpTransport,
  fixtureTransport,
  assertOptionCount,
  validateQuestions,
  usageOf,
  addUsage,
  ask,
  noul,
  choice,
  clamp01,
  computeConfidence,
};
