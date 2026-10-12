// One place, drawn the way a survey draws a town: lots, footprints, washes, shadows.
// How a building is drawn says how far along it is; its wash says what it is.

import type { CityPlan, Lot, StreetGrade } from '../plan/types';
import { KINDS, RANKS, type FeatureKind, type FeatureState, type PlaceState, type Point } from '../world/types';
import { addPolygon, addShadow, pointInPolygon, polygonBounds, scaleAbout } from './ink';
import { AGING, INK, WASH, agedInk, agedWash, css, mix, type Aging, type RGB } from './palette';

const SUN = { x: 0.62, y: 0.78 };
const STOREY_SHADOW = 2.1;

const cores = new WeakMap<CityPlan, number>();

/** How far the lots reach from the centre: the town proper, without its trailing streets. */
export function coreRadius(plan: CityPlan): number {
  let r = cores.get(plan);
  if (r !== undefined) return r;
  r = 0;
  for (const lot of plan.lots)
    for (const p of lot.parcel) r = Math.max(r, Math.hypot(p.x - plan.center.x, p.y - plan.center.y));
  // The houses are part of the town: a heavily worked place reaches as far as they do.
  for (const d of plan.dwellings)
    for (const p of d.footprint) r = Math.max(r, Math.hypot(p.x - plan.center.x, p.y - plan.center.y) * 0.94);
  cores.set(plan, r);
  return r;
}

export interface DrawnLot {
  lot: Lot;
  feature: FeatureState;
}

export interface PlaceArt {
  place: PlaceState;
  plan: CityPlan;
  aging: Aging;
  ink: RGB;
  ruin: boolean;
  lots: DrawnLot[];
  town: Path2D;
  /** Street centre-lines by how made they are. */
  streets: Partial<Record<StreetGrade, Path2D>>;
  square: Path2D | null;
  /** The town limits: the outline of everything that stands or is staked here. */
  hull: Path2D;
  /** Rims and ribs: what tells a tank from a dome without colour. */
  details: Path2D;
  /** Length of the limits, in world units, for dashing. */
  hullLength: number;
  /** Whether anything here has been left half built. */
  stalled: boolean;
  /** The edition's day number: what "recently" is measured from. */
  today: number;
  /** Work was logged here within the last week: the only thing that makes anything move. */
  movingNow: boolean;
  blockLines: Path2D;
  slips: Path2D;
  dwellings: Path2D;
  shadows: Path2D;
  wash: Partial<Record<FeatureKind, Path2D>>;
  /** In a revived place: what stood through the silence, still wearing its age. */
  oldWash: Partial<Record<FeatureKind, Path2D>>;
  oldOutline: Path2D;
  deep: Path2D;
  outline: Path2D;
  heavy: Path2D;
  designed: Path2D;
  planned: Path2D;
  concept: Path2D;
  stakes: Path2D;
  building: DrawnLot[];
  /** Built, and waiting on its acceptance criteria. */
  verifying: DrawnLot[];
  /** Ready to be begun: pegs at the corners of the plan. */
  pegs: Path2D;
  /** Lots with a builder session open on them right now. */
  sessions: DrawnLot[];
}

const dayOf = (iso: string) => Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10)) / 86400000;

/** A half-built thing nobody has touched in this long has stalled. */
const STALL_DAYS = 28;
const isStalled = (f: FeatureState, today: number) => {
  // Where no work is logged against it directly, the day it was begun is the last we know.
  const last = f.lastWorkAt ?? f.stagedAt.building ?? f.proposedAt;
  return today - dayOf(last) > STALL_DAYS;
};

