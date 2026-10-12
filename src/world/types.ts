// The world's vocabulary. Nothing here imports anything: this file is the contract
// between sources (which emit events), the derivation (which gives them meaning),
// and everything that draws.

// ───────────────────────── Events: the only stored thing ─────────────────────────

export type Source = 'fixture' | 'manual' | 'github' | 'patrick-os' | 'deploy' | 'analytics';

export type FeatureStage = 'concept' | 'planned' | 'designed' | 'building' | 'working' | 'mature';
export const STAGES: readonly FeatureStage[] = [
  'concept',
  'planned',
  'designed',
  'building',
  'working',
  'mature',
];

/** What a feature is, which decides its wash. */
export type FeatureKind = 'frontage' | 'works' | 'reservoir' | 'observatory' | 'utility';
export const KINDS: readonly FeatureKind[] = [
  'frontage',
  'works',
  'reservoir',
  'observatory',
  'utility',
];

export type LinkKind = 'related' | 'shares' | 'feeds' | 'split-from';

export interface Point {
  x: number;
  y: number;
}

interface EventBase {
  /** Unique and stable: the same fact always has the same id. */
  id: string;
  /** ISO date, day precision: `2025-03-14`. */
  at: string;
  source: Source;
}

export interface PlaceFounded extends EventBase {
  type: 'place.founded';
  place: string;
  name: string;
  region: string;
  /** Fixed forever. World units. */
  position: Point;
  /** What it is, in Patrick's words. */
  note: string;
}
export interface PlaceNoted extends EventBase {
  type: 'place.noted';
  place: string;
  note: string;
}
export interface PlaceRenamed extends EventBase {
  type: 'place.renamed';
  place: string;
  name: string;
}
export interface PlaceAbandoned extends EventBase {
  type: 'place.abandoned';
  place: string;
  note: string;
}
export interface FeatureProposed extends EventBase {
  type: 'feature.proposed';
  place: string;
  feature: string;
  name: string;
  kind: FeatureKind;
  ward?: string;
  methods: string[];
  note?: string;
}
export interface FeatureStaged extends EventBase {
  type: 'feature.staged';
  place: string;
  feature: string;
  stage: FeatureStage;
}
/** Work in the week ending `at`. Adapters aggregate commits before emitting. */
export interface WorkLogged extends EventBase {
  type: 'work.logged';
  place: string;
  feature?: string;
  commits: number;
  hours?: number;
}
export interface ReleaseShipped extends EventBase {
  type: 'release.shipped';
  place: string;
  name: string;
  feature?: string;
}
/** A measurement at a moment, not a running total. */
export interface TractionMeasured extends EventBase {
  type: 'traction.measured';
  place: string;
  users: number;
  revenue?: number;
}
export interface LinkFormed extends EventBase {
  type: 'link.formed';
  a: string;
  b: string;
  kind: LinkKind;
  /** For `shares` and `feeds`: what flows. Lettered along the main. */
  carries?: string;
}

export type WorldEvent =
  | PlaceFounded
  | PlaceNoted
  | PlaceRenamed
  | PlaceAbandoned
  | FeatureProposed
  | FeatureStaged
  | WorkLogged
  | ReleaseShipped
  | TractionMeasured
  | LinkFormed;

// ───────────────────────── Catalogue: static vocabulary ─────────────────────────

export interface MethodDef {
  id: string;
  name: string;
  /** Method ids this one builds on. */
  requires: string[];
  /** A short family label used to group the Key: 'language', 'data', 'intelligence'… */
  family: string;
}

export interface RegionDef {
  id: string;
  name: string;
  /** Centre of the region in world units. */
  center: Point;
  /** Rough radius in world units. */
  radius: number;
  /** One line on the domain this country stands for. */
  note: string;
}

export interface Catalogue {
  methods: MethodDef[];
  regions: RegionDef[];
  /** World extent in world units. */
  size: { width: number; height: number };
}

