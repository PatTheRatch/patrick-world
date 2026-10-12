// Application state. The log and the edition date are the only inputs; the world,
// its plans and its roads are all computed from them.

import { computed, signal } from '@preact/signals';
import { planCity } from '../plan/city';
import { planRoads } from '../plan/roads';
import { buildTerrain } from '../plan/terrain';
import type { CityPlan, RoadPlan } from '../plan/types';
import type { Draft, Selection } from '../render/renderer';
import { derive } from '../world/derive';
import { catalogue } from '../world/fixtures/catalogue';
import { mergeEvents } from '../world/sources';
import { FixtureSource } from '../world/sources/fixture';
import { ManualSource } from '../world/sources/manual';
import { stressEvents } from '../world/sources/stress';
import type { FeatureKind, FeatureStage, PlaceState, Point, WorldEvent } from '../world/types';

/**
 * The present. The fixture history is written up to this day; with real sources
 * connected this becomes the actual date.
 */
export const TODAY = '2026-10-12';

export { catalogue };
export const terrain = buildTerrain(catalogue, 'patricks-world');

const fixture = new FixtureSource();
export const manual = new ManualSource();

const fixtureEvents = signal<WorldEvent[]>([]);
const manualEvents = signal<WorldEvent[]>([]);
export const loaded = signal(false);

export const events = computed(() => mergeEvents([fixtureEvents.value, manualEvents.value]));
export const hasManual = computed(() => manualEvents.value.length > 0);

/** The edition being shown. */
export const asOf = signal(TODAY);
export const isPresent = computed(() => asOf.value >= TODAY);

/** Milliseconds the last derivation took, for `?perf`. */
export const deriveMs = signal(0);

export const world = computed(() => {
  const t0 = performance.now();
  const state = derive(events.value, catalogue, asOf.value);
  deriveMs.value = performance.now() - t0;
  return state;
});

/** The world as it stands today, whatever edition is on screen. */
export const present = computed(() => (isPresent.value ? world.value : derive(events.value, catalogue, TODAY)));

const planCache = new Map<string, { key: string; plan: CityPlan }>();
const planKey = (p: PlaceState) =>
  `${p.users}|${p.features.map((f) => `${f.id}${f.stage[0]}${f.storeys}`).join(',')}`;

export const plans = computed(() => {
  const out = new Map<string, CityPlan>();
  for (const place of world.value.places) {
    const key = planKey(place);
    const hit = planCache.get(place.id);
    if (hit && hit.key === key) {
      out.set(place.id, hit.plan);
      continue;
    }
    const plan = planCity(place);
    planCache.set(place.id, { key, plan });
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

// ───────────────────────── Loading ─────────────────────────

export async function load() {
  const base = await fixture.load();
  const copies = Number(new URLSearchParams(location.search).get('stress') ?? 0);
  fixtureEvents.value = copies > 0 ? [...base, ...stressEvents(base, Math.min(copies, 40), catalogue)] : base;
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
      at: TODAY,
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
      at: TODAY,
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
  record([{ id: newId('link'), at: TODAY, source: 'manual', type: 'link.formed', a, b, kind: 'related' }]);
}

export function recordStage(place: string, feature: string, stage: FeatureStage) {
  record([{ id: newId('staged'), at: TODAY, source: 'manual', type: 'feature.staged', place, feature, stage }]);
}

export function clearManual() {
  manual.clear();
  manualEvents.value = manual.all();
  selection.value = null;
}
