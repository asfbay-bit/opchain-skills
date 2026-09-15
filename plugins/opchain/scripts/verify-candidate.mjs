#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import {
  closeSync,
  existsSync,
  fsyncSync,
  mkdirSync,
  mkdtempSync,
  openSync,
  readFileSync,
  readdirSync,
  realpathSync,
  rmSync,
  statSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { basename, delimiter, dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const {
  DEFAULT_REQUIRED_CHECKS,
  canonicalJson,
  createPolicy,
  createReceipt,
  createRepositoryIdentity,
  createToolchain,
  receiptPath,
  sha256Bytes,
  validateReceipt,
} = require("./lib/verification-receipt.cjs");

const SCRIPT_PATH = fileURLToPath(import.meta.url);
const RECEIPT_LIB_PATH = fileURLToPath(new URL("./lib/verification-receipt.cjs", import.meta.url));
const VERIFIER_NAME = "opchain-candidate-verifier";
const VERIFIER_VERSION = "1";
const SKIP_DIRS = new Set([".git", ".checkpoints", "node_modules", "dist", "build", "coverage", ".next"]);

function run(executable, args, options = {}) {
  return spawnSync(executable, args, {
    cwd: options.cwd,
    env: options.env || process.env,
    encoding: "utf8",
    maxBuffer: 10 * 1024 * 1024,
    timeout: options.timeout,
    stdio: options.stdio,
  });
}

function git(root, ...args) {
  return run("git", ["-c", "core.hooksPath=/dev/null", "-C", root, ...args]);
}

function gitOutput(root, ...args) {
  const result = git(root, ...args);
  if (result.status !== 0) {
    throw new Error(`git ${args.join(" ")} failed: ${(result.stderr || result.error || "unknown error").toString().trim()}`);
  }
  return (result.stdout || "").trim();
}

function parseArgs(argv) {
  const args = { action: "run", repo: process.cwd(), policy: ".bugcheck.json", json: false };
  const rest = [...argv];
  if (rest[0] === "run" || rest[0] === "enforce") args.action = rest.shift();
  while (rest.length) {
    const flag = rest.shift();
    if (flag === "--repo") args.repo = rest.shift();
    else if (flag === "--policy") args.policy = rest.shift();
    else if (flag === "--json") args.json = true;
    else if (flag === "--commit-boundary") args.commitBoundary = true;
    else throw new Error(`unknown argument: ${flag}`);
  }
  if (!args.repo || !args.policy) throw new Error("--repo and --policy require values");
  if (isAbsolute(args.policy) || args.policy.split(/[\\/]+/).includes("..")) {
    throw new Error("--policy must be a repository-relative path");
  }
  return args;
}

function repositoryInfo(input) {
  const root = realpathSync(gitOutput(resolve(input), "rev-parse", "--show-toplevel"));
  const commonValue = gitOutput(root, "rev-parse", "--git-common-dir");
  const commonDir = realpathSync(isAbsolute(commonValue) ? commonValue : resolve(root, commonValue));
  const objectFormatResult = git(root, "rev-parse", "--show-object-format");
  const objectFormat = objectFormatResult.status === 0 ? objectFormatResult.stdout.trim() : "sha1";
  return {
    root,
    commonDir,
    objectFormat,
    repository: createRepositoryIdentity({ git_common_dir: commonDir, object_format: objectFormat }),
  };
}

function isEnrolled(root) {
  return process.env.OPCHAIN_GATE === "1" || existsSync(join(root, ".opchain")) || existsSync(join(root, ".checkpoints"));
}

function candidateTree(root) {
  return gitOutput(root, "write-tree");
}

function materializeCandidate(info, tree) {
  const scratch = mkdtempSync(join(tmpdir(), "opchain-candidate-"));
  const candidate = join(scratch, "tree");
  const index = join(scratch, "index");
  mkdirSync(candidate, { mode: 0o700 });
  const env = { ...process.env, GIT_INDEX_FILE: index };
  const read = run("git", ["-C", info.root, "read-tree", tree], { env });
  if (read.status !== 0) throw new Error(`could not read candidate tree: ${read.stderr}`);
  const checkout = run("git", ["-C", info.root, "checkout-index", "--all", "--force", `--prefix=${candidate}${sep}`], { env });
  if (checkout.status !== 0) throw new Error(`could not materialize candidate tree: ${checkout.stderr}`);
  initializeCandidateGit(candidate, tree);
  mountPackageDependencies(info.root, candidate);
  return { scratch, candidate };
}

function isolatedCandidateEnvironment(tree) {
  const env = { ...process.env, CI: "1", OPCHAIN_CANDIDATE_TREE: tree };
  for (const name of [
    "GIT_DIR",
    "GIT_WORK_TREE",
    "GIT_INDEX_FILE",
    "GIT_COMMON_DIR",
    "GIT_OBJECT_DIRECTORY",
    "GIT_ALTERNATE_OBJECT_DIRECTORIES",
    "GIT_NAMESPACE",
    "GIT_PREFIX",
  ]) {
    delete env[name];
  }
  env.GIT_CONFIG_GLOBAL = "/dev/null";
  env.GIT_CONFIG_SYSTEM = "/dev/null";
  return env;
}

function initializeCandidateGit(candidate, tree) {
  const env = {
    ...isolatedCandidateEnvironment(tree),
    GIT_AUTHOR_NAME: "opchain candidate verifier",
    GIT_AUTHOR_EMAIL: "candidate@opchain.invalid",
    GIT_COMMITTER_NAME: "opchain candidate verifier",
    GIT_COMMITTER_EMAIL: "candidate@opchain.invalid",
    GIT_AUTHOR_DATE: "2000-01-01T00:00:00Z",
    GIT_COMMITTER_DATE: "2000-01-01T00:00:00Z",
  };
  const init = run("git", ["init", "-q", "-b", "opchain-candidate"], { cwd: candidate, env });
  if (init.status !== 0) throw new Error(`could not initialize isolated candidate Git metadata: ${init.stderr}`);
  const add = run("git", ["add", "-A", "--", "."], { cwd: candidate, env });
  if (add.status !== 0) throw new Error(`could not index isolated candidate: ${add.stderr}`);
  const isolatedTree = run("git", ["write-tree"], { cwd: candidate, env });
  if (isolatedTree.status !== 0 || isolatedTree.stdout.trim() !== tree) {
    throw new Error("isolated candidate Git tree does not match the effective staged candidate");
  }
  const commit = run("git", ["commit-tree", tree, "-m", "opchain candidate"], { cwd: candidate, env });
  if (commit.status !== 0) throw new Error(`could not create isolated candidate revision: ${commit.stderr}`);
  const update = run("git", ["update-ref", "refs/heads/opchain-candidate", commit.stdout.trim()], { cwd: candidate, env });
  if (update.status !== 0) throw new Error(`could not bind isolated candidate revision: ${update.stderr}`);
}

function packageDirectories(candidate) {
  const directories = [];
  const visit = (directory) => {
    if (existsSync(join(directory, "package.json"))) directories.push(directory);
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      if (!entry.isDirectory() || SKIP_DIRS.has(entry.name)) continue;
      visit(join(directory, entry.name));
    }
  };
  visit(candidate);
  return directories;
}

