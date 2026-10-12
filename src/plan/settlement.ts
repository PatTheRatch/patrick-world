// A place, as a town plan that grows the way towns do.
//
// Every place has a LATENT SKELETON, fixed by its id before anything is built: a through
// route, a crossing route, side streets off each, and extension districts beyond. Nothing in
// the skeleton depends on evidence. Evidence only decides how much of it has been revealed:
// each feature takes the nearest free frontage on the skeleton, so a place with two features
// is a pair of buildings on a track, one with eight is a ribbon reaching a crossroads, and one
// with thirty is a core with quarters and side streets. The form changes in kind as a place
// grows, and nothing already standing ever moves.
//
// THE STABILITY RULE. The lot for feature N depends only on the place id, its position, and
// the id, kind and ward of features with order <= N. Stage and storeys may add annexes; rank
// decides how made the streets are; work and users decide how much ordinary fabric there is.
// None of those move a parcel or a main mass.
//
// What each real thing drives, kept apart on purpose:
//   breadth (features, wards)  → footprint: how far the streets run, how many quarters
//   what the features are      → the character of each lot and quarter (see KIND)
//   work invested              → infill: terraces behind the frontages, saturating
//   maturity (rank)            → how made the streets are, and whether there is a square
//   attention                  → nothing here; that is the renderer's paper, edge and motion

import type { FeatureKind, FeatureState, PlaceState, Point, Rank } from '../world/types';
import { boundsOf, convexOverlap } from './geometry';
import { hash01, rng } from './rng';
import type { CityPlan, Dwelling, Lot, Polygon, Street, StreetGrade, Ward } from './types';

// ───────────────────────── Character by kind ─────────────────────────

interface KindSpec {
  /** Frontage along the street, and depth back from it. */
  width: [number, number];
  depth: [number, number];
  /** Gap to the next lot on the same side. */
  gap: [number, number];
  /** How reluctant a quarter founded on this kind is to leave its street for a side street. */
  ribbon: number;
}

/**
 * Frontage is fine-grained terraces along a high street. Works are solid blocks on a grid.
 * Reservoirs are tanks standing in yards. Observatories are domes in their own grounds.
 * Utilities are long sheds along the line.
 */
const KIND: Record<FeatureKind, KindSpec> = {
  frontage: { width: [8.5, 11.5], depth: [15, 18], gap: [0, 1], ribbon: 46 },
  works: { width: [17, 24], depth: [15, 19], gap: [1.5, 3], ribbon: 0 },
  reservoir: { width: [21, 26], depth: [20, 20], gap: [2.5, 5], ribbon: 14 },
  observatory: { width: [20, 24], depth: [20, 20], gap: [3, 6], ribbon: 8 },
  utility: { width: [24, 32], depth: [9, 11], gap: [1.5, 3], ribbon: 30 },
};

const HALF_STREET = 2.6;
/**
 * The ground plan a place is born with. Not every town is a crossroads: some stand where one
 * road meets another, some where a road forks, some along a bend, some round a green.
 * `open` is how far out the first lots stand: the space left is the common, later the square.
 */
interface Form {
  name: 'cross' | 'tee' | 'fork' | 'bend' | 'green';
  /** Arm bearings in the town's own frame. The first two are the through route. */
  arms: number[];
  open: number;
}
const FORMS: Form[] = [
  { name: 'cross', arms: [0, Math.PI, Math.PI / 2, -Math.PI / 2], open: 14 },
  { name: 'tee', arms: [0, Math.PI, Math.PI / 2], open: 13 },
  { name: 'fork', arms: [0, 2.2, -2.2], open: 12 },
  { name: 'bend', arms: [0, 2.55, -Math.PI / 2], open: 11 },
  { name: 'green', arms: [0, Math.PI, Math.PI / 2, -Math.PI / 2], open: 21 },
];

/** Which form a place has. Fixed by its id alone. */
export function formOf(id: string): Form {
  return FORMS[Math.floor(hash01(`${id}|form`) * FORMS.length) % FORMS.length]!;
}
const ARM_MAX = 136;
const SIDE_STREETS = [58, 112];
const SIDE_START = 25;
const SIDE_MAX = 104;
const EXTENSION_MAX = 150;
const EXTENSION_SIDES = [46, 98];