export function buildPlaceArt(place: PlaceState, plan: CityPlan, asOf: string): PlaceArt {
  const today = dayOf(asOf);
  const ruin = place.liveliness === 'ruins';
  const aging = AGING[place.liveliness];
  const features = new Map(place.features.map((f) => [f.id, f]));
  const art: PlaceArt = {
    place,
    plan,
    aging,
    ink: agedInk(aging),
    ruin,
    lots: [],
    town: new Path2D(),
    streets: {},
    square: null,
    hull: new Path2D(),
    details: new Path2D(),
    hullLength: 0,
    stalled: false,
    today,
    movingNow: !!place.lastWorkAt && today - dayOf(place.lastWorkAt) <= 7,
    blockLines: new Path2D(),
    slips: new Path2D(),
    dwellings: new Path2D(),
    shadows: new Path2D(),
    wash: {},
    oldWash: {},
    oldOutline: new Path2D(),
    deep: new Path2D(),
    outline: new Path2D(),
    heavy: new Path2D(),
    designed: new Path2D(),
    planned: new Path2D(),
    concept: new Path2D(),
    stakes: new Path2D(),
    building: [],
    verifying: [],
    pegs: new Path2D(),
    sessions: [],
  };

  const usedBlocks = new Set<number>();
  for (const lot of plan.lots) {
    const f = features.get(lot.feature);
    if (!f) continue;
    const drawn = { lot, feature: f };
    art.lots.push(drawn);
    const real = f.stage === 'working' || f.stage === 'mature' || f.stage === 'building';
    if (real) usedBlocks.add(lot.block);

    // Fresh paper under anything worked on lately.
    if (f.heat > 0.1 && !ruin) addPolygon(art.slips, scaleAbout(lot.parcel, lot.center, 1.16));

    const built = f.build;
    if (built?.activeSession) art.sessions.push(drawn);
    if (built?.stage === 'verifying') {
      // Every step is finished. It stands, but it has not passed.
      art.verifying.push(drawn);
      continue;
    }
    if (built?.stage === 'ready') {
      // Planned, unblocked, nothing in the way: the corners are pegged out.
      for (const p of lot.footprint[0] ?? []) art.pegs.rect(p.x - 0.8, p.y - 0.8, 1.6, 1.6);
    }

    switch (f.stage) {
      case 'concept':
        addPolygon(art.concept, lot.parcel);
        art.stakes.moveTo(lot.center.x + 1.6, lot.center.y);
        art.stakes.arc(lot.center.x, lot.center.y, 1.6, 0, Math.PI * 2);
        art.stakes.moveTo(lot.center.x - 3, lot.center.y);
        art.stakes.lineTo(lot.center.x + 3, lot.center.y);
        art.stakes.moveTo(lot.center.x, lot.center.y - 3);
        art.stakes.lineTo(lot.center.x, lot.center.y + 3);
        break;
      case 'planned':
        for (const poly of lot.footprint.slice(0, 1)) addPolygon(art.planned, poly);
        break;
      case 'designed':
        for (const poly of lot.footprint.slice(0, 1)) addPolygon(art.designed, poly);
        break;
      case 'building':
        art.building.push(drawn);
        break;
      case 'working':
      case 'mature': {
        // A revival is fresh paper on old ink: untouched buildings keep their age.
        const stale = place.revived && f.heat <= 0.1;
        const path = stale ? (art.oldWash[f.kind] ??= new Path2D()) : (art.wash[f.kind] ??= new Path2D());
        const d = f.storeys * STOREY_SHADOW;
        for (const poly of lot.footprint) {
          addPolygon(path, poly);
          if (!ruin) addShadow(art.shadows, poly, SUN.x * d, SUN.y * d);
          if (f.stage === 'mature' && !stale) addPolygon(art.deep, poly);
          addPolygon(stale ? art.oldOutline : f.stage === 'mature' || f.landmark ? art.heavy : art.outline, poly);
        }
        break;
      }
    }
  }

  plan.blocks.forEach((block, i) => {
    // A block is ground the town actually occupies; pencilled lots alone do not make one.
    if (!usedBlocks.has(i)) return;
    addPolygon(art.town, block.outline);
    addPolygon(art.blockLines, block.outline);
  });
  for (const d of plan.dwellings) addPolygon(art.dwellings, d.footprint);
  for (const street of plan.streets) {
    const path = (art.streets[street.grade ?? 'lane'] ??= new Path2D());
    street.line.forEach((p, i) => (i === 0 ? path.moveTo(p.x, p.y) : path.lineTo(p.x, p.y)));
  }
  if (plan.square) {
    art.square = new Path2D();
    addPolygon(art.square, plan.square.outline);
  }

  // The town limits: the outline of the built-up ground itself, so a ribbon reads as a
  // ribbon and a crossroads as a crossroads. Named lots and streets only; the ordinary fabric
  // is left out, so that effort thickens a place without enlarging its outline.
  for (const loop of builtOutline(plan)) {
    addPolygon(art.hull, loop);
    for (let i = 0; i < loop.length; i++) {
      const a = loop[i]!;
      const b = loop[(i + 1) % loop.length]!;
      art.hullLength += Math.hypot(b.x - a.x, b.y - a.y);
    }
  }
  // What the buildings are, legible without colour: a tank has a rim, a dome has ribs.
  for (const { lot, feature } of art.lots) {
    if (feature.stage !== 'working' && feature.stage !== 'mature') continue;
    const main = lot.footprint[0];
    if (!main || main.length < 8) continue;
    const c = lot.center;
    if (feature.kind === 'reservoir') {
      const rim = scaleAbout(main, c, 0.62);
      addPolygon(art.details, rim);
    } else if (feature.kind === 'observatory') {
      for (let i = 0; i < main.length; i += 2) {
        art.details.moveTo(c.x, c.y);
        art.details.lineTo(main[i]!.x, main[i]!.y);
      }
    }
  }
  art.stalled = art.building.some((b) => isStalled(b.feature, today));
  return art;
}

