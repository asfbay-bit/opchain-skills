import { assert, digest, mergeHistory, timestamp, validateCandidate, verifyApproval } from './core.mjs';
import { RECURRENCE_FLOOR } from './scorecard.mjs';

export function evidenceFor(candidate, events) {
  const history = mergeHistory(events);
  const selected = candidate.evidenceEventIds.map(id => history.find(event => event.eventId === id));
  assert(selected.length >= RECURRENCE_FLOOR && selected.every(Boolean), `At least ${RECURRENCE_FLOOR} distinct recorded evidence events are required`);
  assert(selected.every(event => event.skill === candidate.skill), 'Evidence must belong to the target skill');
  assert(selected.every(event => event.rubric === candidate.rubric && event.score / event.max < 0.6), 'Evidence must demonstrate the same recurring weak rubric (<0.6)');
  assert(selected.every(event => timestamp(event.at) <= timestamp(candidate.proposedAt)), 'Evidence must precede proposal');
  // References can grow through duplicate ingestion without changing evidence.
  return selected.map(({ sourceRefs, ...event }) => event).sort((a, b) => a.eventId.localeCompare(b.eventId));
}
export function stage(candidate, kind, events, now = Date.now()) {
  const candidateDigest = validateCandidate(candidate, kind, now);
  assert(timestamp(candidate.expiresAt) > now, 'Cannot stage expired candidate');
  const evidence = evidenceFor(candidate, events);
  return { id: candidateDigest, candidate, evidenceDigest: digest(evidence), state: 'staged' };
}
export function activateLesson(record, receipt, events, context) {
  assert(record.state === 'staged', 'Only staged lessons can be activated');
  validateCandidate(record.candidate, 'lesson', context.now);
  assert(record.id === digest(record.candidate), 'Stored candidate mutated');
  const evidence = evidenceFor(record.candidate, events);
  assert(record.evidenceDigest === digest(evidence), 'Stored evidence mutated');
  verifyApproval({ ...context, candidate: record.candidate, evidenceDigest: record.evidenceDigest,
    evidenceAt: evidence.reduce((latest, event) => event.at > latest ? event.at : latest, evidence[0].at), receipt, action: 'activate-lesson' });
  return { ...record, state: 'active', receipt };
}
export function verifyLesson(record, events, context) {
  assert(record.state === 'active', 'Lesson is not active');
  activateLesson({ ...record, state: 'staged' }, record.receipt, events, context);
  return record.candidate;
}
