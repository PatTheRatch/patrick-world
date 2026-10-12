import { describe, expect, it } from 'vitest';
import { derive, rankIndex } from './derive';
import { catalogue } from './fixtures/catalogue';
import { fixtureEvents } from './fixtures/world';
import { mergeEvents } from './sources';
import { thresholds } from './thresholds';
import { addDays, daysBetween, monthsBetween } from './time';
import type { Liveliness, PlaceState, Rank, WorldEvent, WorldState } from './types';

const TODAY = '2026-10-12';
const events = fixtureEvents();
const world = derive(events, catalogue, TODAY);

function place(w: WorldState, id: string): PlaceState {
  const p = w.places.find((q) => q.id === id);
  if (p === undefined) throw new Error(`no place ${id}`);
  return p;
}

// Small hand-built logs for the rules the fixture does not isolate.
let seq = 0;
function founded(id: string, at: string): WorldEvent {
  return {
    id: `t:${seq++}`,
    at,
    source: 'manual',
    type: 'place.founded',
    place: id,
    name: id,
    region: 'the-commons',
    position: { x: 1000, y: 1000 },
    note: 'A thought.',
  };
}
function work(id: string, at: string, commits: number, feature?: string): WorldEvent {
  const e: WorldEvent = { id: `t:${seq++}`, at, source: 'manual', type: 'work.logged', place: id, commits };
  if (feature !== undefined) e.feature = feature;
  return e;
}
function proposed(id: string, feature: string, at: string, methods: string[] = ['typescript']): WorldEvent {
  return {
    id: `t:${seq++}`,
    at,
    source: 'manual',
    type: 'feature.proposed',
    place: id,
    feature,
    name: feature,
    kind: 'works',
    methods,
  };
}
function staged(id: string, feature: string, at: string, stage: 'building' | 'working' | 'mature' | 'planned'): WorldEvent {
  return { id: `t:${seq++}`, at, source: 'manual', type: 'feature.staged', place: id, feature, stage };
}

describe('the cast today', () => {
  const expected: [id: string, rank: Rank, liveliness: Liveliness[]][] = [
    ['boxout-fantasy', 'major', ['building']],
    ['patrick-os', 'city', ['building']],
    ['ledgerline', 'city', ['settled', 'building']],
    ['evalyard', 'town', ['building']],
    ['patricks-world', 'outpost', ['building']],
    ['wirefeed', 'town', ['building']],
    ['shotchart', 'town', ['dormant']],
    ['pantry-loop', 'settlement', ['quiet']],
    ['hooplytics', 'town', ['ruins']],
    ['sixth-man', 'outpost', ['dormant']],
  ];
  for (const [id, rank, liveliness] of expected) {
    it(`${id} is a ${rank}, ${liveliness.join(' or ')}`, () => {
      const p = place(world, id);
      expect(p.rank).toBe(rank);
      expect(liveliness).toContain(p.liveliness);
    });
  }

  it('Wirefeed is revived, and nothing else is', () => {
    expect(place(world, 'wirefeed').revived).toBe(true);
    expect(world.places.filter((p) => p.revived).map((p) => p.id)).toEqual(['wirefeed']);
  });

  it('Hooplytics is ruins by decision, and keeps the reason', () => {
    const p = place(world, 'hooplytics');
    expect(p.liveliness).toBe('ruins');
    expect(p.abandonedAt).toBe('2024-06-09');
    expect(p.abandonedNote).toBe('Too broad. The fantasy slice is the real product.');
    // Still a town the day before it was abandoned, and not yet ruins.
    const before = place(derive(events, catalogue, '2024-06-08'), 'hooplytics');
    expect(before.rank).toBe('town');
    expect(before.liveliness).not.toBe('ruins');
  });

  it("Patrick's World was founded today with one building under way", () => {
    const p = place(world, 'patricks-world');
    expect(p.foundedAt).toBe(TODAY);
    expect(p.note).toBe('My projects as a world I can explore.');
    expect(p.features.filter((f) => f.stage === 'building')).toHaveLength(1);
    expect(p.features.every((f) => rankIndex(p.rank) >= 0 && f.stage !== 'working')).toBe(true);
    expect(p.series).toEqual([{ month: '2026-10', commits: p.commits }]);
    expect(place(world, 'patricks-world').nextRank).toEqual({
      rank: 'settlement',
      needs: ['a working feature'],
    });
  });

  it('Evalyard is one working feature short of a city', () => {
    expect(place(world, 'evalyard').nextRank).toEqual({
      rank: 'city',
      needs: ['1 more working feature'],
    });
  });

  it('Ledgerline has users, but under the bar for a major city', () => {
    const p = place(world, 'ledgerline');
    expect(p.users).toBeGreaterThan(0);
    expect(p.users).toBeLessThan(100);
    expect(p.nextRank?.rank).toBe('major');
    expect(p.nextRank?.needs).toEqual([`${100 - p.users} more measured users`]);
  });

  it('says plainly what the next rank needs', () => {
    expect(place(world, 'boxout-fantasy').nextRank).toBeUndefined();
    expect(place(world, 'patrick-os').nextRank?.needs).toEqual(['measured users']);
    for (const p of world.places) {
      if (p.rank === 'major') continue;
      expect(p.nextRank, p.id).toBeDefined();
      expect(rankIndex(p.nextRank!.rank)).toBe(rankIndex(p.rank) + 1);
      expect(p.nextRank!.needs.length).toBeGreaterThan(0);
      for (const need of p.nextRank!.needs) {
        expect(need).not.toContain('!');
        expect(need).toMatch(/^[a-z0-9]/);
      }
    }
  });
});