/**
 * The outline of a place's built-up ground: every lot grown a little and every street given
 * its width, merged, and traced. Done on a coarse grid, then smoothed, which is plenty for a
 * line that is read from far away.
 */
function builtOutline(plan: CityPlan): Point[][] {
  if (plan.lots.length === 0) return [];
  const CELL = 3.2;
  const GROW = 7.5;
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  const stretch = (p: Point) => {
    if (p.x < x0) x0 = p.x;
    if (p.y < y0) y0 = p.y;
    if (p.x > x1) x1 = p.x;
    if (p.y > y1) y1 = p.y;
  };
  for (const lot of plan.lots) lot.parcel.forEach(stretch);
  for (const st of plan.streets) st.line.forEach(stretch);
  x0 -= GROW + CELL * 2;
  y0 -= GROW + CELL * 2;
  const cols = Math.ceil((x1 + GROW + CELL * 2 - x0) / CELL);
  const rows = Math.ceil((y1 + GROW + CELL * 2 - y0) / CELL);
  if (cols * rows > 60000) return [];
  const grid = new Uint8Array(cols * rows);

  for (const lot of plan.lots) {
    let cx = 0;
    let cy = 0;
    for (const p of lot.parcel) {
      cx += p.x / lot.parcel.length;
      cy += p.y / lot.parcel.length;
    }
    const grown = lot.parcel.map((p) => {
      const d = Math.hypot(p.x - cx, p.y - cy) || 1;
      return { x: p.x + ((p.x - cx) / d) * GROW * 1.25, y: p.y + ((p.y - cy) / d) * GROW * 1.25 };
    });
    const b = polygonBounds([grown]);
    const c0 = Math.max(0, Math.floor((b.x - x0) / CELL));
    const c1 = Math.min(cols - 1, Math.ceil((b.x + b.w - x0) / CELL));
    const r0 = Math.max(0, Math.floor((b.y - y0) / CELL));
    const r1 = Math.min(rows - 1, Math.ceil((b.y + b.h - y0) / CELL));
    for (let r = r0; r <= r1; r++)
      for (let c = c0; c <= c1; c++) {
        if (grid[r * cols + c]) continue;
        if (pointInPolygon({ x: x0 + (c + 0.5) * CELL, y: y0 + (r + 0.5) * CELL }, grown)) grid[r * cols + c] = 1;
      }
  }
  const stamp = (x: number, y: number, radius: number) => {
    const c0 = Math.max(0, Math.floor((x - radius - x0) / CELL));
    const c1 = Math.min(cols - 1, Math.ceil((x + radius - x0) / CELL));
    const r0 = Math.max(0, Math.floor((y - radius - y0) / CELL));
    const r1 = Math.min(rows - 1, Math.ceil((y + radius - y0) / CELL));
    for (let r = r0; r <= r1; r++)
      for (let c = c0; c <= c1; c++) {
        if (Math.hypot(x0 + (c + 0.5) * CELL - x, y0 + (r + 0.5) * CELL - y) <= radius) grid[r * cols + c] = 1;
      }
  };
  for (const st of plan.streets) {
    for (let i = 0; i + 1 < st.line.length; i++) {
      const a = st.line[i]!;
      const b = st.line[i + 1]!;
      const n = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / 2.5));
      for (let k = 0; k <= n; k++) stamp(a.x + ((b.x - a.x) * k) / n, a.y + ((b.y - a.y) * k) / n, 5.2);
    }
  }

  // Trace: every cell side with built ground on one side and open ground on the other.
  const at = (c: number, r: number) => (c < 0 || r < 0 || c >= cols || r >= rows ? 0 : grid[r * cols + c]!);
  const next = new Map<number, number[]>();
  const key = (c: number, r: number) => r * (cols + 1) + c;
  const link = (c0: number, r0: number, c1: number, r1: number) => {
    const k = key(c0, r0);
    const list = next.get(k);
    if (list) list.push(key(c1, r1));
    else next.set(k, [key(c1, r1)]);
  };
  for (let r = 0; r < rows; r++)
    for (let c = 0; c < cols; c++) {
      if (!at(c, r)) continue;
      if (!at(c, r - 1)) link(c, r, c + 1, r);
      if (!at(c + 1, r)) link(c + 1, r, c + 1, r + 1);
      if (!at(c, r + 1)) link(c + 1, r + 1, c, r + 1);
      if (!at(c - 1, r)) link(c, r + 1, c, r);
    }
  const loops: Point[][] = [];
  for (const start of [...next.keys()]) {
    while ((next.get(start)?.length ?? 0) > 0) {
      const loop: Point[] = [];
      let k = start;
      for (let guard = 0; guard < 40000; guard++) {
        const out = next.get(k);
        if (!out || out.length === 0) break;
        loop.push({ x: x0 + (k % (cols + 1)) * CELL, y: y0 + Math.floor(k / (cols + 1)) * CELL });
        k = out.pop()!;
        if (k === start) break;
      }
      if (loop.length >= 10) loops.push(smoothLoop(loop));
    }
  }
  return loops;
}

