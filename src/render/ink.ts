// Drawing primitives shared by the territory and place layers.

import type { Polygon, Polyline } from '../plan/types';
import type { Point } from '../world/types';
import { INK, css, type RGB } from './palette';

export const SERIF = "'Besley', 'Clarendon', Georgia, serif";
export const GOTHIC = "'Archivo Variable', 'Archivo', 'Helvetica Neue', Arial, sans-serif";

export function addPolygon(path: Path2D, poly: Polygon) {
  const first = poly[0];
  if (!first) return;
  path.moveTo(first.x, first.y);
  for (let i = 1; i < poly.length; i++) {
    const p = poly[i]!;
    path.lineTo(p.x, p.y);
  }
  path.closePath();
}

export function addPolyline(path: Path2D, line: Polyline) {
  const first = line[0];
  if (!first) return;
  path.moveTo(first.x, first.y);
  for (let i = 1; i < line.length; i++) {
    const p = line[i]!;
    path.lineTo(p.x, p.y);
  }
}

/** The ground a building's shadow covers: its footprint swept along `d`. */
export function addShadow(path: Path2D, poly: Polygon, dx: number, dy: number) {
  const n = poly.length;
  for (let i = 0; i < n; i++) {
    const a = poly[i]!;
    const b = poly[(i + 1) % n]!;
    path.moveTo(a.x, a.y);
    path.lineTo(b.x, b.y);
    path.lineTo(b.x + dx, b.y + dy);
    path.lineTo(a.x + dx, a.y + dy);
    path.closePath();
  }
  const first = poly[0];
  if (!first) return;
  path.moveTo(first.x + dx, first.y + dy);
  for (let i = 1; i < n; i++) {
    const p = poly[i]!;
    path.lineTo(p.x + dx, p.y + dy);
  }
  path.closePath();
}

export function pointInPolygon(p: Point, poly: Polygon): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i]!;
    const b = poly[j]!;
    if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) {
      inside = !inside;
    }
  }
  return inside;
}

export function polygonBounds(polys: Polygon[]) {
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const poly of polys)
    for (const p of poly) {
      if (p.x < x0) x0 = p.x;
      if (p.y < y0) y0 = p.y;
      if (p.x > x1) x1 = p.x;
      if (p.y > y1) y1 = p.y;
    }
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

export function scaleAbout(poly: Polygon, c: Point, s: number): Polygon {
  return poly.map((p) => ({ x: c.x + (p.x - c.x) * s, y: c.y + (p.y - c.y) * s }));
}

export interface Lettering {
  family: string;
  size: number;
  weight?: number;
  italic?: boolean;
  /** Font width, 62–125. Archivo only. */
  stretch?: number;
  /** Letter spacing in em. */
  tracking?: number;
  color: RGB;
  alpha?: number;
  align?: CanvasTextAlign;
  baseline?: CanvasTextBaseline;
  /** Radians. */
  angle?: number;
  /** Knock the paper out behind the letters so they read over line work. */
  halo?: RGB | null;
  haloWidth?: number;
  haloAlpha?: number;
  upper?: boolean;
}

const STRETCH_WORDS: [number, CanvasFontStretch][] = [
  [68, 'extra-condensed'],
  [81, 'condensed'],
  [93, 'semi-condensed'],
  [106, 'normal'],
  [118, 'semi-expanded'],
  [999, 'expanded'],
];

export function setFont(ctx: CanvasRenderingContext2D, l: Lettering) {
  ctx.font = `${l.italic ? 'italic ' : ''}${l.weight ?? 400} ${l.size}px ${l.family}`;
  const stretch = l.stretch ?? 100;
  ctx.fontStretch = STRETCH_WORDS.find(([max]) => stretch < max)![1];
  ctx.letterSpacing = `${((l.tracking ?? 0) * l.size).toFixed(2)}px`;
}

