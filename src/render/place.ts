// One place, drawn the way a survey draws a town: lots, footprints, washes, shadows.
// How a building is drawn says how far along it is; its wash says what it is.

import type { CityPlan, Lot } from '../plan/types';
import { KINDS, RANKS, type FeatureKind, type FeatureState, type PlaceState } from '../world/types';
import { addPolygon, addShadow, polygonBounds, scaleAbout } from './ink';
import { AGING, INK, WASH, agedInk, agedWash, css, mix, type Aging, type RGB } from './palette';

const SUN = { x: 0.62, y: 0.78 };
const STOREY_SHADOW = 1.5;

const cores = new WeakMap<CityPlan, number>();

/** How far the lots reach from the centre: the town proper, without its trailing streets. */
export function coreRadius(plan: CityPlan): number {
  let r = cores.get(plan);
  if (r !== undefined) return r;
  r = 0;
  for (const lot of plan.lots)
    for (const p of lot.parcel) r = Math.max(r, Math.hypot(p.x - plan.center.x, p.y - plan.center.y));
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
  blockLines: Path2D;
  slips: Path2D;
  dwellings: Path2D;
  shadows: Path2D;
  wash: Partial<Record<FeatureKind, Path2D>>;
  deep: Path2D;
  outline: Path2D;
  heavy: Path2D;
  designed: Path2D;
  planned: Path2D;
  concept: Path2D;
  stakes: Path2D;
  building: DrawnLot[];
}

export function buildPlaceArt(place: PlaceState, plan: CityPlan): PlaceArt {
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
    blockLines: new Path2D(),
    slips: new Path2D(),
    dwellings: new Path2D(),
    shadows: new Path2D(),
    wash: {},
    deep: new Path2D(),
    outline: new Path2D(),
    heavy: new Path2D(),
    designed: new Path2D(),
    planned: new Path2D(),
    concept: new Path2D(),
    stakes: new Path2D(),
    building: [],
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
        const path = (art.wash[f.kind] ??= new Path2D());
        const d = f.storeys * STOREY_SHADOW;
        for (const poly of lot.footprint) {
          addPolygon(path, poly);
          if (!ruin) addShadow(art.shadows, poly, SUN.x * d, SUN.y * d);
          if (f.stage === 'mature') addPolygon(art.deep, poly);
          addPolygon(f.stage === 'mature' || f.landmark ? art.heavy : art.outline, poly);
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
  return art;
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
  slipPaper: CanvasPattern;
}

/** Draw under the camera transform. */
export function drawPlace(ctx: CanvasRenderingContext2D, art: PlaceArt, o: PlaceDrawOptions) {
  const { k } = o;
  const px = 1 / k;
  const ink = art.ink;
  ctx.save();
  ctx.globalAlpha = o.alpha;
  ctx.lineJoin = 'miter';

  // Occupied ground. From far away a town reads as a paler patch; close to, the blocks are
  // plain paper, so the only bright paper left is a fresh slip.
  const tint = 1 - ramp(k, 0.8, 1.7);
  if (tint > 0) {
    ctx.fillStyle = css(art.ruin ? mix(INK.town, INK.sepia, 0.12) : INK.town, (art.ruin ? 0.7 : 1) * tint);
    ctx.fill(art.town);
  }
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
  const houses = ramp(k, 0.3, 0.8);
  if (houses > 0) {
    ctx.fillStyle = css(mix(INK.linenShade, ink, 0.22), houses);
    ctx.fill(art.dwellings);
    if (k > 1.6) {
      ctx.strokeStyle = css(ink, 0.7);
      ctx.lineWidth = 0.6 * px;
      ctx.stroke(art.dwellings);
    }
  }

  // Shadows: one fill, so overlapping shadows do not double.
  const shade = ramp(k, 0.22, 0.7);
  if (shade > 0) {
    ctx.fillStyle = css(INK.black, 0.2 * shade);
    ctx.fill(art.shadows);
  }

  // Washes.
  for (const kind of KINDS) {
    const path = art.wash[kind];
    if (!path) continue;
    ctx.fillStyle = css(agedWash(kind, art.aging));
    ctx.fill(path);
  }
  if (!art.ruin) {
    ctx.fillStyle = css(INK.black, 0.13 * art.aging.washStrength);
    ctx.fill(art.deep);
  }

  // Under construction.
  for (const { lot, feature } of art.building) drawBuilding(ctx, lot, feature, art, o);

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
  }

  // Ink.
  const inked = ramp(k, 0.6, 1.4);
  if (inked > 0) {
    if (art.ruin) ctx.setLineDash([4 * px, 2.5 * px, 1 * px, 2.5 * px]);
    ctx.strokeStyle = css(ink, 0.95 * inked);
    ctx.lineWidth = 0.9 * px;
    ctx.stroke(art.outline);
    ctx.lineWidth = Math.min(2.3 * px, 1.1);
    ctx.stroke(art.heavy);
    ctx.setLineDash([]);
  }
  ctx.restore();
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

  if (o.k < 0.9) {
    ctx.fillStyle = css(wash, 0.5);
    ctx.fill(path);
    return;
  }

  const b = polygonBounds(main);
  ctx.save();
  ctx.clip(path);
  // Raised so far: washed. Still to come: hatched.
  const edge = b.x + b.w * feature.progress;
  ctx.fillStyle = css(wash, 0.78);
  ctx.fillRect(b.x, b.y, edge - b.x, b.h);
  ctx.strokeStyle = css(art.ink, 0.42);
  ctx.lineWidth = 0.6 * px;
  ctx.beginPath();
  const step = Math.max(2.2, 4.2 * px);
  for (let x = edge - b.h; x < b.x + b.w; x += step) {
    ctx.moveTo(Math.max(x, edge), b.y + b.h - Math.max(0, edge - x));
    ctx.lineTo(x + b.h, b.y);
  }
  ctx.stroke();
  ctx.restore();

  // The outline crawls while work is going on.
  ctx.strokeStyle = css(art.ink, 0.95);
  ctx.lineWidth = 1.1 * px;
  ctx.setLineDash([5 * px, 3.5 * px]);
  ctx.lineDashOffset = o.crawl ? -(o.time * 0.011) * px : 0;
  ctx.stroke(path);
  ctx.setLineDash([]);
  ctx.lineDashOffset = 0;
}
