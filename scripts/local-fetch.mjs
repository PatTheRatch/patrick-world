#!/usr/bin/env node
// Read the repositories cloned on this machine and write what git says about them,
// uninterpreted, to public/data/github.json. Run as `npm run sync:local`.
//
// The other sync (github-fetch.mjs) asks GitHub. This one asks git, so it does not care
// where a repository is hosted: Bitbucket, GitLab, Azure DevOps, a server in a cupboard.
// It needs no token and makes no network call (unless you ask it to fetch first). It writes
// the same record in the same place, so everything downstream is unchanged: the transform,
// the app, `npm run world:export`.
//
//   --root dir         look for repositories under this folder (repeatable; up to four folders deep)
//   --dirs a,b         these repositories exactly (repeatable)
//   --me "A,B"         other names or e-mail addresses your commits are written under
//   --everyone         count every person's commits as work, not only yours (a team's map)
//   --fetch            run `git fetch` in each repository first (the one thing here that uses the network)
//   --max-commits N    commits per repository on the default branch (default 5000)
//   --out file         write somewhere else than public/data/github.json
//
// What it reads is the remote's default branch as last fetched (origin/main, say), not
// whatever branch happens to be checked out, so a half-finished feature branch never shows.
// A repository with no remote is read at its own HEAD.
//
// What a clone cannot say, and so is absent: a description, topics, issues, whether the
// repository is archived, and which host account a commit belongs to. Your own commits are
// told by who wrote them: the name and e-mail git is configured with here, any name ever
// used with one of those e-mails (and the other way round), and whatever you add with --me.
// E-mail addresses are used to work that out and are never written to the record.
// Releases are the tags that read as versions.
//
// The record is private, like the other sync's. public/data/ is in .gitignore; keep it there.

import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// The choice of documents and the reading of a definition are the app's own, typed and tested.
import { cutDocument, documentCandidates } from '../src/understanding/documents.ts';
import { DEFINITION_FILE, parseDefinition } from '../src/world/definition.ts';
// Which directories stand in for features: one rule, shared with the questionnaire.
import { SOURCE_ROOTS, candidateDirectories, usableDir } from '../skills/patrick-world-init/scripts/lib.mjs';

const OUT = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'data', 'github.json');
const VERSION = 4;
const MAX_DIRS = 14;
const MAX_PATH_COMMITS = 1000;
const EVIDENCE = { readmeChars: 12000, commitsWithFiles: 15, filesPerCommit: 30 };
const DEFINITION = { revisions: 200, chars: 200000 };
/** Folders never worth looking inside for repositories. */
const SKIP = new Set(['node_modules', 'vendor', 'dist', 'build', 'target', 'Library', 'Applications']);

/** File endings, as the language names GitHub would report. Only what the map knows a method for, and the common rest. */
const LANGUAGES = {
  ts: 'TypeScript', tsx: 'TypeScript', mts: 'TypeScript', js: 'JavaScript', jsx: 'JavaScript', mjs: 'JavaScript', cjs: 'JavaScript',
  py: 'Python', sql: 'SQL', swift: 'Swift', kt: 'Kotlin', kts: 'Kotlin', dart: 'Dart', m: 'Objective-C', mm: 'Objective-C', rs: 'Rust',
  java: 'Java', cs: 'C#', go: 'Go', rb: 'Ruby', php: 'PHP', c: 'C', h: 'C', cpp: 'C++', cc: 'C++', hpp: 'C++', scala: 'Scala',
  html: 'HTML', css: 'CSS', scss: 'SCSS', sh: 'Shell', vue: 'Vue', svelte: 'Svelte',
};

const USAGE =
  'usage: npm run sync:local -- --root <folder> [--root <folder>…] [--dirs a,b] [--me "Name,Other Name"]\n' +
  '                             [--everyone] [--fetch] [--max-commits N] [--out file]';