describe('time travel', () => {
  const first = events[0]!.at;
  const span = daysBetween(first, TODAY);
  const dates: string[] = [];
  for (let i = 0; i < 40; i++) dates.push(addDays(first, Math.round((span * i) / 39)));

  it('rank never falls as the edition advances', () => {
    expect(dates[0]).toBe(first);
    expect(dates[39]).toBe(TODAY);
    const last = new Map<string, number>();
    let count = 0;
    for (const date of dates) {
      const w = derive(events, catalogue, date);
      expect(w.places.length).toBeGreaterThanOrEqual(count);
      count = w.places.length;
      for (const p of w.places) {
        const r = rankIndex(p.rank);
        expect(r, `${p.id} at ${date}`).toBeGreaterThanOrEqual(last.get(p.id) ?? 0);
        last.set(p.id, r);
      }
    }
  });

  it('an early edition has fewer places and none founded after it', () => {
    const early = derive(events, catalogue, '2024-03-01');
    expect(early.asOf).toBe('2024-03-01');
    expect(early.places.length).toBeGreaterThan(0);
    expect(early.places.length).toBeLessThan(world.places.length);
    for (const p of early.places) {
      expect(p.foundedAt <= '2024-03-01').toBe(true);
      if (p.lastWorkAt !== undefined) expect(p.lastWorkAt <= '2024-03-01').toBe(true);
      for (const f of p.features) expect(f.proposedAt <= '2024-03-01').toBe(true);
    }
    expect(early.places.find((p) => p.id === 'boxout-fantasy')).toBeUndefined();
    for (const l of early.links) {
      expect(early.places.some((p) => p.id === l.a)).toBe(true);
      expect(early.places.some((p) => p.id === l.b)).toBe(true);
    }
    // The dial's left end is the start of the whole log, whatever the edition.
    expect(early.beginsAt).toBe(first);
    expect(world.beginsAt).toBe(first);
  });

  it('before anything happened there is nothing', () => {
    const w = derive(events, catalogue, '2022-01-01');
    expect(w.places).toEqual([]);
    expect(w.links).toEqual([]);
    expect(w.methods.every((m) => m.level === 'unknown')).toBe(true);
    expect(w.beginsAt).toBe(first);
  });

  it('Wirefeed was dormant before it came back', () => {
    const p = place(derive(events, catalogue, '2026-08-01'), 'wirefeed');
    expect(p.liveliness).toBe('dormant');
    expect(p.revived).toBe(false);
    expect(p.rank).toBe('town');
  });
});

