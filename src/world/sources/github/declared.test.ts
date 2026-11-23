import { describe, expect, it } from 'vitest';
import { buildTerrain } from '../../../plan/terrain';
import { derive } from '../../derive';
import { catalogue } from '../../fixtures/catalogue';
import { addDays } from '../../time';
import type { WorldEvent } from '../../types';
import { declaredStages, readDeclared } from './declared';
import type { GithubCommit, GithubDefinition, GithubRaw, GithubRepo } from './raw';
import { githubEvents, placeId, surveyGithub } from './transform';

const FETCHED = '2025-03-10T09:00:00Z';
const TODAY = '2025-03-10';
const terrain = buildTerrain(catalogue, 'patricks-world');

let serial = 0;
function commit(date: string, author: string | null = 'pat'): GithubCommit {
  return { sha7: `d${(serial++).toString(16).padStart(6, '0')}`, date: `${date}T12:00:00Z`, author, authorName: 'Pat Owner', message: 'work' };
}
const run = (from: string, count: number, stepDays: number): GithubCommit[] =>
  Array.from({ length: count }, (_, i) => commit(addDays(from, i * stepDays)));

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

/** A definition's history: each entry is the whole file as it stood on that day. */
function definition(...revisions: [day: string, file: unknown][]): GithubDefinition {
  return {
    path: 'patrick-world.json',
    revisions: revisions.map(([day, file], i) => ({ sha7: `r${i}`, date: `${day}T10:00:00Z`, text: typeof file === 'string' ? file : JSON.stringify(file) })),
  };
}

const raw = (...repos: GithubRepo[]): GithubRaw => ({ version: 4, fetchedAt: FETCHED, accounts: ['pat'], repos });
const survey = (...repos: GithubRepo[]) => surveyGithub(raw(...repos), catalogue, terrain.isLand);
const world = (events: WorldEvent[], asOf = TODAY) => derive(events, catalogue, asOf);

// ───────────────────────── A city that describes itself ─────────────────────────
//
// The same commits read two ways. Left to guess, GitHub would see directories `judge`,
// `ingest` and `web`. The owner says there are four features, one of them not yet begun.

const judge = run('2024-01-08', 12, 7); // weekly to 2024-03-25, then quiet: inferred working 2024-04-15
const ingest = run('2024-02-05', 10, 3); // to 2024-03-03, then quiet: inferred working 2024-03-24
const scoring = run('2024-02-12', 4, 2); // too few to be inferred working
const web = run('2025-02-24', 6, 2); // to the day of the sync: building

const boxoutFile = {
  version: 1,
  id: 'boxout',
  name: 'Boxout Fantasy',
  what: 'Fantasy basketball, judged honestly.',
  region: 'the-court',
  features: [
    { id: 'trade-judge', name: 'Trade judge', kind: 'observatory', stage: 'working', paths: ['src/judge', 'src/scoring'], methods: ['statistics', 'alchemy'] },
    { id: 'box-scores', name: 'Box scores', kind: 'reservoir', stage: 'building', paths: ['src/ingest'], ward: 'The yard' },
    { id: 'league-page', name: 'League page', kind: 'frontage', stage: 'planned', paths: ['src/web'] },
    { id: 'draft-room', name: 'Draft room', kind: 'frontage', stage: 'planned', note: 'An auction you can rehearse.' },
  ],
  links: [
    { to: 'patrick-os', kind: 'feeds', carries: 'league context' },
    { to: 'nowhere-yet', kind: 'related' },
  ],
};

const boxout = repo({
  name: 'fantasy-ball-is-life',
  created_at: '2024-01-05T10:00:00Z',
  languages: { Python: 100 },
  tree: { root: [{ path: 'src', type: 'tree' }, { path: 'patrick-world.json', type: 'blob' }], inside: { src: ['judge', 'ingest', 'scoring', 'web'].map((path) => ({ path, type: 'tree' })) } },
  paths: {
    'src/judge': { commits: judge },
    'src/ingest': { commits: ingest },
    'src/scoring': { commits: scoring },
    'src/web': { commits: web },
  },
  commits: [...judge, ...ingest, ...scoring, ...web, commit('2024-01-06')],
  definition: definition(
    // First written with the draft room only an idea and no links.
    ['2025-01-10', { ...boxoutFile, links: undefined, features: boxoutFile.features.map((f) => (f.id === 'draft-room' ? { ...f, stage: 'concept' } : f)) }],
    ['2025-02-01', boxoutFile],
  ),
});

