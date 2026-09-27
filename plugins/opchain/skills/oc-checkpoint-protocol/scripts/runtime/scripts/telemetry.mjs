#!/usr/bin/env node
/**
 * Telemetry CLI — opt-in, local-first usage metering for the opchain skills
 * pipeline. Backs the /oc-telemetry skill (skills/oc-telemetry-ops).
 *
 * The store is a single local SQLite file at <repo>/.checkpoints/usage.sqlite,
 * **gitignored** (unlike the tracked .checkpoint.json files). It records *that*
 * a skill/phase ran and what it cost — never *what* was in the prompt. The
 * privacy guarantee is structural: prompt text, file paths, project names, and
 * any user identifier are NOT columns, so they cannot be recorded.
 *
 * Subcommands:
 *   enable                 Opt in — create the store + schema if absent and mint
 *                          a random machine-local handle in SQLite metadata.
 *   disable                Opt out locally; metering stops at once.
 *                          The local store is KEPT (deleting it is your call).
 *   status                 Show consent state, store path, handle, row count.
 *   record [--flags]       Append one metered run. NO-OP unless enabled
 *                          (the "opt-out → zero writes" guarantee).
 *
 * Design notes:
 *   - Pure Node, zero deps. Uses node:sqlite (built into Node 22) so there is no
 *     better-sqlite3 / native-addon install step — matches the repo's
 *     "scripts are pure Node, no deps" stance (see scripts/checkpoint.mjs).
 *   - Consent is local SQLite metadata, never a tracked checkpoint field.
 *   - The handle is a random, machine-local id minted at
 *     enable time. It is never derived from any user identity and is never
 *     exported. Re-enabling from off mints a fresh handle (a new local grouping),
 *     matching references/privacy-consent.md.
 */

import { projectName } from './runtime/project.mjs';
import { DatabaseSync } from "node:sqlite";
import { randomBytes } from "node:crypto";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { buildTelemetryAggregate } from "./lib/telemetry-aggregate.mjs";
import { createLocalCheckpointStore } from "../src/lib/mcp/local-checkpoint-store.js";
import { readCheckpointRecord, writeCheckpointRecord } from "../src/lib/mcp/checkpoint-store.js";

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const ROOT = process.env.OPCHAIN_ROOT ?? REPO_ROOT;
const DIR = process.env.OPCHAIN_CHECKPOINTS_DIR ?? join(ROOT, ".checkpoints");
const SINK_REL = ".checkpoints/usage.sqlite";
const SINK = join(ROOT, SINK_REL);
const PRIVATE_METADATA_REL = ".checkpoints/.local/telemetry";
const PRIVATE_METADATA_ROOT = join(ROOT, PRIVATE_METADATA_REL);
const SCHEMA_VERSION = "1.1";
const SKILLS_DIR = process.env.OPCHAIN_SKILLS_DIR ?? join(REPO_ROOT, "skills");
const VALID_TIERS = new Set(["haiku", "sonnet", "opus", "fable"]);
const VALID_OUTCOMES = new Set(["pass", "fail", "complete"]);
const VALID_EVENT_KINDS = new Set(["eval", "gate", "sprint"]);
const VALID_EVENT_LABELS = new Set(["pass", "fail", "complete", "blocked"]);
const VALID_FLAG_NAMES = new Set([
  "skill", "phase", "command", "tier", "cost", "in", "out", "outcome", "at", "duration", "verbose",
  "run", "kind", "label", "score", "shipped-features", "out",
]);

// ── SQLite schema (mirrors skills/oc-telemetry-ops/references/local-metering.md) ──
// No table stores prompt text, file contents, file paths, or any user identifier.
const SCHEMA = `
CREATE TABLE IF NOT EXISTS runs (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  handle        TEXT NOT NULL,      -- anonymous local id (telemetry_handle.id), NOT user-derived
  skill         TEXT NOT NULL,      -- e.g. "oc-app-architect"
  phase         TEXT,               -- e.g. "build", "spec" (skill-defined; nullable)
  command       TEXT,               -- the verb only, e.g. "/oc-build" (no args)
  model_tier    TEXT,               -- "haiku" | "sonnet" | "opus" | "fable" (tier, not full id)
  cost_usd      REAL,               -- attributed by oc-cost-ops (nullable if not costed)
  input_tokens  INTEGER,            -- counts only, never content
  output_tokens INTEGER,
  outcome       TEXT,               -- "pass" | "fail" | "complete" | null
  started_at    TEXT NOT NULL,      -- ISO-8601 UTC
  duration_ms   INTEGER
);

CREATE TABLE IF NOT EXISTS events (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  run_id     INTEGER NOT NULL REFERENCES runs(id),
  kind       TEXT NOT NULL,         -- "eval" | "gate" | "sprint" | ...
  label      TEXT,                  -- short, non-identifying (e.g. "sprint-2")
  score      REAL,                  -- eval score if applicable (rubric-relative)
  at         TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_runs_skill   ON runs(skill);
CREATE INDEX IF NOT EXISTS idx_runs_started ON runs(started_at);

-- Consent and the anonymous handle are machine-local state. This table lives
-- in the gitignored SQLite store, never in a tracked checkpoint.
CREATE TABLE IF NOT EXISTS telemetry_meta (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
`;

