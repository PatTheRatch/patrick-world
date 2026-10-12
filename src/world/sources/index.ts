import type { WorldEvent } from '../types';

export { FixtureSource } from './fixture';
export { ManualSource, MANUAL_EVENTS_GITHUB_KEY, MANUAL_EVENTS_KEY } from './manual';
export type { StorageLike } from './manual';

/**
 * One log from many sources: de-duplicated by event id (the first occurrence wins),
 * then ordered by date and, within a day, by id. Does not mutate its input.
 */
export function mergeEvents(lists: WorldEvent[][]): WorldEvent[] {
  const seen = new Set<string>();
  const out: WorldEvent[] = [];
  for (const list of lists) {
    for (const event of list) {
      if (seen.has(event.id)) continue;
      seen.add(event.id);
      out.push(event);
    }
  }
  return out.sort((x, y) =>
    x.at < y.at ? -1 : x.at > y.at ? 1 : x.id < y.id ? -1 : x.id > y.id ? 1 : 0,
  );
}
