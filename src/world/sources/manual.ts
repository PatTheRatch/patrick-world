import type { WorldEvent, WorldSource } from '../types';

export const MANUAL_EVENTS_KEY = 'patricks-world/manual-events/v1';
/** Marks made on the surveyed (GitHub) sheet are kept apart from marks made on the specimen. */
export const MANUAL_EVENTS_GITHUB_KEY = 'patricks-world/manual-events/github/v1';

/** The part of `Storage` this source needs. */
export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

type Listener = (events: WorldEvent[]) => void;

function defaultStorage(): StorageLike | null {
  try {
    const storage = (globalThis as { localStorage?: StorageLike }).localStorage;
    if (storage === undefined || storage === null) return null;
    // Some browsers hand out a storage object that throws on first use.
    storage.getItem(MANUAL_EVENTS_KEY);
    return storage;
  } catch {
    return null;
  }
}

function looksLikeEvent(value: unknown): value is WorldEvent {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Record<string, unknown>;
  return typeof v.id === 'string' && typeof v.at === 'string' && typeof v.type === 'string';
}

/**
 * What Patrick adds in the app. Kept as JSON in local storage under one key; if storage
 * is missing, full or forbidden, it carries on in memory for the session and never throws.
 */
export class ManualSource implements WorldSource {
  readonly id = 'manual' as const;
  readonly label = 'Added by hand';

  private readonly storage: StorageLike | null;
  private events: WorldEvent[];
  private readonly listeners = new Set<Listener>();

  private readonly key: string;

  /**
   * Pass a storage to use instead of `localStorage`, or `null` to keep events in memory only;
   * and a key, so that different sheets keep different marks.
   */
  constructor(storage?: StorageLike | null, key: string = MANUAL_EVENTS_KEY) {
    this.key = key;
    this.storage = storage === undefined ? defaultStorage() : storage;
    this.events = this.read();
  }

  load(): Promise<WorldEvent[]> {
    return Promise.resolve(this.all());
  }

  /** A copy of every stored event, in the order they were added. */
  all(): WorldEvent[] {
    return this.events.slice();
  }

  /**
   * Store events. An event whose id is already stored is ignored, since the same fact
   * always has the same id. Subscribers are told about the ones that were new.
   */
  add(events: WorldEvent[]): void {
    const known = new Set<string>();
    for (const event of this.events) known.add(event.id);
    const fresh: WorldEvent[] = [];
    for (const event of events) {
      if (known.has(event.id)) continue;
      known.add(event.id);
      fresh.push(event);
    }
    if (fresh.length === 0) return;
    this.events = this.events.concat(fresh);
    this.write();
    this.emit(fresh);
  }

  /** Forget everything. Subscribers are called with an empty list: reload to see the result. */
  clear(): void {
    this.events = [];
    try {
      this.storage?.removeItem(this.key);
    } catch {
      // Memory is already clear; nothing else to do.
    }
    this.emit([]);
  }

  subscribe(onEvents: Listener): () => void {
    this.listeners.add(onEvents);
    return () => {
      this.listeners.delete(onEvents);
    };
  }

  private emit(events: WorldEvent[]): void {
    for (const listener of Array.from(this.listeners)) listener(events.slice());
  }

  private read(): WorldEvent[] {
    try {
      const raw = this.storage?.getItem(this.key);
      if (raw === null || raw === undefined) return [];
      const parsed: unknown = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed.filter(looksLikeEvent) : [];
    } catch {
      return [];
    }
  }

  private write(): void {
    try {
      this.storage?.setItem(this.key, JSON.stringify(this.events));
    } catch {
      // Storage is full or forbidden: the events stay in memory for this session.
    }
  }
}
