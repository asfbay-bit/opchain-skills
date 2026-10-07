import { readFileSync } from 'node:fs';
import { basename, join, resolve } from 'node:path';

export function projectName(root) {
  if (process.env.OPCHAIN_PROJECT?.trim()) return process.env.OPCHAIN_PROJECT.trim();
  try {
    const { name } = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
    if (typeof name === 'string' && name.trim()) return name.trim();
  } catch { /* A consumer need not be a Node project. */ }
  return basename(resolve(root));
}