// A neighbour with no file of its own, linked to by its repository's name.
const os = repo({ name: 'patrick-os', created_at: '2024-06-01T10:00:00Z', commits: run('2024-06-02', 3, 1) });

describe('a city that describes itself', () => {
  const { events, described, notes } = survey(boxout, os);
  const place = world(events).places.find((p) => p.id === placeId(boxout))!;
  const feature = (id: string) => place.features.find((f) => f.id === id)!;

  it('takes its name, its words and its country from the file', () => {
    expect(place.name).toBe('Boxout Fantasy');
    expect(place.note).toBe('Fantasy basketball, judged honestly.');
    expect(place.region).toBe('the-court');
    expect(described).toBe(1);
  });

  it('has the features the owner named, and none GitHub would have guessed', () => {
    expect(place.features.map((f) => f.id).sort()).toEqual(['box-scores', 'draft-room', 'league-page', 'trade-judge']);
    expect(feature('trade-judge').name).toBe('Trade judge');
    expect(feature('box-scores').ward).toBe('The yard');
    expect(feature('draft-room').note).toBe('An auction you can rehearse.');
  });

  it('gathers a feature’s work from every path it names', () => {
    expect(feature('trade-judge').commits).toBe(judge.length + scoring.length);
    expect(feature('box-scores').commits).toBe(ingest.length);
    // Every commit is counted once: what touched no declared path is the place's own.
    expect(place.commits).toBe(boxout.commits.length);
  });

  it('holds back a feature the commits would call finished', () => {
    // Three quiet weeks after enough work reads as "working"; the owner says it is not.
    expect(feature('box-scores').stage).toBe('building');
    expect(feature('box-scores').stagedAt.working).toBeUndefined();
  });

  it('keeps the commits’ own dates where they agree with the owner', () => {
    expect(feature('trade-judge').stage).toBe('working');
    expect(feature('trade-judge').stagedAt.building).toBe('2024-01-08');
    expect(feature('trade-judge').stagedAt.working).toBe('2024-04-15');
  });

  it('draws work that has started as building, though the file still says planned', () => {
    expect(feature('league-page').stage).toBe('building');
    expect(feature('league-page').proposedAt).toBe('2025-01-10');
  });

  it('stands a planned feature on the map with no commits at all', () => {
    expect(feature('draft-room').stage).toBe('planned');
    expect(feature('draft-room').commits).toBe(0);
  });

  it('dates each claim by the commit that made it, so the dial can be turned back past it', () => {
    const at = (day: string) => world(events, day).places.find((p) => p.id === placeId(boxout))?.features.find((f) => f.id === 'draft-room');
    expect(at('2025-01-09')).toBeUndefined();
    expect(at('2025-01-20')?.stage).toBe('concept');
    expect(at('2025-02-01')?.stage).toBe('planned');
  });

  it('marks what only the file says as declared, and what the commits say as GitHub’s', () => {
    const staged = events.filter((e) => e.type === 'feature.staged');
    const source = (feature: string, stage: string) => staged.find((e) => e.feature === feature && e.stage === stage)?.source;
    expect(source('trade-judge', 'working')).toBe('github');
    expect(source('draft-room', 'planned')).toBe('declared');
    expect(events.filter((e) => e.type === 'work.logged').every((e) => e.source === 'github')).toBe(true);
  });

  it('draws a link to a neighbour, dated the day the file first drew it', () => {
    const links = events.filter((e) => e.type === 'link.formed');
    expect(links).toHaveLength(1);
    expect(links[0]).toMatchObject({ a: placeId(boxout), b: placeId(os), kind: 'feeds', carries: 'league context', at: '2025-02-01', source: 'declared' });
    expect(world(events).links).toHaveLength(1);
  });

  it('says what the owner would want to know', () => {
    expect(notes).toEqual([
      'pat/fantasy-ball-is-life: "trade-judge" names what the Key of Methods does not have: alchemy.',
      'pat/fantasy-ball-is-life: It links to "nowhere-yet", which no repository answers to yet.',
    ]);
    expect(feature('trade-judge').methods).toEqual(['statistics']);
  });

  it('gives the same events with the same ids every time', () => {
    const again = githubEvents(raw(boxout, os), catalogue, terrain.isLand);
    expect(again).toEqual(events);
    expect(new Set(events.map((e) => e.id)).size).toBe(events.length);
  });

  it('never moves a lot when the file is edited again', () => {
    const order = () => world(survey(later, os).events).places.find((p) => p.id === placeId(boxout))!.features.map((f) => [f.id, f.order]);
    // A later revision reorders the file, promotes the draft room and adds a feature.
    const later = {
      ...boxout,
      definition: definition(...(boxout.definition!.revisions.map((r) => [r.date!.slice(0, 10), r.text]) as [string, string][]), [
        '2025-03-01',
        {
          ...boxoutFile,
          features: [
            { id: 'waiver-wire', name: 'Waiver wire', kind: 'works', stage: 'concept' },
            ...boxoutFile.features.slice().reverse().map((f) => (f.id === 'draft-room' ? { ...f, stage: 'designed' } : f)),
          ],
        },
      ]),
    };
    const before = new Map(place.features.map((f) => [f.id, f.order]));
    for (const [id, lot] of order()) if (before.has(id as string)) expect(lot, String(id)).toBe(before.get(id as string));
    expect(order().find(([id]) => id === 'waiver-wire')?.[1]).toBe(4);
  });
});

