import { describe, expect, it } from 'vitest';
import type { Point } from '../world/types';
import { planCity } from './city';
import {
  convexOverlap,
  distanceToPolygonEdge,
  distanceToSegment,
  insideConvex,
  pointInPolygon,
  polygonArea,
  polygonCentroid,
  polylineCrossesPolygon,
} from './geometry';
import { builtSpan, makePlace } from './testkit';
import type { CityPlan, Lot, Polygon, Street } from './types';

const FULL = makePlace(30);

/** The same place at an earlier date: a prefix of its features, less far along. */
function earlier(n: number) {
  const p = makePlace(30);
  p.features = p.features.slice(0, n).map((f) => ({ ...f, stage: 'planned' as const, storeys: 1 }));
  p.users = 0;
  p.rank = 'site';
  return p;
}

const lotOf = (plan: CityPlan, feature: string): Lot => {
  const lot = plan.lots.find((l) => l.feature === feature);
  if (!lot) throw new Error(`no lot for ${feature}`);
  return lot;
};

/** True if `inner` lies along one of `outer`'s streets, with the same standing and name. */
function streetWithin(inner: Street, outer: Street[]): boolean {
  return outer.some((o) => {
    if (o.main !== inner.main || o.name !== inner.name) return false;
    const a = o.line[0] as Point;
    const b = o.line[o.line.length - 1] as Point;
    return inner.line.every((p) => distanceToSegment(p, a, b) < 1e-3);
  });
}

describe('planCity: stability through time', () => {
  const full = planCity(FULL);

  it('places 30 features in six named wards', () => {
    expect(full.lots).toHaveLength(30);
    expect(full.wards.map((w) => w.name).sort()).toEqual(
      ['Archive', 'Cistern', 'Foundry', 'Lantern', 'Market', 'Quay'].sort(),
    );
  });

  for (const n of [1, 5, 12, 20, 30]) {
    it(`the first ${n} features stand exactly where they stand in the full city`, () => {
      const small = planCity(earlier(n));
      expect(small.lots).toHaveLength(n);
      expect(small.angle).toBe(full.angle);
      for (const lot of small.lots) {
        const later = lotOf(full, lot.feature);
        expect(lot.parcel).toEqual(later.parcel);
        expect(lot.footprint[0]).toEqual(later.footprint[0]);
        expect(lot.center).toEqual(later.center);
        expect(small.blocks[lot.block]).toEqual(full.blocks[later.block]);
      }
      // Blocks are claimed in the same order, so the earlier list is a prefix.
      expect(full.blocks.slice(0, small.blocks.length)).toEqual(small.blocks);
      for (const s of small.streets) expect(streetWithin(s, full.streets)).toBe(true);
    });
  }

  it('ignores stage, storeys, rank and users for parcels and main masses', () => {
    const changed = makePlace(30);
    changed.rank = 'major';
    changed.users = 50000;
    changed.features = changed.features.map((f, i) => ({
      ...f,
      stage: i % 2 === 0 ? ('mature' as const) : ('concept' as const),
      storeys: 1 + ((i * 7) % 9),
      commits: 999,
      heat: 1,
    }));
    const plan = planCity(changed);
    expect(plan.blocks).toEqual(full.blocks);
    expect(plan.streets).toEqual(full.streets);
    expect(plan.wards).toEqual(full.wards);
    for (const lot of plan.lots) {
      const base = lotOf(full, lot.feature);
      expect(lot.parcel).toEqual(base.parcel);
      expect(lot.footprint[0]).toEqual(base.footprint[0]);
    }
  });

  it('adds annexes with maturity and never moves one', () => {
    const young = makePlace(30);
    young.features = young.features.map((f) => ({ ...f, stage: 'working' as const, storeys: 2 }));
    const mid = makePlace(30);
    mid.features = mid.features.map((f) => ({ ...f, stage: 'working' as const, storeys: 5 }));
    const old = makePlace(30);
    old.features = old.features.map((f) => ({ ...f, stage: 'mature' as const, storeys: 9 }));
    const a = planCity(young);
    const b = planCity(mid);
    const c = planCity(old);
    let grew = 0;
    for (const lot of a.lots) {
      expect(lot.footprint).toHaveLength(1);
      const m = lotOf(b, lot.feature);
      const o = lotOf(c, lot.feature);
      expect(m.footprint.length).toBeLessThanOrEqual(3);
      expect(o.footprint.length).toBeGreaterThanOrEqual(m.footprint.length);
      expect(o.footprint.length).toBeLessThanOrEqual(3);
      // What was there stays; maturity only appends.
      expect(m.footprint.slice(0, 1)).toEqual(lot.footprint);
      expect(o.footprint.slice(0, m.footprint.length)).toEqual(m.footprint);
      if (o.footprint.length > 1) grew++;
    }
    expect(grew).toBeGreaterThan(20);
  });

  it('is deterministic', () => {
    expect(planCity(makePlace(30, { users: 400 }))).toEqual(planCity(makePlace(30, { users: 400 })));
  });

  it('does not depend on the order features are listed in', () => {
    const shuffled = makePlace(30);
    shuffled.features = shuffled.features.slice().reverse();
    expect(planCity(shuffled)).toEqual(full);
  });
});