export function measure(ctx: CanvasRenderingContext2D, text: string, l: Lettering): number {
  setFont(ctx, l);
  return ctx.measureText(l.upper ? text.toUpperCase() : text).width;
}

/** Letter text in screen space. The caller must have reset the transform to device pixels. */
export function letter(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, l: Lettering) {
  const t = l.upper ? text.toUpperCase() : text;
  setFont(ctx, l);
  ctx.textAlign = l.align ?? 'center';
  ctx.textBaseline = l.baseline ?? 'middle';
  ctx.save();
  ctx.translate(x, y);
  if (l.angle) ctx.rotate(l.angle);
  if (l.halo) {
    ctx.lineJoin = 'round';
    ctx.lineWidth = l.haloWidth ?? Math.max(2.5, l.size * 0.28);
    ctx.strokeStyle = css(l.halo, l.haloAlpha ?? 0.8);
    ctx.strokeText(t, 0, 0);
  }
  ctx.fillStyle = css(l.color, l.alpha ?? 1);
  ctx.fillText(t, 0, 0);
  ctx.restore();
}

/** Break a name into at most `maxLines` lines no wider than `maxWidth`. */
export function wrap(
  ctx: CanvasRenderingContext2D,
  text: string,
  l: Lettering,
  maxWidth: number,
  maxLines = 3,
): string[] {
  setFont(ctx, l);
  const words = (l.upper ? text.toUpperCase() : text).split(/\s+/);
  const lines: string[] = [];
  let line = '';
  for (const w of words) {
    const trial = line ? `${line} ${w}` : w;
    if (line && ctx.measureText(trial).width > maxWidth) {
      lines.push(line);
      line = w;
    } else line = trial;
  }
  if (line) lines.push(line);
  if (lines.length > maxLines) {
    const kept = lines.slice(0, maxLines);
    kept[maxLines - 1] = `${kept[maxLines - 1]}…`;
    return kept;
  }
  return lines;
}

/** A small generated paper tile: fibre, speckle and a little mottling. */
export function makePaper(base: RGB, seed = 7, size = 256): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d')!;
  g.fillStyle = css(base);
  g.fillRect(0, 0, size, size);
  let s = seed >>> 0;
  const r = () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  // Mottle: large soft blotches, drawn wrapped so the tile repeats cleanly.
  for (let i = 0; i < 26; i++) {
    const x = r() * size;
    const y = r() * size;
    const rad = 30 + r() * 70;
    const dark = r() < 0.5;
    for (const ox of [-size, 0, size])
      for (const oy of [-size, 0, size]) {
        const grad = g.createRadialGradient(x + ox, y + oy, 0, x + ox, y + oy, rad);
        grad.addColorStop(0, dark ? 'rgb(60 50 30 / 0.016)' : 'rgb(255 252 240 / 0.028)');
        grad.addColorStop(1, 'rgb(0 0 0 / 0)');
        g.fillStyle = grad;
        g.fillRect(x + ox - rad, y + oy - rad, rad * 2, rad * 2);
      }
  }
  // Fibres.
  g.lineWidth = 0.6;
  for (let i = 0; i < 520; i++) {
    const x = r() * size;
    const y = r() * size;
    const a = r() * Math.PI;
    const len = 3 + r() * 9;
    g.strokeStyle = r() < 0.55 ? `rgb(255 253 244 / ${0.1 + r() * 0.14})` : `rgb(70 60 40 / ${0.04 + r() * 0.06})`;
    g.beginPath();
    g.moveTo(x, y);
    g.lineTo(x + Math.cos(a) * len, y + Math.sin(a) * len);
    g.stroke();
  }
  // Speckle.
  for (let i = 0; i < 900; i++) {
    g.fillStyle = `rgb(50 42 30 / ${0.03 + r() * 0.07})`;
    g.fillRect(r() * size, r() * size, 1, 1);
  }
  return c;
}

export const paperTone = INK.linen;