/** Drop the staircase: thin the points, then round the corners off twice. */
function smoothLoop(loop: Point[]): Point[] {
  let pts = loop.filter((_, i) => i % 2 === 0);
  for (let pass = 0; pass < 3; pass++) {
    const out: Point[] = [];
    for (let i = 0; i < pts.length; i++) {
      const a = pts[i]!;
      const b = pts[(i + 1) % pts.length]!;
      out.push({ x: a.x * 0.75 + b.x * 0.25, y: a.y * 0.75 + b.y * 0.25 }, { x: a.x * 0.25 + b.x * 0.75, y: a.y * 0.25 + b.y * 0.75 });
    }
    pts = out;
  }
  return pts;
}

const ramp = (v: number, a: number, b: number) => Math.max(0, Math.min(1, (v - a) / (b - a)));

export interface PlaceDrawOptions {
  /** Pixels per world unit. */
  k: number;
  /** ms, for the construction crawl. */
  time: number;
  /** Overall strength, for knocking back places outside a highlight. */
  alpha: number;
  crawl: boolean;
  /** Feature id → 0–1 progress of its wash flooding in. */
  floods: Map<string, number>;
  /** Feature id → 0–1 progress of its wash draining away, when the edition turns back. */
  drains: Map<string, number>;
  slipPaper: CanvasPattern;
  /** Brown blotches: what paper does when nobody has turned to it in a long while. */
  foxing: CanvasPattern;
}

