// Every tunable number in the world's rules. Change one and the whole history
// re-derives consistently. Meant to be argued with.

import type { FeatureKind, Rank } from './types';

/** Cumulative evidence a rung asks for. A rung is reached only if every rung below it is. */
export interface RungNeeds {
  /** Further thoughts after the founding note: notes plus proposed features. */
  thoughts?: number;
  /** Commits logged, ever. */
  commits?: number;
  /** Features that have ever reached `working`. */
  working?: number;
  /** Distinct Monday-to-Sunday weeks with work in them. */
  weeks?: number;
  releases?: number;
  /** Highest user count ever measured. */
  users?: number;
}

export interface Rung extends RungNeeds {
  rank: Rank;
}

const ladder: readonly Rung[] = [
  { rank: 'spark' },
  { rank: 'site', thoughts: 1 },
  { rank: 'outpost', commits: 1 },
  { rank: 'settlement', working: 1 },
  // Four weeks, not eight: a month of work with three things standing is a town. Tuned
  // against real repositories, where two months was keeping busy projects level with idle ones.
  { rank: 'town', working: 3, weeks: 4 },
  { rank: 'city', working: 6, weeks: 20, releases: 1 },
  { rank: 'major', working: 10, weeks: 40, users: 100 },
];

const featureCost: Record<FeatureKind, number> = {
  frontage: 150,
  works: 120,
  reservoir: 100,
  observatory: 90,
  utility: 70,
};

export const thresholds = {
  rank: { ladder },

  /** Days since the last work event. Each is an exclusive upper bound. */
  liveliness: {
    buildingDays: 21, // under 3 weeks
    settledDays: 70, // under 10 weeks
    quietDays: 183, // under 6 months
    dormantDays: 548, // under 18 months; beyond is ruins (only for places that had work)
  },

  revival: {
    /** Silence before the current run of work that makes it a revival. */
    minGapDays: 183,
    /** A pause this long ends a run of work; whatever follows is a new run. */
    runBreakDays: 70,
    /** A revival stops being news this long after the run began. */
    windowDays: 183,
  },

  heat: {
    halfLifeDays: 21,
    /** heat = 1 - exp(-decayedCommits / squash). */
    squash: 12,
  },

  /** storeys = 1 + floor(log2(1 + commits / commitsPerStorey)), capped at max. */
  storeys: {
    commitsPerStorey: 6,
    max: 9,
  },

  progress: {
    /** Typical commits to take a feature of each kind from building to working. */
    cost: featureCost,
    min: 0.05,
    max: 0.95,
  },

  methods: {
    practisedCommits: 1,
    fluentCommits: 150,
    fluentPlaces: 3,
    masteredCommits: 2000,
    masteredPlaces: 5,
    /** First use must be more than this long before the edition date. */
    masteredSpanDays: 548,
  },

  roads: {
    trackSharedMethods: 1,
    roadSharedMethods: 3,
    /** A `shares` or `feeds` link is a road once both ends are at least this. */
    roadMinRank: 'town' as Rank,
  },
} as const;

export type Thresholds = typeof thresholds;
