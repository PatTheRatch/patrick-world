import { describe, expect, it } from 'vitest';
import { catalogue } from '../world/fixtures/catalogue';
import { fixtureEvents } from '../world/fixtures/world';
import { buildTerrain } from './terrain';

describe('the fixture world on its terrain', () => {
  it('founds every place on dry land, clear of the shore', () => {
    const terrain = buildTerrain(catalogue, 'patricks-world');
    const wet: string[] = [];
    for (const e of fixtureEvents()) {
      if (e.type !== 'place.founded') continue;
      const ring = [0, 1, 2, 3, 4, 5, 6, 7].map((i) => ({
        x: e.position.x + Math.cos((i * Math.PI) / 4) * 40,
        y: e.position.y + Math.sin((i * Math.PI) / 4) * 40,
      }));
      if (![e.position, ...ring].every((p) => terrain.isLand(p))) wet.push(`${e.place} ${e.position.x},${e.position.y}`);
    }
    expect(wet).toEqual([]);
  });
});
