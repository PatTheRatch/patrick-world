// Plain polygon and polyline helpers. World units, y down; nothing here cares which.

import type { Point } from '../world/types';
import type { Bounds, Polygon, Polyline } from './types';

/** Signed area by the shoelace formula. */
export function signedArea(poly: Polygon): number {
  let a = 0;
  for (let i = 0; i < poly.length; i++) {
    const p = poly[i] as Point;
    const q = poly[(i + 1) % poly.length] as Point;
    a += p.x * q.y - q.x * p.y;
  }
  return a / 2;
}

export function polygonArea(poly: Polygon): number {
  return Math.abs(signedArea(poly));
}

export function polygonCentroid(poly: Polygon): Point {
  let a = 0;
  let cx = 0;
  let cy = 0;
  for (let i = 0; i < poly.length; i++) {
    const p = poly[i] as Point;
    const q = poly[(i + 1) % poly.length] as Point;
    const f = p.x * q.y - q.x * p.y;
    a += f;
    cx += (p.x + q.x) * f;
    cy += (p.y + q.y) * f;
  }
  if (Math.abs(a) < 1e-9) {
    // Degenerate: fall back to the mean of the vertices.
    let sx = 0;
    let sy = 0;
    for (const p of poly) {
      sx += p.x;
      sy += p.y;
    }
    const n = Math.max(1, poly.length);
    return { x: sx / n, y: sy / n };
  }
  return { x: cx / (3 * a), y: cy / (3 * a) };
}

export function boundsOf(points: readonly Point[]): Bounds {
  if (points.length === 0) return { x: 0, y: 0, w: 0, h: 0 };
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const p of points) {
    if (p.x < x0) x0 = p.x;
    if (p.y < y0) y0 = p.y;
    if (p.x > x1) x1 = p.x;
    if (p.y > y1) y1 = p.y;
  }
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

export const polygonBounds = boundsOf;

/** Even-odd ray cast. Points exactly on an edge may land either way. */
export function pointInPolygon(p: Point, poly: Polygon): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i] as Point;
    const b = poly[j] as Point;
    if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) {
      inside = !inside;
    }
  }
  return inside;
}

/** Inside a convex polygon, counting points within `eps` of the boundary as inside. */
export function insideConvex(p: Point, poly: Polygon, eps = 1e-6): boolean {
  const sign = signedArea(poly) >= 0 ? 1 : -1;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i] as Point;
    const b = poly[(i + 1) % poly.length] as Point;
    const len = Math.hypot(b.x - a.x, b.y - a.y) || 1;
    const d = (sign * ((b.x - a.x) * (p.y - a.y) - (b.y - a.y) * (p.x - a.x))) / len;
    if (d < -eps) return false;
  }
  return true;
}

export function rotatePoint(p: Point, angle: number, about: Point = { x: 0, y: 0 }): Point {
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  const dx = p.x - about.x;
  const dy = p.y - about.y;
  return { x: about.x + dx * c - dy * s, y: about.y + dx * s + dy * c };
}

export function rotate(points: readonly Point[], angle: number, about?: Point): Point[] {
  return points.map((p) => rotatePoint(p, angle, about));
}

export function translate(points: readonly Point[], dx: number, dy: number): Point[] {
  return points.map((p) => ({ x: p.x + dx, y: p.y + dy }));
}

/**
 * Move every edge of a convex polygon inward by `d`. Returns an empty polygon if the
 * inset swallows it.
 */
export function insetConvex(poly: Polygon, d: number): Polygon {
  const n = poly.length;
  if (n < 3) return [];
  const sign = signedArea(poly) >= 0 ? 1 : -1;
  const lines: { px: number; py: number; dx: number; dy: number }[] = [];
  for (let i = 0; i < n; i++) {
    const a = poly[i] as Point;
    const b = poly[(i + 1) % n] as Point;
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    if (len < 1e-9) continue;
    const dx = (b.x - a.x) / len;
    const dy = (b.y - a.y) / len;
    // Inward normal: left of the edge for positive signed area.
    const nx = -dy * sign;
    const ny = dx * sign;
    lines.push({ px: a.x + nx * d, py: a.y + ny * d, dx, dy });
  }
  const out: Polygon = [];
  for (let i = 0; i < lines.length; i++) {
    const l1 = lines[(i + lines.length - 1) % lines.length] as (typeof lines)[number];
    const l2 = lines[i] as (typeof lines)[number];
    const den = l1.dx * l2.dy - l1.dy * l2.dx;
    if (Math.abs(den) < 1e-9) {
      out.push({ x: l2.px, y: l2.py });
      continue;
    }
    const t = ((l2.px - l1.px) * l2.dy - (l2.py - l1.py) * l2.dx) / den;
    out.push({ x: l1.px + l1.dx * t, y: l1.py + l1.dy * t });
  }
  // An over-inset polygon turns inside out.
  if (out.length < 3 || signedArea(out) * sign <= 0) return [];
  for (const p of out) if (!insideConvex(p, poly, 1e-6)) return [];
  return out;
}

/**
 * Separating-axis overlap test for two convex polygons. Polygons that only touch
 * (or interpenetrate by less than `eps`) do not count as overlapping.
 */