function mountPackageDependencies(sourceRoot, candidate) {
  const excludes = [];
  for (const directory of packageDirectories(candidate)) {
    const relativeDirectory = relative(candidate, directory);
    const source = join(sourceRoot, relativeDirectory, "node_modules");
    const target = join(directory, "node_modules");
    if (!existsSync(source) || existsSync(target)) continue;
    symlinkSync(source, target, "junction");
    excludes.push(`/${relative(candidate, target).split(sep).join("/")}/`);
  }
  if (excludes.length) {
    writeFileSync(join(candidate, ".git", "info", "exclude"), `${excludes.join("\n")}\n`, "utf8");
  }
}

function packageScripts(candidate) {
  const packagePath = join(candidate, "package.json");
  if (!existsSync(packagePath)) return {};
  const parsed = JSON.parse(readFileSync(packagePath, "utf8"));
  return parsed && typeof parsed.scripts === "object" && parsed.scripts ? parsed.scripts : {};
}

function detectedChecks(candidate) {
  const scripts = packageScripts(candidate);
  const checks = ["anti_patterns", "secrets"];
  if (scripts.typecheck || scripts["type-check"] || scripts["check:types"]) checks.push("type_safety");
  if (scripts.lint) checks.push("lint");
  if (scripts.test) checks.push("tests");
  if (scripts.build) checks.push("build");
  if (existsSync(join(candidate, "package-lock.json"))) checks.push("dependencies");
  return checks;
}

