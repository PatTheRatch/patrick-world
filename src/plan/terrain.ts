// The ground the world stands on: a coast, lakes, rivers and relief for the whole sheet.
// Everything derives from one height field sampled on a coarse grid, so the coastline,
// `heightAt` and `isLand` always agree.

import type { Catalogue, Point } from '../world/types';
import { chaikin, clamp, polygonArea, polylineLength, signedArea, smoothstep } from './geometry';
import { fbm, noise2, rng } from './rng';
import type { Hachure, Polygon, Polyline, River, Terrain } from './types';

/** Grid pitch in world units. */
export const TERRAIN_CELL = 24;
/** Heights at or above this are land. */
export const SEA_LEVEL = 0.4;
/** No river runs nearer than this to a region centre. */
export const RIVER_CLEARANCE = 90;

const SHOAL_DEPTHS = [0.022, 0.05, 0.085];
const RIVER_NAMES = [
  'Tally R.',
  'Long Reach',
  'Otter R.',
  'Marrow Water',
  'Cold Fork',
  'Wend R.',
  'Sable R.',
  'Hollin Brook',
];

// ───────────────────────── Marching squares ─────────────────────────

interface Loop {
  points: Point[];
  /** Signed area; the sign tells an outline from a hole. */
  area: number;
}

/**
 * Closed iso-lines of a node grid at `level`. Segments are directed so the high side is
 * always on the same hand, which makes outlines and holes wind opposite ways. The grid's
 * outer ring must lie below `level` so every line closes.
 */
function contours(g: Float32Array, nx: number, ny: number, cell: number, level: number): Loop[] {
  const segFrom: number[] = [];
  const segTo: number[] = [];
  const next = new Map<number, number>();
  const pointOf = (edge: number): Point => {
    const vertical = edge & 1;
    const node = edge >> 1;
    const ix = node % nx;
    const iy = (node - ix) / nx;
    const a = g[node] as number;
    const b = g[vertical ? node + nx : node + 1] as number;
    const t = clamp((level - a) / (b - a || 1e-9), 0, 1);
    return vertical ? { x: ix * cell, y: (iy + t) * cell } : { x: (ix + t) * cell, y: iy * cell };
  };
  for (let iy = 0; iy + 1 < ny; iy++) {
    for (let ix = 0; ix + 1 < nx; ix++) {
      const n = ix + iy * nx;
      const a = g[n] as number;
      const b = g[n + 1] as number;
      const c = g[n + nx + 1] as number;
      const d = g[n + nx] as number;
      const code = (a >= level ? 1 : 0) | (b >= level ? 2 : 0) | (c >= level ? 4 : 0) | (d >= level ? 8 : 0);
      if (code === 0 || code === 15) continue;
      const B = n * 2;
      const R = (n + 1) * 2 + 1;
      const T = (n + nx) * 2;
      const L = n * 2 + 1;
      const centre = (a + b + c + d) / 4 >= level;
      let pairs: number[];
      switch (code) {
        case 1:
        case 14:
          pairs = [L, B];
          break;
        case 2:
        case 13:
          pairs = [B, R];
          break;
        case 3:
        case 12:
          pairs = [L, R];
          break;
        case 4:
        case 11:
          pairs = [R, T];
          break;
        case 6:
        case 9:
          pairs = [B, T];
          break;
        case 7:
        case 8:
          pairs = [L, T];
          break;
        case 5:
          pairs = centre ? [L, T, B, R] : [L, B, R, T];
          break;
        default:
          pairs = centre ? [L, B, R, T] : [B, R, L, T];
          break;
      }
      for (let k = 0; k < pairs.length; k += 2) {
        let e0 = pairs[k] as number;
        let e1 = pairs[k + 1] as number;
        const p = pointOf(e0);
        const q = pointOf(e1);
        // Orient by the local gradient so the high side keeps to one hand.
        const u = ((p.x + q.x) / 2 - ix * cell) / cell;
        const v = ((p.y + q.y) / 2 - iy * cell) / cell;
        const gx = (b - a) * (1 - v) + (c - d) * v;
        const gy = (d - a) * (1 - u) + (c - b) * u;
        if ((q.x - p.x) * gy - (q.y - p.y) * gx < 0) {
          const t = e0;
          e0 = e1;
          e1 = t;
        }
        next.set(e0, segFrom.length);
        segFrom.push(e0);
        segTo.push(e1);
      }
    }
  }
  const done = new Uint8Array(segFrom.length);
  const loops: Loop[] = [];
  for (let s = 0; s < segFrom.length; s++) {
    if (done[s]) continue;
    const points: Point[] = [];
    let cur: number | undefined = s;
    while (cur !== undefined && !done[cur]) {
      done[cur] = 1;
      points.push(pointOf(segFrom[cur] as number));
      cur = next.get(segTo[cur] as number);
    }
    if (points.length >= 3) loops.push({ points, area: signedArea(points) });
  }
  return loops;
}

