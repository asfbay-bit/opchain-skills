#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, realpathSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { getCheckpointHandoff, HANDOFF_TYPES } from "../../src/lib/mcp/checkpoint-contract.js";

const require = createRequire(import.meta.url);
const { createRepositoryIdentity, sha256Bytes, validateReceipt } = require("./verification-receipt.cjs");

// The directory this file ships in: the opchain repository, or a vendored
// `.opchain/runtime/` in a consumer repository. The verifier beside it is the
// one whose receipts it reads, so it is resolved from here, not from --repo.
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const RUNTIME_VERSION = "v1";
// A-08: read as a Git trailer with a non-empty value, the same way
// verify-candidate.mjs and install-git-drivers.mjs read it.
const LEGACY_BYPASS_VALUE = /^bypassed\s*\(\s*(\S[^)]*?)\s*\)\s*$/i;
const BASE_REFS = Object.freeze(["origin/main", "origin/HEAD", "main"]);

const REQUIRED = Object.freeze({
  pr: [
    { skill: "oc-docs-forge", policy: "pr-docs-v1" },
    { skill: "oc-repo-ops", policy: "pr-readiness-v1" },
  ],
  deploy: [
    { skill: "oc-code-auditor", policy: "pre-deploy-code-audit-v1" },
    { skill: "oc-security-auditor", policy: "pre-deploy-security-posture-v1" },
  ],
});

const COMPLIANCE = Object.freeze({ skill: "oc-compliance-ops", policy: "deploy-compliance-evidence-v1" });

function git(root, ...args) {
  const result = spawnSync("git", ["-c", "core.hooksPath=/dev/null", "-C", root, ...args], { encoding: "utf8" });
  if (result.status !== 0) throw new Error(`git ${args.join(" ")} failed: ${(result.stderr || "unknown error").trim()}`);
  return (result.stdout || "").trim();
}

function repositoryContext(root = ROOT) {
  const repo = realpathSync(git(root, "rev-parse", "--show-toplevel"));
  const common = git(repo, "rev-parse", "--git-common-dir");
  const commonDir = realpathSync(isAbsolute(common) ? common : resolve(repo, common));
  let objectFormat = "sha1";
  try { objectFormat = git(repo, "rev-parse", "--show-object-format"); } catch {}
  const candidate = git(repo, "rev-parse", "HEAD");
  const projected = git(repo, "ls-tree", "-rz", "--full-tree", candidate)
    .split("\0")
    .filter(Boolean)
    .filter((entry) => !entry.slice(entry.indexOf("\t") + 1).startsWith(".checkpoints/"))
    .join("\0");
  return {
    root: repo,
    commonDir,
    candidate,
    candidateIdentity: { kind: "git_tree_projection", id: sha256Bytes(projected) },
    tree: git(repo, "rev-parse", "HEAD^{tree}"),
    repositoryId: createRepositoryIdentity({ git_common_dir: commonDir, object_format: objectFormat }).id,
  };
}

// The binder is the one deterministic way to produce the handoff; naming it in
// the failure saves the ad-hoc JSON writers the 2026-10-08 audit counted (I-05).
// C-06: the pre-deploy audit verdicts are not something to type. For them the
// remedy is the audit itself, which binds its own handoff when it passes.
const AUDIT_COMMANDS = Object.freeze({
  "oc-code-auditor": "/oc-audit pre-deploy",
  "oc-security-auditor": "/oc-security",
  "oc-compliance-ops": "/oc-comply",
});

function remedy(spec) {
  if (AUDIT_COMMANDS[spec.skill]) {
    return `run ${AUDIT_COMMANDS[spec.skill]} on this candidate; it binds ${spec.policy} itself only when the audit passes. Do not hand-write a PASS verdict for an audit`;
  }
  return `bind it from the branch: npm run checkpoint -- handoff ${spec.skill} ${spec.policy} --verdict PASS --scope "<what changed>" (or /oc-pr), commit .checkpoints/, push`;
}