const nowISO = () => new Date().toISOString();
const mintHandle = () => `anon-${randomBytes(4).toString("hex")}`;

function openStore() {
  if (!existsSync(DIR)) mkdirSync(DIR, { recursive: true });
  const db = new DatabaseSync(SINK);
  db.exec(SCHEMA);
  return db;
}

function getMeta(db, key) {
  return db.prepare("SELECT value FROM telemetry_meta WHERE key = ?").get(key)?.value ?? null;
}

function setMeta(db, key, value) {
  db.prepare(
    "INSERT INTO telemetry_meta (key, value) VALUES (?, ?) " +
    "ON CONFLICT(key) DO UPDATE SET value = excluded.value",
  ).run(key, value);
}

function readLocalConsent() {
  // Never open a missing database here: a cloned tracked checkpoint must not
  // create a local telemetry store or imply consent.
  if (!existsSync(SINK)) return { enabled: false, id: null, since: null };
  const db = new DatabaseSync(SINK, { readOnly: true });
  try {
    return {
      enabled: getMeta(db, "consent_enabled") === "true",
      id: getMeta(db, "handle"),
      since: getMeta(db, "consent_since"),
    };
  } catch {
    // Pre-E1 stores have no telemetry_meta table. They are preserved but are
    // off until their local user explicitly enables telemetry again.
    return { enabled: false, id: null, since: null };
  } finally {
    db.close();
  }
}