/** Terraces of ordinary fabric: saturating in the work, so effort thickens a town without burying it. */
export function fabricCount(commits: number, users: number, activeWeeks = Infinity): number {
  const byWork = Math.round(6 * Math.log2(1 + Math.max(0, commits) / 25)) + Math.round(2 * Math.log10(1 + Math.max(0, users)));
  // A town's ordinary fabric takes time as well as effort: a furious first week does not build suburbs.
  return Math.min(byWork, Math.round(Math.max(0, activeWeeks) * 3.5));
}

// ───────────────────────── The skeleton ─────────────────────────

interface Way {
  id: string;
  /** Local frame: origin and heading. */
  ox: number;
  oy: number;
  angle: number;
  /** Which sides may be built on: +1 is to the left of the heading. */
  sides: (1 | -1)[];
  start: number;
  max: number;
  /** Stretches of frontage kept open on a side, for side streets to leave by. */
  gaps: Record<1 | -1, [number, number][]>;
  cursor: Record<1 | -1, number>;
  /** Furthest frontage built on, along the way. */
  used: number;
  role: 'route' | 'cross' | 'side' | 'extension';
  /** For a side street: how far along its parent it leaves. */
  junction?: number;
  /** Index of the primary arm (0–3) for routes and crosses. */
  arm?: number;
  lots: number;
}

interface Quarter {
  name: string | undefined;
  /** The kind it was founded on. Fixed, so a quarter keeps its character. */
  founded: FeatureKind;
  /** Ways it prefers, in order. */
  home: Way[];
  lots: Lot[];
  kinds: Partial<Record<FeatureKind, number>>;
}

const REAL: readonly string[] = ['building', 'working', 'mature'];

function streetGrade(rank: Rank, role: Way['role']): StreetGrade {
  const primary = role === 'route' || role === 'cross';
  switch (rank) {
    case 'spark':
    case 'site':
    case 'outpost':
      return 'track';
    case 'settlement':
      return primary ? 'lane' : 'track';
    case 'town':
      return primary ? 'street' : 'lane';
    default:
      return primary ? 'avenue' : 'street';
  }
}