describe('purity', () => {
  it('does not mutate its input', () => {
    const input = fixtureEvents();
    const before = JSON.stringify(input);
    const cat = JSON.stringify(catalogue);
    const out = derive(input, catalogue, TODAY);
    out.places[0]!.features[0]!.methods.push('tampered');
    out.places[0]!.position.x = -1;
    out.methods[0]!.requires.push('tampered');
    expect(JSON.stringify(input)).toBe(before);
    expect(JSON.stringify(catalogue)).toBe(cat);
  });

  it('is deterministic', () => {
    expect(derive(fixtureEvents(), catalogue, TODAY)).toEqual(world);
    expect(JSON.stringify(derive(events, catalogue, '2025-07-04'))).toBe(
      JSON.stringify(derive(events, catalogue, '2025-07-04')),
    );
  });

  it('does not care how the log is ordered', () => {
    const reversed = events.slice().reverse();
    const copy = JSON.stringify(reversed);
    expect(derive(mergeEvents([reversed]), catalogue, TODAY)).toEqual(world);
    expect(JSON.stringify(reversed)).toBe(copy);
    // Unsorted input is sorted by date internally. Within a day the given order stands, which
    // only decides ties (lot order of features proposed the same day), so compare the verdicts.
    const w = derive(reversed, catalogue, TODAY);
    expect(w.places.map((p) => [p.id, p.rank, p.liveliness, p.commits, p.activeWeeks].join()).sort()).toEqual(
      world.places.map((p) => [p.id, p.rank, p.liveliness, p.commits, p.activeWeeks].join()).sort(),
    );
    expect(w.methods).toEqual(world.methods);
  });
});

describe('features', () => {
  it('number the built in the order they reached working', () => {
    for (const p of world.places) {
      const built = p.features.filter((f) => f.builtOrder !== undefined);
      const sorted = built.slice().sort((a, b) => a.builtOrder! - b.builtOrder!);
      expect(sorted.map((f) => f.builtOrder)).toEqual(sorted.map((_, i) => i + 1));
      for (let i = 1; i < sorted.length; i++) {
        expect(sorted[i]!.stagedAt.working! >= sorted[i - 1]!.stagedAt.working!).toBe(true);
      }
      for (const f of p.features) {
        const isBuilt = f.stage === 'working' || f.stage === 'mature';
        expect(f.builtOrder !== undefined, f.id).toBe(isBuilt);
      }
      expect(p.features.map((f) => f.order)).toEqual(p.features.map((_, i) => i));
    }
  });

  it('carry stage, storeys, progress and heat within their ranges', () => {
    const { min, max } = thresholds.progress;
    for (const p of world.places) {
      for (const f of p.features) {
        expect(f.storeys).toBeGreaterThanOrEqual(1);
        expect(f.storeys).toBeLessThanOrEqual(9);
        expect(f.storeys).toBe(Math.min(9, 1 + Math.floor(Math.log2(1 + f.commits / 6))));
        expect(f.heat).toBeGreaterThanOrEqual(0);
        expect(f.heat).toBeLessThanOrEqual(1);
        expect(f.stagedAt.concept).toBe(f.proposedAt);
        expect(f.stagedAt[f.stage], f.id).toBeDefined();
        if (f.stage === 'working' || f.stage === 'mature') expect(f.progress).toBe(1);
        else if (f.stage === 'building') {
          expect(f.progress).toBeGreaterThanOrEqual(min);
          expect(f.progress).toBeLessThanOrEqual(max);
        } else {
          expect(f.progress).toBe(0);
          expect(f.commits).toBe(0);
        }
      }
      expect(p.heat).toBeGreaterThanOrEqual(0);
      expect(p.heat).toBeLessThanOrEqual(1);
    }
    expect(place(world, 'boxout-fantasy').heat).toBeGreaterThan(0.9);
    expect(place(world, 'hooplytics').heat).toBeLessThan(0.001);
  });

  it('follow the latest stage at each edition', () => {
    const id = 'boxout-fantasy.yahoo-sync';
    const at = (date: string) =>
      place(derive(events, catalogue, date), 'boxout-fantasy').features.find((f) => f.id === id);
    expect(at('2024-09-07')).toBeUndefined();
    expect(at('2024-09-08')?.stage).toBe('concept');
    expect(at('2025-03-02')?.stage).toBe('planned');
    expect(at('2025-12-14')?.stage).toBe('designed');
    expect(at('2026-03-08')?.stage).toBe('building');
    expect(at('2026-06-06')?.stage).toBe('building');
    expect(at('2026-06-07')?.stage).toBe('working');
    expect(at('2026-06-13')?.landmark).toBe(false);
    expect(at('2026-06-14')?.landmark).toBe(true);
  });

  it('counts progress from the day building began', () => {
    seq = 0;
    const log = [
      founded('p', '2026-01-01'),
      proposed('p', 'f', '2026-01-01'),
      work('p', '2026-01-02', 500, 'f'), // before building: storeys, not progress
      staged('p', 'f', '2026-02-01', 'building'),
      work('p', '2026-02-01', 30, 'f'),
      work('p', '2026-02-08', 30, 'f'),
    ];
    const f = derive(log, catalogue, '2026-02-10').places[0]!.features[0]!;
    expect(f.commits).toBe(560);
    expect(f.progress).toBeCloseTo(60 / thresholds.progress.cost.works, 10);
    // Same day, other order: the work still counts.
    const swapped = [log[0]!, log[1]!, log[2]!, log[4]!, log[3]!, log[5]!];
    expect(derive(swapped, catalogue, '2026-02-10').places[0]!.features[0]!.progress).toBe(f.progress);
  });
});

