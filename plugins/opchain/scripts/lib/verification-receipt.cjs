"use strict";

const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

const RECEIPT_SCHEMA = "opchain.verification-receipt";
const RECEIPT_VERSION = 1;
const POLICY_SCHEMA = "opchain.verification-policy";
const POLICY_VERSION = 1;
const TOOLCHAIN_SCHEMA = "opchain.verification-toolchain";
const TOOLCHAIN_VERSION = 1;

const VERDICTS = new Set(["PASS", "FAIL", "UNSUPPORTED"]);
const CHECK_STATUSES = new Set(["PASS", "WARN", "FAIL", "UNSUPPORTED", "ERROR"]);
const DEFAULT_REQUIRED_CHECKS = Object.freeze([
  "type_safety",
  "lint",
  "tests",
  "anti_patterns",
  "secrets",
  "build",
  "dependencies",
]);

function plainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function canonicalValue(value, at = "value") {
  if (value === null || typeof value === "string" || typeof value === "boolean") return value;
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (Array.isArray(value)) return value.map((entry, index) => canonicalValue(entry, `${at}[${index}]`));
  if (!plainObject(value)) throw new TypeError(`${at} is not canonical JSON`);

  const output = {};
  for (const key of Object.keys(value).sort()) {
    if (value[key] === undefined) throw new TypeError(`${at}.${key} is undefined`);
    output[key] = canonicalValue(value[key], `${at}.${key}`);
  }
  return output;
}

function canonicalJson(value) {
  return JSON.stringify(canonicalValue(value));
}

function sha256Bytes(value) {
  const bytes = Buffer.isBuffer(value) ? value : Buffer.from(String(value), "utf8");
  return `sha256:${crypto.createHash("sha256").update(bytes).digest("hex")}`;
}

function sha256Object(value) {
  return sha256Bytes(canonicalJson(value));
}

function assertDigest(value, at) {
  if (!/^sha256:[0-9a-f]{64}$/.test(String(value || ""))) {
    throw new TypeError(`${at} must be a sha256:<64 lowercase hex> digest`);
  }
  return String(value);
}

function assertIdentifier(value, at) {
  if (!/^[a-z][a-z0-9_.-]{0,63}$/.test(String(value || ""))) {
    throw new TypeError(`${at} must be a lowercase identifier`);
  }
  return String(value);
}

function assertIsoTime(value, at) {
  const text = String(value || "");
  if (!text || Number.isNaN(Date.parse(text))) throw new TypeError(`${at} must be an ISO timestamp`);
  return text;
}

function assertOid(value, at) {
  const text = String(value || "");
  if (!/^(?:[0-9a-f]{40}|[0-9a-f]{64})$/.test(text)) {
    throw new TypeError(`${at} must be a lowercase SHA-1 or SHA-256 Git object id`);
  }
  return text;
}

function normalizedConfig(input = {}) {
  if (!plainObject(input)) throw new TypeError("policy.config must be an object");
  const configPath = String(input.path || ".bugcheck.json");
  if (path.isAbsolute(configPath) || configPath.split(/[\\/]+/).includes("..")) {
    throw new TypeError("policy.config.path must stay within the repository");
  }

  const hasContent = Object.prototype.hasOwnProperty.call(input, "content");
  const present = hasContent ? true : input.present === true;
  let digest;
  if (hasContent) {
    digest = sha256Bytes(input.content);
    if (input.digest !== undefined && assertDigest(input.digest, "policy.config.digest") !== digest) {
      throw new TypeError("policy.config.digest does not match policy.config.content");
    }
  } else if (present) {
    digest = assertDigest(input.digest, "policy.config.digest");
  } else {
    if (input.digest !== undefined && input.digest !== null) {
      throw new TypeError("an absent policy config cannot carry a content digest");
    }
    digest = null;
  }

  return { path: configPath.replace(/\\/g, "/"), present, digest };
}

function createPolicy(input = {}) {
  if (!plainObject(input)) throw new TypeError("policy input must be an object");
  const required = input.required_checks === undefined ? DEFAULT_REQUIRED_CHECKS : input.required_checks;
  if (!Array.isArray(required) || required.length === 0) {
    throw new TypeError("policy.required_checks must be a non-empty array");
  }
  const requiredChecks = required.map((entry, index) => assertIdentifier(entry, `policy.required_checks[${index}]`));
  if (new Set(requiredChecks).size !== requiredChecks.length) {
    throw new TypeError("policy.required_checks must not contain duplicates");
  }

  const body = {
    schema: POLICY_SCHEMA,
    version: POLICY_VERSION,
    id: assertIdentifier(input.id || "oc-bug-check", "policy.id"),
    revision: Number.isInteger(input.revision) && input.revision > 0 ? input.revision : 1,
    warning_behavior: input.warning_behavior || "allow",
    required_checks: [...requiredChecks].sort(),
    config: normalizedConfig(input.config),
  };
  if (!new Set(["allow", "fail"]).has(body.warning_behavior)) {
    throw new TypeError("policy.warning_behavior must be allow or fail");
  }
  return { ...body, fingerprint: sha256Object(body) };
}