export function planCity(place: PlaceState): CityPlan {
  const center = place.position;
  const seed = place.id;
  const theta = hash01(`${seed}|bearing`) * Math.PI * 2;
  const cos = Math.cos(theta);
  const sin = Math.sin(theta);
  const toWorld = (x: number, y: number): Point => ({ x: center.x + x * cos - y * sin, y: center.y + x * sin + y * cos });

  // The arms of its form. Never quite true to each other: an old junction never is.
  const j = (k: string, amount: number) => (hash01(`${seed}|${k}`) - 0.5) * 2 * amount;
  const form = formOf(seed);
  const R0 = form.open;
  const armAngle = form.arms.map((a, i) => (i === 0 ? a : a + j(`a${i}`, 0.2)));
  const stagger = form.arms.map((_, i) => (i === 0 ? 0 : j(`s${i}`, 3)));

  const makeWay = (id: string, ox: number, oy: number, angle: number, o: Partial<Way>): Way => ({
    id,
    ox,
    oy,
    angle,
    sides: [1, -1],
    start: 1,
    max: ARM_MAX,
    gaps: { 1: [], [-1]: [] },
    cursor: { 1: o.start ?? 1, [-1]: o.start ?? 1 },
    used: 0,
    role: 'route',
    lots: 0,
    ...o,
  });

  const arms: Way[] = armAngle.map((a, i) => {
    const nx = -Math.sin(a);
    const ny = Math.cos(a);
    return makeWay(`arm${i}`, Math.cos(a) * R0 + nx * stagger[i]!, Math.sin(a) * R0 + ny * stagger[i]!, a, {
      role: i < 2 ? 'route' : 'cross',
      arm: i,
    });
  });

  // Side streets leave each arm to its left, so no two arms ever build into the same quarter.
  const sideWays = new Map<Way, Way[]>();
  const addSides = (parent: Way, offsets: number[], side: 1 | -1, max: number) => {
    const list: Way[] = [];
    offsets.forEach((base, n) => {
      const at = base + j(`${parent.id}|side${n}`, 5);
      const a = parent.angle + (side * Math.PI) / 2 + j(`${parent.id}|turn${n}`, 0.1);
      const px = parent.ox + Math.cos(parent.angle) * at;
      const py = parent.oy + Math.sin(parent.angle) * at;
      parent.gaps[side].push([at - HALF_STREET - 0.8, at + HALF_STREET + 0.8]);
      list.push(makeWay(`${parent.id}/s${n}`, px, py, a, { role: 'side', start: SIDE_START, max, junction: at }));
    });
    sideWays.set(parent, list);
  };
  for (const arm of arms) addSides(arm, SIDE_STREETS, 1, SIDE_MAX);

  // Extension districts: later quarters, laid out at their own angle on the edge of the town
  // AS IT STOOD when they were founded. The old arm stops there for good, which is how a
  // town comes to have an old core and newer wards around it. Depends only on what was
  // already built, so it is as fixed as everything else.
  const extensions: Way[] = [];
  const extend = (index: number): Way => {
    // Off the end of whichever old arm has the least on it and no extension yet.
    const free = arms.filter((a) => !extensions.some((e) => e.arm === a.arm));
    const pool = free.length ? free : arms;
    const arm = pool.reduce((best, a) => {
      const load = (w: Way) => w.lots + (sideWays.get(w) ?? []).reduce((n, x) => n + x.lots, 0);
      return load(a) < load(best) ? a : best;
    });
    const sides = sideWays.get(arm) ?? [];
    const reach = Math.max(arm.used, ...sides.filter((x) => x.lots > 0).map((x) => (x.junction ?? 0) + HALF_STREET + 2), 26);
    const at = reach + 22;
    arm.max = Math.min(arm.max, at - 8);
    // Side streets not yet begun beyond that point never will be.
    for (const x of sides) if (x.lots === 0 && (x.junction ?? 0) > arm.max - 6) x.max = 0;
    const turn = (hash01(`${seed}|ext${index}`) < 0.5 ? -1 : 1) * (0.32 + hash01(`${seed}|extturn${index}`) * 0.3);
    const ex = arm.ox + Math.cos(arm.angle) * at;
    const ey = arm.oy + Math.sin(arm.angle) * at;
    const way = makeWay(`ext${index}`, ex, ey, arm.angle + turn, { role: 'extension', start: 6, max: EXTENSION_MAX, arm: arm.arm, junction: at });
    // Its side streets go outward only, away from the old town.
    const nx = -Math.sin(way.angle);
    const ny = Math.cos(way.angle);
    const outward: 1 | -1 = nx * ex + ny * ey >= 0 ? 1 : -1;
    addSides(way, EXTENSION_SIDES, outward, 88);
    extensions.push(way);
    return way;
  };

  // ── Geometry helpers ──
  const rectOn = (way: Way, side: 1 | -1, t0: number, w: number, near: number, far: number): Polygon => {
    const dx = Math.cos(way.angle);
    const dy = Math.sin(way.angle);
    const nx = -dy * side;
    const ny = dx * side;
    const at = (t: number, s: number) => toWorld(way.ox + dx * t + nx * s, way.oy + dy * t + ny * s);
    const poly = [at(t0, near), at(t0 + w, near), at(t0 + w, far), at(t0, far)];
    return side === 1 ? poly : poly.reverse();
  };
  const localCentre = (way: Way, side: 1 | -1, t: number, s: number) => {
    const dx = Math.cos(way.angle);
    const dy = Math.sin(way.angle);
    return { x: way.ox + dx * t - dy * side * s, y: way.oy + dy * t + dx * side * s };
  };
  const skipGaps = (way: Way, side: 1 | -1, t: number, w: number): number => {
    let moved = true;
    while (moved) {
      moved = false;
      for (const [g0, g1] of way.gaps[side]) {
        if (t < g1 && t + w > g0) {
          t = g1;
          moved = true;
        }
      }
    }
    return t;
  };

  // ── Quarters ──
  const quarters: Quarter[] = [];
  const quarterOf = new Map<string, Quarter>();
  const homeFor = (index: number, kind: FeatureKind): Way[] => {
    if (index < arms.length) return [arms[index]!, ...(sideWays.get(arms[index]!) ?? [])];
    if (index < arms.length + 4) {
      const ext = extend(index);
      return [ext, ...(sideWays.get(ext) ?? [])];
    }
    void kind;
    return quarters[index % quarters.length]!.home;
  };

  const lots: Lot[] = [];
  const parcels: Polygon[] = [];
  const features = [...place.features].sort((a, b) => a.order - b.order);

  for (const f of features) {
    const key = f.ward ?? '';
    let quarter = quarterOf.get(key);
    if (!quarter) {
      quarter = { name: f.ward, founded: f.kind, home: homeFor(quarters.length, f.kind), lots: [], kinds: {} };
      quarters.push(quarter);
      quarterOf.set(key, quarter);
    }
    const spec = KIND[f.kind];
    const fr = rng(`${seed}|lot|${f.id}`);
    const width = fr.range(spec.width[0], spec.width[1]);
    const depth = fr.range(spec.depth[0], spec.depth[1]);
    const gap = fr.range(spec.gap[0], spec.gap[1]);
    const ribbon = KIND[quarter.founded].ribbon;
    const onExtension = quarter.home[0]!.role === 'extension';

    // Where it may stand: its own quarter's ways, and (for the old quarters) the other arms
    // of the crossroads at a price, so that a place with one quarter still grows a centre.
    const candidates: { way: Way; penalty: number }[] = [];
    quarter.home.forEach((way, n) => candidates.push({ way, penalty: n === 0 ? 0 : ribbon }));
    if (!onExtension) {
      const homeArm = quarter.home[0]!.arm ?? 0;
      for (const arm of arms) {
        if (arm === quarter.home[0]) continue;
        const sameRoute = (arm.arm! < 2) === (homeArm < 2);
        // A quarter of terraces would rather run on down its street than turn the corner.
        candidates.push({ way: arm, penalty: sameRoute ? 9 : 30 + ribbon * 0.7 });
      }
    }

    let placed: { way: Way; side: 1 | -1; t: number; parcel: Polygon } | null = null;
    for (let attempt = 0; attempt < 240 && !placed; attempt++) {
      let best: { way: Way; side: 1 | -1; t: number; cost: number } | null = null;
      for (const { way, penalty } of candidates) {
        for (const side of way.sides) {
          const t = skipGaps(way, side, Math.max(way.cursor[side], way.start), width);
          if (t + width > way.max) continue;
          const c = localCentre(way, side, t + width / 2, HALF_STREET + depth / 2);
          const cost = Math.hypot(c.x, c.y) + penalty + (way.lots === 0 && way.role === 'side' ? 6 : 0);
          if (!best || cost < best.cost - 1e-9) best = { way, side, t, cost };
        }
      }
      if (!best) {
        // The quarter has filled every street it has: its main street runs on.
        quarter.home[0]!.max += 60;
        continue;
      }
      // The old core is irregular: frontages step forward and back. Later streets are ruled.
      const old = best.cost < 58 && best.way.role !== 'extension';
      const setback = old ? fr.range(0, 2.4) : f.kind === 'frontage' ? 0 : 0.6;
      const parcel = rectOn(best.way, best.side, best.t, width, HALF_STREET + setback, HALF_STREET + setback + depth);
      if (parcels.some((p) => convexOverlap(p, parcel))) {
        best.way.cursor[best.side] = best.t + 5;
        continue;
      }
      placed = { way: best.way, side: best.side, t: best.t, parcel };
      best.way.cursor[best.side] = best.t + width + gap + (old ? fr.range(0, 3) : 0);
    }
    if (!placed) continue;

    placed.way.used = Math.max(placed.way.used, placed.t + width);
    placed.way.lots++;
    parcels.push(placed.parcel);
    const footprint = footprintFor(f, placed.parcel, placed.side, width, depth, fr);
    const main = footprint[0]!;
    const c = boundsOf(main);
    const lot: Lot = {
      feature: f.id,
      parcel: placed.parcel,
      footprint,
      center: { x: c.x + c.w / 2, y: c.y + c.h / 2 },
      block: quarters.indexOf(quarter),
    };
    lots.push(lot);
    quarter.lots.push(lot);
    quarter.kinds[f.kind] = (quarter.kinds[f.kind] ?? 0) + 1;
  }

  const built = features.some((f) => REAL.includes(f.stage));

  // ── Fabric: terraces on the back lanes behind the main frontages ──
  // Each has a fixed place in the skeleton. How many are revealed follows the work, and one
  // only appears once the street in front of it has been built that far.
  const dwellings: Dwelling[] = [];
  // An outpost has no suburbs: fabric is what a place acquires once it is a settlement.
  const young = place.rank === 'spark' || place.rank === 'site' || place.rank === 'outpost';
  const want = built && !young ? fabricCount(place.commits, place.users, place.activeWeeks) : 0;
  if (want > 0) {
    const spots: { poly: Polygon; reach: number }[] = [];
    const backRow = (way: Way, side: 1 | -1, from: number, near: number, upTo = way.used + 6, tag = 'back') => {
      const hr = rng(`${seed}|fabric|${tag}|${way.id}|${side}`);
      let t = from + hr.range(0, 6);
      while (t < upTo + 30) {
        // Smaller than any named building: this is the background a town is seen against.
        const len = hr.range(7.5, 13);
        const deep = hr.range(4.8, 6.2);
        const set = hr.range(0, 1.6);
        const end = t + len;
        if (end <= upTo) {
          const c = localCentre(way, side, t + len / 2, near + set + deep / 2);
          spots.push({ poly: rectOn(way, side, t, len, near + set, near + set + deep), reach: Math.hypot(c.x, c.y) });
        }
        t = end + hr.range(2, 6);
      }
    };
    for (const way of [...arms, ...extensions]) {
      if (way.lots === 0) continue;
      // Behind the frontages, on both sides; the overlap test keeps them out of what is built.
      backRow(way, -1, 14, HALF_STREET + 23);
      backRow(way, 1, 18, HALF_STREET + 23);
      backRow(way, -1, 20, HALF_STREET + 33.5, way.used + 6, 'rear');
      // Infill: wherever frontage was left open between the named buildings.
      backRow(way, 1, way.start, HALF_STREET + 0.6, way.used, 'infill');
      backRow(way, -1, way.start, HALF_STREET + 0.6, way.used, 'infill');
      // And strung along the road out of town, past the last named frontage. If a feature is
      // later built there, the terrace gives way to it.
      // Only on the through route: that is the road people arrive by.
      if (way.role === 'route') {
        backRow(way, 1, way.used + 4, HALF_STREET + 0.6, way.used + 40, 'ribbon');
        backRow(way, -1, way.used + 4, HALF_STREET + 0.6, way.used + 40, 'ribbon');
      }
      for (const side of sideWays.get(way) ?? []) {
        if (side.lots === 0) continue;
        backRow(side, 1, SIDE_START + 4, HALF_STREET + 22);
        backRow(side, -1, SIDE_START + 4, HALF_STREET + 22);
        backRow(side, 1, SIDE_START, HALF_STREET + 0.6, side.used, 'infill');
        backRow(side, -1, SIDE_START, HALF_STREET + 0.6, side.used, 'infill');
      }
    }
    spots.sort((a, b) => a.reach - b.reach);
    const taken: Polygon[] = [];
    for (const spot of spots) {
      if (dwellings.length >= want) break;
      if (parcels.some((p) => convexOverlap(p, spot.poly)) || taken.some((p) => convexOverlap(p, spot.poly))) continue;
      taken.push(spot.poly);
      dwellings.push({ footprint: spot.poly });
    }
  }

  // ── Streets: only as far as they have been built along ──
  const streets: Street[] = [];
  if (built) {
    const line = (way: Way, from: number, to: number): [Point, Point] => [
      toWorld(way.ox + Math.cos(way.angle) * from, way.oy + Math.sin(way.angle) * from),
      toWorld(way.ox + Math.cos(way.angle) * to, way.oy + Math.sin(way.angle) * to),
    ];
    const anyOnRoute = arms[0]!.lots + arms[1]!.lots > 0;
    arms.forEach((arm, i) => {
      const beyond = extensions
        .filter((e) => e.arm === i && e.lots + (sideWays.get(e) ?? []).reduce((n, s) => n + s.lots, 0) > 0)
        .map((e) => e.junction ?? 0);
      const reach = Math.max(arm.used, ...(sideWays.get(arm) ?? []).filter((s) => s.lots > 0).map((s) => s.junction ?? 0), 0);
      // The through route always runs a little way out of a place, even where nothing fronts it yet.
      const far = beyond.length ? Math.max(...beyond) : reach > 0 ? reach + 9 : i < 2 && anyOnRoute ? 20 : 0;
      if (far <= 0) return;
      const home = quarters.find((q) => q.home[0] === arm);
      // From the very middle, so the through route goes through.
      const street: Street = { line: line(arm, -R0, far), main: true, grade: streetGrade(place.rank, arm.role) };
      if (home?.name) street.name = `${home.name} ${i < 2 ? 'St' : 'Ave'}`;
      streets.push(street);
    });
    for (const [parent, list] of sideWays) {
      for (const side of list) {
        if (side.lots === 0) continue;
        streets.push({ line: line(side, 0, side.used + 7), main: false, grade: streetGrade(place.rank, 'side') });
      }
      void parent;
    }
    for (const ext of extensions) {
      const sides = (sideWays.get(ext) ?? []).filter((s) => s.lots > 0);
      if (ext.lots === 0 && sides.length === 0) continue;
      const home = quarters.find((q) => q.home[0] === ext);
      const street: Street = {
        line: line(ext, 0, Math.max(ext.used + 9, ...sides.map((s) => (s.junction ?? 0) + 4))),
        main: true,
        grade: streetGrade(place.rank, 'extension'),
      };
      if (home?.name) street.name = `${home.name} Rd`;
      streets.push(street);
    }
  }

  // ── The middle: a common once there is a crossing, a square once it is a town ──
  let square: CityPlan['square'];
  const armsInUse = arms.filter((a) => a.lots > 0).length;
  if (built && armsInUse >= Math.min(3, arms.length)) {
    // Corners between each arm and the next one round, so the square is the junction's own shape.
    const ring = [...arms].sort((p, q) => norm(p.angle) - norm(q.angle));
    const outline = ring.map((a, i) => {
      const b = ring[(i + 1) % ring.length]!;
      let mid = (norm(a.angle) + norm(b.angle)) / 2;
      if (norm(b.angle) < norm(a.angle)) mid += Math.PI;
      const gap = Math.abs(((norm(b.angle) - norm(a.angle) + Math.PI * 2) % (Math.PI * 2)) / 2);
      // Just inside where the first frontages stand.
      const r = R0 * (gap > 1.2 ? 0.8 : 1.02);
      return toWorld(Math.cos(mid) * r, Math.sin(mid) * r);
    });
    const rank = place.rank;
    square = { outline, grade: rank === 'city' || rank === 'major' ? 'plaza' : rank === 'town' ? 'square' : 'common' };
  }

  // ── Quarters, for lettering ──
  const wards: Ward[] = [];
  for (const q of quarters) {
    if (!q.name || q.lots.length === 0) continue;
    let x = 0;
    let y = 0;
    for (const lot of q.lots) {
      x += lot.center.x;
      y += lot.center.y;
    }
    let angle = theta + q.home[0]!.angle;
    angle = Math.atan2(Math.sin(angle), Math.cos(angle));
    if (angle > Math.PI / 2) angle -= Math.PI;
    if (angle < -Math.PI / 2) angle += Math.PI;
    let dominant: FeatureKind = q.founded;
    let most = 0;
    for (const [kind, n] of Object.entries(q.kinds) as [FeatureKind, number][]) {
      if (n > most) {
        most = n;
        dominant = kind;
      }
    }
    wards.push({ name: q.name, labelAt: { x: x / q.lots.length, y: y / q.lots.length }, angle, dominant });
  }

  // ── Extent ──
  const all: Point[] = [];
  for (const lot of lots) all.push(...lot.parcel);
  for (const s of streets) all.push(...s.line);
  for (const d of dwellings) all.push(...d.footprint);
  for (const w of wards) all.push(w.labelAt);
  if (square) all.push(...square.outline);
  let radius = 10;
  for (const p of all) radius = Math.max(radius, Math.hypot(p.x - center.x, p.y - center.y));
  const b = all.length ? boundsOf(all) : { x: center.x - 10, y: center.y - 10, w: 20, h: 20 };

  const plan: CityPlan = {
    place: place.id,
    center,
    angle: theta,
    radius,
    bounds: { x: Math.min(b.x, center.x - 10), y: Math.min(b.y, center.y - 10), w: Math.max(b.w, 20), h: Math.max(b.h, 20) },
    blocks: [],
    streets,
    lots,
    wards,
    dwellings,
  };
  if (square) plan.square = square;
  return plan;
}

