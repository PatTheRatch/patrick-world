import { describe, expect, it } from 'vitest';
import { buildTerrain } from '../../../plan/terrain';
import { derive, rankIndex } from '../../derive';
import { catalogue } from '../../fixtures/catalogue';
import { mergeEvents } from '../index';
import { addDays, isoDay, weekday } from '../../time';
import type { Catalogue, WorldEvent } from '../../types';
import type { GithubCommit, GithubRaw, GithubRepo } from './raw';
import { INFERENCE, githubEvents, humanise, inferStages, ownerTest, weekEnding } from './transform';

// ───────────────────────── A small hand-written record ─────────────────────────

const FETCHED = '2025-03-10T09:00:00Z'; // a Monday
const TODAY = '2025-03-10';
const terrain = buildTerrain(catalogue, 'patricks-world');

let serial = 0;
function commit(date: string, author: string | null = 'pat', authorName = 'Pat Owner'): GithubCommit {
  return { sha7: `c${(serial++).toString(16).padStart(6, '0')}`, date: `${date}T12:00:00Z`, author, authorName, message: 'work' };
}
function run(from: string, count: number, stepDays: number): GithubCommit[] {
  return Array.from({ length: count }, (_, i) => commit(addDays(from, i * stepDays)));
}
const tree = (...names: string[]) => names.map((path) => ({ path, type: 'tree' }));

function repo(over: Partial<GithubRepo> & Pick<GithubRepo, 'name' | 'created_at'>): GithubRepo {
  return {
    owner: 'pat',
    full_name: `pat/${over.name}`,
    description: null,
    topics: [],
    pushed_at: over.created_at,
    archived: false,
    private: true,
    default_branch: 'main',
    language: null,
    languages: {},
    releases: [],
    tags: [],
    commits: [],
    tree: { root: [], inside: {} },
    paths: {},
    ...over,
  };
}

// The product: two roots, a top-level directory, a release, two years of history.
const shared = commit('2023-01-05'); // touches both web and api
const web = [
  ...run('2023-01-04', 12, 7), // weekly to 2023-03-22, then quiet: working on 2023-04-12
  shared,
  ...run('2023-09-05', 2, 1), // first return
  ...run('2024-03-05', 1, 1), // second return
  ...run('2024-10-08', 2, 1), // third return, 21 months in: mature on 2024-10-08
  commit('2024-12-01', 'dependabot[bot]', 'dependabot[bot]'), // not the owner's
];
const api = [...run('2023-01-05', 10, 5), shared]; // to 2023-02-19: working by quiet on 2023-03-12
const db = run('2023-05-10', 9, 2); // to 2023-05-26: working when the release ships, 2023-06-01
const evals = run('2023-07-03', 3, 1); // too few: never working
const infra = [...run('2023-02-06', 5, 1), ...run('2023-02-06', 5, 1), ...run('2023-02-06', 5, 1), ...run('2023-02-06', 5, 1)]; // one week only: never working
const mobile = run('2025-02-20', 10, 2); // to the day of the sync, after the release: still building
const live = run('2025-02-10', 24, 1); // daily, no pause, no release since: working by sustained work on the 20th commit, 2025-03-01
const rootOnly = [
  ...run('2023-01-02', 5, 30),
  commit('2023-03-03', null, 'Pat Owner'), // unlinked, but the owner's name
  commit('2023-03-04', null, 'Someone Else'), // unlinked and not the owner
  commit('2023-03-05', 'a-collaborator', 'A Collaborator'), // another person: kept out
  commit('2023-03-06', 'claude', 'Claude'), // a coding agent, building at the owner's direction: counts
  commit('2023-03-07', null, 'aisha-agent'), // an agent under an unlinked e-mail: counts
];

