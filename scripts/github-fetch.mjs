#!/usr/bin/env node
// Fetch what GitHub knows about the owner's repositories and write it, uninterpreted,
// to public/data/github.json. Run as `npm run sync:github`.
//
//   --accounts a,b     logins to read (default: every account `gh auth status` lists)
//   --include-forks    also record forks
//   --max-commits N    commits per repository on the default branch (default 5000)
//
// Read-only: every call is a GET through `gh api`. The token for each account is taken
// from `gh auth token --user <login>` and handed to `gh` in the GH_TOKEN environment
// variable; it is never printed and never written anywhere.
//
// Since version 2 each repository also carries `evidence`: its README, open issue titles,
// TODO-style lines where code search offers them, and the files its latest commits touched.
// Since version 3 it also carries `documents`: the files its README points to and the ones
// at its top with a telling name (STATUS, ROADMAP, PLAN); a long one keeps its opening and its end.
// That is reading matter for src/understanding/, kept under its own key so that anything
// written against version 1 reads the file exactly as before.
// Since version 4 a repository that carries `patrick-world.json` also has `definition`: the
// file as it stood at each commit that touched it, oldest first, so that every claim in it
// can be dated. A revision never changes, so one already in the last record is not asked for
// again. The paths the newest readable revision declares are asked about like directories.
//
// The file is a record of what GitHub said. The one choice made here is WHICH directories
// to ask about (`candidateDirs`, which must stay in step with the same rule in
// src/world/sources/github/transform.ts). What any of it means is the transform's business.
//
// The output is private data. public/data/ is in .gitignore; keep it there.

import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// The choice of documents is typed and tested in the app's source. Node strips the types.
import { cutDocument, documentCandidates } from '../src/understanding/documents.ts';
// So is the reading of a city's own definition, which says which paths to ask about.
import { DEFINITION_FILE, parseDefinition } from '../src/world/definition.ts';

const OUT = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'data', 'github.json');

const SOURCE_ROOTS = ['src', 'app', 'apps', 'packages', 'lib', 'services', 'server', 'client'];
const EXCLUDED = new Set([
  'node_modules', 'dist', 'build', 'public', 'assets', 'static', 'docs', 'test', 'tests',
  '__tests__', 'e2e', 'scripts', 'vendor', 'coverage', 'examples', 'fixtures',
]);
const MAX_DIRS = 14;
const MAX_PATH_COMMITS = 1000;
/** Tags are only dated (one call each) when there are this few of them. */
const MAX_TAGS_DATED = 30;

/** Limits on the evidence recorded per repository. */
const EVIDENCE = {
  readmeChars: 12000,
  issues: 40,
  todoLines: 20,
  todoLineChars: 200,
  commitsWithFiles: 15,
  filesPerCommit: 30,
  /** Code search allows very few calls a minute. Wait for its window at most this many times, then stop asking. */
  searchWaits: 2,
  searchWaitMaxSeconds: 70,
};
const TODO_MARKERS = /\b(TODO|FIXME|HACK|XXX)\b/;

/** Limits on a city's own definition. */
const DEFINITION = {
  /** Revisions read per repository, newest kept. Past this the oldest are left out and the record says so. */
  revisions: 200,
  /** A file longer than this is not a definition. */
  chars: 200000,
};

// ───────────────────────── arguments ─────────────────────────

function parseArgs(argv) {
  const out = { accounts: null, includeForks: false, maxCommits: 5000 };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--accounts') out.accounts = String(argv[++i] ?? '').split(',').map((s) => s.trim()).filter(Boolean);
    else if (a.startsWith('--accounts=')) out.accounts = a.slice(11).split(',').map((s) => s.trim()).filter(Boolean);
    else if (a === '--include-forks') out.includeForks = true;
    else if (a === '--max-commits') out.maxCommits = Number(argv[++i]);
    else if (a.startsWith('--max-commits=')) out.maxCommits = Number(a.slice(14));
    else if (a === '--help' || a === '-h') {
      console.log('usage: npm run sync:github -- [--accounts a,b] [--include-forks] [--max-commits N]');
      process.exit(0);
    } else {
      console.error(`Unknown argument: ${a}`);
      process.exit(2);
    }
  }
  if (!Number.isFinite(out.maxCommits) || out.maxCommits < 1) {
    console.error('--max-commits needs a positive number');
    process.exit(2);
  }
  return out;
}