describe('places', () => {
  it('have a zero-filled monthly series from founding to the edition', () => {
    for (const p of world.places) {
      expect(p.series.map((s) => s.month)).toEqual(monthsBetween(p.foundedAt, TODAY));
      expect(p.series.reduce((sum, s) => sum + s.commits, 0)).toBe(p.commits);
    }
    const hoop = place(world, 'hooplytics');
    expect(hoop.series[0]?.month).toBe('2023-02');
    expect(hoop.series.at(-1)).toEqual({ month: '2026-10', commits: 0 });
  });

  it('keep notes oldest first and totals that add up', () => {
    for (const p of world.places) {
      for (let i = 1; i < p.notes.length; i++) expect(p.notes[i]!.at >= p.notes[i - 1]!.at).toBe(true);
      expect(p.features.reduce((sum, f) => sum + f.commits, 0)).toBeLessThanOrEqual(p.commits);
    }
    const boxout = place(world, 'boxout-fantasy');
    expect(boxout.features.reduce((sum, f) => sum + f.commits, 0)).toBeLessThan(boxout.commits);
  });

  it('an untouched idea fades but never falls to ruins', () => {
    seq = 0;
    const log = [founded('idea', '2015-01-01')];
    const at = (date: string) => derive(log, catalogue, date).places[0]!;
    expect(at('2015-01-01').liveliness).toBe('settled');
    expect(at('2015-01-01').rank).toBe('spark');
    expect(at('2015-04-01').liveliness).toBe('quiet');
    expect(at('2015-12-01').liveliness).toBe('dormant');
    expect(at('2026-10-12').liveliness).toBe('dormant');
  });

  it('a place that had real work falls to ruins by silence alone', () => {
    seq = 0;
    const log = [founded('p', '2020-01-01'), work('p', '2020-01-05', 4)];
    const at = (date: string) => derive(log, catalogue, date).places[0]!.liveliness;
    expect(at('2020-01-10')).toBe('building');
    expect(at('2020-02-10')).toBe('settled');
    expect(at('2020-05-01')).toBe('quiet');
    expect(at('2021-01-01')).toBe('dormant');
    expect(at('2022-01-01')).toBe('ruins');
  });

  it('work after an abandonment revives the place', () => {
    seq = 0;
    const log: WorldEvent[] = [
      founded('p', '2024-01-01'),
      work('p', '2024-01-07', 5),
      { id: 'ab', at: '2024-03-01', source: 'manual', type: 'place.abandoned', place: 'p', note: 'Done with it.' },
      work('p', '2024-04-07', 5),
    ];
    const at = (date: string) => derive(log, catalogue, date).places[0]!;
    expect(at('2024-02-01').liveliness).toBe('settled');
    expect(at('2024-03-01').liveliness).toBe('ruins');
    expect(at('2024-04-06').liveliness).toBe('ruins');
    expect(at('2024-04-07').liveliness).toBe('building');
    expect(at('2024-04-07').revived).toBe(true);
    expect(at('2024-04-07').abandonedAt).toBe('2024-03-01');
    expect(at('2024-08-01').liveliness).toBe('quiet');
  });

  it('climbs the ladder on evidence and remembers old names', () => {
    seq = 0;
    const log: WorldEvent[] = [
      founded('p', '2026-01-01'),
      { id: 'n', at: '2026-01-02', source: 'manual', type: 'place.noted', place: 'p', note: 'Again.' },
      work('p', '2026-01-04', 3),
      proposed('p', 'f', '2026-01-05'),
      staged('p', 'f', '2026-01-06', 'working'),
      { id: 'r', at: '2026-01-07', source: 'manual', type: 'place.renamed', place: 'p', name: 'Better Name' },
      // Noise that must be ignored: an unknown place, an unknown feature.
      work('nowhere', '2026-01-07', 99),
      staged('p', 'ghost', '2026-01-07', 'working'),
    ];
    const at = (date: string) => derive(log, catalogue, date).places[0]!;
    expect(at('2026-01-01').rank).toBe('spark');
    expect(at('2026-01-02').rank).toBe('site');
    expect(at('2026-01-04').rank).toBe('outpost');
    expect(at('2026-01-06').rank).toBe('settlement');
    expect(at('2026-01-06').name).toBe('p');
    expect(at('2026-01-07').name).toBe('Better Name');
    expect(at('2026-01-07').formerNames).toEqual(['p']);
    expect(at('2026-01-07').commits).toBe(3);
    expect(at('2026-01-07').nextRank).toEqual({
      rank: 'town',
      needs: ['2 more working features', '3 more weeks with work in them'],
    });
    expect(derive(log, catalogue, '2026-01-07').places).toHaveLength(1);
  });
});