const product = repo({
  name: 'boxout-fantasy',
  description: 'Fantasy basketball, read properly.',
  created_at: '2023-01-02T10:00:00Z',
  pushed_at: FETCHED,
  languages: { TypeScript: 800, Python: 150, Shell: 50, COBOL: 500 },
  releases: [{ tag: 'v1.0.0', name: 'First season', published_at: '2023-06-01T08:00:00Z' }],
  tags: [{ name: 'v1.0.0', sha7: 'aaaaaaa', date: '2023-06-01T08:00:00Z' }],
  tree: {
    root: [...tree('.github', 'apps', 'packages', 'infra', 'docs', 'node_modules'), { path: 'README.md', type: 'blob' }],
    inside: { apps: tree('web', 'api', 'mobile', 'live'), packages: tree('db', 'evals', '__tests__') },
  },
  paths: {
    'apps/web': { commits: web },
    'apps/api': { commits: api },
    'apps/mobile': { commits: mobile },
    'apps/live': { commits: live },
    'packages/db': { commits: db },
    'packages/evals': { commits: evals },
    infra: { commits: infra },
  },
  commits: [...new Set([...web, ...api, ...mobile, ...live, ...db, ...evals, ...infra, ...rootOnly])],
});

const archived = repo({
  name: 'old-ledger',
  description: 'Budget tracker',
  created_at: '2021-02-01T10:00:00Z',
  pushed_at: '2021-08-04T10:00:00Z',
  archived: true,
  languages: { Python: 100 },
  tree: { root: [...tree('docs', 'tests'), { path: 'main.py', type: 'blob' }], inside: {} },
  commits: run('2021-02-03', 12, 14), // to 2021-07-07
});

const scratch = repo({
  name: 'scratch',
  created_at: '2024-05-05T10:00:00Z',
  commits: [commit('2024-05-05')],
});

const raw: GithubRaw = {
  version: 1,
  fetchedAt: FETCHED,
  accounts: ['pat'],
  profileNames: ['Pat Owner'],
  repos: [product, archived, scratch],
};

const events = githubEvents(raw, catalogue, terrain.isLand);
const PLACE = 'gh-pat-boxout-fantasy';

type Of<T extends WorldEvent['type']> = Extract<WorldEvent, { type: T }>;
const ofType = <T extends WorldEvent['type']>(list: WorldEvent[], type: T) => list.filter((e): e is Of<T> => e.type === type);
const founded = (list: WorldEvent[]) => new Map(ofType(list, 'place.founded').map((e) => [e.place, e]));
const stageOf = (feature: string, stage: string) =>
  ofType(events, 'feature.staged').find((e) => e.place === PLACE && e.feature === feature && e.stage === stage)?.at;

// ───────────────────────── Tests ─────────────────────────

describe('githubEvents: identity', () => {
  it('gives the same ids, and the same events, on every call', () => {
    const again = githubEvents(raw, catalogue, terrain.isLand);
    expect(again).toEqual(events);
    expect(new Set(events.map((e) => e.id)).size).toBe(events.length);
  });

  it('is idempotent under mergeEvents: syncing twice counts nothing twice', () => {
    const once = mergeEvents([events]);
    const twice = mergeEvents([events, githubEvents(raw, catalogue, terrain.isLand)]);
    expect(twice).toEqual(once);
    expect(derive(twice, catalogue, TODAY)).toEqual(derive(once, catalogue, TODAY));
  });

  it('marks every event as GitHub’s and dates none after the sync', () => {
    for (const e of events) {
      expect(e.source).toBe('github');
      expect(e.at).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(e.at <= TODAY).toBe(true);
    }
  });

  it('emits no links, no traction, and no stage GitHub cannot see', () => {
    const types = new Set(events.map((e) => e.type));
    expect(types.has('link.formed')).toBe(false);
    expect(types.has('traction.measured')).toBe(false);
    const stages = new Set(ofType(events, 'feature.staged').map((e) => e.stage));
    expect([...stages].sort()).toEqual(['building', 'mature', 'working']);
  });
});

