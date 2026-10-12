// The world is a function of its history: derive(events, catalogue, asOf) -> WorldState.
// Pure and deterministic. Nothing here reads a clock, and nothing mutates its input.

import { thresholds, type Rung } from './thresholds';
import { dayNumber, isoDay, monthIndex, monthKeyFromIndex, weekIndex } from './time';
import { RANKS } from './types';
import type {
  Catalogue,
  FeatureProposed,
  FeatureStage,
  FeatureState,
  LinkKind,
  LinkState,
  Liveliness,
  MethodLevel,
  MethodState,
  PlaceState,
  Rank,
  RoadGrade,
  WorldEvent,
  WorldState,
} from './types';

const T = thresholds;

const STAGE_ORDER: Record<FeatureStage, number> = {
  concept: 0,
  planned: 1,
  designed: 2,
  building: 3,
  working: 4,
  mature: 5,
};
const WORKING = STAGE_ORDER.working;

const RANK_ORDER: Record<Rank, number> = {
  spark: 0,
  site: 1,
  outpost: 2,
  settlement: 3,
  town: 4,
  city: 5,
  major: 6,
};

const LINK_KIND_ORDER: readonly LinkKind[] = ['related', 'shares', 'feeds', 'split-from'];

// ───────────────────────── Working records ─────────────────────────

interface Feat {
  state: FeatureState;
  /** Date of the stage event currently in force. */
  stageAt: string;
  /** Commits logged since the feature was last staged `building`. */
  sinceBuilding: number;
  /** Commits logged on `state.lastWorkAt`, so a same-day `building` event can claim them. */
  lastDayCommits: number;
  firstWorkAt: string | undefined;
  decayed: number;
}

interface Pl {
  state: PlaceState;
  feats: Feat[];
  byId: Map<string, Feat>;
  noteCount: number;
  everWorking: number;
  maxUsers: number;
  tractionAt: string;
  lastWeek: number;
  lastWorkDay: number;
  runStartDay: number;
  runStartAt: string;
  /** Days of silence immediately before the current run of work. */
  runGap: number;
  decayed: number;
  series: number[];
  foundedMonth: number;
}

interface Evidence {
  thoughts: number;
  commits: number;
  working: number;
  weeks: number;
  releases: number;
  users: number;
}

// ───────────────────────── Small rules ─────────────────────────

function plural(n: number, one: string, many: string): string {
  return n === 1 ? one : many;
}

/** What a rung still lacks, in plain words. Empty means the rung is met. */
function missing(rung: Rung, ev: Evidence): string[] {
  const out: string[] = [];
  if (rung.thoughts !== undefined && ev.thoughts < rung.thoughts) {
    out.push('a second note or a proposed feature');
  }
  if (rung.commits !== undefined && ev.commits < rung.commits) {
    out.push('some logged work');
  }
  if (rung.working !== undefined && ev.working < rung.working) {
    const k = rung.working - ev.working;
    out.push(
      rung.working === 1
        ? 'a working feature'
        : `${k} more working ${plural(k, 'feature', 'features')}`,
    );
  }
  if (rung.weeks !== undefined && ev.weeks < rung.weeks) {
    const k = rung.weeks - ev.weeks;
    out.push(`${k} more ${plural(k, 'week with work in it', 'weeks with work in them')}`);
  }
  if (rung.releases !== undefined && ev.releases < rung.releases) {
    const k = rung.releases - ev.releases;
    out.push(rung.releases === 1 ? 'a release' : `${k} more ${plural(k, 'release', 'releases')}`);
  }
  if (rung.users !== undefined && ev.users < rung.users) {
    out.push(ev.users === 0 ? 'measured users' : `${rung.users - ev.users} more measured users`);
  }
  return out;
}

/** Highest rung reached with every rung below it also met, and what the next one needs. */
function rankFor(ev: Evidence): { rank: Rank; nextRank?: { rank: Rank; needs: string[] } } {
  const ladder = T.rank.ladder;
  let rank: Rank = 'spark';
  for (let i = 0; i < ladder.length; i++) {
    const rung = ladder[i]!;
    const needs = missing(rung, ev);
    if (needs.length > 0) return { rank, nextRank: { rank: rung.rank, needs } };
    rank = rung.rank;
  }
  return { rank };
}

