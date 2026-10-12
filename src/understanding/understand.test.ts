import { describe, expect, it } from 'vitest';
import { catalogue } from '../world/fixtures/catalogue';
import type { GithubRaw, GithubRepo } from '../world/sources/github/raw';
import { githubEvents, placeId } from '../world/sources/github/transform';
import { EVIDENCE_LIMITS, evidenceFor, featureIdOf, placeIdOf, type ProjectEvidence } from './evidence';
import { loadUnderstanding, type FetchLike } from './source';
import { privateJson } from './testkit';
import { isProjectUnderstanding, type ProjectUnderstanding } from './types';
import { HeuristicUnderstander, understandHeuristically } from './understand';

// ───────────────────────── A hand-written repository ─────────────────────────

const README = `<p align="center"><img src="logo.png"></p>

# Launchpad

[![CI](https://example.test/badge.svg)](https://example.test/ci)

A Raspberry Pi e-ink family dashboard for the front door. Launchpad shows a household the
few things it needs to start the day: **train departures**, weather and the calendar. It can
be read in a five-second glance. A fourth sentence that is left out.

## Roadmap

1. Replace the mock calendar.

\`\`\`bash
# Not a heading
pip install launchpad
\`\`\`

## License
MIT
`;

function repo(over: Partial<GithubRepo> = {}): GithubRepo {
  return {
    owner: 'Pat',
    name: 'launch-pad',
    full_name: 'Pat/launch-pad',
    description: 'A calm e-ink dashboard.',
    topics: [],
    created_at: '2026-06-15T10:00:00Z',
    pushed_at: '2026-08-20T10:00:00Z',
    archived: false,
    private: false,
    default_branch: 'main',
    language: 'Python',
    languages: { Python: 9100, HTML: 900 },
    releases: [{ tag: 'v0.1.0', name: 'First light', published_at: '2026-07-01T00:00:00Z' }],
    tags: [],
    commits: [
      { sha7: 'ccc3333', date: '2026-08-20T09:00:00Z', author: 'pat', message: 'docs: hardware diagnostic' },
      { sha7: 'bbb2222', date: '2026-08-19T09:00:00Z', author: 'pat', message: 'feat: nightstand page' },
      { sha7: 'aaa1111', date: '2026-06-15T09:00:00Z', author: 'pat', message: 'Initial commit' },
    ],
    tree: {
      root: [
        { path: 'README.md', type: 'blob' },
        { path: 'pyproject.toml', type: 'blob' },
        { path: 'src', type: 'tree' },
        { path: 'deploy', type: 'tree' },
        { path: '.github', type: 'tree' },
      ],
      inside: {
        src: [{ path: 'launchpad', type: 'tree' }],
        'src/launchpad': [
          { path: 'configServer', type: 'tree' },
          { path: 'display', type: 'tree' },
          { path: '__init__.py', type: 'blob' },
        ],
      },
    },
    paths: {
      'src/launchpad/configServer': { commits: [{ sha7: 'bbb2222', date: '2026-08-19T09:00:00Z', author: 'pat' }] },
      deploy: {
        commits: [
          { sha7: 'bbb2222', date: '2026-08-19T09:00:00Z', author: 'pat' },
          { sha7: 'aaa1111', date: '2026-06-15T09:00:00Z', author: 'pat' },
        ],
      },
    },
    evidence: {
      readme: { path: 'README.md', text: README },
      issues: [{ number: 12, title: 'Calendar shows mock data', labels: ['bug'], updated_at: '2026-08-01T00:00:00Z' }],
      todos: [{ path: 'src/launchpad/display.py', marker: 'TODO', text: '# TODO: landscape renderer' }],
      recentChanges: [
        { sha7: 'ccc3333', date: '2026-08-20T09:00:00Z', files: ['scripts/eink_diagnose.py', 'LAUNCHPAD.md'] },
        { sha7: 'bbb2222', date: '2026-08-19T09:00:00Z', files: ['src/launchpad/configServer/app.py', 'deploy/launchpad.service'] },
      ],
      absent: {},
    },
    ...over,
  };
}

const RAW = { fetchedAt: '2026-09-01T08:00:00Z' };

// ───────────────────────── Evidence ─────────────────────────