describe('githubEvents: places', () => {
  it('founds one place per repository, named and noted', () => {
    const f = founded(events);
    expect([...f.keys()].sort()).toEqual(['gh-pat-boxout-fantasy', 'gh-pat-old-ledger', 'gh-pat-scratch']);
    expect(f.get(PLACE)).toMatchObject({ id: 'gh:pat/boxout-fantasy:founded', name: 'Boxout Fantasy', at: '2023-01-02', region: 'the-court' });
    expect(f.get(PLACE)!.note).toBe('Fantasy basketball, read properly.');
    expect(f.get('gh-pat-scratch')!.note).toBe('No description.');
    expect(f.get('gh-pat-old-ledger')!.region).toBe('ledger-reach');
    expect(f.get('gh-pat-scratch')!.region).toBe('the-commons');
  });

  it('humanises names and keeps acronyms', () => {
    expect(humanise('boxout-fantasy')).toBe('Boxout Fantasy');
    expect(humanise('patrick-os')).toBe('Patrick OS');
    expect(humanise('mcp_toolkit')).toBe('MCP Toolkit');
    expect(humanise('EarnedKit')).toBe('Earned Kit');
    expect(humanise('ai-api-ui')).toBe('AI API UI');
  });

  it('founds at the first commit when history predates the repository', () => {
    const early = repo({ name: 'imported', created_at: '2024-06-01T00:00:00Z', commits: [commit('2022-01-15')] });
    const f = founded(githubEvents({ ...raw, repos: [early] }, catalogue, terrain.isLand));
    expect(f.get('gh-pat-imported')!.at).toBe('2022-01-15');
  });

  it('falls back to the first region when the chosen one is not in the catalogue', () => {
    const small: Catalogue = { ...catalogue, regions: catalogue.regions.filter((r) => r.id === 'mindworks') };
    for (const e of founded(githubEvents(raw, small, terrain.isLand)).values()) expect(e.region).toBe('mindworks');
  });

  it('turns an archived repository into an abandoned place', () => {
    const gone = ofType(events, 'place.abandoned');
    expect(gone).toHaveLength(1);
    expect(gone[0]).toMatchObject({ place: 'gh-pat-old-ledger', note: 'Archived on GitHub.', id: 'gh:pat/old-ledger:abandoned' });
    // Never before the last work is logged, or the ruin would read as revived.
    const lastWork = ofType(events, 'work.logged')
      .filter((e) => e.place === 'gh-pat-old-ledger')
      .reduce((a, e) => (e.at > a ? e.at : a), '');
    expect(gone[0]!.at >= lastWork).toBe(true);
    expect(gone[0]!.at).toBe('2021-08-04');
  });
});

describe('githubEvents: position', () => {
  const ring = (p: { x: number; y: number }, r: number) =>
    [0, 1, 2, 3, 4, 5, 6, 7].map((i) => ({ x: p.x + Math.cos((i * Math.PI) / 4) * r, y: p.y + Math.sin((i * Math.PI) / 4) * r }));

  it('puts every place on land, clear of the shore and inside the edge', () => {
    for (const e of founded(events).values()) {
      const p = e.position;
      expect([p, ...ring(p, 60)].every((q) => terrain.isLand(q))).toBe(true);
      expect(p.x >= 260 && p.y >= 260 && p.x <= catalogue.size.width - 260 && p.y <= catalogue.size.height - 260).toBe(true);
    }
  });

  it('keeps places apart, even when many crowd one region', () => {
    const many = Array.from({ length: 14 }, (_, i) =>
      repo({ name: `note-${i}`, created_at: `2024-06-${String(i + 1).padStart(2, '0')}T00:00:00Z`, commits: [commit(`2024-06-${String(i + 1).padStart(2, '0')}`)] }),
    );
    const f = [...founded(githubEvents({ ...raw, repos: [...raw.repos, ...many] }, catalogue, terrain.isLand)).values()];
    for (let i = 0; i < f.length; i++) {
      for (let j = i + 1; j < f.length; j++) {
        const d = Math.hypot(f[i]!.position.x - f[j]!.position.x, f[i]!.position.y - f[j]!.position.y);
        expect(d).toBeGreaterThanOrEqual(240);
      }
    }
  });

  it('never moves an earlier place when a later repository is added', () => {
    const later = repo({
      name: 'newcomer',
      description: 'Fantasy league helper',
      created_at: '2025-03-01T00:00:00Z',
      commits: run('2025-03-01', 4, 1),
    });
    const before = founded(events);
    const after = founded(githubEvents({ ...raw, repos: [later, ...raw.repos] }, catalogue, terrain.isLand));
    expect(after.size).toBe(before.size + 1);
    for (const [place, e] of before) expect(after.get(place)!.position).toEqual(e.position);
    expect(after.get('gh-pat-newcomer')!.region).toBe('the-court');
  });
});