describe('planCity: a plausible plan', () => {
  const places = ['testport', 'alder', 'brine', 'corvid', 'dunmore', 'esk'].map((id) => {
    const p = makePlace(30, { id, users: 2500, position: { x: 900, y: 700 } });
    p.features = p.features.map((f) => ({ ...f, stage: 'mature' as const, storeys: 8 }));
    return p;
  });
  const plans = places.map(planCity);

  it('never overlaps two parcels', () => {
    for (const plan of plans) {
      for (let i = 0; i < plan.lots.length; i++) {
        for (let j = i + 1; j < plan.lots.length; j++) {
          const a = (plan.lots[i] as Lot).parcel;
          const b = (plan.lots[j] as Lot).parcel;
          expect(convexOverlap(a, b, 1e-3)).toBe(false);
        }
      }
    }
  });

  it('keeps every parcel inside its block, and every building inside its parcel with a yard', () => {
    for (const plan of plans) {
      for (const lot of plan.lots) {
        const block = plan.blocks[lot.block];
        expect(block).toBeDefined();
        for (const p of lot.parcel) expect(insideConvex(p, (block as { outline: Polygon }).outline, 2e-3)).toBe(true);
        expect(lot.footprint.length).toBeGreaterThanOrEqual(1);
        for (const poly of lot.footprint) {
          expect(poly.length).toBeGreaterThanOrEqual(4);
          expect(poly.length).toBeLessThanOrEqual(8);
          for (const p of poly) expect(insideConvex(p, lot.parcel, 2e-3)).toBe(true);
        }
        const main = lot.footprint[0] as Polygon;
        expect(polygonArea(main)).toBeLessThan(polygonArea(lot.parcel) * 0.82);
        expect(polygonArea(main)).toBeGreaterThan(polygonArea(lot.parcel) * 0.1);
        expect(pointInPolygon(lot.center, main)).toBe(true);
      }
    }
  });

  it('keeps annexes out of the main mass and out of each other', () => {
    for (const plan of plans) {
      for (const lot of plan.lots) {
        const [main, ...annexes] = lot.footprint as [Polygon, ...Polygon[]];
        for (const annex of annexes) {
          const c = polygonCentroid(annex);
          expect(pointInPolygon(c, main)).toBe(false);
          // No corner of either pokes into the other's interior.
          for (const p of annex) {
            expect(pointInPolygon(p, main) && distanceToPolygonEdge(p, main) > 1e-2).toBe(false);
          }
          for (const p of main) {
            expect(pointInPolygon(p, annex) && distanceToPolygonEdge(p, annex) > 1e-2).toBe(false);
          }
        }
        if (annexes.length === 2) {
          expect(convexOverlap(annexes[0] as Polygon, annexes[1] as Polygon, 1e-3)).toBe(false);
        }
      }
    }
  });

  it('runs no street centre-line through a parcel or a block', () => {
    for (const plan of plans) {
      expect(plan.streets.length).toBeGreaterThan(0);
      for (const s of plan.streets) {
        for (const lot of plan.lots) expect(polylineCrossesPolygon(s.line, lot.parcel)).toBe(false);
        for (const b of plan.blocks) {
          expect(polylineCrossesPolygon(s.line, b.outline)).toBe(false);
          // Half a street width, at least, between the line and any block.
          for (const p of b.outline) {
            expect(distanceToSegment(p, s.line[0] as Point, s.line[1] as Point)).toBeGreaterThan(3.4);
          }
        }
      }
    }
  });

  it('never overlaps two blocks, and gives each a ward that exists', () => {
    for (const plan of plans) {
      const names = new Set(plan.wards.map((w) => w.name));
      for (let i = 0; i < plan.blocks.length; i++) {
        const a = plan.blocks[i] as { outline: Polygon; ward?: string };
        if (a.ward !== undefined) expect(names.has(a.ward)).toBe(true);
        for (let j = i + 1; j < plan.blocks.length; j++) {
          expect(convexOverlap(a.outline, (plan.blocks[j] as { outline: Polygon }).outline, 1e-3)).toBe(false);
        }
      }
    }
  });

  it('names main streets, uniquely, and letters wards the right way up', () => {
    for (const plan of plans) {
      const mains = plan.streets.filter((s) => s.main);
      expect(mains.length).toBeGreaterThan(0);
      for (const s of mains) expect(s.name).toMatch(/ (St|Ave)$/);
      for (const s of plan.streets.filter((x) => !x.main)) expect(s.name).toBeUndefined();
      for (const w of plan.wards) {
        expect(w.angle).toBeGreaterThanOrEqual(-Math.PI / 2);
        expect(w.angle).toBeLessThanOrEqual(Math.PI / 2);
      }
    }
  });

  it('houses the measured users on the fringe, clear of everything built', () => {
    for (const plan of plans) {
      expect(plan.dwellings).toHaveLength(Math.round(7 * Math.log10(2501)));
      for (const d of plan.dwellings) {
        for (const b of plan.blocks) expect(convexOverlap(d.footprint, b.outline)).toBe(false);
        const c = polygonCentroid(d.footprint);
        for (const b of plan.blocks) expect(distanceToPolygonEdge(c, b.outline)).toBeGreaterThan(30);
      }
      for (let i = 0; i < plan.dwellings.length; i++) {
        for (let j = i + 1; j < plan.dwellings.length; j++) {
          const a = (plan.dwellings[i] as { footprint: Polygon }).footprint;
          const b = (plan.dwellings[j] as { footprint: Polygon }).footprint;
          expect(convexOverlap(a, b)).toBe(false);
        }
      }
    }
    const few = planCity(makePlace(30, { users: 30 }));
    const many = planCity(makePlace(30, { users: 30000 }));
    // Dwelling k is always the same house.
    expect(many.dwellings.slice(0, few.dwellings.length)).toEqual(few.dwellings);
    expect(planCity(makePlace(30, { users: 1e12 })).dwellings).toHaveLength(60);
    expect(planCity(makePlace(30, { users: 0 })).dwellings).toHaveLength(0);
  });

  it('encloses everything in its radius and bounds', () => {
    for (const plan of plans) {
      const pts: Point[] = [
        ...plan.blocks.flatMap((b) => b.outline),
        ...plan.streets.flatMap((s) => s.line),
        ...plan.lots.flatMap((l) => l.parcel),
        ...plan.dwellings.flatMap((d) => d.footprint),
        ...plan.wards.map((w) => w.labelAt),
      ];
      for (const p of pts) {
        expect(Math.hypot(p.x - plan.center.x, p.y - plan.center.y)).toBeLessThanOrEqual(plan.radius + 1e-2);
        expect(p.x).toBeGreaterThanOrEqual(plan.bounds.x - 1e-2);
        expect(p.y).toBeGreaterThanOrEqual(plan.bounds.y - 1e-2);
        expect(p.x).toBeLessThanOrEqual(plan.bounds.x + plan.bounds.w + 1e-2);
        expect(p.y).toBeLessThanOrEqual(plan.bounds.y + plan.bounds.h + 1e-2);
      }
    }
  });
});

