// The frame: layer order, culling, lettering, the surveyor's red, and hit-testing.

import type { Bounds, CityPlan, RoadPlan, Terrain } from '../plan/types';
import {
  RANKS,
  type Catalogue,
  type FeatureStage,
  type LinkState,
  type PlaceState,
  type Point,
  type Rank,
  type WorldState,
} from '../world/types';
import { Camera } from './camera';
import { GOTHIC, SERIF, addPolyline, letter, measure, pointInPolygon, polygonBounds, wrap, type Lettering } from './ink';
import { INK, css, mix } from './palette';
import { buildPlaceArt, coreRadius, drawPlace, type PlaceArt } from './place';
import { TerritoryArt } from './territory';

export type Selection = { type: 'place'; id: string } | { type: 'feature'; place: string; id: string } | null;

export type Draft = { type: 'site'; at: Point } | { type: 'road'; from: string; to: Point } | null;

export interface Scene {
  world: WorldState;
  terrain: Terrain;
  catalogue: Catalogue;
  plans: Map<string, CityPlan>;
  roads: RoadPlan[];
  selection: Selection;
  hover: Selection;
  /** A method to light up across the territory. */
  method: string | null;
  draft: Draft;
}

export interface ScreenRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

interface LabelBox extends ScreenRect {
  place: string;
}

const STAGE_WORD: Record<FeatureStage, string> = {
  concept: 'Proposed',
  planned: 'Staked',
  designed: 'From plans',
  building: 'Being built',
  working: '',
  mature: '',
};

// A wide scale, so that the biggest words are unmistakably the biggest places.
const NAME_SIZE: Record<Rank, number> = {
  major: 33,
  city: 26,
  town: 19,
  settlement: 14.5,
  outpost: 12,
  site: 11,
  spark: 11,
};

/** Within a rank, more work is a larger name, but never as large as the next rank's. */
function nameSize(place: PlaceState): number {
  const i = RANKS.indexOf(place.rank);
  const base = NAME_SIZE[place.rank];
  const next = RANKS[i + 1];
  const room = next ? NAME_SIZE[next] - base : 4;
  const work = Math.pow(Math.min(1, Math.log10(1 + place.commits) / 3.5), 1.8);
  return base + room * 0.8 * work;
}

/** How long a newly founded place stays marked as new. */
const NEW_SURVEY_DAYS = 42;
const FLOOD_MS = 700;
const DRAIN_MS = 420;
const ROAD_MS = 900;
/** Paper beyond the neat line, in world units. Matches the territory's margin. */
const SHEET_MARGIN = 86;
const BIRTH_MS = 520;

export class Renderer {
  readonly camera = new Camera();
  private ctx: CanvasRenderingContext2D;
  private scene: Scene | null = null;
  private territory: TerritoryArt | null = null;
  private arts = new Map<string, { key: string; art: PlaceArt }>();
  private artWorld: WorldState | null = null;
  private labels: LabelBox[] = [];
  private floods = new Map<string, number>();
  private births = new Map<string, number>();
  private drains = new Map<string, number>();
  private roadBirths = new Map<string, number>();
  private prevLinks = new Set<string>();
  private prevStages = new Map<string, FeatureStage>();
  private prevPlaces = new Set<string>();
  private prevAsOf = '';
  private dirty = true;
  private raf = 0;
  private last = 0;
  private lastCrawl = 0;
  private crawlOnScreen = false;
  private dpr = 1;
  /** How much towns are drawn larger than life at this zoom. 1 once close. */
  private exag = 1;
  private observer: ResizeObserver;
  /** Off for the label-free test: would these places still read as different? */
  showLabels = true;
  /** Zoom at which the whole sheet fits. */
  fitK = 0.25;
  /** Smoothed frame cost in ms, for `?perf`. */
  frameMs = 0;
  onAnchor: (rect: ScreenRect | null) => void = () => {};
  onView: (k: number) => void = () => {};