function parseArgs(argv) {
  const out = { roots: [], dirs: [], me: [], everyone: false, fetch: false, maxCommits: 5000, out: OUT };
  const list = (s) => String(s ?? '').split(',').map((x) => x.trim()).filter(Boolean);
  // A shell only expands the first `~` in `--dirs ~/a,~/b`, so the rest are expanded here.
  const path = (p) => resolve(String(p ?? '').replace(/^~(?=$|[\\/])/, homedir()));
  for (let i = 0; i < argv.length; i++) {
    const eq = argv[i].indexOf('=');
    const flag = argv[i].startsWith('--') && eq !== -1 ? argv[i].slice(0, eq) : argv[i];
    const value = () => (flag !== argv[i] ? argv[i].slice(eq + 1) : argv[++i]);
    if (flag === '--root') out.roots.push(path(value()));
    else if (flag === '--dirs') out.dirs.push(...list(value()).map(path));
    else if (flag === '--me') out.me.push(...list(value()));
    else if (flag === '--everyone') out.everyone = true;
    else if (flag === '--fetch') out.fetch = true;
    else if (flag === '--max-commits') out.maxCommits = Number(value());
    else if (flag === '--out') out.out = path(value());
    else if (flag === '--help' || flag === '-h') {
      console.log(USAGE);
      process.exit(0);
    } else {
      console.error(`Unknown argument: ${argv[i]}\n${USAGE}`);
      process.exit(2);
    }
  }
  if (!Number.isFinite(out.maxCommits) || out.maxCommits < 1) {
    console.error('--max-commits needs a positive number');
    process.exit(2);
  }
  if (out.roots.length === 0 && out.dirs.length === 0) {
    console.error(`Say where the repositories are.\n${USAGE}`);
    process.exit(2);
  }
  return out;
}

// ───────────────────────── git ─────────────────────────

/** Run git in a repository. Returns its output, or null if git said no. Never throws. */
function git(dir, args, { trim = true } = {}) {
  const r = spawnSync('git', ['-C', dir, ...args], { encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 });
  if (r.status !== 0) return null;
  return trim ? r.stdout.trim() : r.stdout;
}
const lines = (text) => (text === null || text === '' ? [] : text.split('\n'));
/** A git date with its own offset, as the UTC instant GitHub would give. */
const utc = (iso) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d.toISOString().replace('.000Z', 'Z');
};
const firstLine = (s) => String(s ?? '').split('\n')[0].slice(0, 200);

// One commit to a line: fields split by a character no name or message contains.
const SEP = '\x1f';
const LOG = `--format=%H${SEP}%aI${SEP}%an${SEP}%ae${SEP}%s`;
function commitsOf(dir, ref, path, limit) {
  const args = ['log', LOG, `--max-count=${limit + 1}`, ref];
  if (path !== null) args.push('--', path);
  const rows = lines(git(dir, args)).map((line) => {
    const [sha, date, name, email, subject] = line.split(SEP);
    // `author` is the host account a commit is linked to. A clone does not know it.
    // `email` is kept in memory to tell whose commits are whose, and is never written out.
    return { sha, email, sha7: sha.slice(0, 7), date: utc(date), author: null, authorName: name ?? null, message: firstLine(subject) };
  });
  return { rows: rows.slice(0, limit), truncated: rows.length > limit };
}