describe('evidenceFor', () => {
  it('reads the README: first prose paragraph, headings, nothing from code fences or badges', () => {
    const e = evidenceFor(repo(), RAW);
    if (e.readme.status !== 'present') throw new Error('README not read');
    expect(e.readme.source).toBe('README.md');
    expect(e.readme.headings).toEqual(['Launchpad', 'Roadmap', 'License']);
    expect(e.readme.firstParagraph).toMatch(/^A Raspberry Pi e-ink family dashboard for the front door\./);
    expect(e.readme.firstParagraph).toContain('train departures, weather');
    expect(e.readme.firstParagraph).not.toMatch(/\*\*|badge|<p/);
    expect(e.readme.firstParagraph!.length).toBeLessThanOrEqual(EVIDENCE_LIMITS.paragraph);
    expect(e.readme.excerpt.length).toBeLessThanOrEqual(EVIDENCE_LIMITS.readmeExcerpt);
  });

  it('summarises structure and gives every item a source a person could follow', () => {
    const e = evidenceFor(repo(), RAW);
    expect(e.place).toBe('gh-pat-launch-pad');
    expect(e.description).toEqual({ value: 'A calm e-ink dashboard.', source: 'repository description' });
    expect(e.structure.summary).toBe('Written mostly in Python (91%). Top-level directories: src, deploy. Project files at the root: pyproject.toml.');
    expect(e.structure.topLevelFiles).toEqual(['README.md', 'pyproject.toml']);
    expect(e.structure.featureDirectories).toEqual(['deploy', 'src/launchpad/configServer']);
    expect(e.structure.source).toBe('repository tree');
    expect(e.recentCommits.map((c) => c.source)).toEqual(['commit ccc3333', 'commit bbb2222', 'commit aaa1111']);
    expect(e.recentCommits[0]).toMatchObject({ at: '2026-08-20', message: 'docs: hardware diagnostic', author: 'pat' });
    expect(e.issues).toEqual({ status: 'present', truncated: false, items: [{ number: 12, title: 'Calendar shows mock data', labels: ['bug'], updatedAt: '2026-08-01', source: 'issue #12' }] });
    expect(e.todos).toMatchObject({ status: 'present', items: [{ marker: 'TODO', source: 'src/launchpad/display.py' }] });
    expect(e.activity).toMatchObject({ firstCommitAt: '2026-06-15', lastCommitAt: '2026-08-20', commits: 3, last30Days: 2, last90Days: 3, pushedAt: '2026-08-20' });
    expect(e.activity.releases).toEqual([{ value: 'First light', source: 'release v0.1.0', at: '2026-07-01' }]);
    expect(e.fetchedAt).toBe(RAW.fetchedAt);
    expect(e.headCommit).toBe('ccc3333');
  });

  it('groups recent work by feature directory, busiest first, with the map\'s feature ids', () => {
    const e = evidenceFor(repo(), RAW);
    expect(e.recentWork.map((g) => [g.path, g.count])).toEqual([
      ['deploy', 2],
      ['.', 1],
      ['src/launchpad/configServer', 1],
    ]);
    const deploy = e.recentWork[0]!;
    expect(deploy).toMatchObject({ feature: 'deploy', firstAt: '2026-06-15', lastAt: '2026-08-19', files: ['deploy/launchpad.service'] });
    expect(deploy.commits.map((c) => c.sha7)).toEqual(['bbb2222', 'aaa1111']);
    expect(e.recentWork[2]).toMatchObject({ feature: 'src-launchpad-config-server', files: ['src/launchpad/configServer/app.py'] });
    // Work outside every feature directory is kept, under the repository itself.
    const root = e.recentWork[1]!;
    expect(root.feature).toBeUndefined();
    expect(root.files).toEqual(['scripts/eink_diagnose.py', 'LAUNCHPAD.md']);
  });

  it('records a missing section as absent, with its reason, and never as an empty list', () => {
    const r = repo();
    r.evidence = { readme: null, recentChanges: [], absent: { todos: 'Code search unavailable for this repository (403).', issues: 'Issues are turned off for this repository.' } };
    const e = evidenceFor(r, RAW);
    expect(e.readme).toEqual({ status: 'none' });
    expect(e.issues).toEqual({ status: 'absent', reason: 'Issues are turned off for this repository.' });
    expect(e.todos).toEqual({ status: 'absent', reason: 'Code search unavailable for this repository (403).' });

    // GitHub answering "there are none" is a different fact, and is kept as one.
    r.evidence = { readme: null, issues: [], absent: {} };
    expect(evidenceFor(r, RAW).issues).toEqual({ status: 'present', truncated: false, items: [] });
  });

  it('reads a version 1 record, which has no evidence, without inventing any', () => {
    const { evidence: _dropped, ...old } = repo();
    void _dropped;
    const e = evidenceFor(old);
    expect(e.readme.status).toBe('unread');
    expect(e.issues.status).toBe('absent');
    expect(e.todos.status).toBe('absent');
    expect(e.fetchedAt).toBeUndefined();
    expect(e.recentCommits).toHaveLength(3);
    expect(e.recentWork.find((g) => g.path === 'deploy')?.files).toEqual([]);
  });

  it('is pure: the same repository gives the same evidence and is not changed', () => {
    const r = repo();
    const before = JSON.stringify(r);
    expect(evidenceFor(r, RAW)).toEqual(evidenceFor(r, RAW));
    expect(JSON.stringify(r)).toBe(before);
  });

  it('names places and features exactly as the map does', () => {
    for (const r of [repo(), repo({ owner: 'PatTheRatch', name: 'Relationship-Saver' }), repo({ owner: 'x', name: 'cgtData_Format' })]) {
      expect(placeIdOf(r)).toBe(placeId(r));
    }
    const raw: GithubRaw = { version: 2, fetchedAt: RAW.fetchedAt, accounts: ['pat'], repos: [repo()] };
    const events = githubEvents(raw, catalogue, () => true);
    const onMap = new Set(events.flatMap((ev) => (ev.type === 'feature.proposed' ? [ev.feature] : [])));
    expect(onMap.size).toBeGreaterThan(0);
    for (const path of Object.keys(repo().paths)) expect(onMap.has(featureIdOf(path)), path).toBe(true);
  });

  it('reduces the real record without loss of sources, when it is here', async () => {
    const raw = (await privateJson('github.json')) as GithubRaw | undefined;
    if (raw === undefined) return;
    for (const r of raw.repos) {
      const e = evidenceFor(r, raw);
      expect(e.place).toBe(placeId(r));
      for (const c of e.recentCommits) expect(c.source).toMatch(/^commit [0-9a-f]{7}$/);
      expect(e.recentCommits.length).toBeLessThanOrEqual(EVIDENCE_LIMITS.recentCommits);
      // Version 2 records say what GitHub answered for every section.
      if (r.evidence !== undefined) expect(e.readme.status).not.toBe('unread');
      if (e.todos.status === 'absent') expect(e.todos.reason).not.toBe('');
    }
  });
});

