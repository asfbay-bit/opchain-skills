import { assert, digest, timestamp, validateEvaluation, verifyApproval } from './core.mjs';
import { evidenceFor } from './hindsight.mjs';

export const REVALIDATION_MS = 30 * 24 * 60 * 60 * 1000;
export function adoptRule(record, evaluation, receipt, events, context, revalidate = false) {
  assert(revalidate ? record.state === 'active' : record.state === 'staged', revalidate ? 'Only active rules can be revalidated' : 'Only staged rules can be adopted');
  assert(record.id === digest(record.candidate), 'Stored candidate mutated');
  assert(record.evidenceDigest === digest(evidenceFor(record.candidate, events)), 'Stored evidence mutated');
  const evaluationDigest = validateEvaluation(record.candidate, evaluation, context.now);
  const now = context.now ?? Date.now();
  assert(now - timestamp(evaluation.generatedAt) <= REVALIDATION_MS, 'Evaluation is too old; revalidation is required');
  if (revalidate) assert(timestamp(evaluation.generatedAt) > timestamp(record.evaluation.generatedAt), 'Revalidation requires a newer evaluation');
  const approvalEvidenceDigest = digest({ history: record.evidenceDigest, evaluation: evaluationDigest });
  verifyApproval({ ...context, candidate: record.candidate, evidenceDigest: approvalEvidenceDigest,
    evidenceAt: evaluation.generatedAt, receipt, action: revalidate ? 'revalidate-rule' : 'adopt-rule' });
  return { ...record, state: 'active', evaluation, receipt, approvalEvidenceDigest };
}
export function verifyRule(record, events, context) {
  assert(record.state === 'active', 'Rule is not active');
  const action = record.receipt?.action;
  assert(action === 'adopt-rule' || action === 'revalidate-rule', 'Invalid rule approval action');
  // Revalidation receipts use the same integrity checks without replaying the
  // lifecycle transition or requiring another, newer run on every read.
  const receipt = record.receipt;
  const evaluationDigest = validateEvaluation(record.candidate, record.evaluation, context.now);
  assert(record.id === digest(record.candidate), 'Stored candidate mutated');
  assert(record.evidenceDigest === digest(evidenceFor(record.candidate, events)), 'Stored evidence mutated');
  assert((context.now ?? Date.now()) - timestamp(record.evaluation.generatedAt) <= REVALIDATION_MS, 'Rule requires revalidation');
  verifyApproval({ ...context, candidate: record.candidate, evidenceDigest: digest({ history: record.evidenceDigest, evaluation: evaluationDigest }),
    evidenceAt: record.evaluation.generatedAt, receipt, action });
  return record.candidate;
}