// ───────────────────────── gh ─────────────────────────

class RateLimited extends Error {}

function gh(args, env) {
  return spawnSync('gh', args, {
    encoding: 'utf8',
    maxBuffer: 256 * 1024 * 1024,
    env: env ? { ...process.env, ...env } : process.env,
  });
}

function listAccounts() {
  const r = gh(['auth', 'status']);
  const text = `${r.stdout ?? ''}\n${r.stderr ?? ''}`;
  const logins = [];
  for (const m of text.matchAll(/Logged in to github\.com account (\S+)/g)) {
    if (!logins.includes(m[1])) logins.push(m[1]);
  }
  return logins;
}

function tokenFor(login) {
  const r = gh(['auth', 'token', '--hostname', 'github.com', '--user', login]);
  const token = (r.stdout ?? '').trim();
  if (r.status !== 0 || token === '') throw new Error(`No gh token for account ${login}. Run: gh auth login`);
  return token;
}

let calls = 0;

/**
 * One GET. Returns { status, headers, body } and never throws on a 4xx: the caller decides
 * what a 404 or a 409 means. A spent rate limit throws RateLimited.
 */
function get(token, path, { accept = 'application/vnd.github+json', soft = false } = {}) {
  calls++;
  const r = gh(['api', '--hostname', 'github.com', '-i', '-H', `Accept: ${accept}`, path], {
    GH_TOKEN: token,
  });
  const out = r.stdout ?? '';
  const split = out.search(/\r?\n\r?\n/);
  const head = split === -1 ? out : out.slice(0, split);
  const bodyText = split === -1 ? '' : out.slice(split).replace(/^\s+/, '');
  const lines = head.split(/\r?\n/);
  const status = Number((lines[0] ?? '').split(' ')[1] ?? 0);
  const headers = {};
  for (const line of lines.slice(1)) {
    const at = line.indexOf(':');
    if (at > 0) headers[line.slice(0, at).trim().toLowerCase()] = line.slice(at + 1).trim();
  }
  if (!status) throw new Error(`gh api failed for ${path}: ${(r.stderr ?? '').trim().split('\n')[0]}`);
  const limited = status === 429 || (status === 403 && (headers['x-ratelimit-remaining'] === '0' || 'retry-after' in headers));
  // `soft`: an optional section must never stop the sync. The caller is told and moves on.
  if (limited && soft) return { status, headers, body: null, limited: true };
  if (limited) {
    throw new RateLimited(`GitHub rate limit reached (resets at epoch ${headers['x-ratelimit-reset'] ?? 'unknown'}).`);
  }
  let body = null;
  try {
    body = bodyText === '' ? null : JSON.parse(bodyText);
  } catch {
    body = null;
  }
  return { status, headers, body };
}

function nextLink(headers) {
  const m = /<([^>]+)>;\s*rel="next"/.exec(headers.link ?? '');
  return m ? m[1] : null;
}

function lastPage(headers) {
  const m = /[?&]page=(\d+)[^>]*>;\s*rel="last"/.exec(headers.link ?? '');
  return m ? Number(m[1]) : null;
}

/** Follow `rel="next"` until there is none or `limit` items are in hand. */
function getAll(token, path, limit = Infinity) {
  const items = [];
  let url = path;
  let status = 0;
  let truncated = false;
  while (url) {
    const r = get(token, url);
    status = r.status;
    if (r.status !== 200 || !Array.isArray(r.body)) break;
    items.push(...r.body);
    url = nextLink(r.headers);
    if (items.length >= limit) {
      truncated = url !== null || items.length > limit;
      items.length = Math.min(items.length, limit);
      break;
    }
  }
  return { items, status, truncated };
}

// ───────────────────────── shaping ─────────────────────────

const firstLine = (s) => String(s ?? '').split('\n')[0].slice(0, 200);