// ───────────────────────── The heuristic understander ─────────────────────────

describe('HeuristicUnderstander', () => {
  const read = (r: GithubRepo): ProjectEvidence => evidenceFor(r, RAW);

  it('with a README: says what it is in the README\'s own first sentences, and where that came from', async () => {
    const u = await new HeuristicUnderstander().understand(read(repo()), 'gh-pat-launch-pad');
    expect(u.place).toBe('gh-pat-launch-pad');
    expect(u.whatThisIs.value).toBe(
      'A Raspberry Pi e-ink family dashboard for the front door. Launchpad shows a household the few things it needs to start the day: train departures, weather and the calendar. It can be read in a five-second glance.',
    );
    expect(u.whatThisIs).toMatchObject({ confidence: 'medium', sources: ['README.md', 'repository description'] });
    expect(u.architecture).toMatchObject({ confidence: 'medium', sources: ['repository tree'] });
    expect(u.maturity.value).toBe('3 commits from 15 June 2026 to 20 August 2026, 1 release. Whether it works is not something the commit record shows.');
    expect(u.recentWork.value).toBe('The latest 3 commits were from 15 June 2026 to 20 August 2026, mostly in deploy/, src/launchpad/configServer/. The newest reads "docs: hardware diagnostic".');
    expect(u.recentWork.sources).toEqual(['commit ccc3333', 'commit bbb2222', 'commit aaa1111']);
    expect(isProjectUnderstanding(u)).toBe(true);
  });

  it('turns issues and TODOs into unfinished items, each with its source', async () => {
    const u = await new HeuristicUnderstander().understand(read(repo()), 'p');
    expect(u.unfinished).toEqual([
      { value: 'Issue #12 "Calendar shows mock data" is open, last updated 1 August 2026', confidence: 'high', sources: ['issue #12'] },
      { value: 'src/launchpad/display.py carries a TODO: "# TODO: landscape renderer"', confidence: 'high', sources: ['src/launchpad/display.py'] },
    ]);
  });

  it('marks its guesses low and never invents a question, a next step, an audience or a pick-up', async () => {
    const u = await new HeuristicUnderstander().understand(read(repo()), 'p');
    expect(u.capabilities.map((c) => c.value)).toEqual(['Deploy (the deploy/ directory)', 'Config Server (the src/launchpad/configServer/ directory)']);
    expect(u.capabilities.every((c) => c.confidence === 'low')).toBe(true);
    expect(u.openQuestions).toEqual([]);
    expect(u.nextSteps).toEqual([]);
    expect(u.audience).toBeUndefined();
    expect(u.problem).toBeUndefined();
    expect(u.pickUp).toBeUndefined();
  });

  it('without a README: falls back to the description, and says so', async () => {
    const r = repo();
    r.evidence = { readme: null, absent: { issues: 'Issues are turned off for this repository.', todos: 'Not searched.' } };
    const u = await new HeuristicUnderstander().understand(read(r), 'p');
    expect(u.whatThisIs).toEqual({ value: 'Launch Pad is described in its repository as: "A calm e-ink dashboard.".', confidence: 'medium', sources: ['repository description'] });
    // Absent sections give no unfinished items; they are not read as "nothing is open".
    expect(u.unfinished).toEqual([]);
  });

  it('without a README or a description: says what it inferred from, and marks it low', async () => {
    const r = repo({ description: null });
    r.evidence = { readme: null, absent: {} };
    const u = await new HeuristicUnderstander().understand(read(r), 'p');
    expect(u.whatThisIs.confidence).toBe('low');
    expect(u.whatThisIs.sources).toEqual(['repository tree']);
    expect(u.whatThisIs.value).toBe(
      'Launch Pad: It has no README and no description; what it is has been inferred only from its Python files and directories (deploy, src/launchpad/configServer).',
    );
  });

  it('distrusts a README that never names the project: a template is quoted, not believed', async () => {
    const r = repo({ name: 'stashbuster', description: null });
    r.evidence = { readme: { path: 'README.md', text: '# React + Vite\n\nThis template provides a minimal setup to get React working in Vite with HMR and some ESLint rules.\n' }, absent: {} };
    const u = await new HeuristicUnderstander().understand(read(r), 'p');
    expect(u.whatThisIs.confidence).toBe('low');
    expect(u.whatThisIs.value).toContain("Stashbuster's README opens: \"This template provides a minimal setup");
    expect(u.whatThisIs.value).toContain('may be a template');
  });

  it('handles an empty repository', async () => {
    const r = repo({ commits: [], paths: {}, languages: {}, releases: [], description: null, tree: { root: [], inside: {} }, empty: true });
    r.evidence = { readme: null, absent: {} };
    const u = await new HeuristicUnderstander().understand(read(r), 'p');
    expect(u.maturity.value).toBe('No commits are recorded.');
    expect(u.recentWork.value).toBe('No recent work is recorded.');
    expect(u.architecture).toBeUndefined();
    expect(u.capabilities).toEqual([]);
    expect(isProjectUnderstanding(u)).toBe(true);
  });

  it('is deterministic, reads no clock, and always carries advisory provenance', async () => {
    const e = read(repo());
    const a = await new HeuristicUnderstander().understand(e, 'p');
    const b = await new HeuristicUnderstander().understand(e, 'p');
    expect(a).toEqual(b);
    expect(a).toEqual(understandHeuristically(e, 'p'));
    expect(a.provenance).toEqual({ generator: 'heuristic', generatedAt: RAW.fetchedAt, basedOn: { fetchedAt: RAW.fetchedAt, commit: 'ccc3333' }, advisory: true });
    const stamped = await new HeuristicUnderstander('2026-10-12T09:00:00Z').understand(e, 'p');
    expect(stamped.provenance.generatedAt).toBe('2026-10-12T09:00:00Z');
    expect(new HeuristicUnderstander().id).toBe('heuristic');
  });
});