  constructor(private canvas: HTMLCanvasElement) {
    this.ctx = canvas.getContext('2d', { alpha: false })!;
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)');
    this.camera.reducedMotion = reduce.matches;
    reduce.addEventListener('change', (e) => (this.camera.reducedMotion = e.matches));
    this.observer = new ResizeObserver(() => this.resize());
    this.observer.observe(canvas);
    this.resize();
    this.raf = requestAnimationFrame(this.frame);
  }

  destroy() {
    cancelAnimationFrame(this.raf);
    this.observer.disconnect();
  }

  private resize() {
    const rect = this.canvas.getBoundingClientRect();
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.canvas.width = Math.max(1, Math.round(rect.width * this.dpr));
    this.canvas.height = Math.max(1, Math.round(rect.height * this.dpr));
    const first = this.camera.width <= 1;
    this.camera.resize(rect.width, rect.height);
    // On a narrow screen the lower half belongs to the note and the cartouche.
    this.camera.pad =
      rect.width <= 640
        ? { top: 16, right: 12, bottom: rect.height * 0.56, left: 12 }
        : { top: 40, right: 40, bottom: 96, left: 40 };
    if (this.scene) {
      this.camera.minK = this.coverK();
      const home = this.home();
      this.fitK = home.k;
      if (first) this.camera.jumpTo(home);
      this.camera.constrain(this.scene.catalogue.size, SHEET_MARGIN);
    }
    this.dirty = true;
  }

  invalidate() {
    this.dirty = true;
  }

  setScene(scene: Scene) {
    const firstScene = !this.scene;
    if (!this.territory || this.scene?.terrain !== scene.terrain) {
      this.territory = new TerritoryArt(scene.terrain, scene.catalogue);
    }
    if (scene.world !== this.artWorld) this.noticeChanges(scene.world);
    this.scene = scene;
    if (scene.world !== this.artWorld) {
      this.artWorld = scene.world;
      this.territory.updateKnowledge(scene.world.places);
    }
    if (firstScene) {
      this.camera.minK = this.coverK();
      const home = this.home();
      this.fitK = home.k;
      this.camera.jumpTo(home);
      this.camera.constrain(scene.catalogue.size, SHEET_MARGIN);
    }
    this.dirty = true;
  }

  /** Spot what was just built or founded, so the wash can flood and the pen can draw. */
  private noticeChanges(world: WorldState) {
    const now = performance.now();
    const forward = this.prevAsOf !== '' && world.asOf >= this.prevAsOf;
    const stages = new Map<string, FeatureStage>();
    const places = new Set<string>();
    const flooding: string[] = [];
    const draining: string[] = [];
    const born: string[] = [];
    for (const place of world.places) {
      places.add(place.id);
      if (forward && !this.prevPlaces.has(place.id)) born.push(place.id);
      for (const f of place.features) {
        const key = `${place.id}/${f.id}`;
        stages.set(key, f.stage);
        const before = this.prevStages.get(key);
        const done = f.stage === 'working' || f.stage === 'mature';
        const wasDone = before === 'working' || before === 'mature';
        if (forward && done && !wasDone && this.prevPlaces.has(place.id)) flooding.push(f.id);
        if (!forward && wasDone && !done) draining.push(f.id);
      }
    }
    const links = new Set(world.links.map((l) => l.id));
    const laid = forward && this.prevAsOf !== '' ? [...links].filter((id) => !this.prevLinks.has(id)) : [];
    // A big jump is a cut, not a moment: animate only what a person could follow.
    if (!this.camera.reducedMotion) {
      if (flooding.length <= 24) for (const id of flooding) this.floods.set(id, now);
      if (born.length <= 6) for (const id of born) this.births.set(id, now);
      if (draining.length <= 24) for (const id of draining) this.drains.set(id, now);
      if (laid.length <= 6) for (const id of laid) this.roadBirths.set(id, now);
    }
    this.prevLinks = links;
    this.prevStages = stages;
    this.prevPlaces = places;
    this.prevAsOf = world.asOf;
  }

  /** The lowest zoom at which the sheet still covers the whole window. */
  private coverK(): number {
    const size = this.scene?.catalogue.size ?? { width: 4800, height: 3200 };
    const w = this.camera.width / (size.width + SHEET_MARGIN * 2);
    const h = this.camera.height / (size.height + SHEET_MARGIN * 2);
    // A desk-sized window is covered by the sheet. A narrow one must be able to see all of it.
    return this.camera.width > 640 ? Math.max(w, h) : Math.min(w, h) * 1.6;
  }

  home() {
    const b = this.territory?.landBounds() ?? { x: 0, y: 0, w: 4800, h: 3200 };
    const m = 0.035;
    return this.camera.framing({ x: b.x - b.w * m, y: b.y - b.h * m, w: b.w * (1 + 2 * m), h: b.h * (1 + 2 * m) });
  }

  /**
   * Cartographic exaggeration. At territory scale a true-to-scale town is a speck, so towns
   * are drawn larger than life and settle to true scale as the camera comes down. The
   * apparent size always grows with zoom, so nothing shrinks as you approach it.
   */
  private exaggeration(k: number): number {
    const far = this.fitK * 1.1;
    const near = 1.2;
    const most = 2.3;
    if (k >= near || far * most >= near) return k >= near ? 1 : Math.max(1, Math.min(most, near / k));
    if (k <= far) return most;
    const t = (Math.log(k) - Math.log(far)) / (Math.log(near) - Math.log(far));
    const apparent = Math.exp(Math.log(far * most) + (Math.log(near) - Math.log(far * most)) * t);
    return apparent / k;
  }

  /** A point inside a town, as drawn: pushed out from the centre by the exaggeration. */
  private drawn(plan: CityPlan, p: Point): Point {
    const e = this.exag;
    return { x: plan.center.x + (p.x - plan.center.x) * e, y: plan.center.y + (p.y - plan.center.y) * e };
  }

  art(place: PlaceState): PlaceArt | null {
    const plan = this.scene?.plans.get(place.id);
    if (!plan) return null;
    const held = this.arts.get(place.id);
    if (held && held.art.place === place) return held.art;
    // Most places look the same from one edition to the next: redraw only what changed.
    let key = `${place.liveliness}|${place.revived ? 1 : 0}|${place.rank}|${place.name}`;
    for (const f of place.features) {
      key += `|${f.stage[0]}${f.storeys}${f.heat > 0.1 ? 'h' : ''}${f.landmark ? 'l' : ''}${f.stage === 'building' ? Math.round(f.progress * 20) : ''}`;
    }
    if (held && held.key === key && held.art.plan === plan) {
      held.art.place = place;
      held.art.today = Date.UTC(+this.scene!.world.asOf.slice(0, 4), +this.scene!.world.asOf.slice(5, 7) - 1, +this.scene!.world.asOf.slice(8, 10)) / 86400000;
      return held.art;
    }
    const art = buildPlaceArt(place, plan, this.scene!.world.asOf);
    this.arts.set(place.id, { key, art });
    return art;
  }

  /** The camera target that frames a place for reading its buildings. */
  framePlace(id: string, close = false) {
    const plan = this.scene?.plans.get(id);
    const place = this.scene?.world.places.find((p) => p.id === id);
    if (!plan || !place) return null;
    const r = Math.max(coreRadius(plan), 46);
    const pad = close ? 1.16 : 1.9;
    const b: Bounds = { x: place.position.x - r * pad, y: place.position.y - r * pad, w: r * pad * 2, h: r * pad * 2 };
    return this.camera.framing(b, close ? 7 : 3.2);
  }

  frameFeature(placeId: string, featureId: string) {
    const lot = this.scene?.plans.get(placeId)?.lots.find((l) => l.feature === featureId);
    if (!lot) return null;
    const b = polygonBounds([lot.parcel]);
    const grow = 5.5;
    return this.camera.framing(
      { x: b.x - (b.w * (grow - 1)) / 2, y: b.y - (b.h * (grow - 1)) / 2, w: b.w * grow, h: b.h * grow },
      4.6,
    );
  }

  // ───────────────────────── Hit-testing ─────────────────────────

  hitTest(screen: Point): Selection {
    const scene = this.scene;
    if (!scene) return null;
    const w = this.camera.toWorld(screen);
    const k = this.camera.k;
    const e = this.exag;

    if (k * e >= 1.25) {
      for (const place of scene.world.places) {
        const plan = scene.plans.get(place.id);
        if (!plan) continue;
        const local = { x: plan.center.x + (w.x - plan.center.x) / e, y: plan.center.y + (w.y - plan.center.y) / e };
        if (Math.hypot(local.x - plan.center.x, local.y - plan.center.y) > coreRadius(plan) + 4) continue;
        for (const lot of plan.lots) {
          if (pointInPolygon(local, lot.parcel)) return { type: 'feature', place: place.id, id: lot.feature };
        }
      }
    }

    let best: { id: string; score: number } | null = null;
    for (const place of scene.world.places) {
      const plan = scene.plans.get(place.id);
      const reach = Math.max((plan ? coreRadius(plan) : 0) * e, 13 / k);
      const d = Math.hypot(w.x - place.position.x, w.y - place.position.y);
      if (d > reach) continue;
      const score = d / reach;
      if (!best || score < best.score) best = { id: place.id, score };
    }
    if (best) return { type: 'place', id: best.id };

    for (const box of this.labels) {
      if (screen.x >= box.x && screen.x <= box.x + box.w && screen.y >= box.y && screen.y <= box.y + box.h) {
        return { type: 'place', id: box.place };
      }
    }
    return null;
  }

  // ───────────────────────── Frame ─────────────────────────

  private frame = (now: number) => {
    this.raf = requestAnimationFrame(this.frame);
    const dt = Math.min(64, now - (this.last || now));
    this.last = now;
    const scene = this.scene;
    if (!scene) return;

    const moved = this.camera.tick(now, dt);
    if (moved) this.camera.constrain(scene.catalogue.size, SHEET_MARGIN);
    const animating = this.floods.size + this.births.size + this.drains.size + this.roadBirths.size > 0;
    const crawl = this.crawlOnScreen && !this.camera.reducedMotion && now - this.lastCrawl > 42;
    if (!this.dirty && !moved && !animating && !crawl) return;
    this.dirty = false;
    if (crawl || moved) this.lastCrawl = now;

    const t0 = performance.now();
    this.draw(scene, now);
    this.frameMs += (performance.now() - t0 - this.frameMs) * 0.1;
    this.onView(this.camera.k);
  };

  private draw(scene: Scene, now: number) {
    const { ctx, camera: cam, dpr } = this;
    const k = cam.k;
    const territory = this.territory!;
    const e = (this.exag = this.exaggeration(k));

    for (const [id, start] of this.floods) if (now - start > FLOOD_MS) this.floods.delete(id);
    for (const [id, start] of this.births) if (now - start > BIRTH_MS) this.births.delete(id);
    const floods = new Map<string, number>();
    for (const [id, start] of this.floods) floods.set(id, Math.min(1, (now - start) / FLOOD_MS));
    for (const [id, start] of this.drains) if (now - start > DRAIN_MS) this.drains.delete(id);
    for (const [id, start] of this.roadBirths) if (now - start > ROAD_MS) this.roadBirths.delete(id);
    const drains = new Map<string, number>();
    for (const [id, start] of this.drains) drains.set(id, Math.min(1, (now - start) / DRAIN_MS));

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = css(INK.table);
    ctx.fillRect(0, 0, cam.width, cam.height);

    ctx.save();
    ctx.translate(cam.width / 2, cam.height / 2);
    ctx.scale(k, k);
    ctx.translate(-cam.x, -cam.y);

    territory.draw(ctx, cam);

    const placeById = new Map(scene.world.places.map((p) => [p.id, p]));
    const lit = scene.method ? this.litPlaces(scene) : null;

    this.drawRoads(scene, placeById, lit, now);

    const { slip, foxing } = territory.patterns(ctx);
    const visible: PlaceArt[] = [];
    this.crawlOnScreen = false;
    for (const place of scene.world.places) {
      const art = this.art(place);
      if (!art) continue;
      const b = art.plan.bounds;
      if (!cam.sees({ x: b.x - b.w * (e - 1), y: b.y - b.h * (e - 1), w: b.w * (2 * e - 1), h: b.h * (2 * e - 1) }, 60 / k)) continue;
      visible.push(art);
      const born = this.births.get(place.id);
      const birth = born === undefined ? 1 : Math.min(1, (now - born) / BIRTH_MS);
      const alpha = (lit && !lit.has(place.id) ? 0.22 : 1) * birth;
      // Anything being worked on moves, at every scale: the limits from afar, the walls close to.
      if (place.liveliness === 'building' && art.hullLength > 0) this.crawlOnScreen = true;
      ctx.save();
      ctx.translate(art.plan.center.x, art.plan.center.y);
      ctx.scale(e, e);
      ctx.translate(-art.plan.center.x, -art.plan.center.y);
      drawPlace(ctx, art, { k: k * e, time: now, alpha, crawl: !cam.reducedMotion, floods, drains, slipPaper: slip, foxing });
      ctx.restore();
    }
    ctx.restore();

    // Everything below is lettered or marked in screen space.
    this.drawNewSurveys(scene, visible);
    this.drawMarks(scene, visible, lit, now);
    if (!this.showLabels) {
      this.labels = [];
      this.drawHand(scene, placeById);
      return;
    }
    const names = this.layoutNames(scene, visible, lit);
    // Region names keep clear of place names and of the towns themselves.
    const taken = names.map((n) => n.box);
    for (const art of visible) {
      const rect = this.placeRect(art.place.id);
      if (rect) taken.push(rect);
    }
    territory.letterRegions(ctx, cam, scene.world.places, this.fitK, taken);
    this.letterRoads(scene, placeById);
    this.letterTowns(visible, scene);
    for (const n of names) n.draw();
    this.drawHand(scene, placeById);
  }

  private litPlaces(scene: Scene): Set<string> {
    const m = scene.world.methods.find((x) => x.id === scene.method);
    const lit = new Set<string>(m?.places.map((p) => p.place) ?? []);
    // A method that is only noted still belongs somewhere: wherever it is proposed.
    for (const place of scene.world.places)
      if (place.features.some((f) => f.methods.includes(scene.method!))) lit.add(place.id);
    return lit;
  }

  private drawRoads(scene: Scene, places: Map<string, PlaceState>, lit: Set<string> | null, now: number) {
    const { ctx, camera: cam } = this;
    const px = 1 / cam.k;
    const links = new Map(scene.world.links.map((l) => [l.id, l]));
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    for (const road of scene.roads) {
      const link = links.get(road.link);
      if (!link) continue;
      const a = places.get(link.a);
      const b = places.get(link.b);
      if (!a || !b) continue;
      const dim = lit && !(lit.has(a.id) && lit.has(b.id)) ? 0.25 : 1;
      const path = new Path2D();
      const ra = this.townReach(a.id);
      const rb = this.townReach(b.id);
      let line = road.line.filter(
        (p) => Math.hypot(p.x - a.position.x, p.y - a.position.y) > ra && Math.hypot(p.x - b.position.x, p.y - b.position.y) > rb,
      );
      // A new road is drawn along its length, from the place it was surveyed from.
      const laid = this.roadBirths.get(link.id);
      if (laid !== undefined) {
        const t = Math.min(1, (now - laid) / ROAD_MS);
        line = line.slice(0, Math.max(2, Math.ceil(line.length * (1 - Math.pow(1 - t, 2)))));
      }
      addPolyline(path, line);
      const old = a.liveliness === 'ruins' || b.liveliness === 'ruins';
      const ink = old ? INK.sepia : INK.black;

      if (link.grade === 'surveyed') {
        ctx.setLineDash([0.1 * px, 4.5 * px]);
        ctx.strokeStyle = css(INK.graphite, 0.85 * dim);
        ctx.lineWidth = 1.5 * px;
        ctx.stroke(path);
      } else if (link.grade === 'track') {
        ctx.setLineDash([7 * px, 4 * px]);
        ctx.strokeStyle = css(ink, 0.72 * dim);
        ctx.lineWidth = 1.05 * px;
        ctx.stroke(path);
      } else {
        // A made road: two ink lines with paper between.
        ctx.setLineDash([]);
        ctx.strokeStyle = css(ink, 0.82 * dim);
        ctx.lineWidth = 3 * px;
        ctx.stroke(path);
        ctx.strokeStyle = css(INK.linen, dim);
        ctx.lineWidth = 1.5 * px;
        ctx.stroke(path);
      }
      ctx.setLineDash([]);

      // Traffic: where code or data really flows between two places and one of them is being
      // worked on now, something is moving along the route. No work, no traffic.
      if (isMain(link) && !this.camera.reducedMotion && (a.liveliness === 'building' || b.liveliness === 'building') && line.length > 3) {
        this.crawlOnScreen = true;
        const span = line.length - 1;
        for (let n = 0; n < 2; n++) {
          const along = ((now * 0.000045 * (140 / Math.max(60, road.length / 4)) + n * 0.5) % 1) * span;
          const i = Math.floor(along);
          const p0 = line[i]!;
          const p1 = line[Math.min(span, i + 1)]!;
          const f = along - i;
          ctx.fillStyle = css(INK.black, 0.85 * dim);
          ctx.beginPath();
          ctx.arc(p0.x + (p1.x - p0.x) * f, p0.y + (p1.y - p0.y) * f, Math.max(1.6 * px, 1.2), 0, Math.PI * 2);
          ctx.fill();
        }
      }

      if (isMain(link)) {
        // A main laid beside the road.
        ctx.save();
        ctx.translate(3.2 * px, 3.2 * px);
        ctx.strokeStyle = css(INK.waterLine, 0.95 * dim);
        ctx.lineWidth = 1.5 * px;
        ctx.stroke(path);
        ctx.restore();
      }
    }
    ctx.lineCap = 'butt';
  }

  /** How far from its centre a town is drawn, in world units: roads stop at the edge. */
  private townReach(id: string): number {
    const plan = this.scene?.plans.get(id);
    if (!plan || plan.lots.length === 0) return 9 / this.camera.k;
    return coreRadius(plan) * this.exag * 0.55;
  }

  private letterRoads(scene: Scene, places: Map<string, PlaceState>) {
    const { ctx, camera: cam } = this;
    if (cam.k < this.fitK * 1.7) return;
    const links = new Map(scene.world.links.map((l) => [l.id, l]));
    for (const road of scene.roads) {
      const link = links.get(road.link);
      if (!link || !link.carries || !isMain(link)) continue;
      if (!places.has(link.a) || !places.has(link.b)) continue;
      const i = Math.floor(road.line.length / 2);
      const p = road.line[i];
      const q = road.line[Math.min(road.line.length - 1, i + 2)];
      if (!p || !q) continue;
      const at = cam.toScreen(p);
      if (at.x < -100 || at.y < -100 || at.x > cam.width + 100 || at.y > cam.height + 100) continue;
      let angle = Math.atan2(q.y - p.y, q.x - p.x);
      if (angle > Math.PI / 2) angle -= Math.PI;
      if (angle < -Math.PI / 2) angle += Math.PI;
      letter(ctx, `${link.carries} main`, at.x + Math.sin(angle) * -11, at.y - Math.cos(angle) * 11, {
        family: GOTHIC,
        size: 9.5,
        weight: 600,
        stretch: 110,
        tracking: 0.18,
        upper: true,
        color: mix(INK.waterLine, INK.black, 0.25),
        angle,
        halo: INK.linen,
      });
    }
  }

  /**
   * Newly emerging: a place founded in the last six weeks has its mark on a small fresh slip,
   * with a pencil traverse to its nearest neighbour, the way a surveyor ties a new station
   * into the existing work. It wears off as the slip would.
   */
  private drawNewSurveys(scene: Scene, visible: PlaceArt[]) {
    const { ctx, camera: cam } = this;
    const day = (iso: string) => Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10)) / 86400000;
    const today = day(scene.world.asOf);
    for (const art of visible) {
      const { place } = art;
      const age = today - day(place.foundedAt);
      if (age > NEW_SURVEY_DAYS || age < 0) continue;
      const fresh = 1 - age / NEW_SURVEY_DAYS;
      const c = cam.toScreen(place.position);
      let near: PlaceState | null = null;
      let best = Infinity;
      for (const other of scene.world.places) {
        if (other.id === place.id || other.foundedAt > place.foundedAt) continue;
        const d = Math.hypot(other.position.x - place.position.x, other.position.y - place.position.y);
        if (d < best) {
          best = d;
          near = other;
        }
      }
      if (near) {
        const n = cam.toScreen(near.position);
        ctx.strokeStyle = css(INK.graphite, 0.75 * fresh + 0.15);
        ctx.lineWidth = 1;
        ctx.setLineDash([9, 3, 1.5, 3]);
        ctx.beginPath();
        ctx.moveTo(c.x, c.y);
        ctx.lineTo(n.x, n.y);
        ctx.stroke();
        ctx.setLineDash([]);
      }
      // A town that already has limits is on its own slip; a bare mark gets a small one.
      if (art.hullLength > 0 && place.liveliness === 'building') continue;
      const r = 13;
      ctx.fillStyle = css(INK.black, 0.34 * (0.4 + 0.6 * fresh));
      ctx.fillRect(c.x - r + 1.4, c.y - r + 2, r * 2, r * 2);
      ctx.fillStyle = css(mix(INK.linen, INK.slip, 0.35 + 0.65 * fresh));
      ctx.fillRect(c.x - r, c.y - r, r * 2, r * 2);
    }
  }

  /** Marks for places too small or too far away to be drawn as plans. */
  private drawMarks(scene: Scene, visible: PlaceArt[], lit: Set<string> | null, now: number) {
    const { ctx, camera: cam } = this;
    void scene;
    for (const art of visible) {
      const { place, plan } = art;
      const sizePx = coreRadius(plan) * cam.k * this.exag;
      const rank = RANKS.indexOf(place.rank);
      const hasPlan = art.lots.length > 0;
      if (hasPlan && rank >= 2 && sizePx > 6) continue;
      if (hasPlan && sizePx > 34) continue;
      const born = this.births.get(place.id);
      const t = born === undefined ? 1 : Math.min(1, (now - born) / BIRTH_MS);
      const fade = (lit && !lit.has(place.id) ? 0.25 : 1) * (1 - 0.45 * art.aging.inkFade);
      const c = cam.toScreen(place.position);
      ctx.lineCap = 'round';
      if (place.rank === 'spark') {
        // Two pencil strokes; when new, the pen draws them one after the other.
        const r = 4.2;
        ctx.strokeStyle = css(INK.graphite, 0.95 * fade);
        ctx.lineWidth = 1.35;
        const first = Math.min(1, t * 2);
        const second = Math.max(0, t * 2 - 1);
        ctx.beginPath();
        ctx.moveTo(c.x - r, c.y - r);
        ctx.lineTo(c.x - r + 2 * r * first, c.y - r + 2 * r * first);
        if (second > 0) {
          ctx.moveTo(c.x + r, c.y - r);
          ctx.lineTo(c.x + r - 2 * r * second, c.y - r + 2 * r * second);
        }
        ctx.stroke();
      } else if (place.rank === 'site') {
        ctx.strokeStyle = css(INK.graphite, 0.98 * fade * t);
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.arc(c.x, c.y, 3.4, 0, Math.PI * 2);
        ctx.moveTo(c.x - 6.5, c.y);
        ctx.lineTo(c.x + 6.5, c.y);
        ctx.moveTo(c.x, c.y - 6.5);
        ctx.lineTo(c.x, c.y + 6.5);
        ctx.stroke();
      } else {
        ctx.fillStyle = css(art.ink, 0.95 * fade * t);
        const s = rank >= 4 ? 3.2 : 2.4;
        ctx.fillRect(c.x - s, c.y - s, s * 2, s * 2);
      }
      ctx.lineCap = 'butt';
    }
  }

  /** Ward names, street names, storey numerals and building names. */
  private letterTowns(visible: PlaceArt[], scene: Scene) {
    const { ctx, camera: cam } = this;
    const k = cam.k * this.exag;
    if (k < 0.75) return;
    const wardBoxes: ScreenRect[] = [];

    for (const art of visible) {
      const ink = art.ink;
      const at = (p: Point) => cam.toScreen(this.drawn(art.plan, p));

      if (k >= 3.3 && k < 9 && art.building.length + Object.keys(art.wash).length > 0) {
        const a = Math.min(1, (k - 3.3) / 0.8) * 0.55;
        const lettered = new Set<string>();
        for (const street of art.plan.streets) {
          if (!street.main || !street.name || street.line.length < 2) continue;
          if (lettered.has(street.name.replace(/ (St|Ave)$/, ''))) continue;
          const mid = Math.floor((street.line.length - 1) / 2);
          const p = street.line[mid]!;
          const q = street.line[mid + 1] ?? p;
          const lengthPx = Math.hypot(q.x - p.x, q.y - p.y) * k;
          if (lengthPx < 90) continue;
          lettered.add(street.name.replace(/ (St|Ave)$/, ''));
          const mid2 = at({ x: (p.x + q.x) / 2, y: (p.y + q.y) / 2 });
          let angle = Math.atan2(q.y - p.y, q.x - p.x);
          if (angle > Math.PI / 2) angle -= Math.PI;
          if (angle < -Math.PI / 2) angle += Math.PI;
          letter(ctx, street.name, mid2.x, mid2.y, {
            family: GOTHIC,
            size: Math.min(10.5, 3.2 * k),
            weight: 500,
            stretch: 118,
            tracking: 0.34,
            upper: true,
            color: ink,
            alpha: a,
            angle,
          });
        }
      }

      if (k >= 0.75 && k < 2.9) {
        // Ward names are a far-off aid; once buildings can be read they step back and leave.
        const a = Math.min(1, (k - 0.75) / 0.4) * Math.min(1, (2.9 - k) / 1.3);
        for (const ward of art.plan.wards) {
          const c = at(ward.labelAt);
          const style: Lettering = {
            family: GOTHIC,
            size: Math.max(8.5, Math.min(12.5, 5.2 * k)),
            weight: 650,
            stretch: 118,
            tracking: 0.24,
            upper: true,
            color: ink,
            alpha: 0.7 * a,
          };
          const w = measure(ctx, ward.name, style);
          const box = { x: c.x - w / 2 - 4, y: c.y - style.size * 0.8, w: w + 8, h: style.size * 1.6 };
          if (wardBoxes.some((o) => overlaps(o, box))) continue;
          wardBoxes.push(box);
          letter(ctx, ward.name, c.x, c.y, style);
        }
      }

      if (k < 2) continue;
      for (const { lot, feature } of art.lots) {
        const c = at(lot.center);
        if (c.x < -80 || c.y < -80 || c.x > cam.width + 80 || c.y > cam.height + 80) continue;
        const b = polygonBounds(lot.footprint.slice(0, 1));
        const wPx = b.w * k;
        const done = feature.stage === 'working' || feature.stage === 'mature';
        const selected =
          (scene.selection?.type === 'feature' && scene.selection.id === feature.id) ||
          (scene.hover?.type === 'feature' && scene.hover.id === feature.id);
        // Work in hand is always named once a town can be read; the rest when there is room.
        const underway = feature.stage === 'building' && k >= 1.9 && !art.ruin;
        const named = (k >= 3.6 && wPx > 54) || selected || underway;

        if (done && !art.ruin && !(named && wPx < 120)) {
          // Storeys, in the fixed place an atlas keeps them: the footprint's upper-left.
          const corner = lot.footprint[0]?.[0] ?? lot.center;
          const n = at({ x: corner.x + (lot.center.x - corner.x) * 0.24, y: corner.y + (lot.center.y - corner.y) * 0.24 });
          letter(ctx, String(feature.storeys), n.x, n.y, {
            family: GOTHIC,
            size: Math.min(11, 8 + k * 0.4),
            weight: 700,
            stretch: 80,
            color: ink,
            alpha: 0.85,
          });
        }
        if (!named) continue;
        const style: Lettering = {
          family: GOTHIC,
          size: Math.max(8.5, Math.min(11.5, 6 + k * 0.7)),
          weight: 650,
          stretch: 78,
          tracking: 0.04,
          upper: true,
          color: done ? ink : INK.graphite,
          halo: done ? null : INK.linen,
          haloAlpha: 0.9,
        };
        const free = selected || underway;
        const lines = wrap(ctx, feature.name, style, free ? Math.max(70, wPx - 8) : wPx * 0.86, 3);
        if (!free && lines.some((line) => measure(ctx, line, style) > wPx * 0.92)) continue;
        const lh = style.size * 1.12;
        const word = STAGE_WORD[feature.stage];
        const total = lines.length * lh + (word ? lh : 0);
        let y = c.y - total / 2 + lh / 2;
        for (const line of lines) {
          letter(ctx, line, c.x, y, { ...style, upper: false, halo: selected && done ? null : style.halo });
          y += lh;
        }
        if (word) {
          letter(ctx, word, c.x, y + 1, {
            family: SERIF,
            size: style.size * 0.95,
            italic: true,
            color: INK.graphite,
            halo: INK.linen,
          });
        }
      }
    }
  }

  /** Place names, biggest places first, so the biggest words are the biggest places. */
  private layoutNames(scene: Scene, visible: PlaceArt[], lit: Set<string> | null) {
    const { ctx, camera: cam } = this;
    const k = cam.k;
    // Names are sized for a desk; on a narrow screen they come down with it.
    const narrow = Math.max(0.66, Math.min(1, cam.width / 1000));
    const grow = Math.max(0.92, Math.min(1.3, Math.pow(k / this.fitK, 0.22))) * narrow;
    const out: { box: ScreenRect; draw: () => void }[] = [];
    const order = [...visible].sort(
      (a, b) => RANKS.indexOf(b.place.rank) - RANKS.indexOf(a.place.rank) || b.place.commits - a.place.commits,
    );
    const boxes: LabelBox[] = [];
    // A name may not sit on another town's drawing.
    const towns = visible
      .filter((a) => a.lots.length > 0)
      .map((a) => ({ id: a.place.id, rect: this.placeRect(a.place.id)! }))
      .filter((t) => t.rect && t.rect.w > 26)
      .map((t) => ({ id: t.id, rect: { x: t.rect.x + t.rect.w * 0.12, y: t.rect.y + t.rect.h * 0.12, w: t.rect.w * 0.76, h: t.rect.h * 0.76 } }));
    const hoverId = scene.hover?.type === 'place' ? scene.hover.id : null;
    const selectedId = scene.selection?.type === 'place' ? scene.selection.id : scene.selection?.place;

    for (const art of order) {
      const { place, plan } = art;
      const rank = RANKS.indexOf(place.rank);
      const pencilled = rank <= 1;
      const forced = place.id === hoverId || place.id === selectedId;
      // The smallest things whisper: from the whole-territory view they are marks without names.
      if (pencilled && !forced && k < this.fitK * 1.45) continue;
      const size = nameSize(place) * grow;
      const style: Lettering = {
        family: SERIF,
        size,
        weight: rank >= 5 ? 700 : rank >= 4 ? 600 : rank >= 2 ? 500 : 400,
        italic: pencilled,
        upper: rank >= 5,
        tracking: rank >= 5 ? 0.09 : 0.01,
        color: pencilled ? INK.graphite : art.ink,
        alpha: (lit && !lit.has(place.id) ? 0.3 : 1) * (pencilled ? 0.95 : 1),
        halo: INK.linen,
        haloWidth: Math.max(2.6, size * 0.2),
        haloAlpha: 0.9 * (lit && !lit.has(place.id) ? 0.25 : 1),
      };
      const w = measure(ctx, place.name, style);
      const c = cam.toScreen(plan.center);
      const reach = coreRadius(plan) * k * this.exag;
      const hasPlan = art.lots.length > 0 && reach > 15;
      const r = hasPlan ? reach * 0.9 : 9;
      const gap = size * 0.72;
      const sub = art.ruin ? 'Ruins' : '';
      const h = size * 1.15 + (sub ? 11 : 0);
      const candidates = [
        { x: c.x, y: c.y - r - gap },
        { x: c.x, y: c.y + r + gap },
        { x: c.x + w * 0.3, y: c.y - r - gap },
        { x: c.x - w * 0.3, y: c.y - r - gap },
        { x: c.x + w * 0.3, y: c.y + r + gap },
        { x: c.x - w * 0.3, y: c.y + r + gap },
        { x: c.x + r + w / 2 + 8, y: c.y },
        { x: c.x - r - w / 2 - 8, y: c.y },
      ];
      let placed: { x: number; y: number } | null = null;
      let placedBox: ScreenRect | null = null;
      for (const cand of candidates) {
        const box = { x: cand.x - w / 2 - 3, y: cand.y - h / 2 - 1, w: w + 6, h: h + 2 };
        if (!boxes.some((o) => overlaps(o, box)) && !towns.some((t) => t.id !== place.id && overlaps(t.rect, box))) {
          placed = cand;
          placedBox = box;
          boxes.push({ ...box, place: place.id });
          break;
        }
      }
      if (!placed) {
        if (!forced) continue;
        placed = candidates[0]!;
      }
      if (placed.x < -w || placed.y < -40 || placed.x > cam.width + w || placed.y > cam.height + 40) continue;
      const spot = placed;
      out.push({
        box: placedBox ?? { x: spot.x - w / 2, y: spot.y - h / 2, w, h },
        draw: () => {
          letter(ctx, place.name, spot.x, spot.y - (sub ? 5 : 0), style);
          if (sub) {
            letter(ctx, sub, spot.x, spot.y + size * 0.62, {
              family: GOTHIC,
              size: 8.5,
              weight: 600,
              stretch: 120,
              tracking: 0.5,
              upper: true,
              color: art.ink,
              halo: INK.linen,
            });
          }
        },
      });
    }
    this.labels = boxes;
    return out;
  }

  /** The surveyor's own hand: hover, selection, and anything being drawn right now. */
  private drawHand(scene: Scene, places: Map<string, PlaceState>) {
    const { ctx, camera: cam } = this;
    const red = css(INK.red);
    ctx.lineCap = 'butt';
    ctx.setLineDash([]);

    if (scene.method) {
      const lit = this.litPlaces(scene);
      ctx.strokeStyle = red;
      ctx.lineWidth = 1.4;
      for (const id of lit) {
        const rect = this.placeRect(id);
        if (rect) ring(ctx, rect, 7);
      }
    }

    const hover = scene.hover;
    if (hover?.type === 'place' && !(scene.selection?.type === 'place' && scene.selection.id === hover.id)) {
      const rect = this.placeRect(hover.id);
      if (rect) {
        ctx.strokeStyle = css(INK.red, 0.85);
        ctx.lineWidth = 1.25;
        ring(ctx, rect, 6);
      }
    }
    if (hover?.type === 'feature') this.outlineFeature(hover.place, hover.id, 1.4, 0.8);

    let anchor: ScreenRect | null = null;
    const sel = scene.selection;
    if (sel?.type === 'place') {
      anchor = this.placeRect(sel.id);
      if (anchor) {
        ctx.strokeStyle = red;
        ctx.lineWidth = 1.6;
        brackets(ctx, anchor, 8);
      }
    } else if (sel?.type === 'feature') {
      anchor = this.outlineFeature(sel.place, sel.id, 2.2, 1);
    }
    this.onAnchor(anchor);

    const draft = scene.draft;
    if (draft?.type === 'site') {
      const c = cam.toScreen(draft.at);
      ctx.strokeStyle = red;
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.moveTo(c.x - 6, c.y - 6);
      ctx.lineTo(c.x + 6, c.y + 6);
      ctx.moveTo(c.x + 6, c.y - 6);
      ctx.lineTo(c.x - 6, c.y + 6);
      ctx.stroke();
    } else if (draft?.type === 'road') {
      const from = places.get(draft.from);
      if (from) {
        const a = cam.toScreen(from.position);
        const b = cam.toScreen(draft.to);
        ctx.strokeStyle = red;
        ctx.lineWidth = 1.5;
        ctx.setLineDash([2, 5]);
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.lineCap = 'butt';
      }
    }
  }

  private placeRect(id: string): ScreenRect | null {
    const plan = this.scene?.plans.get(id);
    if (!plan) return null;
    const cam = this.camera;
    const c = cam.toScreen(plan.center);
    const hasLots = plan.lots.length > 0;
    const r = Math.max(hasLots ? coreRadius(plan) * cam.k * this.exag : 0, 11);
    return { x: c.x - r, y: c.y - r, w: r * 2, h: r * 2 };
  }

  private outlineFeature(placeId: string, featureId: string, width: number, alpha: number): ScreenRect | null {
    const plan = this.scene?.plans.get(placeId);
    const lot = plan?.lots.find((l) => l.feature === featureId);
    if (!plan || !lot) return null;
    const { ctx, camera: cam } = this;
    const place = this.scene?.world.places.find((p) => p.id === placeId);
    const feature = place?.features.find((f) => f.id === featureId);
    const pencilled = feature?.stage === 'concept';
    const polys = pencilled ? [lot.parcel] : lot.footprint;
    ctx.strokeStyle = css(INK.red, alpha);
    ctx.lineWidth = width;
    ctx.lineJoin = 'miter';
    ctx.beginPath();
    for (const poly of polys) {
      poly.forEach((p, i) => {
        const s = cam.toScreen(this.drawn(plan, p));
        if (i === 0) ctx.moveTo(s.x, s.y);
        else ctx.lineTo(s.x, s.y);
      });
      ctx.closePath();
    }
    ctx.stroke();
    const b = polygonBounds([lot.parcel]);
    const tl = cam.toScreen(this.drawn(plan, { x: b.x, y: b.y }));
    return { x: tl.x, y: tl.y, w: b.w * cam.k * this.exag, h: b.h * cam.k * this.exag };
  }
}

