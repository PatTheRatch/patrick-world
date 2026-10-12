// Application state. The log and the edition date are the only inputs; the world,
// its plans and its roads are all computed from them.

import { computed, effect, signal } from '@preact/signals';
import { fabricCount, planCity } from '../plan/settlement';
import { planRoads } from '../plan/roads';
import { buildTerrain } from '../plan/terrain';
import type { CityPlan, RoadPlan } from '../plan/types';
import type { Draft, Selection } from '../render/renderer';
import { overlayBuilds } from '../world/buildlog';
import { derive } from '../world/derive';
import { buildFixtureEvents } from '../world/fixtures/builds';
import { fixtureBuilds, openBuildLog, recordedBuilds } from './builds';
import { inferWays } from '../world/ways';
import { catalogue } from '../world/fixtures/catalogue';
import { FIXTURE_TODAY } from '../world/fixtures/world';
import { mergeEvents } from '../world/sources';
import { FixtureSource } from '../world/sources/fixture';
import { GitHubSource } from '../world/sources/github';
import { MANUAL_EVENTS_GITHUB_KEY, ManualSource } from '../world/sources/manual';
import { stressEvents } from '../world/sources/stress';
import { isoDay } from '../world/time';
import type { FeatureKind, FeatureStage, PlaceState, Point, WorldEvent } from '../world/types';

export { catalogue };
export const terrain = buildTerrain(catalogue, 'patricks-world');

const fixture = new FixtureSource();
export const github = new GitHubSource(catalogue, terrain.isLand);
/** The owner's own marks. Each sheet keeps its own: `load` swaps this for the GitHub sheet's. */
export let manual = new ManualSource();

/**
 * Which sheet is on the table. The two never mix: the specimen is fiction, the GitHub
 * sheet is surveyed, and a map that showed both could not be trusted on either.
 */
export const worldKind = signal<'specimen' | 'github'>('specimen');
/** When the GitHub record was fetched (ISO timestamp); null for the specimen. */
export const surveyedAt = signal<string | null>(null);

/**
 * The present, as an ISO day. For the specimen it is the day its fiction is written up
 * to; for GitHub it is the day of the sync, since nothing later is known. Read `.value`.
 */
export const TODAY = computed(() =>
  worldKind.value === 'github' && surveyedAt.value !== null ? isoDay(surveyedAt.value) : FIXTURE_TODAY,
);

/** The base sheet: the fixture's events, or GitHub's. Never both. */
const baseEvents = signal<WorldEvent[]>([]);
const manualEvents = signal<WorldEvent[]>([]);
export const loaded = signal(false);

export const events = computed(() => mergeEvents([baseEvents.value, manualEvents.value]));
/** Every build event: the specimen's scripted build, and whatever has been recorded here. */
export const buildEvents = computed(() => [...fixtureBuilds.value, ...recordedBuilds.value]);
export const hasManual = computed(() => manualEvents.value.length > 0);

/** The edition being shown. `load` sets it to the present of whichever sheet it finds. */
export const asOf = signal(TODAY.value);
export const isPresent = computed(() => asOf.value >= TODAY.value);

/** Milliseconds the last derivation took, for `?perf`. */
export const deriveMs = signal(0);

export const world = computed(() => {
  const t0 = performance.now();
  const state = derive(events.value, catalogue, asOf.value);
  // Tracks between places that share methods: inferred, and marked so.
  state.links = [...state.links, ...inferWays(state.places, state.links)];
  // Build plans and what builders reported, laid over the inferred world.
  const built = overlayBuilds(state, buildEvents.value, asOf.value);
  deriveMs.value = performance.now() - t0;
  return built;
});

/** The world as it stands today, whatever edition is on screen. */
export const present = computed(() =>
  isPresent.value ? world.value : overlayBuilds(derive(events.value, catalogue, TODAY.value), buildEvents.value, TODAY.value),
);

// Scrubbing revisits the same states over and over, so plans are kept per place and state.
const planCache = new Map<string, Map<string, CityPlan>>();
const planKey = (p: PlaceState) =>
  `${p.rank}|${p.users}|${fabricCount(p.commits, p.users, p.activeWeeks)}|${p.features.map((f) => `${f.id}${f.stage[0]}${f.storeys}`).join(',')}`;

export const plans = computed(() => {
  const out = new Map<string, CityPlan>();
  for (const place of world.value.places) {
    const key = planKey(place);
    let known = planCache.get(place.id);
    if (!known) planCache.set(place.id, (known = new Map()));
    let plan = known.get(key);
    if (!plan) {
      if (known.size > 400) known.clear();
      plan = planCity(place);
      known.set(key, plan);
    }
    out.set(place.id, plan);
  }
  return out;
});

let roadCache: { key: string; roads: RoadPlan[] } = { key: '', roads: [] };
export const roads = computed(() => {
  const w = world.value;
  const key = w.links.map((l) => l.id).join('|');
  if (key !== roadCache.key) roadCache = { key, roads: planRoads(w.links, w.places, terrain) };
  return roadCache.roads;
});