function commitRow(c) {
  return {
    sha7: String(c.sha).slice(0, 7),
    date: c.commit?.author?.date ?? c.commit?.committer?.date ?? null,
    // The GitHub account the commit is linked to; null when its e-mail is linked to none.
    author: c.author?.login ?? null,
    // The name written in the commit itself.
    authorName: c.commit?.author?.name ?? null,
    message: firstLine(c.commit?.message),
  };
}

/** Not build output, not tests, not an editor's project bundle. */
const usable = (name) =>
  !name.startsWith('.') &&
  !EXCLUDED.has(name.toLowerCase()) &&
  !/\.(xcodeproj|xcworkspace|xcassets)$/i.test(name) &&
  !/(^|[-_.])tests?$/i.test(name) &&
  !/[a-z0-9]Tests?$/.test(name);
const dirsOf = (tree) => tree.filter((e) => e.type === 'tree').map((e) => e.path);

/**
 * Directories worth asking about: a conventional source root is opened and its
 * directories stand for it; every other top-level directory stands for itself. A root
 * holding exactly one directory (`src/<package>/…`, the usual Python layout) is opened
 * one level further, so a whole project is not reported as one directory.
 */
function candidateDirs(root, inside) {
  const out = [];
  for (const name of dirsOf(root)) {
    if (!usable(name)) continue;
    if (!SOURCE_ROOTS.includes(name)) {
      out.push(name);
      continue;
    }
    const children = dirsOf(inside[name] ?? []).filter(usable);
    if (children.length === 1) {
      const only = `${name}/${children[0]}`;
      const deeper = dirsOf(inside[only] ?? []).filter(usable);
      if (deeper.length > 1) for (const d of deeper) out.push(`${only}/${d}`);
      else out.push(only);
    } else if (children.length > 1) for (const child of children) out.push(`${name}/${child}`);
    else out.push(name);
  }
  return out;
}

// ───────────────────────── evidence ─────────────────────────
// Reading matter for the understanding layer. Every section is optional. A section that
// could not be read is LEFT OUT and its reason written to `absent`; it is never recorded
// as an empty list, because "GitHub was not asked" and "GitHub said there are none" are
// different facts.

const search = { waits: 0, stopped: null };

function sleepSeconds(seconds) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, Math.max(0, seconds) * 1000);
}

/**
 * TODO-style lines, from the code search API: one call per repository, and only while the
 * search window allows it. Returns { lines } or { absent: reason }.
 */
function fetchTodos(token, full) {
  if (search.stopped) return { absent: search.stopped };
  const q = encodeURIComponent(`TODO OR FIXME OR HACK OR XXX repo:${full}`);
  const ask = () =>
    get(token, `/search/code?q=${q}&per_page=30`, { accept: 'application/vnd.github.text-match+json', soft: true });
  let res = ask();
  if (res.limited) {
    const reset = Number(res.headers['x-ratelimit-reset'] ?? 0);
    const wait = reset > 0 ? Math.ceil(reset - Date.now() / 1000) + 2 : Number(res.headers['retry-after'] ?? 999);
    if (search.waits < EVIDENCE.searchWaits && wait <= EVIDENCE.searchWaitMaxSeconds) {
      search.waits++;
      sleepSeconds(wait);
      res = ask();
    }
    if (res.limited) {
      search.stopped = 'Code search rate limit reached; not asked.';
      return { absent: search.stopped };
    }
  }
  if (res.status !== 200 || !Array.isArray(res.body?.items)) {
    return { absent: `Code search unavailable for this repository (${res.status}).` };
  }
  const lines = [];
  const seen = new Set();
  for (const item of res.body.items) {
    for (const m of item.text_matches ?? []) {
      for (const line of String(m.fragment ?? '').split('\n')) {
        const text = line.trim().slice(0, EVIDENCE.todoLineChars);
        const hit = TODO_MARKERS.exec(text);
        if (!hit) continue;
        const key = `${item.path}\n${text}`;
        if (seen.has(key)) continue;
        seen.add(key);
        if (lines.length < EVIDENCE.todoLines) lines.push({ path: item.path, marker: hit[1], text });
      }
    }
  }
  // Zero results is not evidence of zero TODOs: GitHub's code search does not index every
  // repository, and answers an unindexed one with an empty list and a 200.
  if (lines.length === 0) {
    return { absent: 'Code search returned nothing; the repository may not be indexed, so this is not evidence that there are none.' };
  }
  return { lines, truncated: seen.size > lines.length || Number(res.body.total_count ?? 0) > res.body.items.length };
}

