// Routes between places. A route is fixed by its two end points and its link id alone,
// so a road surveyed once never wanders when the rest of the world changes.

import type { LinkState, PlaceState, Point } from '../world/types';
import { polylineLength } from './geometry';
import { rng } from './rng';
import type { Polyline, RoadPlan, Terrain } from './types';

const round = (v: number): number => Math.round(v * 100) / 100;

interface Shape {
  /** Main bow, as a share of the length; signed. */
  bow: number;
  /** Two softer bends laid over it. */
  s2: number;
  s3: number;
}

function trace(a: Point, b: Point, shape: Shape, samples: number): Polyline {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.hypot(dx, dy);
  if (len < 1e-6) return [{ x: a.x, y: a.y }, { x: b.x, y: b.y }];
  const nx = -dy / len;
  const ny = dx / len;
  const line: Polyline = [];
  for (let i = 0; i <= samples; i++) {
    const t = i / samples;
    const off =
      len *
      (shape.bow * Math.sin(Math.PI * t) +
        shape.s2 * Math.sin(2 * Math.PI * t) +
        shape.s3 * Math.sin(3 * Math.PI * t));
    line.push({ x: round(a.x + dx * t + nx * off), y: round(a.y + dy * t + ny * off) });
  }
  // The ends are the places themselves, exactly.
  line[0] = { x: a.x, y: a.y };
  line[samples] = { x: b.x, y: b.y };
  return line;
}

function wetSamples(line: Polyline, terrain: Terrain): number {
  let wet = 0;
  for (const p of line) if (!terrain.isLand(p)) wet++;
  return wet;
}

export function planRoads(links: LinkState[], places: PlaceState[], terrain: Terrain): RoadPlan[] {
  const at = new Map<string, Point>();
  for (const p of places) at.set(p.id, p.position);
  const out: RoadPlan[] = [];
  for (const link of links) {
    const a = at.get(link.a);
    const b = at.get(link.b);
    if (!a || !b) continue;
    const r = rng(`road|${link.id}`);
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    const samples = Math.round(Math.min(40, Math.max(24, len / 30)));
    const sign = r.next() < 0.5 ? -1 : 1;
    const bow = r.range(0.04, 0.1);
    const s2 = r.range(-0.022, 0.022);
    const s3 = r.range(-0.012, 0.012);

    // The seeded route stands unless it wades through open water and a plain
    // alternative keeps drier: the other side, then a wider sweep each way.
    let best = trace(a, b, { bow: sign * bow, s2, s3 }, samples);
    let bestWet = wetSamples(best, terrain);
    if (bestWet > 2) {
      const wide = Math.min(0.2, bow * 2.2);
      for (const alt of [-sign * bow, sign * wide, -sign * wide]) {
        const line = trace(a, b, { bow: alt, s2, s3 }, samples);
        const wet = wetSamples(line, terrain);
        if (wet < bestWet) {
          best = line;
          bestWet = wet;
        }
      }
    }
    out.push({ link: link.id, line: best, length: round(polylineLength(best)) });
  }
  return out;
}