// ───────────────────────── What the surveyor is looking at ─────────────────────────

export const selection = signal<Selection>(null);
export const hover = signal<Selection>(null);
export const method = signal<string | null>(null);
export const draft = signal<Draft>(null);
export const keyOpen = signal(false);
/** Which part of the Key to open on. */
export const keySection = signal<'top' | 'methods'>('top');

export type Capture =
  | { type: 'site'; at: Point; screen: Point }
  | { type: 'lot'; place: string }
  | { type: 'road'; from: string }
  | null;
export const capture = signal<Capture>(null);

/** Where the camera is, in words, for the cartouche. */
export const whereabouts = signal<{ region?: string; place?: string }>({});

export const selectedPlace = computed(() => {
  const s = selection.value;
  if (!s) return null;
  const id = s.type === 'place' ? s.id : s.place;
  return world.value.places.find((p) => p.id === id) ?? null;
});

export const selectedFeature = computed(() => {
  const s = selection.value;
  if (s?.type !== 'feature') return null;
  return selectedPlace.value?.features.find((f) => f.id === s.id) ?? null;
});

// Leaving the present puts down whatever the hand was in the middle of.
effect(() => {
  if (!isPresent.value && (capture.peek() || draft.peek())) {
    capture.value = null;
    draft.value = null;
  }
});

// ───────────────────────── Loading ─────────────────────────

export async function load() {
  const params = new URLSearchParams(location.search);
  // `?world=specimen` asks for the fiction even when a GitHub record is present.
  const surveyed = params.get('world') === 'specimen' ? [] : await github.load();
  if (surveyed.length > 0) {
    baseEvents.value = surveyed;
    surveyedAt.value = github.fetchedAt;
    worldKind.value = 'github';
    // Marks made on the fiction do not belong on the survey, nor the other way round.
    manual = new ManualSource(undefined, MANUAL_EVENTS_GITHUB_KEY);
  } else {
    const base = await fixture.load();
    const copies = Number(params.get('stress') ?? 0);
    baseEvents.value = copies > 0 ? [...base, ...stressEvents(base, Math.min(copies, 40), catalogue)] : base;
    surveyedAt.value = null;
    worldKind.value = 'specimen';
    fixtureBuilds.value = copies > 0 ? [] : buildFixtureEvents();
  }
  openBuildLog(worldKind.value, () => TODAY.value, () => isPresent.value);
  asOf.value = TODAY.value;
  manualEvents.value = await manual.load();
  manual.subscribe?.(() => {
    manualEvents.value = manual.all();
  });
  loaded.value = true;
}

// ───────────────────────── Adding to the world ─────────────────────────
// Each of these appends events. None of them sets a status.

let serial = 0;
const newId = (prefix: string) => `manual-${prefix}-${Date.now().toString(36)}-${(serial++).toString(36)}`;

const slug = (name: string) =>
  name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 32) || 'site';

function record(list: WorldEvent[]) {
  // An earlier edition is a record, not a draft: nothing is written while looking at the past.
  if (!isPresent.value) return;
  manual.add(list);
  manualEvents.value = manual.all();
}

export function markSite(name: string, note: string, at: Point): string {
  let region = catalogue.regions[0]!;
  let best = Infinity;
  for (const r of catalogue.regions) {
    const d = Math.hypot(at.x - r.center.x, at.y - r.center.y) / r.radius;
    if (d < best) {
      best = d;
      region = r;
    }
  }
  const place = `${slug(name)}-${Date.now().toString(36)}`;
  record([
    {
      id: newId('founded'),
      at: TODAY.value,
      source: 'manual',
      type: 'place.founded',
      place,
      name,
      region: region.id,
      position: { x: Math.round(at.x), y: Math.round(at.y) },
      note,
    },
  ]);
  return place;
}

export function stakeLot(place: string, name: string, kind: FeatureKind): string {
  const feature = `${slug(name)}-${Date.now().toString(36)}`;
  record([
    {
      id: newId('proposed'),
      at: TODAY.value,
      source: 'manual',
      type: 'feature.proposed',
      place,
      feature,
      name,
      kind,
      methods: [],
    },
  ]);
  return feature;
}

export function surveyRoad(a: string, b: string) {
  if (a === b) return;
  if (world.value.links.some((l) => (l.a === a && l.b === b) || (l.a === b && l.b === a))) return;
  record([{ id: newId('link'), at: TODAY.value, source: 'manual', type: 'link.formed', a, b, kind: 'related' }]);
}

export function recordStage(place: string, feature: string, stage: FeatureStage) {
  record([{ id: newId('staged'), at: TODAY.value, source: 'manual', type: 'feature.staged', place, feature, stage }]);
}

export function clearManual() {
  if (!isPresent.value) return;
  manual.clear();
  manualEvents.value = manual.all();
  selection.value = null;
}
