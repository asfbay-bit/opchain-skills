import { randomUUID } from 'node:crypto';
import { existsSync, lstatSync, mkdirSync, readFileSync, readdirSync, realpathSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { assert, digest, mergeHistory, timestamp } from './core.mjs';
import { scorecard } from './scorecard.mjs';
import { activateLesson, stage, verifyLesson } from './hindsight.mjs';
import { adoptRule, verifyRule } from './evolve.mjs';
import { projectName } from './project.mjs';

const CONFIG = 'self-improvement.json';
function readJSON(path, fallback) {
  try { return JSON.parse(readFileSync(path, 'utf8')); }
  catch (error) { if (error.code === 'ENOENT' && fallback !== undefined) return fallback; throw error; }
}
function safePath(root, ...parts) {
  let path = root;
  for (const part of parts) {
    path = join(path, part);
    try { assert(!lstatSync(path).isSymbolicLink(), `Runtime path cannot be a symlink: ${path}`); }
    catch (error) { if (error.code !== 'ENOENT') throw error; }
  }
  return path;
}
function writeJSON(path, value) {
  const temporary = `${path}.${randomUUID()}.tmp`;
  try {
    writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`, { flag: 'wx', mode: 0o600 });
    renameSync(temporary, path);
  } finally { rmSync(temporary, { force: true }); }
}
export function switches(config = {}, env = process.env) {
  const global = config.enabled === true && !['off', '0', 'false'].includes(env.OPCHAIN_SELF_IMPROVEMENT) && env.OPCHAIN_SELF_IMPROVEMENT_OFF !== '1';
  return Object.fromEntries(['scorecard', 'hindsight', 'evolve'].map(feature => [feature,
    global && config[feature] !== false && env[`OPCHAIN_${feature.toUpperCase()}_OFF`] !== '1' && !['off', '0', 'false'].includes(env[`OPCHAIN_${feature.toUpperCase()}`]) ]));
}
export function readHistory(root, state) {
  const directory = safePath(root, '.opchain', 'learning', 'history');
  const archives = existsSync(directory) ? readdirSync(directory).filter(file => file.endsWith('.json')).sort().map(file => {
    const archive = readJSON(safePath(root, '.opchain', 'learning', 'history', file));
    assert(Array.isArray(archive), 'History archive must be an event array');
    return archive;
  }) : [];
  return mergeHistory(state.events, ...archives);
}

/** Returns JSON; router owns stdout/exit codes. No host injection or LLM calls. */
export async function handleLearning(args, { root, trustedKeys, now = Date.now() } = {}) {
  assert(root, 'Consumer root is required');
  root = realpathSync(resolve(root));
  const [command = 'status', operation, ...rest] = args;
  const readOnly = command === 'status' || (command === 'history' && operation === 'list') ||
    (command === 'scorecard' && operation === 'report') || (['hindsight', 'evolve'].includes(command) && operation === 'query');
  const directory = safePath(root, '.opchain', 'learning');
  const statePath = safePath(root, '.opchain', 'learning', 'state.json');
  const configPath = safePath(root, '.opchain', CONFIG);
  let lock;
  if (!readOnly) {
    mkdirSync(directory, { recursive: true });
    lock = safePath(root, '.opchain', 'learning', '.write-lock');
    try { mkdirSync(lock); }
    catch (error) { if (error.code === 'EEXIST') throw new Error('Learning state is locked; inspect interrupted writer before removing .write-lock'); throw error; }
  }
  try {
    const config = readJSON(configPath, {}), enabled = switches(config);
    if (['hindsight', 'evolve'].includes(command) && operation === 'query' && !enabled[command]) {
      assert(rest.length <= 1, `Usage: ${command} query [skill]`);
      return { enabled: false, items: [], rejected: [] };
    }
    if (command === 'scorecard' && operation === 'report' && !enabled.scorecard) {
      assert(rest.length === 0, 'Usage: scorecard report');
      return { enabled: false, rows: [] };
    }
    const state = readJSON(statePath, { schemaVersion: 1, projectId: randomUUID(), events: [], records: {} });
    assert(state.schemaVersion === 1 && typeof state.projectId === 'string' && Array.isArray(state.events) && state.records && typeof state.records === 'object' && !Array.isArray(state.records), 'Invalid learning state');
    const context = { projectId: state.projectId, trustedKeys, now };
    const history = readHistory(root, state);
    const input = file => { assert(file, 'Input JSON file is required'); return readJSON(resolve(root, file)); };
    let result;
    if (command === 'status') {
      assert(args.length <= 1, 'Usage: status');
      return { schemaVersion: 1, project: projectName(root), projectId: existsSync(statePath) ? state.projectId : null,
        enabled, events: history.length, staged: Object.values(state.records).filter(record => record.state === 'staged').length,
        active: Object.values(state.records).filter(record => record.state === 'active').length,
        trust: 'External Ed25519 reviewer keys required. Local files do not prove independent human approval.' };
    }
    if (command === 'config') {
      assert(['enable', 'disable'].includes(operation) && rest.length <= 1 && (!rest[0] || ['hindsight', 'evolve', 'scorecard'].includes(rest[0])), 'Usage: config enable|disable [hindsight|evolve|scorecard]');
      const next = { ...config, [rest[0] ?? 'enabled']: operation === 'enable' };
      writeJSON(configPath, next);
      result = { enabled: switches(next) };
    } else if (command === 'history') {
      assert((operation === 'list' && rest.length === 0) || (operation === 'ingest' && rest.length === 1), 'Usage: history list | history ingest <events.json>');
      if (operation === 'list') return { events: history };
      const events = input(rest[0]);
      assert(Array.isArray(events), 'History ingestion requires an event array');
      assert(events.every(event => timestamp(event.at, 'event.at') <= now), 'History events cannot be in the future');
      state.events = mergeHistory(history, events);
      result = { added: state.events.length - history.length, total: state.events.length };
    } else if (command === 'scorecard') {
      assert(operation === 'report' && rest.length === 0, 'Usage: scorecard report');
      return { enabled: enabled.scorecard, rows: enabled.scorecard ? scorecard(history) : [] };
    } else if (['hindsight', 'evolve'].includes(command)) {
      const kind = command === 'hindsight' ? 'lesson' : 'rule';
      if (operation === 'query') {
        assert(rest.length <= 1, `Usage: ${command} query [skill]`);
        if (!enabled[command]) return { enabled: false, items: [], rejected: [] };
        const items = [], rejected = [];
        for (const [id, record] of Object.entries(state.records)) {
          if (record.candidate?.kind !== kind || record.state !== 'active' || (rest[0] && record.candidate.skill !== rest[0])) continue;
          try {
            assert(id === record.id, 'Record index mismatch');
            const candidate = kind === 'lesson' ? verifyLesson(record, history, context) : verifyRule(record, history, context);
            items.push({ id, skill: candidate.skill, text: candidate.text, expiresAt: candidate.expiresAt });
          } catch (error) { rejected.push({ id, reason: error.message }); }
        }
        return { enabled: true, items: items.sort((a, b) => a.id.localeCompare(b.id)), rejected };
      }
      if (operation === 'stage') {
        assert(rest.length === 1, `Usage: ${command} stage <candidate.json>`);
        const record = stage(input(rest[0]), kind, history, now);
        const existing = Object.hasOwn(state.records, record.id) ? state.records[record.id] : null;
        if (existing) return { id: existing.id, state: existing.state, evidenceDigest: existing.evidenceDigest, projectId: state.projectId };
        state.records[record.id] = record;
        result = { id: record.id, state: record.state, evidenceDigest: record.evidenceDigest, projectId: state.projectId };
      } else {
        const [id] = rest;
        assert(/^[a-f0-9]{64}$/.test(id ?? ''), 'Candidate ID must be a SHA-256 digest');
        const record = Object.hasOwn(state.records, id) ? state.records[id] : null;
        assert(record && record.candidate.kind === kind && record.id === id && digest(record.candidate) === id, 'Unknown or mutated candidate');
        if (operation === 'retire') {
          assert(rest.length === 1, `Usage: ${command} retire <id>`);
          state.records[id] = { ...record, state: 'retired', retiredAt: new Date(now).toISOString() };
        } else if (command === 'hindsight' && operation === 'activate') {
          assert(rest.length === 2, 'Usage: hindsight activate <id> <approval.json>');
          state.records[id] = activateLesson(record, input(rest[1]), history, context);
        } else if (command === 'evolve' && ['adopt', 'revalidate'].includes(operation)) {
          assert(rest.length === 3, `Usage: evolve ${operation} <id> <evaluation.json> <approval.json>`);
          const run = input(rest[1]);
          if (run.evidence) assert(run.evidence.outputHash === digest({ transcript: run.transcript, result: run.result }), 'Task run output digest mismatch');
          state.records[id] = adoptRule(record, run.evidence ?? run, input(rest[2]), history, context, operation === 'revalidate');
        } else throw new Error(`Unknown ${command} operation`);
        result = { id, state: state.records[id].state };
      }
    } else throw new Error('Unknown learning command');
    writeJSON(statePath, state);
    return result;
  } finally { if (lock) rmSync(lock, { recursive: true, force: true }); }
}
