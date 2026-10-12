// The sheet itself: table, paper, water, relief, and the lettering of regions.
// Relief is only drawn near founded places. Country nobody has thought about is blank.

import type { Terrain } from '../plan/types';
import { RANKS, type Catalogue, type PlaceState } from '../world/types';
import type { Camera } from './camera';
import { GOTHIC, addPolygon, addPolyline, letter, makePaper, measure } from './ink';
import { INK, css } from './palette';

const MARGIN = 86;
const BUCKETS = 3;

export class TerritoryArt {
  private land = new Path2D();
  private sea = new Path2D();
  private coast = new Path2D();
  private lakes = new Path2D();
  private shoals: Path2D[] = [];
  private relief: Path2D[] = [];
  private woods: Path2D[] = [];
  private knowledgeKey = '';
  private paper: CanvasPattern | null = null;
  private slipPaper: CanvasPattern | null = null;
  /** Blank land far from everything, where the sheet admits it knows nothing. */
  private blanks: { x: number; y: number }[] = [];

  constructor(
    private terrain: Terrain,
    private catalogue: Catalogue,
  ) {
    const { width, height } = terrain.size;
    this.sea.rect(0, 0, width, height);
    for (const poly of terrain.land) {
      addPolygon(this.land, poly);
      addPolygon(this.sea, poly);
      addPolygon(this.coast, poly);
    }
    for (const lake of terrain.lakes) addPolygon(this.lakes, lake);
    this.shoals = terrain.shoals.map((lines) => {
      const p = new Path2D();
      for (const line of lines) addPolyline(p, line);
      return p;
    });
  }

