import { describe, expect, it } from 'vitest';
import { derive, rankIndex } from './derive';
import { catalogue } from './fixtures/catalogue';
import { FIXTURE_TODAY, fixtureEvents } from './fixtures/world';
import type { PlaceState } from './types';

const TODAY = '2026-10-12';
const events = fixtureEvents();
const world = derive(events, catalogue, TODAY);

function distance(a: PlaceState, b: PlaceState): number {
  return Math.hypot(a.position.x - b.position.x, a.position.y - b.position.y);
}

describe('fixture catalogue', () => {
  it('has the four regions and a consistent method tree', () => {
    expect(catalogue.size).toEqual({ width: 4800, height: 3200 });
    expect(catalogue.regions.map((r) => r.id)).toEqual([
      'the-court',
      'mindworks',
      'ledger-reach',
      'the-commons',
    ]);
    const ids = new Set(catalogue.methods.map((m) => m.id));
    expect(ids.size).toBe(catalogue.methods.length);
    for (const m of catalogue.methods) {
      expect(m.id).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
      expect(m.family).not.toBe('');
      for (const r of m.requires) expect(ids.has(r), `${m.id} requires ${r}`).toBe(true);
    }
  });
});

describe('fixture events', () => {
  it('are identical on every call', () => {
    expect(FIXTURE_TODAY).toBe(TODAY);
    expect(fixtureEvents()).toEqual(events);
    expect(JSON.stringify(fixtureEvents())).toBe(JSON.stringify(events));
  });

  it('have unique ids, the fixture source, and dates in order up to today', () => {
    expect(new Set(events.map((e) => e.id)).size).toBe(events.length);
    let prev = '';
    for (const e of events) {
      expect(e.source).toBe('fixture');
      expect(e.at).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(e.at >= prev).toBe(true);
      expect(e.at <= TODAY).toBe(true);
      prev = e.at;
    }
    expect(events[0]?.at.startsWith('2023')).toBe(true);
  });

  it('refer only to regions and methods in the catalogue', () => {
    const regions = new Set(catalogue.regions.map((r) => r.id));
    const methods = new Set(catalogue.methods.map((m) => m.id));
    for (const e of events) {
      if (e.type === 'place.founded') expect(regions.has(e.region), e.place).toBe(true);
      if (e.type === 'feature.proposed') {
        expect(e.methods.length).toBeGreaterThan(0);
        for (const m of e.methods) expect(methods.has(m), `${e.feature}: ${m}`).toBe(true);
      }
    }
  });

  it('log every piece of work, stage and release against something that exists', () => {
    const features = new Map<string, string>();
    for (const e of events) if (e.type === 'feature.proposed') features.set(e.feature, e.place);
    const places = new Set(world.places.map((p) => p.id));
    for (const e of events) {
      if (e.type === 'link.formed') {
        expect(places.has(e.a) && places.has(e.b), e.id).toBe(true);
        continue;
      }
      expect(places.has(e.place), e.id).toBe(true);
      if ((e.type === 'work.logged' || e.type === 'release.shipped') && e.feature !== undefined) {
        expect(features.get(e.feature), e.id).toBe(e.place);
      }
      if (e.type === 'feature.staged') expect(features.get(e.feature), e.id).toBe(e.place);
      if (e.type === 'work.logged') expect(e.commits).toBeGreaterThan(0);
    }
  });

  it('never read a clock or a random source anywhere in src/world', () => {
    const sources = import.meta.glob('./**/*.ts', { query: '?raw', import: 'default', eager: true });
    const files = Object.entries(sources).filter(([path]) => !path.endsWith('.test.ts'));
    expect(files.length).toBeGreaterThan(6);
    for (const [path, text] of files) {
      expect(String(text), path).not.toMatch(/Date\.now\(|Math\.random\(|new Date\(/);
    }
  });
});

describe('fixture geography', () => {
  it('keeps every place well inside the paper', () => {
    const { width, height } = catalogue.size;
    for (const p of world.places) {
      expect(p.position.x, p.id).toBeGreaterThanOrEqual(250);
      expect(p.position.x, p.id).toBeLessThanOrEqual(width - 250);
      expect(p.position.y, p.id).toBeGreaterThanOrEqual(250);
      expect(p.position.y, p.id).toBeLessThanOrEqual(height - 250);
    }
  });

  it('keeps places clear of each other, more so the bigger they are', () => {
    const big = rankIndex('city');
    const mid = rankIndex('settlement');
    const ps = world.places;
    for (let i = 0; i < ps.length; i++) {
      for (let j = i + 1; j < ps.length; j++) {
        const a = ps[i]!;
        const b = ps[j]!;
        const ra = rankIndex(a.rank);
        const rb = rankIndex(b.rank);
        const lo = Math.min(ra, rb);
        // Cities 420 apart; a town or settlement 260 from anything its size or bigger;
        // everything at least 110 from everything.
        const min = lo >= big ? 420 : lo >= mid ? 260 : 110;
        expect(distance(a, b), `${a.id} to ${b.id}`).toBeGreaterThanOrEqual(min);
      }
    }
  });

  it('founds places in all four regions', () => {
    for (const region of catalogue.regions) {
      expect(world.places.filter((p) => p.region === region.id).length).toBeGreaterThanOrEqual(4);
    }
  });
});

describe('fixture cast', () => {
  it('has the shape the brief asks for', () => {
    expect(world.places).toHaveLength(23);
    const count = (rank: string): number => world.places.filter((p) => p.rank === rank).length;
    expect(count('spark')).toBe(6);
    expect(count('site')).toBe(5);
    expect(count('outpost')).toBe(4); // three ideas and Patrick's World
    expect(world.links.length).toBeGreaterThanOrEqual(14);
    expect(world.links.length).toBeLessThanOrEqual(18);

    const boxout = world.places.find((p) => p.id === 'boxout-fantasy')!;
    expect(boxout.features.length).toBeGreaterThanOrEqual(26);
    expect(boxout.features.length).toBeLessThanOrEqual(32);
    const building = boxout.features.filter((f) => f.stage === 'building');
    expect(building.length).toBeGreaterThanOrEqual(3);
    expect(building.length).toBeLessThanOrEqual(4);
    expect(building.some((f) => f.name === 'UI redesign')).toBe(true);
    expect(boxout.users).toBeGreaterThan(2000);
    expect(boxout.releases.length).toBeGreaterThanOrEqual(3);
    expect(boxout.features.filter((f) => f.landmark).length).toBeGreaterThanOrEqual(3);
    const storeys = boxout.features.map((f) => f.storeys);
    expect(Math.min(...storeys)).toBe(1);
    expect(Math.max(...storeys)).toBe(8);
    expect(new Set(boxout.features.map((f) => f.ward)).size).toBeGreaterThanOrEqual(6);
  });

  it('has ideas that are only notes, in a casual voice', () => {
    for (const p of world.places.filter((q) => q.rank === 'spark')) {
      expect(p.features).toHaveLength(0);
      expect(p.commits).toBe(0);
      expect(p.note.length).toBeGreaterThan(20);
      expect(p.note).not.toContain('!');
    }
  });
});