/** Draw under the camera transform. */
export function drawPlace(ctx: CanvasRenderingContext2D, art: PlaceArt, o: PlaceDrawOptions) {
  const { k } = o;
  const px = 1 / k;
  const ink = art.ink;
  ctx.save();
  ctx.globalAlpha = o.alpha;
  ctx.lineJoin = 'miter';

  // The ground a place stands on says how recently anyone was here. From far off this is
  // the first thing the eye reads: fresh paper under what is being worked on, bare sheet under
  // what is merely standing, foxed paper under what has been left.
  // It stays, fainter, when you come down among the buildings: you should still know where you are.
  const far = 1 - 0.6 * ramp(k, 1.3, 2.3);
  const live = art.place.liveliness;
  if (far > 0 && art.hullLength > 0) {
    if (live === 'building') {
      ctx.save();
      ctx.globalAlpha = o.alpha * far;
      ctx.translate(1.4 * px, 2 * px);
      ctx.fillStyle = css(INK.black, 0.36);
      ctx.fill(art.hull);
      ctx.translate(-1.4 * px, -2 * px);
      o.slipPaper.setTransform(new DOMMatrix().scale(px));
      ctx.fillStyle = o.slipPaper;
      ctx.fill(art.hull);
      ctx.restore();
    } else if (live === 'quiet' || live === 'dormant' || live === 'ruins') {
      ctx.save();
      ctx.globalAlpha = o.alpha * far * (live === 'quiet' ? 0.45 : live === 'dormant' ? 0.85 : 1);
      o.foxing.setTransform(new DOMMatrix().scale(px));
      ctx.fillStyle = o.foxing;
      ctx.fill(art.hull);
      ctx.restore();
    }
  }
  // Streets. How made they are is the place's maturity, read before any building:
  // a dashed track, a single lane, a street between two ruled lines, an avenue.
  drawStreets(ctx, art, k, ink);

  const lines = ramp(k, 0.55, 1.3);
  if (lines > 0) {
    ctx.strokeStyle = css(ink, 0.62 * lines);
    ctx.lineWidth = 0.7 * px;
    if (art.ruin) ctx.setLineDash([5 * px, 3 * px]);
    ctx.stroke(art.blockLines);
    ctx.setLineDash([]);
  }

  // Correction slips: brighter paper, sitting a hair above the sheet.
  ctx.save();
  ctx.translate(1.1 * px, 1.5 * px);
  ctx.fillStyle = css(INK.black, 0.34);
  ctx.fill(art.slips);
  ctx.restore();
  o.slipPaper.setTransform(new DOMMatrix().scale(px));
  ctx.fillStyle = o.slipPaper;
  ctx.fill(art.slips);
  if (k > 1.1) {
    // The cut edge of the slip.
    ctx.strokeStyle = css(INK.black, 0.16);
    ctx.lineWidth = 0.6 * px;
    ctx.stroke(art.slips);
  }

  // Housing.
  // Houses: the ordinary fabric. Uncoloured, so that washes stay the named buildings.
  const houses = ramp(k, 0.12, 0.4);
  if (houses > 0) {
    // Strong from afar, where they are the town's mass; lighter close to, where the named
    // buildings should lead.
    const weight = 0.2 + 0.08 * ramp(k, 0.5, 1) - 0.1 * ramp(k, 1.2, 2.4);
    ctx.fillStyle = css(mix(INK.linenShade, ink, weight), houses * (0.55 + 0.45 * art.aging.washStrength));
    ctx.fill(art.dwellings);
    if (k > 0.7) {
      ctx.strokeStyle = css(ink, 0.5 * ramp(k, 0.7, 1.4));
      ctx.lineWidth = 0.6 * px;
      ctx.stroke(art.dwellings);
    }
  }

  // Shadows: one fill, so overlapping shadows do not double.
  const shade = ramp(k, 0.2, 0.55);
  if (shade > 0) {
    ctx.fillStyle = css(INK.black, 0.3 * shade);
    ctx.fill(art.shadows);
  }

  // Washes.
  for (const kind of KINDS) {
    const path = art.wash[kind];
    if (!path) continue;
    ctx.fillStyle = css(agedWash(kind, art.aging));
    ctx.fill(path);
  }
  for (const kind of KINDS) {
    const path = art.oldWash[kind];
    if (!path) continue;
    ctx.fillStyle = css(agedWash(kind, AGING.dormant));
    ctx.fill(path);
  }
  if (!art.ruin) {
    ctx.fillStyle = css(INK.black, 0.13 * art.aging.washStrength);
    ctx.fill(art.deep);
  }

  // Under construction.
  for (const { lot, feature } of art.building) drawBuilding(ctx, lot, feature, art, o);

  // Verifying: the whole building washed, no shadow yet, its wall still a dashed line. It is
  // built; it has not been accepted. The line moves only while someone is on it.
  for (const { lot, feature } of art.verifying) {
    const path = new Path2D();
    for (const poly of lot.footprint.slice(0, 1)) addPolygon(path, poly);
    ctx.fillStyle = css(agedWash(feature.kind, art.aging), 0.9);
    ctx.fill(path);
    if (k > 0.3) {
      ctx.strokeStyle = css(ink, 0.95);
      ctx.lineWidth = Math.min(1.5 * px, 1.1);
      ctx.setLineDash([6 * px, 3 * px]);
      ctx.lineDashOffset = o.crawl && feature.build?.activeSession ? -(o.time * 0.011) * px : 0;
      ctx.stroke(path);
      ctx.setLineDash([]);
      ctx.lineDashOffset = 0;
    }
  }

  // Flooding: a wash arriving. Drawn over the settled wash, which it matches at the end.
  if (o.floods.size > 0) {
    for (const { lot, feature } of art.lots) {
      const t = o.floods.get(feature.id);
      if (t === undefined) continue;
      const e = 1 - Math.pow(1 - t, 3);
      // Cover the settled wash with paper, then let the colour spread from the middle.
      ctx.fillStyle = css(INK.linen);
      for (const poly of lot.footprint) fillPoly(ctx, poly);
      ctx.fillStyle = css(mix(WASH[feature.kind], INK.black, 0.1 * (1 - e)), 0.35 + 0.65 * e);
      for (const poly of lot.footprint) fillPoly(ctx, scaleAbout(poly, lot.center, 0.15 + 0.85 * e));
    }
  }

  // Draining: turning the edition back lifts a wash off again, toward the middle.
  if (o.drains.size > 0) {
    for (const { lot, feature } of art.lots) {
      const t = o.drains.get(feature.id);
      if (t === undefined) continue;
      const e = 1 - Math.pow(1 - t, 3);
      ctx.fillStyle = css(WASH[feature.kind], 0.85 * (1 - e));
      for (const poly of lot.footprint.slice(0, 1)) fillPoly(ctx, scaleAbout(poly, lot.center, 1 - 0.8 * e));
    }
  }

  // Pencil and plans.
  const pencil = ramp(k, 0.5, 1.1);
  const small = RANKS.indexOf(art.place.rank) <= 1;
  const pencilAlpha = small ? Math.max(pencil, ramp(k, 0.25, 0.5)) : pencil;
  if (pencilAlpha > 0) {
    ctx.strokeStyle = css(INK.graphite, 0.75 * pencilAlpha);
    ctx.lineWidth = 0.9 * px;
    ctx.setLineDash([1.2 * px, 3.2 * px]);
    ctx.lineCap = 'round';
    ctx.stroke(art.concept);
    ctx.setLineDash([]);
    ctx.lineCap = 'butt';
    ctx.lineWidth = 0.8 * px;
    ctx.stroke(art.stakes);

    ctx.strokeStyle = css(INK.graphite, 0.95 * pencilAlpha);
    ctx.lineWidth = 1.15 * px;
    ctx.stroke(art.planned);

    ctx.strokeStyle = css(ink, 0.9 * pencilAlpha);
    ctx.lineWidth = 1 * px;
    ctx.setLineDash([5 * px, 3 * px]);
    ctx.stroke(art.designed);
    ctx.setLineDash([]);
    ctx.fillStyle = css(ink, 0.95 * pencilAlpha);
    ctx.fill(art.pegs);
  }

  // Ink.
  const inked = ramp(k, 0.3, 0.8);
  if (inked > 0) {
    if (art.ruin) ctx.setLineDash([4 * px, 2.5 * px, 1 * px, 2.5 * px]);
    ctx.strokeStyle = css(ink, 0.95 * inked);
    ctx.lineWidth = Math.min(0.9, k * 0.9) * px;
    ctx.stroke(art.outline);
    ctx.lineWidth = Math.min(2.3 * px, 1.1);
    ctx.stroke(art.heavy);
    if (k > 0.9 && !art.ruin) {
      ctx.lineWidth = 0.6 * px;
      ctx.strokeStyle = css(ink, 0.7 * ramp(k, 0.9, 1.6));
      ctx.stroke(art.details);
    }
    ctx.strokeStyle = css(agedInk(AGING.dormant), 0.95 * inked);
    ctx.lineWidth = 0.9 * px;
    ctx.stroke(art.oldOutline);
    ctx.setLineDash([]);
  }

  // The town limits. How the line is drawn is the place's state, legible without colour:
  // crawling where work is going on, solid where it stands, thin and browned where it is
  // quiet, dotted where it sleeps, broken where it is ruins.
  const limits = 1 - 0.75 * ramp(k, 1.6, 3);
  if (limits > 0 && art.hullLength > 0) {
    ctx.lineJoin = 'round';
    if (live === 'building') {
      ctx.strokeStyle = css(INK.black, 0.95 * limits);
      ctx.lineWidth = 1.35 * px;
      ctx.setLineDash([6 * px, 4 * px]);
      // The line is dashed for three weeks after work; it only MOVES in the week of the work.
      ctx.lineDashOffset = o.crawl && art.movingNow ? -(o.time * 0.012) * px : 0;
    } else if (live === 'settled') {
      ctx.strokeStyle = css(INK.black, 0.8 * limits);
      ctx.lineWidth = 0.9 * px;
    } else if (live === 'quiet') {
      ctx.strokeStyle = css(ink, 0.75 * limits);
      ctx.lineWidth = 0.7 * px;
    } else if (live === 'dormant') {
      ctx.strokeStyle = css(ink, 0.8 * limits);
      ctx.lineWidth = 0.9 * px;
      ctx.lineCap = 'round';
      ctx.setLineDash([0.1 * px, 3.4 * px]);
    } else {
      ctx.strokeStyle = css(ink, 0.85 * limits);
      ctx.lineWidth = 0.8 * px;
      ctx.setLineDash([7 * px, 3 * px, 1.2 * px, 3 * px]);
    }
    ctx.stroke(art.hull);
    ctx.setLineDash([]);
    ctx.lineDashOffset = 0;
    ctx.lineCap = 'butt';
  }
  ctx.restore();
}