  /** The ground worth framing: the main landmass, not the whole sheet of sea. */
  landBounds() {
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const poly of this.terrain.land.slice(0, 1))
      for (const p of poly) {
        x0 = Math.min(x0, p.x);
        y0 = Math.min(y0, p.y);
        x1 = Math.max(x1, p.x);
        y1 = Math.max(y1, p.y);
      }
    if (!isFinite(x0)) return { x: 0, y: 0, w: this.terrain.size.width, h: this.terrain.size.height };
    return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
  }

  patterns(ctx: CanvasRenderingContext2D) {
    if (!this.paper) {
      this.paper = ctx.createPattern(makePaper(INK.linen, 11, 512), 'repeat');
      this.slipPaper = ctx.createPattern(makePaper(INK.slip, 23, 128), 'repeat');
    }
    return { paper: this.paper!, slip: this.slipPaper! };
  }

  /** Decide which relief strokes are known, from the places that exist at this edition. */
  updateKnowledge(places: PlaceState[]) {
    const key = places.map((p) => `${p.id}:${p.rank}`).join('|');
    if (key === this.knowledgeKey) return;
    this.knowledgeKey = key;

    const known = places.map((p) => ({
      x: p.position.x,
      y: p.position.y,
      r: 250 + 95 * RANKS.indexOf(p.rank),
    }));
    // How well each patch of ground is known, on a coarse grid: each place only writes the
    // cells it can reach, so the cost follows the places and not places times strokes.
    const CELL = 48;
    const cols = Math.ceil(this.terrain.size.width / CELL) + 1;
    const rows = Math.ceil(this.terrain.size.height / CELL) + 1;
    const field = new Float32Array(cols * rows).fill(Infinity);
    for (const k of known) {
      const reach = k.r * 1.12;
      const c0 = Math.max(0, Math.floor((k.x - reach) / CELL));
      const c1 = Math.min(cols - 1, Math.ceil((k.x + reach) / CELL));
      const r0 = Math.max(0, Math.floor((k.y - reach) / CELL));
      const r1 = Math.min(rows - 1, Math.ceil((k.y + reach) / CELL));
      for (let r = r0; r <= r1; r++)
        for (let c = c0; c <= c1; c++) {
          const d = Math.hypot(c * CELL - k.x, r * CELL - k.y) / k.r;
          const i = r * cols + c;
          if (d < field[i]!) field[i] = d;
        }
    }
    const bucketOf = (x: number, y: number): number => {
      const c = Math.max(0, Math.min(cols - 1, Math.round(x / CELL)));
      const r = Math.max(0, Math.min(rows - 1, Math.round(y / CELL)));
      const best = field[r * cols + c]!;
      if (best < 0.55) return 0;
      if (best < 0.82) return 1;
      if (best < 1.08) return 2;
      return -1;
    };

    this.relief = Array.from({ length: BUCKETS }, () => new Path2D());
    this.woods = Array.from({ length: BUCKETS }, () => new Path2D());
    for (const h of this.terrain.hachures) {
      const b = bucketOf(h.a.x, h.a.y);
      if (b < 0) continue;
      const path = this.relief[b]!;
      path.moveTo(h.a.x, h.a.y);
      path.lineTo(h.b.x, h.b.y);
    }
    for (const w of this.terrain.woods) {
      const b = bucketOf(w.x, w.y);
      if (b < 0) continue;
      // A tiny open crown: the conventional sign for wooded ground.
      const path = this.woods[b]!;
      path.moveTo(w.x + 2.6, w.y);
      path.arc(w.x, w.y, 2.6, 0, Math.PI, true);
    }

    // Find up to three well-separated blank stretches of land to letter as unsurveyed.
    this.blanks = [];
    const { width, height } = this.terrain.size;
    const candidates: { x: number; y: number; d: number }[] = [];
    for (let y = 300; y < height - 300; y += 160)
      for (let x = 400; x < width - 400; x += 160) {
        if (!this.terrain.isLand({ x, y })) continue;
        if (!this.terrain.isLand({ x: x - 200, y }) || !this.terrain.isLand({ x: x + 200, y })) continue;
        let d = Infinity;
        for (const k of known) d = Math.min(d, Math.hypot(x - k.x, y - k.y) - k.r);
        if (d > 160) candidates.push({ x, y, d });
      }
    candidates.sort((a, b) => b.d - a.d);
    for (const c of candidates) {
      if (this.blanks.length >= 3) break;
      if (this.blanks.every((b) => Math.hypot(b.x - c.x, b.y - c.y) > 900)) this.blanks.push(c);
    }
  }

  /** Draw under the camera transform. */
  draw(ctx: CanvasRenderingContext2D, cam: Camera) {
    const { width, height } = this.terrain.size;
    const k = cam.k;
    const px = 1 / k;
    const { paper } = this.patterns(ctx);
    // Keep the paper grain at a constant size on screen, anchored to the sheet.
    paper.setTransform(new DOMMatrix().scale(px));

    // The sheet lying on the table.
    ctx.fillStyle = 'rgb(0 0 0 / 0.38)';
    ctx.fillRect(-MARGIN + 5 * px, -MARGIN + 7 * px, width + MARGIN * 2, height + MARGIN * 2);
    ctx.fillStyle = paper;
    ctx.fillRect(-MARGIN, -MARGIN, width + MARGIN * 2, height + MARGIN * 2);

    // Water: a flat wash over everything that is not land.
    ctx.fillStyle = css(INK.water, 0.62);
    ctx.fill(this.sea, 'evenodd');
    ctx.fill(this.lakes);

    // Waterlining: fine parallel lines hugging the shore, fainter as they go out.
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, width, height);
    ctx.clip();
    this.shoals.forEach((path, i) => {
      ctx.strokeStyle = css(INK.waterLine, 0.5 - i * 0.14);
      ctx.lineWidth = 0.7 * px;
      ctx.stroke(path);
    });

    // Relief and woods, in three strengths of knowing.
    // Relief belongs to the wide view; close in, it steps back behind the town.
    const far = 1 - 0.94 * Math.max(0, Math.min(1, (k - 0.6) / 1.0));
    const reliefAlpha = [0.5 * far, 0.3 * far, 0.14 * far];
    ctx.lineCap = 'round';
    for (let b = 0; b < BUCKETS; b++) {
      const r = this.relief[b];
      if (r) {
        ctx.strokeStyle = css(INK.sepia, reliefAlpha[b]!);
        ctx.lineWidth = Math.min(0.9 * px, 1.6);
        ctx.stroke(r);
      }
      const w = this.woods[b];
      if (w && k > 0.2 && far > 0.1) {
        ctx.strokeStyle = css(INK.graphite, reliefAlpha[b]! * 0.8);
        ctx.lineWidth = Math.min(0.7 * px, 1.2);
        ctx.stroke(w);
      }
    }
    ctx.lineCap = 'butt';

    // Rivers and shores.
    ctx.lineJoin = 'round';
    for (const river of this.terrain.rivers) {
      const path = new Path2D();
      addPolyline(path, river.line);
      ctx.strokeStyle = css(INK.waterLine, 0.85);
      ctx.lineWidth = Math.max(0.9 * px, river.width * 0.55);
      ctx.stroke(path);
    }
    ctx.strokeStyle = css(INK.black, 0.72);
    ctx.lineWidth = 0.9 * px;
    ctx.stroke(this.coast);
    ctx.strokeStyle = css(INK.waterLine, 0.9);
    ctx.lineWidth = 0.8 * px;
    ctx.stroke(this.lakes);
    ctx.restore();

    // Neat line: a heavy rule and a hair rule, with reference ticks in the margin.
    ctx.strokeStyle = css(INK.black, 0.9);
    ctx.lineWidth = 2.2 * px;
    ctx.strokeRect(-14, -14, width + 28, height + 28);
    ctx.lineWidth = 0.7 * px;
    ctx.strokeRect(0, 0, width, height);
    ctx.beginPath();
    for (let x = 600; x < width; x += 600) {
      ctx.moveTo(x, -14);
      ctx.lineTo(x, 0);
      ctx.moveTo(x, height);
      ctx.lineTo(x, height + 14);
    }
    for (let y = 600; y < height; y += 600) {
      ctx.moveTo(-14, y);
      ctx.lineTo(0, y);
      ctx.moveTo(width, y);
      ctx.lineTo(width + 14, y);
    }
    ctx.stroke();
  }

  /** Lettering, drawn in screen space after everything inked. */
  letterRegions(
    ctx: CanvasRenderingContext2D,
    cam: Camera,
    places: PlaceState[],
    fitK: number,
    taken: { x: number; y: number; w: number; h: number }[],
  ) {
    const k = cam.k;
    const fade = Math.max(0, Math.min(1, 1.25 - k / (fitK * 9)));
    if (fade <= 0.02) return;
    const size = Math.max(11, Math.min(30, 15 * Math.pow(k / fitK, 0.75)));

    for (const region of this.catalogue.regions) {
      const here = places.filter((p) => p.region === region.id);
      if (here.length === 0) continue;
      // Try a ring of spots around the region and take the first that crosses no place name.
      const style = {
        family: GOTHIC,
        size,
        weight: 500,
        stretch: 125,
        tracking: 0.62,
        upper: true,
        color: INK.black,
        alpha: 0.4 * fade,
      };
      const w = measure(ctx, region.name, style);
      const spots = [
        [0, -0.7], [0, 0.72], [0, -0.42], [0, 0.44], [-0.35, -0.6], [0.35, -0.6], [-0.35, 0.62], [0.35, 0.62], [0, -0.95], [0, 0.95],
      ].map(([ox, oy]) => ({ x: region.center.x + ox! * region.radius, y: region.center.y + oy! * region.radius }));
      let best: { x: number; y: number } | null = null;
      for (const s of spots) {
        if (!this.terrain.isLand(s)) continue;
        const c = cam.toScreen(s);
        const box = { x: c.x - w / 2 - 8, y: c.y - size, w: w + 16, h: size * 2 };
        if (taken.some((t) => t.x < box.x + box.w && t.x + t.w > box.x && t.y < box.y + box.h && t.y + t.h > box.y)) continue;
        best = s;
        taken.push(box);
        break;
      }
      if (!best) continue;
      const at = cam.toScreen(best);
      letter(ctx, region.name, at.x, at.y, style);
    }

    // Reference letters and figures in the margin, as on any sheet of a series.
    if (k < fitK * 3) {
      const { width, height } = this.terrain.size;
      const ref = { family: GOTHIC, size: 9, weight: 600, stretch: 100, color: INK.black, alpha: 0.7 };
      for (let i = 0; i * 600 < width; i++) {
        const top = cam.toScreen({ x: i * 600 + 300, y: -34 });
        const bottom = cam.toScreen({ x: i * 600 + 300, y: height + 34 });
        letter(ctx, String.fromCharCode(65 + i), top.x, top.y, ref);
        letter(ctx, String.fromCharCode(65 + i), bottom.x, bottom.y, ref);
      }
      for (let j = 0; j * 600 < height; j++) {
        const left = cam.toScreen({ x: -34, y: Math.min(height, j * 600 + 300) });
        const right = cam.toScreen({ x: width + 34, y: Math.min(height, j * 600 + 300) });
        letter(ctx, String(j + 1), left.x, left.y, ref);
        letter(ctx, String(j + 1), right.x, right.y, ref);
      }
    }

    for (const b of this.blanks) {
      const at = cam.toScreen(b);
      letter(ctx, 'Unsurveyed', at.x, at.y, {
        family: GOTHIC,
        size: size * 0.62,
        weight: 400,
        stretch: 118,
        tracking: 0.7,
        upper: true,
        color: INK.graphite,
        alpha: 0.55 * fade,
      });
    }

    if (k > fitK * 1.5) {
      for (const river of this.terrain.rivers) {
        if (!river.name) continue;
        const i = Math.floor(river.line.length * 0.6);
        const a = river.line[i];
        const b = river.line[Math.min(river.line.length - 1, i + 3)];
        if (!a || !b) continue;
        let angle = Math.atan2(b.y - a.y, b.x - a.x);
        if (angle > Math.PI / 2) angle -= Math.PI;
        if (angle < -Math.PI / 2) angle += Math.PI;
        const at = cam.toScreen(a);
        letter(ctx, river.name, at.x, at.y - 7, {
          family: "'Besley', Georgia, serif",
          size: 11,
          italic: true,
          color: INK.waterLine,
          alpha: 0.95 * fade,
          angle,
          tracking: 0.08,
        });
      }
    }
  }
}