export function convexOverlap(a: Polygon, b: Polygon, eps = 1e-6): boolean {
  for (const poly of [a, b]) {
    for (let i = 0; i < poly.length; i++) {
      const p = poly[i] as Point;
      const q = poly[(i + 1) % poly.length] as Point;
      const len = Math.hypot(q.x - p.x, q.y - p.y);
      if (len < 1e-12) continue;
      const nx = -(q.y - p.y) / len;
      const ny = (q.x - p.x) / len;
      let a0 = Infinity;
      let a1 = -Infinity;
      for (const v of a) {
        const s = v.x * nx + v.y * ny;
        if (s < a0) a0 = s;
        if (s > a1) a1 = s;
      }
      let b0 = Infinity;
      let b1 = -Infinity;
      for (const v of b) {
        const s = v.x * nx + v.y * ny;
        if (s < b0) b0 = s;
        if (s > b1) b1 = s;
      }
      if (a1 - b0 <= eps || b1 - a0 <= eps) return false;
    }
  }
  return true;
}

/** True if segments ab and cd properly cross (shared endpoints and touching do not count). */
export function segmentsCross(a: Point, b: Point, c: Point, d: Point, eps = 1e-9): boolean {
  const o = (p: Point, q: Point, r: Point): number =>
    (q.x - p.x) * (r.y - p.y) - (q.y - p.y) * (r.x - p.x);
  const d1 = o(a, b, c);
  const d2 = o(a, b, d);
  const d3 = o(c, d, a);
  const d4 = o(c, d, b);
  return (
    ((d1 > eps && d2 < -eps) || (d1 < -eps && d2 > eps)) &&
    ((d3 > eps && d4 < -eps) || (d3 < -eps && d4 > eps))
  );
}

/** True if a polyline passes through the interior of a polygon. */
export function polylineCrossesPolygon(line: Polyline, poly: Polygon): boolean {
  for (let i = 0; i + 1 < line.length; i++) {
    const a = line[i] as Point;
    const b = line[i + 1] as Point;
    for (let k = 0; k < poly.length; k++) {
      const c = poly[k] as Point;
      const d = poly[(k + 1) % poly.length] as Point;
      if (segmentsCross(a, b, c, d)) return true;
    }
    const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    const centre = polygonCentroid(poly);
    // Nudge toward the centroid so a segment lying along an edge is not counted.
    const probe = { x: mid.x + (centre.x - mid.x) * 1e-6, y: mid.y + (centre.y - mid.y) * 1e-6 };
    if (pointInPolygon(probe, poly) && distanceToPolygonEdge(mid, poly) > 1e-6) return true;
  }
  return false;
}

export function distanceToSegment(p: Point, a: Point, b: Point): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const l2 = dx * dx + dy * dy;
  let t = l2 === 0 ? 0 : ((p.x - a.x) * dx + (p.y - a.y) * dy) / l2;
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  return Math.hypot(p.x - (a.x + dx * t), p.y - (a.y + dy * t));
}

export function distanceToPolygonEdge(p: Point, poly: Polygon): number {
  let best = Infinity;
  for (let i = 0; i < poly.length; i++) {
    const d = distanceToSegment(p, poly[i] as Point, poly[(i + 1) % poly.length] as Point);
    if (d < best) best = d;
  }
  return best;
}

export function distanceToPolyline(p: Point, line: Polyline): number {
  let best = Infinity;
  for (let i = 0; i + 1 < line.length; i++) {
    const d = distanceToSegment(p, line[i] as Point, line[i + 1] as Point);
    if (d < best) best = d;
  }
  return best;
}

export function polylineLength(line: Polyline): number {
  let len = 0;
  for (let i = 0; i + 1 < line.length; i++) {
    const a = line[i] as Point;
    const b = line[i + 1] as Point;
    len += Math.hypot(b.x - a.x, b.y - a.y);
  }
  return len;
}

/**
 * Chaikin corner cutting. Closed rings stay closed (no repeated last point expected);
 * open lines keep their two end points exactly.
 */
export function chaikin(points: readonly Point[], passes = 2, closed = false): Point[] {
  let pts: Point[] = points.slice();
  for (let pass = 0; pass < passes; pass++) {
    const n = pts.length;
    if (n < 3) return pts;
    const out: Point[] = [];
    if (closed) {
      for (let i = 0; i < n; i++) {
        const a = pts[i] as Point;
        const b = pts[(i + 1) % n] as Point;
        out.push({ x: a.x * 0.75 + b.x * 0.25, y: a.y * 0.75 + b.y * 0.25 });
        out.push({ x: a.x * 0.25 + b.x * 0.75, y: a.y * 0.25 + b.y * 0.75 });
      }
    } else {
      out.push(pts[0] as Point);
      for (let i = 0; i + 1 < n; i++) {
        const a = pts[i] as Point;
        const b = pts[i + 1] as Point;
        if (i > 0) out.push({ x: a.x * 0.75 + b.x * 0.25, y: a.y * 0.75 + b.y * 0.25 });
        if (i + 2 < n) out.push({ x: a.x * 0.25 + b.x * 0.75, y: a.y * 0.25 + b.y * 0.75 });
      }
      out.push(pts[n - 1] as Point);
    }
    pts = out;
  }
  return pts;
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

export function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

export function smoothstep(e0: number, e1: number, v: number): number {
  const t = clamp((v - e0) / (e1 - e0), 0, 1);
  return t * t * (3 - 2 * t);
}