function fetchEvidence(token, r, recentShas) {
  const api = `/repos/${r.full_name}`;
  const evidence = { absent: {} };

  // README. A 404 is a fact (there is none) and is recorded as null, not as absent.
  const readme = get(token, `${api}/readme`, { soft: true });
  if (readme.status === 200 && typeof readme.body?.content === 'string') {
    const text = Buffer.from(readme.body.content, readme.body.encoding === 'base64' ? 'base64' : 'utf8').toString('utf8');
    evidence.readme = {
      path: readme.body.path ?? 'README.md',
      text: text.slice(0, EVIDENCE.readmeChars),
      chars: text.length,
      truncated: text.length > EVIDENCE.readmeChars,
    };
  } else if (readme.status === 404) evidence.readme = null;
  else evidence.absent.readme = `README could not be read (${readme.status}).`;

  // Open issues, most recently updated first. The issues endpoint also lists pull requests; those are skipped.
  if (r.has_issues === false) evidence.absent.issues = 'Issues are turned off for this repository.';
  else {
    const res = get(token, `${api}/issues?state=open&sort=updated&direction=desc&per_page=100`, { soft: true });
    if (res.status === 200 && Array.isArray(res.body)) {
      const open = res.body.filter((i) => !i.pull_request);
      evidence.issues = open.slice(0, EVIDENCE.issues).map((i) => ({
        number: i.number,
        title: firstLine(i.title),
        labels: (i.labels ?? []).map((l) => (typeof l === 'string' ? l : l?.name)).filter(Boolean),
        created_at: i.created_at ?? null,
        updated_at: i.updated_at ?? null,
      }));
      evidence.issuesTruncated = open.length > EVIDENCE.issues || nextLink(res.headers) !== null;
    } else evidence.absent.issues = `Issues could not be read (${res.status}).`;
  }

  const todos = fetchTodos(token, r.full_name);
  if (todos.lines) {
    evidence.todos = todos.lines;
    evidence.todosTruncated = todos.truncated;
  } else evidence.absent.todos = todos.absent;

  // Which files the latest commits touched: one call each.
  const changes = [];
  let failed = 0;
  for (const sha of recentShas) {
    const c = get(token, `${api}/commits/${sha}`, { soft: true });
    if (c.status !== 200 || !Array.isArray(c.body?.files)) {
      failed++;
      continue;
    }
    const names = c.body.files.map((f) => f.filename).filter((n) => typeof n === 'string');
    changes.push({
      sha7: sha.slice(0, 7),
      date: c.body.commit?.author?.date ?? c.body.commit?.committer?.date ?? null,
      files: names.slice(0, EVIDENCE.filesPerCommit),
      fileCount: names.length,
      truncated: names.length > EVIDENCE.filesPerCommit,
    });
  }
  if (changes.length > 0 || recentShas.length === 0) evidence.recentChanges = changes;
  if (failed > 0) {
    const why = `${failed} of ${recentShas.length} recent commits could not be opened.`;
    if (changes.length === 0) evidence.absent.recentChanges = why;
    else evidence.absent.recentChangesPartial = why;
  }
  return evidence;
}

/**
 * The documents beside the README: read after the root tree, which says which names exist.
 * An empty list is a fact (nothing was pointed to); a failure is recorded in `absent`.
 */
