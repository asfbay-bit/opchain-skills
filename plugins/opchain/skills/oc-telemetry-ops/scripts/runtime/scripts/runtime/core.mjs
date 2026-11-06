import { createHash, createPublicKey, verify } from 'node:crypto';

export function assert(condition, message) { if (!condition) throw new Error(message); }
export function canonicalJSON(value) {
  if (value === null || typeof value !== 'object') {
    assert(value !== undefined && (typeof value !== 'number' || Number.isFinite(value)), 'Non-JSON value');
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) return `[${value.map(canonicalJSON).join(',')}]`;
  return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonicalJSON(value[key])}`).join(',')}}`;
}
export const digest = value => createHash('sha256').update(canonicalJSON(value)).digest('hex');
export const isHash = value => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
export function timestamp(value, name = 'timestamp') {
  assert(typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(value), `Invalid ${name}`);
  const time = Date.parse(value);
  assert(Number.isFinite(time) && new Date(time).toISOString().replace('.000Z', 'Z') === value.replace('.000Z', 'Z'), `Invalid ${name}`);
  return time;
}
export function nonempty(value, name) { assert(typeof value === 'string' && value.trim().length > 0, `${name} is required`); return value; }

// Source paths are provenance, never identity. A rubric verdict has one identity
// across report ingestion, live history, and yearly archives.
export function normalizeEvent(input) {
  const allowed = new Set(['schemaVersion', 'skill', 'rubric', 'at', 'score', 'max', 'runId', 'run_id', 'eventId', 'sourceRefs', 'sourceRef', 'evidence_ref', 'dimensions']);
  assert(input && typeof input === 'object' && !Array.isArray(input) && Object.keys(input).every(key => allowed.has(key)), 'Unsupported event field; normalize source records explicitly');
  assert(input.schemaVersion === undefined || input.schemaVersion === 1, 'Unsupported event schema');
  assert(input.runId === undefined || input.run_id === undefined || input.runId === input.run_id, 'Conflicting run ID aliases');
  const event = { schemaVersion: 1, skill: nonempty(input.skill, 'skill'), rubric: nonempty(input.rubric, 'rubric'),
    at: new Date(timestamp(input.at, 'event.at')).toISOString(), score: input.score, max: input.max ?? 10 };
  assert(Number.isFinite(event.score) && Number.isFinite(event.max) && event.max > 0 && event.score >= 0 && event.score <= event.max, 'Invalid event score');
  if (input.dimensions !== undefined) {
    assert(input.dimensions && typeof input.dimensions === 'object' && !Array.isArray(input.dimensions) && Object.values(input.dimensions).every(value => Number.isFinite(value) && value >= 0 && value <= event.max), 'Invalid event dimensions');
    event.dimensions = input.dimensions;
  }
  if (input.runId ?? input.run_id) event.runId = nonempty(input.runId ?? input.run_id, 'runId');
  const identity = event.runId ? { runId: event.runId, skill: event.skill, rubric: event.rubric } : event;
  event.eventId = `ev_${digest(identity)}`;
  assert(!input.eventId || input.eventId === event.eventId, 'Event ID does not match canonical identity');
  assert(input.sourceRefs === undefined || Array.isArray(input.sourceRefs), 'sourceRefs must be an array');
  const refs = [...(input.sourceRefs ?? []), input.sourceRef, input.evidence_ref].filter(value => value !== undefined);
  assert(refs.every(value => typeof value === 'string'), 'Invalid source references');
  event.sourceRefs = [...new Set(refs)].sort();
  return event;
}
export function mergeHistory(...histories) {
  const events = new Map();
  for (const raw of histories.flat()) {
    const event = normalizeEvent(raw), prior = events.get(event.eventId);
    if (prior) {
      const { sourceRefs: a, ...left } = prior, { sourceRefs: b, ...right } = event;
      assert(canonicalJSON(left) === canonicalJSON(right), `Conflicting event ${event.eventId}`);
      event.sourceRefs = [...new Set([...a, ...b])].sort();
    }
    events.set(event.eventId, event);
  }
  return [...events.values()].sort((a, b) => a.at.localeCompare(b.at) || a.eventId.localeCompare(b.eventId));
}