describe('githubEvents: work', () => {
  const work = ofType(events, 'work.logged');

  it('buckets commits into weeks ending Sunday', () => {
    expect(weekEnding('2023-01-04')).toBe('2023-01-08'); // Wednesday
    expect(weekEnding('2023-01-08')).toBe('2023-01-08'); // Sunday itself
    expect(weekEnding('2023-01-09')).toBe('2023-01-15'); // Monday starts the next
    for (const e of work) {
      const week = e.id.slice(-10);
      expect(weekday(week)).toBe(0);
      // Only the week still in progress is dated short of its Sunday.
      expect(e.at === week || (week > TODAY && e.at === TODAY)).toBe(true);
    }
    const firstWeb = work.find((e) => e.id === 'gh:pat/boxout-fantasy:work:apps/web:2023-01-08');
    // 4 Jan only: the commit of 5 Jan shared with api is logged there, its smaller home.
    expect(firstWeb).toMatchObject({ feature: 'apps-web', commits: 1, at: '2023-01-08' });
    const thisWeek = work.find((e) => e.id === 'gh:pat/boxout-fantasy:work:apps/mobile:2025-03-16');
    expect(thisWeek).toMatchObject({ commits: 1, at: TODAY });
  });

  it('logs feature work against the feature and counts only the owner’s commits', () => {
    const mine = ownerTest(raw);
    const sum = (feature: string) => work.filter((e) => e.place === PLACE && e.feature === feature).reduce((n, e) => n + e.commits, 0);
    // Neither the bot's commit nor the shared one, which is homed in api (the smaller feature).
    expect(sum('apps-web')).toBe(web.filter(mine).length - 1);
    expect(sum('apps-web')).toBe(web.length - 2);
    expect(sum('apps-api')).toBe(api.length);
    expect(sum('infra')).toBe(20);
  });

  it('counts every person\u2019s commits on a team\u2019s map, and still no machinery', () => {
    const team = ownerTest({ accounts: ['pat'], profileNames: [], everyone: true });
    const by = (author: string | null, authorName: string) => team({ sha7: 'x', date: '2025-01-01T00:00:00Z', author, authorName });
    expect(by('a-collaborator', 'A Collaborator')).toBe(true);
    expect(by(null, 'Someone Else')).toBe(true);
    expect(by('copilot-swe-agent[bot]', 'Copilot')).toBe(true); // an agent is a builder
    expect(by('dependabot[bot]', 'dependabot[bot]')).toBe(false);
    expect(by('some-ci[bot]', 'Some CI')).toBe(false);
    expect(by(null, 'github-actions')).toBe(false);

    // The same record, drawn for one person and for the team.
    const alone = githubEvents({ ...raw, everyone: false }, catalogue, terrain.isLand);
    const together = githubEvents({ ...raw, everyone: true }, catalogue, terrain.isLand);
    const commits = (events: WorldEvent[]) => events.reduce((n, e) => (e.type === 'work.logged' && e.place === PLACE ? n + e.commits : n), 0);
    // Two more people's commits (the unlinked stranger and the collaborator); the bot's still out.
    expect(commits(together) - commits(alone)).toBe(2);
  });

  it('logs the rest against the place, logs every commit exactly once, and never goes negative', () => {
    for (const e of work) expect(e.commits).toBeGreaterThan(0);
    const remainder = work.filter((e) => e.place === PLACE && e.feature === undefined).reduce((n, e) => n + e.commits, 0);
    // Five linked root commits, the unlinked one in the owner's name, and the two agents'.
    expect(remainder).toBe(8);
    const total = work.filter((e) => e.place === PLACE).reduce((n, e) => n + e.commits, 0);
    expect(total).toBe(product.commits.filter(ownerTest(raw)).length); // no double counting
  });

  it('counts the owner and coding agents, and nobody else', () => {
    const mine = ownerTest(raw);
    const by = (author: string | null, authorName: string) => mine({ sha7: 'x', date: null, author, authorName });
    expect(by('pat', 'whatever')).toBe(true);
    expect(by('PAT', 'whatever')).toBe(true);
    expect(by(null, 'Pat Owner')).toBe(true);
    expect(by('claude', 'Claude')).toBe(true);
    expect(by('aisha-agent', 'AIsha')).toBe(true);
    expect(by(null, 'AIsha')).toBe(true);
    expect(by('copilot[bot]', 'Copilot')).toBe(true);
    expect(by(null, 'Someone Else')).toBe(false);
    expect(by('a-collaborator', 'A Collaborator')).toBe(false);
    expect(by('claudette', 'Claudette Smith')).toBe(false); // a person whose name merely starts like an agent's
    expect(by('dependabot[bot]', 'dependabot[bot]')).toBe(false);
    expect(by('noreply', 'Hearth deploy')).toBe(false);
  });

  it('gives every place a commit total equal to its attributed commits', () => {
    const mine = ownerTest(raw);
    const world = derive(mergeEvents([events]), catalogue, TODAY);
    for (const r of raw.repos) {
      const place = world.places.find((p) => p.name === humanise(r.name))!;
      expect(place.commits).toBe(r.commits.filter(mine).length);
    }
  });

  it('proposes and stages a feature whose every commit is homed elsewhere, and logs no work for it', () => {
    const a = run('2024-02-05', 5, 1);
    const b = run('2024-03-04', 5, 1);
    const rootCommit = commit('2024-02-01');
    const nested = repo({
      name: 'nested',
      created_at: '2024-02-01T00:00:00Z',
      tree: { root: tree('packages'), inside: { packages: tree('core', 'left', 'right') } },
      // Every commit to core also touched left or right, each of which is smaller.
      paths: { 'packages/core': { commits: [...a, ...b] }, 'packages/left': { commits: a }, 'packages/right': { commits: b } },
      commits: [...a, ...b, rootCommit],
    });
    const got = githubEvents({ ...raw, repos: [nested] }, catalogue, terrain.isLand);
    const core = got.filter((e) => 'feature' in e && e.feature === 'packages-core');
    expect(core.map((e) => e.type).sort()).toEqual(['feature.proposed', 'feature.staged', 'feature.staged']);
    // Staged from all ten commits that touched it: enough, over two weeks, then quiet.
    expect(core.find((e) => e.type === 'feature.staged' && e.stage === 'working')!.at).toBe('2024-03-29');
    const logged = ofType(got, 'work.logged');
    for (const e of logged) expect(e.commits).toBeGreaterThan(0);
    const sum = (feature?: string) => logged.filter((e) => e.feature === feature).reduce((n, e) => n + e.commits, 0);
    expect([sum('packages-left'), sum('packages-right'), sum(undefined)]).toEqual([5, 5, 1]);
    const place = derive(mergeEvents([got]), catalogue, TODAY).places[0]!;
    expect(place.commits).toBe(11);
    expect(place.features.find((f) => f.id === 'packages-core')).toMatchObject({ stage: 'working', commits: 0 });
  });

  it('gives a repository with no usable directories one feature holding all its commits', () => {
    const proposed = ofType(events, 'feature.proposed').filter((e) => e.place === 'gh-pat-old-ledger');
    expect(proposed).toHaveLength(1);
    expect(proposed[0]).toMatchObject({ feature: 'old-ledger', name: 'Old Ledger', at: '2021-02-03' });
    const w = work.filter((e) => e.place === 'gh-pat-old-ledger');
    expect(w.every((e) => e.feature === 'old-ledger')).toBe(true);
    expect(w.reduce((n, e) => n + e.commits, 0)).toBe(12);
  });
});