function fetchDocuments(token, r, repo) {
  const evidence = repo.evidence;
  const rootFiles = repo.tree.root.filter((e) => e.type === 'blob').map((e) => e.path);
  const { candidates, more } = documentCandidates(evidence.readme, rootFiles);
  const documents = [];
  let failed = 0;
  for (const c of candidates) {
    const path = c.path.split('/').map(encodeURIComponent).join('/');
    const res = get(token, `/repos/${r.full_name}/contents/${path}?ref=${encodeURIComponent(r.default_branch)}`, { soft: true });
    // A dead link in a README is the README's business, not a failure of the sync.
    if (res.status === 404) continue;
    if (res.status !== 200 || res.body?.type !== 'file' || typeof res.body.content !== 'string' || res.body.encoding !== 'base64') {
      // A directory, a submodule or a file too large to be sent inline is not a document to read.
      if (res.status !== 200) failed++;
      continue;
    }
    const text = Buffer.from(res.body.content, 'base64').toString('utf8');
    const cut = cutDocument(text);
    documents.push({ path: res.body.path ?? c.path, via: c.via, text: cut.text, chars: text.length, truncated: cut.truncated });
  }
  if (failed > 0 && documents.length === 0) evidence.absent.documents = `${failed} of ${candidates.length} documents could not be read.`;
  else {
    evidence.documents = documents;
    evidence.documentsTruncated = more;
    if (failed > 0) evidence.absent.documentsPartial = `${failed} of ${candidates.length} documents could not be read.`;
  }
}

/** The newest revision that reads as a definition, or null. */
function newestDefinition(revisions) {
  for (let i = revisions.length - 1; i >= 0; i--) {
    const parsed = parseDefinition(revisions[i].text);
    if (parsed.ok) return parsed.definition;
  }
  return null;
}

/**
 * The city's own definition, where the repository carries one: every revision of it, oldest
 * first, text unread. Returns the paths its newest readable revision declares, which are
 * then asked about like any directory. `known` holds the revisions of the last record, by
 * sha: a commit never changes, so those are not fetched again.
 */
function fetchDefinition(token, r, repo, known) {
  if (!repo.tree.root.some((e) => e.type === 'blob' && e.path === DEFINITION_FILE)) return [];
  const api = `/repos/${r.full_name}`;
  const file = encodeURIComponent(DEFINITION_FILE);
  const read = (ref) => {
    const res = get(token, `${api}/contents/${file}?ref=${encodeURIComponent(ref)}`, { soft: true });
    // A 404 is a commit that removed the file: a fact, not a failure.
    if (res.status === 404) return null;
    if (res.status !== 200 || typeof res.body?.content !== 'string' || res.body.encoding !== 'base64') return undefined;
    return Buffer.from(res.body.content, 'base64').toString('utf8');
  };

  const history = getAll(token, `${api}/commits?sha=${encodeURIComponent(r.default_branch)}&path=${file}&per_page=100`, DEFINITION.revisions);
  const revisions = [];
  let failed = 0;
  // GitHub lists newest first; the record keeps oldest first.
  for (const c of history.items.slice().reverse()) {
    const row = commitRow(c);
    let text = known?.get(row.sha7);
    if (text === undefined) text = read(String(c.sha));
    if (text === null) continue;
    if (text === undefined || text.length > DEFINITION.chars) {
      failed++;
      continue;
    }
    revisions.push({ sha7: row.sha7, date: row.date, text });
  }
  if (revisions.length === 0) {
    // No history to be had: the file as it stands, undated.
    const text = read(r.default_branch);
    if (typeof text === 'string' && text.length <= DEFINITION.chars) revisions.push({ sha7: '', date: null, text });
  }
  if (failed > 0) repo.notes.push(`${failed} revision(s) of ${DEFINITION_FILE} could not be read.`);
  if (revisions.length === 0) return [];

  repo.definition = { path: DEFINITION_FILE, revisions, truncated: history.truncated };
  const definition = newestDefinition(revisions);
  if (definition === null) return [];
  return [...new Set(definition.features.flatMap((f) => f.paths ?? []))];
}

