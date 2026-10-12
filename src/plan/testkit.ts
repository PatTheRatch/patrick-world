// Hand-built fixtures for the plan tests. Test support only: nothing in the app imports this.

import type {
  Catalogue,
  FeatureKind,
  FeatureStage,
  FeatureState,
  LinkState,
  PlaceState,
  Point,
} from '../world/types';
import { boundsOf, rotate } from './geometry';
import type { CityPlan } from './types';

export const TEST_CATALOGUE: Catalogue = {
  methods: [],
  size: { width: 4800, height: 3200 },
  regions: [
    { id: 'the-court', name: 'The Court', center: { x: 1500, y: 1250 }, radius: 620, note: '' },
    { id: 'mindworks', name: 'Mindworks', center: { x: 3050, y: 1150 }, radius: 640, note: '' },
    { id: 'ledger-reach', name: 'Ledger Reach', center: { x: 1900, y: 2300 }, radius: 520, note: '' },
    { id: 'the-commons', name: 'The Commons', center: { x: 3350, y: 2250 }, radius: 520, note: '' },
  ],
};

const KIND_CYCLE: FeatureKind[] = [
  'frontage',
  'works',
  'frontage',
  'reservoir',
  'utility',
  'frontage',
  'observatory',
  'works',
  'frontage',
  'utility',
  'reservoir',
];
const WARD_CYCLE: (string | undefined)[] = [
  'Market',
  'Market',
  'Foundry',
  'Market',
  'Cistern',
  'Foundry',
  'Lantern',
  undefined,
  'Market',
  'Quay',
  'Cistern',
  'Foundry',
  'Archive',
  'Lantern',
  'Quay',
  undefined,
  'Archive',
];
const STAGE_CYCLE: FeatureStage[] = ['working', 'mature', 'building', 'concept', 'mature', 'designed', 'planned'];

export function makeFeature(place: string, order: number, over: Partial<FeatureState> = {}): FeatureState {
  return {
    id: `${place}/f${order}`,
    place,
    name: `Feature ${order}`,
    kind: KIND_CYCLE[order % KIND_CYCLE.length] as FeatureKind,
    ward: WARD_CYCLE[order % WARD_CYCLE.length],
    methods: [],
    stage: STAGE_CYCLE[order % STAGE_CYCLE.length] as FeatureStage,
    order,
    proposedAt: '2025-01-01',
    stagedAt: {},
    commits: 10 * order,
    storeys: 1 + ((order * 5) % 9),
    progress: 1,
    heat: 0,
    landmark: false,
    ...over,
  };
}

export interface PlaceOptions {
  id?: string;
  position?: Point;
  users?: number;
  /** Ward names to draw from; omit for the default six-ward mix. */
  wards?: (string | undefined)[];
}

export function makePlace(features: number, opts: PlaceOptions = {}): PlaceState {
  const id = opts.id ?? 'testport';
  const list: FeatureState[] = [];
  for (let order = 0; order < features; order++) {
    const f = makeFeature(id, order);
    if (opts.wards) f.ward = opts.wards[order % opts.wards.length];
    list.push(f);
  }
  return {
    id,
    name: id,
    formerNames: [],
    region: 'the-court',
    position: opts.position ?? { x: 1500, y: 1250 },
    note: '',
    notes: [],
    rank: 'town',
    liveliness: 'settled',
    heat: 0,
    foundedAt: '2025-01-01',
    revived: false,
    commits: 0,
    activeWeeks: 0,
    users: opts.users ?? 0,
    revenue: 0,
    features: list,
    releases: [],
    series: [],
  };
}

export function makeLink(id: string, a: string, b: string): LinkState {
  return { id, a, b, kinds: ['related'], grade: 'surveyed', formedAt: '2025-01-01', sharedMethods: [] };
}

/**
 * How far the built town reaches: the longer side of the box around its blocks, measured
 * along its own street grid. Street stubs and fringe dwellings are not counted.
 */
export function builtSpan(plan: CityPlan): number {
  const pts = plan.blocks.flatMap((b) => rotate(b.outline, -plan.angle, plan.center));
  const b = boundsOf(pts);
  return Math.max(b.w, b.h);
}
