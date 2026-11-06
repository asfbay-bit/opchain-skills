#!/usr/bin/env node
// Standalone consumer CLI. Keep this file dependency-free: it is served as /update.mjs.
import { createHash, randomUUID } from 'node:crypto';
import { accessSync, constants, copyFileSync, existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, readlinkSync, symlinkSync,
  renameSync, rmdirSync, rmSync, statSync, writeFileSync, chmodSync } from 'node:fs';
import { delimiter, dirname, isAbsolute, join, resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { homedir, tmpdir } from 'node:os';

const ORIGIN = 'https://opchain.dev';
const TARGETS = ['.claude/skills', '.agents/skills', '.codex/skills'];
const RECEIPT = '.opchain-install.json';
const LOCK = '.opchain-update.lock';
const BACKUPS = '.opchain-backups';
const SEMVER = /^\d+\.\d+\.\d+$/;
export const digest = bytes => createHash('sha256').update(bytes).digest('hex');
const json = value => Buffer.from(JSON.stringify(value, null, 2) + '\n');

export function compareVersions(a, b) {
  for (let i = 0; i < 3; i++) {
    const delta = Number(a.split('.')[i]) - Number(b.split('.')[i]);
    if (delta) return Math.sign(delta);
  }
  return 0;
}

function safeSkillPath(path) {
  return typeof path === 'string' && /^oc-[a-z0-9-]+\//.test(path) &&
    path.split('/').every(part => /^[a-zA-Z0-9_@.()+-]+$/.test(part) && part !== '.' && part !== '..');
}

export function validateBundle(bundle) {
  if (bundle?.schema !== 1 || !SEMVER.test(bundle.version) || !Array.isArray(bundle.files) ||
      !Array.isArray(bundle.skills) || !bundle.skills.length || bundle.files.length > 20000) {
    throw new Error('Invalid update bundle');
  }
  const skills = new Set(bundle.skills);
  if (skills.size !== bundle.skills.length || [...skills].some(id => !/^oc-[a-z0-9-]+$/.test(id))) {
    throw new Error('Invalid skill inventory');
  }
  const files = new Map();
  const folded = new Set();
  for (const file of bundle.files) {
    if (!safeSkillPath(file.path) || !skills.has(file.path.split('/')[0]) ||
        folded.has(file.path.toLowerCase()) || ![0o644, 0o755].includes(file.mode) ||
        typeof file.content !== 'string' || !/^[a-f0-9]{64}$/.test(file.sha256)) {
      throw new Error(`Invalid or duplicate bundle path: ${file.path}`);
    }
    const bytes = Buffer.from(file.content, 'base64');
    if (bytes.toString('base64') !== file.content || digest(bytes) !== file.sha256) {
      throw new Error(`Checksum mismatch: ${file.path}`);
    }
    folded.add(file.path.toLowerCase());
    files.set(file.path, { ...file, bytes });
  }
  for (const path of files.keys()) {
    const parts = path.split('/');
    while (parts.pop() && parts.length) {
      if (folded.has(parts.join('/').toLowerCase())) throw new Error(`File/directory collision: ${path}`);
    }
  }
  for (const id of skills) {
    const skill = files.get(`${id}/SKILL.md`)?.bytes.toString();
    if (!skill?.startsWith('---\n') || !skill.includes(`\nname: ${id}\n`) ||
        !skill.includes(`\nversion: ${bundle.version}\n`) ||
        !files.has(`${id}/references/orchestrator.md`)) throw new Error(`Incomplete skill: ${id}`);
  }
  for (const path of ['oc-telemetry-ops/scripts/telemetry.mjs', 'oc-telemetry-ops/scripts/telemetry.runtime.mjs',
    'oc-checkpoint-protocol/scripts/checkpoint.mjs', 'oc-checkpoint-protocol/scripts/checkpoint.runtime.mjs']) {
    if (!files.has(path)) throw new Error(`Missing runtime: ${path}`);
  }
  if (bundle.runtime !== undefined) {
    const runtime = bundle.runtime;
    if (runtime?.schemaVersion !== 1 || !Array.isArray(runtime.owners) || !Array.isArray(runtime.files) || typeof runtime.runtimeContract !== 'string') throw new Error('Invalid runtime manifest');
    for (const owner of runtime.owners) {
      if (!skills.has(owner)) continue;
      for (const file of runtime.files) {
        const path = `${owner}/scripts/runtime/${file}`;
        if (!safeSkillPath(path) || !files.has(path)) throw new Error(`Missing runtime dependency: ${path}`);
      }
      if (!files.has(`${owner}/scripts/opchain.mjs`)) throw new Error(`Missing runtime launcher: ${owner}`);
      const embedded = JSON.parse(files.get(`${owner}/scripts/runtime/${runtime.layout === 'repository' ? 'scripts/' : ''}runtime-manifest.json`)?.bytes.toString() ?? 'null');
      if (JSON.stringify(embedded) !== JSON.stringify(runtime)) throw new Error(`Runtime manifest drift: ${owner}`);
    }
  }
  return files;
}

async function fetchBytes(url, fetcher) {
  const response = await fetcher(url, { redirect: 'error', signal: AbortSignal.timeout(30000), cache: 'no-store' });
  if (!response.ok) throw new Error(`Download failed (${response.status}): ${url}`);
  const chunks = [];
  let length = 0;
  for await (const chunk of response.body) {
    length += chunk.length;
    if (length > 20 * 1024 * 1024) throw new Error('Update download exceeds 20 MB');
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

export async function downloadRelease(fetcher = fetch) {
  const release = JSON.parse(await fetchBytes(`${ORIGIN}/opchain-update/latest.json`, fetcher));
  if (release.schema !== 1 || !SEMVER.test(release.version) || !/^[a-f0-9]{64}$/.test(release.sha256)) {
    throw new Error('Invalid release descriptor');
  }
  const bytes = await fetchBytes(`${ORIGIN}/opchain-update/${release.sha256}.json`, fetcher);
  if (digest(bytes) !== release.sha256) throw new Error('Release checksum mismatch');
  const bundle = JSON.parse(bytes);
  if (bundle.version !== release.version) throw new Error('Release version mismatch');
  validateBundle(bundle);
  return bundle;
}

// Check every path component, including dangling links. Atomic replacement below also
// avoids modifying another path through a hard-linked destination file.
function inspect(root, path) {
  let current = root;
  const parts = path.split('/');
  for (let i = 0; i < parts.length; i++) {
    current = join(current, parts[i]);
    let stat;
    try { stat = lstatSync(current); } catch (error) {
      if (error.code === 'ENOENT') return null;
      throw error;
    }
    if (stat.isSymbolicLink()) throw new Error(`Refusing symlink: ${path}`);
    if (i < parts.length - 1 && !stat.isDirectory()) throw new Error(`Not a directory: ${path}`);
    if (i === parts.length - 1) return stat;
  }
}

function read(root, path) {
  const stat = inspect(root, path);
  if (!stat) return null;
  if (!stat.isFile()) throw new Error(`Expected file: ${path}`);
  return { bytes: readFileSync(join(root, path)), mode: stat.mode & 0o777 };
}

export function projectRoot(cwd = process.cwd()) {
  try { return execFileSync('git', ['rev-parse', '--show-toplevel'], { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim(); }
  catch { return cwd; }
}

function targetsFor(root, target) {
  const explicit = { claude: [TARGETS[0]], codex: [TARGETS[1]], both: TARGETS.slice(0, 2) };
  if (target && !explicit[target]) throw new Error('Use --target=claude, codex, or both');
  if (target) return explicit[target];
  const installed = TARGETS.filter(path => {
    const stat = inspect(root, path);
    if (!stat) return false;
    if (!stat.isDirectory()) throw new Error(`Expected skills directory: ${path}`);
    return readdirSync(join(root, path)).some(id => /^oc-[a-z0-9-]+$/.test(id) && inspect(root, `${path}/${id}/SKILL.md`));
  });
  if (installed.includes(TARGETS[2]) && !installed.includes(TARGETS[1])) installed.push(TARGETS[1]);
  return installed.length ? installed : [TARGETS[0]];
}

export async function telemetryHealth(root) {
  // Match telemetry.mjs: only machine-local SQLite consent is authoritative.
  // Tracked checkpoint handles are historical and cannot opt this machine in.
  const off = { enabled: false, healthy: true, message: 'OFF (unchanged)' };
  const sink = '.checkpoints/usage.sqlite';
  if (!inspect(root, sink)?.isFile()) return off;
  for (const suffix of ['-wal', '-shm', '-journal']) inspect(root, sink + suffix);
  let db;
  let scratch;
  let enabled = null;
  try {
    const { DatabaseSync } = await import('node:sqlite');
    // Even a read-only SQLite connection can create WAL/SHM sidecars. Inspect
    // a private temporary copy so checks never write to the consuming repo.
    scratch = mkdtempSync(join(tmpdir(), 'opchain-telemetry-health-'));
    const snapshot = join(scratch, 'usage.sqlite');
    copyFileSync(join(root, sink), snapshot);
    for (const suffix of ['-wal', '-journal']) {
      if (inspect(root, sink + suffix)?.isFile()) copyFileSync(join(root, sink + suffix), snapshot + suffix);
    }
    db = new DatabaseSync(snapshot, { readOnly: true });
    // Legacy stores without local metadata remain off, exactly as telemetry's
    // readLocalConsent does. Unreadable stores are unknown, never a healthy OFF.
    if (!db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='telemetry_meta'").get()) return off;
    enabled = db.prepare('SELECT value FROM telemetry_meta WHERE key = ?').get('consent_enabled')?.value === 'true';
    if (!enabled) return off;
    const rows = db.prepare('SELECT COUNT(*) AS n FROM runs').get().n;
    db.prepare('SELECT COUNT(*) AS n FROM events').get();
    return { enabled: true, healthy: true, message: `ON (unchanged), ${rows} recorded runs retained` };
  } catch {
    return { enabled, healthy: false, message: enabled === true
      ? 'ON (unchanged), but the local database could not be read'
      : 'UNKNOWN (unchanged), the local consent database could not be read' };
  } finally {
    db?.close();
    if (scratch) rmSync(scratch, { recursive: true, force: true });
  }
}

function receiptPath(path) {
  return TARGETS.some(target => path.startsWith(target + '/') && safeSkillPath(path.slice(target.length + 1)));
}

function replace(root, path, value) {
  inspect(root, path);
  const dest = join(root, path);
  if (value === null) { rmSync(dest, { force: true }); return; }
  mkdirSync(dirname(dest), { recursive: true });
  const temp = `${dest}.opchain-${randomUUID()}`;
  try {
    writeFileSync(temp, value.bytes, { flag: 'wx', mode: value.mode });
    chmodSync(temp, value.mode);
    renameSync(temp, dest);
  } finally { rmSync(temp, { force: true }); }
}

// `exclude` drops install targets for this run (the opchain plugin provides
// .claude/skills instead); receipt entries under an excluded target are kept
// untouched. With every target excluded nothing is written, not even the receipt.
export async function installBundle(bundle, { root = projectRoot(), target, check = false, beforeWrite = () => {}, exclude = [] } = {}) {
  root = realpathSync(resolve(root));
  if (inspect(root, LOCK)) throw new Error(`Another or interrupted update owns ${LOCK}. Inspect its recovery.txt before proceeding.`);
  const files = validateBundle(bundle);
  const targets = targetsFor(root, target).filter(path => !exclude.includes(path));
  const telemetry = await telemetryHealth(root); // Inspect local consent before any mutation; never rewrite it.
  if (!targets.length) return { changed: 0, backup: null, version: bundle.version, targets, telemetry, retained: [] };
  const previous = read(root, RECEIPT);
  const receipt = previous ? JSON.parse(previous.bytes) : { schema: 1, files: {} };
  if (receipt.schema !== 1 || !receipt.files || typeof receipt.files !== 'object' || Array.isArray(receipt.files) ||
      Object.entries(receipt.files).some(([path, hash]) => !receiptPath(path) || !/^[a-f0-9]{64}$/.test(hash))) {
    throw new Error('Invalid installed file inventory');
  }
  if (receipt.version && (!SEMVER.test(receipt.version) || compareVersions(receipt.version, bundle.version) > 0)) {
    throw new Error('Refusing to downgrade a newer installed release');
  }
  const desired = new Map();
  const inventory = { ...receipt.files };
  for (const targetPath of targets) {
    for (const [path, file] of files) {
      const dest = `${targetPath}/${path}`;
      const current = read(root, dest);
      if (path.endsWith('/SKILL.md') && current) {
        const version = /^version:\s*(\d+\.\d+\.\d+)\s*$/m.exec(current.bytes.toString())?.[1];
        if (version && compareVersions(version, bundle.version) > 0) throw new Error(`Newer skill already installed: ${dest}`);
        const name = /^name:\s*(\S+)\s*$/m.exec(current.bytes.toString())?.[1];
        if (name !== path.split('/')[0]) throw new Error(`Skill name collision: ${dest}`);
      }
      desired.set(dest, { bytes: file.bytes, mode: file.mode });
      inventory[dest] = file.sha256;
    }
  }
  const retained = [];
  for (const [path, hash] of Object.entries(receipt.files)) {
    if (!targets.some(targetPath => path.startsWith(targetPath + '/')) || desired.has(path)) continue;
    const current = read(root, path);
    if (current && digest(current.bytes) === hash) desired.set(path, null);
    else if (current) retained.push(path);
    delete inventory[path];
  }
  const ignored = read(root, '.gitignore')?.bytes.toString() ?? '';
  const rules = ['/.checkpoints/usage.sqlite', '/.checkpoints/usage.sqlite-*', `/${BACKUPS}/`, `/${LOCK}/`];
  const missing = rules.filter(rule => !ignored.split(/\r?\n/).includes(rule));
  if (missing.length) desired.set('.gitignore', { bytes: Buffer.from(ignored + (ignored && !ignored.endsWith('\n') ? '\n' : '') + '\n# Opchain local state\n' + missing.join('\n') + '\n'), mode: 0o644 });
  desired.set(RECEIPT, { bytes: json({ schema: 1, version: bundle.version, files: inventory }), mode: 0o644 });
  const result = await applyChanges(root, desired, { check, beforeWrite, release: { version: bundle.version, sha256: digest(Buffer.from(JSON.stringify(bundle) + "\n")) } });
  return { ...result, version: bundle.version, targets, telemetry, retained };
}

function readReceipt(root) {
  const current = read(root, RECEIPT);
  const receipt = current ? JSON.parse(current.bytes) : null;
  if (receipt && (receipt.schema !== 1 || !receipt.files || typeof receipt.files !== 'object' || Array.isArray(receipt.files))) throw new Error('Invalid installed file inventory');
  return receipt;
}

const LOCAL_COPY = /^\.claude\/skills\/oc-[a-z0-9-]+\//;

// Receipt-managed oc-* files in .claude/skills that are still on disk: the
// copies that load a second time when the opchain plugin is enabled (§5.4).
export function localSkillCopies(root) {
  const receipt = readReceipt(root);
  return Object.keys(receipt?.files ?? {}).filter(path => LOCAL_COPY.test(path) && receiptPath(path) && read(root, path));
}

// Plugin-only switch (§5.4): remove the receipt-managed .claude/skills/oc-*
// files that still match their receipt digest, through the same backup and
// recovery journal as an update. Customised files are kept and reported, as
// obsolete files are; .agents/skills, .codex/skills and non-oc skills are
// never touched. The receipt keeps its version and loses the dropped paths.
export function dropLocalSkills({ root = projectRoot(), beforeWrite = () => {} } = {}) {
  root = realpathSync(resolve(root));
  if (inspect(root, LOCK)) throw new Error(`Another or interrupted update owns ${LOCK}. Inspect its recovery.txt before proceeding.`);
  const receipt = readReceipt(root);
  if (!receipt) return { changed: 0, backup: null, removed: [], retained: [] };
  const inventory = { ...receipt.files };
  const desired = new Map();
  const removed = [];
  const retained = [];
  for (const [path, hash] of Object.entries(receipt.files)) {
    if (!LOCAL_COPY.test(path) || !receiptPath(path)) continue;
    const current = read(root, path);
    if (current && digest(current.bytes) === hash) { desired.set(path, null); removed.push(path); }
    else if (current) retained.push(path);
    delete inventory[path];
  }
  desired.set(RECEIPT, { bytes: json({ ...receipt, files: inventory }), mode: 0o644 });
  const result = applyChanges(root, desired, { beforeWrite, release: { version: receipt.version ?? null, sha256: null } });
  // Prune the directories the removal emptied, deepest first; one still holding anything stays.
  const dirs = new Set();
  for (const path of removed) for (let dir = dirname(path); dir !== '.claude/skills'; dir = dirname(dir)) dirs.add(dir);
  for (const dir of [...dirs].sort((a, b) => b.length - a.length)) {
    try { if (!readdirSync(join(root, dir)).length) rmdirSync(join(root, dir)); } catch { /* keep it */ }
  }
  return { ...result, removed, retained };
}

function sameEntry(a, b) {
  if (!a || !b) return a === b;
  if (a.link !== undefined || b.link !== undefined) return a.link === b.link;
  return a.mode === b.mode && a.bytes.equals(b.bytes);
}

function readEntry(root, path) {
  if (!/^\.claude\/skills\/[^/]+$/.test(path)) return read(root, path);
  inspect(root, dirname(path));
  let stat;
  try { stat = lstatSync(join(root, path)); } catch (error) {
    if (error.code === 'ENOENT') return null;
    throw error;
  }
  if (!stat.isSymbolicLink()) throw new Error(`Expected source skill symlink: ${path}`);
  const link = readlinkSync(join(root, path));
  const target = resolve(dirname(join(root, path)), link);
  if (!target.startsWith(join(root, 'skills') + '/')) throw new Error(`Refusing external source link: ${path}`);
  return { link, mode: 0o777 };
}

function replaceEntry(root, path, value) {
  if (value?.link !== undefined || /^\.claude\/skills\/[^/]+$/.test(path)) {
    inspect(root, dirname(path));
    const dest = join(root, path);
    mkdirSync(dirname(dest), { recursive: true });
    const temp = `${dest}.opchain-${randomUUID()}`;
    try {
      if (!value) { rmSync(dest, { force: true }); return; }
      symlinkSync(value.link, temp);
      renameSync(temp, dest);
    } finally { rmSync(temp, { force: true }); }
  } else replace(root, path, value);
}

function applyChanges(root, desired, { check = false, beforeWrite = () => {}, guard = () => {}, release = null } = {}) {
  const changes = [...desired].map(([path, after]) => ({ path, before: readEntry(root, path), after }))
    .filter(({ before, after }) => !sameEntry(before, after));
  const result = { changed: changes.length, backup: null };
  guard(); // Check-only/current results must describe the source we actually read.
  if (check || !changes.length) return result;

  inspect(root, LOCK);
  inspect(root, BACKUPS);
  mkdirSync(join(root, LOCK)); // Exclusive lock: a crashed update requires reviewing its journal first.
  const backup = `${BACKUPS}/${Date.now()}-${randomUUID()}`;
  const applied = [];
  let keepLock = false;
  try {
    // The plan was read before taking the lock. Refuse to overwrite changes
    // made by another updater or editor in that interval.
    for (const { path, before } of changes) {
      const now = readEntry(root, path);
      if (!sameEntry(before, now)) {
        throw new Error(`File changed while preparing update: ${path}`);
      }
    }
    guard();
    mkdirSync(join(root, backup), { recursive: true, mode: 0o700 });
    result.backup = backup;
    const journal = { schema: 2, release, ownerPid: process.pid, status: 'preparing', changes: changes.map(({ path, before, after }) => ({ path, before: entryIdentity(before), after: entryIdentity(after) })) };
    replace(root, `${backup}/journal.json`, { bytes: json(journal), mode: 0o600 });
    writeFileSync(join(root, LOCK, 'recovery.txt'), `Inspect ${backup}/journal.json before removing this lock.\n`);
    for (const { path, before } of changes) {
      if (before?.bytes) replace(root, `${backup}/files/${path}`, before);
    }
    journal.status = 'prepared';
    replace(root, `${backup}/journal.json`, { bytes: json(journal), mode: 0o600 });
    for (const change of changes) {
      beforeWrite(change.path, applied.length);
      if (!sameEntry(readEntry(root, change.path), change.before)) throw new Error(`File changed during update: ${change.path}`);
      replaceEntry(root, change.path, change.after);
      applied.push(change);
    }
    for (const [path, after] of desired) {
      const actual = readEntry(root, path);
      if (!sameEntry(actual, after)) {
        throw new Error(`Installed verification failed: ${path}`);
      }
    }
    journal.status = 'complete';
    replace(root, `${backup}/journal.json`, { bytes: json(journal), mode: 0o600 });
  } catch (error) {
    try {
      for (const { path, before, after } of applied.reverse()) {
        const now = readEntry(root, path);
        if (sameEntry(now, before)) continue;
        if (!sameEntry(now, after)) throw new Error(`Recovery conflict; preserve user edits: ${path}`);
        replaceEntry(root, path, before);
      }
    } catch (recoveryError) {
      keepLock = true;
      throw new Error(`Update and automatic recovery failed. Lock retained; recover from ${backup}/journal.json. ${recoveryError.message}`, { cause: error });
    }
    throw new Error(`Update failed; previous files restored. Backup: ${backup}. ${error.message}`, { cause: error });
  } finally { if (!keepLock) rmSync(join(root, LOCK), { recursive: true, force: true }); }
  return result;
}

function entryIdentity(value) {
  if (value === null) return null;
  return value.link !== undefined ? { link: value.link } : { sha256: digest(value.bytes), mode: value.mode };
}

function sameIdentity(value, identity) {
  return JSON.stringify(entryIdentity(value)) === JSON.stringify(identity);
}

function recoveryPath(path) {
  return receiptPath(path) || (path.startsWith('plugins/opchain/skills/') && safeSkillPath(path.slice('plugins/opchain/skills/'.length))) || path === '.gitignore' || path === RECEIPT ||
    /^\.claude\/skills\/(oc-[a-z0-9-]+|README\.md|orchestrator\.md)$/.test(path) ||
    /^(skills|plugins\/opchain\/skills)\/(README\.md|orchestrator\.md|oc-[a-z0-9-]+\/(references\/(orchestrator|checkpoint-protocol|runtime-contract)\.md|scripts\/[a-zA-Z0-9_./-]+))$/.test(path);
}

// Recovery is intentionally offline: the immutable journal, not latest.json,
// identifies both expected states. Never overwrite a subsequent user edit.
export function recoverUpdate({ root = projectRoot(), backup, check = false } = {}) {
  root = realpathSync(resolve(root));
  if (typeof backup !== 'string' || !/^\.opchain-backups\/[0-9]+-[a-f0-9-]+$/.test(backup)) throw new Error('Specify the recorded repo-relative backup directory');
  const journal = JSON.parse(read(root, `${backup}/journal.json`)?.bytes ?? 'null');
  if (journal?.schema !== 2 || !Array.isArray(journal.changes) || !['preparing','prepared','complete','recovered'].includes(journal.status)) throw new Error('Unsupported recovery journal; inspect manually without deleting the lock');
  if (!Number.isInteger(journal.ownerPid) || journal.ownerPid < 1) throw new Error('Invalid recovery owner');
  try { process.kill(journal.ownerPid, 0); throw new Error('Updater process may still be running; recovery refused'); }
  catch (error) { if (error.code !== 'ESRCH') throw error; }
  const seen = new Set();
  const validIdentity = value => value === null || (value && typeof value === 'object' && !Array.isArray(value) &&
    (typeof value.link === 'string' ? Object.keys(value).length === 1 : /^[a-f0-9]{64}$/.test(value.sha256) && Number.isInteger(value.mode) && value.mode >= 0 && value.mode <= 0o777));
  const restore = [];
  for (const entry of journal.changes) {
    const { path, before, after } = entry;
    if (typeof path !== 'string' || path.split('/').some(p => !p || p === '.' || p === '..') || !recoveryPath(path) || seen.has(path) || !validIdentity(before) || !validIdentity(after)) throw new Error('Invalid recovery entry');
    seen.add(path);
    for (const value of [before, after]) if (value?.link !== undefined) {
      if (!/^\.claude\/skills\/[^/]+$/.test(path) || !resolve(root, dirname(path), value.link).startsWith(join(root, 'skills') + '/')) throw new Error('Unsafe recovery link');
    }
    const current = readEntry(root, path);
    if (['complete', 'recovered'].includes(journal.status)) {
      if (!sameIdentity(current, journal.status === 'complete' ? after : before)) throw new Error(`Recovery conflict; terminal transaction changed: ${path}`);
      continue;
    }
    if (sameIdentity(current, before)) continue;
    if (!sameIdentity(current, after)) throw new Error(`Recovery conflict; preserve user edits: ${path}`);
    if (journal.status === 'preparing') throw new Error(`Files changed before preparation completed: ${path}`);
    let original = before === null ? null : before.link !== undefined ? { link: before.link, mode: 0o777 } : read(root, `${backup}/files/${path}`);
    if (!sameIdentity(original, before)) throw new Error(`Missing or corrupt backup: ${path}`);
    restore.push({ path, original, observed: current });
  }
  const lock = inspect(root, LOCK);
  if (!lock?.isDirectory()) throw new Error('Recovery requires the interrupted update lock');
  const pointer = read(root, `${LOCK}/recovery.txt`)?.bytes.toString();
  if (pointer !== `Inspect ${backup}/journal.json before removing this lock.\n`) throw new Error('Lock belongs to a different update');
  if (check) return { changed: restore.length, release: journal.release, status: journal.status };
  if (['complete', 'recovered'].includes(journal.status)) {
    rmSync(join(root, LOCK), { recursive: true });
    return { changed: 0, release: journal.release, status: journal.status };
  }
  for (const { path, observed } of restore) if (!sameEntry(readEntry(root, path), observed)) throw new Error(`Recovery conflict: ${path}`);
  for (const { path, original } of restore.reverse()) replaceEntry(root, path, original);
  journal.status = 'recovered';
  replace(root, `${backup}/journal.json`, { bytes: json(journal), mode: 0o600 });
  rmSync(join(root, LOCK), { recursive: true });
  return { changed: restore.length, release: journal.release, status: 'recovered' };
}

const SOURCE_MARKERS = ['skills/orchestrator.md', 'skills/oc-checkpoint-protocol/SKILL.md',
  'scripts/sync-skill-bundles.mjs', 'scripts/sync-plugin-skills.mjs'];

export function isSourceRepo(root) {
  // Ordinary consumer projects may have an unrelated file/link named skills.
  // Only inspect ownership after the complete source marker set is present.
  if (!SOURCE_MARKERS.every(path => existsSync(join(root, path)))) return false;
  if (!SOURCE_MARKERS.every(path => inspect(root, path)?.isFile())) return false;
  try {
    return realpathSync(execFileSync('git', ['rev-parse', '--show-toplevel'], {
      cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], timeout: 5000,
    }).trim()) === realpathSync(root);
  } catch { return false; }
}

function treeFiles(root, path) {
  const files = new Map();
  const walk = current => {
    const stat = inspect(root, current);
    if (!stat) return;
    if (stat.isDirectory()) for (const name of readdirSync(join(root, current)).sort()) walk(`${current}/${name}`);
    else if (stat.isFile()) files.set(current, read(root, current));
    else throw new Error(`Unsupported source file: ${current}`);
  };
  walk(path);
  return files;
}

function assertSnapshot(root, path, snapshot) {
  const current = treeFiles(root, path);
  if (current.size !== snapshot.size || [...snapshot].some(([file, value]) => !sameEntry(value, current.get(file)))) {
    throw new Error(`Source changed while preparing update: ${path}. Re-run after the edit finishes.`);
  }
}

export async function syncSourceRepo({ root = projectRoot(), check = false, beforeWrite = () => {} } = {}) {
  root = realpathSync(resolve(root));
  if (inspect(root, LOCK)) throw new Error(`Another or interrupted update owns ${LOCK}. Inspect its recovery.txt before proceeding.`);
  if (!isSourceRepo(root)) throw new Error('Source mode requires an Opchain Git source checkout with its canonical sync scripts.');
  const telemetry = await telemetryHealth(root);
  const source = treeFiles(root, 'skills');
  const scripts = treeFiles(root, 'scripts');
  const originalPlugin = treeFiles(root, 'plugins/opchain/skills');
  const originalPluginRuntime = treeFiles(root, 'plugins/opchain/scripts');
  const originalPluginSrc = treeFiles(root, 'plugins/opchain/src');
  const runtimeManifest = JSON.parse(read(root, 'scripts/runtime-manifest.json').bytes);
  const support = new Map();
  for (const path of runtimeManifest.files.filter(path => !path.startsWith('scripts/'))) {
    if (path !== 'package.json' && !/^src\/[a-zA-Z0-9_./-]+$/.test(path)) throw new Error(`Invalid runtime source: ${path}`);
    const value = read(root, path);
    if (!value) throw new Error(`Missing runtime source: ${path}`);
    support.set(path, value);
  }
  const ids = [...source.keys()].filter(path => /^skills\/oc-[a-z0-9-]+\/SKILL.md$/.test(path)).map(path => path.split('/')[1]);
  const versions = new Set();
  for (const id of ids) {
    const text = source.get(`skills/${id}/SKILL.md`).bytes.toString();
    const version = /^version:\s*(\d+\.\d+\.\d+)\s*$/m.exec(text)?.[1];
    if (!version || !text.includes(`\nname: ${id}\n`)) throw new Error(`Invalid source skill: ${id}`);
    versions.add(version);
  }
  if (!ids.length || versions.size !== 1) throw new Error('Source skills must have one consistent release version.');
  const stage = mkdtempSync(join(tmpdir(), 'opchain-source-update-'));
  try {
    for (const [path, value] of [...source, ...scripts, ...support]) replace(stage, path, value);
    // Run this checkout's own generators against a staged copy, including all
    // helper sources. Never run destructive mirror generation in the live repo.
    const env = { ...process.env };
    for (const key of Object.keys(env)) if (key.startsWith('OPCHAIN_') || ['GIT_DIR', 'GIT_WORK_TREE', 'GIT_INDEX_FILE'].includes(key)) delete env[key];
    for (const script of ['sync-skill-bundles.mjs', 'sync-plugin-skills.mjs']) {
      try {
        execFileSync(process.execPath, [join(stage, 'scripts', script)], {
          cwd: stage, env, encoding: 'utf8', timeout: 30000, maxBuffer: 16 * 1024 * 1024,
          stdio: ['ignore', 'pipe', 'pipe'],
        });
      } catch (error) {
        throw new Error(`Source generator ${script} failed before installation: ${error.stderr || error.message}`);
      }
    }
    const generated = treeFiles(stage, 'skills');
    for (const [path, value] of source) {
      if (sameEntry(value, generated.get(path))) continue;
      if (!/^skills\/oc-[a-z0-9-]+\/(references\/(orchestrator|checkpoint-protocol|runtime-contract)\.md|scripts\/(?:[^/]+\.mjs|runtime\/[a-zA-Z0-9_./-]+))$/.test(path)) {
        throw new Error(`Generator tried to modify authored source: ${path}`);
      }
    }
    for (const path of generated.keys()) {
      if (!source.has(path) && !/^skills\/oc-[a-z0-9-]+\/(references\/(orchestrator|checkpoint-protocol|runtime-contract)\.md|scripts\/(?:[^/]+\.mjs|runtime\/[a-zA-Z0-9_./-]+))$/.test(path)) {
        throw new Error(`Unexpected generated source file: ${path}`);
      }
    }
    const plugin = treeFiles(stage, 'plugins/opchain/skills');
    if (plugin.size !== generated.size || [...generated].some(([path, value]) => !sameEntry(value, plugin.get(`plugins/opchain/${path}`)))) {
      throw new Error('Generated plugin mirror does not match the staged skills.');
    }
    // sync-plugin-skills also mirrors src/lib/mcp/checkpoint-contract.js (the --ci evidence gate's dependency).
    const pluginRuntime = new Map([...treeFiles(stage, 'plugins/opchain/scripts'), ...treeFiles(stage, 'plugins/opchain/src')]);
    const desired = new Map([...generated, ...plugin, ...pluginRuntime]);
    for (const path of source.keys()) if (!generated.has(path)) desired.set(path, null);
    for (const path of originalPlugin.keys()) if (!plugin.has(path)) desired.set(path, null);
    for (const id of [...ids, ...['README.md', 'orchestrator.md'].filter(name => source.has(`skills/${name}`))]) {
      desired.set(`.claude/skills/${id}`, { link: `../../skills/${id}`, mode: 0o777 });
    }
    // Inspect all existing entries too, including obsolete links. Keep unrelated
    // entries; never follow or replace a link to outside the canonical tree.
    if (inspect(root, '.claude/skills')) {
      for (const name of readdirSync(join(root, '.claude/skills'))) {
        if (/^oc-[a-z0-9-]+$/.test(name)) readEntry(root, `.claude/skills/${name}`);
      }
    }
    if ([...desired].some(([path, after]) => !sameEntry(readEntry(root, path), after))) {
      const ignored = read(root, '.gitignore');
      const text = ignored?.bytes.toString() ?? '';
      const rules = [`/${BACKUPS}/`, `/${LOCK}/`].filter(rule => !text.split(/\r?\n/).includes(rule));
      if (rules.length) desired.set('.gitignore', { bytes: Buffer.from(text + (text && !text.endsWith('\n') ? '\n' : '') + '\n# Opchain source-update recovery\n' + rules.join('\n') + '\n'), mode: ignored?.mode ?? 0o644 });
    }
    const result = applyChanges(root, desired, { check, beforeWrite, guard: () => {
      assertSnapshot(root, 'skills', source);
      assertSnapshot(root, 'scripts', scripts);
      for (const [path, value] of support) {
        if (!sameEntry(read(root, path), value)) throw new Error(`Source changed while preparing update: ${path}`);
      }
      assertSnapshot(root, 'plugins/opchain/skills', originalPlugin);
      assertSnapshot(root, 'plugins/opchain/scripts', originalPluginRuntime);
      assertSnapshot(root, 'plugins/opchain/src', originalPluginSrc);
    } });
    return { ...result, mode: 'source', version: [...versions][0], skills: ids.length,
      targets: ['skills/', 'plugins/opchain/skills/', '.claude/skills/'], telemetry, retained: [] };
  } finally { rmSync(stage, { recursive: true, force: true }); }
}

// ---------------------------------------------------------------------------
// Components. Without the Claude Code CLI, /oc-update ships skill files and
// nothing else. The 2026-10-08 effectiveness audit (I-11) found a session asked
// to "update opchain" that could not be served because hooks and the time CLI
// live elsewhere, so the agent improvised a global-settings side-install. Say
// what this command can and cannot ship on this host before doing anything:
// with the CLI it also keeps this repository's project/local-scope plugins
// current (design §5.5).
// ---------------------------------------------------------------------------
export const COMPONENTS = Object.freeze([
  { id: 'skills', label: 'skills', shippedBy: 'update', how: '/oc-update' },
  { id: 'plugin-hooks', label: 'plugin hooks', shippedBy: 'plugin', how: '/plugin marketplace update opchain' },
  { id: 'commit-gate-runtime', label: 'commit-gate runtime', shippedBy: 'plugin', how: '/plugin marketplace update opchain' },
  { id: 'time-cli', label: 'time CLI', shippedBy: 'checkout', how: 'git pull in ~/repos/opchain-time' },
]);

export function componentsBanner({ cli = false } = {}) {
  if (cli) {
    const ships = COMPONENTS.filter(c => c.shippedBy !== 'checkout').map(c => c.label).join(', ');
    const cannot = ['user-scope plugins (use /plugin update)', ...COMPONENTS.filter(c => c.shippedBy === 'checkout').map(c => `${c.label} (use ${c.how})`)];
    return `This command ships: ${ships} (project-scope plugins). Cannot update: ${cannot.join(', ')}.`;
  }
  const ships = COMPONENTS.filter(c => c.shippedBy === 'update').map(c => c.label).join(', ');
  const byHow = new Map();
  for (const c of COMPONENTS.filter(c => c.shippedBy !== 'update')) byHow.set(c.how, [...(byHow.get(c.how) ?? []), c.label]);
  const cannot = [...byHow].map(([how, labels]) => `${labels.join(' + ')} (use ${how})`).join(', ');
  return `This command ships: ${ships}. Cannot update: ${cannot}.`;
}

function git(cwd, args, { timeout = 10000 } = {}) {
  try {
    return execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], timeout }).replace(/\n$/, '');
  } catch { return null; }
}

// Files under the install targets that git sees as modified or untracked. An
// install that is written but never committed runs the OLD version in every
// other checkout and in the next session on a different branch (get-ripped ran
// 1.8.2 against a 2.0.0 install for weeks; see memory note 2026-09-18).
export function uncommittedInstall(root, targets = TARGETS) {
  const present = targets.filter(target => existsSync(join(root, target)));
  if (!present.length || git(root, ['rev-parse', '--is-inside-work-tree']) !== 'true') return [];
  const status = git(root, ['status', '--porcelain', '--untracked-files=all', '--', ...present]);
  return status ? status.split('\n').filter(Boolean) : [];
}

function skillVersion(text) {
  const head = text.startsWith('---\n') ? text.slice(4, text.indexOf('\n---', 4) + 1) : '';
  return /^version:\s*(\d+\.\d+\.\d+)\s*$/m.exec(head || text)?.[1] ?? null;
}

function readSkillDir(dir) {
  // Returns [{ id, version, kind }] for every oc-* entry holding a SKILL.md.
  let names;
  try { names = readdirSync(dir); } catch { return []; }
  const skills = [];
  for (const name of names.sort()) {
    if (!/^oc-[a-z0-9-]+$/.test(name)) continue;
    const path = join(dir, name);
    let kind = 'dir';
    try {
      const stat = lstatSync(path);
      if (stat.isSymbolicLink()) {
        kind = 'symlink';
        try { realpathSync(path); } catch { kind = 'broken-symlink'; }
      } else if (!stat.isDirectory()) continue;
    } catch { continue; }
    let version = null;
    try { version = skillVersion(readFileSync(join(path, 'SKILL.md'), 'utf8')); } catch { if (kind !== 'broken-symlink') continue; }
    skills.push({ id: name, version, kind });
  }
  return skills;
}

function summarizeSurface(surface) {
  const versions = [...new Set(surface.skills.map(s => s.version ?? 'unknown'))].sort();
  const kinds = [...new Set(surface.skills.map(s => s.kind))].sort();
  return { ...surface, count: surface.skills.length, versions, kinds };
}

// ---------------------------------------------------------------------------
// Plugin discovery (docs/plans/2026-10-16-oc-update-plugins-design.md §5.1).
// Claude Code owns plugin state; this only reads it. An entry in
// installed_plugins.json loads in this repository when it is user-scoped, or
// project/local-scoped with projectPath naming this repository: the same file
// holds every other repository's project installs too.
// ---------------------------------------------------------------------------
export const KNOWN_PLUGINS = Object.freeze([
  Object.freeze({ id: 'opchain@opchain', marketplace: 'opchain', source: Object.freeze({ source: 'github', repo: 'asfbay-bit/opchain-skills' }), skills: true }),
  Object.freeze({ id: 'ow-tools@opchain-work-tools', marketplace: 'opchain-work-tools', source: Object.freeze({ source: 'url', url: 'https://raw.githubusercontent.com/asfbay-bit/opchain-skills/main/plugins/ow-tools/.claude-plugin/marketplace.json' }), skills: false }),
]);
const SCOPE_RANK = { local: 0, project: 1, user: 2 };

export function claudeConfigDir(env = process.env) {
  return env.CLAUDE_CONFIG_DIR || join(env.HOME || homedir(), '.claude');
}

function readJson(path) {
  try { return JSON.parse(readFileSync(path, 'utf8')); } catch { return null; }
}

function realpathOrNull(path) {
  try { return realpathSync(path); } catch { return null; }
}

function sameSource(actual, expected) {
  if (!actual || typeof actual !== 'object' || Array.isArray(actual)) return false;
  const keys = Object.keys(actual);
  return keys.length === Object.keys(expected).length && keys.every(key => actual[key] === expected[key]);
}

// Every installed_plugins.json entry for `id`, normalised. Schema version 2 keeps
// an array of { scope, version, installPath, projectPath } per id; the older
// shape kept one object and had no scopes, so it reads as a user install.
export function installedPluginEntries(configDir, id) {
  const raw = readJson(join(configDir, 'plugins/installed_plugins.json'))?.plugins?.[id];
  if (!raw || typeof raw !== 'object') return [];
  return (Array.isArray(raw) ? raw : [raw]).filter(entry => entry && typeof entry === 'object').map(entry => ({
    scope: typeof entry.scope === 'string' ? entry.scope : 'user',
    version: typeof entry.version === 'string' ? entry.version : null,
    installPath: typeof entry.installPath === 'string' ? entry.installPath : null,
    projectPath: typeof entry.projectPath === 'string' ? entry.projectPath : null,
  }));
}

// One row per known plugin: { id, marketplace, sourceOk, enabledHere, enabledIn,
// scope, installedVersion, installPath, entries }. Local scope is treated like
// project (design §7 decision 4). `entries` lists every install that loads here,
// most specific first; the scalar fields describe the first of them.
export function pluginState(root = projectRoot(), { configDir = claudeConfigDir() } = {}) {
  const rootReal = realpathOrNull(root) ?? resolve(root);
  const settings = [['project', readJson(join(root, '.claude/settings.json'))], ['local', readJson(join(root, '.claude/settings.local.json'))]];
  return KNOWN_PLUGINS.map(plugin => {
    const sources = settings.map(([, data]) => data?.extraKnownMarketplaces?.[plugin.marketplace]).filter(Boolean);
    const enabledIn = settings.filter(([, data]) => data?.enabledPlugins?.[plugin.id] === true).map(([scope]) => scope);
    const entries = installedPluginEntries(configDir, plugin.id)
      .filter(entry => entry.scope === 'user' || ((entry.scope === 'project' || entry.scope === 'local') && entry.projectPath && realpathOrNull(entry.projectPath) === rootReal))
      .sort((a, b) => (SCOPE_RANK[a.scope] ?? 3) - (SCOPE_RANK[b.scope] ?? 3));
    return {
      id: plugin.id,
      marketplace: plugin.marketplace,
      sourceOk: sources.length > 0 && sources.every(entry => sameSource(entry?.source, plugin.source)),
      enabledHere: enabledIn.length > 0,
      enabledIn,
      scope: entries[0]?.scope ?? null,
      installedVersion: entries[0]?.version ?? null,
      installPath: entries[0]?.installPath ?? null,
      entries,
    };
  });
}

// ---------------------------------------------------------------------------
// Plugin step (design §5.2). Runs after the skill transaction commits, so a
// plugin failure never rolls skills back; main() reports it with its own exit
// bit. Claude Code does the work: a fixed argv, no shell, and the repository as
// cwd so project/local scope resolve to it. Nothing here writes settings,
// installed_plugins.json or the plugin cache. --check makes no CLI call at all:
// `marketplace update` rewrites the marketplace cache.
// ---------------------------------------------------------------------------
const PLUGIN_TIMEOUT_MS = 120_000;

// The CLI's absolute path, or null. Only absolute PATH entries count: a
// relative one ('.', '') would resolve inside the repository being updated.
export function findClaudeCli(env = process.env) {
  const name = process.platform === 'win32' ? 'claude.exe' : 'claude';
  for (const dir of (env.PATH ?? '').split(delimiter).filter(dir => isAbsolute(dir))) {
    const path = join(dir, name);
    try {
      if (!statSync(path).isFile()) continue;
      accessSync(path, constants.X_OK);
      return path;
    } catch { /* not here */ }
  }
  return null;
}

function runClaude(cli, argv, root) {
  execFileSync(cli, argv, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: PLUGIN_TIMEOUT_MS, maxBuffer: 4 * 1024 * 1024 });
}

function cliError(error) {
  const text = `${error.stderr ?? ''}\n${error.stdout ?? ''}`.trim() || error.message;
  return text.split('\n').map(line => line.trim()).filter(Boolean).slice(0, 2).join(' ');
}

const scopeLabel = scope => scope === 'local' ? 'local, not shared with the repo' : scope;

// Returns { lines, failed, changed, calls }. `releaseVersion` is the release
// already fetched for skills (consumer mode); opchain ships in lockstep with it,
// so --check can compare without the CLI. ow-tools has its own version.
export function updatePlugins({ root = projectRoot(), check = false, releaseVersion = null, cli = findClaudeCli(), configDir = claudeConfigDir(), run = runClaude } = {}) {
  const lines = [];
  const notes = [];
  const targets = [];
  const before = pluginState(root, { configDir });
  for (const row of before) {
    const known = KNOWN_PLUGINS.find(plugin => plugin.id === row.id);
    const user = row.entries.find(entry => entry.scope === 'user');
    if (user && known.skills && releaseVersion && user.version !== releaseVersion) {
      notes.push(`  ${row.id} (user): ${user.version ?? 'unknown version'} — user scope belongs to your whole machine; /oc-update leaves it alone. Run /plugin update ${row.id} in Claude Code.`);
    }
    if (!row.enabledHere) continue;
    if (!row.sourceOk) {
      notes.push(`  ${row.id}: skipped — the "${row.marketplace}" marketplace source in .claude/settings*.json is not the known Opchain source.`);
      continue;
    }
    for (const scope of row.enabledIn) {
      const entry = row.entries.find(e => e.scope === scope);
      if (entry) targets.push({ row, known, scope, entry });
      else notes.push(`  ${row.id} (${scopeLabel(scope)}): enabled but not installed for you; skipped. Run /plugin install ${row.id} --scope ${scope} in Claude Code.`);
    }
  }
  const result = { lines, failed: false, changed: false, calls: 0 };
  if (!targets.length && !notes.length) {
    lines.push('Plugins: none enabled for this repository.');
    return result;
  }
  lines.push('Plugins:');
  if (check) {
    for (const { row, known, scope, entry } of targets) {
      const installed = entry.version ?? 'unknown';
      const state = known.skills && releaseVersion
        ? (installed === releaseVersion ? `already current (${installed})` : `installed ${installed}, available ${releaseVersion}`)
        : `installed ${installed}; run /oc-update to compare`;
      lines.push(`  ${row.id} (${scopeLabel(scope)}): ${state}`);
    }
    lines.push(...notes);
    return result;
  }
  if (targets.length && !cli) {
    const how = [...new Map(targets.map(({ row }) => [row.id, `\`/plugin marketplace update ${row.marketplace}\` and \`/plugin update ${row.id}\``])).values()].join(', then ');
    lines.push(`  plugins: skipped (Claude Code CLI not found). In Claude Code run ${how}.`, ...notes);
    return result;
  }
  const outcome = new Map();
  const marketplaceFailed = new Map();
  for (const marketplace of new Set(targets.map(({ row }) => row.marketplace))) {
    result.calls++;
    try { run(cli, ['plugin', 'marketplace', 'update', marketplace], root); }
    catch (error) { marketplaceFailed.set(marketplace, cliError(error)); }
  }
  for (const target of targets) {
    const { row, scope } = target;
    if (marketplaceFailed.has(row.marketplace)) {
      outcome.set(target, `FAILED — marketplace update: ${marketplaceFailed.get(row.marketplace)}`);
      continue;
    }
    result.calls++;
    try { run(cli, ['plugin', 'update', row.id, '--scope', scope], root); }
    catch (error) { outcome.set(target, `FAILED — ${cliError(error)}`); }
  }
  const after = pluginState(root, { configDir });
  for (const target of targets) {
    const { row, scope, entry } = target;
    let state = outcome.get(target);
    if (state) result.failed = true;
    else {
      const now = after.find(r => r.id === row.id)?.entries.find(e => e.scope === scope)?.version ?? null;
      if (now && now === entry.version) state = `already current (${now})`;
      else {
        state = `${entry.version ?? 'unknown'} → ${now ?? 'unknown'}`;
        result.changed = true;
      }
    }
    lines.push(`  ${row.id} (${scopeLabel(scope)}): ${state}`);
  }
  lines.push(...notes);
  if (result.changed) lines.push('Restart Claude Code to load the new hooks.');
  if (result.failed) lines.push('Plugin update failed; skills are unaffected. Run /plugin update <id> in Claude Code to see the full error.');
  return result;
}

// ---------------------------------------------------------------------------
// --with-plugins (design §5.3). Adds first-party plugins at project scope via
// the CLI: `marketplace add <known source> --scope project`, then
// `install <id> --scope project`. Both are idempotent in Claude Code, and the
// CLI writes .claude/settings.json; this code never does. A bare flag means
// opchain only: ow-tools runs code on the machine, so it is added only when
// named (§7 decision 2).
// ---------------------------------------------------------------------------
export const PLUGIN_NAMES = Object.freeze(Object.fromEntries(KNOWN_PLUGINS.map(plugin => [plugin.id.split('@')[0], plugin.id])));

export function parseWithPlugins(value) {
  const names = value === true ? ['opchain'] : value.split(',').map(name => name.trim());
  const ids = [];
  for (const name of names) {
    const id = PLUGIN_NAMES[name] ?? (Object.values(PLUGIN_NAMES).includes(name) ? name : null);
    if (!id) throw new Error(`Unknown plugin "${name}" for --with-plugins. Known: ${Object.keys(PLUGIN_NAMES).join(', ')}. No files changed.`);
    if (!ids.includes(id)) ids.push(id);
  }
  return ids;
}

const sourceArg = plugin => plugin.source.source === 'github' ? plugin.source.repo : plugin.source.url;

// True when the opchain plugin is enabled for this repository from the known
// source and installed for this user: then .claude/skills copies are duplicates.
export function opchainLoadsHere(root, configDir = claudeConfigDir()) {
  const row = pluginState(root, { configDir }).find(r => r.id === KNOWN_PLUGINS[0].id);
  return row.enabledHere && row.sourceOk && row.entries.length > 0;
}

export function installPlugins({ root = projectRoot(), ids, cli = findClaudeCli(), configDir = claudeConfigDir(), run = runClaude } = {}) {
  const result = { lines: ['Adding plugins (project scope):'], failed: false, installed: [], calls: 0 };
  const before = pluginState(root, { configDir });
  const todo = [];
  for (const id of ids) {
    const row = before.find(r => r.id === id);
    if (row.enabledHere && row.sourceOk) result.lines.push(`  ${id}: already enabled for this repository; the update step keeps it current.`);
    else if (row.enabledHere) result.lines.push(`  ${id}: enabled from a marketplace source that is not the known Opchain one; not changed.`);
    else todo.push(KNOWN_PLUGINS.find(plugin => plugin.id === id));
  }
  if (todo.length && !cli) {
    const how = todo.map(plugin => `\`/plugin marketplace add ${sourceArg(plugin)}\` and \`/plugin install ${plugin.id}\``).join(', then ');
    result.lines.push(`  plugins: not added (Claude Code CLI not found). In Claude Code run ${how}, choosing project scope.`);
    return result;
  }
  for (const plugin of todo) {
    let failure = null;
    for (const argv of [['plugin', 'marketplace', 'add', sourceArg(plugin), '--scope', 'project'], ['plugin', 'install', plugin.id, '--scope', 'project']]) {
      result.calls++;
      try { run(cli, argv, root); }
      catch (error) { failure = `${argv[1] === 'marketplace' ? 'marketplace add: ' : ''}${cliError(error)}`; break; }
    }
    if (failure) {
      result.failed = true;
      result.lines.push(`  ${plugin.id}: FAILED — ${failure}`);
      continue;
    }
    const version = pluginState(root, { configDir }).find(r => r.id === plugin.id).entries.find(e => e.scope === 'project')?.version ?? 'unknown version';
    result.installed.push(plugin.id);
    result.lines.push(`  ${plugin.id}: installed ${version} — enabled for you, NOT yet for the repo — commit .claude/settings.json`);
  }
  if (result.installed.length) result.lines.push('Restart Claude Code to load the new hooks.');
  if (result.failed) result.lines.push('Plugin install failed; skills are unaffected. Run /plugin install <id> in Claude Code to see the full error.');
  return result;
}

export function duplicateWarning(root, copies = localSkillCopies(root)) {
  const skills = new Set(copies.map(path => path.split('/')[2]));
  return `duplicate: opchain@opchain is enabled for this repository and .claude/skills holds ${skills.size} receipt-managed oc-* skills, so Claude Code loads them twice. Pick one: plugin only — re-run with --drop-local-skills (backs up and removes the local copies); local only — remove "opchain@opchain" from enabledPlugins in .claude/settings.json.`;
}

function worktreeEntries(root) {
  const raw = git(root, ['worktree', 'list', '--porcelain']);
  if (!raw) return [];
  const entries = [];
  let current = null;
  for (const line of raw.split('\n')) {
    if (line.startsWith('worktree ')) { current = { path: line.slice(9), branch: null, head: null }; entries.push(current); }
    else if (current && line.startsWith('HEAD ')) current.head = line.slice(5, 12);
    else if (current && line.startsWith('branch ')) current.branch = line.slice(7).replace(/^refs\/heads\//, '');
    else if (current && line === 'detached') current.branch = '(detached)';
  }
  return entries;
}

function behindOriginMain(dir) {
  const count = git(dir, ['rev-list', '--count', 'HEAD..origin/main']);
  return count === null ? null : Number(count);
}

// Enumerate every place a Claude Code / Codex session may load oc-* skills from
// and say which ones disagree. Exit 0 always: this is a report, not a gate.
export function doctor({ root = projectRoot(), configDir = claudeConfigDir(), cli = Boolean(findClaudeCli()) } = {}) {
  root = resolve(root);
  const report = { root, configDir, cli, surfaces: [], plugins: [], worktrees: [], findings: [] };
  const loadable = [];
  const add = (surface) => { const s = summarizeSurface(surface); report.surfaces.push(s); if (s.loadable) loadable.push(s); return s; };

  add({ name: 'global', path: join(configDir, 'skills'), scope: 'global', loadable: true, skills: readSkillDir(join(configDir, 'skills')) });
  for (const target of TARGETS) add({ name: `repo-local ${target}`, path: join(root, target), scope: 'repo-local', loadable: true, skills: readSkillDir(join(root, target)) });
  report.plugins = pluginState(root, { configDir });
  for (const plugin of report.plugins.filter(p => KNOWN_PLUGINS.find(k => k.id === p.id).skills)) {
    // Only installs that load in this repository count; two scopes sharing one
    // cache directory are one surface.
    const seen = new Set();
    for (const entry of plugin.entries.filter(e => e.installPath)) {
      const dir = join(entry.installPath, 'skills');
      if (seen.has(dir)) continue;
      seen.add(dir);
      if (!existsSync(dir)) {
        report.findings.push({ level: 'warn', code: 'plugin-cache-missing', message: `installed_plugins.json lists ${plugin.id} ${entry.version} (${entry.scope}) at ${entry.installPath} but no skills/ directory is there` });
        continue;
      }
      add({ name: 'plugin cache', path: dir, scope: 'plugin', pluginId: plugin.id, pluginScope: entry.scope, loadable: true, installedVersion: entry.version, registered: true, skills: readSkillDir(dir) });
    }
  }

  const authoring = existsSync(join(root, 'skills/orchestrator.md')) && readSkillDir(join(root, 'skills')).length > 0;
  if (authoring) {
    for (const entry of worktreeEntries(root)) {
      const skills = readSkillDir(join(entry.path, 'skills'));
      const versions = [...new Set(skills.map(s => s.version ?? 'unknown'))].sort();
      const behind = entry.branch === 'main' ? behindOriginMain(entry.path) : null;
      report.worktrees.push({ ...entry, count: skills.length, versions, behind });
      if (behind > 0) report.findings.push({ level: 'warn', code: 'parked-checkout', message: `${entry.path} is on main but ${behind} commits behind origin/main (skills ${versions.join('/')})` });
    }
  }

  // Duplicates: the same skill id present on more than one loadable surface.
  const bySkill = new Map();
  for (const surface of loadable) for (const skill of surface.skills) bySkill.set(skill.id, [...(bySkill.get(skill.id) ?? []), surface]);
  const duplicated = [...bySkill].filter(([, surfaces]) => surfaces.length > 1);
  if (duplicated.length) {
    const names = [...new Set(duplicated.flatMap(([, s]) => s.map(x => `${x.name} (${x.count} @${x.versions.join('/')})`)))];
    // The plugin + repo-local pair is the one /oc-update can resolve itself (§5.4).
    const pluginAndLocal = duplicated.some(([, surfaces]) => surfaces.some(x => x.scope === 'plugin') && surfaces.some(x => x.name === `repo-local ${TARGETS[0]}`));
    const remedy = pluginAndLocal ? 'pick one: plugin only — /oc-update --drop-local-skills (backs up and removes the receipt-managed .claude/skills copies); local only — remove "opchain@opchain" from enabledPlugins in .claude/settings.json' : null;
    report.findings.push({ level: 'warn', code: 'duplicate-surfaces', skills: duplicated.map(([id]) => id), remedy, message: `duplicate surfaces: ${duplicated.length} skills load from more than one place — ${names.join(' + ')}${remedy ? `; ${remedy}` : ''}` });
  }
  const populated = loadable.filter(s => s.count);
  const allVersions = [...new Set(populated.flatMap(s => s.versions))].sort();
  if (allVersions.length > 1) report.findings.push({ level: 'warn', code: 'version-mismatch', versions: allVersions, message: `version mismatch across surfaces: ${populated.map(s => `${s.name} @${s.versions.join('/')}`).join(', ')}` });
  for (const surface of populated.filter(s => s.versions.length > 1)) report.findings.push({ level: 'warn', code: 'mixed-versions', message: `${surface.name} mixes versions ${surface.versions.join(', ')}` });
  for (const surface of populated.filter(s => s.scope === 'plugin' && s.installedVersion && s.versions.some(v => v !== s.installedVersion))) {
    report.findings.push({ level: 'warn', code: 'plugin-version-drift', message: `plugin cache skills are ${surface.versions.join('/')} but installed_plugins.json says ${surface.installedVersion}` });
  }
  const dirty = uncommittedInstall(root);
  if (dirty.length) report.findings.push({ level: 'warn', code: 'uncommitted-install', paths: dirty, message: `installed but NOT committed — ${dirty.length} path(s) under ${TARGETS.join('/')} are modified or untracked; commit them or the next session will run the old version` });
  if (git(root, ['rev-parse', '--abbrev-ref', 'HEAD']) === 'main') {
    const behind = behindOriginMain(root);
    if (behind > 0) report.findings.push({ level: 'warn', code: 'parked-checkout', message: `checkout ${behind} commits behind origin/main` });
  }
  report.ok = report.findings.length === 0;
  return report;
}

export function formatDoctor(report) {
  const lines = [`opchain doctor — ${report.root}`, componentsBanner({ cli: report.cli }), ''];
  const rows = [['surface', 'path', 'skills', 'version', 'notes']];
  for (const s of report.surfaces) {
    const notes = [];
    if (s.count && s.kinds.length) notes.push(s.kinds.join('+'));
    if (s.scope === 'plugin') notes.push(`${s.pluginScope} scope; installed_plugins.json ${s.installedVersion}`);
    rows.push([s.name, s.path, String(s.count), s.count ? s.versions.join('/') : '—', notes.join('; ')]);
  }
  for (const w of report.worktrees) {
    const notes = [w.branch ?? '', w.behind > 0 ? `${w.behind} behind origin/main` : ''].filter(Boolean).join('; ');
    rows.push(['worktree', w.path, String(w.count), w.count ? w.versions.join('/') : '—', notes]);
  }
  const widths = rows[0].map((_, i) => Math.max(...rows.map(r => r[i].length)));
  for (const row of rows) lines.push(row.map((cell, i) => cell.padEnd(widths[i])).join('  ').trimEnd());
  lines.push('');
  const plugins = [['plugin', 'installed here', 'enabled repo-wide', 'notes']];
  for (const p of report.plugins ?? []) {
    const notes = [p.sourceOk ? 'marketplace source ok' : 'marketplace source not set or unrecognised'];
    if (p.enabledIn.includes('local')) notes.push('enabled in settings.local.json (not shared)');
    plugins.push([p.id, p.installedVersion ? `${p.installedVersion} (${p.scope})` : 'no', p.enabledIn.includes('project') ? 'yes' : 'no', notes.join('; ')]);
  }
  const pluginWidths = plugins[0].map((_, i) => Math.max(...plugins.map(r => r[i].length)));
  for (const row of plugins) lines.push(row.map((cell, i) => cell.padEnd(pluginWidths[i])).join('  ').trimEnd());
  lines.push('');
  if (!report.findings.length) lines.push('OK: one version everywhere, nothing duplicated, install committed.');
  for (const f of report.findings) lines.push(`${f.level.toUpperCase()}: ${f.message}`);
  return lines.join('\n');
}

// Exit codes: 0 ok; 1 skills failed (no plugin step ran); 2 telemetry needs
// attention; 4 a plugin update failed after skills succeeded; 6 = 2 + 4.
export const EXIT_TELEMETRY = 2;
export const EXIT_PLUGINS = 4;

export async function main(args = process.argv.slice(2)) {
  if (args.includes('--help')) {
    console.log('opchain update [--check] [--source] [--target=claude|codex|both] [--root=/path/to/repo]\nopchain update --with-plugins[=opchain,ow-tools] [--drop-local-skills | --keep-both] [--root=/path/to/repo]\nopchain update --drop-local-skills [--root=/path/to/repo]\nopchain update plugins [--check] [--root=/path/to/repo]\nopchain update doctor [--json] [--root=/path/to/repo]\nSource checkouts sync from their current skills/ tree; consumer installs download releases. Preserves telemetry and checkpoints.\nAfter skills, the Claude Code CLI (when on PATH) updates the opchain/ow-tools plugins enabled for this repo at project or local scope; plugins runs only that step. Exit 4 means a plugin failed and skills are unaffected.\n--with-plugins adds plugins at project scope (bare: opchain only; ow-tools only when named). With receipt-managed .claude/skills copies it needs --drop-local-skills (plugin only: backs up and removes those copies) or --keep-both.\ndoctor lists every install surface (global, repo-local, plugin cache, worktrees) and the opchain/ow-tools plugins that load in this repo, with versions and flags duplicates, mismatches, uncommitted installs and parked checkouts.\n' + componentsBanner({ cli: Boolean(findClaudeCli()) }));
    return 0;
  }
  const options = {};
  for (const arg of args) {
    if (arg === '--check') options.check = true;
    else if (arg === '--source') options.source = true;
    else if (arg === 'doctor' || arg === '--doctor') options.doctor = true;
    else if (arg === 'plugins') options.plugins = true;
    else if (arg === '--json') options.json = true;
    else if (arg === '--with-plugins') options.withPlugins = parseWithPlugins(true);
    else if (arg.startsWith('--with-plugins=')) options.withPlugins = parseWithPlugins(arg.slice(15));
    else if (arg === '--drop-local-skills') options.dropLocal = true;
    else if (arg === '--keep-both') options.keepBoth = true;
    else if (arg.startsWith('--target=')) options.target = arg.slice(9);
    else if (arg.startsWith('--root=')) options.root = arg.slice(7);
    else throw new Error(`Unknown option: ${arg}`);
  }
  const [major, minor] = process.versions.node.split('.').map(Number);
  if (major < 22 || (major === 22 && minor < 13)) throw new Error('Opchain requires Node.js 22.13 or newer. No files changed.');
  const root = realpathSync(resolve(options.root ?? projectRoot()));
  if (options.doctor) {
    const report = doctor({ root });
    console.log(options.json ? JSON.stringify(report, null, 2) : formatDoctor(report));
    return 0;
  }
  if (options.json) throw new Error('--json is only valid with doctor');
  const cli = findClaudeCli();
  const surfaces = options.withPlugins || options.dropLocal || options.keepBoth;
  if (options.plugins) {
    if (options.source || options.target || surfaces) throw new Error('plugins takes only --check and --root.');
    return reportPlugins(updatePlugins({ root, check: options.check, cli }));
  }
  const sourceMode = options.source || isSourceRepo(root);
  if (sourceMode && options.target) throw new Error('Source mode maintains the checkout links; --target is only for consumer installs.');
  let exclude = surfaces ? choosePluginSurface(root, options, sourceMode) : [];
  // Plugin-only repository: the fresh-install default must not re-create the
  // .claude/skills copies that --drop-local-skills removed.
  if (!sourceMode && !options.target && !exclude.length && opchainLoadsHere(root) && !localSkillCopies(root).length) exclude = [TARGETS[0]];
  if (!sourceMode) console.log(componentsBanner({ cli: Boolean(cli) }));
  console.log(sourceMode ? 'Checking Opchain against this source checkout…' : 'Checking the latest Opchain release…');
  const result = sourceMode ? await syncSourceRepo({ ...options, root }) : await installBundle(await downloadRelease(), { ...options, exclude });
  if (!result.targets.length) {
    console.log(`opchain ${result.version}: no repo-local skills to update here; the opchain plugin provides them in Claude Code. Telemetry: ${result.telemetry.message}.`);
    if (!result.telemetry.healthy) console.error('Skills are not installed locally; telemetry needs attention. Restore the local database or run /oc-telemetry status to investigate. Consent was preserved.');
  } else if (!result.changed) {
    // No-op runs used to pay the full welcome text; six of six /oc-update runs
    // in the audit corpus changed nothing. One line for skills, then plugins.
    console.log(`opchain ${result.version} is already current on ${result.targets.join(', ')}. Telemetry: ${result.telemetry.message}.`);
    if (!result.telemetry.healthy) console.error(`${options.check ? 'Check completed without installing' : 'Skills are current'}; telemetry needs attention. Restore the local database or run /oc-telemetry status to investigate. Consent was preserved.`);
    if (!sourceMode && !options.check) warnUncommitted(root, result.targets);
  } else {
    console.log(`Opchain ${result.version}: ${options.check ? `${result.changed} files would change` : `${result.changed} files updated and verified`}.`);
    console.log(`Skills: ${result.targets.join(', ')}\nTelemetry: ${result.telemetry.message}.`);
    if (sourceMode) console.log(`${options.check ? 'Source check completed without installing' : 'Source checkout synchronized'}; Git branch and authored skill definitions retained. No release download.`);
    if (result.backup) console.log(`Previous files: ${result.backup}`);
    if (result.retained.length) console.log(`Kept ${result.retained.length} customized obsolete files.`);
    if (!result.telemetry.healthy) console.error(`${options.check ? 'Check completed without installing' : 'Skills are ready'}; telemetry needs attention. Restore the local database or run /oc-telemetry status to investigate. Consent was preserved.`);
    if (!options.check) console.log('Start a new agent session if the updated skills do not appear.');
    if (!sourceMode && !options.check) warnUncommitted(root, result.targets);
  }
  // Skills are committed (or were only checked) by now; nothing below can roll them back.
  // A source checkout's tree version is not what the public plugin mirror serves, so only
  // a downloaded release gives --check a lockstep version to compare against.
  let code = (result.telemetry.healthy ? 0 : EXIT_TELEMETRY) | reportPlugins(updatePlugins({ root, check: options.check, releaseVersion: sourceMode ? null : result.version, cli }));
  if (options.withPlugins) code |= reportPlugins(installPlugins({ root, ids: options.withPlugins, cli }));
  if (options.dropLocal) {
    // Only once the plugin really loads here: a failed or skipped install must
    // never leave the repository with no Claude Code surface at all.
    if (opchainLoadsHere(root)) {
      const dropped = dropLocalSkills({ root });
      console.log(`Local skills: removed ${dropped.removed.length} receipt-managed files from .claude/skills; the opchain plugin provides these skills now.${dropped.backup ? ` Previous files: ${dropped.backup}` : ''}`);
      if (dropped.retained.length) console.log(`Kept ${dropped.retained.length} customized files in .claude/skills (no longer receipt-managed): ${dropped.retained.join(', ')}`);
      if (dropped.removed.length) warnUncommitted(root, [TARGETS[0]]);
    } else console.log('Local skills: kept — the opchain plugin is not enabled and installed for this repository, so .claude/skills was not removed.');
  } else if (!options.check && opchainLoadsHere(root) && localSkillCopies(root).length) console.warn(duplicateWarning(root));
  return code;
}

// Validates --with-plugins / --drop-local-skills / --keep-both before anything
// changes, and returns the install targets this run must not write (§5.3, §5.4).
function choosePluginSurface(root, options, sourceMode) {
  const fail = message => { throw new Error(`${message} No files changed.`); };
  if (options.check) fail('--with-plugins, --drop-local-skills and --keep-both change this repository; run them without --check.');
  if (sourceMode) fail('This is an Opchain source checkout: it loads skills from its own tree. Add plugins with /plugin in Claude Code.');
  if (options.target) fail('--target cannot be combined with --with-plugins, --drop-local-skills or --keep-both.');
  if (options.dropLocal && options.keepBoth) fail('Choose one of --drop-local-skills and --keep-both.');
  const opchain = KNOWN_PLUGINS[0].id;
  const row = pluginState(root).find(r => r.id === opchain);
  const adding = options.withPlugins?.includes(opchain) && !(row.enabledHere && row.sourceOk);
  if (options.withPlugins && !targetsFor(root).includes(TARGETS[0])) {
    fail('Refusing --with-plugins: this repository\'s Opchain install is Codex-only (.agents/skills). Plugins are a Claude Code feature and Codex has no plugin system. Install for Claude Code first (--target=claude), or add the plugin with /plugin in Claude Code.');
  }
  const copies = localSkillCopies(root);
  if (adding && copies.length && !options.dropLocal && !options.keepBoth) {
    fail(`Refusing --with-plugins: .claude/skills holds ${new Set(copies.map(path => path.split('/')[2])).size} receipt-managed oc-* skills, and the opchain plugin would load the same skills a second time. Re-run with --drop-local-skills (plugin only: backs up and removes those copies) or --keep-both.`);
  }
  if (options.dropLocal && !adding && !opchainLoadsHere(root)) {
    fail('--drop-local-skills removes the .claude/skills copies only when the opchain plugin replaces them. Add it in the same run with --with-plugins --drop-local-skills.');
  }
  // Never write a .claude/skills copy the plugin duplicates, unless --keep-both keeps an existing one.
  return options.dropLocal || (adding && !(options.keepBoth && copies.length)) ? [TARGETS[0]] : [];
}

function reportPlugins(plugins) {
  for (const line of plugins.lines) (line.includes('FAILED') || line.startsWith('Plugin update failed') ? console.error : console.log)(line);
  return plugins.failed ? EXIT_PLUGINS : 0;
}

function warnUncommitted(root, targets) {
  const dirty = uncommittedInstall(root, targets);
  if (!dirty.length) return;
  let dirs = [...new Set(dirty.map(line => line.slice(3).split('/').slice(0, 2).join('/')))].filter(d => TARGETS.includes(d));
  if (!dirs.length) dirs = targets;
  const where = dirs.length > 1 ? `${dirs[0]} (and ${dirs.slice(1).join(', ')})` : dirs[0];
  console.warn(`installed but NOT committed — commit ${where} or the next session will run the old version (${dirty.length} path(s) modified or untracked).`);
}

if (process.argv[1] && existsSync(process.argv[1]) && import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href) {
  main().then(code => { process.exitCode = code; }).catch(error => { console.error(error.message); process.exitCode = 1; });
}