function fetchRepo(token, r, opts) {
  const full = r.full_name;
  const api = `/repos/${full}`;
  const repo = {
    owner: r.owner?.login ?? full.split('/')[0],
    name: r.name,
    full_name: full,
    description: r.description ?? null,
    topics: r.topics ?? [],
    created_at: r.created_at,
    pushed_at: r.pushed_at,
    archived: Boolean(r.archived),
    private: Boolean(r.private),
    fork: Boolean(r.fork),
    default_branch: r.default_branch,
    language: r.language ?? null,
    languages: {},
    releases: [],
    tags: [],
    empty: false,
    commits: [],
    commitsTruncated: false,
    tree: { root: [], inside: {} },
    paths: {},
    pathsConsidered: [],
    notes: [],
  };

  const langs = get(token, `${api}/languages`);
  if (langs.status === 200 && langs.body) repo.languages = langs.body;

  const commits = getAll(token, `${api}/commits?sha=${encodeURIComponent(r.default_branch)}&per_page=100`, opts.maxCommits);
  if (commits.status === 409) {
    repo.empty = true;
    repo.notes.push('Empty repository (409).');
    return repo;
  }
  if (commits.status === 404) {
    repo.notes.push('Commits not found (404).');
    return repo;
  }
  repo.commits = commits.items.map(commitRow);
  repo.commitsTruncated = commits.truncated;
  // Kept aside for the evidence pass below; never written to the file.
  const recentShas = commits.items.slice(0, EVIDENCE.commitsWithFiles).map((c) => String(c.sha));
  if (commits.truncated) repo.notes.push(`Commit history cut at ${opts.maxCommits}.`);

  const releases = getAll(token, `${api}/releases?per_page=100`);
  repo.releases = releases.items.map((x) => ({
    tag: x.tag_name,
    name: x.name ?? null,
    published_at: x.published_at ?? null,
    created_at: x.created_at ?? null,
    draft: Boolean(x.draft),
    prerelease: Boolean(x.prerelease),
  }));

  const tags = getAll(token, `${api}/tags?per_page=100`);
  const known = new Map(repo.commits.map((c) => [c.sha7, c.date]));
  const released = new Set(repo.releases.map((x) => x.tag));
  let lookups = 0;
  repo.tags = tags.items.map((t) => {
    const sha7 = String(t.commit?.sha ?? '').slice(0, 7);
    let date = known.get(sha7) ?? null;
    // Cheap only: a tag whose commit is not already in hand costs one call, so it is
    // asked for only when there are few tags and no release already dates it.
    if (date === null && !released.has(t.name) && tags.items.length <= MAX_TAGS_DATED && t.commit?.sha) {
      const c = get(token, `${api}/commits/${t.commit.sha}`);
      lookups++;
      if (c.status === 200) date = c.body?.commit?.author?.date ?? null;
    }
    return { name: t.name, sha7, date };
  });
  if (lookups > 0) repo.notes.push(`Dated ${lookups} tag(s) by their commit.`);

  repo.evidence = fetchEvidence(token, r, recentShas);

  const root = get(token, `${api}/git/trees/${encodeURIComponent(r.default_branch)}`);
  if (root.status !== 200 || !Array.isArray(root.body?.tree)) {
    repo.notes.push(`Root tree unavailable (${root.status}).`);
    repo.evidence.absent.documents = 'The top of the repository could not be listed, so no further documents were looked for.';
    return repo;
  }
  const slim = (e) => ({ path: e.path, type: e.type });
  repo.tree.root = root.body.tree.map(slim);
  fetchDocuments(token, r, repo);
  const declared = fetchDefinition(token, r, repo, opts.known?.get(full));
  for (const e of root.body.tree) {
    if (e.type !== 'tree' || !SOURCE_ROOTS.includes(e.path)) continue;
    const sub = get(token, `${api}/git/trees/${e.sha}`);
    if (sub.status !== 200 || !Array.isArray(sub.body?.tree)) continue;
    repo.tree.inside[e.path] = sub.body.tree.map(slim);
    const dirs = sub.body.tree.filter((x) => x.type === 'tree' && usable(x.path));
    if (dirs.length === 1) {
      const deeper = get(token, `${api}/git/trees/${dirs[0].sha}`);
      if (deeper.status === 200 && Array.isArray(deeper.body?.tree)) {
        repo.tree.inside[`${e.path}/${dirs[0].path}`] = deeper.body.tree.map(slim);
      }
    }
  }

  let dirs = candidateDirs(repo.tree.root, repo.tree.inside);
  repo.pathsConsidered = dirs.map((path) => ({ path, asked: true }));
  if (dirs.length > MAX_DIRS) {
    // Too many to ask about in full: count each (one call, read from the Link header)
    // and keep the busiest.
    const counted = dirs.map((path) => {
      const c = get(token, `${api}/commits?sha=${encodeURIComponent(r.default_branch)}&path=${encodeURIComponent(path)}&per_page=1`);
      const count = c.status === 200 && Array.isArray(c.body) ? (lastPage(c.headers) ?? c.body.length) : 0;
      return { path, count };
    });
    counted.sort((a, b) => b.count - a.count || (a.path < b.path ? -1 : 1));
    const keep = new Set(counted.slice(0, MAX_DIRS).map((c) => c.path));
    repo.pathsConsidered = counted.map((c) => ({ ...c, asked: keep.has(c.path) }));
    dirs = dirs.filter((d) => keep.has(d));
    repo.notes.push(`${counted.length} candidate directories; asked about the ${MAX_DIRS} with most commits.`);
  }
  // What the owner's own definition names is always asked about, whatever the cap above kept.
  for (const path of declared) {
    if (dirs.includes(path)) continue;
    dirs.push(path);
    repo.pathsConsidered.push({ path, asked: true, declared: true });
  }
  for (const path of dirs) {
    const pc = getAll(
      token,
      `${api}/commits?sha=${encodeURIComponent(r.default_branch)}&path=${encodeURIComponent(path)}&per_page=100`,
      MAX_PATH_COMMITS,
    );
    repo.paths[path] = {
      commits: pc.items.map((c) => {
        const row = commitRow(c);
        return { sha7: row.sha7, date: row.date, author: row.author, authorName: row.authorName };
      }),
      truncated: pc.truncated,
    };
  }
  return repo;
}

