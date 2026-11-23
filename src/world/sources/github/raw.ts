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

// ───────────────────────── Evidence (version 2) ─────────────────────────
// Reading matter for src/understanding/. Every section is optional. A section that could
// not be read is LEFT OUT and its reason given in `absent`; it is never an empty list,
// because "not asked" and "GitHub said there are none" are different facts.

export interface GithubReadme {
  /** Path in the repository: `README.md`. */
  path: string;
  /** Decoded text, cut at 12,000 characters. */
  text: string;
  /** Length before the cut. */
  chars?: number;
  truncated?: boolean;
}

/** Since version 3: a document beside the README, chosen by src/understanding/documents.ts. */
export interface GithubDocument {
  path: string;
  /** `readme`: the README links to it. `name`: it stands at the top under a telling name. */
  via: 'readme' | 'name';
  /** Decoded text. Past 16,000 characters the middle is left out and a line says how much. */
  text: string;
  /** Length before the cut. */
  chars?: number;
  truncated?: boolean;
}

export interface GithubIssue {
  number: number;
  title: string;
  labels: string[];
  created_at?: string | null;
  updated_at: string | null;
}

export interface GithubTodoLine {
  path: string;
  /** TODO, FIXME, HACK or XXX. */
  marker: string;
  /** The line, trimmed and cut at 200 characters. */
  text: string;
}

export interface GithubCommitChange {
  sha7: string;
  date: string | null;
  /** At most 30 file paths. */
  files: string[];
  /** How many files the commit touched in all. */
  fileCount?: number;
  truncated?: boolean;
}

export interface GithubEvidence {
  /** `null`: GitHub said there is no README. Missing: it was not read (see `absent.readme`). */
  readme?: GithubReadme | null;
  /**
   * Since version 3. At most 4. Empty: nothing was pointed to. Missing: not looked for
   * (an older record, or see `absent.documents`).
   */
  documents?: GithubDocument[];
  /** More were pointed to than were read. */
  documentsTruncated?: boolean;
  /** Open issues (pull requests excluded), most recently updated first, at most 40. */
  issues?: GithubIssue[];
  issuesTruncated?: boolean;
  /** At most 20 lines. Missing whenever code search could not vouch for the repository. */
  todos?: GithubTodoLine[];
  todosTruncated?: boolean;
  /** Files touched by the 15 most recent commits on the default branch, newest first. */
  recentChanges?: GithubCommitChange[];
  /** Section name to the reason it is not here. */
  absent: Record<string, string>;
}

// ───────────────────────── The city's own definition (version 4) ─────────────────────────

/** `patrick-world.json` as it stood at one commit. The text is kept unread: definition.ts reads it. */
export interface GithubDefinitionRevision {
  sha7: string;
  /** ISO timestamp of the commit that wrote this revision. */
  date: string | null;
  text: string;
}

export interface GithubDefinition {
  path: string;
  /** Oldest first. The last one is the file as it stands. */
  revisions: GithubDefinitionRevision[];
  /** The file has more history than was read; the oldest revision here is not its first. */
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
  /** `declared`: asked about because the repository's own definition names it. */
  pathsConsidered?: { path: string; count?: number; asked: boolean; declared?: boolean }[];
  notes?: string[];
  /** Since version 2. Absent in older files, and in a repository the sync could not finish. */
  evidence?: GithubEvidence;
  /** Since version 4. Absent when the repository carries no patrick-world.json. */
  definition?: GithubDefinition;
}

export interface GithubRaw {
  /** 1: the record the map is drawn from. 2: the same, plus `evidence` on each repository. 3: evidence also carries `documents`. 4: a repository may carry its `definition`, and the paths it declares are asked about. */
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
