#!/usr/bin/env node

// opchain candidate verifier — the executable half of the commit gate.
//
// Exit codes (the hook propagates them):
//   0  PASS, skipped (not enrolled), or an existing PASS receipt was reused
//   1  FAIL — a check really failed; fix the candidate
//   2  INCONCLUSIVE — timeout / exit 127 / gate lock wait; retry, nothing to fix
//   3  BLOCKED — a precondition is missing (deps not installed, policy predates
//      the gate); no receipt is written
//
// Audit references (docs/audits/2026-10-08-opchain-effectiveness-audit.md):
//   I-03  opaque failures, hollow node_modules, orphaned workers, timeouts as FAIL
//   I-04  bypass records
//   I-05  receipt reuse for identical / checkpoint-only trees

import { spawn, spawnSync } from "node:child_process";
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
import { loadavg, tmpdir } from "node:os";
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
  receiptRoot,
  sha256Bytes,
  validateReceipt,
} = require("./lib/verification-receipt.cjs");

const SCRIPT_PATH = fileURLToPath(import.meta.url);
const RECEIPT_LIB_PATH = fileURLToPath(new URL("./lib/verification-receipt.cjs", import.meta.url));
const VERIFIER_NAME = "opchain-candidate-verifier";
const VERIFIER_VERSION = "2";
const SKIP_DIRS = new Set([".git", ".checkpoints", "node_modules", "dist", "build", "coverage", ".next"]);

const EXIT_OK = 0;
const EXIT_FAIL = 1;
const EXIT_INCONCLUSIVE = 2;
const EXIT_BLOCKED = 3;

// I-03: a node_modules holding only tool caches is "absent", not "installed".
const HOLLOW_ENTRIES = new Set([".vite", ".cache", ".package-lock.json", ".DS_Store", ".modules.yaml"]);
// Command words that are never a package bin, so their absence from
// node_modules/.bin is not a dependency problem.
const SYSTEM_COMMANDS = new Set([
  "node", "npm", "npx", "pnpm", "yarn", "bun", "deno", "corepack", "git", "sh", "bash", "zsh", "env", "cross-env",
  "echo", "printf", "test", "[", "true", "false", "exit", "export", "set", "cd", "rm", "cp", "mv", "mkdir", "cat",
  "ls", "find", "xargs", "chmod", "touch", "sleep", "tar", "curl", "wget", "python", "python3", "make", "docker",
  "sed", "awk", "grep", "sort", "head", "tail", "tee", "wc", "which", "date", "dirname", "basename",
]);

const DIAGNOSTIC_TAIL_LINES = 40;
const LOCK_WAIT_MS = Number(process.env.OPCHAIN_GATE_LOCK_WAIT_MS) || 15 * 60 * 1000;
const LOCK_STALE_MS = Number(process.env.OPCHAIN_GATE_LOCK_STALE_MS) || 20 * 60 * 1000;
const LOCK_POLL_MS = Number(process.env.OPCHAIN_GATE_LOCK_POLL_MS) || 1000;
const LOCK_REPORT_MS = Number(process.env.OPCHAIN_GATE_LOCK_REPORT_MS) || 10 * 1000;

/** A missing precondition: reported as BLOCKED (exit 3), never as a receipt. */
class BlockedError extends Error {
  constructor(message, details = []) {
    super(message);
    this.blocked = true;
    this.details = details;
  }
}

/** An environmental non-answer that produced no receipt (e.g. lock wait). */
class InconclusiveError extends Error {
  constructor(message) {
    super(message);
    this.inconclusive = true;
  }
}

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

const ACTIONS = new Set(["run", "enforce", "explain", "bypass-record", "bypass-list"]);

