// Canonical checkpoint and cross-skill handoff contracts.
//
// Wire compatibility is intentionally conservative: checkpoints written as
// protocol_version 1.0 or 1.1 remain valid. The lifecycle and handoff fields
// below are optional additive 1.1 fields; consumers that depend on them must
// validate them at their own boundary with getCheckpointHandoff().

export const CHECKPOINT_WIRE_VERSION = "1.1";
export const ACCEPTED_CHECKPOINT_WIRE_VERSIONS = Object.freeze(["1.0", "1.1"]);
export const HANDOFF_CONTRACT_VERSION = "1.0";

export const HANDOFF_TYPES = Object.freeze({
  VERIFICATION_VERDICT: "verification.verdict",
  ARCHITECTURE_MODULE_MAP: "architecture.module-map",
  EVIDENCE_REFERENCE: "evidence.reference",
  // Per-sprint acceptance-check results a build loop publishes (oc-app-architect
  // Phase 6) so a reader outside the loop (a client-side skill mapping sprints to
  // milestones, a gate) gets check ids and statuses as data instead of parsing
  // sprints/sprint-N/eval-round-M.md. artifact = the evaluation report it was read
  // from; payload = { sprint, verdict, checks: [{ id, status }] }.
  ACCEPTANCE_CHECKS: "acceptance.checks",
});
export const ACCEPTANCE_CHECK_STATUSES = Object.freeze(["PASS", "FAIL", "NOT-CHECKED"]);

const REQUIRED = Object.freeze([
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
]);
const STATUS = new Set(["in_progress", "blocked", "complete", "failed"]);
const ROW_STATUS = new Set(["complete", "in_progress", "not_started", "blocked", "failed"]);
const BLOCKER_NEEDS = new Set(["user_decision", "code_fix", "external_dep"]);
const FINDING_STATUS = new Set(["open", "fixed", "verified", "accepted", "dismissed"]);
const VERDICTS = new Set(["PASS", "FAIL", "INCOMPLETE"]);
const ISO_SHAPE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-](?:[01]\d|2[0-3]):[0-5]\d)$/;

export function isIsoInstant(value) {
  return typeof value === "string" && ISO_SHAPE.test(value) && !Number.isNaN(Date.parse(value));
}