function scanExceptionsForCandidate(candidate, value) {
  if (value === undefined) return {};
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("verification.scan_exceptions must be an object");
  }
  const normalized = {};
  for (const [id, entries] of Object.entries(value)) {
    if (!new Set(["anti_patterns", "secrets"]).has(id) || !Array.isArray(entries)) {
      throw new Error(`verification.scan_exceptions.${id} must be an array for a built-in scanner`);
    }
    const paths = new Set();
    for (const [index, entry] of entries.entries()) {
      if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
        throw new Error(`verification.scan_exceptions.${id}[${index}] must be an object`);
      }
      const exceptionPath = entry.path;
      if (typeof exceptionPath !== "string" || !exceptionPath || isAbsolute(exceptionPath) || exceptionPath.split(/[\\/]+/).includes("..")) {
        throw new Error(`verification.scan_exceptions.${id}[${index}].path must stay within the repository`);
      }
      const portablePath = exceptionPath.replace(/\\/g, "/");
      if (paths.has(portablePath)) throw new Error(`verification.scan_exceptions.${id} contains duplicate path ${portablePath}`);
      const fullPath = join(candidate, ...portablePath.split("/"));
      if (!existsSync(fullPath) || !statSync(fullPath).isFile()) {
        throw new Error(`verification.scan_exceptions.${id} path is missing: ${portablePath}`);
      }
      const digest = sha256Bytes(readFileSync(fullPath));
      if (entry.digest !== digest) {
        throw new Error(`verification.scan_exceptions.${id} digest is stale for ${portablePath}`);
      }
      paths.add(portablePath);
    }
    normalized[id] = paths;
  }
  return normalized;
}

function policyForCandidate(candidate, policyPath) {
  const fullPath = join(candidate, policyPath);
  let parsed = {};
  let config = { path: policyPath, present: false };
  if (existsSync(fullPath)) {
    const content = readFileSync(fullPath);
    parsed = JSON.parse(content.toString("utf8"));
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error(`${policyPath} must contain a JSON object`);
    config = { path: policyPath, content };
  }
  const verification = parsed.verification && typeof parsed.verification === "object" ? parsed.verification : {};
  let required = verification.required_checks;
  if (required === undefined && parsed.checks && typeof parsed.checks === "object") {
    required = Object.entries(parsed.checks)
      .filter(([, value]) => !value || value.enabled !== false)
      .map(([id]) => id);
  }
  if (required === undefined) required = detectedChecks(candidate);
  if (!Array.isArray(required) || required.length === 0) required = [...DEFAULT_REQUIRED_CHECKS];

  const commands = verification.commands && typeof verification.commands === "object" ? verification.commands : {};
  for (const [id, command] of Object.entries(commands)) {
    if (!Array.isArray(command) || command.length === 0 || command.some((part) => typeof part !== "string" || !part)) {
      throw new Error(`verification.commands.${id} must be a non-empty argv array`);
    }
  }
  const timeout = verification.timeout_ms === undefined ? 120000 : verification.timeout_ms;
  if (!Number.isInteger(timeout) || timeout < 1000 || timeout > 600000) {
    throw new Error("verification.timeout_ms must be an integer from 1000 to 600000");
  }
  const warningBehavior = verification.warning_behavior || (parsed.mode === "strict" ? "fail" : "allow");
  return {
    policy: createPolicy({ required_checks: required, warning_behavior: warningBehavior, config }),
    commands,
    timeout,
    scanExceptions: scanExceptionsForCandidate(candidate, verification.scan_exceptions),
  };
}

function executablePath(name) {
  if (name.includes(sep)) return isAbsolute(name) ? name : null;
  for (const directory of String(process.env.PATH || "").split(delimiter)) {
    const candidate = join(directory, name);
    try {
      if (statSync(candidate).isFile()) return realpathSync(candidate);
    } catch {
      // Keep searching PATH.
    }
  }
  return null;
}