function livelinessFor(p: Pl, asOfDay: number): Liveliness {
  const L = T.liveliness;
  const s = p.state;
  const hadWork = s.lastWorkAt !== undefined;
  if (s.abandonedAt !== undefined && !(hadWork && s.lastWorkAt! > s.abandonedAt)) return 'ruins';
  if (!hadWork) {
    // An untouched idea is an old pencil mark: it fades, it never falls down.
    const age = asOfDay - dayNumber(s.foundedAt);
    return age < L.settledDays ? 'settled' : age < L.quietDays ? 'quiet' : 'dormant';
  }
  const since = asOfDay - p.lastWorkDay;
  if (since < L.buildingDays) return 'building';
  if (since < L.settledDays) return 'settled';
  if (since < L.quietDays) return 'quiet';
  if (since < L.dormantDays) return 'dormant';
  return 'ruins';
}

function storeysFor(commits: number): number {
  const s = 1 + Math.floor(Math.log2(1 + commits / T.storeys.commitsPerStorey));
  return s > T.storeys.max ? T.storeys.max : s < 1 ? 1 : s;
}

function squash(decayed: number): number {
  return decayed <= 0 ? 0 : 1 - Math.exp(-decayed / T.heat.squash);
}

function methodLevel(
  listed: boolean,
  evidence: number,
  places: number,
  firstUsedAt: string | undefined,
  asOfDay: number,
): MethodLevel {
  const M = T.methods;
  if (evidence < M.practisedCommits) return listed ? 'noted' : 'unknown';
  if (
    evidence >= M.masteredCommits &&
    places >= M.masteredPlaces &&
    firstUsedAt !== undefined &&
    asOfDay - dayNumber(firstUsedAt) > M.masteredSpanDays
  ) {
    return 'mastered';
  }
  if (evidence >= M.fluentCommits || places >= M.fluentPlaces) return 'fluent';
  return 'practised';
}

function byDate(a: WorldEvent, b: WorldEvent): number {
  return a.at < b.at ? -1 : a.at > b.at ? 1 : 0;
}

// ───────────────────────── derive ─────────────────────────