function isRecord(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function missing(value) {
  return value === undefined || value === null || value === "";
}

function validateIdentity(identity, label, errors) {
  if (!isRecord(identity)) {
    errors.push(`${label} must be an object with kind + id`);
    return;
  }
  if (typeof identity.kind !== "string" || identity.kind.trim() === "") {
    errors.push(`${label}.kind required (string)`);
  }
  if (typeof identity.id !== "string" || identity.id.trim() === "") {
    errors.push(`${label}.id required (string)`);
  }
  if (identity.digest !== undefined && (typeof identity.digest !== "string" || identity.digest.trim() === "")) {
    errors.push(`${label}.digest must be a non-empty string when present`);
  }
  if (identity.path !== undefined && (typeof identity.path !== "string" || identity.path.trim() === "")) {
    errors.push(`${label}.path must be a non-empty string when present`);
  }
}

export function validateCheckpointHandoff(handoff, { checkpointSkill } = {}) {
  const errors = [];
  if (!isRecord(handoff)) return { ok: false, errors: ["handoff must be an object"] };

  for (const field of ["id", "contract_version", "type", "created_at", "producer", "payload"]) {
    if (missing(handoff[field])) errors.push(`handoff.${field} required`);
  }
  if (handoff.contract_version && handoff.contract_version !== HANDOFF_CONTRACT_VERSION) {
    errors.push(`handoff.contract_version must be "${HANDOFF_CONTRACT_VERSION}"`);
  }
  if (handoff.type && !Object.values(HANDOFF_TYPES).includes(handoff.type)) {
    errors.push(`handoff.type must be one of ${Object.values(HANDOFF_TYPES).join("|")}`);
  }
  if (handoff.created_at && !isIsoInstant(handoff.created_at)) {
    errors.push("handoff.created_at must be ISO-8601 (Z or ±hh:mm)");
  }
  if (!isRecord(handoff.producer)) {
    errors.push("handoff.producer must be an object");
  } else {
    if (typeof handoff.producer.skill !== "string" || handoff.producer.skill.trim() === "") {
      errors.push("handoff.producer.skill required");
    }
    if (checkpointSkill && handoff.producer.skill && handoff.producer.skill !== checkpointSkill) {
      errors.push(`handoff.producer.skill must match checkpoint skill "${checkpointSkill}"`);
    }
    if (handoff.producer.run_id !== undefined && (typeof handoff.producer.run_id !== "string" || handoff.producer.run_id.trim() === "")) {
      errors.push("handoff.producer.run_id must be a non-empty string when present");
    }
  }
  if (!isRecord(handoff.payload)) errors.push("handoff.payload must be an object");

  if (handoff.type === HANDOFF_TYPES.VERIFICATION_VERDICT) {
    if (!handoff.verified_at || !isIsoInstant(handoff.verified_at)) {
      errors.push("handoff.verified_at must be ISO-8601 for verification.verdict");
    }
    validateIdentity(handoff.candidate, "handoff.candidate", errors);
    if (!VERDICTS.has(handoff.payload?.verdict)) {
      errors.push("handoff.payload.verdict must be PASS|FAIL|INCOMPLETE");
    }
  }

  if ([HANDOFF_TYPES.ARCHITECTURE_MODULE_MAP, HANDOFF_TYPES.EVIDENCE_REFERENCE].includes(handoff.type)) {
    validateIdentity(handoff.artifact, "handoff.artifact", errors);
  }

  if (handoff.type === HANDOFF_TYPES.ACCEPTANCE_CHECKS) {
    validateIdentity(handoff.artifact, "handoff.artifact", errors);
    const p = isRecord(handoff.payload) ? handoff.payload : {};
    if (typeof p.sprint !== "string" || p.sprint.trim() === "") errors.push("handoff.payload.sprint required (e.g. sprint-2)");
    if (!VERDICTS.has(p.verdict)) errors.push("handoff.payload.verdict must be PASS|FAIL|INCOMPLETE");
    if (!Array.isArray(p.checks) || p.checks.length === 0) errors.push("handoff.payload.checks must be a non-empty array of { id, status }");
    else {
      const seen = new Set();
      p.checks.forEach((c, i) => {
        if (!isRecord(c) || typeof c.id !== "string" || c.id.trim() === "") errors.push(`handoff.payload.checks[${i}].id required`);
        else if (seen.has(c.id)) errors.push(`handoff.payload.checks[${i}].id "${c.id}" repeats an earlier check`);
        else seen.add(c.id);
        if (!ACCEPTANCE_CHECK_STATUSES.includes(c?.status)) errors.push(`handoff.payload.checks[${i}].status must be ${ACCEPTANCE_CHECK_STATUSES.join("|")}`);
      });
      // A PASS verdict with a failing or unchecked check is the "mostly works" the
      // build loop's Evaluator is told never to approve.
      if (p.verdict === "PASS" && p.checks.some((c) => c?.status !== "PASS")) errors.push("handoff.payload.verdict PASS requires every check PASS");
    }
  }

  return { ok: errors.length === 0, errors };
}

/**
 * Validate the common envelope shared by file, local-MCP, and hosted-MCP
 * transports. Transport-specific size/auth/storage checks stay with the
 * transport. Optional v1.1 extensions remain backward compatible.
 */
export function validateCheckpointEnvelope(checkpoint, { expectedSkill } = {}) {
  const errors = [];
  const warnings = [];
  if (!isRecord(checkpoint)) {
    return { ok: false, errors: ["checkpoint must be a JSON object"], warnings };
  }

  for (const field of REQUIRED) {
    if (missing(checkpoint[field])) errors.push(`missing required field "${field}"`);
  }
  if (checkpoint.protocol_version && !ACCEPTED_CHECKPOINT_WIRE_VERSIONS.includes(checkpoint.protocol_version)) {
    errors.push(
      `protocol_version must be a supported on-disk schema version ` +
      `(${ACCEPTED_CHECKPOINT_WIRE_VERSIONS.map((v) => `"${v}"`).join(" or ")}); got ` +
      `${JSON.stringify(checkpoint.protocol_version)}. This is the wire-format version, ` +
      `not the checkpoint-protocol skill release version.`,
    );
  }
  if (checkpoint.status && !STATUS.has(checkpoint.status)) {
    errors.push(`status must be one of ${[...STATUS].join("|")} (got "${checkpoint.status}")`);
  }
  if (expectedSkill && checkpoint.skill && checkpoint.skill !== expectedSkill) {
    errors.push(`skill must match the requested skill "${expectedSkill}"`);
  }

  for (const field of ["created_at", "updated_at", "record_updated_at", "verified_at"]) {
    if (checkpoint[field] !== undefined && !isIsoInstant(checkpoint[field])) {
      errors.push(`${field} must be ISO-8601 (Z or ±hh:mm)`);
    }
  }
  const created = isIsoInstant(checkpoint.created_at) ? Date.parse(checkpoint.created_at) : null;
  const updated = isIsoInstant(checkpoint.updated_at) ? Date.parse(checkpoint.updated_at) : null;
  const recordUpdated = isIsoInstant(checkpoint.record_updated_at)
    ? Date.parse(checkpoint.record_updated_at)
    : updated;
  if (created !== null && updated !== null && updated < created) {
    errors.push(`updated_at (${checkpoint.updated_at}) is before created_at (${checkpoint.created_at})`);
  }
  if (updated !== null && updated > Date.now() + 86_400_000) {
    warnings.push(`updated_at (${checkpoint.updated_at}) is in the future — clock skew or a typo?`);
  }
  if (checkpoint.record_updated_at && updated !== null && recordUpdated !== updated) {
    errors.push("record_updated_at must equal updated_at on wire 1.1 writes");
  }
  if (checkpoint.verified_at !== undefined) {
    validateIdentity(checkpoint.candidate, "candidate", errors);
    if (recordUpdated !== null && isIsoInstant(checkpoint.verified_at) && Date.parse(checkpoint.verified_at) > recordUpdated) {
      errors.push("verified_at cannot be after record_updated_at/updated_at");
    }
  }

  const rowIds = new Set();
  if (checkpoint.progress_table !== undefined && !Array.isArray(checkpoint.progress_table)) {
    errors.push("progress_table must be an array");
  } else if (Array.isArray(checkpoint.progress_table)) {
    checkpoint.progress_table.forEach((row, index) => {
      if (!isRecord(row)) {
        errors.push(`progress_table[${index}] must be an object`);
        return;
      }
      for (const field of ["id", "label", "status"]) {
        if (missing(row[field])) errors.push(`progress_table[${index}].${field} required`);
      }
      if (row.id) rowIds.add(row.id);
      if (row.status && !ROW_STATUS.has(row.status)) {
        errors.push(`progress_table[${index}].status must be one of ${[...ROW_STATUS].join("|")}`);
      }
    });
  } else if (checkpoint.status === "in_progress") {
    warnings.push("no progress_table — recommended for in_progress checkpoints so resume can show position");
  }

  if (checkpoint.next_actions !== undefined && !Array.isArray(checkpoint.next_actions)) {
    errors.push("next_actions must be an array");
  } else if (Array.isArray(checkpoint.next_actions)) {
    checkpoint.next_actions.forEach((action, index) => {
      if (typeof action === "string") return;
      if (isRecord(action) && typeof action.text === "string") {
        if (action.done_when !== undefined && typeof action.done_when !== "string") {
          errors.push(`next_actions[${index}].done_when must be a string (a shell command to self-verify completion)`);
        }
        return;
      }
      errors.push(`next_actions[${index}] must be a string or { text, done_when? }`);
    });
  }
  if (checkpoint.status === "in_progress" && (!Array.isArray(checkpoint.next_actions) || checkpoint.next_actions.length === 0)) {
    errors.push('next_actions must be a non-empty array when status is "in_progress" (the next session reads next_actions[0] first)');
  }
  if (checkpoint.status === "in_progress" && checkpoint.context_primer === undefined) {
    warnings.push("no context_primer — resume will have to re-read the project; add key_decisions + generated_files");
  }

  if (checkpoint.blockers !== undefined && !Array.isArray(checkpoint.blockers)) {
    errors.push("blockers must be an array");
  } else if (Array.isArray(checkpoint.blockers)) {
    checkpoint.blockers.forEach((blocker, index) => {
      if (!isRecord(blocker)) {
        errors.push(`blockers[${index}] must be an object`);
        return;
      }
      if (!blocker.id || !blocker.description) errors.push(`blockers[${index}] needs at least id + description`);
      if (blocker.needs !== undefined && !BLOCKER_NEEDS.has(blocker.needs)) {
        errors.push(`blockers[${index}].needs must be one of ${[...BLOCKER_NEEDS].join("|")} (got "${blocker.needs}") — the priority engine routes on this`);
      }
      if (blocker.blocking && rowIds.size > 0 && !rowIds.has(blocker.blocking)) {
        warnings.push(`blockers[${index}].blocking="${blocker.blocking}" does not match any progress_table.id — dangling reference?`);
      }
    });
  }
  const blockers = Array.isArray(checkpoint.blockers) ? checkpoint.blockers.filter(isRecord) : [];
  if (checkpoint.status === "blocked" && blockers.length === 0) {
    warnings.push('status is "blocked" but no blockers are recorded — say what it is waiting on, or set the real status');
  }
  if (checkpoint.status === "complete") {
    blockers.forEach((blocker, index) => {
      if (blocker.needs === "user_decision") {
        warnings.push(`status is "complete" but blockers[${index}] still needs a user decision — remove the blocker once resolved, or reopen`);
      }
    });
  }

  if (checkpoint.findings !== undefined && !Array.isArray(checkpoint.findings)) {
    errors.push("findings must be an array");
  } else if (Array.isArray(checkpoint.findings)) {
    checkpoint.findings.forEach((finding, index) => {
      if (!isRecord(finding)) {
        errors.push(`findings[${index}] must be an object`);
        return;
      }
      if (!finding.id) errors.push(`findings[${index}].id required`);
      if (!FINDING_STATUS.has(finding.status)) {
        errors.push(`findings[${index}].status must be one of ${[...FINDING_STATUS].join("|")}`);
      }
      if (!isIsoInstant(finding.record_updated_at)) {
        errors.push(`findings[${index}].record_updated_at must be ISO-8601 (Z or ±hh:mm)`);
      }
      if (finding.status === "verified") {
        if (!isIsoInstant(finding.verified_at)) errors.push(`findings[${index}].verified_at required for verified findings`);
        validateIdentity(finding.candidate, `findings[${index}].candidate`, errors);
      } else if (finding.verified_at !== undefined || finding.candidate !== undefined) {
        warnings.push(`findings[${index}] carries verification identity while status is "${finding.status}"`);
      }
    });
  }

  if (checkpoint.handoffs !== undefined && !Array.isArray(checkpoint.handoffs)) {
    errors.push("handoffs must be an array");
  } else if (Array.isArray(checkpoint.handoffs)) {
    const ids = new Set();
    checkpoint.handoffs.forEach((handoff, index) => {
      const result = validateCheckpointHandoff(handoff, { checkpointSkill: checkpoint.skill });
      for (const error of result.errors) errors.push(`handoffs[${index}]: ${error}`);
      if (handoff?.id && ids.has(handoff.id)) errors.push(`handoffs[${index}].id duplicates "${handoff.id}"`);
      if (handoff?.id) ids.add(handoff.id);
    });
  }

  return { ok: errors.length === 0, errors, warnings };
}

export class CheckpointContractError extends Error {
  constructor(message, errors = []) {
    super(message);
    this.name = "CheckpointContractError";
    this.errors = errors;
  }
}

/** Fail-closed reader for a published typed handoff. */
export function getCheckpointHandoff(checkpoint, { type, id, artifactId } = {}) {
  const envelope = validateCheckpointEnvelope(checkpoint);
  if (!envelope.ok) {
    throw new CheckpointContractError("checkpoint envelope is invalid", envelope.errors);
  }
  if (!Object.values(HANDOFF_TYPES).includes(type)) {
    throw new CheckpointContractError(`unknown handoff type "${type}"`);
  }
  const matches = (checkpoint.handoffs ?? []).filter((handoff) =>
    handoff.type === type &&
    (id === undefined || handoff.id === id) &&
    (artifactId === undefined || handoff.artifact?.id === artifactId || handoff.candidate?.id === artifactId),
  );
  if (matches.length !== 1) {
    throw new CheckpointContractError(
      matches.length === 0 ? `no ${type} handoff matched` : `multiple ${type} handoffs matched; select by id`,
    );
  }
  const result = validateCheckpointHandoff(matches[0], { checkpointSkill: checkpoint.skill });
  if (!result.ok) throw new CheckpointContractError(`invalid ${type} handoff`, result.errors);
  return matches[0];
}

/** Metadata writes must not refresh verification evidence. */
export function checkpointRecordUpdatedAt(checkpoint) {
  return checkpoint?.record_updated_at ?? checkpoint?.updated_at ?? null;
}