describe('links', () => {
  it('include only links between places that exist, with a grade from the evidence', () => {
    const ids = new Set(world.places.map((p) => p.id));
    for (const l of world.links) {
      expect(ids.has(l.a) && ids.has(l.b)).toBe(true);
      expect(l.kinds.length).toBeGreaterThan(0);
      if (l.sharedMethods.length === 0 && l.kinds.join() === 'related') expect(l.grade).toBe('surveyed');
      // Shared methods only make a road between two places that have both grown.
      const grown = (id: string) => ['town', 'city', 'major'].includes(world.places.find((p) => p.id === id)!.rank);
      if (l.sharedMethods.length >= 3 && grown(l.a) && grown(l.b)) expect(l.grade).toBe('road');
      if (!grown(l.a) || !grown(l.b)) expect(l.grade).not.toBe('road');
    }
    const feeds = world.links.filter((l) => l.kinds.includes('feeds'));
    expect(feeds.map((l) => [l.a, l.b].join('>')).sort()).toEqual([
      'wirefeed>boxout-fantasy',
      'wirefeed>evalyard',
      'wirefeed>patrick-os',
    ]);
    for (const l of feeds) {
      expect(l.carries).toBe('MCP');
      expect(l.grade).toBe('road');
      expect(l.sharedMethods).toContain('mcp');
    }
    const split = world.links.find((l) => l.kinds.includes('split-from'))!;
    expect([split.a, split.b]).toEqual(['boxout-fantasy', 'hooplytics']);
    expect(world.links.some((l) => l.kinds.includes('shares') && l.carries === 'price history')).toBe(true);
    expect(world.links.some((l) => l.grade === 'surveyed')).toBe(true);
    expect(world.links.some((l) => l.grade === 'track')).toBe(true);
  });

  it('merge several links between the same pair into one', () => {
    seq = 0;
    const link = (id: string, at: string, a: string, b: string, kind: 'related' | 'shares' | 'feeds', carries?: string): WorldEvent => {
      const e: WorldEvent = { id, at, source: 'manual', type: 'link.formed', a, b, kind };
      if (carries !== undefined) e.carries = carries;
      return e;
    };
    const log = [
      founded('a', '2026-01-01'),
      founded('b', '2026-01-01'),
      founded('c', '2026-06-01'),
      link('l1', '2026-01-03', 'a', 'b', 'related'),
      link('l2', '2026-02-01', 'b', 'a', 'feeds', 'scores'),
      link('l3', '2026-02-02', 'a', 'b', 'related'),
      link('l4', '2026-02-03', 'a', 'c', 'related'),
      link('l5', '2026-02-04', 'a', 'missing', 'related'),
    ];
    const early = derive(log, catalogue, '2026-01-10');
    expect(early.links).toHaveLength(1);
    expect(early.links[0]).toMatchObject({ a: 'a', b: 'b', kinds: ['related'], grade: 'surveyed' });

    const mid = derive(log, catalogue, '2026-03-01');
    expect(mid.links).toHaveLength(1); // c is not founded yet
    expect(mid.links[0]).toMatchObject({
      a: 'b',
      b: 'a',
      kinds: ['related', 'feeds'],
      carries: 'scores',
      formedAt: '2026-01-03',
      grade: 'track', // a main between two sparks is not yet a road
    });
    expect(derive(log, catalogue, '2026-07-01').links).toHaveLength(2);
  });
});

