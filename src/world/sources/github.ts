// GitHub, as a source. Reads the raw record `npm run sync:github` wrote and reports the
// facts in it. The record is private and may simply not be there; that is not an error.

import type { Catalogue, Point, WorldEvent, WorldSource } from '../types';
import { isGithubRaw } from './github/raw';
import { surveyGithub } from './github/transform';

export const GITHUB_DATA_URL = '/data/github.json';

export type GitHubStatus = 'absent' | 'loaded' | 'error';

/** The part of `fetch` this source needs. */
export type FetchLike = (url: string) => Promise<{
  ok: boolean;
  status: number;
  headers: { get(name: string): string | null };
  text(): Promise<string>;
}>;

export class GitHubSource implements WorldSource {
  readonly id = 'github' as const;
  readonly label = 'GitHub';

  /** `absent` until a load finds the record; `error` if it was there but unreadable. */
  status: GitHubStatus = 'absent';
  /** ISO timestamp of the sync the record came from. */
  fetchedAt: string | null = null;
  repoCount = 0;
  /** How many places are drawn from their own patrick-world.json and not from guesses. */
  described = 0;
  /** True when the record is a team's: every person's commits count as work, not only the owner's. */
  everyone = false;
  /** What the owner would want to know about those files: a broken one, a link to nowhere. */
  definitionNotes: string[] = [];
  /** Why the status is `error`, in words. */
  problem: string | null = null;

  constructor(
    private readonly catalogue: Catalogue,
    private readonly isLand: (p: Point) => boolean,
    private readonly url: string = GITHUB_DATA_URL,
    private readonly fetcher?: FetchLike,
  ) {}

  /** Never throws: no record, or a broken one, is an empty source with a status that says why. */
  async load(): Promise<WorldEvent[]> {
    this.status = 'absent';
    this.fetchedAt = null;
    this.repoCount = 0;
    this.described = 0;
    this.everyone = false;
    this.definitionNotes = [];
    this.problem = null;
    try {
      const doFetch = this.fetcher ?? (globalThis as { fetch?: FetchLike }).fetch;
      if (doFetch === undefined) return [];
      const res = await doFetch(this.url);
      if (res.status === 404) return [];
      if (!res.ok) return this.fail(`The GitHub record could not be read (HTTP ${res.status}).`);
      const type = res.headers.get('content-type') ?? '';
      const text = await res.text();
      // A dev server answers a missing file with the app's own HTML page.
      if (type.includes('text/html') || text.trimStart().startsWith('<')) return [];
      let parsed: unknown;
      try {
        parsed = JSON.parse(text);
      } catch {
        return this.fail('The GitHub record is not valid JSON. Run: npm run sync:github');
      }
      if (!isGithubRaw(parsed)) return this.fail('The GitHub record is not in the expected shape. Run: npm run sync:github');
      const { events, described, notes } = surveyGithub(parsed, this.catalogue, this.isLand);
      this.described = described;
      this.everyone = parsed.everyone === true;
      this.definitionNotes = notes;
      this.status = 'loaded';
      this.fetchedAt = parsed.fetchedAt;
      this.repoCount = parsed.repos.length;
      return events;
    } catch (err) {
      return this.fail(err instanceof Error ? err.message : 'The GitHub record could not be read.');
    }
  }

  private fail(problem: string): WorldEvent[] {
    this.status = 'error';
    this.problem = problem;
    return [];
  }
}
