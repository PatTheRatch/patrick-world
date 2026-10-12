import { describe, expect, it } from 'vitest';
import { planCity } from './city';
import { citySvg, terrainSvg } from './debug-svg';
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

    const small = citySvg(planCity(makePlace(5, { wards: ['Market', 'Foundry'] })));
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
    for (const id of ['testport', 'alder', 'brine', 'corvid', 'dunmore', 'esk']) {
      for (const n of [5, 15, 30]) {
        const plan = planCity(makePlace(n, { id }));
        stats.push(
          `${id} ${n}: built ${builtSpan(plan).toFixed(0)} across ${(plan.radius * 2).toFixed(0)} bounds ${plan.bounds.w.toFixed(0)}x${plan.bounds.h.toFixed(0)} blocks ${plan.blocks.length} streets ${plan.streets.length}`,
        );
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