const isMain = (link: LinkState) => link.kinds.includes('shares') || link.kinds.includes('feeds');

const overlaps = (a: ScreenRect, b: ScreenRect) =>
  a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;

function ring(ctx: CanvasRenderingContext2D, r: ScreenRect, pad: number) {
  ctx.beginPath();
  ctx.arc(r.x + r.w / 2, r.y + r.h / 2, r.w / 2 + pad, 0, Math.PI * 2);
  ctx.stroke();
}

/** Corner brackets: how a surveyor marks the thing under discussion. */
function brackets(ctx: CanvasRenderingContext2D, r: ScreenRect, pad: number) {
  const x0 = r.x - pad;
  const y0 = r.y - pad;
  const x1 = r.x + r.w + pad;
  const y1 = r.y + r.h + pad;
  const len = Math.min(18, (r.w + pad * 2) * 0.28);
  ctx.beginPath();
  ctx.moveTo(x0, y0 + len);
  ctx.lineTo(x0, y0);
  ctx.lineTo(x0 + len, y0);
  ctx.moveTo(x1 - len, y0);
  ctx.lineTo(x1, y0);
  ctx.lineTo(x1, y0 + len);
  ctx.moveTo(x1, y1 - len);
  ctx.lineTo(x1, y1);
  ctx.lineTo(x1 - len, y1);
  ctx.moveTo(x0 + len, y1);
  ctx.lineTo(x0, y1);
  ctx.lineTo(x0, y1 - len);
  ctx.stroke();
}
