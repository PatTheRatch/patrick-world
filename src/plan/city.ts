// A place drawn as a town plan: blocks on a street grid, lots in the blocks, a building on
// each lot.
//
// The rule that governs every line of this file: time only adds. Every decision for the
// feature with order N reads only the place id, the place position and the features with
// order <= N (their id, order, kind and ward). Stage, storeys and users may add annexes
// and dwellings; they never move a parcel, a main mass, a block or a street.

import type { FeatureKind, FeatureState, PlaceState, Point } from '../world/types';
import { boundsOf, polygonCentroid } from './geometry';
import { hash01, rng, type Rng } from './rng';
import type { Block, CityPlan, Dwelling, Lot, Polygon, Street, Ward } from './types';

// ───────────────────────── The grid ─────────────────────────

export const BLOCK_W = 46;
export const BLOCK_H = 34;
export const STREET_W = 5;
export const MAIN_STREET_W = 8;
/** How far a street runs on past the edge of the last block it serves, as a share of the next block. */
const STREET_END = 0.3;

/**
 * One direction of the street grid: an endless run of blocks separated by streets.
 * Block `i` lies between street line `i` and street line `i + 1`. Sizes come from a hash
 * of the index, so the grid is the same however much of it is ever looked at.
 */
class Axis {
  private readonly starts = new Map<number, number>([]);
  private readonly period: number;
  private readonly offset: number;

  constructor(
    private readonly seed: string,
    private readonly base: number,
    /** Chance that a block is a long one. */
    private readonly longChance: number,
  ) {
    this.period = hash01(`${seed}|period`) < 0.5 ? 3 : 4;
    // Line 0 is always a main street and passes through the origin: a town stands on a
    // crossroads, with its first four blocks in the corners.
    this.offset = 0;
    this.starts.set(0, this.gap(0) / 2);
  }

  /** Length of block `i` along this axis. */
  size(i: number): number {
    const h = hash01(`${this.seed}|size|${i}`);
    const long = i !== 0 && i !== -1 && hash01(`${this.seed}|long|${i}`) < this.longChance ? 1.45 : 1;
    return Math.round(this.base * (0.88 + 0.26 * h) * long * 2) / 2;
  }

  /** Whether street line `k` (between blocks k-1 and k) is a main street. */
  isMain(k: number): boolean {
    return (((k - this.offset) % this.period) + this.period) % this.period === 0;
  }

  /** Width of street line `k`. */
  gap(k: number): number {
    return this.isMain(k) ? MAIN_STREET_W : STREET_W;
  }

  /** Coordinate where block `i` begins. */
  start(i: number): number {
    const known = this.starts.get(i);
    if (known !== undefined) return known;
    let v: number;
    if (i > 0) v = this.start(i - 1) + this.size(i - 1) + this.gap(i);
    else v = this.start(i + 1) - this.gap(i + 1) - this.size(i);
    this.starts.set(i, v);
    return v;
  }

  end(i: number): number {
    return this.start(i) + this.size(i);
  }

  mid(i: number): number {
    return this.start(i) + this.size(i) / 2;
  }

  /** Centre-line coordinate of street line `k`. */
  line(k: number): number {
    return this.start(k) - this.gap(k) / 2;
  }
}

// ───────────────────────── Lots by kind ─────────────────────────

interface KindSpec {
  /** Frontage a lot of this kind asks for. */
  w: readonly [number, number];
  /** The least frontage it will accept. */
  min: number;
}

const KIND: Record<FeatureKind, KindSpec> = {
  frontage: { w: [13, 17.5], min: 9.5 },
  works: { w: [28, 36], min: 17 },
  reservoir: { w: [23, 30], min: 16 },
  observatory: { w: [15.5, 19], min: 12 },
  utility: { w: [11, 14], min: 8.5 },
};

/** A leftover narrower than this is given to the lot beside it rather than left over. */
const SLIVER = 8;