function checkpointResult(checkpoint, spec, candidateIdentity) {
  try {
    const handoff = getCheckpointHandoff(checkpoint, {
      type: HANDOFF_TYPES.VERIFICATION_VERDICT,
      artifactId: candidateIdentity.id,
    });
    if (handoff.producer.skill !== spec.skill) throw new Error(`producer must be ${spec.skill}`);
    if (handoff.candidate.kind !== candidateIdentity.kind || handoff.candidate.id !== candidateIdentity.id) {
      throw new Error(`candidate must be ${candidateIdentity.kind} ${candidateIdentity.id}`);
    }
    if (handoff.payload.policy !== spec.policy) throw new Error(`policy must be ${spec.policy}`);
    if (handoff.payload.verdict !== "PASS") throw new Error(`verdict is ${handoff.payload.verdict}`);
    return { id: spec.skill, status: "PASS", detail: `${spec.policy} covers ${candidateIdentity.id}` };
  } catch (error) {
    const detail = error.errors?.length ? `${error.message}: ${error.errors.join("; ")}` : error.message;
    return { id: spec.skill, status: "FAIL", detail: `${detail} — ${remedy(spec)}` };
  }
}

// ---------------------------------------------------------------------------
// Bypass accountability (audit I-04). A pull request's commits that no PASS
// receipt covers are listed here so the count survives the squash merge that
// discards .checkpoints/oc-bug-check.checkpoint.json. With the enrolled runtime
// present (a developer checkout) the list comes from `bypass-list`; without it
// (CI, where receipts never exist) only the trailers can be read, and nothing
// is failed on the strength of a missing receipt.
//
// A-04: that makes CI's view one-sided. Receipts and bypass records live under
// the developer's .git/, so CI can list the commits that *declare* a bypass and
// nothing else. A commit made with --no-verify and pushed with --no-verify (or
// from a clone without the hooks) carries no trailer and leaves CI nothing to
// read. The trailer-scan result says so instead of reporting a pass.
//
// CI must ask for the trailer scan explicitly (`--bypass-source trailers`):
// opchain's own `npm ci` runs `prepare`, which enrolls a runtime in the
// runner's .git, and CI's only receipt is the one it just made for HEAD. In
// runtime mode every earlier commit of the PR (the content commit under a
// checkpoint-only evidence commit, for one) would read as a silent bypass.
// ---------------------------------------------------------------------------

function trailerValue(explicit, legacy) {
  for (const value of String(explicit || "").split("\x1d")) if (value.trim()) return value.trim();
  for (const value of String(legacy || "").split("\x1d")) {
    const match = LEGACY_BYPASS_VALUE.exec(value.trim());
    if (match) return match[1];
  }
  return null;
}

function readRecord(context, entry) {
  if (entry.bypassRecord && typeof entry.bypassRecord === "object") return entry.bypassRecord;
  if (!entry.bypassRecord) return null;
  try {
    return JSON.parse(readFileSync(join(context.commonDir, "opchain", "bypasses", RUNTIME_VERSION, `${entry.commit}.json`), "utf8"));
  } catch {
    return null;
  }
}

function baseRef(root) {
  for (const ref of BASE_REFS) {
    try {
      git(root, "rev-parse", "--verify", "-q", `${ref}^{commit}`);
      return ref;
    } catch {}
  }
  return null;
}

function logEntries(root, range) {
  const raw = git(root, "log", "--format=%H%x1f%s%x1f%(trailers:key=Opchain-Bypass,valueonly,separator=%x1d)%x1f%(trailers:key=bugcheck,valueonly,separator=%x1d)%x1e", range);
  return raw.split("\x1e").map((chunk) => chunk.trim()).filter(Boolean).map((chunk) => {
    const [commit, subject, explicit, legacy] = chunk.split("\x1f");
    return { commit, subject: subject || "", trailer: Boolean(trailerValue(explicit, legacy)) };
  });
}