// ───────────────────────── Loading ─────────────────────────

function answering(status: number, type: string, body: string): FetchLike {
  return () =>
    Promise.resolve({
      ok: status >= 200 && status < 300,
      status,
      headers: { get: (name: string) => (name.toLowerCase() === 'content-type' ? type : null) },
      text: () => Promise.resolve(body),
    });
}

describe('loadUnderstanding', () => {
  const good = (place: string): ProjectUnderstanding => understandHeuristically(evidenceFor(repo(), RAW), place);

  it('returns what the file holds, keyed by place', async () => {
    const file = { a: good('a'), b: good('b') };
    const map = await loadUnderstanding('/data/understanding.json', answering(200, 'application/json', JSON.stringify(file)));
    expect([...map.keys()]).toEqual(['a', 'b']);
    expect(map.get('a')).toEqual(file.a);
  });

  it('tolerates absence: a 404, the dev server\'s HTML fallback, no fetch at all', async () => {
    expect((await loadUnderstanding('/x', answering(404, 'text/plain', 'Not found'))).size).toBe(0);
    expect((await loadUnderstanding('/x', answering(200, 'text/html', '<!doctype html><html></html>'))).size).toBe(0);
    expect((await loadUnderstanding('/x', answering(200, 'application/json', '  <!doctype html>'))).size).toBe(0);
    expect((await loadUnderstanding('/x', answering(500, 'text/plain', 'oops'))).size).toBe(0);
    expect((await loadUnderstanding('/x', () => Promise.reject(new Error('offline')))).size).toBe(0);
  });

  it('tolerates a broken or wrongly shaped file', async () => {
    expect((await loadUnderstanding('/x', answering(200, 'application/json', '{"a": '))).size).toBe(0);
    expect((await loadUnderstanding('/x', answering(200, 'application/json', '[1,2,3]'))).size).toBe(0);
    expect((await loadUnderstanding('/x', answering(200, 'application/json', 'null'))).size).toBe(0);
  });

  it('leaves out a malformed entry without losing the rest', async () => {
    const notAdvisory = { ...good('c'), provenance: { ...good('c').provenance, advisory: false } };
    const badClaim = { ...good('d'), whatThisIs: { value: 'x', confidence: 'certain', sources: [] } };
    const file = { a: good('a'), b: { place: 'b' }, c: notAdvisory, d: badClaim, e: good('somewhere-else'), f: 'text' };
    const map = await loadUnderstanding('/x', answering(200, 'application/json', JSON.stringify(file)));
    // `c` will not say it is advisory, `d` has an unknown confidence, `e` is filed under the wrong place.
    expect([...map.keys()]).toEqual(['a']);
  });

  it('validates the real file, when it is here: one advisory understanding per repository', async () => {
    const file = await privateJson('understanding.json');
    const raw = (await privateJson('github.json')) as GithubRaw | undefined;
    if (file === undefined || raw === undefined) return;
    const map = await loadUnderstanding('/x', answering(200, 'application/json', JSON.stringify(file)));
    expect(map.size).toBe(Object.keys(file as object).length);
    for (const r of raw.repos) {
      const u = map.get(placeId(r));
      expect(u, r.full_name).toBeDefined();
      expect(u!.provenance.generator).toBe('claude (agent session, read-only review of fetched evidence)');
      expect(u!.provenance.advisory).toBe(true);
      expect(Number.isNaN(Date.parse(u!.provenance.generatedAt))).toBe(false);
      // One to three sentences, and open questions and next steps cite what prompts them.
      expect(u!.whatThisIs.value.split(/(?<=[.?])\s+(?=[A-Z"])/).length, r.full_name).toBeLessThanOrEqual(3);
      for (const c of [...u!.openQuestions, ...u!.nextSteps]) expect(c.sources.length, c.value).toBeGreaterThan(0);
    }
  });
});
