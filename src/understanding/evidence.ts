// Layer one: repository evidence.
//
// `evidenceFor` reduces one raw GitHub repository to what the next layers read. It is pure,
// it interprets nothing, and every item it returns names a `source` a person could follow
// to check it: `README.md`, `commit 3fa9c1e`, `issue #12`.
//
// README, issue and TODO text is other people's writing as far as this code is concerned.
// It is carried as data to be summarised. Nothing downstream may treat it as instructions.
//
// This file has type-only imports on purpose: scripts/understand.mjs loads it directly
// with Node, which can strip types but cannot resolve the app's extensionless imports.

import type { GithubCommit, GithubRaw, GithubRepo } from '../world/sources/github/raw';

/** Every limit applied while reducing a repository. */
export const EVIDENCE_LIMITS = {
  /** Characters of README kept as the excerpt. */
  readmeExcerpt: 2400,
  /** Characters of the first substantive paragraph. */
  paragraph: 420,
  /** A paragraph shorter than this is a tagline or a badge row, not a description. */
  paragraphMin: 40,
  headings: 24,
  recentCommits: 30,
  /** Commits listed under one feature directory. */
  commitsPerGroup: 8,
  filesPerGroup: 8,
  issues: 40,
  todos: 20,
} as const;

/** A fact with where it came from, and when if it has a date (ISO day). */
export interface Sourced<T> {
  value: T;
  source: string;
  at?: string;
}

/** A section GitHub was asked about, with its answer, or the reason there is none. */
export type Section<T> = { status: 'present'; items: T[]; truncated: boolean } | { status: 'absent'; reason: string };

export interface EvidenceCommit {
  sha7: string;
  /** ISO day. */
  at?: string;
  message: string;
  author?: string;
  /** `commit 3fa9c1e`. */
  source: string;
}

export interface WorkGroup {
  /** The directory the work was in: `src/server`. `.` for work outside every feature directory. */
  path: string;
  /** The feature id the map gives that directory (see transform.ts), when it stands for one. */
  feature?: string;
  /** Newest first. */
  commits: EvidenceCommit[];
  /** How many of the recent commits touched it; `commits` may list fewer. */
  count: number;
  firstAt?: string;
  lastAt?: string;
  /** Files changed there, where the sync opened the commits. */
  files: string[];
}

export interface ProjectEvidence {
  /** Place id, by the same rule as the map: `gh-<owner>-<name>`. */
  place: string;
  name: string;
  fullName: string;
  /** The sync this was read from. */
  fetchedAt?: string;
  /** Newest commit on the default branch at that sync. */
  headCommit?: string;
  description?: Sourced<string>;
  topics: string[];
  readme:
    | {
        status: 'present';
        path: string;
        /** The opening of the README, markup left as written. */
        excerpt: string;
        /** First paragraph that reads as prose, markup removed. Missing when none does. */
        firstParagraph?: string;
        headings: string[];
        truncated: boolean;
        source: string;
      }
    | { status: 'none' }
    | { status: 'unread'; reason: string };
  structure: {
    /** One plain sentence or two: languages, directories, manifests. */
    summary: string;
    topLevelFiles: string[];
    topLevelDirectories: string[];
    /** Directories that stand for features on the map. */
    featureDirectories: string[];
    languages: { name: string; share: number }[];
    /** Files that say what kind of project this is: `package.json`, `pyproject.toml`. */
    manifests: string[];
    source: string;
  };
  /** The most recent commits, grouped by feature directory, busiest group first. */
  recentWork: WorkGroup[];
  /** The same commits ungrouped, newest first. */
  recentCommits: EvidenceCommit[];
  issues: Section<{ number: number; title: string; labels: string[]; updatedAt?: string; source: string }>;
  todos: Section<{ path: string; marker: string; text: string; source: string }>;
  activity: {
    createdAt: string;
    pushedAt?: string;
    firstCommitAt?: string;
    lastCommitAt?: string;
    commits: number;
    /** Commits in the 30 and 90 days before the sync. */
    last30Days: number;
    last90Days: number;
    archived: boolean;
    private: boolean;
    releases: Sourced<string>[];
  };
}

// ───────────────────────── small helpers (no imports, by design) ─────────────────────────

