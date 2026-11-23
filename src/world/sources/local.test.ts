// The local sync (scripts/local-fetch.mjs), end to end: a small repository is made in a
// temporary folder, read through git alone, and drawn. It proves that a repository on any
// host, or on none, comes out as the same kind of record the GitHub sync writes.

import { describe, expect, it } from 'vitest';
import { buildTerrain } from '../../plan/terrain';
import { derive } from '../derive';
import { catalogue } from '../fixtures/catalogue';
import { isGithubRaw } from './github/raw';
import type { GithubRaw } from './github/raw';
import { githubEvents, placeId } from './github/transform';

// Node, reached without a type dependency on Node (as the other tests do).
interface Proc {
  spawnSync(cmd: string, args: string[], opts: { cwd?: string; env?: Record<string, string | undefined>; encoding: 'utf8' }): { status: number | null; stdout: string; stderr: string };
}
interface Fs {
  mkdtempSync(prefix: string): string;
  mkdirSync(path: string, opts: { recursive: boolean }): void;
  writeFileSync(path: string, text: string): void;
  readFileSync(path: string, encoding: 'utf8'): string;
  rmSync(path: string, opts: { recursive: boolean; force: boolean }): void;
}
const load = async <T>(name: string): Promise<T> => (await import(/* @vite-ignore */ name)) as T;
const proc = await load<Proc>('node:child_process');
const fs = await load<Fs>('node:fs');
const os = await load<{ tmpdir(): string }>('node:os');
const node = (globalThis as unknown as { process: { execPath: string; env: Record<string, string | undefined> } }).process;

// No one's own git settings may leak into the test, nor the test into theirs.
const env = { ...node.env, GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_NOSYSTEM: '1' };
const hasGit = proc.spawnSync('git', ['--version'], { encoding: 'utf8' }).status === 0;

const definition = {
  version: 1,
  id: 'boxout',
  name: 'Boxout Fantasy',
  what: 'Fantasy basketball, judged honestly.',
  region: 'the-court',
  features: [
    { id: 'trade-judge', name: 'Trade judge', kind: 'observatory', stage: 'working', paths: ['src/judge'] },
    { id: 'draft-room', name: 'Draft room', kind: 'frontage', stage: 'planned' },
  ],
};

/** A repository with a history: the owner's weekly work, one colleague's commit, then a definition. */
function makeRepo(): { dir: string; record: string } {
  const dir = fs.mkdtempSync(`${os.tmpdir()}/pw-local-`);
  const git = (args: string[], when?: string, who?: string) => {
    const dated = when === undefined ? env : { ...env, GIT_AUTHOR_DATE: `${when}T12:00:00Z`, GIT_COMMITTER_DATE: `${when}T12:00:00Z` };
    const r = proc.spawnSync('git', who === undefined ? args : [...args, `--author=${who}`], { cwd: dir, env: dated, encoding: 'utf8' });
    if (r.status !== 0) throw new Error(`git ${args.join(' ')}: ${r.stderr}`);
  };
  git(['init', '-q', '-b', 'main']);
  git(['config', 'user.name', 'Pat Owner']);
  git(['config', 'user.email', 'pat@example.test']);
  fs.mkdirSync(`${dir}/src/judge`, { recursive: true });
  fs.mkdirSync(`${dir}/src/web`, { recursive: true });
  fs.writeFileSync(`${dir}/README.md`, '# Boxout\n\nSee [PLAN.md](PLAN.md).\n');
  fs.writeFileSync(`${dir}/PLAN.md`, '# Plan\n\n- [ ] Draft room\n');
  for (let week = 0; week < 10; week++) {
    const day = `2025-01-${String(6 + week * 2).padStart(2, '0')}`;
    fs.writeFileSync(`${dir}/src/judge/score.py`, `score = ${week}\n`);
    if (week % 3 === 0) fs.writeFileSync(`${dir}/src/web/page.ts`, `export const week = ${week};\n`);
    git(['add', '-A']);
    git(['commit', '-q', '-m', `work ${week}`], day);
  }
  fs.writeFileSync(`${dir}/src/web/page.ts`, 'export const week = 99;\n');
  git(['add', '-A']);
  git(['commit', '-q', '-m', 'a colleague helps'], '2025-02-01', 'Col League <col@example.test>');
  fs.writeFileSync(`${dir}/patrick-world.json`, JSON.stringify(definition, null, 2));
  git(['add', '-A']);
  git(['commit', '-q', '-m', 'say what this is'], '2025-02-10');
  return { dir, record: `${dir}/record.json` };
}

function read(repo: { dir: string; record: string }, ...extra: string[]): { raw: GithubRaw; text: string; output: string } {
  const r = proc.spawnSync(node.execPath, ['scripts/local-fetch.mjs', '--dirs', repo.dir, '--out', repo.record, ...extra], { env, encoding: 'utf8' });
  if (r.status !== 0) throw new Error(r.stderr);
  const text = fs.readFileSync(repo.record, 'utf8');
  return { raw: JSON.parse(text) as GithubRaw, text, output: r.stdout };
}

describe.skipIf(!hasGit)('reading a repository from a clone, whatever hosts it', () => {
  const repo = makeRepo();
  const { raw, text, output } = read(repo);
  const terrain = buildTerrain(catalogue, 'patricks-world');
  const world = (r: GithubRaw) => derive(githubEvents(r, catalogue, terrain.isLand), catalogue, r.fetchedAt.slice(0, 10));

  it('writes the same kind of record the GitHub sync writes', () => {
    expect(isGithubRaw(raw)).toBe(true);
    expect(raw.host).toBe('local');
    expect(raw.repos).toHaveLength(1);
    const r = raw.repos[0]!;
    expect(r.default_branch).toBe('main');
    expect(r.commits).toHaveLength(12);
    expect(r.created_at.slice(0, 10)).toBe('2025-01-06');
    expect(Object.keys(r.paths).sort()).toEqual(['src/judge', 'src/web']);
    expect(r.languages).toHaveProperty('Python');
    expect(r.evidence?.readme?.path).toBe('README.md');
    expect(r.evidence?.documents?.map((d) => d.path)).toEqual(['PLAN.md']);
    expect(r.definition?.revisions).toHaveLength(1);
  });

  it('knows the owner by the name git is configured with, and writes no e-mail address down', () => {
    expect(raw.profileNames).toEqual(['Pat Owner']);
    expect(text).not.toContain('example.test');
    expect(output).toContain('11 commits written under your names');
  });

  it('draws the city from its definition, with only the owner’s work in it', () => {
    const place = world(raw).places.find((p) => p.id === placeId(raw.repos[0]!))!;
    expect(place.name).toBe('Boxout Fantasy');
    expect(place.region).toBe('the-court');
    expect(place.features.map((f) => [f.id, f.stage]).sort()).toEqual([
      ['draft-room', 'planned'],
      ['trade-judge', 'working'],
    ]);
    expect(place.features.find((f) => f.id === 'trade-judge')!.commits).toBe(10);
    expect(place.commits).toBe(11);
  });

  it('counts a colleague’s work too on a team’s map', () => {
    const team = read(repo, '--everyone').raw;
    expect(team.everyone).toBe(true);
    expect(world(team).places[0]!.commits).toBe(12);
  });

  it('takes another name for the owner when told one', () => {
    expect((read(repo, '--me', 'Col League').raw.profileNames ?? []).slice().sort()).toEqual(['Col League', 'Pat Owner']);
  });

  it('clears up after itself', () => {
    fs.rmSync(repo.dir, { recursive: true, force: true });
  });
});
