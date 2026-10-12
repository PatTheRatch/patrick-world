// Standalone SVG dumps of the plan geometry, for eyeballing. Not used by the app.

import type { Point } from '../world/types';
import type { CityPlan, Polygon, Polyline, RoadPlan, Terrain } from './types';

const f = (v: number): string => (Math.round(v * 10) / 10).toString();
const pts = (line: readonly Point[]): string => line.map((p) => `${f(p.x)},${f(p.y)}`).join(' ');
const polygon = (p: Polygon, attrs: string): string => `<polygon points="${pts(p)}" ${attrs}/>`;
const polyline = (p: Polyline, attrs: string): string => `<polyline points="${pts(p)}" fill="none" ${attrs}/>`;

export function citySvg(plan: CityPlan): string {
  const pad = 12;
  const b = plan.bounds;
  const out: string[] = [];
  // A square sheet: thumbnailers crop anything else.
  const vw = Math.max(b.w, b.h) + pad * 2;
  const vh = vw;
  // The view box starts at the origin and the drawing is shifted into it: some
  // rasterisers mishandle a view box with an offset.
  out.push(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${f(vw)} ${f(vh)}" width="1600" height="${f((1600 * vh) / vw)}">`,
  );
  out.push(`<rect width="${f(vw)}" height="${f(vh)}" fill="#f3ecd9"/>`);
  out.push(`<g transform="translate(${f((vw - b.w) / 2 - b.x)} ${f((vh - b.h) / 2 - b.y)})">`);
  for (const s of plan.streets) {
    out.push(polyline(s.line, `stroke="#fffaf0" stroke-width="${s.main ? 11 : 7}" stroke-linecap="butt"`));
  }
  for (const s of plan.streets) {
    out.push(polyline(s.line, `stroke="#b9ad92" stroke-width="0.3" stroke-dasharray="${s.main ? '3 1.5' : '1 1.5'}"`));
  }
  const palette = ['#e7d9b8', '#dfe3d2', '#e6d6cf', '#d9dfe6', '#e8e0c4', '#ddd3e0', '#d5e2dc'];
  const wardIndex = new Map<string, number>();
  for (const w of plan.wards) wardIndex.set(w.name, wardIndex.size);
  for (const bl of plan.blocks) {
    const fill = bl.ward === undefined ? '#ebe6da' : (palette[(wardIndex.get(bl.ward) ?? 0) % palette.length] as string);
    out.push(polygon(bl.outline, `fill="${fill}" stroke="#3a342a" stroke-width="0.35"`));
  }
  for (const lot of plan.lots) {
    out.push(polygon(lot.parcel, `fill="none" stroke="#6b6252" stroke-width="0.2"`));
    lot.footprint.forEach((fp, i) => {
      out.push(polygon(fp, `fill="${i === 0 ? '#c9836a' : '#d9b48f'}" stroke="#1d1a15" stroke-width="0.3"`));
    });
    out.push(`<circle cx="${f(lot.center.x)}" cy="${f(lot.center.y)}" r="0.5" fill="#1d1a15"/>`);
  }
  for (const d of plan.dwellings) out.push(polygon(d.footprint, `fill="#bdb39c" stroke="#1d1a15" stroke-width="0.25"`));
  for (const s of plan.streets) {
    if (!s.name) continue;
    const a = s.line[0] as Point;
    const z = s.line[s.line.length - 1] as Point;
    let deg = (Math.atan2(z.y - a.y, z.x - a.x) * 180) / Math.PI;
    if (deg > 90) deg -= 180;
    if (deg < -90) deg += 180;
    const mx = a.x + (z.x - a.x) * 0.3;
    const my = a.y + (z.y - a.y) * 0.3;
    out.push(
      `<text x="${f(mx)}" y="${f(my)}" font-family="sans-serif" font-size="3.4" letter-spacing="0.6" text-anchor="middle" dominant-baseline="middle" fill="#3a342a" transform="rotate(${f(deg)} ${f(mx)} ${f(my)})">${s.name.toUpperCase()}</text>`,
    );
  }
  for (const w of plan.wards) {
    out.push(
      `<text x="${f(w.labelAt.x)}" y="${f(w.labelAt.y)}" font-family="serif" font-style="italic" font-size="6" text-anchor="middle" fill="#1d1a15" fill-opacity="0.6" transform="rotate(${f((w.angle * 180) / Math.PI)} ${f(w.labelAt.x)} ${f(w.labelAt.y)})">${w.name} (${w.dominant})</text>`,
    );
  }
  out.push(`<circle cx="${f(plan.center.x)}" cy="${f(plan.center.y)}" r="1.4" fill="none" stroke="#b3261e" stroke-width="0.4"/>`);
  out.push('</g></svg>');
  return out.join('\n');
}