describe('methods', () => {
  const level = (id: string) => world.methods.find((m) => m.id === id)?.level;

  it('returns every catalogue method, in catalogue order', () => {
    expect(world.methods.map((m) => m.id)).toEqual(catalogue.methods.map((m) => m.id));
  });

  it('levels match the brief', () => {
    expect(level('typescript')).toBe('mastered');
    expect(level('python')).toBe('mastered');
    expect(world.methods.filter((m) => m.level === 'mastered')).toHaveLength(2);
    for (const id of ['postgresql', 'data-engineering', 'ai-agents', 'mcp', 'llm-evaluation', 'product-design', 'investment-analytics', 'react']) {
      expect(level(id), id).toBe('fluent');
    }
    expect(level('mobile-development')).toBe('practised');
    expect(level('canvas-graphics')).toBe('practised');
    expect(level('fine-tuning')).toBe('noted');
    expect(level('computer-vision')).toBe('noted');
    expect(level('rust')).toBe('unknown');
  });

  it('evidence is the work logged to features that use the method', () => {
    for (const m of world.methods) {
      let total = 0;
      const perPlace: { place: string; commits: number }[] = [];
      for (const p of world.places) {
        const c = p.features.filter((f) => f.methods.includes(m.id)).reduce((s, f) => s + f.commits, 0);
        total += c;
        if (c > 0) perPlace.push({ place: p.id, commits: c });
      }
      expect(m.evidence, m.id).toBe(total);
      expect(m.places.length).toBe(perPlace.length);
      for (let i = 1; i < m.places.length; i++) {
        expect(m.places[i - 1]!.commits).toBeGreaterThanOrEqual(m.places[i]!.commits);
      }
      expect(m.firstUsedAt !== undefined).toBe(total > 0);
    }
  });

  it('work logged to a place alone teaches nothing', () => {
    seq = 0;
    const log = [
      founded('p', '2026-01-01'),
      proposed('p', 'f', '2026-01-01', ['rust']),
      work('p', '2026-01-04', 50),
    ];
    const w = derive(log, catalogue, '2026-01-10');
    expect(w.methods.find((m) => m.id === 'rust')?.level).toBe('noted');
    expect(w.methods.find((m) => m.id === 'rust')?.evidence).toBe(0);
  });

  it('were less developed in an earlier edition', () => {
    const early = derive(events, catalogue, '2024-01-01');
    const at = (id: string) => early.methods.find((m) => m.id === id)?.level;
    expect(at('python')).toBe('fluent');
    expect(at('mcp')).toBe('unknown');
  });
});

describe('performance', () => {
  function median(run: () => void, runs: number): number {
    const times: number[] = [];
    for (let i = 0; i < runs; i++) {
      const t0 = performance.now();
      run();
      times.push(performance.now() - t0);
    }
    times.sort((a, b) => a - b);
    return (times[runs / 2 - 1]! + times[runs / 2]!) / 2;
  }

  it('derives the fixture log in under 15 ms', () => {
    for (let i = 0; i < 5; i++) derive(events, catalogue, TODAY); // warm up
    const ms = median(() => derive(events, catalogue, TODAY), 20);
    console.log(`derive: ${events.length} fixture events, median ${ms.toFixed(3)} ms over 20 runs`);
    expect(ms).toBeLessThan(15);
  });

  it('derives 20,000 events in under 15 ms', () => {
    // The fixture world, copied under new names until the log passes 20,000 events.
    const big: WorldEvent[] = [];
    for (let copy = 0; big.length < 20000; copy++) {
      const tag = (id: string): string => `${id}#${copy}`;
      for (const e of events) {
        if (e.type === 'link.formed') big.push({ ...e, id: tag(e.id), a: tag(e.a), b: tag(e.b) });
        else if ('feature' in e && e.feature !== undefined) {
          big.push({ ...e, id: tag(e.id), place: tag(e.place), feature: tag(e.feature) });
        } else big.push({ ...e, id: tag(e.id), place: tag(e.place) });
      }
    }
    const log = mergeEvents([big]);
    const w = derive(log, catalogue, TODAY);
    expect(w.places.length).toBe(world.places.length * (log.length / events.length));
    for (let i = 0; i < 5; i++) derive(log, catalogue, TODAY);
    const ms = median(() => derive(log, catalogue, TODAY), 20);
    console.log(`derive: ${log.length} events (${w.places.length} places), median ${ms.toFixed(3)} ms over 20 runs`);
    expect(ms).toBeLessThan(15);
  });
});