const norm = (a: number) => ((a % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);

// ───────────────────────── Buildings ─────────────────────────

/**
 * The building on a lot. Its plan says what it is: a terrace hard on the street, a works
 * with a yard and a shed, a round tank, a dome in its grounds, a long shed. The main mass
 * depends only on the feature; annexes arrive with maturity.
 */
function footprintFor(
  f: FeatureState,
  parcel: Polygon,
  side: 1 | -1,
  width: number,
  depth: number,
  fr: ReturnType<typeof rng>,
): Polygon[] {
  // Work in (u along the front, v back from it).
  // On the left of a street the parcel is [front-left, front-right, back-right, back-left];
  // on the right it is wound the other way.
  const o = side === 1 ? parcel[0]! : parcel[3]!;
  const ux = side === 1 ? parcel[1]! : parcel[2]!;
  const vx = side === 1 ? parcel[3]! : parcel[0]!;
  const eu = { x: (ux.x - o.x) / width, y: (ux.y - o.y) / width };
  const ev = { x: (vx.x - o.x) / depth, y: (vx.y - o.y) / depth };
  const at = (u: number, v: number): Point => ({ x: o.x + eu.x * u + ev.x * v, y: o.y + eu.y * u + ev.y * v });
  const box = (u0: number, v0: number, u1: number, v1: number): Polygon => [at(u0, v0), at(u1, v0), at(u1, v1), at(u0, v1)];
  const round = (cu: number, cv: number, r: number, sides: number, turn = 0): Polygon =>
    Array.from({ length: sides }, (_, i) => {
      const t = turn + (i / sides) * Math.PI * 2;
      return at(cu + Math.cos(t) * r, cv + Math.sin(t) * r);
    });

  const grown = f.stage === 'mature' || f.storeys >= 4;
  const out: Polygon[] = [];
  switch (f.kind) {
    case 'frontage': {
      const back = depth * fr.range(0.6, 0.8);
      out.push(box(0.25, 0.3, width - 0.25, back));
      if (grown && width > 7) out.push(box(1, back + 0.6, Math.min(width - 1, 5.5), Math.min(depth - 0.5, back + 4)));
      break;
    }
    case 'works': {
      const back = depth - 3.2;
      const notch = fr.next();
      if (notch < 0.45) {
        // An L: one rear corner left open as a yard.
        const cut = width * fr.range(0.3, 0.45);
        const step = back * fr.range(0.45, 0.6);
        out.push(
          fr.next() < 0.5
            ? [at(1, 0.5), at(width - 1, 0.5), at(width - 1, step), at(width - 1 - cut, step), at(width - 1 - cut, back), at(1, back)]
            : [at(1, 0.5), at(width - 1, 0.5), at(width - 1, back), at(1 + cut, back), at(1 + cut, step), at(1, step)],
        );
      } else out.push(box(1, 0.5, width - 1, back));
      if (grown) out.push(box(1.4, depth - 2.6, Math.min(width - 1.4, 7), depth - 0.5));
      break;
    }
    case 'reservoir': {
      const r = Math.min(width, depth) / 2 - 2.3;
      out.push(round(width / 2, depth / 2, r, 16));
      if (grown) out.push(box(0.6, 0.6, 3.4, 4.2));
      break;
    }
    case 'observatory': {
      const r = Math.min(width, depth) / 2 - 4.2;
      out.push(round(width / 2, depth / 2 + 1, r, 8, Math.PI / 8));
      if (grown) out.push(box(width / 2 - 2.2, 0.8, width / 2 + 2.2, depth / 2 + 1 - r - 0.8));
      break;
    }
    case 'utility': {
      out.push(box(0.8, 1, width - 0.8, depth - 1.3));
      break;
    }
  }
  return out;
}