export function derive(events: WorldEvent[], catalogue: Catalogue, asOf: string): WorldState {
  const cutoff = isoDay(asOf);
  const asOfDay = dayNumber(cutoff);
  const asOfMonth = monthIndex(cutoff);

  // One look at the whole log: where it begins, and whether it needs sorting.
  let beginsAt = '';
  let sorted = true;
  let prev = '';
  for (let i = 0; i < events.length; i++) {
    const at = events[i]!.at;
    if (beginsAt === '' || at < beginsAt) beginsAt = at;
    if (at < prev) sorted = false;
    prev = at;
  }
  const log = sorted ? events : events.slice().sort(byDate);

  // Foundings and proposals are applied before everything else so that events sharing a
  // day (a place founded, proposed against and worked on in one afternoon) do not depend
  // on how the log happened to order them within that day.
  const places = new Map<string, Pl>();
  const placeList: Pl[] = [];
  const proposals: FeatureProposed[] = [];
  const rest: WorldEvent[] = [];

  for (let i = 0; i < log.length; i++) {
    const e = log[i]!;
    // The log is in date order by now, so the first event past the edition date ends it.
    if (e.at > cutoff && isoDay(e.at) > cutoff) break;
    if (e.type === 'place.founded') {
      if (places.has(e.place)) continue;
      const at = isoDay(e.at);
      const foundedMonth = monthIndex(at);
      const months = Math.max(1, asOfMonth - foundedMonth + 1);
      const p: Pl = {
        state: {
          id: e.place,
          name: e.name,
          formerNames: [],
          region: e.region,
          position: { x: e.position.x, y: e.position.y },
          note: e.note,
          notes: [],
          rank: 'spark',
          liveliness: 'settled',
          heat: 0,
          foundedAt: at,
          revived: false,
          commits: 0,
          activeWeeks: 0,
          users: 0,
          revenue: 0,
          features: [],
          releases: [],
          series: [],
        },
        feats: [],
        byId: new Map(),
        noteCount: 0,
        everWorking: 0,
        maxUsers: 0,
        tractionAt: '',
        lastWeek: Number.NEGATIVE_INFINITY,
        lastWorkDay: 0,
        runStartDay: 0,
        runStartAt: '',
        runGap: 0,
        decayed: 0,
        series: new Array<number>(months).fill(0),
        foundedMonth,
      };
      places.set(e.place, p);
      placeList.push(p);
    } else if (e.type === 'feature.proposed') {
      proposals.push(e);
    } else {
      rest.push(e);
    }
  }

  for (let i = 0; i < proposals.length; i++) {
    const e = proposals[i]!;
    const p = places.get(e.place);
    if (p === undefined || p.byId.has(e.feature)) continue;
    const at = isoDay(e.at);
    const state: FeatureState = {
      id: e.feature,
      place: e.place,
      name: e.name,
      kind: e.kind,
      methods: e.methods.slice(),
      stage: 'concept',
      order: p.feats.length,
      proposedAt: at,
      stagedAt: { concept: at },
      commits: 0,
      storeys: 1,
      progress: 0,
      heat: 0,
      landmark: false,
    };
    if (e.ward !== undefined) state.ward = e.ward;
    if (e.note !== undefined) state.note = e.note;
    const f: Feat = {
      state,
      stageAt: at,
      sinceBuilding: 0,
      lastDayCommits: 0,
      firstWorkAt: undefined,
      decayed: 0,
    };
    p.feats.push(f);
    p.byId.set(e.feature, f);
  }

  // Everything else, in date order.
  const halfLife = T.heat.halfLifeDays;
  const heatHorizon = halfLife * 14;
  const runBreak = T.revival.runBreakDays;
  const linkEvents: Extract<WorldEvent, { type: 'link.formed' }>[] = [];
  let dayStr = '';
  let dayNo = 0;

  for (let i = 0; i < rest.length; i++) {
    const e = rest[i]!;
    if (e.type === 'link.formed') {
      linkEvents.push(e);
      continue;
    }
    const p = places.get(e.place);
    if (p === undefined) continue;
    const at = e.at.length > 10 ? e.at.slice(0, 10) : e.at;
    const s = p.state;

    switch (e.type) {
      case 'work.logged': {
        const commits = e.commits;
        if (!(commits > 0)) break;
        if (at !== dayStr) {
          dayStr = at;
          dayNo = dayNumber(at);
        }
        const age = asOfDay - dayNo;
        const warm = age < heatHorizon ? commits * Math.pow(0.5, age / halfLife) : 0;

        if (s.lastWorkAt === undefined) {
          p.runStartDay = dayNo;
          p.runStartAt = at;
          p.runGap = 0;
        } else {
          const gap = dayNo - p.lastWorkDay;
          if (gap > runBreak) {
            p.runStartDay = dayNo;
            p.runStartAt = at;
            p.runGap = gap;
          }
        }
        s.commits += commits;
        s.lastWorkAt = at;
        p.lastWorkDay = dayNo;
        p.decayed += warm;
        const week = weekIndex(dayNo);
        if (week !== p.lastWeek) {
          p.lastWeek = week;
          s.activeWeeks++;
        }
        let m = monthIndex(at) - p.foundedMonth;
        if (m < 0) m = 0;
        if (m < p.series.length) p.series[m] = p.series[m]! + commits;

        if (e.feature !== undefined) {
          const f = p.byId.get(e.feature);
          if (f !== undefined) {
            const fs = f.state;
            if (fs.lastWorkAt === at) f.lastDayCommits += commits;
            else f.lastDayCommits = commits;
            fs.lastWorkAt = at;
            fs.commits += commits;
            f.decayed += warm;
            if (f.firstWorkAt === undefined) f.firstWorkAt = at;
            if (fs.stage === 'building') f.sinceBuilding += commits;
          }
        }
        break;
      }
      case 'feature.staged': {
        const f = p.byId.get(e.feature);
        if (f === undefined) break;
        const fs = f.state;
        const order = STAGE_ORDER[e.stage];
        if (order === undefined) break;
        if (fs.stagedAt[e.stage] === undefined) fs.stagedAt[e.stage] = at;
        if (order >= WORKING && fs.builtOrder === undefined) {
          p.everWorking++;
          fs.builtOrder = p.everWorking;
          if (fs.stagedAt.working === undefined) fs.stagedAt.working = at;
        }
        // The latest stage event wins; on the same day, the furthest stage does.
        if (at > f.stageAt || order >= STAGE_ORDER[fs.stage]) {
          if (e.stage === 'building' && fs.stage !== 'building') {
            f.sinceBuilding = fs.lastWorkAt === at ? f.lastDayCommits : 0;
          }
          fs.stage = e.stage;
          f.stageAt = at;
        }
        break;
      }
      case 'place.noted':
        s.notes.push({ at, note: e.note });
        p.noteCount++;
        break;
      case 'place.renamed':
        if (e.name !== s.name) {
          s.formerNames.push(s.name);
          s.name = e.name;
        }
        break;
      case 'place.abandoned':
        s.abandonedAt = at;
        s.abandonedNote = e.note;
        break;
      case 'release.shipped': {
        const release: { at: string; name: string; feature?: string } = { at, name: e.name };
        if (e.feature !== undefined) {
          release.feature = e.feature;
          const f = p.byId.get(e.feature);
          if (f !== undefined) f.state.landmark = true;
        }
        s.releases.push(release);
        break;
      }
      case 'traction.measured':
        if (e.users > p.maxUsers) p.maxUsers = e.users;
        if (at >= p.tractionAt) {
          p.tractionAt = at;
          s.users = e.users;
          s.revenue = e.revenue ?? 0;
        }
        break;
    }
  }

  // ── Places: settle what the evidence means ──
  const methodIds = new Map<string, number>();
  const defs = catalogue.methods;
  for (let i = 0; i < defs.length; i++) methodIds.set(defs[i]!.id, i);
  const mListed = new Array<boolean>(defs.length).fill(false);
  const mEvidence = new Array<number>(defs.length).fill(0);
  const mFirst = new Array<string | undefined>(defs.length).fill(undefined);
  const mPlaces: { place: string; commits: number }[][] = defs.map(() => []);
  const placeMethods = new Map<string, Set<string>>();

  const P = T.progress;
  const outPlaces: PlaceState[] = [];
  for (let i = 0; i < placeList.length; i++) {
    const p = placeList[i]!;
    const s = p.state;
    const used = new Set<string>();
    const perMethod = new Map<number, number>();

    for (let j = 0; j < p.feats.length; j++) {
      const f = p.feats[j]!;
      const fs = f.state;
      fs.storeys = storeysFor(fs.commits);
      fs.heat = squash(f.decayed);
      const order = STAGE_ORDER[fs.stage];
      if (order >= WORKING) fs.progress = 1;
      else if (fs.stage === 'building') {
        const raw = f.sinceBuilding / P.cost[fs.kind];
        fs.progress = raw < P.min ? P.min : raw > P.max ? P.max : raw;
      } else fs.progress = 0;
      s.features.push(fs);

      for (let k = 0; k < fs.methods.length; k++) {
        const id = fs.methods[k]!;
        used.add(id);
        const mi = methodIds.get(id);
        if (mi === undefined) continue;
        mListed[mi] = true;
        if (fs.commits > 0) {
          perMethod.set(mi, (perMethod.get(mi) ?? 0) + fs.commits);
          const first = mFirst[mi];
          if (f.firstWorkAt !== undefined && (first === undefined || f.firstWorkAt < first)) {
            mFirst[mi] = f.firstWorkAt;
          }
        }
      }
    }
    placeMethods.set(s.id, used);
    for (const [mi, commits] of perMethod) {
      mEvidence[mi] = mEvidence[mi]! + commits;
      mPlaces[mi]!.push({ place: s.id, commits });
    }

    const verdict = rankFor({
      thoughts: p.noteCount + p.feats.length,
      commits: s.commits,
      working: p.everWorking,
      weeks: s.activeWeeks,
      releases: s.releases.length,
      users: p.maxUsers,
    });
    s.rank = verdict.rank;
    if (verdict.nextRank !== undefined) s.nextRank = verdict.nextRank;
    s.liveliness = livelinessFor(p, asOfDay);
    s.heat = squash(p.decayed);
    if (s.liveliness === 'building' && asOfDay - p.runStartDay <= T.revival.windowDays) {
      const afterSilence = p.runGap >= T.revival.minGapDays;
      const afterAbandonment = s.abandonedAt !== undefined && p.runStartAt > s.abandonedAt;
      s.revived = afterSilence || afterAbandonment;
    }
    for (let m = 0; m < p.series.length; m++) {
      s.series.push({ month: monthKeyFromIndex(p.foundedMonth + m), commits: p.series[m]! });
    }
    outPlaces.push(s);
  }

  // ── Links ──
  const linkMap = new Map<string, LinkState>();
  const links: LinkState[] = [];
  for (let i = 0; i < linkEvents.length; i++) {
    const e = linkEvents[i]!;
    if (e.a === e.b || !places.has(e.a) || !places.has(e.b)) continue;
    const lo = e.a < e.b ? e.a : e.b;
    const hi = e.a < e.b ? e.b : e.a;
    const key = `${lo}~${hi}`;
    const at = isoDay(e.at);
    const directional = e.kind === 'feeds' || e.kind === 'split-from';
    let link = linkMap.get(key);
    if (link === undefined) {
      link = {
        id: `link:${key}`,
        a: e.a,
        b: e.b,
        kinds: [e.kind],
        grade: 'surveyed',
        formedAt: at,
        sharedMethods: [],
      };
      if (e.carries !== undefined) link.carries = e.carries;
      linkMap.set(key, link);
      links.push(link);
      continue;
    }
    if (!link.kinds.includes(e.kind)) {
      // The first link with a direction (a feeds b, a split from b) decides which end is which.
      const hadDirection = link.kinds.includes('feeds') || link.kinds.includes('split-from');
      if (directional && !hadDirection) {
        link.a = e.a;
        link.b = e.b;
      }
      link.kinds.push(e.kind);
    }
    if (link.carries === undefined && e.carries !== undefined) link.carries = e.carries;
    if (at < link.formedAt) link.formedAt = at;
  }

  const R = T.roads;
  const roadRank = RANK_ORDER[R.roadMinRank];
  for (let i = 0; i < links.length; i++) {
    const link = links[i]!;
    link.kinds.sort((x, y) => LINK_KIND_ORDER.indexOf(x) - LINK_KIND_ORDER.indexOf(y));
    const ma = placeMethods.get(link.a)!;
    const mb = placeMethods.get(link.b)!;
    const shared: string[] = [];
    for (const id of ma) if (mb.has(id)) shared.push(id);
    shared.sort((x, y) => {
      const ix = methodIds.get(x);
      const iy = methodIds.get(y);
      if (ix !== undefined && iy !== undefined) return ix - iy;
      if (ix !== undefined) return -1;
      if (iy !== undefined) return 1;
      return x < y ? -1 : x > y ? 1 : 0;
    });
    link.sharedMethods = shared;

    const main = link.kinds.includes('shares') || link.kinds.includes('feeds');
    const bound = main || link.kinds.includes('split-from');
    const bothGrown =
      RANK_ORDER[places.get(link.a)!.state.rank] >= roadRank &&
      RANK_ORDER[places.get(link.b)!.state.rank] >= roadRank;
    // A road is evidence of two built things sharing a lot. An idea that merely lists the
    // same methods as a city has not earned one: until both ends have real work, shared
    // methods are a coincidence of intent.
    const bothWorked =
      RANK_ORDER[places.get(link.a)!.state.rank] >= RANK_ORDER.outpost &&
      RANK_ORDER[places.get(link.b)!.state.rank] >= RANK_ORDER.outpost;
    let grade: RoadGrade = 'surveyed';
    if (bothGrown && (shared.length >= R.roadSharedMethods || main)) grade = 'road';
    else if (bound || (bothWorked && shared.length >= R.trackSharedMethods)) grade = 'track';
    link.grade = grade;
  }

  // ── Methods ──
  const methods: MethodState[] = [];
  for (let i = 0; i < defs.length; i++) {
    const def = defs[i]!;
    const used = mPlaces[i]!.sort((x, y) =>
      y.commits !== x.commits ? y.commits - x.commits : x.place < y.place ? -1 : 1,
    );
    const first = mFirst[i];
    const m: MethodState = {
      id: def.id,
      name: def.name,
      family: def.family,
      requires: def.requires.slice(),
      level: methodLevel(mListed[i]!, mEvidence[i]!, used.length, first, asOfDay),
      evidence: mEvidence[i]!,
      places: used,
    };
    if (first !== undefined) m.firstUsedAt = first;
    methods.push(m);
  }

  return {
    asOf: cutoff,
    places: outPlaces,
    links,
    methods,
    beginsAt: beginsAt === '' ? cutoff : isoDay(beginsAt),
  };
}

/** Position of a rank on the ladder, for comparisons: `rankIndex('town') > rankIndex('site')`. */
export function rankIndex(rank: Rank): number {
  return RANKS.indexOf(rank);
}
