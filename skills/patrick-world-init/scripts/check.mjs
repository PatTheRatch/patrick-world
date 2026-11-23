#!/usr/bin/env node
// Read a repository's patrick-world.json the way the world will, and say what it will make of it.
//
//   node check.mjs [directory]      (default: the current directory)
//   node check.mjs --json           the same, as JSON
//
// Exit 0: the file reads. Exit 1: it does not, and the world would refuse it whole.
// Read-only.
//
// Beyond whether it reads, three things are worth saying, because each is a way the map
// will differ from what the file's author expects:
//
//   wrong      the file reads, and something in it will be dropped or will not show
//   stale      the commits say more than the file does (fact beats claim)
//   unclaimed  ground with work on it that no feature names

import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { DEFINITION_FILE, candidateDirectories, dirsIn, historyOf, overlaps, readDefinition, repoRoot, vocabulary } from './lib.mjs';

const args = process.argv.slice(2);
const asJson = args.includes('--json');
const dir = args.find((a) => !a.startsWith('--')) ?? '.';

const STAGES = ['concept', 'planned', 'designed', 'building', 'working', 'mature'];
const count = (n) => `${n} commit${n === 1 ? '' : 's'}`;
const STARTED = STAGES.indexOf('building');

const report = { reads: false, errors: [], wrong: [], stale: [], unclaimed: [], summary: null };

const root = repoRoot(dir);
if (root === null) report.errors.push(`${dir} is not inside a git repository.`);
else {
  const read = readDefinition(root);
  if (!read.exists) report.errors.push(`There is no ${DEFINITION_FILE} at the top of this repository.`);
  else if (!read.ok) report.errors.push(...read.errors);
  else {
    report.reads = true;
    const { definition } = read;
    const words = vocabulary();

    if (definition.region !== undefined && !words.regions.some((r) => r.id === definition.region)) {
      report.wrong.push(`The map has no region "${definition.region}", so the city will be placed by a keyword guess. The regions are: ${words.regions.map((r) => r.id).join(', ')}.`);
    }
    const methods = new Set(words.methods.map((m) => m.id));
    const drawn = [];
    for (const f of definition.features) {
      const paths = f.paths ?? [];
      const strangers = (f.methods ?? []).filter((m) => !methods.has(m));
      if (strangers.length > 0) report.wrong.push(`"${f.id}" names what the Key of Methods does not have, which will be dropped: ${strangers.join(', ')}.`);
      const missing = paths.filter((p) => !existsSync(join(root, p)));
      if (missing.length > 0) report.wrong.push(`"${f.id}" names a path that is not here: ${missing.join(', ')}.`);

      let commits = 0;
      for (const p of paths) commits += historyOf(root, p).commits;
      const declared = STAGES.indexOf(f.stage);
      let stage = f.stage;
      if (declared < STARTED && commits > 0) {
        stage = 'building';
        report.stale.push(`"${f.id}" is declared ${f.stage}, and its paths already have commits. It will be drawn as building. If that is right, say so in the file.`);
      } else if (declared >= STARTED && paths.length === 0) {
        report.wrong.push(`"${f.id}" is declared ${f.stage} and names no paths, so the map cannot show how much work is in it.`);
      } else if (declared >= STARTED && commits === 0 && missing.length === 0) {
        report.wrong.push(`"${f.id}" is declared ${f.stage}, and nothing committed touches ${paths.join(', ')}. Are its paths right?`);
      }
      drawn.push({ id: f.id, name: f.name, kind: f.kind, declared: f.stage, drawnAs: stage, paths, commitsOnPaths: commits });
    }

    if (definition.features.length > 0) {
      const claimed = definition.features.flatMap((f) => f.paths ?? []);
      for (const path of candidateDirectories((p) => dirsIn(root, p))) {
        if (claimed.some((p) => overlaps(p, path))) continue;
        const { commits } = historyOf(root, path);
        if (commits > 0) report.unclaimed.push({ path, commits });
      }
    }

    report.summary = {
      id: definition.id,
      name: definition.name,
      what: definition.what,
      region: definition.region ?? null,
      features: drawn,
      links: definition.links ?? [],
      featuresGuessedFromDirectories: definition.features.length === 0,
    };
  }
}

if (asJson) console.log(JSON.stringify(report, null, 2));
else {
  if (!report.reads) {
    console.log(`${DEFINITION_FILE} does not read. The world would refuse it whole:`);
    for (const e of report.errors) console.log(`  - ${e}`);
  } else {
    const s = report.summary;
    console.log(`${s.name} (${s.id})${s.region ? `, in ${s.region}` : ''}`);
    console.log(`  ${s.what}`);
    if (s.featuresGuessedFromDirectories) console.log('  No features listed: they will go on being guessed from directories.');
    for (const f of s.features) {
      const as = f.drawnAs === f.declared ? f.declared : `${f.drawnAs} (declared ${f.declared})`;
      const work = f.paths.length === 0 ? (STAGES.indexOf(f.declared) < STARTED ? 'no code yet' : 'no paths named') : count(f.commitsOnPaths);
      console.log(`  ${f.name.padEnd(34)} ${f.kind.padEnd(11)} ${as.padEnd(28)} ${work}`);
    }
    for (const l of s.links) console.log(`  ${l.kind} ${l.to}${l.carries ? ` (${l.carries})` : ''}`);
    const section = (title, items, show) => {
      if (items.length === 0) return;
      console.log(`\n${title}`);
      for (const item of items) console.log(`  - ${show(item)}`);
    };
    section('Will not come out as written:', report.wrong, (x) => x);
    section('The commits say more than the file:', report.stale, (x) => x);
    section('Ground with work on it that no feature names:', report.unclaimed, (x) => `${x.path} (${count(x.commits)})`);
    if (report.wrong.length + report.stale.length + report.unclaimed.length === 0) console.log('\nNothing to fix.');
  }
}
process.exit(report.reads ? 0 : 1);