/** The branch the remote calls its default, as last fetched; failing that, what is checked out. */
function defaultRef(dir) {
  const head = git(dir, ['symbolic-ref', '--short', 'refs/remotes/origin/HEAD']);
  if (head) return { ref: head, branch: head.replace(/^origin\//, '') };
  for (const b of ['main', 'master', 'develop', 'trunk']) {
    if (git(dir, ['rev-parse', '--verify', '--quiet', `refs/remotes/origin/${b}`])) return { ref: `origin/${b}`, branch: b };
  }
  const local = git(dir, ['symbolic-ref', '--short', 'HEAD']);
  return { ref: 'HEAD', branch: local ?? 'HEAD', local: true };
}

/** `owner/name` from the origin remote, whichever host it is; the folder's own name if there is none. */
function identity(dir) {
  const url = git(dir, ['remote', 'get-url', 'origin']);
  if (url) {
    // git@host:owner/name.git · https://host/owner/name.git · ssh://git@host:7999/PROJ/name.git · https://host/scm/proj/name.git
    const path = url.replace(/^[a-z+]+:\/\/[^/]+\//i, '').replace(/^[^@/]+@[^:/]+:/, '').replace(/\.git\/?$/, '');
    const parts = path.split('/').filter(Boolean);
    if (parts.length >= 2) return { owner: parts[parts.length - 2], name: parts[parts.length - 1], host: (/^(?:[a-z+]+:\/\/)?(?:[^@/]+@)?([^:/]+)/i.exec(url) ?? [])[1] ?? null };
  }
  return { owner: 'local', name: basename(dir), host: null };
}

/** Every git repository under a folder, up to four folders deep. A repository is not looked inside. */
function findRepos(root, depth = 0, out = []) {
  if (!existsSync(root)) {
    console.error(`  There is no folder ${root}.`);
    return out;
  }
  if (existsSync(join(root, '.git'))) {
    out.push(root);
    return out;
  }
  if (depth >= 4) return out;
  let entries = [];
  try {
    entries = readdirSync(root, { withFileTypes: true });
  } catch {
    return out; // a folder we may not read is not ours to report on
  }
  for (const e of entries) {
    if (!e.isDirectory() || e.name.startsWith('.') || SKIP.has(e.name)) continue;
    findRepos(join(root, e.name), depth + 1, out);
  }
  return out;
}

// ───────────────────────── one repository ─────────────────────────

function readRepo(dir, opts, seen) {
  const id = identity(dir);
  const { ref, branch, local } = defaultRef(dir);
  const repo = {
    owner: id.owner,
    name: id.name,
    full_name: `${id.owner}/${id.name}`,
    description: null,
    topics: [],
    created_at: null,
    pushed_at: null,
    archived: false,
    private: true,
    fork: false,
    default_branch: branch,
    language: null,
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
    evidence: { absent: { issues: 'A clone does not carry issues.', todos: 'Not searched for in a local read.' } },
  };
  if (id.host) repo.notes.push(`Hosted at ${id.host}.`);
  if (local) repo.notes.push('No remote default branch is known here; read at what is checked out.');

  if (opts.fetch) {
    const r = spawnSync('git', ['-C', dir, 'fetch', '--quiet', '--tags', 'origin'], { encoding: 'utf8' });
    if (r.status !== 0) repo.notes.push('git fetch failed; read as last fetched.');
  }
  // How long since this clone last heard from its remote: an old clone tells an old story.
  const fetchHead = join(dir, '.git', 'FETCH_HEAD');
  if (!local && existsSync(fetchHead)) {
    const days = Math.floor((Date.now() - statSync(fetchHead).mtimeMs) / 86400000);
    if (days > 7) {
      repo.notes.push(`Last fetched ${days} days ago.`);
      seen.stale++;
    }
  }

  if (git(dir, ['rev-parse', '--verify', '--quiet', ref]) === null) {
    repo.empty = true;
    repo.notes.push('No commits.');
    return repo;
  }

  const all = commitsOf(dir, ref, null, opts.maxCommits);
  repo.commits = all.rows.map(({ sha, email, ...row }) => row);
  for (const c of all.rows) seen.pairs.add(`${String(c.authorName).toLowerCase()}${SEP}${String(c.email).toLowerCase()}`);
  repo.commitsTruncated = all.truncated;
  if (all.truncated) repo.notes.push(`Commit history cut at ${opts.maxCommits}.`);
  repo.pushed_at = all.rows[0]?.date ?? null;
  // The first commit of all, however long the history.
  const first = lines(git(dir, ['log', '--format=%aI', '--reverse', ref]))[0];
  repo.created_at = utc(first) ?? repo.pushed_at;

  // Tags; the transform takes the ones that read as versions for releases.
  repo.tags = lines(git(dir, ['for-each-ref', 'refs/tags', `--format=%(refname:short)${SEP}%(objectname)${SEP}%(creatordate:iso-strict)`])).map((line) => {
    const [name, sha, date] = line.split(SEP);
    return { name, sha7: String(sha).slice(0, 7), date: utc(date) };
  });

  // What it is written in: bytes per language, by file ending.
  const bytes = {};
  for (const line of lines(git(dir, ['ls-tree', '-r', '-l', ref]))) {
    const m = /^\d+ blob [0-9a-f]+\s+(\d+)\t(.+)$/.exec(line);
    if (!m) continue;
    const language = LANGUAGES[(/\.([A-Za-z0-9]+)$/.exec(m[2]) ?? [])[1]?.toLowerCase()];
    if (language) bytes[language] = (bytes[language] ?? 0) + Number(m[1]);
  }
  repo.languages = bytes;
  repo.language = Object.entries(bytes).sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;

  // The tree, as far as the directory rule looks.
  const list = (path) =>
    lines(git(dir, ['ls-tree', ref, path === '' ? './' : `${path}/`])).map((line) => {
      const m = /^\d+ (\w+) [0-9a-f]+\t(.+)$/.exec(line);
      return m ? { path: m[2].split('/').pop(), type: m[1] } : null;
    }).filter(Boolean);
  repo.tree.root = list('');
  for (const e of repo.tree.root) {
    if (e.type !== 'tree' || !SOURCE_ROOTS.includes(e.path)) continue;
    repo.tree.inside[e.path] = list(e.path);
    const dirs = repo.tree.inside[e.path].filter((x) => x.type === 'tree' && usableDir(x.path));
    if (dirs.length === 1) repo.tree.inside[`${e.path}/${dirs[0].path}`] = list(`${e.path}/${dirs[0].path}`);
  }
  const dirsIn = (path) => (path === '' ? repo.tree.root : repo.tree.inside[path] ?? []).filter((e) => e.type === 'tree').map((e) => e.path);

  // Evidence for the understanding layer: the README, the documents it points to, recent changes.
  const show = (path, at = ref) => git(dir, ['show', `${at}:${path}`], { trim: false });
  const rootFiles = repo.tree.root.filter((e) => e.type === 'blob').map((e) => e.path);
  const readmeName = rootFiles.find((f) => /^readme(\.(md|markdown|rst|txt))?$/i.test(f));
  if (readmeName) {
    const text = show(readmeName) ?? '';
    repo.evidence.readme = { path: readmeName, text: text.slice(0, EVIDENCE.readmeChars), chars: text.length, truncated: text.length > EVIDENCE.readmeChars };
  } else repo.evidence.readme = null;
  const { candidates, more } = documentCandidates(repo.evidence.readme, rootFiles);
  repo.evidence.documents = [];
  for (const c of candidates) {
    const text = show(c.path);
    if (text === null) continue; // a dead link in a README is the README's business
    const cut = cutDocument(text);
    repo.evidence.documents.push({ path: c.path, via: c.via, text: cut.text, chars: text.length, truncated: cut.truncated });
  }
  repo.evidence.documentsTruncated = more;
  repo.evidence.recentChanges = all.rows.slice(0, EVIDENCE.commitsWithFiles).map((c) => {
    const names = lines(git(dir, ['show', '--format=', '--name-only', c.sha]));
    return { sha7: c.sha7, date: c.date, files: names.slice(0, EVIDENCE.filesPerCommit), fileCount: names.length, truncated: names.length > EVIDENCE.filesPerCommit };
  });

  // The city's own definition, at every commit that touched it, oldest first.
  let declared = [];
  if (rootFiles.includes(DEFINITION_FILE)) {
    const history = commitsOf(dir, ref, DEFINITION_FILE, DEFINITION.revisions);
    const revisions = [];
    for (const c of history.rows.slice().reverse()) {
      const text = show(DEFINITION_FILE, c.sha);
      if (text === null || text.length > DEFINITION.chars) continue; // null: that commit removed the file
      revisions.push({ sha7: c.sha7, date: c.date, text });
    }
    if (revisions.length > 0) {
      repo.definition = { path: DEFINITION_FILE, revisions, truncated: history.truncated };
      for (let i = revisions.length - 1; i >= 0; i--) {
        const parsed = parseDefinition(revisions[i].text);
        if (!parsed.ok) continue;
        declared = [...new Set(parsed.definition.features.flatMap((f) => f.paths ?? []))];
        break;
      }
    }
  }

  // History per directory: the busiest of the directories that may stand for features, and
  // always whatever the definition names.
  let dirs = candidateDirectories(dirsIn);
  const counted = dirs.map((path) => ({ path, count: Number(git(dir, ['rev-list', '--count', ref, '--', path]) ?? 0) }));
  counted.sort((a, b) => b.count - a.count || (a.path < b.path ? -1 : 1));
  const keep = new Set(counted.slice(0, MAX_DIRS).map((c) => c.path));
  repo.pathsConsidered = counted.map((c) => ({ ...c, asked: keep.has(c.path) }));
  dirs = dirs.filter((d) => keep.has(d));
  if (counted.length > MAX_DIRS) repo.notes.push(`${counted.length} candidate directories; kept the ${MAX_DIRS} with most commits.`);
  for (const path of declared) {
    if (dirs.includes(path)) continue;
    dirs.push(path);
    repo.pathsConsidered.push({ path, asked: true, declared: true });
  }
  for (const path of dirs) {
    const h = commitsOf(dir, ref, path, MAX_PATH_COMMITS);
    repo.paths[path] = { commits: h.rows.map((c) => ({ sha7: c.sha7, date: c.date, author: null, authorName: c.authorName })), truncated: h.truncated };
  }
  return repo;
}

// ───────────────────────── main ─────────────────────────

function main() {
  const opts = parseArgs(process.argv.slice(2));
  if (spawnSync('git', ['--version']).status !== 0) {
    console.error('git was not found. This sync reads repositories through git.');
    process.exit(1);
  }

  const found = [...opts.dirs];
  for (const root of opts.roots) findRepos(root, 0, found);
  // The same repository named twice, or reached by two paths, is one repository. A folder
  // that was named and is not a repository is said, not passed over.
  const tops = found.map((d) => [d, existsSync(d) ? git(d, ['rev-parse', '--show-toplevel']) : null]);
  for (const [d, top] of tops) if (!top) console.error(`  Not a git repository, left out: ${d}`);
  const dirs = [...new Set(tops.map(([, top]) => top).filter(Boolean))];
  if (dirs.length === 0) {
    console.error('No git repositories were found there.');
    process.exit(1);
  }

  // Who you are, to begin with: what git is configured with, here and in each clone, and
  // whatever was given with --me (an entry with an @ in it is an e-mail address).
  const names = new Map(); // lower-cased → as written
  const emails = new Set();
  const know = (v) => {
    const t = String(v ?? '').trim();
    if (t === '') return;
    if (t.includes('@')) emails.add(t.toLowerCase());
    else if (!names.has(t.toLowerCase())) names.set(t.toLowerCase(), t);
  };
  opts.me.forEach(know);
  for (const key of ['user.name', 'user.email']) know(spawnSync('git', ['config', '--global', key], { encoding: 'utf8' }).stdout);
  for (const d of dirs) for (const key of ['user.name', 'user.email']) know(git(d, ['config', key]));

  const raw = {
    version: VERSION,
    fetchedAt: new Date().toISOString(),
    // Read from clones on this machine, not from a host's API.
    host: 'local',
    // A clone knows no host accounts. Your commits are told by name: see profileNames.
    accounts: [],
    profileNames: [],
    everyone: opts.everyone,
    includeForks: true,
    maxCommits: opts.maxCommits,
    complete: true,
    stoppedBecause: null,
    forksSkipped: 0,
    repos: [],
  };

  const seen = { pairs: new Set(), stale: 0 };
  const taken = new Set();
  for (const dir of dirs) {
    const repo = readRepo(dir, opts, seen);
    if (taken.has(repo.full_name)) {
      // Two clones of one repository: the first found is the one read.
      continue;
    }
    taken.add(repo.full_name);
    process.stderr.write(`  ${repo.full_name}\n`);
    raw.repos.push(repo);
  }
  // Oldest first, as the other sync lists them.
  raw.repos.sort((a, b) => String(a.created_at) < String(b.created_at) ? -1 : 1);

  // Follow the threads: a name used with one of your e-mails is yours, and so is an e-mail
  // used with one of your names. Round again until nothing new turns up.
  const pairs = [...seen.pairs].map((p) => p.split(SEP));
  for (let grew = true; grew; ) {
    grew = false;
    for (const [name, email] of pairs) {
      if (emails.has(email) && !names.has(name)) {
        names.set(name, name);
        grew = true;
      }
      if (names.has(name) && !emails.has(email)) {
        emails.add(email);
        grew = true;
      }
    }
  }
  raw.profileNames = [...names.values()];

  mkdirSync(dirname(opts.out), { recursive: true });
  writeFileSync(opts.out, JSON.stringify(raw));

  // A short summary. Counts and names of people only as git wrote them; no file contents.
  const mine = new Set(names.keys());
  let total = 0;
  let own = 0;
  const others = new Map();
  for (const repo of raw.repos) {
    for (const c of repo.commits) {
      total++;
      if (mine.has(String(c.authorName).toLowerCase())) own++;
      else others.set(c.authorName ?? 'unknown', (others.get(c.authorName ?? 'unknown') ?? 0) + 1);
    }
  }
  const hosts = new Set(raw.repos.flatMap((r) => (r.notes.find((n) => n.startsWith('Hosted at ')) ?? '').replace(/^Hosted at |\.$/g, '')).filter(Boolean));
  console.log(`Local sync: ${raw.repos.length} repositories${hosts.size ? ` (hosted at ${[...hosts].join(', ')})` : ''}, ${total} commits on default branches`);
  console.log(
    raw.everyone
      ? `  Every person's commits will count as work (--everyone). ${own} are written under your names; ${total - own} are not:`
      : `  ${own} commits written under your names (${raw.profileNames.join(', ') || 'none known: pass --me "Your Name"'}); ${total - own} not:`,
  );
  if (!raw.everyone && others.size > 0) console.log('  If any of these are you, say so and run again: --me "that name"');
  for (const [who, n] of [...others].sort((a, b) => b[1] - a[1]).slice(0, 12)) console.log(`    ${String(n).padStart(5)}  ${who}`);
  if (others.size > 12) console.log(`           and ${others.size - 12} more`);
  if (seen.stale > 0) console.log(`  ${seen.stale} clone(s) were last fetched more than a week ago. Add --fetch to bring them up to date first.`);
  const defined = raw.repos.filter((r) => r.definition);
  console.log(`  ${DEFINITION_FILE}: carried by ${defined.length} of ${raw.repos.length} repositories`);
  for (const r of defined) {
    const newest = parseDefinition(r.definition.revisions[r.definition.revisions.length - 1].text);
    if (!newest.ok) {
      console.log(`    ${r.full_name}: DOES NOT READ`);
      for (const e of newest.errors) console.log(`      ${e}`);
    }
  }
  console.log(`  wrote ${opts.out}`);
}

main();