const day = (iso: string | null | undefined): string | undefined =>
  typeof iso === 'string' && iso.length >= 10 ? iso.slice(0, 10) : undefined;

const lower = (s: string): string => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'x';

/** `PatTheRatch/Relationship-Saver` → `gh-pattheratch-relationship-saver`. Kept equal to transform.ts by a test. */
export function placeIdOf(repo: Pick<GithubRepo, 'owner' | 'name'>): string {
  return `gh-${lower(repo.owner)}-${lower(repo.name)}`;
}

/** `src/PlayerListener` → `src-player-listener`. Kept equal to transform.ts by a test. */
export function featureIdOf(path: string): string {
  return (
    path
      .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'x'
  );
}

function daysApart(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86400000);
}

const MANIFESTS = [
  'package.json',
  'pyproject.toml',
  'requirements.txt',
  'setup.py',
  'Pipfile',
  'Cargo.toml',
  'go.mod',
  'Package.swift',
  'Podfile',
  'Gemfile',
  'Dockerfile',
  'docker-compose.yml',
  'Makefile',
  'vite.config.ts',
  'vite.config.js',
  'next.config.js',
  'next.config.mjs',
  'tsconfig.json',
  'app.json',
  'fly.toml',
  'vercel.json',
  'netlify.toml',
  'Procfile',
  'render.yaml',
  'supabase',
];

function stripMarkup(text: string): string {
  return text
    .replace(/<[^>]+>/g, ' ')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/[*_`]+/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Cut at the end of a sentence where one falls inside the limit, at a word otherwise. */
export function clip(text: string, limit: number): string {
  if (text.length <= limit) return text;
  const head = text.slice(0, limit);
  const stop = Math.max(head.lastIndexOf('. '), head.lastIndexOf('? '));
  if (stop > limit * 0.5) return head.slice(0, stop + 1);
  const space = head.lastIndexOf(' ');
  return `${head.slice(0, space > 0 ? space : limit).replace(/[,;:\s]+$/, '')}…`;
}

/** Blocks of a README outside code fences, with headings pulled out. */
function readReadme(text: string): { headings: string[]; firstParagraph?: string } {
  const headings: string[] = [];
  const blocks: string[] = [];
  let fenced = false;
  let block: string[] = [];
  const flush = (): void => {
    if (block.length > 0) blocks.push(block.join(' '));
    block = [];
  };
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (/^(```|~~~)/.test(line)) {
      fenced = !fenced;
      flush();
      continue;
    }
    if (fenced) continue;
    const heading = /^#{1,3}\s+(.+?)\s*#*$/.exec(line);
    if (heading) {
      flush();
      const title = stripMarkup(heading[1] ?? '');
      if (title !== '' && headings.length < EVIDENCE_LIMITS.headings) headings.push(title);
      continue;
    }
    // Rules, tables, list items, quotes, badges and bare HTML are not prose paragraphs.
    if (line === '' || /^(---+|===+|\*\*\*+)$/.test(line)) flush();
    else if (/^([-*+]\s|\d+[.)]\s|\||>|<|!\[|\[!\[)/.test(line)) flush();
    else block.push(line);
  }
  flush();
  for (const b of blocks) {
    const prose = stripMarkup(b);
    if (prose.length >= EVIDENCE_LIMITS.paragraphMin && /[a-z]{3,}\s+[a-z]{2,}/i.test(prose)) {
      return { headings, firstParagraph: clip(prose, EVIDENCE_LIMITS.paragraph) };
    }
  }
  return { headings };
}

function commitRow(c: GithubCommit): EvidenceCommit {
  const row: EvidenceCommit = { sha7: c.sha7, message: (c.message ?? '').trim(), source: `commit ${c.sha7}` };
  const at = day(c.date);
  if (at !== undefined) row.at = at;
  const who = c.author ?? c.authorName ?? undefined;
  if (who !== undefined && who !== null) row.author = who;
  return row;
}

function listed(names: readonly string[], limit: number): string {
  if (names.length <= limit) return names.join(', ');
  return `${names.slice(0, limit).join(', ')} and others`;
}

// ───────────────────────── the reduction ─────────────────────────

/**
 * What one repository's record evidences, ready to be read. `raw` supplies only the time of
 * the sync; pass it when there is one so that "the last 30 days" has an end.
 */