export function terrainSvg(
  t: Terrain,
  extra: { marks?: { at: Point; radius?: number; label?: string }[]; roads?: RoadPlan[] } = {},
): string {
  const { width, height } = t.size;
  const out: string[] = [];
  // A square sheet: thumbnailers crop anything else.
  const side = Math.max(width, height);
  out.push(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${side} ${side}" width="2400" height="2400">`);
  out.push(`<rect width="${side}" height="${side}" fill="#ffffff"/>`);
  out.push(`<g transform="translate(${f((side - width) / 2)} ${f((side - height) / 2)})">`);
  out.push(`<rect width="${width}" height="${height}" fill="#dfe6e4"/>`);
  t.shoals.forEach((ring, i) => {
    for (const line of ring) out.push(polyline(line, `stroke="#3d6b84" stroke-width="${f(1.6 - i * 0.4)}" stroke-opacity="${f(0.8 - i * 0.2)}"`));
  });
  for (const p of t.land) out.push(polygon(p, `fill="#f3ecd9" stroke="#1d1a15" stroke-width="2.2"`));
  for (const p of t.lakes) out.push(polygon(p, `fill="#cfdde0" stroke="#27536b" stroke-width="1.6"`));
  const h: string[] = [];
  for (const s of t.hachures) h.push(`M${f(s.a.x)} ${f(s.a.y)}L${f(s.b.x)} ${f(s.b.y)}`);
  out.push(`<path d="${h.join('')}" stroke="#5a4a36" stroke-width="1.1" fill="none"/>`);
  const w: string[] = [];
  for (const p of t.woods) w.push(`M${f(p.x - 3)} ${f(p.y)}a3 3 0 1 0 6 0a3 3 0 1 0 -6 0`);
  out.push(`<path d="${w.join('')}" stroke="#55724a" stroke-width="0.9" fill="none"/>`);
  for (const r of t.rivers) {
    out.push(polyline(r.line, `stroke="#27536b" stroke-width="${f(r.width)}" stroke-linecap="round" stroke-linejoin="round"`));
    const m = r.line[Math.floor(r.line.length / 2)] as Point;
    if (r.name) out.push(`<text x="${f(m.x + 10)}" y="${f(m.y)}" font-family="serif" font-style="italic" font-size="30" fill="#27536b">${r.name}</text>`);
  }
  for (const road of extra.roads ?? []) out.push(polyline(road.line, `stroke="#b3261e" stroke-width="3" stroke-dasharray="14 8"`));
  for (const m of extra.marks ?? []) {
    out.push(`<circle cx="${f(m.at.x)}" cy="${f(m.at.y)}" r="${f(m.radius ?? 12)}" fill="none" stroke="#b3261e" stroke-width="2" stroke-dasharray="10 10"/>`);
    out.push(`<circle cx="${f(m.at.x)}" cy="${f(m.at.y)}" r="6" fill="#b3261e"/>`);
    if (m.label) out.push(`<text x="${f(m.at.x + 14)}" y="${f(m.at.y - 10)}" font-family="sans-serif" font-size="34" fill="#b3261e">${m.label}</text>`);
  }
  out.push('</g></svg>');
  return out.join('\n');
}