// ───────────────────────── A small binary heap ─────────────────────────

class MinHeap {
  private readonly ids: number[] = [];
  private readonly keys: number[] = [];
  get size(): number {
    return this.ids.length;
  }
  push(id: number, k: number): void {
    const ids = this.ids;
    const keys = this.keys;
    let i = ids.length;
    ids.push(id);
    keys.push(k);
    while (i > 0) {
      const p = (i - 1) >> 1;
      if ((keys[p] as number) <= k) break;
      ids[i] = ids[p] as number;
      keys[i] = keys[p] as number;
      i = p;
    }
    ids[i] = id;
    keys[i] = k;
  }
  pop(): number {
    const ids = this.ids;
    const keys = this.keys;
    const top = ids[0] as number;
    const lastId = ids.pop() as number;
    const lastKey = keys.pop() as number;
    const n = ids.length;
    if (n > 0) {
      let i = 0;
      for (;;) {
        let c = i * 2 + 1;
        if (c >= n) break;
        if (c + 1 < n && (keys[c + 1] as number) < (keys[c] as number)) c++;
        if ((keys[c] as number) >= lastKey) break;
        ids[i] = ids[c] as number;
        keys[i] = keys[c] as number;
        i = c;
      }
      ids[i] = lastId;
      keys[i] = lastKey;
    }
    return top;
  }
}

// ───────────────────────── Terrain ─────────────────────────

