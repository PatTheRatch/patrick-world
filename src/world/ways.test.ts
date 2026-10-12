import { describe, expect, it } from 'vitest';
import { derive } from './derive';
import { catalogue } from './fixtures/catalogue';
import { fixtureEvents } from './fixtures/world';
import { inferWays, isWay } from './ways';

describe('inferWays', () => {
  const world = derive(fixtureEvents(), catalogue, '2026-10-12');
  const ways = inferWays(world.places, world.links);

  it('joins only places that both have real work and share a method', () => {
    const byId = new Map(world.places.map((p) => [p.id, p]));
    expect(ways.length).toBeGreaterThan(0);
    for (const w of ways) {
      expect(isWay(w)).toBe(true);
      expect(w.sharedMethods.length).toBeGreaterThan(0);
      expect(byId.get(w.a)!.commits).toBeGreaterThan(0);
      expect(byId.get(w.b)!.commits).toBeGreaterThan(0);
      expect(byId.get(w.a)!.liveliness).not.toBe('ruins');
    }
  });

  it('never duplicates a declared link and stays sparse', () => {
    const declared = new Set(world.links.map((l) => [l.a, l.b].sort().join('~')));
    for (const w of ways) expect(declared.has([w.a, w.b].sort().join('~'))).toBe(false);
    const workedPlaces = world.places.filter((p) => p.commits > 0).length;
    // A forest: fewer ways than places.
    expect(ways.length).toBeLessThan(workedPlaces);
  });

  it('is deterministic and leaves ideas with no work alone', () => {
    expect(inferWays(world.places, world.links)).toEqual(ways);
    const ideas = new Set(world.places.filter((p) => p.commits === 0).map((p) => p.id));
    for (const w of ways) expect(ideas.has(w.a) || ideas.has(w.b)).toBe(false);
  });
});
