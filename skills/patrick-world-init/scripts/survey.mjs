#!/usr/bin/env node
// What can be seen of a repository without asking its owner anything. Prints JSON.
//
//   node survey.mjs [directory]     (default: the current directory)
//   node survey.mjs --neighbours    also list the owner's other repositories, through `gh`
//
// Read-only: it reads git history and file names. With --neighbours it makes one read-only
// `gh repo list` call. It writes nothing and changes nothing.
//
// The questionnaire asks only what is NOT in this output: what the thing is for, what is
// meant and not yet begun, and what it connects to.

import { spawnSync } from 'node:child_process';
import { existsSync, readdirSync } from 'node:fs';
import { basename, join } from 'node:path';
import { candidateDirectories, dirsIn, git, historyOf, originOf, overlaps, readDefinition, repoRoot, vocabulary } from './lib.mjs';

const args = process.argv.slice(2);
const wantNeighbours = args.includes('--neighbours');
const dir = args.find((a) => !a.startsWith('--')) ?? '.';

const root = repoRoot(dir);
if (root === null) {
  console.log(JSON.stringify({ error: `${dir} is not inside a git repository. A city is a repository: run this from one.` }, null, 2));
  process.exit(1);
}
if (git(root, ['rev-parse', '--verify', 'HEAD']) === null) {
  console.log(JSON.stringify({ error: 'This repository has no commits yet. Make a first commit, then run this again.' }, null, 2));
  process.exit(1);
}

const origin = originOf(root);
const whole = historyOf(root, '.');
const definition = readDefinition(root);

// The directories the map guesses are features today, with how much work each has seen.
const claimed = definition.exists && definition.ok ? definition.definition.features.flatMap((f) => f.paths ?? []) : [];
const directories = candidateDirectories((path) => dirsIn(root, path)).map((path) => {
  const row = { path, ...historyOf(root, path) };
  if (claimed.length > 0) row.claimed = claimed.some((p) => overlaps(p, path));
  return row;
});

// Documents that tend to say what is planned and what is done. Names only: read them yourself.
const TELLING = /^(readme|plan|roadmap|status|todo|changelog|handoff|vision|product|spec|design|architecture|ideas?|backlog|next)\b/i;
const documents = [];
for (const where of ['', 'docs', 'doc', 'notes', '.github']) {
  const full = join(root, where);
  if (!existsSync(full)) continue;
  for (const name of readdirSync(full, { withFileTypes: true })) {
    if (name.isFile() && /\.(md|mdx|txt|rst|org)$/i.test(name.name) && (where !== '' || TELLING.test(name.name))) {
      documents.push(where === '' ? name.name : `${where}/${name.name}`);
    }
  }
}

const manifests = ['package.json', 'pyproject.toml', 'requirements.txt', 'Cargo.toml', 'go.mod', 'Gemfile', 'Package.swift', 'pubspec.yaml', 'build.gradle', 'pom.xml']
  .filter((name) => existsSync(join(root, name)));

// What it is written in, by the endings of its tracked files.
const endings = new Map();
for (const file of (git(root, ['ls-files']) ?? '').split('\n')) {
  const m = /\.([A-Za-z0-9]+)$/.exec(file);
  if (m) endings.set(m[1].toLowerCase(), (endings.get(m[1].toLowerCase()) ?? 0) + 1);
}
const fileEndings = Object.fromEntries([...endings].sort((a, b) => b[1] - a[1]).slice(0, 8));

const out = {
  root,
  repository: origin ? `${origin.owner}/${origin.name}` : basename(root),
  /** What a link from another city can call this one until it has an id of its own. */
  repositoryName: origin?.name ?? basename(root),
  commits: whole.commits,
  firstCommit: whole.first,
  lastCommit: whole.last,
  uncommittedChanges: (git(root, ['status', '--porcelain']) ?? '') !== '',
  definition,
  directories,
  documents,
  manifests,
  fileEndings,
  vocabulary: vocabulary(),
};

if (wantNeighbours) {
  const r = spawnSync('gh', ['repo', 'list', '--limit', '200', '--json', 'name,description,isArchived,isFork'], { encoding: 'utf8' });
  if (r.status === 0) {
    try {
      out.neighbours = JSON.parse(r.stdout)
        .filter((n) => !n.isFork && n.name !== out.repositoryName)
        .map((n) => ({ name: n.name, description: n.description || null, archived: n.isArchived }));
    } catch {
      out.neighboursUnavailable = 'gh answered with something that was not JSON.';
    }
  } else out.neighboursUnavailable = 'The gh CLI is missing or not signed in, so the other repositories could not be listed. Ask for their names instead.';
}

console.log(JSON.stringify(out, null, 2));
