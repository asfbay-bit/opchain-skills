"use strict";

// I-04: bypass records. Every commit that reaches the repository without a PASS
// receipt gets a durable, machine-readable record under the shared Git common
// directory, so "--no-verify" stops being a private incantation and becomes a
// row that bypass-list, pre-push, and evidence:pr can count.
//
// Layout: <git_common_dir>/opchain/bypasses/v1/<commit>.json
//         <git_common_dir>/opchain/bypasses/v1/<tree>.pending.json  (env path,
//         written pre-commit while the commit sha does not exist yet; finalised
//         by `verify-candidate.mjs bypass-record` post-commit)
//
// A commit a rebase or cherry-pick produced carries `rewritten_from`, the
// commit it was picked from (CHERRY_PICK_HEAD at post-commit time). The field
// is provenance only: bypass-list excuses the rewrite after checking that the
// original had a PASS receipt or a bypass trailer, never on the record's say-so.

const fs = require("fs");
const path = require("path");

const BYPASS_SCHEMA = "opchain.bypass-record";
const BYPASS_VERSION = 1;
const BYPASS_SOURCES = new Set(["env", "no-verify", "manual", "rebase", "cherry-pick"]);
const OID = /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/;

function plainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function assertOid(value, at) {
  const text = String(value || "");
  if (!OID.test(text)) throw new TypeError(`${at} must be a lowercase SHA-1 or SHA-256 Git object id`);
  return text;
}

function optionalText(value, at) {
  if (value === undefined || value === null || value === "") return null;
  if (typeof value !== "string") throw new TypeError(`${at} must be a string`);
  return value;
}

function bypassRoot(commonDir) {
  if (!commonDir) throw new TypeError("commonDir is required");
  let resolved;
  try {
    resolved = fs.realpathSync.native(String(commonDir));
  } catch {
    resolved = path.resolve(String(commonDir));
  }
  return path.join(resolved, "opchain", "bypasses", `v${BYPASS_VERSION}`);
}

function recordPath(commonDir, { commit, tree, pending = false }) {
  if (commit) return path.join(bypassRoot(commonDir), `${assertOid(commit, "commit")}.json`);
  const treeOid = assertOid(tree, "tree");
  return path.join(bypassRoot(commonDir), pending ? `${treeOid}.pending.json` : `${treeOid}.json`);
}

function normalizeRecord(input) {
  if (!plainObject(input)) throw new TypeError("bypass record input must be an object");
  const source = String(input.source || "manual");
  if (!BYPASS_SOURCES.has(source)) throw new TypeError(`source must be one of ${[...BYPASS_SOURCES].join("|")}`);
  const record = {
    schema: BYPASS_SCHEMA,
    version: BYPASS_VERSION,
    commit: input.commit ? assertOid(input.commit, "commit") : null,
    tree: assertOid(input.tree, "tree"),
    at: input.at ? String(input.at) : new Date().toISOString(),
    reason: optionalText(input.reason, "reason"),
    source,
    approved_by: optionalText(input.approvedBy !== undefined ? input.approvedBy : input.approved_by, "approved_by"),
  };
  const rewrittenFrom = input.rewrittenFrom !== undefined ? input.rewrittenFrom : input.rewritten_from;
  if (rewrittenFrom) record.rewritten_from = assertOid(rewrittenFrom, "rewritten_from");
  if (Number.isNaN(Date.parse(record.at))) throw new TypeError("at must be an ISO timestamp");
  return record;
}

function writeJson(target, value) {
  fs.mkdirSync(path.dirname(target), { recursive: true, mode: 0o700 });
  const temporary = `${target}.${process.pid}.tmp`;
  fs.writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 });
  fs.renameSync(temporary, target);
  return target;
}

/**
 * Write a bypass record. With `commit` the file is `<commit>.json`; without it
 * (pre-commit, OPCHAIN_BYPASS=1 path) the file is `<tree>.pending.json` when
 * `pending` is true, else `<tree>.json`. Returns { path, record }.
 */
function writeBypassRecord({ commonDir, commit, tree, reason, source, approvedBy, rewrittenFrom, at, pending = false }) {
  const record = normalizeRecord({ commit, tree, reason, source, approvedBy, rewrittenFrom, at });
  const target = recordPath(commonDir, { commit: record.commit, tree: record.tree, pending: !record.commit && pending });
  writeJson(target, record);
  return { path: target, record };
}

function readRecord(file) {
  const value = JSON.parse(fs.readFileSync(file, "utf8"));
  if (!plainObject(value) || value.schema !== BYPASS_SCHEMA) throw new TypeError(`${file} is not a bypass record`);
  return normalizeRecord({
    commit: value.commit,
    tree: value.tree,
    reason: value.reason,
    source: value.source,
    approvedBy: value.approved_by,
    rewrittenFrom: value.rewritten_from,
    at: value.at,
  });
}

/** The final record for a commit, or null when there is none or it is malformed. */
function readBypassRecord(commonDir, commit) {
  try {
    return readRecord(recordPath(commonDir, { commit }));
  } catch {
    return null;
  }
}

/** Every readable record under the store, oldest first. Malformed files are skipped. */
function readBypassRecords(commonDir) {
  const root = bypassRoot(commonDir);
  if (!fs.existsSync(root)) return [];
  const records = [];
  for (const name of fs.readdirSync(root)) {
    if (!name.endsWith(".json")) continue;
    const file = path.join(root, name);
    try {
      records.push({ path: file, pending: name.endsWith(".pending.json"), record: readRecord(file) });
    } catch {
      // A malformed record is reported by its absence, never trusted.
    }
  }
  records.sort((a, b) => Date.parse(a.record.at) - Date.parse(b.record.at));
  return records;
}

/** The pending (pre-commit) record for a tree, if the env path left one. */
function readPendingRecord(commonDir, tree) {
  const file = recordPath(commonDir, { tree, pending: true });
  if (!fs.existsSync(file)) return null;
  try {
    return { path: file, pending: true, record: readRecord(file) };
  } catch {
    return null;
  }
}

/** True when a record (final, tree-keyed, or pending) exists for this commit or tree. */
function hasBypassRecord(commonDir, { commit, tree }) {
  const candidates = [];
  if (commit) candidates.push(recordPath(commonDir, { commit }));
  if (tree) {
    candidates.push(recordPath(commonDir, { tree }));
    candidates.push(recordPath(commonDir, { tree, pending: true }));
  }
  return candidates.some((file) => fs.existsSync(file));
}

/**
 * Promote a `<tree>.pending.json` left by the env path into `<commit>.json`,
 * merging any explicit reason/source/approver. Returns the written record or
 * null when there was nothing pending.
 */
function finalizePendingRecord({ commonDir, commit, tree, reason, source, approvedBy, rewrittenFrom }) {
  const pending = readPendingRecord(commonDir, tree);
  if (!pending) return null;
  const written = writeBypassRecord({
    commonDir,
    commit,
    tree,
    reason: reason || pending.record.reason,
    source: source || pending.record.source,
    approvedBy: approvedBy || pending.record.approved_by,
    rewrittenFrom,
    at: pending.record.at,
  });
  fs.rmSync(pending.path, { force: true });
  return written;
}

module.exports = {
  BYPASS_SCHEMA,
  BYPASS_SOURCES,
  BYPASS_VERSION,
  bypassRoot,
  finalizePendingRecord,
  hasBypassRecord,
  readBypassRecord,
  readBypassRecords,
  readPendingRecord,
  recordPath,
  writeBypassRecord,
};