describe('githubEvents: features', () => {
  const proposed = new Map(ofType(events, 'feature.proposed').filter((e) => e.place === PLACE).map((e) => [e.feature, e]));

  it('takes features from directories, skipping what is not source', () => {
    expect([...proposed.keys()].sort()).toEqual(['apps-api', 'apps-live', 'apps-mobile', 'apps-web', 'infra', 'packages-db', 'packages-evals']);
    expect(proposed.get('apps-web')).toMatchObject({ name: 'Web', at: '2023-01-04', ward: 'Apps', kind: 'frontage' });
    expect(proposed.get('packages-db')).toMatchObject({ name: 'DB', ward: 'Packages', kind: 'reservoir' });
    expect(proposed.get('packages-evals')!.kind).toBe('observatory');
    expect(proposed.get('apps-api')!.kind).toBe('works');
    expect(proposed.get('infra')!.kind).toBe('utility');
    expect(proposed.get('infra')!.ward).toBeUndefined();
  });

  it('uses only method ids the catalogue has', () => {
    const known = new Set(catalogue.methods.map((m) => m.id));
    for (const e of ofType(events, 'feature.proposed')) for (const m of e.methods) expect(known.has(m)).toBe(true);
    expect(proposed.get('apps-web')!.methods).toEqual(['typescript']); // Python is under 12% of bytes
    expect(proposed.get('packages-evals')!.methods).toEqual(['typescript', 'llm-evaluation']);

    const bare: Catalogue = { ...catalogue, methods: catalogue.methods.filter((m) => m.id === 'python') };
    for (const e of ofType(githubEvents(raw, bare, terrain.isLand), 'feature.proposed')) {
      for (const m of e.methods) expect(m).toBe('python');
    }
  });

  it('caps a sprawling repository at fourteen features, keeping the busiest', () => {
    const names = Array.from({ length: 20 }, (_, i) => `mod${String(i).padStart(2, '0')}`);
    const paths: GithubRepo['paths'] = {};
    for (const [i, n] of names.entries()) paths[`src/${n}`] = { commits: run('2024-01-01', i + 1, 1) };
    const big = repo({
      name: 'sprawl',
      created_at: '2024-01-01T00:00:00Z',
      tree: { root: tree('src'), inside: { src: tree(...names) } },
      paths,
      commits: Object.values(paths).flatMap((p) => p.commits),
    });
    const got = ofType(githubEvents({ ...raw, repos: [big] }, catalogue, terrain.isLand), 'feature.proposed').map((e) => e.feature);
    expect(got).toHaveLength(14);
    expect(got).toContain('src-mod19');
    expect(got).not.toContain('src-mod00');
  });
});

