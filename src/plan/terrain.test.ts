import { describe, expect, it } from 'vitest';
import type { Point } from '../world/types';
import { pointInPolygon, polygonArea, polylineLength } from './geometry';
import { buildTerrain, RIVER_CLEARANCE, SEA_LEVEL } from './terrain';
import { TEST_CATALOGUE } from './testkit';

const SEED = 'patricks-world';
const { width: W, height: H } = TEST_CATALOGUE.size;

describe('buildTerrain', () => {
  // Best of three: the budget is for the work, not for whatever else the machine is doing.
  let terrain = buildTerrain(TEST_CATALOGUE, SEED);
  let elapsed = Infinity;
  const runs: number[] = [];
  for (let k = 0; k < 3; k++) {
    const t0 = performance.now();
    terrain = buildTerrain(TEST_CATALOGUE, SEED);
    runs.push(performance.now() - t0);
    elapsed = Math.min(elapsed, runs[k] as number);
  }

  it('runs in under 250 ms', () => {
    console.log(`buildTerrain: ${runs.map((t) => t.toFixed(0)).join(', ')} ms`);
    expect(elapsed).toBeLessThan(250);
  });

  it('is deterministic for a seed, and different for another', () => {
    const again = buildTerrain(TEST_CATALOGUE, SEED);
    expect(again.land).toEqual(terrain.land);
    expect(again.shoals).toEqual(terrain.shoals);
    expect(again.lakes).toEqual(terrain.lakes);
    expect(again.rivers).toEqual(terrain.rivers);
    expect(again.hachures).toEqual(terrain.hachures);
    expect(again.woods).toEqual(terrain.woods);
    const other = buildTerrain(TEST_CATALOGUE, 'another-world');
    expect(other.land).not.toEqual(terrain.land);
  });

  it('puts every region on land, out to 0.85 of its radius', () => {
    for (const seed of [SEED, 'another-world', 'third', 'a', 'b', 'c']) {
      const t = seed === SEED ? terrain : buildTerrain(TEST_CATALOGUE, seed);
      for (const reg of TEST_CATALOGUE.regions) {
        expect(t.isLand(reg.center)).toBe(true);
        expect(pointInPolygon(reg.center, t.land[0] as Point[]) || t.land.some((l) => pointInPolygon(reg.center, l))).toBe(true);
        for (let ring = 1; ring <= 5; ring++) {
          for (let k = 0; k < 48; k++) {
            const a = (k / 48) * Math.PI * 2;
            const d = reg.radius * 0.85 * (ring / 5);
            const p = { x: reg.center.x + Math.cos(a) * d, y: reg.center.y + Math.sin(a) * d };
            // Lakes keep away from centres but may sit in a region's outer half.
            const inLake = t.lakes.some((l) => pointInPolygon(p, l));
            if (!inLake) expect(t.heightAt(p)).toBeGreaterThanOrEqual(SEA_LEVEL - 0.02);
            // Within half the radius there is no water of any kind.
            if (d <= reg.radius * 0.5) expect(t.isLand(p)).toBe(true);
          }
        }
      }
    }
  });

  it('draws a coast: a main landmass first, water round the edge of the sheet', () => {
    expect(terrain.size).toEqual({ width: W, height: H });
    expect(terrain.land.length).toBeGreaterThanOrEqual(2);
    const areas = terrain.land.map(polygonArea);
    for (let i = 1; i < areas.length; i++) expect(areas[0] as number).toBeGreaterThanOrEqual(areas[i] as number);
    for (const a of areas) expect(a).toBeGreaterThanOrEqual(3000);
    const share = areas.reduce((s, a) => s + a, 0) / (W * H);
    expect(share).toBeGreaterThan(0.3);
    expect(share).toBeLessThan(0.75);
    // The outer few percent of the sheet is mostly sea.
    let wet = 0;
    let total = 0;
    for (let i = 0; i <= 200; i++) {
      const t = i / 200;
      for (const p of [
        { x: t * W, y: H * 0.03 },
        { x: t * W, y: H * 0.97 },
        { x: W * 0.03, y: t * H },
        { x: W * 0.97, y: t * H },
      ]) {
        total++;
        if (!terrain.isLand(p)) wet++;
      }
    }
    expect(wet / total).toBeGreaterThan(0.8);
    // Not a blob: the coast is a good deal longer than a circle of the same area.
    const main = terrain.land[0] as Point[];
    const perimeter = polylineLength([...main, main[0] as Point]);
    expect(perimeter).toBeGreaterThan(1.35 * 2 * Math.sqrt(Math.PI * (areas[0] as number)));
  });

  it('agrees with itself: heightAt, isLand and the outlines', () => {
    let checked = 0;
    for (let y = 60; y < H; y += 97) {
      for (let x = 60; x < W; x += 103) {
        const p = { x, y };
        const h = terrain.heightAt(p);
        expect(h).toBeGreaterThanOrEqual(0);
        expect(h).toBeLessThanOrEqual(1);
        expect(terrain.isLand(p)).toBe(h >= SEA_LEVEL);
        // Away from the shore the drawn outline and the field must say the same thing.
        if (Math.abs(h - SEA_LEVEL) < 0.03) continue;
        const inOutline = terrain.land.some((l) => pointInPolygon(p, l)) && !terrain.lakes.some((l) => pointInPolygon(p, l));
        expect(inOutline).toBe(h >= SEA_LEVEL);
        checked++;
      }
    }
    expect(checked).toBeGreaterThan(500);
  });

  it('lines the water with three shoal contours, nearest first', () => {
    expect(terrain.shoals).toHaveLength(3);
    let previous = SEA_LEVEL;
    for (const ring of terrain.shoals) {
      expect(ring.length).toBeGreaterThan(0);
      let sum = 0;
      let n = 0;
      for (const line of ring) {
        expect(line.length).toBeGreaterThan(8);
        for (const p of line) {
          sum += terrain.heightAt(p);
          n++;
        }
      }
      const mean = sum / n;
      expect(mean).toBeLessThan(previous);
      previous = mean;
    }
  });

  it('has two to four lakes, inland', () => {
    expect(terrain.lakes.length).toBeGreaterThanOrEqual(2);
    expect(terrain.lakes.length).toBeLessThanOrEqual(4);
    for (const lake of terrain.lakes) {
      expect(polygonArea(lake)).toBeGreaterThan(1200);
      expect(terrain.land.some((l) => pointInPolygon(lake[0] as Point, l))).toBe(true);
    }
  });

  it('runs four to seven rivers downhill to water, clear of region centres', () => {
    expect(terrain.rivers.length).toBeGreaterThanOrEqual(4);
    expect(terrain.rivers.length).toBeLessThanOrEqual(7);
    expect(terrain.rivers.filter((r) => r.name !== undefined).length).toBeGreaterThanOrEqual(3);
    for (const river of terrain.rivers) {
      const line = river.line;
      const source = line[0] as Point;
      const mouth = line[line.length - 1] as Point;
      expect(river.width).toBeGreaterThanOrEqual(3);
      expect(river.width).toBeLessThanOrEqual(8);
      expect(polylineLength(line)).toBeGreaterThan(250);
      expect(terrain.isLand(source)).toBe(true);
      expect(terrain.isLand(mouth)).toBe(false);
      expect(terrain.heightAt(source)).toBeGreaterThan(terrain.heightAt(mouth) + 0.03);
      // Downhill on the whole: no long climb anywhere along the course.
      let lowest = Infinity;
      let worstClimb = 0;
      for (const p of line) {
        const h = terrain.heightAt(p);
        if (h < lowest) lowest = h;
        worstClimb = Math.max(worstClimb, h - lowest);
        for (const reg of TEST_CATALOGUE.regions) {
          expect(Math.hypot(p.x - reg.center.x, p.y - reg.center.y)).toBeGreaterThanOrEqual(RIVER_CLEARANCE);
        }
      }
      expect(worstClimb).toBeLessThan(0.06);
      // Not ruled with a straight-edge.
      expect(polylineLength(line)).toBeGreaterThan(1.08 * Math.hypot(mouth.x - source.x, mouth.y - source.y));
    }
  });

  it('hachures the steep ground only, on land, pointing downhill', () => {
    console.log(`hachures ${terrain.hachures.length}, woods ${terrain.woods.length}, rivers ${terrain.rivers.length}, lakes ${terrain.lakes.length}`);
    expect(terrain.hachures.length).toBeGreaterThanOrEqual(6000);
    expect(terrain.hachures.length).toBeLessThanOrEqual(12000);
    let downhill = 0;
    for (const s of terrain.hachures) {
      const len = Math.hypot(s.b.x - s.a.x, s.b.y - s.a.y);
      expect(len).toBeGreaterThanOrEqual(5.8);
      expect(len).toBeLessThanOrEqual(16.2);
      expect(terrain.isLand(s.a)).toBe(true);
      expect(terrain.isLand(s.b)).toBe(true);
      if (terrain.heightAt(s.b) < terrain.heightAt(s.a)) downhill++;
    }
    expect(downhill / terrain.hachures.length).toBeGreaterThan(0.97);
  });

  it('scatters woods on land in clumps', () => {
    expect(terrain.woods.length).toBeGreaterThanOrEqual(1500);
    expect(terrain.woods.length).toBeLessThanOrEqual(3000);
    for (const p of terrain.woods) expect(terrain.isLand(p)).toBe(true);
    // Clumped: far more cells of a coarse grid are empty than an even scatter would leave.
    const cells = new Set<string>();
    for (const p of terrain.woods) cells.add(`${Math.floor(p.x / 100)},${Math.floor(p.y / 100)}`);
    expect(cells.size).toBeLessThan(700);
  });

  it('keeps its counts in range for other seeds too', () => {
    for (const seed of ['another-world', 'third', 'a', 'b', 'c']) {
      const t = buildTerrain(TEST_CATALOGUE, seed);
      expect(t.rivers.length, seed).toBeGreaterThanOrEqual(4);
      expect(t.rivers.length, seed).toBeLessThanOrEqual(7);
      expect(t.lakes.length, seed).toBeGreaterThanOrEqual(2);
      expect(t.lakes.length, seed).toBeLessThanOrEqual(4);
      expect(t.hachures.length, seed).toBeGreaterThanOrEqual(6000);
      expect(t.hachures.length, seed).toBeLessThanOrEqual(12000);
      expect(t.woods.length, seed).toBeGreaterThanOrEqual(1500);
      expect(t.woods.length, seed).toBeLessThanOrEqual(3000);
      for (const r of t.rivers) expect(t.isLand(r.line[r.line.length - 1] as Point), seed).toBe(false);
    }
  });
});