describe('planCity: sizes', () => {
  it('returns a valid empty plan for a place with no features', () => {
    const plan = planCity(makePlace(0, { users: 900, position: { x: 40, y: 50 } }));
    expect(plan.lots).toEqual([]);
    expect(plan.blocks).toEqual([]);
    expect(plan.streets).toEqual([]);
    expect(plan.wards).toEqual([]);
    expect(plan.dwellings).toEqual([]);
    expect(plan.radius).toBe(10);
    expect(plan.bounds).toEqual({ x: 30, y: 40, w: 20, h: 20 });
    expect(plan.center).toEqual({ x: 40, y: 50 });
  });

  it('a 30-feature city is some 300-420 units across', () => {
    const plan = planCity(FULL);
    const across = plan.radius * 2;
    console.log(`30 features: ${across.toFixed(0)} across, built ${builtSpan(plan).toFixed(0)}, ${plan.blocks.length} blocks`);
    expect(across).toBeGreaterThanOrEqual(300);
    expect(across).toBeLessThanOrEqual(420);
  });

  it('a 5-feature place is one or two blocks: 60-150 units of built ground', () => {
    for (const wards of [['Market'], ['Market', 'Foundry'], [undefined]]) {
      const plan = planCity(makePlace(5, { wards }));
      const built = builtSpan(plan);
      console.log(`5 features, ${wards.length} ward(s): built ${built.toFixed(0)}, ${(plan.radius * 2).toFixed(0)} across with street ends`);
      expect(plan.blocks.length).toBeLessThanOrEqual(2);
      expect(built).toBeGreaterThanOrEqual(55);
      expect(built).toBeLessThanOrEqual(150);
    }
  });

  it('grows with its features and never shrinks', () => {
    let last = 0;
    for (const n of [1, 5, 12, 20, 30]) {
      const plan = planCity(makePlace(n));
      expect(plan.radius).toBeGreaterThanOrEqual(last);
      last = plan.radius;
    }
  });
});