export function collectBypassedCommits(context, { source = "auto" } = {}) {
  const { root, commonDir } = context;
  const ref = baseRef(root);
  if (!ref) return { mode: "skipped", reason: `none of ${BASE_REFS.join(", ")} exists to compare against`, commits: [] };
  let base;
  try {
    base = git(root, "merge-base", ref, "HEAD");
  } catch {
    return { mode: "skipped", reason: `HEAD has no merge base with ${ref}`, commits: [] };
  }
  const range = `${base}..HEAD`;
  const merges = new Set(git(root, "rev-list", "--merges", range).split("\n").filter(Boolean));
  const log = logEntries(root, range).filter((entry) => !merges.has(entry.commit));
  const subjects = new Map(log.map((entry) => [entry.commit, entry.subject]));
  const runtime = join(commonDir, "opchain", "commit-gate", RUNTIME_VERSION, "verify-candidate.mjs");
  if (source === "trailers" || !existsSync(runtime)) {
    return {
      mode: "trailer-scan",
      base,
      range,
      examined: log.length,
      commits: log.filter((entry) => entry.trailer).map((entry) => ({ commit: entry.commit, subject: entry.subject, trailer: true, receipt: false, record: null, rewrite: false })),
    };
  }
  const result = spawnSync(process.execPath, [runtime, "bypass-list", "--repo", root, "--range", range, "--json"], {
    cwd: root,
    encoding: "utf8",
    maxBuffer: 16 * 1024 * 1024,
  });
  let entries;
  try {
    entries = result.status === 0 ? JSON.parse(result.stdout) : null;
  } catch {}
  if (!Array.isArray(entries)) {
    return { mode: "unavailable", base, range, reason: `bypass-list failed: ${(result.stderr || result.stdout || `exit ${result.status}`).trim().split("\n")[0]}`, commits: [] };
  }
  // bypass-list reports `receipt` as the best verdict for the tree
  // (PASS | PASS_UNMATCHED | INCONCLUSIVE | UNSUPPORTED | FAIL | none); only PASS is coverage.
  const commits = entries
    .filter((entry) => entry && entry.commit && !merges.has(entry.commit) && entry.receipt !== "PASS" && entry.receipt !== true)
    .map((entry) => {
      const record = readRecord(context, entry);
      return {
        commit: entry.commit,
        tree: entry.tree || null,
        subject: subjects.get(entry.commit) || "",
        trailer: Boolean(entry.trailer),
        receipt: false,
        record,
        // bypass-list verified the original had a receipt or a trailer (A-01);
        // a record that only says "rewritten" is not that.
        rewrite: entry.rewrite === true,
      };
    });
  return { mode: "runtime", base, range, examined: entries.length, commits };
}

export function bypassAccountabilityCheck(bypasses) {
  const id = "bypass-accountability";
  if (!bypasses || bypasses.mode === "skipped") {
    return { id, status: "WARN", detail: `not evaluated: ${bypasses?.reason || "no bypass data"}` };
  }
  if (bypasses.mode === "unavailable") {
    return { id, status: "WARN", detail: `not evaluated: ${bypasses.reason}; re-run /oc-enroll to refresh the runtime` };
  }
  const unaccounted = bypasses.commits.filter((entry) => !entry.trailer && !entry.rewrite);
  if (unaccounted.length) {
    return {
      id,
      status: "FAIL",
      detail: `${unaccounted.length} bypassed commit(s) in ${bypasses.range} carry no Opchain-Bypass: trailer: ${unaccounted.map((entry) => entry.commit.slice(0, 7)).join(", ")} — amend each with --trailer "Opchain-Bypass: <who approved, what failed>" (or /oc-bugcheck bypass)`,
    };
  }
  if (bypasses.mode === "trailer-scan") {
    // A-04: without the local receipts and records there is nothing to pass.
    return {
      id,
      status: "WARN",
      detail: `not evaluated: trailer scan only — receipts and bypass records are not visible here (CI, or no enrolled runtime); ${bypasses.commits.length} of ${bypasses.examined} commit(s) in ${bypasses.range} declare an Opchain-Bypass: trailer. A bypass with no trailer (--no-verify on both commit and push) is not detectable here; the local pre-push hook is what refuses it`,
    };
  }
  const scope = `${bypasses.examined} commit(s) checked against PASS receipts`;
  if (bypasses.commits.length) {
    const rewrites = bypasses.commits.filter((entry) => entry.rewrite).length;
    return {
      id,
      status: "WARN",
      detail: `${bypasses.commits.length} bypassed commit(s) in ${bypasses.range}, all accounted for${rewrites ? ` (${rewrites} rebase/cherry-pick rewrite${rewrites === 1 ? "" : "s"})` : ""}; ${scope}`,
    };
  }
  return { id, status: "PASS", detail: `no bypassed commits in ${bypasses.range}; ${scope}` };
}