describe('githubEvents: stages are inferred, by these rules only', () => {
  it('building at the first commit', () => {
    expect(stageOf('apps-web', 'building')).toBe('2023-01-04');
    expect(stageOf('packages-evals', 'building')).toBe('2023-07-03');
  });

  it('working by quiet: enough work, then 21 days without a commit, dated when the quiet was complete', () => {
    expect(stageOf('apps-web', 'working')).toBe('2023-04-12'); // last weekly commit 22 March
    expect(stageOf('apps-api', 'working')).toBe('2023-03-12'); // last commit 19 February
  });

  it('working by release, when that comes before the quiet does', () => {
    expect(stageOf('packages-db', 'working')).toBe('2023-06-01'); // quiet alone would say 16 June
  });

  it('never working: too few commits, a single week, or still busy with no release since it began', () => {
    expect(stageOf('packages-evals', 'working')).toBeUndefined(); // 3 commits
    expect(stageOf('infra', 'working')).toBeUndefined(); // 20 commits, one week
    expect(stageOf('apps-mobile', 'working')).toBeUndefined(); // 10 commits, 3 weeks, no pause, release long before
  });

  it('working by sustained work: twenty commits over three weeks, dated at the commit that completes both', () => {
    expect(stageOf('apps-live', 'working')).toBe('2025-03-01');
  });

  it('mature after three returns, 180 days on', () => {
    expect(stageOf('apps-web', 'mature')).toBe('2024-10-08');
    expect(stageOf('apps-api', 'mature')).toBeUndefined();
  });

  it('inferStages, rule by rule', () => {
    const W = INFERENCE.working;
    const days = (from: string, n: number, step: number) => Array.from({ length: n }, (_, i) => addDays(from, i * step));
    expect(inferStages([], [], TODAY)).toBeNull();

    // One short of enough commits.
    expect(inferStages(days('2024-01-01', W.minCommits - 1, 3), [], TODAY)).toEqual({ building: '2024-01-01' });
    // Enough commits, one week.
    expect(inferStages(days('2024-01-01', 30, 0), ['2024-02-01'], TODAY)).toEqual({ building: '2024-01-01' });
    // Enough, still going on the day of the sync: no quiet yet.
    expect(inferStages(days(addDays(TODAY, -28), 15, 2), [], TODAY)!.working).toBeUndefined();
    // Quiet one day short, then exactly long enough.
    const last = addDays('2024-01-01', (W.minCommits - 1) * 3);
    expect(inferStages(days('2024-01-01', W.minCommits, 3), [], addDays(last, W.quietDays - 1))!.working).toBeUndefined();
    expect(inferStages(days('2024-01-01', W.minCommits, 3), [], addDays(last, W.quietDays))!.working).toBe(addDays(last, W.quietDays));
    // A pause BEFORE there was enough does not count; the one after does.
    const paused = [...days('2024-01-01', 3, 1), ...days('2024-03-01', 6, 1), ...days('2024-06-01', 2, 1)];
    expect(inferStages(paused, [], TODAY)!.working).toBe(addDays('2024-03-06', W.quietDays));
    // A release before the first commit is not this feature's; one after counts from the day there was enough.
    expect(inferStages(days(addDays(TODAY, -28), 15, 2), ['2020-01-01'], TODAY)!.working).toBeUndefined();
    // Sustained work, with no release and no pause. 2025-02-10 is a Monday.
    const S = INFERENCE.working;
    const daily = (n: number) => days('2025-02-10', n, 1);
    expect(inferStages(daily(S.sustainedCommits - 1), [], '2025-03-01')!.working).toBeUndefined(); // 19 commits, three weeks
    expect(inferStages(daily(S.sustainedCommits), [], '2025-03-01')!.working).toBe('2025-03-01'); // the 20th commit
    // Twenty commits inside two weeks are not sustained; the first commit of a third week completes it.
    const burst = [...days('2025-02-10', 10, 0), ...days('2025-02-17', 10, 0)];
    expect(inferStages(burst, [], '2025-02-25')!.working).toBeUndefined();
    expect(inferStages([...burst, '2025-02-25'], [], '2025-02-25')!.working).toBe('2025-02-25');
    // An earlier route still wins: a release before the 20th commit dates the stage.
    expect(inferStages(daily(24), ['2025-02-20'], '2025-03-05')!.working).toBe('2025-02-20');
    const early = inferStages(days('2024-01-01', 20, 2), ['2024-01-03'], TODAY)!;
    expect(early.working).toBe('2024-01-15'); // the eighth commit, in the third week
    // Returned to twice only: not mature. Three times within 180 days: not mature.
    const base = days('2024-01-01', 10, 2);
    expect(inferStages([...base, '2024-04-01', '2024-06-01'], [], '2025-03-10')!.mature).toBeUndefined();
    expect(inferStages([...base, '2024-03-01', '2024-04-10', '2024-05-20'], [], '2025-03-10')!.mature).toBeUndefined();
    expect(inferStages([...base, '2024-03-01', '2024-04-10', '2024-05-20', '2024-08-01'], [], '2025-03-10')!.mature).toBe('2024-08-01');
  });

  it('stages each feature at most once per stage, in order', () => {
    const seen = new Map<string, string[]>();
    for (const e of ofType(events, 'feature.staged')) {
      const key = `${e.place}/${e.feature}`;
      seen.set(key, [...(seen.get(key) ?? []), `${e.at} ${e.stage}`]);
    }
    for (const list of seen.values()) {
      const stages = list.map((s) => s.split(' ')[1]);
      expect(new Set(stages).size).toBe(stages.length);
      const dates = ['building', 'working', 'mature'].map((s) => list.find((l) => l.endsWith(s))?.split(' ')[0]).filter(Boolean);
      expect(dates.slice().sort()).toEqual(dates);
    }
  });
});

