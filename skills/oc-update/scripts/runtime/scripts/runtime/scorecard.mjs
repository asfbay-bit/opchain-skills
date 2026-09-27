import { mergeHistory } from './core.mjs';

export const RECURRENCE_FLOOR = 3;
export function scorecard(events) {
  const groups = new Map();
  for (const event of mergeHistory(events)) {
    const key = JSON.stringify([event.skill, event.rubric]);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(event);
  }
  return [...groups.values()].map(rows => {
    const scores = rows.map(row => row.score / row.max);
    const recent = scores.slice(-RECURRENCE_FLOOR), prior = scores.slice(-RECURRENCE_FLOOR * 2, -RECURRENCE_FLOOR);
    const mean = values => values.reduce((a, b) => a + b, 0) / values.length;
    const failures = rows.filter(row => row.score / row.max < 0.6);
    return { skill: rows[0].skill, rubric: rows[0].rubric, events: rows.length,
      mean: mean(scores), latest: scores.at(-1), recurringWeakness: failures.length >= RECURRENCE_FLOOR,
      evidenceEventIds: failures.map(row => row.eventId),
      decline: prior.length === RECURRENCE_FLOOR && mean(recent) < mean(prior),
      advisory: failures.length >= RECURRENCE_FLOOR ? 'Review repeated weak results before proposing a lesson or rule.' : null };
  }).sort((a, b) => a.skill.localeCompare(b.skill) || a.rubric.localeCompare(b.rubric));
}