export function validateCandidate(input, kind, now = Date.now()) {
  assert(input.kind === kind && ['lesson', 'rule'].includes(kind), `Expected ${kind} candidate`);
  assert(input.schemaVersion === 1, 'Unsupported candidate schema');
  nonempty(input.skill, 'skill'); nonempty(input.rubric, 'rubric'); nonempty(input.text, 'text');
  assert(input.text.length <= 16000, 'Candidate text exceeds 16000 characters');
  const proposed = timestamp(input.proposedAt, 'proposedAt');
  assert(proposed <= now && timestamp(input.expiresAt, 'expiresAt') > proposed, 'Invalid candidate lifecycle');
  assert(Array.isArray(input.evidenceEventIds) && input.evidenceEventIds.every(id => /^ev_[a-f0-9]{64}$/.test(id)), 'evidenceEventIds must contain canonical IDs');
  assert(new Set(input.evidenceEventIds).size === input.evidenceEventIds.length, 'Duplicate candidate evidence');
  if (kind === 'rule') validateContract(input.contract, proposed);
  return digest(input);
}
function metrics(value) {
  for (const name of ['target', 'heldout', 'full']) assert(Number.isFinite(value?.[name]) && value[name] >= 0 && value[name] <= 1, `Invalid ${name} task metric (expected 0..1)`);
}
function manifest(value) {
  for (const name of ['instructionsHash', 'toolPolicyHash', 'datasetHash', 'modelConfigHash', 'outputHash']) assert(isHash(value?.[name]), `Missing ${name}`);
  const bundle = value.instructionBundle;
  assert(bundle && typeof bundle.base === 'string' && bundle.base.trim() && typeof bundle.rule === 'string' && Object.keys(bundle).every(key => ['base', 'rule'].includes(key)), 'instructionBundle requires complete base instructions and rule bytes');
  assert(value.instructionsHash === digest(bundle), 'Instructions hash does not match instruction bundle bytes');
}
export function validateContract(contract, proposed) {
  assert(contract?.schemaVersion === 1, 'Rule requires a versioned evaluation contract');
  const frozen = timestamp(contract.frozenAt, 'contract.frozenAt');
  assert(frozen <= proposed, 'Contract must freeze before proposal');
  assert(contract.minTargetImprovement > 0 && contract.minTargetImprovement <= 1, 'Contract requires positive target improvement');
  const baseline = contract.baseline;
  assert(baseline?.mode === 'task' && baseline.synthetic === false, 'Baseline must be authentic task evidence, not routing or synthetic fixtures');
  nonempty(baseline.runId, 'baseline.runId'); metrics(baseline.metrics); manifest(baseline);
  assert(baseline.instructionBundle.rule === '', 'Baseline cannot contain candidate treatment');
  assert(timestamp(baseline.generatedAt, 'baseline.generatedAt') <= frozen, 'Baseline must precede contract freeze');
}
export function validateEvaluation(candidate, evaluation, now = Date.now()) {
  const candidateDigest = validateCandidate(candidate, 'rule', now);
  assert(evaluation?.schemaVersion === 1 && evaluation.mode === 'task' && evaluation.synthetic === false, 'Only authentic task evaluation artifacts can support adoption');
  assert(evaluation.candidateDigest === candidateDigest, 'Evaluation candidate digest mismatch');
  assert(evaluation.contractDigest === digest(candidate.contract), 'Evaluation contract digest mismatch');
  nonempty(evaluation.runId, 'evaluation.runId'); metrics(evaluation.metrics); manifest(evaluation);
  const baseline = candidate.contract.baseline;
  assert(evaluation.candidateRuleHash === digest(candidate.text), 'Evaluation rule hash does not match candidate bytes');
  assert(evaluation.instructionBundle.rule === candidate.text && evaluation.instructionBundle.base === baseline.instructionBundle.base, 'Evaluation instruction bundle must apply exactly the candidate to the frozen baseline');
  assert(evaluation.runId !== baseline.runId, 'Candidate must have a distinct evaluation run');
  const generated = timestamp(evaluation.generatedAt, 'evaluation.generatedAt');
  assert(generated > timestamp(candidate.proposedAt) && generated <= now, 'Candidate evaluation must follow proposal and cannot be in the future');
  for (const name of ['toolPolicyHash', 'datasetHash', 'modelConfigHash']) assert(evaluation[name] === baseline[name], `Evaluation ${name} changed from frozen baseline`);
  assert(evaluation.instructionsHash !== baseline.instructionsHash, 'Evaluation must measure changed instructions');
  assert(evaluation.metrics.target - baseline.metrics.target + 1e-12 >= candidate.contract.minTargetImprovement, 'Target improvement below contract minimum');
  assert(evaluation.metrics.heldout >= baseline.metrics.heldout && evaluation.metrics.full >= baseline.metrics.full, 'Heldout or full-suite task regression');
  if (baseline.caseOutcomes) {
    assert(evaluation.caseOutcomes && Object.keys(baseline.caseOutcomes).sort().join('\n') === Object.keys(evaluation.caseOutcomes).sort().join('\n'), 'Evaluation case set changed');
    for (const [id, score] of Object.entries(baseline.caseOutcomes)) {
      assert([0, 1].includes(score) && [0, 1].includes(evaluation.caseOutcomes[id]), 'Invalid case outcome');
      assert(evaluation.caseOutcomes[id] >= score, `Task regression on case ${id}`);
    }
  }
  return digest(evaluation);
}

// Signature validity establishes possession of an externally trusted reviewer key.
// It cannot establish human presence or authenticate untrusted evaluation runners.
export function approvalPayload(receipt) {
  const { signature, ...payload } = receipt;
  return Buffer.from(canonicalJSON(payload));
}
export function verifyApproval({ candidate, evidenceDigest, evidenceAt, receipt, action, projectId, trustedKeys, now = Date.now() }) {
  assert(receipt?.schemaVersion === 1 && receipt.action === action, 'Wrong approval action or schema');
  assert(receipt.projectId === projectId, 'Approval belongs to another project');
  assert(receipt.candidateDigest === digest(candidate) && receipt.evidenceDigest === evidenceDigest, 'Approval candidate/evidence digest mismatch');
  const approved = timestamp(receipt.approvedAt, 'approval.approvedAt');
  assert(approved >= timestamp(evidenceAt) && approved >= timestamp(candidate.proposedAt) && approved <= now, 'Approval predates evidence or is in the future');
  const expires = timestamp(receipt.expiresAt, 'approval.expiresAt');
  assert(expires > now && expires > approved && expires <= timestamp(candidate.expiresAt), 'Approval expired or exceeds candidate lifetime');
  assert(trustedKeys && Object.hasOwn(trustedKeys, receipt.keyId), 'Approval signer is not externally trusted');
  const key = createPublicKey(trustedKeys[receipt.keyId]);
  assert(key.asymmetricKeyType === 'ed25519', 'Reviewer key must be Ed25519');
  assert(typeof receipt.signature === 'string' && /^[A-Za-z0-9+/]{86}==$/.test(receipt.signature), 'Invalid approval signature encoding');
  assert(verify(null, approvalPayload(receipt), key, Buffer.from(receipt.signature, 'base64')), 'Invalid approval signature');
  return true;
}
