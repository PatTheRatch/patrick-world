import { describe, expect, it } from 'vitest';
import { fixtureEvents } from './fixtures/world';
import {
  FixtureSource,
  ManualSource,
  MANUAL_EVENTS_GITHUB_KEY,
  MANUAL_EVENTS_KEY,
  mergeEvents,
  type StorageLike,
} from './sources';
import type { WorldEvent } from './types';

function note(id: string, at: string, source: WorldEvent['source'] = 'manual'): WorldEvent {
  return { id, at, source, type: 'place.noted', place: 'somewhere', note: id };
}

function memoryStorage(): StorageLike & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return {
    data,
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => {
      data.set(key, value);
    },
    removeItem: (key) => {
      data.delete(key);
    },
  };
}

const brokenStorage: StorageLike = {
  getItem: () => {
    throw new Error('denied');
  },
  setItem: () => {
    throw new Error('denied');
  },
  removeItem: () => {
    throw new Error('denied');
  },
};

describe('ManualSource: one set of marks per key', () => {
  it('keeps marks under different keys apart in the same storage', () => {
    const storage = memoryStorage();
    const specimen = new ManualSource(storage);
    const surveyed = new ManualSource(storage, MANUAL_EVENTS_GITHUB_KEY);
    specimen.add([note('on-the-fiction', '2026-01-01')]);
    surveyed.add([note('on-the-survey', '2026-01-02')]);
    expect(MANUAL_EVENTS_GITHUB_KEY).toBe('patricks-world/manual-events/github/v1');
    expect(new ManualSource(storage).all().map((e) => e.id)).toEqual(['on-the-fiction']);
    expect(new ManualSource(storage, MANUAL_EVENTS_GITHUB_KEY).all().map((e) => e.id)).toEqual(['on-the-survey']);
    surveyed.clear();
    expect(storage.data.has(MANUAL_EVENTS_GITHUB_KEY)).toBe(false);
    expect(new ManualSource(storage).all()).toHaveLength(1);
  });
});

describe('mergeEvents', () => {
  it('de-duplicates by id, keeping the first seen', () => {
    const a = [note('n1', '2025-01-02'), note('n2', '2025-01-01')];
    const b = [note('n1', '2025-01-02', 'github'), note('n3', '2025-01-01')];
    const merged = mergeEvents([a, b]);
    expect(merged.map((e) => e.id)).toEqual(['n2', 'n3', 'n1']);
    expect(merged.find((e) => e.id === 'n1')?.source).toBe('manual');
  });

  it('sorts by date then id and leaves its input alone', () => {
    const list = [note('b', '2025-03-01'), note('a', '2025-03-01'), note('z', '2024-01-01')];
    const before = JSON.stringify(list);
    expect(mergeEvents([list]).map((e) => e.id)).toEqual(['z', 'a', 'b']);
    expect(JSON.stringify(list)).toBe(before);
  });

  it('merging the fixture log with itself changes nothing', () => {
    const events = fixtureEvents();
    expect(mergeEvents([events, fixtureEvents()])).toEqual(events);
  });
});

describe('FixtureSource', () => {
  it('loads the same events every time', async () => {
    const source = new FixtureSource();
    expect(source.id).toBe('fixture');
    const first = await source.load();
    const second = await source.load();
    expect(first).toEqual(second);
    expect(first).not.toBe(second);
    expect(first.length).toBeGreaterThan(1000);
  });
});

describe('ManualSource', () => {
  it('stores under the documented key and reads it back', async () => {
    const storage = memoryStorage();
    const source = new ManualSource(storage);
    source.add([note('m1', '2026-10-12'), note('m2', '2026-10-12')]);
    expect(MANUAL_EVENTS_KEY).toBe('patricks-world/manual-events/v1');
    expect(JSON.parse(storage.data.get(MANUAL_EVENTS_KEY) ?? '[]')).toHaveLength(2);

    const reopened = new ManualSource(storage);
    expect(reopened.all().map((e) => e.id)).toEqual(['m1', 'm2']);
    expect(await reopened.load()).toEqual(source.all());
  });

  it('ignores an id it already has', () => {
    const source = new ManualSource(memoryStorage());
    source.add([note('m1', '2026-10-12')]);
    source.add([note('m1', '2026-10-12'), note('m2', '2026-10-13')]);
    expect(source.all().map((e) => e.id)).toEqual(['m1', 'm2']);
  });

  it('tells subscribers what was added, until they unsubscribe', () => {
    const source = new ManualSource(null);
    const seen: string[][] = [];
    const stop = source.subscribe((events) => seen.push(events.map((e) => e.id)));
    source.add([note('m1', '2026-10-12')]);
    source.add([note('m1', '2026-10-12')]); // nothing new, no call
    source.clear();
    stop();
    source.add([note('m2', '2026-10-12')]);
    expect(seen).toEqual([['m1'], []]);
    expect(source.all().map((e) => e.id)).toEqual(['m2']);
  });

  it('clears storage', () => {
    const storage = memoryStorage();
    const source = new ManualSource(storage);
    source.add([note('m1', '2026-10-12')]);
    source.clear();
    expect(source.all()).toEqual([]);
    expect(storage.data.has(MANUAL_EVENTS_KEY)).toBe(false);
  });

  it('falls back to memory when storage is missing or throws', () => {
    for (const source of [new ManualSource(), new ManualSource(null), new ManualSource(brokenStorage)]) {
      expect(() => source.add([note('m1', '2026-10-12')])).not.toThrow();
      expect(source.all()).toHaveLength(1);
      expect(() => source.clear()).not.toThrow();
      expect(source.all()).toEqual([]);
    }
  });

  it('survives corrupt stored data', () => {
    const storage = memoryStorage();
    storage.data.set(MANUAL_EVENTS_KEY, '{not json');
    expect(new ManualSource(storage).all()).toEqual([]);
    storage.data.set(MANUAL_EVENTS_KEY, JSON.stringify([{ nope: true }, note('ok', '2026-01-01')]));
    expect(new ManualSource(storage).all().map((e) => e.id)).toEqual(['ok']);
  });
});
