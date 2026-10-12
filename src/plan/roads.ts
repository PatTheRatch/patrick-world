// Routes between places. A route is fixed by its two end points and its link id alone,
// so a road surveyed once never wanders when the rest of the world changes.

import type { LinkState, PlaceState, Point } from '../world/types';
import { polylineLength } from './geometry';
import { rng } from './rng';
import type { CityPlan, Polyline, RoadPlan, Terrain } from './types';

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

// ───────────────────────── Where a road meets a town ─────────────────────────
//
// The route between two places is fixed for good. How it ARRIVES is not: a road comes into a
// town by the end of one of the town's own streets, and as the street is built further out the
// last stretch of the road is redrawn to meet it. Nothing but that last stretch ever moves.

/** The end of a town street that a road may arrive by. */
export interface Gate {
  at: Point;
  /** Unit vector along the street, out of town. */
  out: Point;
}

/** Past this much of a turn, a road does not double back to find a street. */
const GATE_MAX_TURN = 1;
/** A road never crosses a town to reach a street on its far side. */
const GATE_MAX_SIDE = 1.2;

/**
 * The street end a road from `toward` comes in by: the main street whose outer end faces
 * that way most nearly. None if the place has no streets, or none that face that way.
 */
export function townGate(plan: CityPlan, toward: Point): Gate | null {
  const mains = plan.streets.filter((s) => s.main && s.line.length >= 2);
  const bearing = Math.atan2(toward.y - plan.center.y, toward.x - plan.center.x);
  const turn = (a: number, from: number) => Math.abs(Math.atan2(Math.sin(a - from), Math.cos(a - from)));
  let best: { gate: Gate; cost: number } | null = null;
  // Failing a street that heads the right way, the nearest street end on that side of town:
  // the road simply meets it at an angle, as roads do at the edge of a town.
  let meets: { gate: Gate; cost: number } | null = null;
  for (const street of mains) {
    const end = street.line[street.line.length - 1]!;
    const before = street.line[street.line.length - 2]!;
    // An old arm that a later quarter was laid out beyond has no end of its own.
    if (mains.some((o) => o !== street && Math.hypot(o.line[0]!.x - end.x, o.line[0]!.y - end.y) < 1)) continue;
    const len = Math.hypot(end.x - before.x, end.y - before.y);
    if (len < 1e-6) continue;
    const out = { x: (end.x - before.x) / len, y: (end.y - before.y) / len };
    const away = Math.atan2(toward.y - end.y, toward.x - end.x);
    const side = turn(Math.atan2(end.y - plan.center.y, end.x - plan.center.x), bearing);
    // The street has to be heading roughly where the road is going: a road does not leave
    // town one way and double back.
    const heading = turn(Math.atan2(out.y, out.x), away);
    const at = { x: end.x, y: end.y };
    if (heading <= GATE_MAX_TURN) {
      const cost = heading + 0.5 * side;
      if (!best || cost < best.cost - 1e-9) best = { gate: { at, out }, cost };
    } else if (side <= GATE_MAX_SIDE && (!meets || side < meets.cost - 1e-9)) {
      meets = { gate: { at, out: { x: Math.cos(away), y: Math.sin(away) } }, cost: side };
    }
  }
  return (best ?? meets)?.gate ?? null;
}

export interface RoadEnd {
  center: Point;
  /** Without a gate, the road stops this far from the centre: at the town limits. */
  reach: number;
  /** As drawn: a renderer that exaggerates towns passes the exaggerated point. */
  gate?: Gate | null;
}

function cubic(p0: Point, t0: Point, p3: Point, t3: Point, steps: number): Polyline {
  const h = Math.hypot(p3.x - p0.x, p3.y - p0.y) * 0.42;
  const p1 = { x: p0.x + t0.x * h, y: p0.y + t0.y * h };
  const p2 = { x: p3.x - t3.x * h, y: p3.y - t3.y * h };
  const out: Polyline = [];
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const u = 1 - t;
    out.push({
      x: u * u * u * p0.x + 3 * u * u * t * p1.x + 3 * u * t * t * p2.x + t * t * t * p3.x,
      y: u * u * u * p0.y + 3 * u * u * t * p1.y + 3 * u * t * t * p2.y + t * t * t * p3.y,
    });
  }
  return out;
}

const unit = (from: Point, to: Point): Point => {
  const d = Math.hypot(to.x - from.x, to.y - from.y) || 1;
  return { x: (to.x - from.x) / d, y: (to.y - from.y) / d };
};

/**
 * The route as it is drawn: the surveyed line across open country, with each end brought
 * round to its gate. An end with no gate stops at the town limits.
 */
export function joinRoad(line: Polyline, a: RoadEnd, b: RoadEnd): Polyline {
  const clear = (e: RoadEnd) => (e.gate ? Math.max(e.reach, Math.hypot(e.gate.at.x - e.center.x, e.gate.at.y - e.center.y) * 1.45 + 24) : e.reach);
  const ra = clear(a);
  const rb = clear(b);
  const body = line.filter(
    (p) => Math.hypot(p.x - a.center.x, p.y - a.center.y) > ra && Math.hypot(p.x - b.center.x, p.y - b.center.y) > rb,
  );
  if (body.length < 2) {
    // The two towns are close enough that nothing of the open route is left between them.
    const toB = unit(a.center, b.center);
    const from = a.gate?.at ?? { x: a.center.x + toB.x * a.reach, y: a.center.y + toB.y * a.reach };
    const to = b.gate?.at ?? { x: b.center.x - toB.x * b.reach, y: b.center.y - toB.y * b.reach };
    const along = unit(from, to);
    return cubic(from, a.gate?.out ?? along, to, b.gate ? { x: -b.gate.out.x, y: -b.gate.out.y } : along, 14);
  }
  const out: Polyline = [];
  if (a.gate) {
    const first = body[0]!;
    out.push(...cubic(a.gate.at, a.gate.out, first, unit(first, body[1]!), 16).slice(0, -1));
  }
  out.push(...body);
  if (b.gate) {
    const last = body[body.length - 1]!;
    const arrive = cubic(b.gate.at, b.gate.out, last, unit(last, body[body.length - 2]!), 16).slice(0, -1);
    out.push(...arrive.reverse());
  }
  return out;
}