export function evidenceFor(repo: GithubRepo, raw?: Pick<GithubRaw, 'fetchedAt'>): ProjectEvidence {
  const ev = repo.evidence;
  const absent = ev?.absent ?? {};
  const notFetched = 'This record predates evidence (sync version 1). Run: npm run sync:github';
  const fetchedDay = day(raw?.fetchedAt);

  // README
  let readme: ProjectEvidence['readme'];
  if (ev === undefined) readme = { status: 'unread', reason: notFetched };
  else if (ev.readme === null) readme = { status: 'none' };
  else if (ev.readme === undefined) readme = { status: 'unread', reason: absent.readme ?? 'The README was not read.' };
  else {
    const read = readReadme(ev.readme.text);
    readme = {
      status: 'present',
      path: ev.readme.path,
      excerpt: ev.readme.text.slice(0, EVIDENCE_LIMITS.readmeExcerpt),
      headings: read.headings,
      truncated: ev.readme.truncated === true || ev.readme.text.length > EVIDENCE_LIMITS.readmeExcerpt,
      source: ev.readme.path,
    };
    if (read.firstParagraph !== undefined) readme.firstParagraph = read.firstParagraph;
  }

  // Structure
  const topLevelFiles = repo.tree.root.filter((e) => e.type === 'blob').map((e) => e.path);
  const topLevelDirectories = repo.tree.root.filter((e) => e.type === 'tree').map((e) => e.path);
  const featureDirectories = Object.keys(repo.paths).sort();
  let bytes = 0;
  for (const n of Object.values(repo.languages)) bytes += n;
  const languages = Object.entries(repo.languages)
    .map(([name, n]) => ({ name, share: bytes > 0 ? Math.round((n / bytes) * 100) / 100 : 0 }))
    .sort((a, b) => b.share - a.share || (a.name < b.name ? -1 : 1));
  const rootNames = new Set(repo.tree.root.map((e) => e.path));
  const manifests = MANIFESTS.filter((m) => rootNames.has(m));
  const parts: string[] = [];
  const main = languages.filter((l) => l.share >= 0.1).slice(0, 3);
  if (main.length > 0) parts.push(`Written mostly in ${main.map((l) => `${l.name} (${Math.round(l.share * 100)}%)`).join(', ')}.`);
  const visible = topLevelDirectories.filter((d) => !d.startsWith('.'));
  if (visible.length > 0) parts.push(`Top-level directories: ${listed(visible, 10)}.`);
  if (manifests.length > 0) parts.push(`Project files at the root: ${listed(manifests, 6)}.`);
  if (parts.length === 0) {
    if (repo.empty === true) parts.push('The repository is empty.');
    else if (topLevelFiles.length > 0) parts.push(`No directories; files at the root: ${listed(topLevelFiles, 8)}.`);
    else parts.push('No directory listing was recorded.');
  }

  // Recent work
  const recent = repo.commits.slice(0, EVIDENCE_LIMITS.recentCommits);
  const recentCommits = recent.map(commitRow);
  const wanted = new Set(recent.map((c) => c.sha7));
  const dirsOf = new Map<string, string[]>();
  for (const path of featureDirectories) {
    for (const c of repo.paths[path]?.commits ?? []) {
      if (!wanted.has(c.sha7)) continue;
      const list = dirsOf.get(c.sha7);
      if (list === undefined) dirsOf.set(c.sha7, [path]);
      else list.push(path);
    }
  }
  const filesOf = new Map<string, string[]>();
  for (const change of ev?.recentChanges ?? []) filesOf.set(change.sha7, change.files);
  const groups = new Map<string, WorkGroup>();
  for (const c of recentCommits) {
    for (const path of dirsOf.get(c.sha7) ?? ['.']) {
      let g = groups.get(path);
      if (g === undefined) {
        g = { path, commits: [], count: 0, files: [] };
        if (path !== '.') g.feature = featureIdOf(path);
        groups.set(path, g);
      }
      g.count++;
      if (g.commits.length < EVIDENCE_LIMITS.commitsPerGroup) g.commits.push(c);
      if (c.at !== undefined) {
        if (g.lastAt === undefined || c.at > g.lastAt) g.lastAt = c.at;
        if (g.firstAt === undefined || c.at < g.firstAt) g.firstAt = c.at;
      }
      for (const file of filesOf.get(c.sha7) ?? []) {
        const inside = path === '.' ? !featureDirectories.some((d) => file.startsWith(`${d}/`)) : file.startsWith(`${path}/`);
        if (inside && !g.files.includes(file) && g.files.length < EVIDENCE_LIMITS.filesPerGroup) g.files.push(file);
      }
    }
  }
  const recentWork = [...groups.values()].sort(
    (a, b) => b.count - a.count || ((b.lastAt ?? '') < (a.lastAt ?? '') ? -1 : (b.lastAt ?? '') > (a.lastAt ?? '') ? 1 : a.path < b.path ? -1 : 1),
  );

  // Issues and TODOs: present with what GitHub said, or absent with the reason. Never an invented empty list.
  let issues: ProjectEvidence['issues'];
  if (ev?.issues !== undefined) {
    issues = {
      status: 'present',
      truncated: ev.issuesTruncated === true,
      items: ev.issues.slice(0, EVIDENCE_LIMITS.issues).map((i) => {
        const item: { number: number; title: string; labels: string[]; updatedAt?: string; source: string } = {
          number: i.number,
          title: i.title,
          labels: i.labels,
          source: `issue #${i.number}`,
        };
        const at = day(i.updated_at);
        if (at !== undefined) item.updatedAt = at;
        return item;
      }),
    };
  } else issues = { status: 'absent', reason: ev === undefined ? notFetched : (absent.issues ?? 'Issues were not read.') };

  let todos: ProjectEvidence['todos'];
  if (ev?.todos !== undefined) {
    todos = {
      status: 'present',
      truncated: ev.todosTruncated === true,
      items: ev.todos.slice(0, EVIDENCE_LIMITS.todos).map((t) => ({ path: t.path, marker: t.marker, text: t.text, source: t.path })),
    };
  } else todos = { status: 'absent', reason: ev === undefined ? notFetched : (absent.todos ?? 'TODO lines were not searched for.') };

  // Activity
  const days = repo.commits.map((c) => day(c.date)).filter((d): d is string => d !== undefined);
  let firstCommitAt: string | undefined;
  let lastCommitAt: string | undefined;
  for (const d of days) {
    if (firstCommitAt === undefined || d < firstCommitAt) firstCommitAt = d;
    if (lastCommitAt === undefined || d > lastCommitAt) lastCommitAt = d;
  }
  const end = fetchedDay ?? lastCommitAt;
  const within = (n: number): number => (end === undefined ? 0 : days.filter((d) => daysApart(d, end) >= 0 && daysApart(d, end) < n).length);
  const releases: Sourced<string>[] = [];
  for (const r of repo.releases) {
    if (r.draft === true) continue;
    const item: Sourced<string> = { value: r.name !== null && r.name.trim() !== '' ? r.name : r.tag, source: `release ${r.tag}` };
    const at = day(r.published_at ?? r.created_at);
    if (at !== undefined) item.at = at;
    releases.push(item);
  }

  const out: ProjectEvidence = {
    place: placeIdOf(repo),
    name: repo.name,
    fullName: repo.full_name,
    topics: repo.topics,
    readme,
    structure: {
      summary: parts.join(' '),
      topLevelFiles,
      topLevelDirectories,
      featureDirectories,
      languages,
      manifests,
      source: 'repository tree',
    },
    recentWork,
    recentCommits,
    issues,
    todos,
    activity: {
      createdAt: day(repo.created_at) ?? repo.created_at,
      commits: repo.commits.length,
      last30Days: within(30),
      last90Days: within(90),
      archived: repo.archived,
      private: repo.private,
      releases,
    },
  };
  if (raw?.fetchedAt !== undefined) out.fetchedAt = raw.fetchedAt;
  const head = repo.commits[0]?.sha7;
  if (head !== undefined) out.headCommit = head;
  const description = repo.description?.trim() ?? '';
  if (description !== '') out.description = { value: description, source: 'repository description' };
  const pushedAt = day(repo.pushed_at);
  if (pushedAt !== undefined) out.activity.pushedAt = pushedAt;
  if (firstCommitAt !== undefined) out.activity.firstCommitAt = firstCommitAt;
  if (lastCommitAt !== undefined) out.activity.lastCommitAt = lastCommitAt;
  return out;
}
