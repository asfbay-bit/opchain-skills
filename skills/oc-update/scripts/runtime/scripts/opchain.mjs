#!/usr/bin/env node
// Shared product command surface. Feature modules own behavior; hosts own presentation.
import { readFileSync, realpathSync, existsSync } from 'node:fs';
import { dirname, resolve, isAbsolute, relative, sep } from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { handleLearning } from './runtime/learning.mjs';
import { main as update, recoverUpdate } from './update-opchain.mjs';
const runtimeDir = dirname(fileURLToPath(import.meta.url));
export function consumerRoot() {
  if (process.env.OPCHAIN_ROOT) return realpathSync(resolve(process.env.OPCHAIN_ROOT));
  try { return realpathSync(execFileSync('git', ['rev-parse', '--show-toplevel'], {encoding:'utf8',stdio:['ignore','pipe','ignore']} ).trim()); }
  catch { return realpathSync(process.cwd()); }
}
function trustedKeys(root) {
  const file = process.env.OPCHAIN_TRUSTED_KEYS;
  if (!file) return undefined;
  if (!isAbsolute(file)) throw new Error('OPCHAIN_TRUSTED_KEYS must be an absolute externally managed path');
  const actual = realpathSync(file), inside = relative(root, actual);
  if (inside === '' || (!inside.startsWith('..' + sep) && inside !== '..' && !isAbsolute(inside))) throw new Error('Trust policy must be outside the consuming repository');
  const keys = JSON.parse(readFileSync(actual, 'utf8'));
  if (!keys || typeof keys !== 'object' || Array.isArray(keys) || Object.values(keys).some(key => typeof key !== 'string')) throw new Error('Trust policy must map reviewer key IDs to public PEM keys');
  return keys;
}
export async function main(args = process.argv.slice(2)) {
  const root = consumerRoot();
  const [command = 'help', ...rest] = args;
  if (command === 'help' || command === '--help') {
    console.log('opchain: capabilities | update [--check] | recover <backup> [--check] | checkpoint <command> | telemetry <command> | learning <command> | evaluation run [options] | context [skill]');
    return 0;
  }
  if (command === 'capabilities') { console.log(readFileSync(resolve(runtimeDir,'runtime-manifest.json'),'utf8')); return 0; }
  if (command === 'update') return update(rest.some(arg => arg.startsWith('--root=')) ? rest : [...rest, `--root=${root}`]);
  if (command === 'recover') {
    if (rest.length < 1 || rest.length > 2 || (rest[1] && rest[1] !== '--check')) throw new Error('Usage: recover <recorded-backup> [--check]');
    console.log(JSON.stringify(recoverUpdate({root,backup:rest[0],check:rest[1]==='--check'}),null,2));return 0;
  }
  if (command === 'evaluation') {
    const { evaluationCommand } = await import('./runtime/evaluation.mjs');
    console.log(JSON.stringify(await evaluationCommand(rest, root), null, 2)); return 0;
  }
  if (command === 'checkpoint' || command === 'telemetry') {
    const result = spawnSync(process.execPath, [resolve(runtimeDir, `${command}.mjs`), ...rest], {stdio:'inherit',env:{...process.env,OPCHAIN_ROOT:root}});
    if (result.error) throw result.error;
    return result.status ?? 1;
  }
  if (command === 'learning') {
    console.log(JSON.stringify(await handleLearning(rest,{root,trustedKeys:trustedKeys(root)}),null,2));return 0;
  }
  if (command === 'context') {
    if (rest.length > 1) throw new Error('Usage: context [skill]');
    const keys = trustedKeys(root);
    const lessons = await handleLearning(['hindsight','query',...rest],{root,trustedKeys:keys});
    const rules = await handleLearning(['evolve','query',...rest],{root,trustedKeys:keys});
    console.log(JSON.stringify({kind:'advisory-data',instructions:false,lessons,rules},null,2));return 0;
  }
  throw new Error(`Unknown runtime command: ${command}`);
}
if (process.argv[1] && existsSync(process.argv[1]) && import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href) {
  main().then(code => {process.exitCode=code;}).catch(error => {console.error(error.message);process.exitCode=1;});
}
