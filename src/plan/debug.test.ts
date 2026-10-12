import { describe, expect, it } from 'vitest';
import { planCity } from './city';
import { citySvg, terrainSvg } from './debug-svg';
import { polygonArea } from './geometry';
import { planRoads } from './roads';
import { buildTerrain } from './terrain';
import { builtSpan, makeLink, makePlace, TEST_CATALOGUE } from './testkit';

const OUT =
  '/private/tmp/claude-501/-Users-patrickmcdowell-patrick-world/e8237587-a165-4466-ad9f-27806079adc7/scratchpad/plan-debug';

interface Fs {
  mkdirSync(path: string, opts: { recursive: boolean }): void;
  writeFileSync(path: string, data: string): void;
}

describe('debug renders', () => {
  it('writes SVGs of two cities and the terrain for eyeballing', async () => {
    // Loaded by name at run time: the project carries no Node typings.
    const fsModule = 'node:fs';
    const fs = (await import(/* @vite-ignore */ fsModule)) as Fs;
    fs.mkdirSync(OUT, { recursive: true });

    const small = citySvg(planCity(makePlace(5, { wards: ['Market', 'Foundry'], users: 12 })));
    const mid = citySvg(planCity(makePlace(15, { users: 40 })));
    const large = citySvg(planCity(makePlace(30, { users: 900 })));
    fs.writeFileSync(`${OUT}/city-5.svg`, small);
    fs.writeFileSync(`${OUT}/city-15.svg`, mid);
    fs.writeFileSync(`${OUT}/city-30.svg`, large);

    // Timed cold, as the app will first run it.
    const t0 = performance.now();
    const terrain = buildTerrain(TEST_CATALOGUE, 'patricks-world');
    const ms = performance.now() - t0;
    const t1 = performance.now();
    buildTerrain(TEST_CATALOGUE, 'patricks-world');
    const warm = performance.now() - t1;
    const stats: string[] = [];
    stats.push(
      `terrain: ${ms.toFixed(0)} ms cold, ${warm.toFixed(0)} ms warm, land ${terrain.land.length} lakes ${terrain.lakes.length} rivers ${terrain.rivers.length} ` +
        `hachures ${terrain.hachures.length} woods ${terrain.woods.length} shoals ${terrain.shoals.map((s) => s.length).join('/')}`,
    );
    const cover = (plan: ReturnType<typeof planCity>): number =>
      plan.lots.reduce((sum, l) => sum + polygonArea(l.footprint[0] ?? []) / polygonArea(l.parcel), 0) / plan.lots.length;
    for (const id of ['testport', 'alder', 'brine', 'corvid', 'dunmore', 'esk']) {
      for (const n of [5, 15, 30]) {
        const plan = planCity(makePlace(n, { id }));
        const lotArea = plan.lots.reduce((sum, l) => sum + polygonArea(l.parcel), 0);
        const blockArea = plan.blocks.reduce((sum, b) => sum + polygonArea(b.outline), 0);
        stats.push(
          `${id} ${n}: blocks ${plan.blocks.length} built ${builtSpan(plan).toFixed(0)} across ${(plan.radius * 2).toFixed(0)} ` +
            `coverage ${(cover(plan) * 100).toFixed(0)}% blockfill ${((lotArea / blockArea) * 100).toFixed(0)}%`,
        );
      }
    }
    for (const wards of [['Market'], ['Market', 'Foundry'], ['Market', 'Foundry', 'Cistern']]) {
      const plan = planCity(makePlace(5, { wards }));
      stats.push(`5 features in ${wards.length} ward(s): blocks ${plan.blocks.length} built ${builtSpan(plan).toFixed(0)} across ${(plan.radius * 2).toFixed(0)}`);
    }
    // Do the relief strokes near a region centre point along its radii? An even spread
    // of directions gives a mean |cos| of 2/pi = 0.64; a sunburst gives nearly 1.
    for (const reg of TEST_CATALOGUE.regions) {
      for (const [lo, hi] of [[0, 0.25], [0.25, 0.5], [0.5, 0.9]] as const) {
        let sum = 0;
        let n = 0;
        for (const h of terrain.hachures) {
          const rx = h.a.x - reg.center.x;
          const ry = h.a.y - reg.center.y;
          const d = Math.hypot(rx, ry);
          if (d < lo * reg.radius || d >= hi * reg.radius || d < 1) continue;
          const sx = h.b.x - h.a.x;
          const sy = h.b.y - h.a.y;
          sum += Math.abs(rx * sx + ry * sy) / (d * Math.hypot(sx, sy));
          n++;
        }
        const area = Math.PI * reg.radius * reg.radius * (hi * hi - lo * lo);
        stats.push(`${reg.id} ${lo}-${hi}r: ${n} strokes, ${((n / area) * 1e4).toFixed(2)} per 100x100, radial ${(sum / Math.max(1, n)).toFixed(2)}`);
      }
    }
    console.log(stats.join('\n'));
    fs.writeFileSync(`${OUT}/stats.txt`, stats.join('\n'));
    const places = TEST_CATALOGUE.regions.map((r) => makePlace(1, { id: r.id, position: r.center }));
    const ids = places.map((p) => p.id);
    const links = [];
    for (let i = 0; i < ids.length; i++) {
      for (let j = i + 1; j < ids.length; j++) {
        links.push(makeLink(`${ids[i]}~${ids[j]}`, ids[i] as string, ids[j] as string));
      }
    }
    const svg = terrainSvg(terrain, {
      marks: TEST_CATALOGUE.regions.map((r) => ({ at: r.center, radius: r.radius, label: r.name })),
      roads: planRoads(links, places, terrain),
    });
    fs.writeFileSync(`${OUT}/terrain.svg`, svg);

    for (const s of [small, mid, large, svg]) {
      expect(s.startsWith('<svg')).toBe(true);
      expect(s.endsWith('</svg>')).toBe(true);
    }
  });
});
