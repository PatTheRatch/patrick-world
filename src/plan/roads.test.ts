import { describe, expect, it } from 'vitest';
import type { Point } from '../world/types';
import { distanceToSegment, polylineLength } from './geometry';
import { joinRoad, planRoads, townGate } from './roads';
import { planCity } from './settlement';
import { buildTerrain } from './terrain';
import { makeLink, makePlace, TEST_CATALOGUE } from './testkit';

const terrain = buildTerrain(TEST_CATALOGUE, 'patricks-world');
const places = [
  makePlace(3, { id: 'alder', position: { x: 1500, y: 1250 } }),
  makePlace(8, { id: 'brine', position: { x: 3050, y: 1150 } }),
  makePlace(1, { id: 'corvid', position: { x: 1900, y: 2300 } }),
  makePlace(20, { id: 'dunmore', position: { x: 3350, y: 2250 } }),
  makePlace(2, { id: 'esk', position: { x: 1650, y: 1420 } }),
];
const links = [
  makeLink('alder~brine', 'alder', 'brine'),
  makeLink('alder~corvid', 'alder', 'corvid'),
  makeLink('brine~dunmore', 'brine', 'dunmore'),
  makeLink('corvid~dunmore', 'corvid', 'dunmore'),
  makeLink('alder~esk', 'alder', 'esk'),
  makeLink('alder~dunmore', 'alder', 'dunmore'),
];

describe('planRoads', () => {
  const roads = planRoads(links, places, terrain);

  it('plans one route per link, from place to place', () => {
    expect(roads.map((r) => r.link)).toEqual(links.map((l) => l.id));
    for (const road of roads) {
      const link = links.find((l) => l.id === road.link);
      const a = places.find((p) => p.id === link?.a)?.position as Point;
      const b = places.find((p) => p.id === link?.b)?.position as Point;
      expect(road.line[0]).toEqual(a);
      expect(road.line[road.line.length - 1]).toEqual(b);
      expect(road.line.length).toBeGreaterThanOrEqual(25);
      expect(road.line.length).toBeLessThanOrEqual(41);
      expect(road.length).toBeCloseTo(polylineLength(road.line), 1);
    }
  });

  it('curves gently: bowed, never straight, never wild', () => {
    for (const road of roads) {
      const a = road.line[0] as Point;
      const b = road.line[road.line.length - 1] as Point;
      const direct = Math.hypot(b.x - a.x, b.y - a.y);
      let off = 0;
      for (const p of road.line) off = Math.max(off, distanceToSegment(p, a, b));
      expect(off / direct).toBeGreaterThan(0.025);
      expect(off / direct).toBeLessThan(0.24);
      expect(road.length).toBeGreaterThan(direct * 1.002);
      expect(road.length).toBeLessThan(direct * 1.2);
      // No kinks: consecutive segments never turn sharply.
      for (let i = 1; i + 1 < road.line.length; i++) {
        const p = road.line[i - 1] as Point;
        const q = road.line[i] as Point;
        const r = road.line[i + 1] as Point;
        const turn = Math.abs(
          Math.atan2(
            (q.x - p.x) * (r.y - q.y) - (q.y - p.y) * (r.x - q.x),
            (q.x - p.x) * (r.x - q.x) + (q.y - p.y) * (r.y - q.y),
          ),
        );
        expect(turn).toBeLessThan(0.2);
      }
    }
  });

  it('does not change when other links or places come and go', () => {
    const alone = planRoads([links[2] as (typeof links)[number]], places, terrain);
    expect(alone[0]).toEqual(roads[2]);
    const reversed = planRoads(links.slice().reverse(), places.slice().reverse(), terrain);
    for (const road of roads) expect(reversed.find((r) => r.link === road.link)).toEqual(road);
    // A place growing does not move its roads either.
    const grown = places.map((p) => makePlace(p.features.length + 9, { id: p.id, position: p.position, users: 5000 }));
    expect(planRoads(links, grown, terrain)).toEqual(roads);
  });

  it('is deterministic and skips links to places it does not know', () => {
    expect(planRoads(links, places, terrain)).toEqual(roads);
    expect(planRoads([makeLink('alder~nowhere', 'alder', 'nowhere')], places, terrain)).toEqual([]);
  });

  it('keeps to dry land where a plain alternative exists', () => {
    for (const road of roads) {
      let wet = 0;
      for (const p of road.line) if (!terrain.isLand(p)) wet++;
      expect(wet / road.line.length).toBeLessThan(0.25);
    }
  });
});