function parseArgs(argv) {
  const args = { action: "run", repo: process.cwd(), policy: ".bugcheck.json", json: false };
  const rest = [...argv];
  if (ACTIONS.has(rest[0])) args.action = rest.shift();
  if (args.action === "explain") {
    if (!rest.length || rest[0].startsWith("--")) throw new Error("explain requires a receipt path or run id");
    args.target = rest.shift();
  }
  while (rest.length) {
    const flag = rest.shift();
    if (flag === "--repo") args.repo = rest.shift();
    else if (flag === "--policy") args.policy = rest.shift();
    else if (flag === "--json") args.json = true;
    else if (flag === "--commit-boundary") args.commitBoundary = true;
    else if (flag === "--commit") args.commit = rest.shift();
    else if (flag === "--reason") args.reason = rest.shift();
    else if (flag === "--source") args.source = rest.shift();
    else if (flag === "--approved-by") args.approvedBy = rest.shift();
    else if (flag === "--rewritten-from") args.rewrittenFrom = rest.shift();
    else if (flag === "--range") args.range = rest.shift();
    else if (flag === "--full") args.full = true;
    else throw new Error(`unknown argument: ${flag}`);
  }
  if (!args.repo || !args.policy) throw new Error("--repo and --policy require values");
  if (isAbsolute(args.policy) || args.policy.split(/[\\/]+/).includes("..")) {
    throw new Error("--policy must be a repository-relative path");
  }
  if (args.action === "bypass-record" && !args.commit) throw new Error("bypass-record requires --commit <sha>");
  if (args.action === "bypass-list" && !args.range) throw new Error("bypass-list requires --range <base>..<head>");
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

function readJson(file) {
  try {
    const parsed = JSON.parse(readFileSync(file, "utf8"));
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Candidate materialisation
// ---------------------------------------------------------------------------

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
  // Dependencies are mounted later, once the policy is known (I-03: the policy
  // decides which package dirs and which .bin entries are needed).
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

// ---------------------------------------------------------------------------
// I-03 (b): dependency demands, node_modules validity, ancestor walk
// ---------------------------------------------------------------------------

function portable(relativePath) {
  const normalized = relativePath.split(sep).join("/").replace(/^\.\/+/, "").replace(/\/+$/, "");
  return normalized === "" ? "." : normalized;
}

function joinRelative(base, next) {
  return portable(relative("/", resolve("/", base === "." ? "" : base, next)));
}

/**
 * Walk every policy command (and the npm scripts it dispatches to) and return
 * Map<relativePackageDir, Set<binName>>: the package dirs a check will run in
 * ("targeted") and the node_modules/.bin entries each one needs. Untargeted
 * nested packages (e.g. packaged runtimes with no node_modules anywhere) are
 * mounted when present and otherwise left alone.
 */
function dependencyDemands(candidate, commands) {
  const demands = new Map([[".", new Set()]]);
  const touch = (directory) => {
    if (!demands.has(directory)) demands.set(directory, new Set());
    return demands.get(directory);
  };
  const scriptsIn = (directory) => {
    const parsed = readJson(join(candidate, ...(directory === "." ? [] : directory.split("/")), "package.json"));
    return parsed && typeof parsed.scripts === "object" && parsed.scripts ? parsed.scripts : {};
  };

  const analyzeArgv = (argv, directory, depth) => {
    if (!argv.length || depth > 4) return;
    let cwd = directory;
    let index = 0;
    while (index < argv.length && /^[A-Za-z_][A-Za-z0-9_]*=/.test(argv[index])) index += 1;
    if (argv[index] === "env" || argv[index] === "cross-env") {
      index += 1;
      while (index < argv.length && /^[A-Za-z_][A-Za-z0-9_]*=/.test(argv[index])) index += 1;
    }
    const executable = argv[index];
    if (!executable) return;
    const tail = argv.slice(index + 1);
    if (["npm", "pnpm", "yarn", "bun"].includes(executable)) {
      const words = [];
      for (let i = 0; i < tail.length; i += 1) {
        const word = tail[i];
        if (word === "--prefix" || word === "-C" || word === "--dir") cwd = joinRelative(cwd, tail[++i] || ".");
        else if (word.startsWith("--prefix=")) cwd = joinRelative(cwd, word.slice("--prefix=".length));
        else if (word.startsWith("-")) continue;
        else words.push(word);
      }
      const bins = touch(cwd);
      const [verb, name] = words;
      const runScript = (scriptName) => {
        const scripts = scriptsIn(cwd);
        // npm runs pre<name> and post<name> around <name>; follow all three.
        for (const key of [`pre${scriptName}`, scriptName, `post${scriptName}`]) {
          if (scripts[key]) analyzeScript(scripts[key], cwd, depth + 1);
        }
      };
      if (verb === "run" || verb === "run-script") {
        if (name) runScript(name);
      } else if (verb === "test" || verb === "t" || verb === "start") {
        runScript(verb === "t" ? "test" : verb);
      } else if ((verb === "exec" || verb === "x" || verb === "dlx") && name) {
        bins.add(name);
      }
      return;
    }
    if (executable === "npx") {
      const target = tail.find((word) => !word.startsWith("-"));
      if (target) touch(cwd).add(target);
      return;
    }
    touch(cwd);
    if (SYSTEM_COMMANDS.has(executable) || executable.includes("/") || executable.includes(sep)) return;
    touch(cwd).add(executable);
  };

  const analyzeScript = (text, directory, depth) => {
    let cwd = directory;
    for (const segment of String(text).split(/\s*(?:&&|\|\||;|\|)\s*/)) {
      const tokens = segment.trim().replace(/["']/g, "").split(/\s+/).filter(Boolean);
      if (!tokens.length) continue;
      let index = 0;
      while (index < tokens.length && /^[A-Za-z_][A-Za-z0-9_]*=/.test(tokens[index])) index += 1;
      if (tokens[index] === "cd" && tokens[index + 1]) {
        cwd = joinRelative(cwd, tokens[index + 1]);
        touch(cwd);
        continue;
      }
      analyzeArgv(tokens.slice(index), cwd, depth);
    }
  };

  for (const command of Object.values(commands)) analyzeArgv(command, ".", 0);
  return demands;
}

function declaredDependencies(packageJson) {
  const names = new Set();
  for (const field of ["dependencies", "devDependencies"]) {
    const block = packageJson && packageJson[field];
    if (block && typeof block === "object") Object.keys(block).forEach((name) => names.add(name));
  }
  return names;
}

function nodeModulesPresent(directory) {
  const target = join(directory, "node_modules");
  try {
    if (!statSync(target).isDirectory()) return false;
    return readdirSync(target).some((entry) => !HOLLOW_ENTRIES.has(entry));
  } catch {
    return false;
  }
}

/**
 * Is <installRoot>/node_modules a usable dependency root for the candidate
 * package at <candidateDir>? Checks, in order: presence (hollow = absent),
 * the .bin entries the policy needs, direct dependencies declared in
 * package.json, and version agreement between the candidate's package-lock.json
 * and npm's hidden node_modules/.package-lock.json.
 */
function dependencyRootStatus(installRoot, candidateDir, bins) {
  if (!nodeModulesPresent(installRoot)) return { ok: false, reason: "node_modules is absent or hollow" };
  const nodeModules = join(installRoot, "node_modules");
  for (const bin of bins) {
    if (!existsSync(join(nodeModules, ".bin", bin)) && !executablePath(bin)) {
      return { ok: false, reason: `node_modules/.bin/${bin} is missing` };
    }
  }
  const packageJson = readJson(join(candidateDir, "package.json")) || {};
  const lock = readJson(join(candidateDir, "package-lock.json"));
  const lockPackages = lock && lock.packages && typeof lock.packages === "object" ? lock.packages : {};
  for (const name of declaredDependencies(packageJson)) {
    const entry = lockPackages[`node_modules/${name}`];
    if (entry && entry.optional) continue;
    if (!existsSync(join(nodeModules, ...name.split("/")))) {
      return { ok: false, reason: `dependency ${name} is not installed` };
    }
  }
  const hidden = lock ? readJson(join(nodeModules, ".package-lock.json")) : null;
  const hiddenPackages = hidden && hidden.packages && typeof hidden.packages === "object" ? hidden.packages : {};
  for (const [key, installed] of Object.entries(hiddenPackages)) {
    if (!key.startsWith("node_modules/")) continue;
    const expected = lockPackages[key];
    if (!expected || !installed || !expected.version || !installed.version) continue;
    if (expected.version !== installed.version) {
      return { ok: false, reason: `${key} is ${installed.version} but package-lock.json wants ${expected.version}` };
    }
  }
  return { ok: true };
}

function* ancestorDirectories(root) {
  let directory = dirname(root);
  while (directory && directory !== dirname(directory)) {
    yield directory;
    directory = dirname(directory);
  }
}

/**
 * I-03 (b): mount a validated dependency root for each candidate package.
 * Targeted dirs that need dependencies and have no valid root in the worktree
 * or any ancestor checkout abort with BLOCKED before any check runs.
 */
function mountPackageDependencies(sourceRoot, candidate, demands) {
  const excludes = [];
  for (const directory of packageDirectories(candidate)) {
    const relativeDirectory = portable(relative(candidate, directory));
    const target = join(directory, "node_modules");
    if (existsSync(target)) continue;
    const bins = demands.get(relativeDirectory);
    const targeted = bins !== undefined;
    const needed = targeted && (bins.size > 0 || declaredDependencies(readJson(join(directory, "package.json"))).size > 0);
    const worktreeDir = relativeDirectory === "." ? sourceRoot : join(sourceRoot, ...relativeDirectory.split("/"));

    const roots = [worktreeDir];
    if (needed) {
      for (const ancestor of ancestorDirectories(sourceRoot)) {
        roots.push(relativeDirectory === "." ? ancestor : join(ancestor, ...relativeDirectory.split("/")));
      }
    }
    let chosen = null;
    const rejected = [];
    for (const root of roots) {
      const status = dependencyRootStatus(root, directory, bins || new Set());
      if (status.ok) {
        chosen = root;
        break;
      }
      if (nodeModulesPresent(root) || root === worktreeDir) rejected.push(`${join(root, "node_modules")}: ${status.reason}`);
    }
    if (!chosen) {
      if (needed) {
        throw new BlockedError(`dependencies not installed for ${worktreeDir} (run npm ci there)`, rejected);
      }
      continue;
    }
    symlinkSync(join(chosen, "node_modules"), target, "junction");
    excludes.push(`/${portable(relative(candidate, target))}/`);
  }
  if (excludes.length) {
    writeFileSync(join(candidate, ".git", "info", "exclude"), `${excludes.join("\n")}\n`, "utf8");
  }
}

// ---------------------------------------------------------------------------
// Policy
// ---------------------------------------------------------------------------

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
  // I-03 (e): a policy without a `verification` block predates the commit gate.
  // Running defaults against it flagged the skill's own docs; refuse instead.
  if (!existsSync(fullPath)) {
    throw new BlockedError(`${policyPath} is missing (no "verification" block); merge main or run /oc-enroll`);
  }
  const content = readFileSync(fullPath);
  const parsed = JSON.parse(content.toString("utf8"));
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error(`${policyPath} must contain a JSON object`);
  if (!parsed.verification || typeof parsed.verification !== "object" || Array.isArray(parsed.verification)) {
    throw new BlockedError(`${policyPath} predates the commit gate (no "verification" block); merge main or run /oc-enroll`);
  }
  const config = { path: policyPath, content };
  const verification = parsed.verification;
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

// ---------------------------------------------------------------------------
// Toolchain
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Built-in scanners
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// I-03 (c): process-group execution with a whole-group kill on timeout
// ---------------------------------------------------------------------------

const activeGroups = new Set();

function killGroup(pid, signal) {
  for (const target of [-pid, pid]) {
    try {
      process.kill(target, signal);
    } catch {
      // Already gone, or no group on this platform.
    }
  }
}

function killActiveGroups() {
  for (const pid of activeGroups) killGroup(pid, "SIGKILL");
  activeGroups.clear();
}

process.on("exit", killActiveGroups);
for (const signal of ["SIGINT", "SIGTERM", "SIGHUP"]) {
  process.on(signal, () => {
    killActiveGroups();
    process.exit(128 + (signal === "SIGINT" ? 2 : signal === "SIGTERM" ? 15 : 1));
  });
}

/**
 * spawnSync-shaped result, but the child is a detached process-group leader
 * and a timeout kills the whole group (SIGTERM, then SIGKILL two seconds
 * later) so vitest workers and test fixtures cannot outlive the gate.
 */
function spawnGroup(executable, args, { cwd, env, timeout }) {
  const cap = 10 * 1024 * 1024;
  return new Promise((resolveResult) => {
    let settled = false;
    let timedOut = false;
    let timer;
    let hardTimer;
    let child;
    let stdout = Buffer.alloc(0);
    let stderr = Buffer.alloc(0);
    const append = (current, chunk) => {
      const next = Buffer.concat([current, chunk]);
      return next.length > cap ? next.subarray(next.length - cap) : next;
    };
    const settle = (value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      clearTimeout(hardTimer);
      if (child && child.pid) activeGroups.delete(child.pid);
      resolveResult({ stdout: stdout.toString("utf8"), stderr: stderr.toString("utf8"), timedOut, ...value });
    };
    try {
      child = spawn(executable, args, { cwd, env, detached: process.platform !== "win32", stdio: ["ignore", "pipe", "pipe"] });
    } catch (error) {
      settle({ error, status: null, signal: null });
      return;
    }
    timer = setTimeout(() => {
      timedOut = true;
      killGroup(child.pid, "SIGTERM");
      hardTimer = setTimeout(() => killGroup(child.pid, "SIGKILL"), 2000);
    }, timeout);
    if (child.pid) activeGroups.add(child.pid);
    child.stdout.on("data", (chunk) => { stdout = append(stdout, chunk); });
    child.stderr.on("data", (chunk) => { stderr = append(stderr, chunk); });
    child.on("error", (error) => settle({ error, status: null, signal: null }));
    child.on("close", (status, signal) => {
      // After a timeout the leader may have died before the SIGKILL sweep;
      // make sure nothing it spawned lingers. A normal exit is left alone.
      if (timedOut && child.pid) killGroup(child.pid, "SIGKILL");
      settle({ status, signal });
    });
  });
}

async function executeCheck(id, command, candidate, timeout, tree, scanExceptions) {
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
  const result = await spawnGroup(executable, args, {
    cwd: candidate,
    timeout,
    env: isolatedCandidateEnvironment(tree),
  });
  let status;
  let exitCode;
  if (result.error && result.error.code === "ENOENT") {
    // The configured executable itself does not exist: a toolchain gap, not a
    // flaky environment. Kept as UNSUPPORTED so pre-existing receipts agree.
    status = "UNSUPPORTED";
    exitCode = 127;
  } else if (result.timedOut) {
    // I-03 (d): a deadline is a non-answer, recorded as TIMEOUT -> INCONCLUSIVE.
    status = "TIMEOUT";
    exitCode = 124;
  } else if (result.status === 127) {
    // I-03 (b): "command not found" inside the check (hollow node_modules,
    // broken PATH) is never a plain FAIL of the candidate.
    status = "UNSUPPORTED_ENV";
    exitCode = 127;
  } else {
    exitCode = Number.isInteger(result.status) && result.status >= 0 ? result.status : 1;
    status = exitCode === 0 ? "PASS" : "FAIL";
  }
  const output = `${result.stdout || ""}\n${result.stderr || ""}`;
  return {
    id,
    status,
    exit_code: exitCode,
    duration_ms: Date.now() - started,
    output_digest: sha256Bytes(output),
    diagnostic: status === "PASS" ? undefined : boundedDiagnostic(output),
  };
}

// ---------------------------------------------------------------------------
// Receipts
// ---------------------------------------------------------------------------

function verifierIdentity() {
  return {
    name: VERIFIER_NAME,
    version: VERIFIER_VERSION,
    digest: sha256Bytes(Buffer.concat([readFileSync(SCRIPT_PATH), readFileSync(RECEIPT_LIB_PATH)])),
  };
}

function currentLoad() {
  return Math.round((loadavg()[0] || 0) * 100) / 100;
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

/** I-03 (a): the `<run_id>.log` sidecar holds every non-PASS diagnostic in full (bounded). */
function writeDiagnosticLog(receipt, receiptFile, checks) {
  const target = receiptFile.replace(/\.json$/, ".log");
  const sections = [
    `# opchain verification log run_id=${receipt.run_id} tree=${receipt.candidate.tree} verdict=${receipt.verdict} verified_at=${receipt.verified_at}`,
  ];
  for (const check of checks) {
    if (check.status === "PASS") continue;
    sections.push(`## ${check.id} ${check.status} exit=${check.exit_code} duration_ms=${check.duration_ms}`);
    sections.push(check.diagnostic || "(no output)");
  }
  writeFileSync(target, `${sections.join("\n")}\n`, { mode: 0o600 });
  return target;
}

function readDiagnosticLog(file) {
  if (!existsSync(file)) return null;
  const sections = new Map();
  let current = null;
  for (const line of readFileSync(file, "utf8").split("\n")) {
    const header = /^## (\S+) (\S+) exit=(\d+)/.exec(line);
    if (header) {
      current = header[1];
      sections.set(current, []);
    } else if (current) {
      sections.get(current).push(line);
    }
  }
  return sections;
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

/** Every valid receipt for a tree under any policy, with its verdict. */
function receiptsForTree(info, tree) {
  const directory = join(receiptRoot(info.commonDir), tree);
  if (!existsSync(directory)) return [];
  const found = [];
  for (const policyDir of readdirSync(directory)) {
    const policyPath = join(directory, policyDir);
    let names;
    try {
      names = readdirSync(policyPath).filter((entry) => entry.endsWith(".json"));
    } catch {
      continue;
    }
    for (const name of names) {
      try {
        const checked = validateReceipt(JSON.parse(readFileSync(join(policyPath, name), "utf8")), {
          repository_id: info.repository.id,
          candidate_tree: tree,
        });
        if (checked.ok) found.push({ path: join(policyPath, name), receipt: checked.receipt });
      } catch {
        // ignore
      }
    }
  }
  return found;
}

function bestVerdictForTree(info, tree) {
  const verdicts = new Set(receiptsForTree(info, tree).map((entry) => entry.receipt.verdict));
  for (const verdict of ["PASS", "INCONCLUSIVE", "UNSUPPORTED", "FAIL"]) if (verdicts.has(verdict)) return verdict;
  return "none";
}

function findReceiptByRunId(info, runId) {
  const root = receiptRoot(info.commonDir);
  if (!existsSync(root)) return null;
  for (const tree of readdirSync(root)) {
    const treeDir = join(root, tree);
    let policies;
    try {
      policies = readdirSync(treeDir);
    } catch {
      continue;
    }
    for (const policyDir of policies) {
      const file = join(treeDir, policyDir, `${runId}.json`);
      if (existsSync(file)) return file;
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// I-05: checkpoint-only projection reuse
// ---------------------------------------------------------------------------

/** Identity of a tree with its top-level `.checkpoints` entry removed. */
function projectionKey(info, tree) {
  const listing = git(info.root, "ls-tree", tree);
  if (listing.status !== 0) return null;
  const lines = listing.stdout.split("\n").filter((line) => line && !line.endsWith("\t.checkpoints"));
  return sha256Bytes(lines.sort().join("\n"));
}

/** True when the staged candidate differs from HEAD only under `.checkpoints/`. */
function checkpointOnlyChange(info, tree) {
  const head = git(info.root, "rev-parse", "--verify", "--quiet", "HEAD^{tree}");
  if (head.status !== 0) return false;
  const diff = git(info.root, "diff-tree", "-r", "--name-only", head.stdout.trim(), tree);
  if (diff.status !== 0) return false;
  const names = diff.stdout.split("\n").filter(Boolean);
  return names.length > 0 && names.every((name) => name.startsWith(".checkpoints/"));
}

function matchingProjectedReceipt(info, tree, policy, toolchain, verifier) {
  const wanted = projectionKey(info, tree);
  if (!wanted) return null;
  const root = receiptRoot(info.commonDir);
  if (!existsSync(root)) return null;
  const policyHex = policy.fingerprint.slice("sha256:".length);
  const candidates = [];
  for (const name of readdirSync(root)) {
    if (name === tree || !existsSync(join(root, name, policyHex))) continue;
    try {
      candidates.push({ tree: name, mtime: statSync(join(root, name, policyHex)).mtimeMs });
    } catch {
      // ignore
    }
  }
  candidates.sort((a, b) => b.mtime - a.mtime);
  for (const entry of candidates.slice(0, 200)) {
    if (projectionKey(info, entry.tree) !== wanted) continue;
    const match = matchingReceipt(info, entry.tree, policy, toolchain, verifier);
    if (match) return match;
  }
  return null;
}

// ---------------------------------------------------------------------------
// I-03 (d): per-repository gate lock
// ---------------------------------------------------------------------------

function pidAlive(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return error.code === "EPERM";
  }
}

function sleep(ms) {
  return new Promise((resolveSleep) => setTimeout(resolveSleep, ms));
}

async function withGateLock(info, work) {
  const lockDir = join(info.commonDir, "opchain", "commit-gate", "lock");
  const ownerFile = join(lockDir, "owner.json");
  mkdirSync(dirname(lockDir), { recursive: true, mode: 0o700 });
  const startedWaiting = Date.now();
  let lastReport = 0;
  for (;;) {
    try {
      mkdirSync(lockDir, { mode: 0o700 });
      writeFileSync(ownerFile, `${JSON.stringify({ pid: process.pid, at: new Date().toISOString(), worktree: info.root })}\n`, { mode: 0o600 });
      break;
    } catch (error) {
      if (error.code !== "EEXIST") throw error;
    }
    const owner = readJson(ownerFile);
    let stale;
    if (!owner) {
      // Another process may be between its mkdir and its owner write.
      let directoryAge = 0;
      try {
        directoryAge = Date.now() - statSync(lockDir).mtimeMs;
      } catch {
        continue;
      }
      stale = directoryAge > 5000;
    } else {
      const age = Date.now() - (Date.parse(owner.at) || 0);
      stale = !owner.pid || !pidAlive(owner.pid) || age > LOCK_STALE_MS;
    }
    if (stale) {
      rmSync(lockDir, { recursive: true, force: true });
      continue;
    }
    const waited = Date.now() - startedWaiting;
    const holder = owner || {};
    if (waited >= LOCK_WAIT_MS) {
      throw new InconclusiveError(
        `another verification in ${holder.worktree || "an unknown worktree"} (pid ${holder.pid || "?"}) held the gate lock for ${waited} ms — retry when it finishes`,
      );
    }
    if (Date.now() - lastReport >= LOCK_REPORT_MS || lastReport === 0) {
      process.stderr.write(`[opchain] waiting for another verification in ${holder.worktree || "an unknown worktree"} (pid ${holder.pid || "?"})\n`);
      lastReport = Date.now();
    }
    await sleep(Math.min(LOCK_POLL_MS, LOCK_WAIT_MS - waited));
  }
  try {
    return await work();
  } finally {
    const owner = readJson(ownerFile);
    if (owner && owner.pid === process.pid) rmSync(lockDir, { recursive: true, force: true });
  }
}

// ---------------------------------------------------------------------------
// Reporting (I-03 (a): the hook path shows what failed, not just that it did)
// ---------------------------------------------------------------------------

function tailLines(text, count = DIAGNOSTIC_TAIL_LINES) {
  const lines = String(text || "").replace(/\s+$/, "").split("\n");
  return lines.length > count ? ["[... earlier output in the log sidecar]", ...lines.slice(-count)] : lines;
}

function formatFailures(failures, options = {}) {
  const lines = [];
  for (const failure of failures || []) {
    lines.push(`  ✗ ${failure.id} ${failure.status} exit=${failure.exit_code}`);
    const body = options.full ? String(failure.diagnostic || "").replace(/\s+$/, "").split("\n") : tailLines(failure.diagnostic);
    for (const line of body) if (line !== "") lines.push(`    ${line}`);
  }
  return lines;
}

function report(args, value, ok) {
  if (args.json) {
    process.stdout.write(`${JSON.stringify(value)}\n`);
    return;
  }
  if (ok && value.skipped) return;
  if (ok && value.reused) {
    process.stdout.write(`[opchain] receipt reused (${value.run_id}, ${value.verified_at})${value.reused === "checkpoint-only" ? " — checkpoint-only change" : ""}\n`);
    return;
  }
  if (ok && value.bypassed) {
    process.stderr.write(`[opchain] ⚠ gate bypassed via OPCHAIN_BYPASS=1 — will be recorded post-commit\n`);
    return;
  }
  if (ok) {
    process.stdout.write(`[opchain] verified staged candidate ${value.candidate_tree.slice(0, 12)}\n`);
    return;
  }
  const lines = formatFailures(value.failures);
  if (value.receipt_path) lines.push(`  receipt: ${value.receipt_path}`);
  if (value.log_path) lines.push(`  log: ${value.log_path}`);
  if (value.details && value.details.length) for (const detail of value.details) lines.push(`  ${detail}`);
  if (lines.length) process.stderr.write(`${lines.join("\n")}\n`);
  if (value.blocked) process.stderr.write(`[opchain] BLOCKED — ${value.error}; no receipt written\n`);
  else if (value.verdict === "INCONCLUSIVE" || value.inconclusive) process.stderr.write(`[opchain] candidate verification inconclusive: ${value.error}\n`);
  else process.stderr.write(`[opchain] candidate verification failed: ${value.error}\n`);
}

function inconclusiveSummary(checks, load) {
  const timedOut = checks.find((check) => check.status === "TIMEOUT");
  if (timedOut) {
    return `${timedOut.id} timed out after ${timedOut.duration_ms} ms under load ${load} — retry when load drops`;
  }
  const notFound = checks.find((check) => check.status === "UNSUPPORTED_ENV");
  if (notFound) {
    return `${notFound.id} exited 127 (command not found) — dependencies missing or PATH broken; run npm ci and retry`;
  }
  return "checks did not produce an enforceable receipt — retry";
}

// ---------------------------------------------------------------------------
// Subcommands
// ---------------------------------------------------------------------------

function bypassLib() {
  try {
    return require("./lib/bypass-record.cjs");
  } catch (error) {
    if (error.code === "MODULE_NOT_FOUND") {
      throw new Error("bypass-record runtime is missing beside verify-candidate.mjs; rerun explicit enrollment");
    }
    throw error;
  }
}

function explain(args) {
  let file = args.target;
  if (!existsSync(file)) {
    const info = repositoryInfo(args.repo);
    file = findReceiptByRunId(info, args.target);
    if (!file) throw new Error(`no receipt found for ${args.target}`);
  }
  file = resolve(file);
  const receipt = JSON.parse(readFileSync(file, "utf8"));
  const checked = validateReceipt(receipt);
  const log = readDiagnosticLog(file.replace(/\.json$/, ".log"));
  const failures = (receipt.checks || [])
    .filter((check) => check.status !== "PASS")
    .map((check) => ({
      ...check,
      diagnostic: log && log.has(check.id) ? log.get(check.id).join("\n") : "(no diagnostics stored; run was not at a commit boundary)",
    }));
  if (args.json) {
    process.stdout.write(`${JSON.stringify({ ok: checked.ok, receipt_path: file, run_id: receipt.run_id, verdict: receipt.verdict, candidate_tree: receipt.candidate && receipt.candidate.tree, verified_at: receipt.verified_at, environment: receipt.environment, failures, errors: checked.errors })}\n`);
    return EXIT_OK;
  }
  const lines = [
    `receipt ${receipt.run_id} verdict=${receipt.verdict} tree=${receipt.candidate && receipt.candidate.tree} verified_at=${receipt.verified_at}${checked.ok ? "" : " (INVALID: " + checked.errors.join("; ") + ")"}`,
  ];
  if (receipt.environment && receipt.environment.loadavg_1m !== undefined) lines.push(`  loadavg_1m=${receipt.environment.loadavg_1m}`);
  if (receipt.environment && receipt.environment.reused_from) lines.push(`  reused from ${receipt.environment.reused_from.run_id} (tree ${receipt.environment.reused_from.tree})`);
  lines.push(...formatFailures(failures, { full: args.full }));
  if (!failures.length) lines.push("  every check passed");
  lines.push(`  receipt: ${file}`);
  if (log) lines.push(`  log: ${file.replace(/\.json$/, ".log")}`);
  process.stdout.write(`${lines.join("\n")}\n`);
  return EXIT_OK;
}

// A-08: the bypass reason is a real Git trailer with a non-empty value, read
// by Git's own trailer parser, not a pattern anywhere in the message. The
// legacy `bugcheck: bypassed (<reason>)` form counts only as a trailer line
// with a reason. install-git-drivers.mjs and lib/release-evidence.mjs read the
// trailer the same way, so the three readers agree.
const LEGACY_BYPASS_VALUE = /^bypassed\s*\(\s*(\S[^)]*?)\s*\)\s*$/i;

function trailerReason(root, commit) {
  const result = git(root, "log", "-1", "--format=%(trailers:key=Opchain-Bypass,valueonly,separator=%x1f)%x1e%(trailers:key=bugcheck,valueonly,separator=%x1f)", commit);
  if (result.status !== 0) return null;
  const [explicit = "", legacy = ""] = (result.stdout || "").replace(/\n+$/, "").split("\x1e");
  for (const value of explicit.split("\x1f")) if (value.trim()) return value.trim();
  for (const value of legacy.split("\x1f")) {
    const match = LEGACY_BYPASS_VALUE.exec(value.trim());
    if (match) return match[1];
  }
  return null;
}

function appendCheckpointBypass(root, entry) {
  const checkpointsDir = join(root, ".checkpoints");
  if (!existsSync(checkpointsDir)) return null;
  const file = join(checkpointsDir, "oc-bug-check.checkpoint.json");
  const now = new Date().toISOString();
  let checkpoint = readJson(file);
  if (!checkpoint) {
    checkpoint = {
      protocol_version: "1.1",
      skill: "oc-bug-check",
      project: basename(root),
      project_dir: root,
      created_at: now,
      updated_at: now,
      phase: "commit-gate",
      step: "bypass-recorded",
      status: "in_progress",
      progress_summary: "Created by verify-candidate.mjs bypass-record to hold the gate-bypass ledger.",
      skill_state: { bypasses: [] },
    };
  }
  if (!checkpoint.skill_state || typeof checkpoint.skill_state !== "object") checkpoint.skill_state = {};
  if (!Array.isArray(checkpoint.skill_state.bypasses)) checkpoint.skill_state.bypasses = [];
  if (!checkpoint.skill_state.bypasses.some((existing) => existing && existing.commit === entry.commit)) {
    checkpoint.skill_state.bypasses.push(entry);
    checkpoint.updated_at = now;
    writeFileSync(file, `${JSON.stringify(checkpoint, null, 2)}\n`, "utf8");
  }
  return file;
}

// A-08: only a PASS the enforce path would accept — same policy fingerprint,
// toolchain and verifier digest — counts as coverage, for bypass-record,
// bypass-list and the rewrite excuse alike. A PASS left by another policy
// (`run --policy weak.json`) or an older verifier is not coverage for this tree.
const toolchainMemo = new Map();
function enforceablePass(info, tree, policyPath) {
  if (!receiptsForTree(info, tree).some((entry) => entry.receipt.verdict === "PASS")) return false;
  let materialized;
  try {
    materialized = materializeCandidate(info, tree);
    const { policy, commands } = policyForCandidate(materialized.candidate, policyPath);
    const key = JSON.stringify([commands, policy.required_checks]);
    if (!toolchainMemo.has(key)) toolchainMemo.set(key, toolchainFor(commands, policy.required_checks));
    return Boolean(matchingReceipt(info, tree, policy, toolchainMemo.get(key), verifierIdentity()));
  } catch {
    return false;
  } finally {
    if (materialized) rmSync(materialized.scratch, { recursive: true, force: true });
  }
}

// A-01: a rebase or cherry-pick is excused only when the commit it was picked
// from was itself accountable: a PASS receipt for the original's tree, a bypass
// trailer on it, or an excused rewrite in turn. A record that merely says it is
// a rewrite (or whose reason says "rewritten by") is not evidence.
function excusedRewrite(info, lib, record, policyPath, seen = new Set()) {
  const original = record && record.rewritten_from;
  if (!original || seen.has(original) || seen.size >= 32) return false;
  seen.add(original);
  const tree = git(info.root, "rev-parse", "--verify", "--quiet", `${original}^{tree}`);
  if (tree.status !== 0) return false;
  if (enforceablePass(info, tree.stdout.trim(), policyPath)) return true;
  if (trailerReason(info.root, original)) return true;
  return excusedRewrite(info, lib, lib.readBypassRecord(info.commonDir, original), policyPath, seen);
}

/** I-04: `bypass-record --commit <sha>` — record a commit that has no PASS receipt. */
function bypassRecordCommand(args) {
  const lib = bypassLib();
  const info = repositoryInfo(args.repo);
  const commit = gitOutput(info.root, "rev-parse", "--verify", `${args.commit}^{commit}`);
  const tree = gitOutput(info.root, "rev-parse", `${commit}^{tree}`);
  if (enforceablePass(info, tree, args.policy)) {
    if (args.json) process.stdout.write(`${JSON.stringify({ ok: true, commit, tree, recorded: false, reason: "PASS receipt covers this tree" })}\n`);
    return EXIT_OK;
  }
  const options = {
    commonDir: info.commonDir,
    commit,
    tree,
    reason: args.reason || trailerReason(info.root, commit) || undefined,
    source: args.source,
    approvedBy: args.approvedBy,
    rewrittenFrom: args.rewrittenFrom ? gitOutput(info.root, "rev-parse", "--verify", `${args.rewrittenFrom}^{commit}`) : undefined,
  };
  let written = lib.finalizePendingRecord(options);
  if (!written) written = lib.writeBypassRecord({ ...options, source: options.source || "no-verify" });
  const entry = { commit, tree, at: written.record.at, reason: written.record.reason };
  const checkpointFile = appendCheckpointBypass(info.root, entry);
  if (args.json) {
    process.stdout.write(`${JSON.stringify({ ok: true, commit, tree, recorded: true, record_path: written.path, checkpoint_path: checkpointFile, record: written.record })}\n`);
  } else {
    process.stderr.write(`[opchain] ⚠ commit ${commit} bypassed the gate — recorded\n`);
  }
  return EXIT_OK;
}

/** I-04: `bypass-list --range <base>..<head>` — receipt and bypass status per commit. */
function bypassListCommand(args) {
  const lib = bypassLib();
  const info = repositoryInfo(args.repo);
  const commits = gitOutput(info.root, "rev-list", "--reverse", args.range).split("\n").filter(Boolean);
  const rows = commits.map((commit) => {
    const tree = gitOutput(info.root, "rev-parse", `${commit}^{tree}`);
    const record = lib.readBypassRecord(info.commonDir, commit);
    // `receipt` is PASS only for an enforceable PASS; a PASS under another
    // policy or verifier is reported as PASS_UNMATCHED, which is not coverage.
    const best = bestVerdictForTree(info, tree);
    return {
      commit,
      tree,
      receipt: best === "PASS" && !enforceablePass(info, tree, args.policy) ? "PASS_UNMATCHED" : best,
      bypassRecord: lib.hasBypassRecord(info.commonDir, { commit, tree }),
      trailer: Boolean(trailerReason(info.root, commit)),
      rewrite: excusedRewrite(info, lib, record, args.policy),
      rewritten_from: record && record.rewritten_from ? record.rewritten_from : null,
      subject: gitOutput(info.root, "log", "-1", "--format=%s", commit),
    };
  });
  if (args.json) {
    process.stdout.write(`${JSON.stringify(rows.map(({ subject, ...row }) => row))}\n`);
  } else {
    for (const row of rows) {
      process.stdout.write(`${row.commit.slice(0, 12)} receipt=${row.receipt} bypass=${row.bypassRecord ? "yes" : "no"} trailer=${row.trailer ? "yes" : "no"}${row.rewrite ? " rewrite=excused" : ""} ${row.subject}\n`);
    }
  }
  return EXIT_OK;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(argv = process.argv.slice(2)) {
  let args;
  try {
    args = parseArgs(argv);
    if (args.action === "explain") return explain(args);
    if (args.action === "bypass-record") return bypassRecordCommand(args);
    if (args.action === "bypass-list") return bypassListCommand(args);

    const info = repositoryInfo(args.repo);
    if (!isEnrolled(info.root)) {
      report(args, { ok: true, skipped: true, reason: "repository is not enrolled" }, true);
      return EXIT_OK;
    }
    const tree = candidateTree(info.root);

    // I-04: OPCHAIN_BYPASS=1 means exactly one thing at the commit boundary —
    // skip the checks and leave a pending record for post-commit to finalise.
    if (args.action === "run" && args.commitBoundary && process.env.OPCHAIN_BYPASS === "1") {
      const written = bypassLib().writeBypassRecord({
        commonDir: info.commonDir,
        tree,
        source: "env",
        reason: process.env.OPCHAIN_BYPASS_REASON || undefined,
        pending: true,
      });
      report(args, { ok: true, action: "run", candidate_tree: tree, bypassed: true, record_path: written.path }, true);
      return EXIT_OK;
    }

    const materialized = materializeCandidate(info, tree);
    try {
      const { policy, commands, timeout, scanExceptions } = policyForCandidate(materialized.candidate, args.policy);
      const toolchain = toolchainFor(commands, policy.required_checks);
      const verifier = verifierIdentity();

      if (args.action === "enforce") {
        const match = matchingReceipt(info, tree, policy, toolchain, verifier);
        if (!match) {
          report(args, { ok: false, action: "enforce", candidate_tree: tree, error: "no matching PASS receipt" }, false);
          return EXIT_FAIL;
        }
        report(args, { ok: true, action: "enforce", candidate_tree: tree, receipt_path: match.path }, true);
        return EXIT_OK;
      }

      // I-05: an identical tree already carries an enforceable PASS.
      const existing = matchingReceipt(info, tree, policy, toolchain, verifier);
      if (existing) {
        report(args, {
          ok: true, action: "run", candidate_tree: tree, receipt_path: existing.path, verdict: "PASS",
          reused: "identical", run_id: existing.receipt.run_id, verified_at: existing.receipt.verified_at,
        }, true);
        return EXIT_OK;
      }
      // I-05: a checkpoint-only change inherits the PASS of its projection.
      if (checkpointOnlyChange(info, tree)) {
        const projected = matchingProjectedReceipt(info, tree, policy, toolchain, verifier);
        if (projected) {
          const now = new Date().toISOString();
          const derived = createReceipt({
            repository: info.repository,
            candidate: { tree },
            policy,
            toolchain,
            verifier,
            started_at: now,
            verified_at: now,
            checks: projected.receipt.checks,
            environment: { loadavg_1m: currentLoad(), reused_from: { run_id: projected.receipt.run_id, tree: projected.receipt.candidate.tree } },
          });
          const target = writeImmutableReceipt(derived, info);
          report(args, {
            ok: true, action: "run", candidate_tree: tree, receipt_path: target, verdict: "PASS",
            reused: "checkpoint-only", run_id: projected.receipt.run_id, verified_at: projected.receipt.verified_at,
          }, true);
          return EXIT_OK;
        }
      }

      // I-03 (b): validated dependency roots, or BLOCKED before any check runs.
      mountPackageDependencies(info.root, materialized.candidate, dependencyDemands(materialized.candidate, commands));

      return await withGateLock(info, async () => {
        const startedAt = new Date().toISOString();
        const checks = [];
        for (const id of policy.required_checks) {
          checks.push(await executeCheck(id, commands[id], materialized.candidate, timeout, tree, scanExceptions));
        }
        if (candidateTree(info.root) !== tree) {
          report(args, { ok: false, action: "run", candidate_tree: tree, error: "staged candidate changed during verification" }, false);
          return EXIT_FAIL;
        }
        const load = currentLoad();
        const receipt = createReceipt({
          repository: info.repository,
          candidate: { tree },
          policy,
          toolchain,
          verifier,
          started_at: startedAt,
          verified_at: new Date().toISOString(),
          checks,
          environment: { loadavg_1m: load },
        });
        const target = writeImmutableReceipt(receipt, info);
        const failures = checks
          .filter((check) => check.status !== "PASS")
          .map(({ id, status, exit_code, diagnostic }) => ({ id, status, exit_code, diagnostic }));
        const logPath = args.commitBoundary && failures.length ? writeDiagnosticLog(receipt, target, checks) : undefined;

        if (receipt.verdict === "PASS") {
          report(args, { ok: true, action: "run", candidate_tree: tree, receipt_path: target, verdict: receipt.verdict, checks }, true);
          return EXIT_OK;
        }
        const inconclusive = receipt.verdict === "INCONCLUSIVE";
        report(args, {
          ok: false,
          action: "run",
          candidate_tree: tree,
          receipt_path: target,
          log_path: logPath,
          verdict: receipt.verdict,
          loadavg: load,
          failures,
          error: inconclusive ? inconclusiveSummary(checks, load) : "checks did not produce an enforceable PASS receipt",
        }, false);
        return inconclusive ? EXIT_INCONCLUSIVE : EXIT_FAIL;
      });
    } finally {
      rmSync(materialized.scratch, { recursive: true, force: true });
    }
  } catch (error) {
    const fallback = args || { json: argv.includes("--json") };
    if (error && error.blocked) {
      report(fallback, { ok: false, blocked: true, error: error.message, details: error.details }, false);
      return EXIT_BLOCKED;
    }
    if (error && error.inconclusive) {
      report(fallback, { ok: false, inconclusive: true, verdict: "INCONCLUSIVE", error: error.message }, false);
      return EXIT_INCONCLUSIVE;
    }
    report(fallback, { ok: false, error: error.message }, false);
    return EXIT_FAIL;
  }
}

if (process.argv[1] && realpathSync(SCRIPT_PATH) === realpathSync(resolve(process.argv[1]))) {
  process.exitCode = await main();
}

export { dependencyDemands, dependencyRootStatus, main };