// ───────────────────────── main ─────────────────────────

function main() {
  const opts = parseArgs(process.argv.slice(2));
  const accounts = opts.accounts ?? listAccounts();
  if (accounts.length === 0) {
    console.error('No GitHub accounts found. Run: gh auth login');
    process.exit(1);
  }

  // Revisions of definitions already in hand, by repository and sha. Read from the last
  // record if there is one; a record that cannot be read just means asking again.
  opts.known = new Map();
  try {
    if (existsSync(OUT)) {
      for (const repo of JSON.parse(readFileSync(OUT, 'utf8')).repos ?? []) {
        const revisions = (repo.definition?.revisions ?? []).filter((v) => v.sha7 && typeof v.text === 'string');
        if (revisions.length > 0) opts.known.set(repo.full_name, new Map(revisions.map((v) => [v.sha7, v.text])));
      }
    }
  } catch {
    opts.known = new Map();
  }

  const raw = {
    version: 4,
    fetchedAt: new Date().toISOString(),
    accounts,
    // The display name on each account's profile, for recognising the owner's commits
    // made under an e-mail GitHub has not linked to the account.
    profileNames: [],
    includeForks: opts.includeForks,
    maxCommits: opts.maxCommits,
    complete: true,
    stoppedBecause: null,
    forksSkipped: 0,
    repos: [],
  };

  try {
    for (const login of accounts) {
      const token = tokenFor(login);
      const me = get(token, '/user');
      if (me.status !== 200) throw new Error(`Could not read account ${login} (${me.status}).`);
      if (me.body?.name && !raw.profileNames.includes(me.body.name)) raw.profileNames.push(me.body.name);

      const list = getAll(token, '/user/repos?affiliation=owner&visibility=all&sort=created&direction=asc&per_page=100');
      for (const r of list.items) {
        if (raw.repos.some((x) => x.full_name === r.full_name)) continue;
        if (r.fork && !opts.includeForks) {
          raw.forksSkipped++;
          continue;
        }
        process.stderr.write(`  ${r.full_name}\n`);
        raw.repos.push(fetchRepo(token, r, opts));
      }
    }
  } catch (err) {
    raw.complete = false;
    raw.stoppedBecause = err instanceof Error ? err.message : String(err);
    if (!(err instanceof RateLimited)) {
      console.error(`Stopped: ${raw.stoppedBecause}`);
      if (raw.repos.length === 0) process.exit(1);
    }
  }

  mkdirSync(dirname(OUT), { recursive: true });
  writeFileSync(OUT, JSON.stringify(raw));

  // A short summary. Counts only: nothing private is echoed beyond repository names.
  const owner = new Set(accounts.map((a) => a.toLowerCase()));
  let total = 0;
  let linked = 0;
  const others = new Map();
  for (const repo of raw.repos) {
    for (const c of repo.commits) {
      total++;
      if (c.author && owner.has(c.author.toLowerCase())) linked++;
      else {
        const who = c.author ?? `(unlinked) ${c.authorName ?? 'unknown'}`;
        others.set(who, (others.get(who) ?? 0) + 1);
      }
    }
  }
  console.log(`GitHub sync: ${accounts.join(', ')}`);
  console.log(`  ${raw.repos.length} repositories (${raw.forksSkipped} forks skipped), ${total} commits on default branches, ${calls} API calls`);
  console.log(`  ${linked} commits linked to the owner's accounts; ${total - linked} not:`);
  for (const [who, n] of [...others].sort((a, b) => b[1] - a[1])) console.log(`    ${String(n).padStart(5)}  ${who}`);
  // Evidence: counts and reasons only. No README, issue or TODO text is echoed.
  const withEvidence = raw.repos.filter((r) => r.evidence);
  const n = (test) => withEvidence.filter(test).length;
  const sum = (pick) => withEvidence.reduce((a, r) => a + pick(r.evidence), 0);
  console.log(`  evidence for ${withEvidence.length} repositories:`);
  console.log(`    READMEs: ${n((r) => r.evidence.readme)} found, ${n((r) => r.evidence.readme === null)} repositories have none`);
  console.log(`    further documents: ${sum((e) => e.documents?.length ?? 0)} across ${n((r) => (r.evidence.documents?.length ?? 0) > 0)} repositories`);
  console.log(`    open issues: ${sum((e) => e.issues?.length ?? 0)} across ${n((r) => (r.evidence.issues?.length ?? 0) > 0)} repositories`);
  console.log(`    TODO lines: ${sum((e) => e.todos?.length ?? 0)} across ${n((r) => r.evidence.todos)} repositories`);
  console.log(`    recent commits opened for their files: ${sum((e) => e.recentChanges?.length ?? 0)}`);
  // Definitions: which cities describe themselves, and any whose file does not read.
  // The file's own errors are echoed; they are about its shape, not its contents.
  const defined = raw.repos.filter((r) => r.definition);
  console.log(`  ${DEFINITION_FILE}: carried by ${defined.length} of ${raw.repos.length} repositories`);
  for (const r of defined) {
    const newest = parseDefinition(r.definition.revisions[r.definition.revisions.length - 1].text);
    const revs = `${r.definition.revisions.length} revision${r.definition.revisions.length === 1 ? '' : 's'}`;
    if (newest.ok) console.log(`    ${r.full_name}: ${newest.definition.features.length} features, ${revs}`);
    else {
      console.log(`    ${r.full_name}: DOES NOT READ (${revs})`);
      for (const e of newest.errors) console.log(`      ${e}`);
    }
  }
  const reasons = new Map();
  for (const r of withEvidence) {
    for (const [section, why] of Object.entries(r.evidence.absent)) {
      const key = `${section}: ${why}`;
      reasons.set(key, (reasons.get(key) ?? 0) + 1);
    }
  }
  for (const [why, count] of reasons) console.log(`    absent in ${count}: ${why}`);
  console.log(`  wrote ${OUT}`);
  if (!raw.complete) {
    console.log(`  INCOMPLETE: ${raw.stoppedBecause} The file holds what was fetched before stopping; run again later.`);
    process.exitCode = 3;
  }
}

main();
