#!/usr/bin/env node
/**
 * Checkpoint CLI — read, validate, update, and reconcile opchain skill checkpoints.
 *
 * Files live at <repo>/.checkpoints/<skill>.checkpoint.json and are
 * tracked in git as living "session state docs". See
 * .checkpoints/README.md for the schema.
 *
 * Subcommands:
 *   status [skill] [--brief] [--since=ISO]
 *                                     Print a markdown session-resume summary; with
 *                                     a skill, just that checkpoint (exit 1 if absent).
 *   next                              Print the single highest-priority NON-STALE
 *                                     next action (skips actions whose PR/ticket
 *                                     already shows merged — same drift evidence
 *                                     `doctor` uses — and recommends reconciliation
 *                                     when every queued action is stale).
 *   doctor [--online] [--fail-on-warnings]
 *                                     Cross-check checkpoints against ground truth
 *                                     (git, filesystem, optionally the approved
 *                                     deployment baseline + /api/health) and
 *                                     report drift. Exit 1 on hard inconsistencies;
 *                                     --fail-on-warnings also exits 1 on warnings.
 *   list                              List every checkpoint file with a one-line status.
 *   show [skill]                      Print full JSON for one checkpoint, or all.
 *   reset <skill>                     Archive a checkpoint into .checkpoints/history/.
 *   validate [--strict]               Exit 0 if all checkpoints satisfy the schema.
 *                                     --strict promotes warnings to errors.
 *   update <skill> [--field=value...] Read existing checkpoint (or scaffold), apply
 *                                     updates, stamp updated_at, validate, write.
 *                                     Creating a file requires --next_actions:json.
 *   handoff <skill> --policy <id> --verdict PASS|FAIL|INCOMPLETE --scope "<text>"
 *           [--evidence <path>]... [--summary "<text>"] [--run-id <id>] [--json]
 *                                     Bind a C-contract verification.verdict handoff
 *                                     to the current git_tree_projection candidate —
 *                                     the entry scripts/lib/release-evidence.mjs
 *                                     (pre-PR / pre-deploy gates) looks up.
 *   done <skill>                      Pop next_actions[0] into recently_done + restamp.
 *   init                              Scaffold .checkpoints/ on a fresh project.
 *
 * Design notes:
 *   - Pure Node, zero deps. The validator is hand-rolled against the schema
 *     in this file (mirrors .checkpoints/README.md). Adding ajv would pull in
 *     a sub-tree we don't need.
 *   - `status` is the canonical session-resume command. CLAUDE.md tells the
 *     next session to run it on boot. `next` is the "what do I do right now?"
 *     companion — it encodes the priority hierarchy that used to live only in
 *     orchestrator prose, so it works without the orchestrator's registry.
 *   - `doctor` exists because checkpoints drift from reality (shipped-but-says-
 *     pending, stale next_actions, wrong project_dir). It catches that drift
 *     deterministically instead of waiting for a human to notice.
 *   - `update` preserves its exact CLI contract — several skills shell out to
 *     `update <skill> --field=value`.
 *
 * Schema version vs skill release version:
 *   `protocol_version` is the ON-DISK schema version. It is currently "1.1"
 *   (v1.6 release) and changes only when the file shape grows. v1.1 added the
 *   additive optional fields cost / eval_scores / telemetry_handle; both "1.0"
 *   and "1.1" validate (1.0 checkpoints stay valid, new writes stamp "1.1",
 *   oc-migration-ops sweeps 1.0 → 1.1). It is NOT the checkpoint-protocol
 *   *skill* release version (that lives in skills/oc-checkpoint-protocol/SKILL.md
 *   frontmatter and moves independently as the docs/tooling evolve).
 */

import { accessSync, constants, readdirSync, readFileSync, writeFileSync, existsSync, mkdirSync, renameSync, statSync, realpathSync, unlinkSync } from "node:fs";
import { dirname, join, basename, resolve, delimiter } from "node:path";
import { fileURLToPath } from "node:url";
import { createHash, randomUUID } from "node:crypto";
import { execSync, spawnSync } from "node:child_process";

const ROOT = process.env.OPCHAIN_ROOT ?? dirname(dirname(fileURLToPath(import.meta.url)));
const DIR  = process.env.OPCHAIN_CHECKPOINTS_DIR ?? join(ROOT, ".checkpoints");
const LOCK_HELD_ENV = "OPCHAIN_CHECKPOINT_LOCK_HELD";