// ───────────────────────── Derived state: never stored ─────────────────────────

export type Rank = 'spark' | 'site' | 'outpost' | 'settlement' | 'town' | 'city' | 'major';
export const RANKS: readonly Rank[] = [
  'spark',
  'site',
  'outpost',
  'settlement',
  'town',
  'city',
  'major',
];

export type Liveliness = 'building' | 'settled' | 'quiet' | 'dormant' | 'ruins';

export type MethodLevel = 'unknown' | 'noted' | 'practised' | 'fluent' | 'mastered';
export const METHOD_LEVELS: readonly MethodLevel[] = [
  'unknown',
  'noted',
  'practised',
  'fluent',
  'mastered',
];

export interface FeatureState {
  id: string;
  place: string;
  name: string;
  kind: FeatureKind;
  ward?: string;
  methods: string[];
  note?: string;
  stage: FeatureStage;
  /** Position in the place's proposal order, from 0. Fixes its lot. */
  order: number;
  /** Order in which it reached `working`, from 1; undefined until it has. */
  builtOrder?: number;
  proposedAt: string;
  /** Date each stage was reached. */
  stagedAt: Partial<Record<FeatureStage, string>>;
  commits: number;
  /** 1–9. Work invested, on a log scale. */
  storeys: number;
  /** 0–1 while `building`; 1 once working; 0 before. */
  progress: number;
  lastWorkAt?: string;
  /** 0–1. Recency-weighted work. Decides fresh slips. */
  heat: number;
  /** True if a release named this feature: drawn as a landmark. */
  landmark: boolean;
}

export interface PlaceState {
  id: string;
  name: string;
  formerNames: string[];
  region: string;
  position: Point;
  note: string;
  /** Further notes, oldest first. */
  notes: { at: string; note: string }[];
  rank: Rank;
  liveliness: Liveliness;
  /** 0–1. Recency-weighted work across the place. */
  heat: number;
  foundedAt: string;
  lastWorkAt?: string;
  abandonedAt?: string;
  abandonedNote?: string;
  /** True when current work follows a silence long enough to have been dormant. */
  revived: boolean;
  commits: number;
  activeWeeks: number;
  users: number;
  revenue: number;
  features: FeatureState[];
  releases: { at: string; name: string; feature?: string }[];
  /** Commits per calendar month from founding to the edition date. `month` is `YYYY-MM`. */
  series: { month: string; commits: number }[];
  /** What would lift it to the next rank, in plain words. Empty at the top. */
  nextRank?: { rank: Rank; needs: string[] };
}

/** How built-out a connection is, from evidence binding the two places. */
export type RoadGrade = 'surveyed' | 'track' | 'road';

export interface LinkState {
  id: string;
  a: string;
  b: string;
  kinds: LinkKind[];
  grade: RoadGrade;
  carries?: string;
  formedAt: string;
  sharedMethods: string[];
}

export interface MethodState {
  id: string;
  name: string;
  family: string;
  requires: string[];
  level: MethodLevel;
  /** Commits logged against features using it. */
  evidence: number;
  /** Places that used it, with commits, most first. */
  places: { place: string; commits: number }[];
  firstUsedAt?: string;
}

export interface WorldState {
  asOf: string;
  places: PlaceState[];
  links: LinkState[];
  methods: MethodState[];
  /** Earliest event date in the log: the left end of the edition dial. */
  beginsAt: string;
}

// ───────────────────────── The adapter boundary ─────────────────────────

/**
 * Everything outside the world reaches it through this. A source reports facts;
 * it never computes rank, liveliness or anything else the derivation owns.
 */
export interface WorldSource {
  readonly id: Source;
  readonly label: string;
  /** Every event this source knows. Idempotent: the same ids on every call. */
  load(): Promise<WorldEvent[]>;
  /** Push events as they happen. Returns an unsubscribe function. */
  subscribe?(onEvents: (events: WorldEvent[]) => void): () => void;
}