describe('a definition that only says who the city is', () => {
  const quiet = repo({
    ...boxout,
    name: 'fantasy-ball-is-life',
    definition: definition(['2025-02-01', { version: 1, id: 'boxout', name: 'Boxout Fantasy', what: 'Fantasy basketball.', region: 'atlantis', features: [] }]),
  });
  const { events, notes } = survey(quiet);
  const place = world(events).places[0]!;

  it('keeps the name and goes on guessing features from directories', () => {
    expect(place.name).toBe('Boxout Fantasy');
    expect(place.features.map((f) => f.id).sort()).toEqual(['src-ingest', 'src-judge', 'src-scoring', 'src-web']);
  });

  it('falls back to the guessed country when the map does not have the one named', () => {
    expect(catalogue.regions.map((r) => r.id)).toContain(place.region);
    expect(notes).toEqual([expect.stringContaining('The map has no region "atlantis"')]);
  });
});

describe('a definition that does not read', () => {
  it('leaves the city guessed at, and says why', () => {
    const { events, described, notes } = survey(repo({ ...boxout, definition: definition(['2025-02-01', '{ "version": 1, ']) }));
    expect(described).toBe(0);
    expect(world(events).places[0]!.name).toBe('Fantasy Ball Is Life');
    expect(notes).toEqual([expect.stringContaining('patrick-world.json could not be read')]);
  });

  it('draws the last revision that did read when the newest is broken', () => {
    const { events, described, notes } = survey(repo({ ...boxout, definition: definition(['2025-02-01', boxoutFile], ['2025-03-01', { ...boxoutFile, version: 9 }]) }), os);
    expect(described).toBe(1);
    expect(world(events).places.find((p) => p.id === placeId(boxout))!.name).toBe('Boxout Fantasy');
    expect(notes[0]).toContain('The newest patrick-world.json could not be read, so the one before it is drawn: "version" must be 1.');
  });
});

