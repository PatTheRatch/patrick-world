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
// The file is a record of what GitHub said. The one choice made here is WHICH directories
// to ask about (`candidateDirs`, which must stay in step with the same rule in
// src/world/sources/github/transform.ts). What any of it means is the transform's business.
//
// The output is private data. public/data/ is in .gitignore; keep it there.

import { spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

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
function get(token, path) {
  calls++;
  const r = gh(['api', '--hostname', 'github.com', '-i', '-H', 'Accept: application/vnd.github+json', path], {
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
  if (status === 429 || (status === 403 && (headers['x-ratelimit-remaining'] === '0' || 'retry-after' in headers))) {
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

  const root = get(token, `${api}/git/trees/${encodeURIComponent(r.default_branch)}`);
  if (root.status !== 200 || !Array.isArray(root.body?.tree)) {
    repo.notes.push(`Root tree unavailable (${root.status}).`);
    return repo;
  }
  const slim = (e) => ({ path: e.path, type: e.type });
  repo.tree.root = root.body.tree.map(slim);
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

  const raw = {
    version: 1,
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
  console.log(`  wrote ${OUT}`);
  if (!raw.complete) {
    console.log(`  INCOMPLETE: ${raw.stoppedBecause} The file holds what was fetched before stopping; run again later.`);
    process.exitCode = 3;
  }
}

main();