function assertPolicy(value) {
  if (!plainObject(value)) throw new TypeError("policy must be an object");
  const recreated = createPolicy(value);
  if (canonicalJson(recreated) !== canonicalJson(value)) {
    throw new TypeError("policy is not canonical or its fingerprint is invalid");
  }
  return recreated;
}

function createToolchain(input = {}) {
  if (!plainObject(input) || !Array.isArray(input.components) || input.components.length === 0) {
    throw new TypeError("toolchain.components must be a non-empty array");
  }
  const components = input.components.map((component, index) => {
    if (!plainObject(component)) throw new TypeError(`toolchain.components[${index}] must be an object`);
    const normalized = {
      name: assertIdentifier(component.name, `toolchain.components[${index}].name`),
      version: String(component.version || ""),
    };
    if (!normalized.version) throw new TypeError(`toolchain.components[${index}].version is required`);
    if (component.digest !== undefined) {
      normalized.digest = assertDigest(component.digest, `toolchain.components[${index}].digest`);
    }
    return normalized;
  });
  components.sort((a, b) => a.name.localeCompare(b.name));
  if (new Set(components.map((component) => component.name)).size !== components.length) {
    throw new TypeError("toolchain component names must be unique");
  }
  const body = { schema: TOOLCHAIN_SCHEMA, version: TOOLCHAIN_VERSION, components };
  return { ...body, fingerprint: sha256Object(body) };
}

function assertToolchain(value) {
  if (!plainObject(value)) throw new TypeError("toolchain must be an object");
  const recreated = createToolchain(value);
  if (canonicalJson(recreated) !== canonicalJson(value)) {
    throw new TypeError("toolchain is not canonical or its fingerprint is invalid");
  }
  return recreated;
}

function createRepositoryIdentity({ git_common_dir, object_format = "sha1" }) {
  if (!git_common_dir) throw new TypeError("repository.git_common_dir is required");
  let commonDir;
  try {
    commonDir = fs.realpathSync.native(String(git_common_dir));
  } catch {
    commonDir = path.resolve(String(git_common_dir));
  }
  if (!new Set(["sha1", "sha256"]).has(object_format)) {
    throw new TypeError("repository.object_format must be sha1 or sha256");
  }
  const identity = { git_common_dir: commonDir, object_format };
  return { ...identity, id: sha256Object(identity) };
}

function assertRepository(value) {
  if (!plainObject(value)) throw new TypeError("repository must be an object");
  const recreated = createRepositoryIdentity(value);
  if (canonicalJson(recreated) !== canonicalJson(value)) {
    throw new TypeError("repository identity does not match its Git common directory");
  }
  return recreated;
}

function normalizeCheck(check, index) {
  if (!plainObject(check)) throw new TypeError(`checks[${index}] must be an object`);
  const normalized = {
    id: assertIdentifier(check.id, `checks[${index}].id`),
    status: String(check.status || "").toUpperCase(),
    exit_code: check.exit_code,
    duration_ms: check.duration_ms,
  };
  if (!CHECK_STATUSES.has(normalized.status)) {
    throw new TypeError(`checks[${index}].status is invalid`);
  }
  if (!Number.isInteger(normalized.exit_code) || normalized.exit_code < 0) {
    throw new TypeError(`checks[${index}].exit_code must be a non-negative integer`);
  }
  if (!Number.isInteger(normalized.duration_ms) || normalized.duration_ms < 0) {
    throw new TypeError(`checks[${index}].duration_ms must be a non-negative integer`);
  }
  if (check.output_digest !== undefined) {
    normalized.output_digest = assertDigest(check.output_digest, `checks[${index}].output_digest`);
  }
  return normalized;
}

function deriveVerdict(policy, checks) {
  const byId = new Map(checks.map((check) => [check.id, check]));
  for (const id of policy.required_checks) {
    if (!byId.has(id)) throw new TypeError(`receipt is missing required check ${id}`);
  }
  if (checks.some((check) => check.status === "FAIL" || check.status === "ERROR")) return "FAIL";
  if (checks.some((check) => check.status === "UNSUPPORTED")) return "UNSUPPORTED";
  if (policy.warning_behavior === "fail" && checks.some((check) => check.status === "WARN")) return "FAIL";
  return "PASS";
}

