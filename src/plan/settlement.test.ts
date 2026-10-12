import { describe, expect, it } from 'vitest';
import type { FeatureKind, FeatureState, PlaceState } from '../world/types';
import { boundsOf, convexOverlap, insideConvex, polygonCentroid } from './geometry';
import { fabricCount, planCity } from './settlement';
import { makePlace } from './testkit';

const IDS = ['testport', 'alder', 'brine', 'quarry-hill', 'low-fen', 'saltmarsh'];
const prefix = (place: PlaceState, n: number): PlaceState => ({ ...place, features: place.features.slice(0, n) });
const withId = (place: PlaceState, id: string): PlaceState => ({ ...place, id });

/** A place whose features are all of one kind, in one quarter: for comparing character. */
function ofKind(kind: FeatureKind, n: number, id = `all-${kind}`): PlaceState {
  const base = makePlace(n);
  return {
    ...base,
    id,
    features: base.features.map((f): FeatureState => ({ ...f, kind, ward: undefined })),
  };
}

const span = (place: PlaceState) => {
  const plan = planCity(place);
  // Long and short axes of the built ground, in the town's own frame.
  const pts = plan.lots.flatMap((l) => l.parcel);
  const c = Math.cos(-plan.angle);
  const s = Math.sin(-plan.angle);
  const local = pts.map((p) => ({ x: (p.x - plan.center.x) * c - (p.y - plan.center.y) * s, y: (p.x - plan.center.x) * s + (p.y - plan.center.y) * c }));
  const b = boundsOf(local);
  return { long: Math.max(b.w, b.h), short: Math.min(b.w, b.h), plan };
};

describe('planCity: nothing that stands ever moves', () => {
  for (const id of IDS) {
    it(`${id}: an earlier edition is a prefix of the later one`, () => {
      const full = withId(makePlace(30), id);
      const whole = planCity(full);
      const byFeature = new Map(whole.lots.map((l) => [l.feature, l]));
      for (const n of [1, 2, 3, 5, 8, 12, 20, 30]) {
        const early = planCity(prefix(full, n));
        expect(early.lots).toHaveLength(n);
        for (const lot of early.lots) {
          const later = byFeature.get(lot.feature)!;
          expect(lot.parcel).toEqual(later.parcel);
          expect(lot.footprint[0]).toEqual(later.footprint[0]);
        }
      }
    });
  }

  it('stage, storeys, rank, work and users change annexes, streets and fabric, never a parcel or a main mass', () => {
    const base = makePlace(20);
    const a = planCity(base);
    const b = planCity({
      ...base,
      rank: 'major',
      commits: 9000,
      users: 50000,
      features: base.features.map((f) => ({ ...f, stage: 'mature' as const, storeys: 8 })),
    });
    expect(b.lots.map((l) => l.parcel)).toEqual(a.lots.map((l) => l.parcel));
    expect(b.lots.map((l) => l.footprint[0])).toEqual(a.lots.map((l) => l.footprint[0]));
  });

  it('is deterministic', () => {
    expect(planCity(makePlace(24))).toEqual(planCity(makePlace(24)));
  });
});

describe('planCity: a plausible plan', () => {
  const plans = IDS.map((id) => planCity({ ...withId(makePlace(30), id), commits: 2400, users: 800 }));

  it('never overlaps two parcels, and keeps every building on its own ground', () => {
    for (const plan of plans) {
      for (let i = 0; i < plan.lots.length; i++) {
        for (let k = i + 1; k < plan.lots.length; k++) {
          expect(convexOverlap(plan.lots[i]!.parcel, plan.lots[k]!.parcel)).toBe(false);
        }
        for (const poly of plan.lots[i]!.footprint) {
          for (const p of poly) expect(insideConvex(p, plan.lots[i]!.parcel, 1e-3)).toBe(true);
        }
      }
    }
  });

  it('keeps the fabric clear of every lot and of itself', () => {
    for (const plan of plans) {
      expect(plan.dwellings.length).toBeGreaterThan(8);
      plan.dwellings.forEach((d, i) => {
        for (const lot of plan.lots) expect(convexOverlap(d.footprint, lot.parcel)).toBe(false);
        for (let k = i + 1; k < plan.dwellings.length; k++) expect(convexOverlap(d.footprint, plan.dwellings[k]!.footprint)).toBe(false);
      });
    }
  });

  it('encloses everything in its radius and bounds', () => {
    for (const plan of plans) {
      const pts = [...plan.lots.flatMap((l) => l.parcel), ...plan.streets.flatMap((s) => s.line), ...plan.dwellings.flatMap((d) => d.footprint)];
      for (const p of pts) {
        expect(Math.hypot(p.x - plan.center.x, p.y - plan.center.y)).toBeLessThanOrEqual(plan.radius + 1e-6);
        expect(p.x).toBeGreaterThanOrEqual(plan.bounds.x - 1e-6);
        expect(p.x).toBeLessThanOrEqual(plan.bounds.x + plan.bounds.w + 1e-6);
      }
    }
  });

  it('handles a place with nothing in it', () => {
    const plan = planCity(makePlace(0));
    expect(plan.lots).toEqual([]);
    expect(plan.streets).toEqual([]);
    expect(plan.radius).toBeGreaterThanOrEqual(10);
  });
});

