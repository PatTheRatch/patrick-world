// The questionnaire skill (skills/patrick-world-init/) is installed on its own, so it cannot
// import from src/. It carries copies of what it needs. These tests fail when a copy has
// fallen behind the world. The fix is always the same: `npm run sync:skill`.

import { describe, expect, it } from 'vitest';
import { nodeFs } from './understanding/testkit';
import { parseDefinition } from './world/definition';
import { catalogue } from './world/fixtures/catalogue';
import { DIRECTORIES, candidateDirectories } from './world/sources/github/transform';

const SKILL = 'skills/patrick-world-init';
const FIX = 'Run: npm run sync:skill';

interface SkillLib {
  SOURCE_ROOTS: string[];
  EXCLUDED: string[];
  candidateDirectories(list: (path: string) => string[]): string[];
}
/** The skill's own script, loaded as Node would load it. */
async function skillLib(): Promise<SkillLib> {
  const path = `../${SKILL}/scripts/lib.mjs`;
  return (await import(/* @vite-ignore */ path)) as SkillLib;
}

describe('the plugin’s copies of the world', () => {
  it('reads a definition with the world\u2019s own reader, made from the source as it stands', async () => {
    const fs = await nodeFs();
    const name = 'node:crypto';
    const { createHash } = (await import(/* @vite-ignore */ name)) as { createHash(a: string): { update(s: string): { digest(e: string): string } } };
    const hash = createHash('sha256').update(fs.readFileSync('src/world/definition.ts', 'utf8')).digest('hex');
    const firstLine = fs.readFileSync(`${SKILL}/scripts/definition.mjs`, 'utf8').split('\n')[0];
    expect(firstLine, FIX).toContain(`sha256 ${hash}`);
  });

  it('reads this repository\u2019s own definition as the world does', async () => {
    const fs = await nodeFs();
    const path = `../${SKILL}/scripts/definition.mjs`;
    const copy = (await import(/* @vite-ignore */ path)) as { parseDefinition: typeof parseDefinition };
    const text = fs.readFileSync('patrick-world.json', 'utf8');
    expect(copy.parseDefinition(text)).toEqual(parseDefinition(text));
    expect(copy.parseDefinition('{ "version": 2 }')).toEqual(parseDefinition('{ "version": 2 }'));
  });

  it('offers the regions and methods the map has', async () => {
    const fs = await nodeFs();
    const vocabulary = JSON.parse(fs.readFileSync(`${SKILL}/vocabulary.json`, 'utf8')) as unknown;
    expect(vocabulary, FIX).toEqual({
      regions: catalogue.regions.map((r) => ({ id: r.id, name: r.name, note: r.note })),
      methods: catalogue.methods.map((m) => ({ id: m.id, name: m.name, family: m.family })),
    });
  });

  it('guesses features from the directories the sync would', async () => {
    const lib = await skillLib();
    expect(lib.SOURCE_ROOTS).toEqual(DIRECTORIES.sourceRoots);
    expect(lib.EXCLUDED).toEqual(DIRECTORIES.excluded);

    // One tree, asked both ways: a top-level directory, two roots opened, a root with a
    // single package opened one level further, and names that are never features.
    const tree: Record<string, string[]> = {
      '': ['.github', 'apps', 'packages', 'src', 'infra', 'docs', 'node_modules', 'AppTests', 'lib'],
      apps: ['web', 'api', '__tests__'],
      packages: ['db'],
      'packages/db': ['migrations', 'seeds'],
      src: ['launchpad'],
      'src/launchpad': ['dashboard', 'weather', 'utils'],
      lib: [],
    };
    const dirs = (path: string) => (tree[path] ?? []).map((name) => ({ path: name, type: 'tree' }));
    const inside: Record<string, { path: string; type: string }[]> = {};
    for (const path of Object.keys(tree)) if (path !== '') inside[path] = dirs(path);

    const world = candidateDirectories({ root: dirs(''), inside }).map((c) => c.path);
    expect(lib.candidateDirectories((path) => tree[path] ?? [])).toEqual(world);
    expect(world).toEqual(['apps/web', 'apps/api', 'packages/db/migrations', 'packages/db/seeds', 'src/launchpad/dashboard', 'src/launchpad/weather', 'infra', 'lib']);
  });
});