function toolchainFor(commands, requiredChecks) {
  const executables = new Set(["git", process.execPath]);
  Object.values(commands).forEach((command) => executables.add(command[0]));
  if (requiredChecks.some((id) => !commands[id] && ["type_safety", "lint", "tests", "build", "dependencies"].includes(id))) {
    executables.add("npm");
  }
  const components = [];
  const used = new Set();
  for (const executable of executables) {
    const resolved = executablePath(executable) || (isAbsolute(executable) ? executable : null);
    let name = basename(executable).toLowerCase().replace(/[^a-z0-9_.-]+/g, "-").replace(/^[^a-z]+/, "");
    if (!name) name = "tool";
    let uniqueName = name;
    let suffix = 2;
    while (used.has(uniqueName)) uniqueName = `${name}-${suffix++}`;
    used.add(uniqueName);
    const versionResult = run(executable, ["--version"], { timeout: 5000 });
    const versionText = `${versionResult.stdout || ""}\n${versionResult.stderr || ""}`.trim().split("\n")[0];
    const component = { name: uniqueName, version: versionText || "version-unavailable" };
    if (resolved && existsSync(resolved)) component.digest = sha256Bytes(readFileSync(resolved));
    components.push(component);
  }
  return createToolchain({ components });
}

function candidateTextBlobs(candidate, tree) {
  const env = isolatedCandidateEnvironment(tree);
  const listing = run("git", ["ls-tree", "-r", "-z", "--long", tree], { cwd: candidate, env });
  if (listing.status !== 0) throw new Error(`could not enumerate candidate tree: ${listing.stderr}`);
  const blobs = [];
  for (const record of listing.stdout.split("\0")) {
    if (!record) continue;
    const tab = record.indexOf("\t");
    const metadata = record.slice(0, tab).trim().split(/\s+/);
    const candidatePath = record.slice(tab + 1);
    const [, type, oid, sizeText] = metadata;
    if (type !== "blob" || Number(sizeText) > 1024 * 1024 || candidatePath.split("/").some((part) => SKIP_DIRS.has(part))) continue;
    const content = run("git", ["cat-file", "blob", oid], { cwd: candidate, env });
    if (content.status !== 0) throw new Error(`could not read candidate blob ${candidatePath}: ${content.stderr}`);
    blobs.push({ path: candidatePath, content: content.stdout });
  }
  return blobs;
}

function scan(candidate, tree, patterns, exceptions = new Set()) {
  const hits = [];
  for (const blob of candidateTextBlobs(candidate, tree)) {
    if (exceptions.has(blob.path)) continue;
    for (const pattern of patterns) {
      if (pattern.test(blob.content)) hits.push(blob.path);
      pattern.lastIndex = 0;
    }
  }
  return [...new Set(hits)].sort();
}