function executable(path) {
  try {
    accessSync(path, constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

/** Same supported-host contract as the local MCP filesystem provider. */
function resolveCheckpointLock({ platform = process.platform, pathEnv = process.env.PATH || "" } = {}) {
  if (platform === "darwin") {
    if (!executable("/usr/bin/lockf")) throw new Error("atomic checkpoint writes on macOS require executable /usr/bin/lockf");
    return { platform, command: "/usr/bin/lockf" };
  }
  if (platform === "linux") {
    const command = pathEnv.split(delimiter).filter(Boolean).map((dir) => resolve(dir, "flock")).find(executable);
    if (!command) throw new Error("atomic checkpoint writes on Linux require the `flock` executable on PATH");
    return { platform, command };
  }
  throw new Error(`atomic checkpoint writes support macOS (with /usr/bin/lockf) and Linux (with flock); ${platform} is unsupported`);
}

function atomicWriteFile(path, contents, { onTempReady } = {}) {
  const temp = join(dirname(path), `.${basename(path)}.${process.pid}.${randomUUID()}.tmp`);
  try {
    writeFileSync(temp, contents, { encoding: "utf8", mode: 0o600, flag: "wx" });
    if (typeof onTempReady === "function") onTempReady(temp);
    renameSync(temp, path);
  } finally {
    if (existsSync(temp)) unlinkSync(temp);
  }
}

/** On-disk schema version stamped on new writes. See header note: distinct from
 *  the skill release version. v1.1 (v1.6 release) added the additive optional
 *  fields cost / eval_scores / telemetry_handle. */
const SCHEMA_VERSION = "1.1";
/** Wire versions the validator accepts. 1.0 checkpoints predate the v1.1 fields and
 *  stay valid (those fields are optional); oc-migration-ops sweeps 1.0 → 1.1. */
const ACCEPTED_SCHEMA_VERSIONS = ["1.0", "1.1"];

/** The placeholder `update` scaffolds into next_actions. It used to validate, shipped
 *  on main for oc-security-auditor from v2.0.0 through 2.0.4, and the plugin's
 *  next-suggestion hook re-advertised it five times (2026-10-08 audit, I-06). Only an
 *  untouched scaffold (phase "init" / step "scaffolded") may carry it. */
const SCAFFOLD_NEXT_ACTION = "Define the first real next action for this skill.";

/** Skill source tree, present only in the authoring repo. Consumer repos have none,
 *  so the phase allowlist below is simply absent there. */
const SKILLS_DIR = process.env.OPCHAIN_SKILLS_DIR ?? join(ROOT, "skills");
const phaseDeclarations = new Map();

/**
 * Values of the YAML list under `key:` in a SKILL.md frontmatter block — flow form
 * (`key: [a, b]`) or block form (`key:` followed by `  - a` lines). Hand-rolled on
 * purpose: this CLI stays zero-dep so it can be copied into consumer repos.
 * Returns null when the key is absent.
 */
function frontmatterList(frontmatter, key) {
  const m = frontmatter.match(new RegExp(`^${key}:[ \\t]*(.*)$`, "m"));
  if (!m) return null;
  const clean = (s) => s.trim().replace(/^["']|["']$/g, "");
  const inline = m[1].replace(/\s+#.*$/, "").trim();
  if (inline.startsWith("[")) {
    return inline.replace(/^\[/, "").replace(/\]\s*$/, "").split(",").map(clean).filter(Boolean);
  }
  if (inline) return [clean(inline)];
  const items = [];
  for (const line of frontmatter.slice(m.index + m[0].length).split("\n")) {
    const item = line.match(/^\s+-\s+(.+)$/);
    if (item) { items.push(clean(item[1].replace(/\s+#.*$/, ""))); continue; }
    if (line.trim() === "") continue;
    break;
  }
  return items;
}

/**
 * Which checkpoint `phase` ids a skill declares, read from skills/<skill>/SKILL.md:
 *   - `checkpoint_phases: [...]` in the frontmatter → strict: an unknown phase is a
 *     validation ERROR (I-09: `master-2-workstreams` passed checkpoint:validate).
 *   - otherwise the frontmatter `phases:` list — which is the pipeline taxonomy
 *     (foundation|plan|build|ai-native), not the checkpoint vocabulary — plus every
 *     `"phase": "<id>"` / `--phase=<id>` example in the body → advisory: an unknown
 *     phase is a WARNING. When this landed, 16 of 17 tracked checkpoints used ids
 *     outside `phases:`, so a hard check there would have failed CI on main.
 * null when there is no SKILL.md (consumer repo, or a checkpoint that is not a skill).
 */
function skillPhaseDeclaration(skill) {
  if (typeof skill !== "string" || !/^[a-z][a-z0-9-]*$/.test(skill)) return null;
  if (phaseDeclarations.has(skill)) return phaseDeclarations.get(skill);
  let decl = null;
  const file = join(SKILLS_DIR, skill, "SKILL.md");
  if (existsSync(file)) {
    const raw = readFileSync(file, "utf8");
    const fm = raw.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/);
    const frontmatter = fm ? fm[1] : "";
    const strictList = frontmatterList(frontmatter, "checkpoint_phases");
    if (strictList && strictList.length) {
      decl = { strict: true, source: "checkpoint_phases", allowed: [...new Set(strictList)] };
    } else {
      const allowed = new Set(frontmatterList(frontmatter, "phases") ?? []);
      for (const m of raw.matchAll(/"phase":\s*"([a-z0-9][a-z0-9-]*)"/g)) allowed.add(m[1]);
      for (const m of raw.matchAll(/--phase=([a-z0-9][a-z0-9-]*)/g)) allowed.add(m[1]);
      if (allowed.size) decl = { strict: false, source: "phases", allowed: [...allowed] };
    }
  }
  phaseDeclarations.set(skill, decl);
  return decl;
}

/** Required scalar fields (hard errors if missing). */
const REQUIRED = [
  "protocol_version",
  "skill",
  "project",
  "project_dir",
  "created_at",
  "updated_at",
  "phase",
  "step",
  "status",
  "progress_summary",
];
const STATUS_ENUM = ["in_progress", "blocked", "complete", "failed"];
// Row statuses are a SUPERSET of the top-level status enum: a row can be
// "not_started" (nothing has happened yet) which is meaningless for a whole
// checkpoint. Kept separate deliberately; documented in .checkpoints/README.md.
const ROW_STATUS = ["complete", "in_progress", "not_started", "blocked", "failed"];
const NEEDS_ENUM = ["user_decision", "code_fix", "external_dep"];
const PM_ROLE_ENUM = ["source", "child", "deploy", "incident", "linked"];
// ISO-8601 date-time with a zone: `Z` (what the CLI and Date#toISOString write) or
// a numeric offset. A hand-written `+00:00` is valid ISO-8601 and a first-class
// checkpoint per the protocol; rejecting it failed CI on files every reader parses.
const ISO_SHAPE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-](?:[01]\d|2[0-3]):[0-5]\d)$/;
/** Shape AND a real instant: `+99:99` or month 13 match a loose shape but parse to
 *  NaN, which silently disabled every age check downstream. */
const ISO = { test: (v) => typeof v === "string" && ISO_SHAPE.test(v) && !Number.isNaN(Date.parse(v)) };

/** Soft size guidance. The resumable core should stay small; runaway growth in
 *  skill_state (append-only telemetry) is the usual culprit and the thing that
 *  causes merge conflicts. We only WARN, and only well above current real files. */
const SIZE_WARN_BYTES = 32 * 1024;
/** progress_summary is read on every resume; keep it scannable. Soft warn only. */
const SUMMARY_WARN_CHARS = 1200;
/** A checkpoint older than this with status in_progress is probably stale. */
const STALE_DAYS = 7;
/**
 * A `complete` checkpoint is not exempt from staleness — it is the artifact most
 * likely to rot, because it asserts a finished state that history then moves past.
 * (2026-07-20: oc-orchestrator sat `complete` at v1.5.0 for 27 days and three minor
 * releases while `doctor` stayed silent, because the drift check required
 * status === "in_progress".) Longer window than STALE_DAYS: a finished phase is
 * allowed to sit for a while before it counts as drift.
 */
const STALE_COMPLETE_DAYS = 14;
/** Blocked work goes cold fastest — someone is waiting on a decision. */
const STALE_BLOCKED_DAYS = 3;

/** Staleness threshold for a given status, or null if the status never goes stale. */
function staleThresholdFor(status) {
  if (status === "in_progress") return STALE_DAYS;
  if (status === "complete") return STALE_COMPLETE_DAYS;
  if (status === "blocked") return STALE_BLOCKED_DAYS;
  return null; // "failed" is a terminal record; age is not drift.
}

/**
 * A generated_files entry reduced to a repo-relative path worth existence-checking,
 * or null. Entries are free text ("spec.md", "src/a.ts (this file, updated)",
 * "packs/x.yml updated with frameworks: [...]"), so take the first token and keep
 * it only if it reads like a path: no scheme, not absolute, no glob or brace
 * shorthand, and either a directory separator or a file extension. This replaced
 * a ten-prefix allowlist that skipped docs/, tests/, specs/, plugins/ and root files.
 */
function repoPathCandidate(entry) {
  const p = String(entry).trim().split(/\s+/)[0].replace(/^[`'"]+|[`'",;]+$/g, "").replace(/:\d+(?::\d+)?$/, "").replace(/:+$/, "");
  if (!p || /:\/\//.test(p) || /^[/~]/.test(p) || /(^|\/)\.\.(\/|$)/.test(p) || /[{}*[\]]/.test(p)) return null;
  if (/^v?\d+(?:\.\d+)+$/.test(p)) return null;          // a version, not a file
  if (!p.includes("/")) {
    if (!/\.(?:md|mdx|json|jsonc|js|mjs|cjs|ts|tsx|astro|ya?ml|toml|html|css|sh|py|txt|docx|png|svg|lock)$/i.test(p)) return null;
    if (/^[A-Z][a-z]+\.js$/.test(p)) return null;           // Node.js, Vue.js — a product name
  }
  return p;
}

/** "ancestor" | "not-ancestor" | "missing" | "unknown" (no git). */
function commitInHistory(sha) {
  const opts = { cwd: ROOT, stdio: ["ignore", "ignore", "ignore"] };
  try { execSync("git rev-parse --git-dir", opts); } catch { return "unknown"; }
  // A shallow clone (CI's default checkout) lacks history, so every recorded SHA
  // would read as missing. Say nothing rather than warn on every file.
  try {
    if (execSync("git rev-parse --is-shallow-repository", { cwd: ROOT, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim() === "true") return "unknown";
  } catch { /* old git: assume a full clone */ }
  try { execSync(`git cat-file -e ${sha}^{commit}`, opts); } catch { return "missing"; }
  try { execSync(`git merge-base --is-ancestor ${sha} HEAD`, opts); return "ancestor"; } catch { return "not-ancestor"; }
}

function listCheckpoints() {
  if (!existsSync(DIR)) return [];
  return readdirSync(DIR)
    .filter((f) => f.endsWith(".checkpoint.json"))
    .sort()
    .map((f) => join(DIR, f));
}

function readCheckpoint(path) {
  const raw = readFileSync(path, "utf8");
  try { return { path, data: JSON.parse(raw), bytes: Buffer.byteLength(raw) }; }
  catch (err) { throw new Error(`${path}: invalid JSON — ${err.message}`); }
}

function daysSince(iso) {
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return null;
  return (Date.now() - t) / 86_400_000;
}

/** A next_action may be a plain string or { text, done_when }. Normalize to text. */
function actionText(a) {
  if (a == null) return "";
  if (typeof a === "string") return a;
  if (typeof a === "object" && typeof a.text === "string") return a.text;
  return String(a);
}

/** Harvest PR/ticket tokens (#NNN, ABC-123) from a string into `into`. */
function harvestTokens(str, into = new Set()) {
  if (typeof str === "string") {
    for (const m of str.matchAll(/#(\d+)/g)) into.add(`#${m[1]}`);
    for (const m of str.matchAll(/\b([A-Z]{2,}-\d+)\b/g)) into.add(m[1]);
  }
  return into;
}

/** Does an action's text reference a PR/ticket that already shows merged/done?
 *  Such an action would tell the next session to redo shipped work — `next`
 *  skips it, `doctor` flags it. An empty/missing token set ⇒ never stale, so
 *  callers that don't compute drift evidence keep the old behaviour. */
function actionIsStale(text, staleTokens) {
  if (!staleTokens || staleTokens.size === 0) return false;
  for (const tok of harvestTokens(text)) if (staleTokens.has(tok)) return true;
  return false;
}

/** From a checkpoint's next_actions, return the first NON-stale action's text,
 *  plus how many leading stale actions were skipped. allStale ⇒ every queued
 *  action references already-shipped work (caller recommends reconciliation). */
function firstFreshAction(actions, staleTokens) {
  let skipped = 0;
  for (const a of (Array.isArray(actions) ? actions : [])) {
    const txt = actionText(a);
    if (txt && actionIsStale(txt, staleTokens)) { skipped++; continue; }
    return { action: txt, skipped, allStale: false };
  }
  return { action: "", skipped, allStale: skipped > 0 };
}

/**
 * Validate one checkpoint.
 * Returns { errors: string[], warnings: string[] }.
 * errors fail CI (exit 1); warnings are advisory (exit 0) unless --strict.
 */
function validate(path, data, bytes = 0) {
  const errors = [];
  const warnings = [];
  const file = basename(path);

  for (const k of REQUIRED) {
    if (data[k] === undefined || data[k] === null || data[k] === "") {
      errors.push(`missing required field "${k}"`);
    }
  }
  if (data.protocol_version && !ACCEPTED_SCHEMA_VERSIONS.includes(data.protocol_version)) {
    errors.push(
      `protocol_version must be a supported on-disk schema version ` +
      `(${ACCEPTED_SCHEMA_VERSIONS.map((v) => `"${v}"`).join(" or ")}); got ` +
      `${JSON.stringify(data.protocol_version)}. This is the wire-format version, ` +
      `not the checkpoint-protocol skill release version.`
    );
  }
  if (data.status && !STATUS_ENUM.includes(data.status)) {
    errors.push(`status must be one of ${STATUS_ENUM.join("|")} (got "${data.status}")`);
  }
  if (data.created_at && !ISO.test(data.created_at)) errors.push(`created_at must be ISO-8601 (Z or ±hh:mm)`);
  if (data.updated_at && !ISO.test(data.updated_at)) errors.push(`updated_at must be ISO-8601 (Z or ±hh:mm)`);

  // K2: timestamp sanity.
  const c = data.created_at && ISO.test(data.created_at) ? Date.parse(data.created_at) : null;
  const u = data.updated_at && ISO.test(data.updated_at) ? Date.parse(data.updated_at) : null;
  if (c != null && u != null && u < c) {
    errors.push(`updated_at (${data.updated_at}) is before created_at (${data.created_at})`);
  }
  if (u != null && u > Date.now() + 86_400_000) {
    warnings.push(`updated_at (${data.updated_at}) is in the future — clock skew or a typo?`);
  }

  // Filename-skill consistency: foo.checkpoint.json must own skill="foo".
  if (data.skill) {
    const expected = `${data.skill}.checkpoint.json`;
    if (file !== expected) errors.push(`filename ${file} does not match skill="${data.skill}" (expected ${expected})`);
  }

  // progress_table rows.
  const rowIds = new Set();
  if (Array.isArray(data.progress_table)) {
    data.progress_table.forEach((row, i) => {
      if (!row || typeof row !== "object") {
        errors.push(`progress_table[${i}] must be an object`);
        return;
      }
      for (const k of ["id", "label", "status"]) {
        if (!row[k]) errors.push(`progress_table[${i}].${k} required`);
      }
      if (row.id) rowIds.add(row.id);
      if (row.status && !ROW_STATUS.includes(row.status)) {
        errors.push(`progress_table[${i}].status must be one of ${ROW_STATUS.join("|")}`);
      }
    });
  } else if (data.status === "in_progress") {
    warnings.push(`no progress_table — recommended for in_progress checkpoints so resume can show position`);
  }

  // A6: next_actions is the linchpin of resume. An in_progress checkpoint with
  // no queued action is useless to the next session — that's a hard error.
  const na = data.next_actions;
  const naLen = Array.isArray(na) ? na.length : 0;
  if (data.status === "in_progress" && naLen === 0) {
    errors.push(`next_actions must be a non-empty array when status is "in_progress" (the next session reads next_actions[0] first)`);
  }
  if (na !== undefined && !Array.isArray(na)) {
    errors.push(`next_actions must be an array`);
  } else if (Array.isArray(na)) {
    na.forEach((a, i) => {
      if (typeof a === "string") return;
      if (a && typeof a === "object" && typeof a.text === "string") {
        if (a.done_when !== undefined && typeof a.done_when !== "string") {
          errors.push(`next_actions[${i}].done_when must be a string (a shell command to self-verify completion)`);
        }
        return;
      }
      errors.push(`next_actions[${i}] must be a string or { text, done_when? }`);
    });
    // I-06: the scaffold placeholder is not a next action. Only an untouched scaffold
    // (phase init / step scaffolded — what `update` creates before any real write)
    // may carry it; anywhere else it is filler that validated and got re-advertised.
    const untouchedScaffold = data.phase === "init" && data.step === "scaffolded";
    na.forEach((a, i) => {
      if (!untouchedScaffold && actionText(a).trim() === SCAFFOLD_NEXT_ACTION) {
        errors.push(`next_actions[${i}] is the scaffold placeholder "${SCAFFOLD_NEXT_ACTION}" — replace it with the real next action (checkpoint update <skill> --next_actions:json='["…"]')`);
      }
    });
  }

  // I-09: phase ids come from the skill's declaration when this checkout carries the
  // skill source (strict with `checkpoint_phases:`, advisory with `phases:` alone).
  // Steps stay free text; a step with whitespace is only a nudge.
  if (typeof data.phase === "string" && data.phase && typeof data.skill === "string") {
    const decl = skillPhaseDeclaration(data.skill);
    if (decl && !decl.allowed.includes(data.phase)) {
      const msg = `phase "${data.phase}" is not declared by skills/${data.skill}/SKILL.md (${decl.source}: ${decl.allowed.join(", ")})`;
      if (decl.strict) errors.push(msg);
      else warnings.push(`${msg} — add \`checkpoint_phases: [...]\` to that frontmatter to make this a hard check`);
    }
  }
  if (typeof data.step === "string" && /\s/.test(data.step.trim())) {
    warnings.push(`step "${data.step}" contains whitespace — step ids are free text, but hooks and docs expect a single token (e.g. sprint-2-eval-round-1)`);
  }

  // context_primer is strongly recommended (it's what lets resume skip a full re-read).
  if (data.context_primer === undefined && data.status === "in_progress") {
    warnings.push(`no context_primer — resume will have to re-read the project; add key_decisions + generated_files`);
  }

  // blockers shape + K1 needs enum + K3 referential check.
  if (Array.isArray(data.blockers)) {
    data.blockers.forEach((b, i) => {
      if (!b || typeof b !== "object") { errors.push(`blockers[${i}] must be an object`); return; }
      if (!b.id || !b.description) errors.push(`blockers[${i}] needs at least id + description`);
      if (b.needs !== undefined && !NEEDS_ENUM.includes(b.needs)) {
        errors.push(`blockers[${i}].needs must be one of ${NEEDS_ENUM.join("|")} (got "${b.needs}") — the priority engine routes on this`);
      }
      if (b.blocking && rowIds.size > 0 && !rowIds.has(b.blocking)) {
        warnings.push(`blockers[${i}].blocking="${b.blocking}" does not match any progress_table.id — dangling reference?`);
      }
    });
  }

  // Status and blockers must tell the same story. Warnings, not errors: CI runs
  // validate non-strict, and a hand-written checkpoint in this shape still resumes.
  const blockerList = Array.isArray(data.blockers) ? data.blockers : [];
  if (data.status === "blocked" && blockerList.length === 0) {
    warnings.push(`status is "blocked" but no blockers are recorded — say what it is waiting on, or set the real status`);
  }
  if (data.status === "complete") {
    blockerList.forEach((b, i) => {
      if (b && b.needs === "user_decision") {
        warnings.push(`status is "complete" but blockers[${i}] still needs a user decision — remove the blocker once resolved, or reopen`);
      }
    });
  }

  // A4: pm_refs is an optional schema extension. Validate its shape when present.
  if (data.pm_refs !== undefined) {
    if (!Array.isArray(data.pm_refs)) {
      errors.push(`pm_refs must be an array`);
    } else {
      data.pm_refs.forEach((r, i) => {
        if (!r || typeof r !== "object") { errors.push(`pm_refs[${i}] must be an object`); return; }
        if (!r.provider) errors.push(`pm_refs[${i}].provider required`);
        if (!r.id) errors.push(`pm_refs[${i}].id required`);
        if (r.role !== undefined && !PM_ROLE_ENUM.includes(r.role)) {
          errors.push(`pm_refs[${i}].role must be one of ${PM_ROLE_ENUM.join("|")} (got "${r.role}")`);
        }
      });
    }
  }

  // ── v1.1 additive extensions (cost / eval_scores / telemetry_handle) ──
  // Like pm_refs, these are OPTIONAL and validated only when present; 1.0
  // checkpoints omit them entirely and stay valid.

  // cost — per-checkpoint LLM spend attribution + budget ceiling (oc-cost-ops).
  if (data.cost !== undefined) {
    if (typeof data.cost !== "object" || data.cost === null || Array.isArray(data.cost)) {
      errors.push(`cost must be an object (oc-cost-ops spend attribution)`);
    } else {
      for (const k of ["total_usd", "budget_usd"]) {
        const v = data.cost[k];
        if (v !== undefined && (typeof v !== "number" || !Number.isFinite(v) || v < 0)) {
          errors.push(`cost.${k} must be a non-negative number`);
        }
      }
      for (const k of ["by_phase", "by_model"]) {
        const m = data.cost[k];
        if (m !== undefined) {
          if (typeof m !== "object" || m === null || Array.isArray(m)) {
            errors.push(`cost.${k} must be an object mapping name → number`);
          } else {
            for (const [name, v] of Object.entries(m)) {
              if (typeof v !== "number" || !Number.isFinite(v) || v < 0) {
                errors.push(`cost.${k}["${name}"] must be a non-negative number`);
              }
            }
          }
        }
      }
      const { total_usd: t, budget_usd: b } = data.cost;
      if (typeof t === "number" && typeof b === "number" && b > 0 && t > b) {
        warnings.push(`cost.total_usd (${t}) exceeds cost.budget_usd (${b}) — budget gate tripped`);
      }
    }
  }

  // eval_scores — append-only eval records against a stable rubric (oc-bug-check,
  // oc-code-auditor, oc-prompt-ops). score is rubric-relative; pair with max when
  // the scale isn't 0..10 (e.g. a 0..1 pass_rate uses max: 1).
  if (data.eval_scores !== undefined) {
    if (!Array.isArray(data.eval_scores)) {
      errors.push(`eval_scores must be an array`);
    } else {
      data.eval_scores.forEach((s, i) => {
        if (!s || typeof s !== "object" || Array.isArray(s)) { errors.push(`eval_scores[${i}] must be an object`); return; }
        if (!s.rubric || typeof s.rubric !== "string") errors.push(`eval_scores[${i}].rubric required (string — which rubric produced the score)`);
        if (typeof s.score !== "number" || !Number.isFinite(s.score)) errors.push(`eval_scores[${i}].score must be a number`);
        if (s.max !== undefined && (typeof s.max !== "number" || !Number.isFinite(s.max) || s.max <= 0)) errors.push(`eval_scores[${i}].max must be a positive number`);
        if (typeof s.score === "number" && typeof s.max === "number" && s.max > 0 && s.score > s.max) errors.push(`eval_scores[${i}].score (${s.score}) exceeds max (${s.max})`);
        if (s.at !== undefined && !ISO.test(s.at)) errors.push(`eval_scores[${i}].at must be ISO-8601 (Z or ±hh:mm)`);
        if (s.dimensions !== undefined) {
          if (typeof s.dimensions !== "object" || s.dimensions === null || Array.isArray(s.dimensions)) {
            errors.push(`eval_scores[${i}].dimensions must be an object mapping name → number`);
          } else {
            for (const [name, v] of Object.entries(s.dimensions)) {
              if (typeof v !== "number" || !Number.isFinite(v)) errors.push(`eval_scores[${i}].dimensions["${name}"] must be a number`);
            }
          }
        }
      });
    }
  }

  // telemetry_handle — opt-in local-metering link (oc-telemetry-ops). A string id,
  // or an object whose `enabled` (when present) is boolean. Default stance is OFF;
  // the field's mere presence is not consent — `enabled: true` is.
  if (data.telemetry_handle !== undefined && data.telemetry_handle !== null) {
    const th = data.telemetry_handle;
    if (typeof th === "string") {
      if (th.trim() === "") errors.push(`telemetry_handle string must be non-empty`);
    } else if (typeof th === "object" && !Array.isArray(th)) {
      if (th.enabled !== undefined && typeof th.enabled !== "boolean") errors.push(`telemetry_handle.enabled must be a boolean (opt-in state)`);
      if (th.id !== undefined && typeof th.id !== "string") errors.push(`telemetry_handle.id must be a string (anonymous handle)`);
      if (th.sink !== undefined && typeof th.sink !== "string") errors.push(`telemetry_handle.sink must be a string (local sink path)`);
      if (th.since !== undefined && !ISO.test(th.since)) errors.push(`telemetry_handle.since must be ISO-8601 (Z or ±hh:mm)`);
    } else {
      errors.push(`telemetry_handle must be a string handle or an object { enabled, id?, sink?, since? }`);
    }
  }

  // D2: soft size guidance.
  if (bytes > SIZE_WARN_BYTES) {
    warnings.push(`checkpoint is ${(bytes / 1024).toFixed(1)}KB (> ${SIZE_WARN_BYTES / 1024}KB) — rotate old skill_state telemetry into .checkpoints/history/`);
  }
  if (typeof data.progress_summary === "string" && data.progress_summary.length > SUMMARY_WARN_CHARS) {
    warnings.push(`progress_summary is ${data.progress_summary.length} chars (> ${SUMMARY_WARN_CHARS}) — keep it scannable; push detail into progress_table`);
  }

  return { errors, warnings };
}

// ───────────────────────────── priority engine (L1) ─────────────────────────
//
// One implementation of the hierarchy that orchestrator.md describes in prose.
// `next` uses it locally (no registry needed); /ops can reuse the same ranking.
//
//   1. BLOCKED needing user_decision   (you're the bottleneck)
//   2. FAILED                          (something broke)
//   3. IN_PROGRESS at a gate           (approval needed to continue)
//   4. IN_PROGRESS mid-work            (resume where you left off)
//   5. COMPLETE with queued next steps (chain onward)
//   6. NOT-STARTED / everything else
//
// Lower rank number = higher priority. Ties break on most-recent updated_at.

function looksLikeGate(data) {
  const hay = `${data.phase || ""} ${data.step || ""}`.toLowerCase();
  if (/\bgate\b|approval|approve|sign-?off|awaiting/.test(hay)) return true;
  if (Array.isArray(data.progress_table)) {
    return data.progress_table.some(
      (r) => r.status === "in_progress" && /gate|approval|approve/i.test(r.id + " " + r.label)
    );
  }
  return false;
}

function rankCheckpoint(data) {
  const blockers = (Array.isArray(data.blockers) ? data.blockers : []).filter(Boolean);
  if (blockers.some((b) => b.needs === "user_decision")) return 1;
  if (data.status === "failed") return 2;
  if (data.status === "blocked") return 2; // broken/stuck — surface alongside failed
  if (data.status === "in_progress") return looksLikeGate(data) ? 3 : 4;
  const naLen = Array.isArray(data.next_actions) ? data.next_actions.length : 0;
  if (data.status === "complete" && naLen > 0) return 5;
  return 6;
}

// v1.6: cost/budget awareness for /oc-ops next. A checkpoint whose attributed
// spend has passed its budget ceiling is overspending right now — that's a signal
// worth surfacing. This is a TIEBREAKER within a rank + a recommendation note, not
// a change to the rank hierarchy (so the status-based ordering is unchanged).
function budgetExceeded(data) {
  const c = data && data.cost;
  if (!c || typeof c !== "object") return false;
  const { total_usd: t, budget_usd: b } = c;
  return typeof t === "number" && typeof b === "number" && b > 0 && t > b;
}

function pickNext(checkpoints) {
  const ranked = checkpoints
    .map(({ data }) => ({
      data,
      rank: rankCheckpoint(data),
      over: budgetExceeded(data) ? 0 : 1, // over-budget sorts first within a rank
      t: Date.parse(data.updated_at || 0) || 0,
    }))
    .sort((a, b) => (a.rank - b.rank) || (a.over - b.over) || (b.t - a.t));
  return ranked[0];
}

function recommendedAction(data, staleTokens) {
  const blockers = (Array.isArray(data.blockers) ? data.blockers : []).filter(Boolean);
  const decision = blockers.find((b) => b.needs === "user_decision");
  if (decision) {
    // The drift filter applies here too. These are ranks 1-2 — the ones pickNext
    // prefers ABOVE all others — so a stale action here outranks every correctly
    // filtered suggestion below it. Before 2026-07-24 both branches returned raw
    // text without consulting staleTokens, which is why `next` told this repo to
    // "tag v1.8.0 on the merge commit" twelve days after v1.8.0 shipped: the
    // highest-priority path was the only unfiltered one.
    const proposed = decision.proposed_resolution || "";
    const stale = proposed && actionIsStale(proposed, staleTokens);
    return {
      why: `Blocked on your decision: ${decision.description}`,
      action: stale ? "Resolve the blocker, then resume." : proposed || "Resolve the blocker, then resume.",
      allStale: Boolean(stale),
    };
  }
  const firstBlocker = blockers[0];
  if (data.status === "failed" || data.status === "blocked") {
    const proposed = firstBlocker?.proposed_resolution || "";
    if (proposed && !actionIsStale(proposed, staleTokens)) {
      return {
        why: firstBlocker ? `${data.status}: ${firstBlocker.description}` : `${data.status} — needs recovery`,
        action: proposed,
        allStale: false,
      };
    }
    // Fall through to the queued actions, drift-filtered, before giving up.
    const { action: fresh, allStale } = firstFreshAction(data.next_actions, staleTokens);
    return {
      why: firstBlocker ? `${data.status}: ${firstBlocker.description}` : `${data.status} — needs recovery`,
      action: fresh || "Diagnose and recover.",
      allStale: Boolean(allStale && !fresh),
    };
  }
  // Normal path: recommend the first NON-stale queued action. With no stale-token
  // set (the default), firstFreshAction returns next_actions[0] — old behaviour.
  const { action: fresh, skipped, allStale } = firstFreshAction(data.next_actions, staleTokens);
  const base = data.progress_summary ? data.progress_summary.split(/(?<=\.)\s/)[0] : `${data.skill} is ${data.status}`;
  // v1.6: surface a tripped budget in the recommendation (oc-cost-ops writes cost).
  let why = budgetExceeded(data)
    ? `⚠ over budget ($${data.cost.total_usd} > $${data.cost.budget_usd}) — ${base}`
    : base;
  if (skipped > 0) {
    why = `${why}  (skipped ${skipped} stale action${skipped === 1 ? "" : "s"} referencing already-merged work)`;
  }
  const action = allStale
    ? `All ${data.next_actions.length} queued action(s) reference already-merged/-completed work — run \`checkpoint doctor\` and reconcile this checkpoint before continuing.`
    : (fresh || "No queued next action — review the checkpoint.");
  // allStale is part of the contract now: consumers (the plugin's suggestion
  // hook) stay SILENT rather than surfacing a recommendation built entirely
  // from work git says already landed.
  return { why, action, allStale: Boolean(allStale) };
}

// ───────────────────────────── commands ─────────────────────────────────────

function cmdValidate(strict = false) {
  const paths = listCheckpoints();
  if (paths.length === 0) {
    console.log("(no checkpoints found in .checkpoints/)");
    return 0;
  }
  let bad = 0;
  let warned = 0;
  for (const p of paths) {
    let cp;
    try { cp = readCheckpoint(p); }
    catch (e) { console.error(`✗ ${basename(p)}\n    ${e.message}`); bad++; continue; }
    const { errors, warnings } = validate(p, cp.data, cp.bytes);
    const hardErrors = strict ? [...errors, ...warnings] : errors;
    if (hardErrors.length === 0) {
      console.log(`✓ ${basename(p)}`);
      if (!strict && warnings.length) { warnings.forEach((w) => console.log(`    ⚠ ${w}`)); warned += warnings.length; }
    } else {
      console.error(`✗ ${basename(p)}`);
      hardErrors.forEach((e) => console.error(`    ${e}`));
      bad++;
    }
  }
  if (bad > 0) {
    console.error(`\n${bad} checkpoint(s) failed validation${strict ? " (--strict)" : ""}.`);
    return 1;
  }
  console.log(`\nAll ${paths.length} checkpoint(s) valid${warned ? ` (${warned} warning(s))` : ""}.`);
  return 0;
}

function readAll() {
  const out = [];
  for (const p of listCheckpoints()) {
    try { out.push(readCheckpoint(p)); } catch { /* surfaced by validate */ }
  }
  return out;
}

function cmdStatus(opts = {}) {
  // `status <skill>`: one checkpoint's row and detail. A skill with no file is a
  // non-zero exit, so a gate that asks "is there a recent audit?" gets a signal
  // instead of the whole table (the argument used to be silently ignored).
  if (opts.skill) {
    const path = join(DIR, `${opts.skill}.checkpoint.json`);
    if (!existsSync(path)) {
      console.error(`no checkpoint for "${opts.skill}" at ${path}`);
      return 1;
    }
    let d;
    try { d = readCheckpoint(path).data; }
    catch (e) { console.error(e.message); return 1; }
    const age = d.updated_at ? daysSince(d.updated_at) : null;
    const staleAfter = staleThresholdFor(d.status);
    const ageText = age == null ? "unknown age" : `${age < 1 ? "<1" : Math.floor(age)}d old`;
    const staleText = age != null && staleAfter != null && age > staleAfter ? " — ⚠ stale" : "";
    console.log(`${d.skill || opts.skill}: ${d.status || "?"}  ${d.phase || "?"}/${d.step || "?"}`);
    console.log(`updated_at: ${d.updated_at || "—"}  (${ageText}${staleText})`);
    console.log(d.progress_summary || "_no summary_");
    if (Array.isArray(d.next_actions) && d.next_actions.length > 0) {
      console.log("\nNext actions:");
      d.next_actions.forEach((a, i) => console.log(`${i + 1}. ${actionText(a)}`));
    }
    if (Array.isArray(d.blockers) && d.blockers.length > 0) {
      console.log("\nBlockers:");
      d.blockers.filter(Boolean).forEach((b) => console.log(`- ${b.id}: ${b.description}${b.needs ? ` (needs: ${b.needs})` : ""}`));
    }
    return 0;
  }

  const paths = listCheckpoints();
  if (paths.length === 0) {
    console.log("(no checkpoints found in .checkpoints/)");
    return 0;
  }
  const all = readAll();
  const sinceT = opts.since ? Date.parse(opts.since) : null;

  // H5: lead with the bottleneck banner — decisions waiting on the user.
  const decisions = [];
  for (const { data } of all) {
    for (const b of (Array.isArray(data.blockers) ? data.blockers : []).filter(Boolean)) {
      if (b.needs === "user_decision") decisions.push({ skill: data.skill, b });
    }
  }
  if (decisions.length) {
    console.log(`⛔ ${decisions.length} decision(s) waiting on you:`);
    decisions.forEach(({ skill, b }) => console.log(`   • [${skill}] ${b.description}`));
    console.log("");
  }

  // H2: brief mode — just the single thing to do next + open blockers.
  if (opts.brief) {
    const top = pickNext(all);
    if (top) {
      // Same drift evidence `next` uses, so the brief view cannot recommend an
      // action whose PR already merged.
      const rec = recommendedAction(top.data, driftTokens(all));
      console.log(`▶ ${top.data.skill}  (${top.data.status}, ${top.data.phase}/${top.data.step})`);
      console.log(`  Next: ${rec.action}`);
    }
    const blockers = all.flatMap(({ data }) =>
      (Array.isArray(data.blockers) ? data.blockers : []).filter(Boolean).map((b) => `  🚫 [${data.skill}] ${b.id}: ${b.description}`)
    );
    if (blockers.length) { console.log("\nOpen blockers:"); blockers.forEach((b) => console.log(b)); }
    return 0;
  }

  console.log("# Session state\n");
  console.log("| Skill | Phase | Step | Status | Updated | Age |");
  console.log("|---|---|---|---|---|---|");
  for (const { data: d } of all) {
    const updated = d.updated_at ? d.updated_at.replace("T", " ").replace("Z", " UTC") : "—";
    const age = d.updated_at ? daysSince(d.updated_at) : null;
    // H4: stale flag.
    let ageCell = age == null ? "—" : `${age < 1 ? "<1" : Math.floor(age)}d`;
    const staleAfter = staleThresholdFor(d.status);
    if (age != null && staleAfter != null && age > staleAfter) ageCell = `⚠ ${Math.floor(age)}d stale`;
    console.log(`| ${d.skill || "?"} | ${d.phase || "?"} | ${d.step || "?"} | ${d.status || "?"} | ${updated} | ${ageCell} |`);
  }
  console.log();
  for (const { data: d } of all) {
    if (sinceT != null) {
      const u = Date.parse(d.updated_at || 0);
      if (!(u >= sinceT)) continue; // L4: --since filters to recently-touched skills
    }
    console.log(`## ${d.skill || "?"}`);
    console.log(d.progress_summary || "_no summary_");
    if (Array.isArray(d.next_actions) && d.next_actions.length > 0) {
      console.log("\n**Next actions:**");
      d.next_actions.forEach((a, i) => console.log(`${i + 1}. ${actionText(a)}`));
    }
    if (Array.isArray(d.blockers) && d.blockers.length > 0) {
      console.log("\n**Blockers:**");
      d.blockers.filter(Boolean).forEach((b) => console.log(`- ${b.id}: ${b.description}${b.needs ? ` _(needs: ${b.needs})_` : ""}`));
    }
    console.log();
  }
  if (sinceT != null) console.log(`_(detail filtered to skills updated since ${opts.since})_`);
  return 0;
}

function cmdNext() {
  const all = readAll();
  if (all.length === 0) { console.log("(no checkpoints found in .checkpoints/)"); return 0; }
  const stale = driftTokens(all); // same drift evidence `doctor` uses
  const top = pickNext(all);
  const d = top.data;
  const rec = recommendedAction(d, stale);
  console.log("NEXT ACTION");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log(`Skill:  ${d.skill}  (${d.status} — ${d.phase}/${d.step})`);
  console.log(`Why:    ${rec.why}`);
  console.log(`Action: ${rec.action}`);
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("Ask again for the next item, or run `checkpoint status` for the full queue.");
  return 0;
}

function gitMergedTokens() {
  // Best-effort: tokens (PR #NNN, TICKET-NN) that git history shows as already landed.
  try {
    const log = execSync("git log --oneline -n 200", { cwd: ROOT, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
    return harvestTokens(log);
  } catch { return new Set(); }
}

/** The shared "drift evidence": PR/ticket tokens that already appear completed
 *  in any checkpoint (a progress_table row marked complete, or a *merged /
 *  shipped / completed / done* skill_state key) OR merged in recent git history.
 *  Both `doctor` (to flag stale next_actions) and `next` (to skip them) consult
 *  this single set, so neither tells the next agent to redo shipped work. */
function driftTokens(all) {
  const toks = new Set();
  for (const { data } of all) {
    for (const row of (Array.isArray(data.progress_table) ? data.progress_table : [])) {
      if (row.status === "complete") harvestTokens(`${row.id} ${row.label}`, toks);
    }
    const st = data.skill_state || {};
    for (const key of Object.keys(st)) {
      if (/merged|shipped|completed|done/i.test(key)) harvestTokens(JSON.stringify(st[key]), toks);
    }
  }
  for (const t of gitMergedTokens()) toks.add(t);
  return toks;
}

/** Return the approved site runtime SHA when this checkout carries the site's
 * monitoring baseline: the signed release, or the reviewed post-release
 * `runtime` block when one is recorded (that is what /api/health reports).
 * The product repo intentionally has no baseline: checkpoint remains
 * product-owned after the split, while live deployment monitoring stays with
 * opchain.dev. A missing baseline therefore means "not applicable", not drift.
 * Malformed baselines still fail loudly for site checkouts. */
function readApprovedReleaseBaseline(root = ROOT) {
  const baselinePath = join(root, ".github", "monitoring", "release-baseline.json");
  if (!existsSync(baselinePath)) return null;
  const baseline = JSON.parse(readFileSync(baselinePath, "utf8"));
  const expected = baseline?.runtime?.shortSha ?? baseline?.release?.sourceShortSha;
  if (!/^[0-9a-f]{7,12}$/.test(expected || "")) {
    throw new Error("approved release baseline has no valid runtime.shortSha or release.sourceShortSha");
  }
  return expected;
}

async function cmdDoctor(opts = {}) {
  const all = readAll();
  if (all.length === 0) { console.log("(no checkpoints found in .checkpoints/)"); return 0; }
  const findings = []; // { level: 'error'|'warn', skill, msg }
  const add = (level, skill, msg) => findings.push({ level, skill, msg });

  // Shared drift evidence: PRs/tickets already completed in a checkpoint or
  // merged in git history. `next` consults the very same set.
  const stale = driftTokens(all);

  for (const { path, data, bytes } of all) {
    const skill = data.skill || "?";

    // Hard schema errors are doctor errors too. Validate against the file's REAL
    // path: rebuilding it from data.skill compared the name with itself, so the
    // filename↔skill check could never fire under doctor.
    const { errors } = validate(path, data, bytes);
    errors.forEach((e) => add("error", skill, e));

    // Drift 1: project_dir points somewhere that isn't this checkout.
    if (data.project_dir && data.project_dir !== ROOT && !existsSync(data.project_dir)) {
      add("warn", skill, `project_dir "${data.project_dir}" doesn't exist here (authored on another machine? expected ${ROOT})`);
    }

    // Drift 2: staleness, per status. `complete` is NOT exempt — see STALE_COMPLETE_DAYS.
    const age = data.updated_at ? daysSince(data.updated_at) : null;
    const staleAfter = staleThresholdFor(data.status);
    if (age != null && staleAfter != null && age > staleAfter) {
      const d = Math.floor(age);
      add(
        "warn",
        skill,
        data.status === "complete"
          ? `marked complete but last updated ${d}d ago — does it still describe reality? reconcile against git HEAD/tags or reopen`
          : `${data.status} but last updated ${d}d ago — stale? resume or reset`,
      );
    }

    // Drift 3: referenced generated_files that look like repo paths but are missing.
    // Every missing path is reported: capping at three hid the rest.
    const files = data.context_primer?.generated_files || [];
    for (const entry of files) {
      const p = repoPathCandidate(entry);
      if (p && !existsSync(join(ROOT, p))) add("warn", skill, `generated_files references missing path: ${p}`);
    }

    // Drift 4b: a docs/readiness PASS bound to a commit that is not in HEAD's history.
    // After a squash merge the branch tip it verified never reaches main, so the
    // PASS describes code main never had — and a pre-PR gate that trusts it inserts
    // a stale docs packet.
    const vsha = data.skill_state?.verified_for_sha;
    if (typeof vsha === "string" && /^[0-9a-f]{7,40}$/.test(vsha)) {
      const verdict = commitInHistory(vsha);
      if (verdict === "missing") add("warn", skill, `skill_state.verified_for_sha ${vsha.slice(0, 12)} is not a commit in this clone — the PASS it records cannot be checked`);
      if (verdict === "not-ancestor") add("warn", skill, `skill_state.verified_for_sha ${vsha.slice(0, 12)} is not in HEAD's history (a pre-squash branch tip?) — its PASS does not describe this code`);
    }

    // Drift 4 (F2): a next_action telling future-self to do work that's already
    // landed (its PR/ticket token shows complete elsewhere or in git history).
    for (const a of (Array.isArray(data.next_actions) ? data.next_actions : [])) {
      const txt = actionText(a);
      for (const tok of harvestTokens(txt)) {
        if (stale.has(tok)) {
          add("warn", skill, `next_action references ${tok}, which already appears as completed/merged — may be stale: "${txt.slice(0, 70)}…"`);
          break;
        }
      }
    }

    // Drift 6 (I-06): the scaffold placeholder is still queued as a "next action".
    // Outside an untouched scaffold validate() already made that a hard error above;
    // the scaffold itself still deserves a nudge — nothing resumes from it.
    if (data.phase === "init" && data.step === "scaffolded" &&
        (Array.isArray(data.next_actions) ? data.next_actions : []).some((a) => actionText(a).trim() === SCAFFOLD_NEXT_ACTION)) {
      add("warn", skill, `next_actions still carries the scaffold placeholder — write the first real action (checkpoint update ${skill} --next_actions:json='["…"]')`);
    }
  }

  // Drift 5 (F1/F3, optional): point-in-time health response vs the approved
  // release baseline. Raw local/main equality is deliberately not the contract:
  // docs/checkpoint/workflow-only commits may advance without a deploy.
  if (opts.online) {
    try {
      const expected = readApprovedReleaseBaseline();
      if (expected == null) {
        console.log("(online) skipped site health drift check: no opchain.dev release baseline in this checkout");
      } else {
        // Cache-busting query string: the route is no-store at the origin, but
        // a zone cache rule serving a stale HIT would fake a drift warning.
        const res = await fetch(`https://opchain.dev/api/health?doctor=${Date.now()}`, { signal: AbortSignal.timeout(8000) });
        if (!res.ok) throw new Error(`HTTP ${res.status}${res.headers.get("cf-mitigated") === "challenge" ? " (Cloudflare challenge)" : ""}`);
        const live = (await res.json()).version;
        if (!/^[0-9a-f]{7,12}$/.test(String(live || ""))) {
          throw new Error("health response has no valid version SHA");
        }
        if (!expected.startsWith(String(live)) && !String(live).startsWith(expected)) {
          add("warn", "deploy", `live /api/health version=${live} != approved release baseline ${expected}`);
        } else {
          console.log(`(online) live version ${live} matches approved release baseline ${expected}`);
        }
      }
    } catch (e) {
      add("warn", "deploy", `--online point-in-time health check unavailable: ${e.message}; run the authenticated Cloudflare control-plane monitor for deployment identity`);
    }
  }

  console.log("CHECKPOINT DOCTOR");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  const errs = findings.filter((f) => f.level === "error");
  const warns = findings.filter((f) => f.level === "warn");
  if (findings.length === 0) {
    console.log("✓ no drift detected across", all.length, "checkpoint(s).");
    return 0;
  }
  for (const f of errs) console.log(`✗ [${f.skill}] ${f.msg}`);
  for (const f of warns) console.log(`⚠ [${f.skill}] ${f.msg}`);
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log(`${errs.length} error(s), ${warns.length} warning(s).`);
  const failOnWarn = Boolean(opts.failOnWarnings) && warns.length > 0;
  if (failOnWarn) console.log("Failing on warnings (--fail-on-warnings).");
  if (!opts.online) console.log("Tip: `checkpoint doctor --online` also compares a point-in-time /api/health response to the approved release baseline.");
  return (errs.length > 0 || failOnWarn) ? 1 : 0;
}

/**
 * Apply --key=value updates. Supports dotted paths and three operators:
 *   --key=value       replace scalar
 *   --key+=value      append to array
 *   --key:json=...    parse value as JSON
 * The suffixes combine in either order: `--key:json+=…` and `--key+:json=…` both
 * parse JSON and append. An append pushes its value as ONE element, so pass an
 * object to add one entry; an array value is added as a single nested array.
 * A key that still carries `+` or `:json` after the suffixes are read is refused
 * rather than written as a literal key (`merged_prs+` was, silently).
 */
function applyUpdates(obj, args) {
  for (const arg of args) {
    if (!arg.startsWith("--")) continue;
    const eq = arg.indexOf("=");
    if (eq < 0) continue;
    const lhsRaw = arg.slice(2, eq);
    let value = arg.slice(eq + 1);
    let isAppend = false;
    let isJson = false;
    let lhs = lhsRaw;
    for (let changed = true; changed; ) {
      changed = false;
      if (lhs.endsWith("+")) { isAppend = true; lhs = lhs.slice(0, -1); changed = true; }
      if (lhs.endsWith(":json")) { isJson = true; lhs = lhs.slice(0, -5); changed = true; }
    }
    if (lhs === "" || lhs.includes("+") || lhs.includes(":json")) {
      throw new Error(`--${lhsRaw}=... is not a valid field path (operators are a trailing \`+\` and/or \`:json\`)`);
    }
    if (isJson) {
      try { value = JSON.parse(value); }
      catch (err) { throw new Error(`failed to parse --${lhsRaw}=... as JSON: ${err.message}`); }
    }
    const path = lhs.split(".");
    let cur = obj;
    for (let i = 0; i < path.length - 1; i++) {
      const k = path[i];
      if (cur[k] === undefined || cur[k] === null) cur[k] = {};
      cur = cur[k];
    }
    const tail = path[path.length - 1];
    if (isAppend) {
      if (!Array.isArray(cur[tail])) cur[tail] = [];
      cur[tail].push(value);
    } else {
      cur[tail] = value;
    }
  }
}

/** The project name for a scaffolded checkpoint: package.json's name, or the
 *  directory name. The protocol invites copying this CLI into other repos, where
 *  a hard-coded "opchain.dev" wrote the wrong project into every new file. */
function projectName(root = ROOT) {
  try {
    const name = JSON.parse(readFileSync(join(root, "package.json"), "utf8")).name;
    if (name === "opchain-dev") return "opchain.dev";
    if (typeof name === "string" && name) return name;
  } catch { /* no package.json — fall through */ }
  return basename(root);
}

function scaffoldCheckpoint(skill) {
  const now = new Date().toISOString();
  return {
    protocol_version: SCHEMA_VERSION,
    skill,
    project: projectName(),
    project_dir: ROOT,
    created_at: now,
    updated_at: now,
    phase: "init",
    step: "scaffolded",
    status: "in_progress",
    progress_summary: `Checkpoint scaffolded for ${skill}.`,
    next_actions: [SCAFFOLD_NEXT_ACTION],
  };
}

function writeValidated(path, data) {
  const now = new Date().toISOString();
  data.updated_at = now;
  data.record_updated_at = now;
  const { errors } = validate(path, data, Buffer.byteLength(JSON.stringify(data)));
  if (errors.length > 0) {
    console.error(`✗ ${basename(path)} — would fail validation:`);
    errors.forEach((e) => console.error(`    ${e}`));
    return false;
  }
  atomicWriteFile(path, JSON.stringify(data, null, 2) + "\n");
  return true;
}

function cmdUpdate(skill, rest) {
  if (!skill) {
    console.error("usage: checkpoint update <skill> [--field=value ...]");
    return 1;
  }
  if (!existsSync(DIR)) mkdirSync(DIR, { recursive: true });
  const path = join(DIR, `${skill}.checkpoint.json`);
  const exists = existsSync(path);
  // I-06: creating a file needs a real first next action. The scaffold placeholder
  // used to be written silently and then validated for weeks.
  if (!exists && !rest.some((a) => /^--next_actions(?:\+|:json)*=/.test(a))) {
    console.error(`✗ no checkpoint exists yet for "${skill}" (${path}).`);
    console.error(`  Creating one needs its first real next action — the scaffold placeholder is rejected by the validator. Re-run with:`);
    console.error(`    node scripts/checkpoint.mjs update ${skill} ${rest.join(" ")} --next_actions:json='["<the next concrete action>"]'`);
    return 1;
  }
  const data = exists ? readCheckpoint(path).data : scaffoldCheckpoint(skill);
  if (!exists) data.next_actions = []; // replaced, or appended to, by the supplied action(s)
  try { applyUpdates(data, rest); }
  catch (e) { console.error(`✗ ${e.message}`); return 1; }
  if (typeof data.next_actions === "string") data.next_actions = [data.next_actions]; // --next_actions=<one action>
  if (!writeValidated(path, data)) return 1;
  console.log(`✓ wrote ${basename(path)}`);
  return 0;
}

// ───────────────────────────── handoff (I-05) ────────────────────────────────
//
// One deterministic binder for the C-contract `verification.verdict` handoff that
// scripts/lib/release-evidence.mjs — and the pre-PR / pre-deploy gates built on it —
// look up: type verification.verdict, producer.skill = the checkpoint's skill,
// candidate = the git_tree_projection identity of HEAD minus .checkpoints/,
// payload.policy + payload.verdict. Sixteen PRs since 2026-09-14 hand-wrote this
// with four different ad-hoc node/python snippets (audit Q5-F1); this is the writer.

const VERDICTS = ["PASS", "FAIL", "INCOMPLETE"];
const POLICY_ID = /^[a-z0-9][a-z0-9.-]*$/;
const HANDOFF_USAGE = [
  "usage: checkpoint handoff <skill> [<policy>] --policy <id> --verdict PASS|FAIL|INCOMPLETE --scope \"<text>\"",
  "                          [--evidence <path>]... [--summary \"<text>\"] [--run-id <id>] [--phase <id>] [--step <id>] [--json]",
  "  (the policy may be given positionally instead of --policy)",
  "  e.g. npm run checkpoint -- handoff oc-docs-forge --policy pr-docs-v1 --verdict PASS \\",
  "         --scope \"README + CHANGELOG refreshed for #601\" --evidence skills/README.md",
  "  policies the gates read: pr-docs-v1 (oc-docs-forge) · pr-readiness-v1 (oc-repo-ops) ·",
  "    pre-deploy-code-audit-v1 (oc-code-auditor) · pre-deploy-security-posture-v1 (oc-security-auditor)",
].join("\n");

/** scripts/lib/release-evidence.mjs, first hit wins: the checkout's own copy (the
 *  authoring repo); the copy `/oc-enroll --ci` vendors into a consumer's
 *  .opchain/runtime/ (what its evidence:pr workflow runs, so the handoff binds the
 *  same candidate identity CI checks); the copy shipped next to this CLI; the
 *  installed plugin's copy when CLAUDE_PLUGIN_ROOT is set. The skill-bundled
 *  runtime does not carry it, which is why consumers failed here (audit C-05). */
function releaseEvidenceScript() {
  const candidates = [
    join(ROOT, "scripts", "lib", "release-evidence.mjs"),
    join(ROOT, ".opchain", "runtime", "scripts", "lib", "release-evidence.mjs"),
    join(dirname(fileURLToPath(import.meta.url)), "lib", "release-evidence.mjs"),
    ...(process.env.CLAUDE_PLUGIN_ROOT ? [join(process.env.CLAUDE_PLUGIN_ROOT, "scripts", "lib", "release-evidence.mjs")] : []),
  ];
  return candidates.find((file) => existsSync(file)) ?? null;
}

/** Phase for a checkpoint `handoff` creates: one the skill declares (the last id of
 *  its checkpoint_phases, or of its advisory phases + body examples, which is where
 *  the gate skills spell their verify step: pr-docs, pr-verify), so validate does
 *  not warn about a phase no skill uses. "verify" only when nothing is declared. */
function defaultHandoffPhase(skill) {
  const decl = skillPhaseDeclaration(skill);
  if (!decl?.allowed?.length) return "verify";
  return decl.allowed.includes("verify") ? "verify" : decl.allowed.at(-1);
}

/** { candidate, tree, candidate_identity: { kind, id } } for HEAD of `root` — the
 *  same identity `release-evidence --print-candidate --json` prints. */
function printCandidate(root = ROOT) {
  const script = releaseEvidenceScript();
  if (!script) throw new Error("scripts/lib/release-evidence.mjs is not available (looked in scripts/lib/, .opchain/runtime/scripts/lib/, beside this CLI, and $CLAUDE_PLUGIN_ROOT/scripts/lib/) — run /oc-enroll --ci to vendor it; cannot compute the candidate identity")
  const r = spawnSync(process.execPath, [script, "--repo", root, "--print-candidate", "--json"], { encoding: "utf8" });
  let report = null;
  try { report = JSON.parse((r.stdout || "").trim()); } catch { /* reported below */ }
  if (r.status !== 0 || !report?.ok || !report.candidate_identity?.id) {
    throw new Error(report?.error || (r.stderr || "release-evidence --print-candidate failed").trim());
  }
  return report;
}

/** `--key value` and `--key=value`, --evidence repeatable, --json a bare flag. The
 *  policy may also be the first positional (`handoff oc-repo-ops pr-readiness-v1 …`),
 *  which is how release-evidence's FAIL detail spells the fix. */
function parseHandoffArgs(rest) {
  const opts = { evidence: [], json: false };
  const scalar = { policy: "policy", verdict: "verdict", scope: "scope", summary: "summary", "run-id": "run_id", phase: "phase", step: "step" };
  for (let i = 0; i < rest.length; i++) {
    const arg = rest[i];
    if (!arg.startsWith("--")) {
      if (opts.policy === undefined && POLICY_ID.test(arg)) { opts.policy = arg; continue; }
      throw new Error(`unexpected argument "${arg}"`);
    }
    let key = arg.slice(2);
    let value;
    const eq = key.indexOf("=");
    if (eq >= 0) { value = key.slice(eq + 1); key = key.slice(0, eq); }
    if (key === "json") { opts.json = value === undefined ? true : value !== "false"; continue; }
    if (value === undefined) {
      value = rest[++i];
      if (value === undefined || value.startsWith("--")) throw new Error(`--${key} needs a value`);
    }
    if (key === "evidence") opts.evidence.push(value);
    else if (scalar[key]) opts[scalar[key]] = value;
    else throw new Error(`unknown option --${key}`);
  }
  if (!opts.policy) throw new Error("--policy is required (e.g. pr-docs-v1)");
  if (!POLICY_ID.test(opts.policy)) throw new Error(`--policy "${opts.policy}" must be a lower-case id (letters, digits, . and -)`);
  if (!VERDICTS.includes(opts.verdict)) throw new Error(`--verdict must be one of ${VERDICTS.join("|")} (got ${JSON.stringify(opts.verdict ?? "")})`);
  if (!opts.scope || !opts.scope.trim()) throw new Error("--scope is required: one sentence saying what this verdict covers");
  return opts;
}

/** Exactly the shape release-evidence's checkpointResult() matches. */
function buildHandoff({ skill, policy, verdict, scope, evidence = [], runId, candidate, now = new Date().toISOString() }) {
  const digest = candidate.candidate_identity.id.replace(/^sha256:/, "").slice(0, 12);
  const handoff = {
    id: `${skill}-${policy}-${digest}`,
    contract_version: "1.0",
    type: "verification.verdict",
    created_at: now,
    verified_at: now,
    producer: { skill, run_id: runId || `${policy}-${now}` },
    candidate: { kind: candidate.candidate_identity.kind, id: candidate.candidate_identity.id },
    payload: { verdict, policy, scope },
  };
  if (evidence.length) handoff.payload.evidence = [...evidence];
  return handoff;
}

function cmdHandoff(skill, rest) {
  if (!skill) { console.error(HANDOFF_USAGE); return 1; }
  let opts;
  try { opts = parseHandoffArgs(rest); }
  catch (e) { console.error(`✗ ${e.message}\n${HANDOFF_USAGE}`); return 1; }
  let candidate;
  try { candidate = printCandidate(); }
  catch (e) { console.error(`✗ ${e.message}`); return 1; }

  if (!existsSync(DIR)) mkdirSync(DIR, { recursive: true });
  const path = join(DIR, `${skill}.checkpoint.json`);
  const exists = existsSync(path);
  const data = exists ? readCheckpoint(path).data : scaffoldCheckpoint(skill);
  if (!exists) {
    // A gate skill that only ever binds verdicts still gets a valid, resumable file.
    Object.assign(data, {
      phase: opts.phase ?? defaultHandoffPhase(skill),
      step: opts.step ?? opts.policy,
      status: "complete",
      progress_summary: opts.summary ?? `${skill}: ${opts.policy} ${opts.verdict} for candidate ${candidate.candidate.slice(0, 12)}.`,
      next_actions: [],
    });
  } else {
    if (opts.phase) data.phase = opts.phase;
    if (opts.step) data.step = opts.step;
    if (opts.summary) data.progress_summary = opts.summary;
  }

  const handoff = buildHandoff({ skill, policy: opts.policy, verdict: opts.verdict, scope: opts.scope.trim(), evidence: opts.evidence, runId: opts.run_id, candidate });
  // getCheckpointHandoff() refuses "multiple handoffs matched", so re-binding the same
  // candidate replaces the earlier entry instead of stacking a second one.
  const prior = Array.isArray(data.handoffs) ? data.handoffs : [];
  const kept = prior.filter((h) => !(h?.type === handoff.type && h?.candidate?.id === handoff.candidate.id));
  const replaced = prior.length - kept.length;
  data.handoffs = [...kept, handoff];
  // Display/compat field oc-repo-ops verify and doctor read; the handoff is the contract.
  const state = data.skill_state && typeof data.skill_state === "object" && !Array.isArray(data.skill_state) ? data.skill_state : {};
  data.skill_state = { ...state, verified_for_sha: candidate.candidate };

  if (!writeValidated(path, data)) return 1;
  if (opts.json) {
    console.log(JSON.stringify({ ok: true, file: basename(path), handoff, candidate: candidate.candidate, tree: candidate.tree, replaced }));
  } else {
    console.log(`✓ ${basename(path)}: handoff ${handoff.id}`);
    console.log(`  ${opts.verdict} under ${opts.policy}, bound to ${handoff.candidate.kind} ${handoff.candidate.id}`);
    console.log(`  HEAD ${candidate.candidate}${replaced ? ` — replaced ${replaced} earlier handoff(s) bound to the same candidate` : ""}`);
  }
  return 0;
}

// L2: mark the top next action done — pop it into recently_done and restamp.
function cmdDone(skill) {
  if (!skill) { console.error("usage: checkpoint done <skill>"); return 1; }
  const path = join(DIR, `${skill}.checkpoint.json`);
  if (!existsSync(path)) { console.error(`no checkpoint for "${skill}" at ${path}`); return 1; }
  const data = readCheckpoint(path).data;
  if (!Array.isArray(data.next_actions) || data.next_actions.length === 0) {
    console.error(`${skill} has no next_actions to complete.`);
    return 1;
  }
  const done = data.next_actions.shift();
  if (!Array.isArray(data.recently_done)) data.recently_done = [];
  data.recently_done.unshift({ at: new Date().toISOString(), action: actionText(done) });
  data.recently_done = data.recently_done.slice(0, 10); // keep the log bounded
  if (!writeValidated(path, data)) return 1;
  console.log(`✓ ${skill}: completed "${actionText(done)}"`);
  const upNext = actionText(data.next_actions[0]);
  console.log(upNext ? `  Up next: ${upNext}` : "  Queue empty — set a new next action or mark the phase complete.");
  return 0;
}

// I2: scaffold .checkpoints/ on a fresh project.
function cmdInit() {
  if (!existsSync(DIR)) { mkdirSync(DIR, { recursive: true }); console.log(`✓ created ${DIR}`); }
  else console.log(`• ${DIR} already exists`);
  const readme = join(DIR, "README.md");
  if (!existsSync(readme)) {
    writeFileSync(readme, `# Checkpoints\n\nSession-state docs, one JSON file per skill. Tracked in git so a new\nsession (including ephemeral web runners) can resume by reading them.\n\n- \`node scripts/checkpoint.mjs status\`   — where did I leave off?\n- \`node scripts/checkpoint.mjs next\`     — what should I do right now?\n- \`node scripts/checkpoint.mjs doctor\`   — is any checkpoint drifting from reality?\n- \`node scripts/checkpoint.mjs validate\` — schema gate (CI runs this)\n\nSchema: protocol_version "${SCHEMA_VERSION}" (on-disk wire format). See the\ncheckpoint-protocol skill for the full field reference.\n`);
    console.log(`✓ wrote ${readme}`);
  } else console.log(`• ${readme} already exists`);
  console.log("\nNext: `node scripts/checkpoint.mjs update <skill> --phase=… --step=… --progress_summary=\"…\"`");
  return 0;
}

// List every checkpoint file with a scannable one-line status.
function cmdList() {
  const paths = listCheckpoints();
  if (paths.length === 0) { console.log("(no checkpoints found in .checkpoints/)"); return 0; }
  console.log(`${paths.length} checkpoint(s) in ${DIR}:`);
  for (const p of paths) {
    let info = "";
    try {
      const { data } = readCheckpoint(p);
      const updated = data.updated_at ? data.updated_at.replace("T", " ").replace("Z", " UTC") : "—";
      info = `  — ${data.status || "?"}  ${data.phase || "?"}/${data.step || "?"}  (updated ${updated})`;
    } catch (e) { info = `  — ⚠ unreadable: ${e.message}`; }
    console.log(`• ${basename(p)}${info}`);
  }
  return 0;
}

// Display the full JSON for one checkpoint (pipeable to jq), or every checkpoint
// with a per-file header when no skill is given.
function cmdShow(skill) {
  const paths = listCheckpoints();
  if (paths.length === 0) { console.log("(no checkpoints found in .checkpoints/)"); return 0; }
  if (skill) {
    const path = join(DIR, `${skill}.checkpoint.json`);
    if (!existsSync(path)) { console.error(`no checkpoint for "${skill}" at ${path}`); return 1; }
    console.log(readFileSync(path, "utf8").trimEnd());
    return 0;
  }
  paths.forEach((p, i) => {
    if (i > 0) console.log("");
    console.log(`# ${basename(p)}`);
    console.log(readFileSync(p, "utf8").trimEnd());
  });
  return 0;
}

// Archive a checkpoint into .checkpoints/history/ (timestamped) and drop it from
// the active set. The next `update` (or `init`) scaffolds a fresh one.
function cmdReset(skill) {
  if (!skill) { console.error("usage: checkpoint reset <skill>"); return 1; }
  const path = join(DIR, `${skill}.checkpoint.json`);
  if (!existsSync(path)) { console.error(`no checkpoint for "${skill}" at ${path}`); return 1; }
  const histDir = join(DIR, "history");
  if (!existsSync(histDir)) mkdirSync(histDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const dest = join(histDir, `${skill}.${stamp}.checkpoint.json`);
  renameSync(path, dest);
  console.log(`✓ archived ${basename(path)} → ${join(".checkpoints", "history", basename(dest))}`);
  console.log(`  Run \`checkpoint update ${skill} …\` to start a fresh checkpoint.`);
  return 0;
}

// ───────────────────────── acceptance (skill-to-skill data) ──────────────────
//
// The build loop's per-sprint acceptance-check results, published as an
// `acceptance.checks` handoff so a reader outside the loop gets check ids and
// statuses as data. Until 2026-10-24 the only way to learn which checks a sprint
// passed was to parse `sprints/sprint-N/eval-round-M.md`, which is what ow-build's
// builder integration does (its §5 table reads the verdict line and the check ids
// marked PASS/FAIL by hand) and what the 2026-10-23 skill-to-skill investigation
// found no skill doing from a checkpoint: zero sibling-checkpoint reads in 37 calls.

const ACCEPTANCE_STATUSES = ["PASS", "FAIL", "NOT-CHECKED"];
const CHECK_ID = /^[A-Za-z][A-Za-z0-9._-]*$/;
const ACCEPTANCE_USAGE = [
  "usage: checkpoint acceptance <skill> --sprint <id> --verdict PASS|FAIL|INCOMPLETE --source <eval report path>",
  "                             --check <id>=<PASS|FAIL|NOT-CHECKED> [--check …]... [--run-id <id>] [--json]",
  "  e.g. npm run checkpoint -- acceptance oc-app-architect --sprint sprint-2 --verdict FAIL \\",
  "         --source sprints/sprint-2/eval-round-1.md --check AC-2.1=PASS --check AC-2.2=FAIL",
  "  The verdict is the evaluation report's; PASS needs every check PASS. One handoff per sprint; a re-run replaces it.",
].join("\n");

function parseAcceptanceArgs(rest) {
  const opts = { checks: [], json: false };
  const scalar = { sprint: "sprint", verdict: "verdict", source: "source", "run-id": "run_id" };
  for (let i = 0; i < rest.length; i++) {
    const arg = rest[i];
    if (!arg.startsWith("--")) throw new Error(`unexpected argument "${arg}"`);
    let key = arg.slice(2);
    let value;
    const eq = key.indexOf("=");
    if (eq >= 0) { value = key.slice(eq + 1); key = key.slice(0, eq); }
    if (key === "json") { opts.json = value === undefined ? true : value !== "false"; continue; }
    if (value === undefined) {
      value = rest[++i];
      if (value === undefined || value.startsWith("--")) throw new Error(`--${key} needs a value`);
    }
    if (key === "check") {
      const m = /^([^=]+)=([^=]+)$/.exec(value);
      if (!m || !CHECK_ID.test(m[1].trim())) throw new Error(`--check must be <id>=<status> (got ${JSON.stringify(value)})`);
      const status = m[2].trim().toUpperCase();
      if (!ACCEPTANCE_STATUSES.includes(status)) throw new Error(`--check ${m[1]}: status must be ${ACCEPTANCE_STATUSES.join("|")} (got ${JSON.stringify(m[2])})`);
      opts.checks.push({ id: m[1].trim(), status });
    } else if (scalar[key]) opts[scalar[key]] = value;
    else throw new Error(`unknown option --${key}`);
  }
  if (!opts.sprint || !/^[a-z0-9][a-z0-9.-]*$/i.test(opts.sprint)) throw new Error("--sprint <id> is required (e.g. sprint-2)");
  if (!VERDICTS.includes(opts.verdict)) throw new Error(`--verdict must be one of ${VERDICTS.join("|")} (got ${JSON.stringify(opts.verdict ?? "")})`);
  if (!opts.source || !opts.source.trim()) throw new Error("--source is required: the evaluation report the checks were read from");
  if (!opts.checks.length) throw new Error("at least one --check <id>=<status> is required");
  const ids = new Set();
  for (const c of opts.checks) {
    if (ids.has(c.id)) throw new Error(`--check ${c.id} repeats`);
    ids.add(c.id);
  }
  if (opts.verdict === "PASS" && opts.checks.some((c) => c.status !== "PASS")) throw new Error("--verdict PASS needs every check PASS; a sprint with a failing or unchecked check is FAIL or INCOMPLETE");
  return opts;
}

/** sha256 of a file under ROOT, or null when it is not there (the report may live in another checkout). */
function fileDigest(relPath) {
  try {
    const bytes = readFileSync(join(ROOT, relPath));
    return `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
  } catch {
    return null;
  }
}

/** The acceptance.checks handoff checkpoint-contract.js validates. */
function buildAcceptanceHandoff({ skill, sprint, verdict, source, checks, runId, now = new Date().toISOString() }) {
  const digest = fileDigest(source);
  const handoff = {
    id: `${skill}-acceptance-${sprint}`,
    contract_version: "1.0",
    type: "acceptance.checks",
    created_at: now,
    producer: { skill, run_id: runId || `acceptance-${sprint}-${now}` },
    artifact: { kind: "file", id: source, path: source, ...(digest ? { digest } : {}) },
    payload: { sprint, verdict, checks: checks.map((c) => ({ id: c.id, status: c.status })) },
  };
  return handoff;
}

function cmdAcceptance(skill, rest) {
  if (!skill) { console.error(ACCEPTANCE_USAGE); return 1; }
  let opts;
  try { opts = parseAcceptanceArgs(rest); }
  catch (e) { console.error(`✗ ${e.message}\n${ACCEPTANCE_USAGE}`); return 1; }
  const path = join(DIR, `${skill}.checkpoint.json`);
  if (!existsSync(path)) {
    console.error(`✗ no checkpoint for "${skill}" at ${path}; the build loop writes its checkpoint before publishing acceptance results`);
    return 1;
  }
  const data = readCheckpoint(path).data;
  const handoff = buildAcceptanceHandoff({ skill, sprint: opts.sprint, verdict: opts.verdict, source: opts.source.trim(), checks: opts.checks, runId: opts.run_id });
  // One handoff per sprint: a later round replaces the earlier one (getCheckpointHandoff
  // refuses an ambiguous read).
  const prior = Array.isArray(data.handoffs) ? data.handoffs : [];
  const kept = prior.filter((h) => !(h?.type === handoff.type && h?.payload?.sprint === opts.sprint));
  const replaced = prior.length - kept.length;
  data.handoffs = [...kept, handoff];
  if (!writeValidated(path, data)) return 1;
  const passing = opts.checks.filter((c) => c.status === "PASS").length;
  if (opts.json) {
    console.log(JSON.stringify({ ok: true, file: basename(path), handoff, replaced }));
  } else {
    console.log(`✓ ${basename(path)}: acceptance ${handoff.id}`);
    console.log(`  ${opts.sprint} ${opts.verdict}: ${passing} of ${opts.checks.length} checks PASS, from ${opts.source}${handoff.artifact.digest ? "" : " (file not found here; no digest)"}${replaced ? ` — replaced ${replaced} earlier result(s) for this sprint` : ""}`);
  }
  return 0;
}

// Exported for tests. The CLI dispatch below only runs when invoked directly,
// so importing this module (e.g. from vitest) is side-effect-free.
export { validate, rankCheckpoint, pickNext, recommendedAction, actionText, harvestTokens, actionIsStale, firstFreshAction, budgetExceeded, readApprovedReleaseBaseline, applyUpdates, repoPathCandidate, projectName, resolveCheckpointLock, atomicWriteFile, frontmatterList, skillPhaseDeclaration, parseHandoffArgs, buildHandoff, printCandidate, parseAcceptanceArgs, buildAcceptanceHandoff, SCHEMA_VERSION, ACCEPTED_SCHEMA_VERSIONS, SCAFFOLD_NEXT_ACTION };

// ───────────────────────────── arg parsing ──────────────────────────────────

const [, , cmd, ...rest] = process.argv;
const flags = new Set(rest.filter((a) => a.startsWith("--") && !a.includes("=")));
const sinceArg = rest.find((a) => a.startsWith("--since="));

/** A checkpoint file name stem: lower-case id, digits and hyphens — never a path. */
const SKILL_NAME = /^[a-z][a-z0-9-]*$/;
function badSkill(name) {
  console.error(`"${name}" is not a skill name (a lower-case letter, then letters, digits and hyphens)`);
  return 1;
}

function run() {
  // First non-flag positional (skill name for show/reset/update/done).
  const arg0 = rest.find((a) => !a.startsWith("--"));
  const statusSkill = arg0 && SKILL_NAME.test(arg0) ? arg0 : undefined;
  const named = (name, fn) => (name === undefined || SKILL_NAME.test(name) ? fn(name) : badSkill(name));
  switch (cmd) {
    case "validate": return cmdValidate(flags.has("--strict"));
    case "status":   return cmdStatus({ skill: statusSkill, brief: flags.has("--brief"), since: sinceArg ? sinceArg.split("=")[1] : null });
    case "next":     return cmdNext();
    case "doctor":   return cmdDoctor({ online: flags.has("--online"), failOnWarnings: flags.has("--fail-on-warnings") });
    case "list":     return cmdList();
    case "show":     return named(arg0, cmdShow);
    case "reset":    return named(arg0, cmdReset);
    case "update":   return named(rest[0], (s) => cmdUpdate(s, rest.slice(1)));
    case "done":     return named(rest[0], cmdDone);
    case "handoff":  return named(rest[0], (s) => cmdHandoff(s, rest.slice(1)));
    case "acceptance": return named(rest[0], (s) => cmdAcceptance(s, rest.slice(1)));
    case "init":     return cmdInit();
    default:
      console.error("usage: checkpoint <status|next|doctor|list|show|reset|validate|update|handoff|done|init>");
      console.error("       (via npm: `npm run checkpoint -- <command> ...`; shortcuts: checkpoint:status, :next, :doctor, :validate)");
      console.error("  status [skill] [--brief] [--since=ISO] — session-resume summary; one skill exits 1 if absent");
      console.error("  next                                — the single highest-priority non-stale action");
      console.error("  doctor [--online] [--fail-on-warnings] — flag checkpoints that drifted from reality");
      console.error("  list                                — list every checkpoint file with a one-line status");
      console.error("  show [skill]                        — print full JSON for one checkpoint, or all");
      console.error("  reset <skill>                       — archive a checkpoint into .checkpoints/history/");
      console.error("  validate [--strict]                 — schema gate (CI); --strict fails on warnings");
      console.error("  update <skill> [--field=value ...]  — apply field updates, stamp updated_at (a new file needs --next_actions:json='[\"…\"]')");
      console.error("  handoff <skill> --policy <id> --verdict PASS|FAIL|INCOMPLETE --scope \"…\" [--evidence <path>]...");
      console.error("                                      — bind a verification.verdict handoff to the current candidate (what the PR/deploy evidence gates read)");
      console.error("  acceptance <skill> --sprint <id> --verdict PASS|FAIL|INCOMPLETE --source <eval report> --check <id>=<PASS|FAIL|NOT-CHECKED>...");
      console.error("                                      — publish a sprint's acceptance-check results as an acceptance.checks handoff (read as data by anything outside the build loop)");
      console.error("  done <skill>                        — complete next_actions[0] → recently_done");
      console.error("  init                                — scaffold .checkpoints/ on a fresh project");
      return 1;
  }
}

function mutationSkill() {
  if (!["update", "done", "reset", "handoff", "acceptance"].includes(cmd)) return null;
  return rest[0] && SKILL_NAME.test(rest[0]) ? rest[0] : null;
}

function runWithMutationLock() {
  const skill = mutationSkill();
  if (!skill) return run();
  const lockPath = join(DIR, `${skill}.checkpoint.json.lock`);
  if (process.env[LOCK_HELD_ENV] === lockPath) return run();

  let runtime;
  try {
    runtime = resolveCheckpointLock();
  } catch (error) {
    console.error(`✗ ${error.message}`);
    return 1;
  }
  if (!existsSync(DIR)) mkdirSync(DIR, { recursive: true });
  const lockArgs = runtime.platform === "linux"
    ? ["-x", "-w", "10", lockPath]
    : ["-k", "-t", "10", lockPath];
  const child = spawnSync(runtime.command, [
    ...lockArgs,
    process.execPath,
    fileURLToPath(import.meta.url),
    cmd,
    ...rest,
  ], {
    stdio: "inherit",
    env: { ...process.env, [LOCK_HELD_ENV]: lockPath },
  });
  if (child.error) {
    console.error(`✗ checkpoint lock failed: ${child.error.message}`);
    return 1;
  }
  return child.status ?? 1;
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === realpathSync(resolve(process.argv[1]));
if (isMain) {
  Promise.resolve(runWithMutationLock()).then((code) => process.exit(code));
}