export function evaluateReleaseEvidence({
  stage,
  candidate,
  candidateIdentity = { kind: "git_commit", id: candidate },
  tree,
  repositoryId,
  receipt,
  checkpoints = {},
  complianceProfilePresent = false,
  bypasses = null,
} = {}) {
  if (!REQUIRED[stage]) throw new TypeError("stage must be pr or deploy");
  const checks = [];
  const receiptResult = validateReceipt(receipt, {
    repository_id: repositoryId,
    candidate_tree: tree,
    verdict: "PASS",
  });
  checks.push(receiptResult.ok
    ? { id: "executable-verification", status: "PASS", detail: `A receipt covers tree ${tree}` }
    : { id: "executable-verification", status: "FAIL", detail: receiptResult.errors.join("; ") });

  for (const spec of REQUIRED[stage]) {
    const checkpoint = checkpoints[spec.skill];
    checks.push(checkpoint
      ? checkpointResult(checkpoint, spec, candidateIdentity)
      : { id: spec.skill, status: "FAIL", detail: `required checkpoint evidence is missing — ${remedy(spec)}` });
  }

  if (stage === "deploy" && complianceProfilePresent) {
    const checkpoint = checkpoints[COMPLIANCE.skill];
    const result = checkpoint
      ? checkpointResult(checkpoint, COMPLIANCE, candidateIdentity)
      : { id: COMPLIANCE.skill, status: "FAIL", detail: "compliance evidence is missing" };
    checks.push({ ...result, status: result.status === "PASS" ? "PASS" : "WARN" });
  }

  if (stage === "pr" && bypasses) checks.push(bypassAccountabilityCheck(bypasses));

  const failed = checks.filter((check) => check.status === "FAIL");
  const warnings = checks.filter((check) => check.status === "WARN");
  const report = { ok: failed.length === 0, verdict: failed.length ? "FAIL" : "PASS", stage, candidate, tree, checks, warnings };
  if (stage === "pr" && bypasses) {
    report.bypass_mode = bypasses.mode;
    report.bypassed_commits = bypasses.commits.map(({ commit, tree: commitTree, subject, trailer, rewrite, record }) => ({
      commit, tree: commitTree || null, subject, trailer, rewrite, reason: record?.reason ?? null, source: record?.source ?? null,
    }));
  }
  return report;
}

function enforcedReceipt(context) {
  const result = spawnSync(process.execPath, [
    join(ROOT, "scripts/verify-candidate.mjs"),
    "enforce", "--repo", context.root, "--json",
  ], { cwd: context.root, encoding: "utf8" });
  let report;
  try { report = JSON.parse((result.stdout || "").trim()); } catch {}
  if (result.status !== 0 || !report?.ok || !report.receipt_path) {
    throw new Error(report?.error || (result.stderr || "candidate verifier did not return a PASS receipt").trim());
  }
  return JSON.parse(readFileSync(report.receipt_path, "utf8"));
}