describe('a road comes into a town by one of its streets', () => {
  const town = makePlace(20, { id: 'dunmore', position: { x: 3350, y: 2250 } });
  const plan = planCity(town);
  const ends = plan.streets.filter((s) => s.main).map((s) => s.line[s.line.length - 1] as Point);

  it('picks the end of a main street facing the way the road comes from', () => {
    for (let i = 0; i < 12; i++) {
      const bearing = (i / 12) * Math.PI * 2;
      const from = { x: plan.center.x + Math.cos(bearing) * 900, y: plan.center.y + Math.sin(bearing) * 900 };
      const gate = townGate(plan, from);
      if (!gate) continue;
      expect(ends.some((e) => e.x === gate.at.x && e.y === gate.at.y)).toBe(true);
      // It faces the traveller: never a street on the far side of town.
      const dot = (gate.at.x - plan.center.x) * Math.cos(bearing) + (gate.at.y - plan.center.y) * Math.sin(bearing);
      expect(dot).toBeGreaterThan(-Math.hypot(gate.at.x - plan.center.x, gate.at.y - plan.center.y) * 0.2);
      expect(Math.hypot(gate.out.x, gate.out.y)).toBeCloseTo(1, 6);
      // And the road bends round to it without a kink, wherever it comes from.
      const far = Array.from({ length: 30 }, (_, n) => ({ x: from.x + ((plan.center.x - from.x) * n) / 29, y: from.y + ((plan.center.y - from.y) * n) / 29 }));
      const drawn = joinRoad(far, { center: from, reach: 10 }, { center: plan.center, reach: 20, gate });
      for (let n = 1; n + 1 < drawn.length; n++) {
        const p = drawn[n - 1]!;
        const q = drawn[n]!;
        const r = drawn[n + 1]!;
        expect(Math.abs(Math.atan2((q.x - p.x) * (r.y - q.y) - (q.y - p.y) * (r.x - q.x), (q.x - p.x) * (r.x - q.x) + (q.y - p.y) * (r.y - q.y)))).toBeLessThan(0.6);
      }
    }
    // Every town with streets can be reached from somewhere.
    expect(ends.length).toBeGreaterThan(1);
  });

  it('has no gate where nothing is built', () => {
    const base = makePlace(3, { id: 'esk' });
    expect(townGate(planCity({ ...base, features: base.features.map((f) => ({ ...f, stage: 'concept' as const })) }), { x: 0, y: 0 })).toBeNull();
  });

  it('leaves the open route alone and only bends the last stretch', () => {
    const from = { x: plan.center.x + 900, y: plan.center.y };
    const route = Array.from({ length: 30 }, (_, n) => ({ x: from.x + ((plan.center.x - from.x) * n) / 29, y: from.y + ((plan.center.y - from.y) * n) / 29 }));
    const gate = townGate(plan, from)!;
    const drawn = joinRoad(route, { center: from, reach: 40 }, { center: plan.center, reach: 20, gate });
    expect(drawn[drawn.length - 1]).toEqual(gate.at);
    // It stops at the limits of the town with no gate, and the middle of the route is the surveyed line.
    expect(Math.hypot(drawn[0]!.x - from.x, drawn[0]!.y - from.y)).toBeGreaterThan(40);
    expect(drawn).toContainEqual(route[15]);
    // A street built further out moves the last stretch and nothing else.
    const further = { at: { x: gate.at.x + gate.out.x * 30, y: gate.at.y + gate.out.y * 30 }, out: gate.out };
    const later = joinRoad(route, { center: from, reach: 40 }, { center: plan.center, reach: 20, gate: further });
    expect(later.slice(0, 12)).toEqual(drawn.slice(0, 12));
  });

  it('still draws something between two towns that stand side by side', () => {
    const near = { x: town.position.x + 60, y: town.position.y + 10 };
    const drawn = joinRoad([town.position, near], { center: town.position, reach: 40, gate: townGate(plan, near) }, { center: near, reach: 40 });
    expect(drawn.length).toBeGreaterThan(2);
  });
});