interface Cell {
  i: number;
  j: number;
  x0: number;
  x1: number;
  y0: number;
  y1: number;
  /** Centre, in the city's own frame. */
  cx: number;
  cy: number;
  ward: string | undefined;
  /** Index into `CityPlan.blocks`. */
  index: number;
  /** Where the two rows of lots meet, back to back. */
  rowY: number;
  /** Which end each row fills from. */
  dir: [1 | -1, 1 | -1];
  /** Frontage already taken in each row. */
  cursor: [number, number];
}

interface Placement {
  cell: Cell;
  row: 0 | 1;
  /** Lot extent across the block. */
  a: number;
  b: number;
}

const key = (i: number, j: number): string => `${i},${j}`;
const GOLDEN = Math.PI * (3 - Math.sqrt(5));

const ORDINALS = [
  'First',
  'Second',
  'Third',
  'Fourth',
  'Fifth',
  'Sixth',
  'Seventh',
  'Eighth',
  'Ninth',
  'Tenth',
  'Eleventh',
  'Twelfth',
];

function titleCase(s: string): string {
  return s
    .split(/[\s_-]+/)
    .filter((w) => w.length > 0)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

const round = (v: number): number => Math.round(v * 1000) / 1000;

// ───────────────────────── Buildings ─────────────────────────

interface Cut {
  w: number;
  h: number;
}

interface Mass {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  fl?: Cut;
  fr?: Cut;
  rl?: Cut;
  rr?: Cut;
}

/** A rectangle with up to four corners notched out, as a simple polygon. Lot frame. */
function massPolygon(m: Mass): Point[] {
  const { x0, y0, x1, y1 } = m;
  const out: Point[] = [];
  if (m.fl) out.push({ x: x0 + m.fl.w, y: y0 });
  else out.push({ x: x0, y: y0 });
  if (m.fr) {
    out.push({ x: x1 - m.fr.w, y: y0 }, { x: x1 - m.fr.w, y: y0 + m.fr.h }, { x: x1, y: y0 + m.fr.h });
  } else out.push({ x: x1, y: y0 });
  if (m.rr) {
    out.push({ x: x1, y: y1 - m.rr.h }, { x: x1 - m.rr.w, y: y1 - m.rr.h }, { x: x1 - m.rr.w, y: y1 });
  } else out.push({ x: x1, y: y1 });
  if (m.rl) {
    out.push({ x: x0 + m.rl.w, y: y1 }, { x: x0 + m.rl.w, y: y1 - m.rl.h }, { x: x0, y: y1 - m.rl.h });
  } else out.push({ x: x0, y: y1 });
  if (m.fl) out.push({ x: x0, y: y0 + m.fl.h }, { x: x0 + m.fl.w, y: y0 + m.fl.h });
  return out;
}

/** Clear strip kept along the rear lot line. */
const YARD_EDGE = 0.4;

/**
 * The main mass on a lot `w` wide and `d` deep, in the lot's own frame: x across the
 * frontage, y from the street line (0) back to the rear lot line (d). Buildings nearly
 * fill their lots, as on an insurance sheet: a narrow passage each side, a small yard
 * behind, and any variety taken as bites out of that.
 */
function mainMass(kind: FeatureKind, w: number, d: number, r: Rng): Mass {
  let x0: number;
  let x1: number;
  let y0: number;
  let y1: number;
  switch (kind) {
    case 'frontage': {
      // On the street line, often sharing a party wall with the neighbour.
      x0 = r.next() < 0.45 ? 0 : r.range(0.5, 1);
      x1 = w - (r.next() < 0.45 ? 0 : r.range(0.5, 1));
      y0 = 0;
      y1 = d - r.range(2, 3.4);
      break;
    }
    case 'works': {
      // Big and blocky, on the street line.
      x0 = r.range(0.5, 1.1);
      x1 = w - r.range(0.5, 1.1);
      y0 = 0;
      y1 = d - r.range(2, 3.2);
      break;
    }
    case 'reservoir': {
      x0 = r.range(0.7, 1.3);
      x1 = w - r.range(0.7, 1.3);
      y0 = r.range(0.6, 1.3);
      y1 = d - r.range(2, 3.2);
      break;
    }
    case 'observatory': {
      // Squarish, standing a little back from the street.
      y0 = r.range(1.1, 1.8);
      y1 = d - r.range(2, 2.8);
      const span = Math.min(w - 1.4, (y1 - y0) * r.range(1, 1.2));
      x0 = (w - span) * r.range(0.35, 0.65);
      x1 = x0 + span;
      break;
    }
    case 'utility': {
      // Small lots, long sheds.
      x0 = r.range(0.6, 1.1);
      x1 = w - r.range(0.6, 1.1);
      y0 = r.range(0.4, 1.1);
      y1 = d - r.range(2, 3.4);
      break;
    }
  }
  const m: Mass = { x0, y0, x1, y1 };
  const mw = x1 - x0;
  const md = y1 - y0;

  // Shape: mostly plain rectangles, some L-plans, the odd notched corner.
  const lChance: Record<FeatureKind, number> = {
    frontage: 0.22,
    works: 0.4,
    reservoir: 0.2,
    observatory: 0.14,
    utility: 0.08,
  };
  const shape = r.next();
  const side = r.next() < 0.5;
  const cw = r.range(0.26, 0.42);
  const ch = r.range(0.24, 0.4);
  const notch = r.range(1.5, 2.4);
  const notchFront = r.next() < 0.4;
  const tee = r.next() < 0.22;
  if (mw >= 8 && md >= 7 && shape < lChance[kind]) {
    const cut: Cut = { w: mw * cw, h: md * ch };
    if (kind === 'works' && tee && mw >= 16) {
      // Both rear corners cut: a T.
      const each: Cut = { w: mw * cw * 0.5, h: md * ch };
      m.rl = each;
      m.rr = { ...each };
    } else if (side) m.rl = cut;
    else m.rr = cut;
  } else if (mw >= 7 && md >= 7 && shape > 0.8) {
    const cut: Cut = { w: notch, h: notch };
    if (notchFront && kind !== 'frontage' && kind !== 'works') {
      if (side) m.fl = cut;
      else m.fr = cut;
    } else if (side) m.rl = cut;
    else m.rr = cut;
  }
  return m;
}

type Rect = [number, number, number, number];

/**
 * Up to two annexes in the rear yard: a wing against the back wall and a detached shed
 * on the rear lot line. Both are fixed by the feature's seed; maturity only reveals them.
 */
function annexRects(m: Mass, w: number, d: number, r: Rng): Rect[] {
  const out: Rect[] = [];
  const wallA = m.x0 + (m.rl ? m.rl.w : 0);
  const wallB = m.x1 - (m.rr ? m.rr.w : 0);
  const mid = (wallA + wallB) / 2;
  const yardEnd = d - YARD_EDGE;
  const yard = yardEnd - m.y1;
  const wingLeft = r.next() < 0.5;
  const wingFrac = r.range(0.55, 0.95);
  const wingDepth = r.range(1.5, 3);
  const wingSlide = r.next();
  const shedW = r.range(2.2, 3.4);
  const shedD = r.range(1.3, 2.2);

  // Rear wing: shares the back wall, on one half of it.
  const halfA = wingLeft ? wallA : mid + 0.3;
  const halfB = wingLeft ? mid - 0.3 : wallB;
  const room = halfB - halfA;
  if (room >= 2 && yard >= 1.3) {
    const ww = Math.max(2, room * wingFrac);
    const x = halfA + (room - ww) * wingSlide;
    out.push([x, m.y1, x + ww, m.y1 + Math.min(wingDepth, yard)]);
  }

  // Shed: on the rear lot line in the other half of the yard, clear of the main mass.
  const lotA = wingLeft ? mid + 0.3 : Math.max(YARD_EDGE, m.x0);
  const lotB = wingLeft ? Math.min(w - YARD_EDGE, m.x1) : mid - 0.3;
  const sd = Math.min(shedD, yard - 0.4);
  const sw = Math.min(shedW, lotB - lotA);
  if (sw >= 1.8 && sd >= 1.1) {
    const x = wingLeft ? lotB - sw : lotA;
    out.push([x, yardEnd - sd, x + sw, yardEnd]);
  }
  return out;
}

function annexCount(f: FeatureState, r: Rng): number {
  const seeded = r.next() < 0.5 ? 1 : 2;
  if (f.storeys >= 7) return 2;
  if (f.stage === 'mature' || f.storeys >= 4) return seeded;
  return 0;
}

// ───────────────────────── The plan ─────────────────────────

/** About this many commits stand behind one ordinary house. */
export const COMMITS_PER_HOUSE = 9;
export const HOUSE_CAP = 260;
const HOUSE_RINGS = 5;

export function planCity(place: PlaceState): CityPlan {
  const id = place.id;
  const center = { x: place.position.x, y: place.position.y };
  const angle = round((hash01(`${id}|angle`) - 0.5) * Math.PI);
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  const toWorld = (u: number, v: number): Point => ({
    x: round(center.x + u * cos - v * sin),
    y: round(center.y + u * sin + v * cos),
  });
  const rect = (x0: number, y0: number, x1: number, y1: number): Polygon => [
    toWorld(x0, y0),
    toWorld(x1, y0),
    toWorld(x1, y1),
    toWorld(x0, y1),
  ];

  const features = place.features.slice().sort((a, b) => a.order - b.order);
  if (features.length === 0) {
    return {
      place: id,
      center,
      angle,
      radius: 10,
      bounds: { x: center.x - 10, y: center.y - 10, w: 20, h: 20 },
      blocks: [],
      streets: [],
      lots: [],
      wards: [],
      dwellings: [],
    };
  }

  const xs = new Axis(`${id}|x`, BLOCK_W, 0.1);
  const ys = new Axis(`${id}|y`, BLOCK_H, 0.06);

  // The town's silhouette: stretched along one seeded axis, usually near a grid direction
  // because towns grow along their first street.
  const stretchAngle =
    (hash01(`${id}|stretch-dir`) < 0.6 ? 0 : Math.PI / 2) + (hash01(`${id}|stretch-skew`) - 0.5) * 0.7;
  const stretch = 1.04 + 0.26 * hash01(`${id}|stretch`);
  const sc = Math.cos(stretchAngle);
  const ss = Math.sin(stretchAngle);
  const reach = (cx: number, cy: number): number => {
    const a = cx * sc + cy * ss;
    const b = -cx * ss + cy * sc;
    return Math.hypot(a / stretch, b * Math.sqrt(stretch));
  };
  const jitter = (i: number, j: number): number => hash01(`${id}|cell|${i}|${j}`);
  const wardTurn = hash01(`${id}|ward-turn`) * Math.PI * 2;

  const claimed = new Map<string, Cell>();
  const cells: Cell[] = [];
  const wardCells = new Map<string, Cell[]>();
  const wardDir = new Map<string, number>();
  let iMin = 0;
  let iMax = 0;
  let jMin = 0;
  let jMax = 0;

  // Street names are fixed by the first block to border a main street.
  const streetNames = new Map<string, string>();
  const usedNames = new Set<string>();
  const ordinalNext = { v: 0, h: 0 };
  const nameLine = (orient: 'v' | 'h', k: number, ward: string | undefined): void => {
    const lineKey = `${orient}${k}`;
    if (streetNames.has(lineKey)) return;
    const suffix = orient === 'v' ? 'St' : 'Ave';
    let name = ward ? `${titleCase(ward)} ${suffix}` : '';
    if (name === '' || usedNames.has(name)) {
      for (;;) {
        const n = ordinalNext[orient]++;
        name = `${ORDINALS[n] ?? `No. ${n + 1}`} ${suffix}`;
        if (!usedNames.has(name)) break;
      }
    }
    usedNames.add(name);
    streetNames.set(lineKey, name);
  };

  const claim = (wardKey: string, ward: string | undefined): Cell => {
    const own = wardCells.get(wardKey);
    let best: { i: number; j: number; score: number } | undefined;
    const dir = wardDir.get(wardKey);
    for (let j = jMin - 1; j <= jMax + 1; j++) {
      for (let i = iMin - 1; i <= iMax + 1; i++) {
        if (claimed.has(key(i, j))) continue;
        // The town grows as one mass: after the first block, only cells that share a
        // street with a block already standing may be claimed.
        if (
          cells.length > 0 &&
          !claimed.has(key(i - 1, j)) &&
          !claimed.has(key(i + 1, j)) &&
          !claimed.has(key(i, j - 1)) &&
          !claimed.has(key(i, j + 1))
        ) {
          continue;
        }
        const cx = xs.mid(i);
        const cy = ys.mid(j);
        const out = reach(cx, cy);
        const turn = dir === undefined ? 0 : 1 - Math.cos(Math.atan2(cy, cx) - dir);
        let score: number;
        if (own && own.length > 0) {
          // Grow the quarter: the nearest free cell to what the ward already holds.
          let near = Infinity;
          for (const c of own) {
            const dd = Math.hypot((c.cx - cx) / stretch, (c.cy - cy) * 1.25);
            if (dd < near) near = dd;
          }
          score = near + 0.6 * out + 5 * turn + 5 * jitter(i, j);
        } else {
          // Found the quarter: hard against the town, on the side its bearing points.
          score = out + 9 * turn + 5 * jitter(i, j);
        }
        if (!best || score < best.score) best = { i, j, score };
      }
    }
    // The search window always holds free cells, so `best` is set.
    const pick = best as { i: number; j: number };
    const x0 = xs.start(pick.i);
    const x1 = xs.end(pick.i);
    const y0 = ys.start(pick.j);
    const y1 = ys.end(pick.j);
    const cr = rng(`${id}|block|${pick.i}|${pick.j}`);
    const fillFrom = pick.i >= 0 ? 1 : -1;
    const cell: Cell = {
      i: pick.i,
      j: pick.j,
      x0,
      x1,
      y0,
      y1,
      cx: (x0 + x1) / 2,
      cy: (y0 + y1) / 2,
      ward,
      index: cells.length,
      rowY: y0 + (y1 - y0) * cr.range(0.45, 0.55),
      // Both rows fill from the end of the block nearer the centre of town, so a
      // block's first buildings huddle together on the side people arrive from.
      dir: fillFrom === 1 ? [1, 1] : [-1, -1],
      cursor: [0, 0],
    };
    claimed.set(key(pick.i, pick.j), cell);
    cells.push(cell);
    if (own) own.push(cell);
    else wardCells.set(wardKey, [cell]);
    iMin = Math.min(iMin, pick.i);
    iMax = Math.max(iMax, pick.i);
    jMin = Math.min(jMin, pick.j);
    jMax = Math.max(jMax, pick.j);
    if (xs.isMain(pick.i)) nameLine('v', pick.i, ward);
    if (xs.isMain(pick.i + 1)) nameLine('v', pick.i + 1, ward);
    if (ys.isMain(pick.j)) nameLine('h', pick.j, ward);
    if (ys.isMain(pick.j + 1)) nameLine('h', pick.j + 1, ward);
    return cell;
  };

  const fit = (cell: Cell, kind: FeatureKind, want: number): Placement | undefined => {
    const width = cell.x1 - cell.x0;
    // The emptier row first; on a tie, the row that faces the centre of town.
    const inner: 0 | 1 = cell.j >= 0 ? 0 : 1;
    const outer: 0 | 1 = inner === 0 ? 1 : 0;
    const rows: (0 | 1)[] = cell.cursor[inner] <= cell.cursor[outer] ? [inner, outer] : [outer, inner];
    for (const row of rows) {
      const used = cell.cursor[row];
      const left = width - used;
      if (left < KIND[kind].min - 1e-9) continue;
      let w = Math.min(want, left);
      if (left - w < SLIVER) w = left;
      const a = cell.dir[row] === 1 ? cell.x0 + used : cell.x1 - used - w;
      return { cell, row, a, b: a + w };
    }
    return undefined;
  };

  const lots: Lot[] = [];
  const wardKinds = new Map<string, Map<FeatureKind, number>>();
  const wardOrder: string[] = [];

  for (const f of features) {
    const ward = f.ward !== undefined && f.ward !== '' ? f.ward : undefined;
    const wardKey = ward ?? '';
    if (!wardCells.has(wardKey) && ward !== undefined && !wardDir.has(wardKey)) {
      wardDir.set(wardKey, wardTurn + wardDir.size * GOLDEN);
    }
    if (ward !== undefined) {
      let kinds = wardKinds.get(ward);
      if (!kinds) {
        kinds = new Map();
        wardKinds.set(ward, kinds);
        wardOrder.push(ward);
      }
      kinds.set(f.kind, (kinds.get(f.kind) ?? 0) + 1);
    }

    const fr = rng(`${id}|lot|${f.id}`);
    const want = fr.range(KIND[f.kind].w[0], KIND[f.kind].w[1]);
    let placed: Placement | undefined;
    for (const c of wardCells.get(wardKey) ?? []) {
      placed = fit(c, f.kind, want);
      if (placed) break;
    }
    if (!placed) placed = fit(claim(wardKey, ward), f.kind, want);
    if (!placed) continue; // Cannot happen: an empty block takes any kind.

    const { cell, row, a, b } = placed;
    cell.cursor[row] += b - a;
    const w = b - a;
    const front = row === 0 ? cell.y0 : cell.y1;
    const depth = row === 0 ? cell.rowY - cell.y0 : cell.y1 - cell.rowY;
    const into = row === 0 ? 1 : -1;
    // Lot frame to world: x across the frontage, y back from the street.
    const lotPoly = (pts: Point[]): Polygon => pts.map((p) => toWorld(a + p.x, front + into * p.y));
    const lotRect = (rc: Rect): Polygon =>
      lotPoly([
        { x: rc[0], y: rc[1] },
        { x: rc[2], y: rc[1] },
        { x: rc[2], y: rc[3] },
        { x: rc[0], y: rc[3] },
      ]);

    const mass = mainMass(f.kind, w, depth, rng(`${id}|mass|${f.id}`));
    const main = lotPoly(massPolygon(mass));
    const ar = rng(`${id}|annex|${f.id}`);
    const n = annexCount(f, ar);
    const annexes = n > 0 ? annexRects(mass, w, depth, ar).slice(0, n) : [];
    const c = polygonCentroid(main);
    lots.push({
      feature: f.id,
      parcel: lotRect([0, 0, w, depth]),
      footprint: [main, ...annexes.map(lotRect)],
      center: { x: round(c.x), y: round(c.y) },
      block: cell.index,
    });
  }

  // ── Blocks ──
  const blocks: Block[] = cells.map((c) => {
    const outline = rect(c.x0, c.y0, c.x1, c.y1);
    return c.ward === undefined ? { outline } : { outline, ward: c.ward };
  });

  // ── Streets: every grid line that bounds a claimed block, merged into long runs ──
  const streets: Street[] = [];
  const runs = (
    orient: 'v' | 'h',
    along: Axis,
    across: Axis,
    indexOf: (c: Cell) => [number, number],
  ): void => {
    const byLine = new Map<number, Set<number>>();
    for (const c of cells) {
      const [k, t] = indexOf(c);
      for (const line of [k, k + 1]) {
        let set = byLine.get(line);
        if (!set) {
          set = new Set();
          byLine.set(line, set);
        }
        set.add(t);
      }
    }
    for (const k of [...byLine.keys()].sort((p, q) => p - q)) {
      const ts = [...(byLine.get(k) as Set<number>)].sort((p, q) => p - q);
      let from = ts[0] as number;
      let prev = from;
      const emit = (t0: number, t1: number): void => {
        // A short way past the last block, so the town's edges trail off.
        const s = along.start(t0) - along.size(t0 - 1) * STREET_END;
        const e = along.end(t1) + along.size(t1 + 1) * STREET_END;
        const at = across.line(k);
        const line = orient === 'v' ? [toWorld(at, s), toWorld(at, e)] : [toWorld(s, at), toWorld(e, at)];
        const main = across.isMain(k);
        const name = main ? streetNames.get(`${orient}${k}`) : undefined;
        streets.push(name === undefined ? { line, main } : { line, main, name });
      };
      for (let n = 1; n < ts.length; n++) {
        const t = ts[n] as number;
        // A street runs on across a single open block between two built ones.
        if (t - prev > 2) {
          emit(from, prev);
          from = t;
        }
        prev = t;
      }
      emit(from, prev);
    }
  };
  runs('v', ys, xs, (c) => [c.i, c.j]);
  runs('h', xs, ys, (c) => [c.j, c.i]);

  // ── Wards ──
  let labelAngle = angle;
  while (labelAngle > Math.PI / 2) labelAngle -= Math.PI;
  while (labelAngle < -Math.PI / 2) labelAngle += Math.PI;
  const wards: Ward[] = wardOrder.map((name) => {
    const own = wardCells.get(name) ?? [];
    let u = 0;
    let v = 0;
    for (const c of own) {
      u += c.cx;
      v += c.cy;
    }
    const kinds = wardKinds.get(name) ?? new Map<FeatureKind, number>();
    let dominant: FeatureKind = 'frontage';
    let top = 0;
    for (const [kind, count] of kinds) {
      if (count > top) {
        top = count;
        dominant = kind;
      }
    }
    const k = Math.max(1, own.length);
    return { name, labelAt: toWorld(u / k, v / k), angle: labelAngle, dominant };
  });

  // ── Houses: the ordinary fabric of a town, in terraces on the blocks around it ──
  // The named buildings are features; the houses are everything else that was done. One for
  // about every nine commits, and more where people use the thing. This is what gives a
  // heavily worked place its physical size.
  const dwellings: Dwelling[] = [];
  const houseCount = Math.min(
    HOUSE_CAP,
    Math.max(0, Math.round(Math.max(0, place.commits) / COMMITS_PER_HOUSE) + Math.round(7 * Math.log10(1 + Math.max(0, place.users)))),
  );
  if (houseCount > 0 && claimed.size > 0) {
    type Side = 'top' | 'bottom' | 'left' | 'right';
    interface Slot {
      i: number;
      j: number;
      side: Side;
      /** Rings out from the town, two tiers each: the side facing in, then the far side. */
      tier: number;
      score: number;
    }
    const slots: Slot[] = [];
    const facing = (i: number, j: number, has: (k: string) => boolean): Side[] => {
      const out: Side[] = [];
      if (has(key(i, j - 1))) out.push('top');
      if (has(key(i, j + 1))) out.push('bottom');
      if (has(key(i - 1, j))) out.push('left');
      if (has(key(i + 1, j))) out.push('right');
      return out;
    };
    // Grow outward ring by ring. Each ring is the free cells touching the one inside it.
    const taken = new Set<string>();
    let inner: (k: string) => boolean = (k) => claimed.has(k);
    for (let ring = 0; ring < HOUSE_RINGS; ring++) {
      const here = new Set<string>();
      for (let j = jMin - ring - 1; j <= jMax + ring + 1; j++) {
        for (let i = iMin - ring - 1; i <= iMax + ring + 1; i++) {
          const cell = key(i, j);
          if (claimed.has(cell) || taken.has(cell)) continue;
          const sides = facing(i, j, inner);
          if (sides.length === 0) continue;
          here.add(cell);
          const score = reach(xs.mid(i), ys.mid(j)) + 12 * jitter(i, j);
          // All four sides of a block can carry a terrace: the side facing the town first.
          // The two short sides are inset so they do not run into the long ones at the corners.
          const order: Side[] = [...sides, ...(['top', 'bottom', 'left', 'right'] as Side[]).filter((x) => !sides.includes(x))];
          order.forEach((side, n) => slots.push({ i, j, side, tier: ring, score: score + n * 0.001 }));
        }
      }
      for (const cell of here) taken.add(cell);
      const last = here;
      inner = (k) => last.has(k);
    }
    slots.sort((p, q) => p.tier - q.tier || p.score - q.score || p.i - q.i || p.j - q.j);
    outer: for (const slot of slots) {
      const hr = rng(`${id}|terrace|${slot.i}|${slot.j}|${slot.side}`);
      const x0 = xs.start(slot.i);
      const x1 = xs.end(slot.i);
      const y0 = ys.start(slot.j);
      const y1 = ys.end(slot.j);
      const alongX = slot.side === 'top' || slot.side === 'bottom';
      const hw = hr.range(4.6, 5.4);
      const hd = hr.range(5.5, 6.5);
      const gap = 1;
      const back = 0.6;
      // Terraces along the block's long sides run corner to corner; those on its ends fit between them.
      const inset = alongX ? 1.5 : back + 6.5 + 1.6;
      const run = (alongX ? x1 - x0 : y1 - y0) - inset * 2;
      const fit = Math.floor((run + gap) / (hw + gap));
      if (fit < 1) continue;
      // Mostly full rows, now and then a gap where a house was never built.
      const n = Math.max(1, fit - (hr.next() < 0.3 ? 1 : 0));
      const used = n * hw + (n - 1) * gap;
      const lead = inset + (run - used) * hr.next();
      for (let k = 0; k < n; k++) {
        const t = lead + k * (hw + gap);
        let fp: Polygon;
        if (slot.side === 'top') fp = rect(x0 + t, y0 + back, x0 + t + hw, y0 + back + hd);
        else if (slot.side === 'bottom') fp = rect(x0 + t, y1 - back - hd, x0 + t + hw, y1 - back);
        else if (slot.side === 'left') fp = rect(x0 + back, y0 + t, x0 + back + hd, y0 + t + hw);
        else fp = rect(x1 - back - hd, y0 + t, x1 - back, y0 + t + hw);
        dwellings.push({ footprint: fp });
        if (dwellings.length >= houseCount) break outer;
      }
    }
  }

  // ── Extent ──
  const all: Point[] = [];
  for (const b of blocks) all.push(...b.outline);
  for (const s of streets) all.push(...s.line);
  for (const d of dwellings) all.push(...d.footprint);
  let radius = 10;
  for (const p of all) radius = Math.max(radius, Math.hypot(p.x - center.x, p.y - center.y));
  const bb = boundsOf([...all, { x: center.x - 10, y: center.y - 10 }, { x: center.x + 10, y: center.y + 10 }]);

  return {
    place: id,
    center,
    angle,
    radius: round(radius),
    bounds: { x: round(bb.x), y: round(bb.y), w: round(bb.w), h: round(bb.h) },
    blocks,
    streets,
    lots,
    wards,
    dwellings,
  };
}