function builtinCheck(id, candidate, tree, scanExceptions) {
  const scripts = packageScripts(candidate);
  if (id === "anti_patterns") {
    const failures = scan(candidate, tree, [/\bdebugger\b/g, /\.only\s*\(/g], scanExceptions.anti_patterns);
    return { status: failures.length ? "FAIL" : "PASS", exit_code: failures.length ? 1 : 0, output: failures.join("\n") };
  }
  if (id === "secrets") {
    const failures = scan(candidate, tree, [
      /-----BEGIN (?:(?:RSA|EC|DSA|OPENSSH|ENCRYPTED) )?PRIVATE KEY-----/g,
      new RegExp("-----BEGIN PGP PRIVATE KEY " + "BLOCK-----", "g"),
      /AKIA[0-9A-Z]{16}/g,
      /\b(?:sk_live_|sk_test_|ghp_|gho_|github_pat_)[A-Za-z0-9_-]{12,}/g,
      /eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/g,
    ], scanExceptions.secrets);
    return { status: failures.length ? "FAIL" : "PASS", exit_code: failures.length ? 1 : 0, output: failures.join("\n") };
  }
  const scriptNames = {
    type_safety: ["typecheck", "type-check", "check:types"],
    lint: ["lint"],
    tests: ["test"],
    build: ["build"],
  };
  if (scriptNames[id]) {
    const script = scriptNames[id].find((name) => scripts[name]);
    if (!script) return { status: "UNSUPPORTED", exit_code: 127, output: `no package script for ${id}` };
    return { command: ["npm", "run", script] };
  }
  if (id === "dependencies" && existsSync(join(candidate, "package-lock.json"))) {
    return { command: ["npm", "audit", "--audit-level=critical", "--ignore-scripts"] };
  }
  return { status: "UNSUPPORTED", exit_code: 127, output: `no verifier implementation for ${id}` };
}

function boundedDiagnostic(value) {
  let output = String(value || "");
  output = output
    .replace(/-----BEGIN [^-\n]*PRIVATE KEY-----[\s\S]*?-----END [^-\n]*PRIVATE KEY-----/g, "[REDACTED PRIVATE KEY]")
    .replace(/AKIA[0-9A-Z]{16}/g, "[REDACTED AWS KEY]")
    .replace(/\b(?:sk_live_|sk_test_|ghp_|gho_|github_pat_)[A-Za-z0-9_-]{12,}/g, "[REDACTED TOKEN]")
    .replace(/eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/g, "[REDACTED JWT]")
    .replace(/\b([A-Z][A-Z0-9_]*(?:KEY|TOKEN|SECRET|PASSWORD))=\S+/g, "$1=[REDACTED]");
  const limit = 8 * 1024;
  if (Buffer.byteLength(output, "utf8") <= limit) return output;
  const header = "[output truncated; showing final bytes]\n";
  const bytes = Buffer.from(output, "utf8");
  let tail = bytes.subarray(bytes.length - (limit - Buffer.byteLength(header, "utf8")));
  while (tail.length && (tail[0] & 0xc0) === 0x80) tail = tail.subarray(1);
  return header + tail.toString("utf8");
}

function executeCheck(id, command, candidate, timeout, tree, scanExceptions) {
  const started = Date.now();
  const selected = command ? { command } : builtinCheck(id, candidate, tree, scanExceptions);
  if (!selected.command) {
    return {
      id,
      status: selected.status,
      exit_code: selected.exit_code,
      duration_ms: Date.now() - started,
      output_digest: sha256Bytes(selected.output || ""),
      diagnostic: selected.status === "PASS" ? undefined : boundedDiagnostic(selected.output),
    };
  }
  const [executable, ...args] = selected.command;
  const result = run(executable, args, {
    cwd: candidate,
    timeout,
    env: isolatedCandidateEnvironment(tree),
  });
  let status;
  let exitCode;
  if (result.error && result.error.code === "ENOENT") {
    status = "UNSUPPORTED";
    exitCode = 127;
  } else if (result.error && result.error.code === "ETIMEDOUT") {
    status = "ERROR";
    exitCode = 124;
  } else {
    exitCode = Number.isInteger(result.status) && result.status >= 0 ? result.status : 1;
    status = exitCode === 0 ? "PASS" : "FAIL";
  }
  return {
    id,
    status,
    exit_code: exitCode,
    duration_ms: Date.now() - started,
    output_digest: sha256Bytes(`${result.stdout || ""}\n${result.stderr || ""}`),
    diagnostic: status === "PASS" ? undefined : boundedDiagnostic(`${result.stdout || ""}\n${result.stderr || ""}`),
  };
}

function verifierIdentity() {
  return {
    name: VERIFIER_NAME,
    version: VERIFIER_VERSION,
    digest: sha256Bytes(Buffer.concat([readFileSync(SCRIPT_PATH), readFileSync(RECEIPT_LIB_PATH)])),
  };
}

function writeImmutableReceipt(receipt, info) {
  const target = receiptPath({
    git_common_dir: info.commonDir,
    candidate_tree: receipt.candidate.tree,
    policy_fingerprint: receipt.policy.fingerprint,
    run_id: receipt.run_id,
  });
  mkdirSync(dirname(target), { recursive: true, mode: 0o700 });
  const descriptor = openSync(target, "wx", 0o600);
  try {
    writeFileSync(descriptor, `${canonicalJson(receipt)}\n`, "utf8");
    fsyncSync(descriptor);
  } finally {
    closeSync(descriptor);
  }
  return target;
}

function matchingReceipt(info, tree, policy, toolchain, verifier) {
  const sample = receiptPath({
    git_common_dir: info.commonDir,
    candidate_tree: tree,
    policy_fingerprint: policy.fingerprint,
    run_id: "lookup",
  });
  const directory = dirname(sample);
  if (!existsSync(directory)) return null;
  const matches = [];
  for (const name of readdirSync(directory).filter((entry) => entry.endsWith(".json"))) {
    try {
      const value = JSON.parse(readFileSync(join(directory, name), "utf8"));
      const checked = validateReceipt(value, {
        repository_id: info.repository.id,
        candidate_tree: tree,
        policy_fingerprint: policy.fingerprint,
        toolchain_fingerprint: toolchain.fingerprint,
        verdict: "PASS",
      });
      if (checked.ok && checked.receipt.verifier.digest === verifier.digest) {
        matches.push({ path: join(directory, name), receipt: checked.receipt });
      }
    } catch {
      // A malformed or mismatched receipt is never authorization.
    }
  }
  matches.sort((a, b) => Date.parse(b.receipt.verified_at) - Date.parse(a.receipt.verified_at));
  return matches[0] || null;
}

function report(args, value, ok) {
  if (args.json) process.stdout.write(`${JSON.stringify(value)}\n`);
  else if (ok && value.skipped) return;
  else if (ok) process.stdout.write(`[opchain] verified staged candidate ${value.candidate_tree.slice(0, 12)}\n`);
  else process.stderr.write(`[opchain] candidate verification failed: ${value.error}\n`);
}

async function main(argv = process.argv.slice(2)) {
  let args;
  try {
    args = parseArgs(argv);
    const info = repositoryInfo(args.repo);
    if (!isEnrolled(info.root)) {
      report(args, { ok: true, skipped: true, reason: "repository is not enrolled" }, true);
      return 0;
    }
    const tree = candidateTree(info.root);
    const materialized = materializeCandidate(info, tree);
    try {
      const { policy, commands, timeout, scanExceptions } = policyForCandidate(materialized.candidate, args.policy);
      const toolchain = toolchainFor(commands, policy.required_checks);
      const verifier = verifierIdentity();

      if (args.action === "enforce") {
        const match = matchingReceipt(info, tree, policy, toolchain, verifier);
        if (!match) {
          report(args, { ok: false, action: "enforce", candidate_tree: tree, error: "no matching PASS receipt" }, false);
          return 1;
        }
        report(args, { ok: true, action: "enforce", candidate_tree: tree, receipt_path: match.path }, true);
        return 0;
      }

      const startedAt = new Date().toISOString();
      const checks = policy.required_checks.map((id) => executeCheck(id, commands[id], materialized.candidate, timeout, tree, scanExceptions));
      if (candidateTree(info.root) !== tree) {
        report(args, { ok: false, action: "run", candidate_tree: tree, error: "staged candidate changed during verification" }, false);
        return 1;
      }
      const receipt = createReceipt({
        repository: info.repository,
        candidate: { tree },
        policy,
        toolchain,
        verifier,
        started_at: startedAt,
        verified_at: new Date().toISOString(),
        checks,
      });
      const target = writeImmutableReceipt(receipt, info);
      const match = matchingReceipt(info, candidateTree(info.root), policy, toolchain, verifier);
      if (!match || match.path !== target || receipt.verdict !== "PASS") {
        const failures = checks
          .filter((check) => check.status !== "PASS")
          .map(({ id, status, exit_code, diagnostic }) => ({ id, status, exit_code, diagnostic }));
        report(args, {
          ok: false,
          action: "run",
          candidate_tree: tree,
          receipt_path: target,
          verdict: receipt.verdict,
          failures,
          error: "checks did not produce an enforceable PASS receipt",
        }, false);
        return 1;
      }
      report(args, { ok: true, action: "run", candidate_tree: tree, receipt_path: target, verdict: receipt.verdict, checks }, true);
      return 0;
    } finally {
      rmSync(materialized.scratch, { recursive: true, force: true });
    }
  } catch (error) {
    report(args || { json: argv.includes("--json") }, { ok: false, error: error.message }, false);
    return 1;
  }
}

if (process.argv[1] && realpathSync(SCRIPT_PATH) === realpathSync(resolve(process.argv[1]))) {
  process.exitCode = await main();
}

export { main };
