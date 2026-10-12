// The shape of public/data/github.json, as written by scripts/github-fetch.mjs.
// A record of what GitHub said, with GitHub's own field names where it has them.
// Nothing here is interpreted; that is transform.ts.

export interface GithubCommit {
  /** First seven characters of the commit sha. */
  sha7: string;
  /** ISO timestamp the commit was authored, in UTC. */
  date: string | null;
  /** The GitHub login the commit is linked to; null when its e-mail is linked to none. */
  author: string | null;
  /** The name written in the commit itself. */
  authorName?: string | null;
  /** First line of the message. */
  message?: string;
}

export interface GithubRelease {
  tag: string;
  name: string | null;
  published_at: string | null;
  created_at?: string | null;
  draft?: boolean;
  prerelease?: boolean;
}

export interface GithubTag {
  name: string;
  sha7: string;
  /** Date of the tagged commit, where it was cheap to learn. */
  date: string | null;
}

export interface GithubTreeEntry {
  path: string;
  /** `tree` is a directory, `blob` a file. */
  type: string;
}

export interface GithubPathHistory {
  /** Commits on the default branch that touched the directory. */
  commits: GithubCommit[];
  truncated?: boolean;
}

export interface GithubRepo {
  owner: string;
  name: string;
  full_name: string;
  description: string | null;
  topics: string[];
  created_at: string;
  pushed_at: string | null;
  archived: boolean;
  private: boolean;
  fork?: boolean;
  default_branch: string;
  language: string | null;
  /** Bytes of code per language. */
  languages: Record<string, number>;
  releases: GithubRelease[];
  tags: GithubTag[];
  /** True when GitHub answered 409: a repository with nothing in it. */
  empty?: boolean;
  /** Default branch, newest first as GitHub returns it. */
  commits: GithubCommit[];
  commitsTruncated?: boolean;
  tree: {
    root: GithubTreeEntry[];
    /** Listings of opened directories, keyed by path: `src`, or `src/launchpad`. */
    inside: Record<string, GithubTreeEntry[]>;
  };
  /** History per directory the script asked about, keyed by path. */
  paths: Record<string, GithubPathHistory>;
  pathsConsidered?: { path: string; count?: number; asked: boolean }[];
  notes?: string[];
}

export interface GithubRaw {
  version: number;
  /** ISO timestamp of the sync. The world's "today" when this data is on the map. */
  fetchedAt: string;
  /** The owner's logins. */
  accounts: string[];
  /** Display names on those accounts' profiles. */
  profileNames?: string[];
  includeForks?: boolean;
  maxCommits?: number;
  /** False when the sync stopped early (a rate limit, say). */
  complete?: boolean;
  stoppedBecause?: string | null;
  forksSkipped?: number;
  repos: GithubRepo[];
}

/** Enough of a check to tell the real file from an HTML fallback or a half-written one. */
export function isGithubRaw(value: unknown): value is GithubRaw {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Record<string, unknown>;
  return typeof v.fetchedAt === 'string' && Array.isArray(v.accounts) && Array.isArray(v.repos);
}