function createReceipt(input = {}) {
  if (!plainObject(input)) throw new TypeError("receipt input must be an object");
  const repository = assertRepository(input.repository);
  const policy = assertPolicy(input.policy);
  const toolchain = assertToolchain(input.toolchain);
  if (!Array.isArray(input.checks) || input.checks.length === 0) {
    throw new TypeError("receipt.checks must be a non-empty array");
  }
  const checks = input.checks.map(normalizeCheck).sort((a, b) => a.id.localeCompare(b.id));
  if (new Set(checks.map((check) => check.id)).size !== checks.length) {
    throw new TypeError("receipt check ids must be unique");
  }
  const verifier = {
    name: assertIdentifier(input.verifier && input.verifier.name, "verifier.name"),
    version: String((input.verifier && input.verifier.version) || ""),
  };
  if (!verifier.version) throw new TypeError("verifier.version is required");
  if (input.verifier.digest !== undefined) {
    verifier.digest = assertDigest(input.verifier.digest, "verifier.digest");
  }

  const body = {
    schema: RECEIPT_SCHEMA,
    version: RECEIPT_VERSION,
    run_id: String(input.run_id || crypto.randomUUID()),
    repository,
    candidate: {
      tree: assertOid(input.candidate && input.candidate.tree, "candidate.tree"),
      commit: input.candidate && input.candidate.commit ? assertOid(input.candidate.commit, "candidate.commit") : null,
    },
    policy,
    toolchain,
    verifier,
    started_at: assertIsoTime(input.started_at, "started_at"),
    verified_at: assertIsoTime(input.verified_at, "verified_at"),
    checks,
    verdict: deriveVerdict(policy, checks),
  };
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(body.run_id)) {
    throw new TypeError("run_id contains unsafe path characters");
  }
  if (Date.parse(body.verified_at) < Date.parse(body.started_at)) {
    throw new TypeError("verified_at cannot precede started_at");
  }
  return { ...body, receipt_digest: sha256Object(body) };
}

function validateReceipt(value, expected = {}) {
  try {
    if (!plainObject(value)) throw new TypeError("receipt must be an object");
    const recreated = createReceipt(value);
    if (canonicalJson(recreated) !== canonicalJson(value)) {
      throw new TypeError("receipt is not canonical, was altered, or has an invalid derived verdict");
    }
    const comparisons = [
      ["repository_id", recreated.repository.id],
      ["candidate_tree", recreated.candidate.tree],
      ["policy_fingerprint", recreated.policy.fingerprint],
      ["toolchain_fingerprint", recreated.toolchain.fingerprint],
      ["verdict", recreated.verdict],
    ];
    for (const [name, actual] of comparisons) {
      if (expected[name] !== undefined && expected[name] !== actual) {
        throw new TypeError(`receipt ${name} does not match the expected value`);
      }
    }
    if (!VERDICTS.has(recreated.verdict)) throw new TypeError("receipt verdict is invalid");
    return { ok: true, receipt: recreated, errors: [] };
  } catch (error) {
    return { ok: false, receipt: null, errors: [error.message] };
  }
}

function receiptRoot(gitCommonDir) {
  const repository = createRepositoryIdentity({ git_common_dir: gitCommonDir });
  return path.join(repository.git_common_dir, "opchain", "verification-receipts", `v${RECEIPT_VERSION}`);
}

function receiptPath({ git_common_dir, candidate_tree, policy_fingerprint, run_id }) {
  const tree = assertOid(candidate_tree, "candidate_tree");
  const policyHex = assertDigest(policy_fingerprint, "policy_fingerprint").slice("sha256:".length);
  const runId = String(run_id || "");
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(runId)) {
    throw new TypeError("run_id contains unsafe path characters");
  }
  return path.join(receiptRoot(git_common_dir), tree, policyHex, `${runId}.json`);
}

module.exports = {
  CHECK_STATUSES,
  DEFAULT_REQUIRED_CHECKS,
  POLICY_SCHEMA,
  POLICY_VERSION,
  RECEIPT_SCHEMA,
  RECEIPT_VERSION,
  TOOLCHAIN_SCHEMA,
  TOOLCHAIN_VERSION,
  canonicalJson,
  createPolicy,
  createReceipt,
  createRepositoryIdentity,
  createToolchain,
  receiptPath,
  receiptRoot,
  sha256Bytes,
  sha256Object,
  validateReceipt,
};