describe('planCity: form changes in kind as a place grows', () => {
  it('a few buildings are a ribbon along one route; many are a town with depth', () => {
    for (const id of IDS) {
      const small = span(withId(ofKind('works', 4), id));
      expect(small.long / small.short).toBeGreaterThan(1.3);
      const large = span(withId(makePlace(30), id));
      expect(large.long / large.short).toBeLessThan(2.4);
      expect(large.short).toBeGreaterThan(small.short * 1.8);
    }
  });

  it('gains a common only once it has a crossing, and it becomes a square with rank', () => {
    const outpost = planCity({ ...ofKind('works', 3), rank: 'outpost' });
    expect(outpost.square).toBeUndefined();
    const town = planCity({ ...makePlace(24), rank: 'town' });
    expect(town.square?.grade).toBe('square');
    expect(planCity({ ...makePlace(24), rank: 'settlement' }).square?.grade).toBe('common');
    expect(planCity({ ...makePlace(24), rank: 'city' }).square?.grade).toBe('plaza');
    // The square is the same ground whatever it is called.
    expect(planCity({ ...makePlace(24), rank: 'city' }).square?.outline).toEqual(town.square?.outline);
  });

  it('draws no streets for a place where nothing is yet real', () => {
    const base = makePlace(4);
    const site = planCity({ ...base, rank: 'site', features: base.features.map((f) => ({ ...f, stage: 'concept' as const })) });
    expect(site.lots).toHaveLength(4);
    expect(site.streets).toEqual([]);
    expect(site.dwellings).toEqual([]);
  });

  it('makes its streets more made as it matures, without moving them', () => {
    const young = planCity({ ...makePlace(12), rank: 'outpost' });
    const old = planCity({ ...makePlace(12), rank: 'city' });
    expect(young.streets.map((s) => s.line)).toEqual(old.streets.map((s) => s.line));
    expect(new Set(young.streets.map((s) => s.grade))).toEqual(new Set(['track']));
    expect(old.streets.some((s) => s.grade === 'avenue')).toBe(true);
  });
});

describe('planCity: what a place is made of shows in its shape', () => {
  it('a place of terraces is a long high street; a place of works is compact', () => {
    const terraces = span(ofKind('frontage', 14));
    const works = span(ofKind('works', 14));
    expect(terraces.long / terraces.short).toBeGreaterThan((works.long / works.short) * 1.25);
  });

  it('tanks are round, domes are octagons, sheds are long', () => {
    const corners = (kind: FeatureKind) => planCity(ofKind(kind, 3)).lots[0]!.footprint[0]!.length;
    expect(corners('reservoir')).toBeGreaterThanOrEqual(12);
    expect(corners('observatory')).toBe(8);
    const shed = boundsOf(
      (() => {
        const plan = planCity(ofKind('utility', 3));
        const c = Math.cos(-plan.angle);
        const s = Math.sin(-plan.angle);
        return plan.lots[0]!.footprint[0]!.map((p) => ({ x: p.x * c - p.y * s, y: p.x * s + p.y * c }));
      })(),
    );
    expect(Math.max(shed.w, shed.h) / Math.min(shed.w, shed.h)).toBeGreaterThan(2.4);
  });

  it('quarters founded later stand apart from the old crossing', () => {
    const plan = planCity(makePlace(30));
    // A later quarter has its own street, at its own angle to the old arms.
    const bearing = (st: { line: { x: number; y: number }[] }) =>
      (((Math.atan2(st.line[1]!.y - st.line[0]!.y, st.line[1]!.x - st.line[0]!.x) - plan.angle) % (Math.PI / 2)) + Math.PI / 2) % (Math.PI / 2);
    const off = plan.streets.map(bearing).map((b) => Math.min(b, Math.PI / 2 - b));
    expect(Math.max(...off)).toBeGreaterThan(0.25);
    expect(polygonCentroid(plan.lots[0]!.parcel)).toBeDefined();
  });
});

describe('fabric follows the work, and saturates', () => {
  it('grows with commits but ever more slowly', () => {
    expect(fabricCount(0, 0)).toBe(0);
    const steps = [25, 100, 400, 1600, 6400].map((c) => fabricCount(c, 0));
    for (let i = 1; i < steps.length; i++) expect(steps[i]!).toBeGreaterThan(steps[i - 1]!);
    expect(steps[4]! - steps[3]!).toBeLessThanOrEqual(steps[1]! - steps[0]! + 6);
    expect(fabricCount(100000, 0)).toBeLessThan(90);
  });

  it('adds terraces without disturbing the ones already there', () => {
    const few = planCity({ ...makePlace(24), commits: 120 });
    const many = planCity({ ...makePlace(24), commits: 4000 });
    expect(many.dwellings.length).toBeGreaterThan(few.dwellings.length);
    expect(many.dwellings.slice(0, few.dwellings.length)).toEqual(few.dwellings);
  });
});
