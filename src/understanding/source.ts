// Reads the understandings somebody wrote (see scripts/understand.mjs) from the private
// data directory. The file may simply not be there; that is not an error, and the world
// draws exactly the same without it.
//
// What comes back is advisory text to show beside the map. Nothing here is fed into the
// event log or the derivation.

import { isProjectUnderstanding, type ProjectUnderstanding } from './types';

export const UNDERSTANDING_DATA_URL = '/data/understanding.json';

/** The part of `fetch` this needs. The same shape the GitHub source uses. */
export type FetchLike = (url: string) => Promise<{
  ok: boolean;
  status: number;
  headers: { get(name: string): string | null };
  text(): Promise<string>;
}>;

/**
 * Place id to understanding. Never throws: a missing file, the dev server's HTML fallback,
 * broken JSON or a wrong shape all give an empty map, and a single malformed entry is left
 * out without costing the rest.
 */
export async function loadUnderstanding(url: string = UNDERSTANDING_DATA_URL, fetcher?: FetchLike): Promise<Map<string, ProjectUnderstanding>> {
  const out = new Map<string, ProjectUnderstanding>();
  try {
    const doFetch = fetcher ?? (globalThis as { fetch?: FetchLike }).fetch;
    if (doFetch === undefined) return out;
    const res = await doFetch(url);
    if (!res.ok) return out;
    const type = res.headers.get('content-type') ?? '';
    const text = await res.text();
    // A dev server answers a missing file with the app's own HTML page, and says 200.
    if (type.includes('text/html') || text.trimStart().startsWith('<')) return out;
    const parsed: unknown = JSON.parse(text);
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return out;
    for (const [place, value] of Object.entries(parsed as Record<string, unknown>)) {
      // The key is the place; an entry filed under one place and claiming another is refused.
      if (isProjectUnderstanding(value) && value.place === place) out.set(place, value);
    }
  } catch {
    return new Map();
  }
  return out;
}
