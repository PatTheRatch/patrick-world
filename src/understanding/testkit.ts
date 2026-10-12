// Shared by the tests in this directory. Not imported by the app.

import { buildTerrain } from '../plan/terrain';
import type { BuildPlan, BuildState } from '../world/build';
import { derive } from '../world/derive';
import { catalogue } from '../world/fixtures/catalogue';
import { fixtureEvents } from '../world/fixtures/world';
import type { GithubRaw } from '../world/sources/github/raw';
import { githubEvents } from '../world/sources/github/transform';
import { isoDay } from '../world/time';
import type { FeatureState, PlaceState, WorldState } from '../world/types';
import type { ResumePoint, WorldSuggestion } from './resume';

export const TODAY = '2026-10-12';

/** A feature with nothing done to it; override what the test is about. */
export function feature(over: Partial<FeatureState> & { id: string }): FeatureState {
  return {
    place: 'p',
    name: over.id,
    kind: 'works',
    methods: [],
    stage: 'concept',
    order: 0,
    proposedAt: '2026-01-04',
    stagedAt: {},
    commits: 0,
    storeys: 1,
    progress: 0,
    heat: 0,
    landmark: false,
    ...over,
  };
}

/** A feature in `building` with work logged. */
export function building(id: string, over: Partial<FeatureState> = {}): FeatureState {
  return feature({ id, stage: 'building', commits: 12, progress: 0.3, lastWorkAt: '2026-10-04', stagedAt: { building: '2026-08-02' }, ...over });
}

/** A feature that stands. */
export function working(id: string, over: Partial<FeatureState> = {}): FeatureState {
  return feature({ id, stage: 'working', commits: 40, progress: 1, lastWorkAt: '2026-03-01', builtOrder: 1, stagedAt: { building: '2025-11-02', working: '2026-01-11' }, ...over });
}

export function place(over: Partial<PlaceState> = {}): PlaceState {
  const features = over.features ?? [];
  let lastWorkAt: string | undefined;
  for (const f of features) if (f.lastWorkAt !== undefined && (lastWorkAt === undefined || f.lastWorkAt > lastWorkAt)) lastWorkAt = f.lastWorkAt;
  const base: PlaceState = {
    id: 'p',
    name: 'Testville',
    formerNames: [],
    region: 'the-commons',
    position: { x: 0, y: 0 },
    note: 'A test place.',
    notes: [],
    rank: 'outpost',
    liveliness: 'building',
    heat: 0.5,
    foundedAt: '2025-06-01',
    revived: false,
    commits: features.reduce((n, f) => n + f.commits, 0),
    activeWeeks: 6,
    users: 0,
    revenue: 0,
    features,
    releases: [],
    series: [],
  };
  if (lastWorkAt !== undefined) base.lastWorkAt = lastWorkAt;
  return { ...base, ...over };
}

export function plan(over: Partial<BuildPlan> = {}): BuildPlan {
  return {
    place: 'p',
    feature: 'f',
    revision: 1,
    objective: 'Value every keeper against this league.',
    criteria: [
      { id: 'c1', statement: 'Values match the 2025 auction within two dollars', verification: { kind: 'command', how: 'pytest tests/keepers' } },
      { id: 'c2', statement: 'The sheet opens on a phone', verification: { kind: 'manual', how: 'Open it on the phone' } },
    ],
    steps: [
      { id: 's1', title: 'Load last season\'s auction prices' },
      { id: 's2', title: 'Fit the keeper discount', after: ['s1'] },
      { id: 's3', title: 'Render the sheet', after: ['s2'] },
    ],
    dependsOn: [],
    ...over,
  };
}

/** A build state with a plan and nothing started; override what the test is about. */
export function build(over: Partial<BuildState> = {}): BuildState {
  return {
    stage: 'ready',
    plan: plan(),
    stepsDone: [],
    stepsStarted: [],
    criteriaPassed: [],
    criteriaFailed: [],
    openBlockers: [],
    waitingOn: [],
    progress: 0,
    because: '',
    rewrites: [],
    ...over,
  };
}

export function world(places: PlaceState[], asOf: string = TODAY): WorldState {
  return { asOf, places, links: [], methods: [], beginsAt: '2023-01-01' };
}

export const specimen = (): WorldState => derive(fixtureEvents(), catalogue, TODAY);

interface Fs {
  existsSync(path: string): boolean;
  readFileSync(path: string, encoding: string): string;
}

/** Node's fs, reached without a type dependency on Node. Paths are from the project root. */
export async function nodeFs(): Promise<Fs> {
  const name = 'node:fs';
  return (await import(/* @vite-ignore */ name)) as Fs;
}

/** A JSON file under public/data, or undefined when it is not there (it is private and git-ignored). */
export async function privateJson(name: string): Promise<unknown> {
  const fs = await nodeFs();
  const path = `public/data/${name}`;
  if (!fs.existsSync(path)) return undefined;
  return JSON.parse(fs.readFileSync(path, 'utf8')) as unknown;
}

/** The owner's real world, derived as the app derives it, or undefined when there is no record. */
export async function realWorld(): Promise<{ raw: GithubRaw; world: WorldState; today: string } | undefined> {
  const raw = (await privateJson('github.json')) as GithubRaw | undefined;
  if (raw === undefined) return undefined;
  const terrain = buildTerrain(catalogue, 'patricks-world');
  const today = isoDay(raw.fetchedAt);
  return { raw, world: derive(githubEvents(raw, catalogue, terrain.isLand), catalogue, today), today };
}

/** Every string a suggestion would put in front of the owner. */
export function strings(s: ResumePoint | WorldSuggestion): string[] {
  return [s.title, s.because, ...s.evidence.map((e) => e.what), ...s.evidence.map((e) => e.source)];
}

export function freeze<T>(value: T): T {
  if (typeof value === 'object' && value !== null && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const v of Object.values(value)) freeze(v);
  }
  return value;
}
