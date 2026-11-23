// What the questionnaire's two scripts share: reading a repository through git, and the
// rule for which directories the map would guess are features.
//
// Read-only. Every git call here reads; none writes, fetches or pushes.
// Plain JavaScript with no dependencies: it needs only git and Node 18 or later.

import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// The world's own reader of the file, with its types stripped. Generated; see its first line.
import { parseDefinition } from './definition.mjs';

export const HERE = dirname(fileURLToPath(import.meta.url));

// Kept in step with DIRECTORIES in the world's GitHub transform. A test there holds them equal.
export const SOURCE_ROOTS = ['src', 'app', 'apps', 'packages', 'lib', 'services', 'server', 'client'];
export const EXCLUDED = [
  'node_modules', 'dist', 'build', 'public', 'assets', 'static', 'docs', 'test', 'tests',
  '__tests__', 'e2e', 'scripts', 'vendor', 'coverage', 'examples', 'fixtures',
  'constants', 'context', 'contexts', 'hooks', 'types', 'utils', 'util', 'helpers', 'output',
  'outputs', 'spikes', 'tmp', 'temp', 'styles', 'ci_scripts', 'ci-scripts',
];

export function usableDir(name) {
  if (name.startsWith('.')) return false;
  if (EXCLUDED.includes(name.toLowerCase())) return false;
  if (/\.(xcodeproj|xcworkspace|xcassets)$/i.test(name)) return false;
  if (/(^|[-_.])tests?$/i.test(name) || /[a-z0-9]Tests?$/.test(name)) return false;
  return true;
}

/**
 * The directories the map would take for features if nobody told it otherwise. `list(path)`
 * answers with the names of the directories inside `path` ('' is the top of the repository).
 * A conventional source root is opened and its directories stand for it; a root holding
 * exactly one directory is opened one level further.
 */
export function candidateDirectories(list) {
  const out = [];
  for (const name of list('')) {
    if (!usableDir(name)) continue;
    if (!SOURCE_ROOTS.includes(name)) {
      out.push(name);
      continue;
    }
    const children = list(name).filter(usableDir);
    if (children.length === 1) {
      const only = `${name}/${children[0]}`;
      const deeper = list(only).filter(usableDir);
      if (deeper.length > 1) for (const d of deeper) out.push(`${only}/${d}`);
      else out.push(only);
    } else if (children.length > 1) for (const child of children) out.push(`${name}/${child}`);
    else out.push(name);
  }
  return out;
}

// ───────────────────────── git ─────────────────────────

export function git(root, args) {
  const r = spawnSync('git', ['-C', root, ...args], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  return r.status === 0 ? r.stdout.trim() : null;
}

/** The top of the repository `dir` is in, or null when it is not in one. */
export function repoRoot(dir) {
  const top = git(resolve(dir), ['rev-parse', '--show-toplevel']);
  return top === null || top === '' ? null : top;
}

const lines = (text) => (text === null || text === '' ? [] : text.split('\n'));

/** Directories directly inside `path`, as committed. */
export function dirsIn(root, path) {
  const out = git(root, ['ls-tree', '-d', '--name-only', 'HEAD', path === '' ? './' : `${path}/`]);
  return lines(out).map((p) => p.split('/').pop());
}

/** How much history a path has: commits, and the days of the first and the last. */
export function historyOf(root, path) {
  const days = lines(git(root, ['log', '--format=%as', '--', path]));
  return { commits: days.length, first: days[days.length - 1] ?? null, last: days[0] ?? null };
}

/** `owner/name` from the origin remote, or null. */
export function originOf(root) {
  const url = git(root, ['remote', 'get-url', 'origin']);
  const m = url === null ? null : /[:/]([^/:]+)\/([^/]+?)(\.git)?$/.exec(url);
  return m ? { owner: m[1], name: m[2] } : null;
}

// ───────────────────────── the definition ─────────────────────────

export const DEFINITION_FILE = 'patrick-world.json';

/** The map's own words for regions and methods, as of when this skill was last synced. */
export function vocabulary() {
  return JSON.parse(readFileSync(join(HERE, '..', 'vocabulary.json'), 'utf8'));
}

/** `{ exists: false }`, or the file read with the world's own reader. */
export function readDefinition(root) {
  const path = join(root, DEFINITION_FILE);
  if (!existsSync(path)) return { exists: false };
  const parsed = parseDefinition(readFileSync(path, 'utf8'));
  return parsed.ok ? { exists: true, ok: true, definition: parsed.definition } : { exists: true, ok: false, errors: parsed.errors };
}

/** True when one path is the other or lies inside it. */
export const overlaps = (a, b) => a === b || a.startsWith(`${b}/`) || b.startsWith(`${a}/`);