function parseArgs(argv) {
  const args = { root: ROOT, checkpointDir: null, json: false };
  const rest = [...argv];
  while (rest.length) {
    const flag = rest.shift();
    if (flag === "--stage") args.stage = rest.shift();
    else if (flag === "--repo") args.root = resolve(rest.shift() || "");
    else if (flag === "--checkpoint-dir") args.checkpointDir = resolve(rest.shift() || "");
    else if (flag === "--print-candidate") args.printCandidate = true;
    else if (flag === "--json") args.json = true;
    else if (flag === "--bypass-source") {
      args.bypassSource = rest.shift();
      if (!["auto", "trailers"].includes(args.bypassSource)) throw new Error("--bypass-source must be auto or trailers");
    }
    else throw new Error(`unknown argument: ${flag}`);
  }
  if (!args.printCandidate && !REQUIRED[args.stage]) throw new Error("--stage must be pr or deploy");
  return args;
}

function readCheckpoint(checkpointDir, skill) {
  const file = join(checkpointDir, `${skill}.checkpoint.json`);
  return existsSync(file) ? JSON.parse(readFileSync(file, "utf8")) : null;
}

function summary(report) {
  const lines = [
    `release evidence: ${report.verdict} (${report.stage}, ${report.candidate})`,
    ...report.checks.map((check) => `  ${check.status.padEnd(4)} ${check.id}: ${check.detail}`),
  ];
  if (report.bypassed_commits?.length) {
    lines.push(`  bypassed commits (${report.bypassed_commits.length}):`);
    for (const entry of report.bypassed_commits) {
      const tag = entry.rewrite ? `rewrite: ${entry.source || "rebase"}` : entry.trailer ? `trailer: ${entry.reason || "present"}` : "NO TRAILER";
      lines.push(`    ${entry.commit.slice(0, 7)}  ${entry.subject}  [${tag}]`);
    }
  }
  return lines.join("\n");
}

async function main(argv = process.argv.slice(2)) {
  let args;
  try {
    args = parseArgs(argv);
    const context = repositoryContext(args.root);
    if (args.printCandidate) {
      const report = { ok: true, candidate: context.candidate, tree: context.tree, candidate_identity: context.candidateIdentity };
      process.stdout.write(`${args.json ? JSON.stringify(report) : `${report.candidate_identity.kind} ${report.candidate_identity.id}`}\n`);
      return 0;
    }
    const specs = [...REQUIRED[args.stage] || []];
    if (args.stage === "deploy" && existsSync(join(context.root, ".opchain/compliance.yaml"))) specs.push(COMPLIANCE);
    const checkpointDir = args.checkpointDir || join(context.root, ".checkpoints");
    const checkpoints = Object.fromEntries(specs.map((spec) => [spec.skill, readCheckpoint(checkpointDir, spec.skill)]));
    const report = evaluateReleaseEvidence({
      stage: args.stage,
      candidate: context.candidate,
      candidateIdentity: context.candidateIdentity,
      tree: context.tree,
      repositoryId: context.repositoryId,
      receipt: enforcedReceipt(context),
      checkpoints,
      complianceProfilePresent: existsSync(join(context.root, ".opchain/compliance.yaml")),
      bypasses: args.stage === "pr" ? collectBypassedCommits(context, { source: args.bypassSource || "auto" }) : null,
    });
    const output = args.json ? JSON.stringify(report) : summary(report);
    (report.ok ? process.stdout : process.stderr).write(`${output}\n`);
    return report.ok ? 0 : 1;
  } catch (error) {
    const report = { ok: false, verdict: "FAIL", error: error.message };
    process.stderr.write(`${args?.json ? JSON.stringify(report) : `release evidence: FAIL — ${error.message}`}\n`);
    return 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href) process.exitCode = await main();

export { main, REQUIRED };