describe('githubEvents: through derive', () => {
  const world = derive(mergeEvents([events]), catalogue, TODAY);
  const place = (id: string) => world.places.find((p) => p.id === id)!;

  it('gives sane ranks', () => {
    const big = place(PLACE);
    expect(rankIndex(big.rank)).toBeGreaterThanOrEqual(rankIndex('town'));
    expect(big.features.filter((f) => f.stage === 'working' || f.stage === 'mature')).toHaveLength(4);
    expect(big.features.find((f) => f.id === 'apps-web')!.stage).toBe('mature');
    expect(big.features.find((f) => f.id === 'apps-mobile')!.stage).toBe('building');
    expect(big.releases).toEqual([{ at: '2023-06-01', name: 'First season' }]);
    expect(big.liveliness).toBe('building');
    expect(place('gh-pat-scratch').rank).toBe('outpost');
  });

  it('draws the archived repository as ruins', () => {
    const old = place('gh-pat-old-ledger');
    expect(old.liveliness).toBe('ruins');
    expect(old.abandonedNote).toBe('Archived on GitHub.');
    expect(old.revived).toBe(false);
  });

  it('shows no stage in an earlier edition that could not have been known then', () => {
    const then = derive(mergeEvents([events]), catalogue, '2023-04-11');
    const web0 = then.places.find((p) => p.id === PLACE)!.features.find((f) => f.id === 'apps-web')!;
    expect(web0.stage).toBe('building');
    expect(isoDay(FETCHED)).toBe(TODAY);
  });
});