const STREET_WIDTH: Record<StreetGrade, number> = { track: 0, lane: 3.2, street: 4.8, avenue: 6.4 };

function drawStreets(ctx: CanvasRenderingContext2D, art: PlaceArt, k: number, ink: RGB) {
  const px = 1 / k;
  const show = ramp(k, 0.16, 0.42);
  if (show <= 0) return;
  ctx.lineCap = 'butt';
  ctx.lineJoin = 'round';
  const dashed = art.ruin;
  for (const grade of ['track', 'lane', 'street', 'avenue'] as StreetGrade[]) {
    const path = art.streets[grade];
    if (!path) continue;
    if (grade === 'track') {
      ctx.strokeStyle = css(ink, 0.7 * show);
      ctx.lineWidth = Math.max(0.9 * px, 0.5);
      ctx.setLineDash([4 * px, 2.6 * px]);
      ctx.stroke(path);
      ctx.setLineDash([]);
      continue;
    }
    // Two ruled lines with the sheet between them.
    const width = STREET_WIDTH[grade];
    const line = (grade === 'avenue' ? 1.15 : grade === 'street' ? 0.9 : 0.65) * px;
    if (dashed) ctx.setLineDash([5 * px, 3 * px]);
    ctx.strokeStyle = css(ink, 0.82 * show);
    ctx.lineWidth = Math.max(width + line * 2, 1.6 * px);
    ctx.stroke(path);
    ctx.setLineDash([]);
    ctx.strokeStyle = css(INK.linen, show);
    ctx.lineWidth = Math.max(width, 0.7 * px);
    ctx.lineCap = 'square';
    ctx.stroke(path);
    ctx.lineCap = 'butt';
  }
  if (art.square && art.plan.square) {
    const grade = art.plan.square.grade;
    if (grade === 'common') {
      ctx.strokeStyle = css(INK.graphite, 0.8 * show);
      ctx.lineWidth = 0.8 * px;
      ctx.setLineDash([1.2 * px, 2.6 * px]);
      ctx.stroke(art.square);
      ctx.setLineDash([]);
    } else {
      ctx.fillStyle = css(INK.linen, show);
      ctx.fill(art.square);
      ctx.strokeStyle = css(ink, 0.85 * show);
      ctx.lineWidth = (grade === 'plaza' ? 1.2 : 0.9) * px;
      ctx.stroke(art.square);
      if (grade === 'plaza') {
        // A plaza has something standing in the middle of it.
        const c = art.plan.center;
        ctx.fillStyle = css(ink, 0.9 * show);
        ctx.beginPath();
        ctx.arc(c.x, c.y, 1.6, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }
}

function fillPoly(ctx: CanvasRenderingContext2D, poly: { x: number; y: number }[]) {
  const first = poly[0];
  if (!first) return;
  ctx.beginPath();
  ctx.moveTo(first.x, first.y);
  for (let i = 1; i < poly.length; i++) ctx.lineTo(poly[i]!.x, poly[i]!.y);
  ctx.closePath();
  ctx.fill();
}

function drawBuilding(
  ctx: CanvasRenderingContext2D,
  lot: Lot,
  feature: FeatureState,
  art: PlaceArt,
  o: PlaceDrawOptions,
) {
  const px = 1 / o.k;
  const wash = agedWash(feature.kind, art.aging);
  const main = lot.footprint.slice(0, 1);
  const path = new Path2D();
  for (const poly of main) addPolygon(path, poly);

  // Work that has stopped weathers: old ink, chalky wash, nothing moving.
  const stale = isStalled(feature, art.today);
  const ink = stale ? agedInk(AGING.dormant) : art.ink;
  const tone = stale ? agedWash(feature.kind, AGING.dormant) : wash;
  if (o.k < 0.28) {
    ctx.fillStyle = css(tone, 0.35);
    ctx.fill(path);
    return;
  }

  // The ground is opened: hatched all over, and tinted more strongly the further it has risen.
  ctx.save();
  ctx.clip(path);
  const b = polygonBounds(main);
  ctx.fillStyle = css(tone, 0.14 + 0.5 * feature.progress);
  ctx.fillRect(b.x, b.y, b.w, b.h);
  ctx.strokeStyle = css(ink, 0.4);
  ctx.lineWidth = 0.6 * px;
  ctx.beginPath();
  const step = Math.max(2.4, 4.2 * px);
  for (let x = b.x - b.h; x < b.x + b.w; x += step) {
    ctx.moveTo(x, b.y + b.h);
    ctx.lineTo(x + b.h, b.y);
  }
  ctx.stroke();
  ctx.restore();

  // The wall goes up round the perimeter: inked as far as the work has got, dashed beyond.
  let perimeter = 0;
  for (const poly of main)
    for (let i = 0; i < poly.length; i++) {
      const p = poly[i]!;
      const q = poly[(i + 1) % poly.length]!;
      perimeter += Math.hypot(q.x - p.x, q.y - p.y);
    }
  ctx.strokeStyle = css(ink, 0.95);
  ctx.lineWidth = 1 * px;
  ctx.setLineDash([5 * px, 3.5 * px]);
  // With a plan, the wall moves only while a builder session is open on it. Without one,
  // the best we know is that it was worked on this week.
  const fresh = feature.build ? !!feature.build.activeSession : !!feature.lastWorkAt && art.today - dayOf(feature.lastWorkAt) <= 7;
  ctx.lineDashOffset = o.crawl && fresh ? -(o.time * 0.011) * px : 0;
  ctx.stroke(path);
  ctx.lineDashOffset = 0;
  ctx.setLineDash([perimeter * feature.progress, perimeter]);
  ctx.lineWidth = Math.min(2.2 * px, 1.3);
  ctx.stroke(path);
  ctx.setLineDash([]);
}