function catalog() {
  const skills = new Set();
  const phases = new Set();
  const commands = new Set();
  if (!existsSync(SKILLS_DIR)) {
    const bundled = join(dirname(fileURLToPath(import.meta.url)), 'runtime/catalog.json');
    if (!process.env.OPCHAIN_SKILLS_DIR && existsSync(bundled)) {
      const values = JSON.parse(readFileSync(bundled, 'utf8'));
      return { skills: new Set(values.skills), phases: new Set(values.phases), commands: new Set(values.commands) };
    }
    return { skills, phases, commands };
  }
  for (const entry of readdirSync(SKILLS_DIR, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const file = join(SKILLS_DIR, entry.name, "SKILL.md");
    if (!existsSync(file)) continue;
    skills.add(entry.name);
    const source = readFileSync(file, "utf8");
    const phaseList = /^phases:\s*\[([^\]]*)\]/m.exec(source)?.[1] ?? "";
    for (const phase of phaseList.split(",").map((x) => x.trim()).filter(Boolean)) phases.add(phase);
    const commandBlock = /^commands:\s*\n((?:[ \t]+-\s*[^\n]+\n?)*)/m.exec(source)?.[1] ?? "";
    for (const line of commandBlock.matchAll(/^[ \t]+-\s*([^\s"']+)/gm)) {
      const verb = line[1].replace(/^['"]|['"]$/g, "");
      if (/^\/oc-[a-z0-9-]+$/.test(verb)) commands.add(verb);
    }
  }
  return { skills, phases, commands };
}

function validationErrors(flags) {
  const errors = [];
  const { skills, phases, commands } = catalog();
  if (!flags.skill) errors.push("record: --skill is required");
  else if (!skills.has(flags.skill)) errors.push(`record: unknown catalog skill ${JSON.stringify(flags.skill)}`);
  if (flags.phase != null && !phases.has(flags.phase)) errors.push(`record: unknown catalog phase ${JSON.stringify(flags.phase)}`);
  if (flags.command != null && !commands.has(flags.command)) {
    errors.push("record: --command must be one catalog command verb with no arguments");
  }
  if (flags.tier != null && !VALID_TIERS.has(flags.tier)) errors.push(`record: invalid --tier ${JSON.stringify(flags.tier)}`);
  if (flags.outcome != null && !VALID_OUTCOMES.has(flags.outcome)) errors.push(`record: invalid --outcome ${JSON.stringify(flags.outcome)}`);
  for (const [name, integer] of [["cost", false], ["in", true], ["out", true], ["duration", true]]) {
    if (flags[name] == null) continue;
    const raw = flags[name];
    const value = Number(raw);
    if (typeof raw !== "string" || raw.trim() === "" || !Number.isFinite(value) || value < 0 || (integer && !Number.isSafeInteger(value))) {
      errors.push(`record: --${name} must be a non-negative ${integer ? "safe integer" : "finite number"}`);
    }
  }
  if (flags.at != null && (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(flags.at) || Number.isNaN(Date.parse(flags.at)))) {
    errors.push("record: --at must be an ISO-8601 UTC timestamp");
  }
  return errors;
}

function eventValidationErrors(flags) {
  const errors = [];
  if (typeof flags.run !== "string" || !/^\d+$/.test(flags.run) || Number(flags.run) < 1 || !Number.isSafeInteger(Number(flags.run))) {
    errors.push("event: --run must be a positive safe integer");
  }
  if (!VALID_EVENT_KINDS.has(flags.kind)) errors.push("event: --kind must be eval|gate|sprint");
  if (flags.label != null && !VALID_EVENT_LABELS.has(flags.label) && !/^sprint-[1-9]\d*$/.test(flags.label)) {
    errors.push("event: --label must be pass|fail|complete|blocked or sprint-N");
  }
  if (flags.score != null) {
    const score = Number(flags.score);
    if (typeof flags.score !== "string" || flags.score.trim() === "" || !Number.isFinite(score) || score < 0 || score > 1) {
      errors.push("event: --score must be a finite number from 0 through 1");
    }
  }
  if (flags.at != null && (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(flags.at) || Number.isNaN(Date.parse(flags.at)))) {
    errors.push("event: --at must be an ISO-8601 UTC timestamp");
  }
  return errors;
}

function aggregateValidationErrors(flags, { exportPath = false } = {}) {
  const errors = [];
  if (flags["shipped-features"] != null) {
    const value = Number(flags["shipped-features"]);
    if (typeof flags["shipped-features"] !== "string" || flags["shipped-features"].trim() === "" || !Number.isSafeInteger(value) || value < 0) {
      errors.push("aggregate: --shipped-features must be a non-negative safe integer");
    }
  }
  if (exportPath && (typeof flags.out !== "string" || flags.out.trim() === "")) {
    errors.push("export: --out is required and must name a new local file");
  }
  return errors;
}

function requireLocalConsent(action) {
  const consent = readLocalConsent();
  if (!consent.enabled) {
    console.error(`${action}: telemetry is OFF; run enable locally before producing telemetry artifacts`);
    return null;
  }
  return consent;
}

function telemetryCheckpoint(aggregate, current = null) {
  const now = nowISO();
  const prior = current && typeof current === "object" ? current : {};
  return {
    ...prior,
    protocol_version: prior.protocol_version ?? SCHEMA_VERSION,
    skill: "oc-telemetry-ops",
    project: prior.project ?? projectName(ROOT),
    project_dir: prior.project_dir ?? ROOT,
    created_at: prior.created_at ?? now,
    updated_at: now,
    record_updated_at: now,
    phase: "build",
    step: "telemetry-aggregate-created",
    status: "in_progress",
    progress_summary: `Telemetry aggregate ${aggregate.schema} created locally; no raw rows or handles exported.`,
    next_actions: ["Review the local aggregate preview before explicitly exporting it."],
    skill_state: {
      ...(prior.skill_state && typeof prior.skill_state === "object" ? prior.skill_state : {}),
      telemetry: {
        schema: aggregate.schema,
        generated_at: aggregate.generated_at,
        skill_runs: aggregate.totals.skill_runs,
        denominator: aggregate.denominator,
        privacy: aggregate.privacy,
      },
    },
  };
}

async function persistAggregateCheckpoint(aggregate) {
  // C3 owns consumer-local initialization. Creating a root session atomically
  // establishes .checkpoints/.gitignore (including .local/) before telemetry
  // checks or writes its private subtree; no E-owned ignore writer exists.
  const bootstrapStore = createLocalCheckpointStore({ projectDir: ROOT });
  await bootstrapStore.createSession();
  const privateCheckpoint = join(PRIVATE_METADATA_ROOT, ".checkpoints", "oc-telemetry-ops.checkpoint.json");
  const ignored = spawnSync("git", ["check-ignore", "-q", relative(ROOT, privateCheckpoint)], {
    cwd: ROOT,
    stdio: "ignore",
  });
  if (ignored.status !== 0) {
    throw new Error(
      `private telemetry metadata root ${PRIVATE_METADATA_REL} is not ignored; refusing to write usage metadata`,
    );
  }
  const store = createLocalCheckpointStore({ projectDir: PRIVATE_METADATA_ROOT });
  const session = await store.createSession();
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const current = await readCheckpointRecord(store, "oc-telemetry-ops", session);
    try {
      await writeCheckpointRecord(
        store,
        "oc-telemetry-ops",
        session,
        telemetryCheckpoint(aggregate, current.checkpoint),
        { expectedRevision: current.revision },
      );
      return;
    } catch (error) {
      if (error?.code !== "CHECKPOINT_CONFLICT" || attempt === 1) throw error;
    }
  }
}

function buildAggregate(flags) {
  const db = new DatabaseSync(SINK, { readOnly: true });
  try {
    return buildTelemetryAggregate(db, {
      shippedFeatures: flags["shipped-features"] == null ? null : Number(flags["shipped-features"]),
    });
  } finally {
    db.close();
  }
}

// ── enable ─────────────────────────────────────────────────────────────────
function cmdEnable() {
  const previous = readLocalConsent();
  const db = openStore();
  const already = previous.enabled;
  const id = already && previous.id ? previous.id : mintHandle();
  const since = already && previous.since ? previous.since : nowISO();
  setMeta(db, "consent_enabled", "true");
  setMeta(db, "handle", id);
  setMeta(db, "consent_since", since);
  db.close();

  console.log("✓ telemetry ENABLED");
  console.log(`  store:  ${SINK_REL}  (created${already ? " earlier" : ""}, gitignored)`);
  console.log(`  handle: ${id}  (random, machine-local, never exported)`);
  console.log(`  since:  ${since}`);
  console.log(`  consent: stored only in ${SINK_REL} (gitignored, machine-local)`);
  return 0;
}

// ── disable ────────────────────────────────────────────────────────────────
function cmdDisable() {
  if (!existsSync(SINK)) {
    console.log("• telemetry is already OFF (no local telemetry store).");
    return 0;
  }
  const db = openStore();
  setMeta(db, "consent_enabled", "false");
  db.close();
  console.log("✓ telemetry DISABLED — metering stopped; local store kept.");
  return 0;
}

// ── status ─────────────────────────────────────────────────────────────────
function cmdStatus() {
  const consent = readLocalConsent();
  const enabled = consent.enabled;
  const notRecording = enabled && !existsSync(SINK);
  console.log(
    `telemetry: ${enabled ? (notRecording ? "ENABLED — NOT RECORDING ⚠" : "ENABLED ✅") : "OFF ⬜"}`,
  );
  if (consent.id) {
    console.log(`  handle: ${consent.id}`);
    console.log(`  since:  ${consent.since ?? "(n/a)"}`);
  }
  console.log(`  store:  ${SINK_REL} ${existsSync(SINK) ? "(present)" : "(absent)"}`);
  if (existsSync(SINK)) {
    const db = new DatabaseSync(SINK, { readOnly: true });
    const { n } = db.prepare("SELECT COUNT(*) AS n FROM runs").get();
    db.close();
    console.log(`  rows:   ${n} metered run${n === 1 ? "" : "s"}`);
  }
  // Liveness guard (v1.9): enabled-with-no-store must never read as healthy —
  // that exact state sat undetected for 24 days in 2026-06/07.
  if (enabled && !existsSync(SINK)) {
    console.error(
      "  ⚠ LIVENESS FAIL: enabled=true but the store does not exist on this machine — " +
        "nothing is being recorded. Run a metered skill to create it, or " +
        "`npm run telemetry -- disable` if this clone should not meter.",
    );
    return 1;
  }
  return 0;
}

// ── record (the metering write path; NO-OP unless enabled) ───────────────────
function cmdRecord(flags, parseErrors = []) {
  const consent = readLocalConsent();
  if (!consent.enabled) {
    // The "opt-out → zero writes" guarantee: disabled/absent telemetry records
    // nothing. Exit 0 — a skipped write is not an error.
    if (flags.verbose) console.log("• telemetry OFF — no row written.");
    return 0;
  }
  const errors = [...parseErrors, ...validationErrors(flags)];
  if (errors.length) {
    for (const error of errors) console.error(error);
    return 1;
  }
  const handle = consent.id;
  const db = openStore();
  const stmt = db.prepare(
    `INSERT INTO runs
      (handle, skill, phase, command, model_tier, cost_usd, input_tokens, output_tokens, outcome, started_at, duration_ms)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  );
  stmt.run(
    handle,
    flags.skill,
    flags.phase ?? null,
    flags.command ?? null,
    flags.tier ?? null,
    flags.cost != null ? Number(flags.cost) : null,
    flags.in != null ? Number(flags.in) : null,
    flags.out != null ? Number(flags.out) : null,
    flags.outcome ?? null,
    flags.at ?? nowISO(),
    flags.duration != null ? Number(flags.duration) : null
  );
  db.close();
  console.log(`✓ recorded run: ${flags.skill}${flags.phase ? `/${flags.phase}` : ""}`);
  return 0;
}

function cmdEvent(flags, parseErrors = []) {
  const consent = requireLocalConsent("event");
  if (!consent) return 1;
  const errors = [...parseErrors, ...eventValidationErrors(flags)];
  if (errors.length) {
    for (const error of errors) console.error(error);
    return 1;
  }
  const db = openStore();
  try {
    const run = db.prepare("SELECT id FROM runs WHERE id = ? AND handle = ?").get(Number(flags.run), consent.id);
    if (!run) {
      console.error("event: --run must identify a run recorded by this local handle");
      return 1;
    }
    db.prepare("INSERT INTO events (run_id, kind, label, score, at) VALUES (?, ?, ?, ?, ?)").run(
      Number(flags.run), flags.kind, flags.label ?? null,
      flags.score == null ? null : Number(flags.score), flags.at ?? nowISO(),
    );
  } finally {
    db.close();
  }
  console.log(`✓ recorded ${flags.kind} event for run ${flags.run}`);
  return 0;
}

async function cmdAggregate(flags, parseErrors = []) {
  const consent = requireLocalConsent("aggregate");
  if (!consent) return 1;
  const errors = [...parseErrors, ...aggregateValidationErrors(flags)];
  if (errors.length) {
    for (const error of errors) console.error(error);
    return 1;
  }
  const aggregate = buildAggregate(flags);
  await persistAggregateCheckpoint(aggregate);
  console.log(JSON.stringify(aggregate, null, 2));
  return 0;
}

async function cmdExport(flags, parseErrors = []) {
  const consent = requireLocalConsent("export");
  if (!consent) return 1;
  const errors = [...parseErrors, ...aggregateValidationErrors(flags, { exportPath: true })];
  if (errors.length) {
    for (const error of errors) console.error(error);
    return 1;
  }
  const target = resolve(ROOT, flags.out);
  if (existsSync(target)) {
    console.error("export: --out must name a new local file; existing files are never overwritten");
    return 1;
  }
  const aggregate = buildAggregate(flags);
  await persistAggregateCheckpoint(aggregate);
  writeFileSync(target, `${JSON.stringify(aggregate, null, 2)}\n`, { encoding: "utf8", flag: "wx", mode: 0o600 });
  console.log(`✓ exported anonymized aggregate: ${rel(target)}`);
  return 0;
}

function rel(p) {
  return p.startsWith(ROOT) ? p.slice(ROOT.length + 1) : p;
}

function parseFlags(argv) {
  const flags = {};
  const errors = [];
  for (const a of argv) {
    const m = /^--([^=]+)(?:=(.*))?$/.exec(a);
    if (!m) {
      errors.push(`invalid argument: ${a}`);
      continue;
    }
    if (!VALID_FLAG_NAMES.has(m[1])) errors.push(`unknown flag: --${m[1]}`);
    else flags[m[1]] = m[2] === undefined ? true : m[2];
  }
  return { flags, errors };
}

async function main() {
  const [cmd, ...rest] = process.argv.slice(2);
  const { flags, errors } = parseFlags(rest);
  if (cmd === "record") return cmdRecord(flags, errors);
  if (cmd === "event") return cmdEvent(flags, errors);
  if (cmd === "aggregate") return cmdAggregate(flags, errors);
  if (cmd === "export") return cmdExport(flags, errors);
  if (errors.length) {
    for (const error of errors) console.error(error);
    return 1;
  }
  switch (cmd) {
    case "enable":  return cmdEnable();
    case "disable": return cmdDisable();
    case "status":
    case undefined: return cmdStatus();
    default:
      console.error(`unknown command: ${cmd}`);
      console.error("usage: telemetry <enable|disable|status|record|event|aggregate|export>");
      return 1;
  }
}

main().then((code) => process.exit(code)).catch((error) => {
  console.error(`telemetry: ${error.message}`);
  process.exit(1);
});