export function buildTerrain(catalogue: Catalogue, seed: string): Terrain {
  const W = catalogue.size.width;
  const H = catalogue.size.height;
  const cell = TERRAIN_CELL;
  const nx = Math.ceil(W / cell) + 1;
  const ny = Math.ceil(H / cell) + 1;
  const N = nx * ny;
  const regions = catalogue.regions;
  const r = rng(`${seed}|terrain`);

  const nBase = noise2(`${seed}|base`);
  const nWarpX = noise2(`${seed}|warp-x`);
  const nWarpY = noise2(`${seed}|warp-y`);
  const nRidge = noise2(`${seed}|ridge`);
  const nEdge = noise2(`${seed}|edge`);
  const nDetail = noise2(`${seed}|detail`);
  const nWood = noise2(`${seed}|wood`);
  const nCoast = noise2(`${seed}|coast`);
  const nRange = noise2(`${seed}|range`);

  // How far the sea reaches in from each side of the sheet, as a share of that side.
  const edgeShare = [r.range(0.06, 0.1), r.range(0.06, 0.1), r.range(0.06, 0.1), r.range(0.06, 0.1)];
  // One or two sides get a wide sea: a sheet with the land hard against all four edges
  // reads as a rectangle.
  const wideSide = r.int(0, 1);
  edgeShare[wideSide] = (edgeShare[wideSide] as number) * 1.5;

  const g = new Float32Array(N);
  for (let iy = 0; iy < ny; iy++) {
    const y = iy * cell;
    for (let ix = 0; ix < nx; ix++) {
      const x = ix * cell;
      const wx = x + 170 * fbm(nWarpX, x / 700, y / 700, 2);
      const wy = y + 170 * fbm(nWarpY, x / 700, y / 700, 2);
      const base = fbm(nBase, wx / 1150, wy / 1150, 5);

      const ex = (x - W / 2) / (W * 0.5);
      const ey = (y - H / 2) / (H * 0.5);
      const continent = 1 - (ex * ex + ey * ey);

      // Signed distance beyond the nearest region's rim, blended so that neighbouring
      // regions run together instead of meeting at a crease.
      let acc = 0;
      let floor = -9;
      const rim = 0.5 + 0.5 * nEdge(x / 240 + 9, y / 240 - 9);
      for (const reg of regions) {
        const d = Math.hypot(x - reg.center.x, y - reg.center.y);
        acc += Math.exp(-(d - reg.radius) / 160);
        // Out to at least 0.88 of a region's radius the ground is land, whatever the
        // noise says. The rim of that guarantee is ragged, so a coast that leans on it
        // is not an arc of a circle.
        const reachR = reg.radius * (0.885 + 0.1 * rim);
        // Past the rim the guarantee falls away steeply but without a step.
        const f = d < reachR ? 0.014 + 0.016 * (1 - d / reachR) : 0.014 - (d - reachR) * 0.0014;
        if (f > floor) floor = f;
      }
      const q = acc > 0 ? -160 * Math.log(acc) : 4000;
      const shelf = q < 0 ? 0.07 + 0.035 * (1 - Math.exp(q / 260)) : 0.07 - 0.3 * (q / 520);
      // Deep inside a region the noise may raise hills but may not sink much ground.
      const sink = 0.5 + 0.5 * smoothstep(-520, 220, q);

      // The sea closes in toward the sheet's edges, by an amount that wanders.
      const wander = 1 + 0.35 * nEdge(x / 620, y / 620);
      const eL = x / (W * (edgeShare[0] as number) * wander);
      const eR = (W - x) / (W * (edgeShare[1] as number) * wander);
      const eT = y / (H * (edgeShare[2] as number) * wander);
      const eB = (H - y) / (H * (edgeShare[3] as number) * wander);
      const edge = 1 - smoothstep(0, 1.15, Math.min(eL, eR, eT, eB));

      const coastal = fbm(nCoast, wx / 360, wy / 360, 4);
      let h = SEA_LEVEL + shelf + 0.03 * continent + 0.42 * (base < 0 ? base * sink : base) - 0.55 * edge;
      h += 0.085 * coastal * sink + 0.025 * nDetail(x / 150, y / 150);
      // Ranges stand only on ground already well clear of the sea.
      const inland = smoothstep(SEA_LEVEL + 0.02, SEA_LEVEL + 0.15, h);
      const ridge = 1 - Math.abs(fbm(nRidge, wx / 600, wy / 600, 3));
      const range = smoothstep(-0.25, 0.2, nRange(x / 1400, y / 1400));
      h += 0.34 * inland * range * ridge ** 5;
      if (h < SEA_LEVEL + floor) {
        // Keep a trace of the buried relief so the rescued ground is not a perfect cone.
        h = SEA_LEVEL + floor + 0.4 * Math.max(0, h - SEA_LEVEL + 0.12);
      }
      g[ix + iy * nx] = h;
    }
  }

  const at = (ix: number, iy: number): number => ix + iy * nx;
  const nearestRegion = (x: number, y: number): number => {
    let best = Infinity;
    for (const reg of regions) {
      const d = Math.hypot(x - reg.center.x, y - reg.center.y);
      if (d < best) best = d;
    }
    return best;
  };

  // ── Offshore islands: a few low rises set in open water ──
  {
    const want = r.int(2, 3);
    const placed: Point[] = [];
    for (let tries = 0; tries < 400 && placed.length < want; tries++) {
      const x = r.range(W * 0.06, W * 0.94);
      const y = r.range(H * 0.07, H * 0.93);
      const ix = Math.round(x / cell);
      const iy = Math.round(y / cell);
      const h = g[at(ix, iy)] as number;
      if (h > SEA_LEVEL - 0.07 || h < SEA_LEVEL - 0.3) continue;
      if (placed.some((p) => Math.hypot(p.x - x, p.y - y) < 600)) continue;
      const rad = r.range(110, 190);
      const lift = r.range(0.07, 0.11) + (SEA_LEVEL - h);
      const stretch = r.range(0.6, 1.6);
      const reachN = Math.ceil((rad * 2) / cell);
      // Reject sites whose rise would fuse with the mainland.
      let clear = true;
      for (let dy = -reachN - 2; dy <= reachN + 2 && clear; dy++) {
        for (let dx = -reachN - 2; dx <= reachN + 2; dx++) {
          const jx = ix + dx;
          const jy = iy + dy;
          if (jx < 2 || jy < 2 || jx >= nx - 2 || jy >= ny - 2) {
            clear = false;
            break;
          }
          if ((g[at(jx, jy)] as number) >= SEA_LEVEL - 0.015) {
            clear = false;
            break;
          }
        }
      }
      if (!clear) continue;
      for (let dy = -reachN; dy <= reachN; dy++) {
        for (let dx = -reachN; dx <= reachN; dx++) {
          if (ix + dx < 1 || iy + dy < 1 || ix + dx >= nx - 1 || iy + dy >= ny - 1) continue;
          const px = (ix + dx) * cell;
          const py = (iy + dy) * cell;
          const dd = Math.hypot((px - x) / stretch, (py - y) * stretch) / rad;
          const wob = 1 + 0.55 * fbm(nDetail, px / 170, py / 170, 2);
          const k = Math.exp(-dd * dd * 2.6 * wob);
          g[at(ix + dx, iy + dy)] = (g[at(ix + dx, iy + dy)] as number) + lift * k;
        }
      }
      placed.push({ x, y });
    }
  }

  // The outer ring is always sea, so every coastline closes on the sheet.
  for (let ix = 0; ix < nx; ix++) {
    g[at(ix, 0)] = Math.min(g[at(ix, 0)] as number, 0.05);
    g[at(ix, ny - 1)] = Math.min(g[at(ix, ny - 1)] as number, 0.05);
  }
  for (let iy = 0; iy < ny; iy++) {
    g[at(0, iy)] = Math.min(g[at(0, iy)] as number, 0.05);
    g[at(nx - 1, iy)] = Math.min(g[at(nx - 1, iy)] as number, 0.05);
  }

  // ── Connected bodies of land and water on the grid ──
  const label = new Int32Array(N);
  const components = (): { land: boolean; nodes: number[]; border: boolean }[] => {
    label.fill(-1);
    const out: { land: boolean; nodes: number[]; border: boolean }[] = [];
    const stack: number[] = [];
    for (let s = 0; s < N; s++) {
      if (label[s] !== -1) continue;
      const land = (g[s] as number) >= SEA_LEVEL;
      const comp = { land, nodes: [] as number[], border: false };
      label[s] = out.length;
      stack.push(s);
      while (stack.length > 0) {
        const n = stack.pop() as number;
        comp.nodes.push(n);
        const ix = n % nx;
        const iy = (n - ix) / nx;
        if (ix === 0 || iy === 0 || ix === nx - 1 || iy === ny - 1) comp.border = true;
        for (let k = 0; k < 4; k++) {
          const jx = ix + (k === 0 ? 1 : k === 1 ? -1 : 0);
          const jy = iy + (k === 2 ? 1 : k === 3 ? -1 : 0);
          if (jx < 0 || jy < 0 || jx >= nx || jy >= ny) continue;
          const m = at(jx, jy);
          if (label[m] !== -1 || (g[m] as number) >= SEA_LEVEL !== land) continue;
          label[m] = out.length;
          stack.push(m);
        }
      }
      out.push(comp);
    }
    return out;
  };

  // Drown specks of land; fill puddles; keep at most two natural lakes.
  {
    const comps = components();
    const inlandWater = comps.filter((c) => !c.land && !c.border).sort((a, b) => b.nodes.length - a.nodes.length);
    let kept = 0;
    for (const c of inlandWater) {
      const keep = kept < 2 && c.nodes.length >= 24 && c.nodes.length <= 260;
      if (keep) {
        kept++;
        continue;
      }
      if (c.nodes.length > 260) continue; // An inland sea: leave it be.
      for (const n of c.nodes) g[n] = SEA_LEVEL + 0.012;
    }
    for (const c of comps) {
      if (c.land && c.nodes.length < 7) for (const n of c.nodes) g[n] = SEA_LEVEL - 0.02;
    }
  }

  // ── Lakes: dig a few more where the ground allows, away from region centres ──
  {
    const comps = components();
    const natural = comps.filter((c) => !c.land && !c.border).length;
    const want = Math.max(0, r.int(2, 4) - natural);
    const placed: Point[] = [];
    for (const c of comps) {
      if (c.land || c.border) continue;
      const n = c.nodes[0] as number;
      placed.push({ x: (n % nx) * cell, y: Math.floor(n / nx) * cell });
    }
    let dug = 0;
    for (let tries = 0; tries < 600 && dug < want; tries++) {
      const x = r.range(W * 0.15, W * 0.85);
      const y = r.range(H * 0.15, H * 0.85);
      const rad = r.range(85, 150);
      const stretch = r.range(0.7, 1.45);
      const ix = Math.round(x / cell);
      const iy = Math.round(y / cell);
      const h = g[at(ix, iy)] as number;
      if (h < SEA_LEVEL + 0.05 || h > SEA_LEVEL + 0.2) continue;
      // No lake water within half a region's radius of its centre.
      const extent = rad * Math.max(stretch, 1 / stretch) * 1.45;
      if (regions.some((reg) => Math.hypot(x - reg.center.x, y - reg.center.y) < reg.radius * 0.5 + extent)) continue;
      if (placed.some((p) => Math.hypot(p.x - x, p.y - y) < 620)) continue;
      const reachN = Math.ceil((rad * 3.2) / cell);
      const checkN = Math.ceil((rad * 1.9) / cell) + 2;
      // The whole basin must be dry land well inside the coast.
      let ok = true;
      for (let dy = -checkN; dy <= checkN && ok; dy++) {
        for (let dx = -checkN; dx <= checkN; dx++) {
          const jx = ix + dx;
          const jy = iy + dy;
          if (jx < 1 || jy < 1 || jx >= nx - 1 || jy >= ny - 1 || (g[at(jx, jy)] as number) < SEA_LEVEL) {
            ok = false;
            break;
          }
        }
      }
      if (!ok) continue;
      let wet = 0;
      for (let dy = -reachN; dy <= reachN; dy++) {
        for (let dx = -reachN; dx <= reachN; dx++) {
          if (ix + dx < 1 || iy + dy < 1 || ix + dx >= nx - 1 || iy + dy >= ny - 1) continue;
          const px = (ix + dx) * cell;
          const py = (iy + dy) * cell;
          const dd = Math.hypot((px - x) / stretch, (py - y) * stretch) / rad;
          const wob = 1 + 0.4 * fbm(nDetail, px / 210 + 40, py / 210 - 40, 2);
          // A smooth bowl, so the shore falls between grid nodes and not along them.
          const bowl = SEA_LEVEL + 0.12 * (dd / wob - 1);
          const n = at(ix + dx, iy + dy);
          if (bowl < (g[n] as number)) {
            g[n] = bowl;
            if (bowl < SEA_LEVEL) wet++;
          }
        }
      }
      if (wet > 0) {
        placed.push({ x, y });
        dug++;
      }
    }
  }

  // Final bodies. Lakes are kept shallow so the shoal lines stay in the sea.
  const comps = components();
  const isLake = new Uint8Array(N);
  for (const c of comps) {
    if (c.land || c.border) continue;
    for (const n of c.nodes) {
      isLake[n] = 1;
      g[n] = Math.max(g[n] as number, SEA_LEVEL - 0.018);
    }
  }
  for (let n = 0; n < N; n++) g[n] = clamp(g[n] as number, 0, 1);

  const hAt = (x: number, y: number): number => {
    const fx = clamp(x / cell, 0, nx - 1.000001);
    const fy = clamp(y / cell, 0, ny - 1.000001);
    const ix = Math.floor(fx);
    const iy = Math.floor(fy);
    const u = fx - ix;
    const v = fy - iy;
    const n = ix + iy * nx;
    const a = g[n] as number;
    const b = g[n + 1] as number;
    const c = g[n + nx] as number;
    const d = g[n + nx + 1] as number;
    return (a + (b - a) * u) * (1 - v) + (c + (d - c) * u) * v;
  };
  const heightAt = (p: Point): number => hAt(p.x, p.y);
  const isLand = (p: Point): boolean => heightAt(p) >= SEA_LEVEL;

  // ── Coast and lakes ──
  const coast = contours(g, nx, ny, cell, SEA_LEVEL);
  let outlineSign = 1;
  {
    let big = 0;
    for (const l of coast) {
      if (Math.abs(l.area) > big) {
        big = Math.abs(l.area);
        outlineSign = l.area >= 0 ? 1 : -1;
      }
    }
  }
  const land: Polygon[] = coast
    .filter((l) => l.area * outlineSign > 0)
    .map((l) => chaikin(l.points, 2, true))
    .filter((p) => polygonArea(p) >= 3000)
    .sort((a, b) => polygonArea(b) - polygonArea(a));
  const lakes: Polygon[] = coast
    .filter((l) => l.area * outlineSign < 0)
    .map((l) => chaikin(l.points, 2, true))
    .filter((p) => polygonArea(p) >= 1200)
    .sort((a, b) => polygonArea(b) - polygonArea(a));

  // ── Shoals: the same coast, traced again a little deeper each time ──
  const shoals: Polyline[][] = SHOAL_DEPTHS.map((depth) =>
    contours(g, nx, ny, cell, SEA_LEVEL - depth)
      .filter((l) => Math.abs(l.area) >= 2500)
      .map((l) => {
        const ring = chaikin(l.points, 2, true);
        ring.push(ring[0] as Point);
        return ring;
      }),
  );

  // ── Drainage: flood inward from all water, lowest ground first ──
  const parent = new Int32Array(N).fill(-1);
  const steps = new Int32Array(N);
  const seen = new Uint8Array(N);
  const level = new Float32Array(N);
  const barred = new Uint8Array(N);
  for (let iy = 0; iy < ny; iy++) {
    for (let ix = 0; ix < nx; ix++) {
      if (nearestRegion(ix * cell, iy * cell) < RIVER_CLEARANCE + 52) barred[at(ix, iy)] = 1;
    }
  }
  {
    const heap = new MinHeap();
    for (let n = 0; n < N; n++) {
      if ((g[n] as number) >= SEA_LEVEL) continue;
      seen[n] = 1;
      const ix = n % nx;
      const iy = (n - ix) / nx;
      // Only water that touches land can be a river mouth.
      let shore = false;
      for (let k = 0; k < 4 && !shore; k++) {
        const jx = ix + (k === 0 ? 1 : k === 1 ? -1 : 0);
        const jy = iy + (k === 2 ? 1 : k === 3 ? -1 : 0);
        if (jx < 0 || jy < 0 || jx >= nx || jy >= ny) continue;
        if ((g[at(jx, jy)] as number) >= SEA_LEVEL) shore = true;
      }
      if (shore) {
        level[n] = g[n] as number;
        heap.push(n, level[n] as number);
      }
    }
    while (heap.size > 0) {
      const n = heap.pop();
      const ix = n % nx;
      const iy = (n - ix) / nx;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (dx === 0 && dy === 0) continue;
          const jx = ix + dx;
          const jy = iy + dy;
          if (jx < 0 || jy < 0 || jx >= nx || jy >= ny) continue;
          const m = at(jx, jy);
          if (seen[m] || barred[m]) continue;
          seen[m] = 1;
          parent[m] = n;
          steps[m] = (steps[n] as number) + 1;
          // The level only ever rises, by at least a hair per step (more on the diagonal),
          // so flats and filled hollows drain by the shortest way out instead of wandering.
          const rise = (level[n] as number) + (dx !== 0 && dy !== 0 ? 0.00085 : 0.0006);
          level[m] = Math.max(g[m] as number, rise);
          heap.push(m, level[m] as number);
        }
      }
    }
  }

  // ── Rivers ──
  const rivers: River[] = [];
  {
    const candidates: { n: number; score: number }[] = [];
    for (let n = 0; n < N; n++) {
      if (parent[n] === -1 || (steps[n] as number) < 9) continue;
      const h = g[n] as number;
      if (h < SEA_LEVEL + 0.06) continue;
      candidates.push({ n, score: (steps[n] as number) + 60 * (h - SEA_LEVEL) + 8 * r.next() });
    }
    candidates.sort((a, b) => b.score - a.score || a.n - b.n);
    const want = r.int(5, 7);
    const used = new Uint8Array(N);
    const sources: Point[] = [];
    const courses: Point[][] = [];
    for (const minSteps of [22, 16, 12, 9]) {
      for (const c of candidates) {
        if (courses.length >= want) break;
        if ((steps[c.n] as number) < minSteps) continue;
        const sx = (c.n % nx) * cell;
        const sy = Math.floor(c.n / nx) * cell;
        if (sources.some((p) => Math.hypot(p.x - sx, p.y - sy) < 420)) continue;
        const path: number[] = [];
        let cur = c.n;
        let clash = false;
        let lowest = Infinity;
        while (cur !== -1) {
          // Water runs downhill: a course that has to climb out of a hollow is no river.
          const h = g[cur] as number;
          if (used[cur] || h > lowest + 0.012) {
            clash = true;
            break;
          }
          if (h < lowest) lowest = h;
          path.push(cur);
          if ((g[cur] as number) < SEA_LEVEL) break;
          cur = parent[cur] as number;
        }
        if (clash || path.length < minSteps) continue;
        // Keep courses apart: mark a one-node margin around this one.
        for (const n of path) {
          const ix = n % nx;
          const iy = (n - ix) / nx;
          for (let dy = -1; dy <= 1; dy++) {
            for (let dx = -1; dx <= 1; dx++) {
              const jx = ix + dx;
              const jy = iy + dy;
              if (jx >= 0 && jy >= 0 && jx < nx && jy < ny) used[at(jx, jy)] = 1;
            }
          }
        }
        sources.push({ x: sx, y: sy });
        courses.push(path.map((n) => ({ x: (n % nx) * cell, y: Math.floor(n / nx) * cell })));
      }
      if (courses.length >= 4) break;
    }

    const nMeander = noise2(`${seed}|meander`);
    const built = courses.map((raw, idx) => {
      // The grid gives a course of straight runs and 45-degree turns. Round it off,
      // then let it wander: a slow swing and a quicker wriggle, both fading out at the
      // source and the mouth so the river still meets the water where it should.
      // Every other node is enough to carry the course; the rest only carry the grid.
      const thin = raw.filter((_, i) => i % 2 === 0 || i >= raw.length - 2);
      const eased = chaikin(thin, 1, false);
      const last = eased.length - 1;
      const pts: Point[] = eased.map((p, i) => {
        if (i === 0 || i === last) return p;
        const a = eased[i - 1] as Point;
        const b = eased[i + 1] as Point;
        const len = Math.hypot(b.x - a.x, b.y - a.y) || 1;
        const fade = Math.min(1, i / 3, (last - i) / 3);
        const off =
          fade *
          (22 * nMeander(p.x / 170 + idx * 31, p.y / 170 - idx * 17) +
            9 * nMeander(p.x / 66 - idx * 13, p.y / 66 + idx * 7));
        return { x: p.x - ((b.y - a.y) / len) * off, y: p.y + ((b.x - a.x) / len) * off };
      });
      const line = chaikin(pts, 3, false).map((p) => ({ x: Math.round(p.x * 10) / 10, y: Math.round(p.y * 10) / 10 }));
      return { line, length: polylineLength(line) };
    });
    const byLength = built.map((b, i) => ({ i, length: b.length })).sort((a, b) => b.length - a.length);
    const names = RIVER_NAMES.slice();
    const named = new Map<number, string>();
    const nameCount = Math.min(byLength.length, r.int(3, 4));
    for (let k = 0; k < nameCount; k++) {
      const pickAt = Math.floor(r.next() * names.length);
      const name = names.splice(pickAt, 1)[0];
      const entry = byLength[k];
      if (name !== undefined && entry) named.set(entry.i, name);
    }
    built.forEach((b, i) => {
      const width = Math.round((3 + 5 * clamp(b.length / 1100, 0, 1)) * 10) / 10;
      const name = named.get(i);
      rivers.push(name === undefined ? { line: b.line, width } : { line: b.line, width, name });
    });
  }

  // ── Relief: short strokes pointing downhill, only where the ground is steep ──
  const slopeAt = (x: number, y: number): [number, number] => {
    const e = cell;
    const dx = (hAt(x + e, y) - hAt(x - e, y)) / (2 * e);
    const dy = (hAt(x, y + e) - hAt(x, y - e)) / (2 * e);
    return [dx, dy];
  };
  const hachures: Hachure[] = [];
  let steep = Infinity;
  {
    const pitch = 17;
    const hr = rng(`${seed}|hachure`);
    const cand: { x: number; y: number; dx: number; dy: number; s: number }[] = [];
    for (let y = pitch; y < H - pitch; y += pitch) {
      for (let x = pitch; x < W - pitch; x += pitch) {
        const px = x + hr.range(-0.45, 0.45) * pitch;
        const py = y + hr.range(-0.45, 0.45) * pitch;
        if (hAt(px, py) < SEA_LEVEL + 0.012) continue;
        const [dx, dy] = slopeAt(px, py);
        cand.push({ x: px, y: py, dx, dy, s: Math.hypot(dx, dy) });
      }
    }
    // The threshold floats so the sheet carries a steady weight of relief.
    const sorted = cand.map((c) => c.s).sort((a, b) => b - a);
    const target = Math.min(9800, Math.floor(sorted.length * 0.42));
    steep = Math.max(sorted[target] ?? 0, 0.00035);
    const top = sorted[Math.floor(target * 0.05)] ?? steep * 2;
    for (const c of cand) {
      // Thinner where towns stand: the heart of each region keeps a quarter of its
      // strokes, rising to all of them at a quarter of its radius.
      const thin = hr.next();
      if (c.s < steep) continue;
      let keep = 1;
      for (const reg of regions) {
        const d = Math.hypot(c.x - reg.center.x, c.y - reg.center.y) / (reg.radius * 0.25);
        if (d < 1) keep = Math.min(keep, 0.25 + 0.75 * d * d);
      }
      if (thin > keep) continue;
      const len = 6 + 10 * clamp((c.s - steep) / (top - steep || 1), 0, 1);
      const bx = c.x - (c.dx / c.s) * len;
      const by = c.y - (c.dy / c.s) * len;
      if (hAt(bx, by) < SEA_LEVEL + 0.003) continue;
      hachures.push({
        a: { x: Math.round(c.x * 10) / 10, y: Math.round(c.y * 10) / 10 },
        b: { x: Math.round(bx * 10) / 10, y: Math.round(by * 10) / 10 },
      });
    }
  }

  // ── Woods: clumps on gentle ground ──
  const woods: Point[] = [];
  {
    const pitch = 21;
    const wr = rng(`${seed}|woods`);
    const cand: { x: number; y: number; m: number }[] = [];
    for (let y = pitch; y < H - pitch; y += pitch) {
      for (let x = pitch; x < W - pitch; x += pitch) {
        const px = x + wr.range(-0.48, 0.48) * pitch;
        const py = y + wr.range(-0.48, 0.48) * pitch;
        if (hAt(px, py) < SEA_LEVEL + 0.01) continue;
        const [dx, dy] = slopeAt(px, py);
        if (Math.hypot(dx, dy) >= steep * 0.85) continue;
        cand.push({ x: px, y: py, m: fbm(nWood, px / 420, py / 420, 3) + 0.25 * wr.next() });
      }
    }
    const sorted = cand.map((c) => c.m).sort((a, b) => b - a);
    const cut = sorted[Math.min(sorted.length - 1, 2300)] ?? Infinity;
    for (const c of cand) {
      if (c.m > cut) woods.push({ x: Math.round(c.x * 10) / 10, y: Math.round(c.y * 10) / 10 });
    }
  }

  return { size: { width: W, height: H }, land, shoals, lakes, rivers, hachures, woods, heightAt, isLand };
}