describe('a city that says what it receives', () => {
  it('draws the feed from the other city to this one', () => {
    const file = { version: 1, id: 'reader', name: 'Reader', what: 'A city.', features: [], links: [{ to: 'patrick-os', kind: 'fed-by', carries: 'ideas' }] };
    const reader = repo({ name: 'reader', created_at: '2024-08-01T10:00:00Z', commits: [commit('2024-08-02')], definition: definition(['2025-01-01', file]) });
    const { events } = survey(reader, os);
    expect(events.find((e) => e.type === 'link.formed')).toMatchObject({ a: placeId(os), b: placeId(reader), kind: 'feeds', carries: 'ideas' });
  });
});

describe('two cities claiming one id', () => {
  it('leaves the id with the elder', () => {
    const file = (id: string, links?: unknown) => ({ version: 1, id, name: id, what: 'A city.', features: [], links });
    const elder = repo({ name: 'elder', created_at: '2022-01-01T10:00:00Z', commits: [commit('2022-01-02')], definition: definition(['2025-01-01', file('shared')]) });
    const younger = repo({ name: 'younger', created_at: '2023-01-01T10:00:00Z', commits: [commit('2023-01-02')], definition: definition(['2025-01-01', file('shared')]) });
    const third = repo({
      name: 'third',
      created_at: '2024-01-01T10:00:00Z',
      commits: [commit('2024-01-02')],
      definition: definition(['2025-01-01', file('third', [{ to: 'shared', kind: 'related' }])]),
    });
    const { events, notes } = survey(younger, third, elder);
    expect(events.find((e) => e.type === 'link.formed')).toMatchObject({ a: placeId(third), b: placeId(elder) });
    expect(notes).toEqual(['pat/younger: Its id "shared" already belongs to an older city; links to it go there.']);
  });
});

describe('reading a definition through its history', () => {
  it('has nothing to say of a repository with no file', () => {
    expect(readDeclared(undefined, TODAY)).toEqual({ city: null });
  });

  it('never dates a claim after the sync, nor before a revision it follows', () => {
    const file = (stage: string) => ({ version: 1, id: 'x', name: 'X', what: 'A city.', features: [{ id: 'a', name: 'A', kind: 'works', stage }] });
    const { city } = readDeclared(definition(['2025-02-10', file('concept')], ['2025-02-01', file('planned')], ['2026-01-01', file('designed')]), TODAY);
    expect(city?.claims.get('a')).toEqual([
      { at: '2025-02-10', stage: 'concept' },
      { at: '2025-02-10', stage: 'planned' },
      { at: TODAY, stage: 'designed' },
    ]);
  });
});

describe('the stages of a declared feature', () => {
  const inferred = { building: '2024-01-08', working: '2024-04-15', mature: '2024-12-01' };

  it('counts the owner’s claim from the day it was made, when that is before the commits would show it', () => {
    expect(declaredStages([{ at: '2024-02-01', stage: 'working' }], inferred, TODAY)).toEqual([
      { stage: 'building', at: '2024-01-08', source: 'github' },
      { stage: 'working', at: '2024-02-01', source: 'declared' },
    ]);
  });

  it('dates a stage only the owner vouches for by the day the file said so', () => {
    expect(declaredStages([{ at: '2025-02-01', stage: 'mature' }], { building: '2024-01-08', working: '2024-04-15' }, TODAY)).toEqual([
      { stage: 'building', at: '2024-01-08', source: 'github' },
      { stage: 'working', at: '2024-04-15', source: 'github' },
      { stage: 'mature', at: '2025-02-01', source: 'declared' },
    ]);
    expect(declaredStages([{ at: '2025-02-01', stage: 'working' }], null, TODAY)).toEqual([{ stage: 'working', at: '2025-02-01', source: 'declared' }]);
  });

  it('keeps what was planned before the work began, and stops there once it has', () => {
    const claims = [
      { at: '2023-11-01', stage: 'concept' as const },
      { at: '2023-12-01', stage: 'planned' as const },
      { at: '2024-06-01', stage: 'designed' as const },
    ];
    expect(declaredStages(claims, { building: '2024-01-08' }, TODAY)).toEqual([
      { stage: 'concept', at: '2023-11-01', source: 'declared' },
      { stage: 'planned', at: '2023-12-01', source: 'declared' },
      { stage: 'building', at: '2024-01-08', source: 'github' },
    ]);
  });
});
