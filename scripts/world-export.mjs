#!/usr/bin/env node
// Write the world as it stands, from the last sync, to public/data/world.json, in the plain
// shape the mockup of the new world draws from. Run as `npm run world:export`.
//
//   npm run sync:github     read your repositories into public/data/github.json
//   npm run world:export    derive the world from that record   ← this script
//   npm run world:build     draw it (mockups/out/world-mine.html)
//
// It derives exactly as the app does: the same events, the same `derive`, the same day (the
// day of the sync). The world's code is TypeScript with imports Node cannot follow on its
// own, so it is loaded through Vite, which the project already has. No network call.
//
// The output is private, like the record it is made from. public/data/ is git-ignored.

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const RAW = resolve(ROOT, 'public', 'data', 'github.json');
const OUT = resolve(ROOT, 'public', 'data', 'world.json');

if (!existsSync(RAW)) {
  console.error('There is no GitHub record yet. Run: npm run sync:github');
  process.exit(1);
}

const server = await createServer({ root: ROOT, configFile: false, appType: 'custom', logLevel: 'error', server: { middlewareMode: true, hmr: false, ws: false } });
try {
  const load = (path) => server.ssrLoadModule(path);
  const { derive } = await load('/src/world/derive.ts');
  const { catalogue } = await load('/src/world/fixtures/catalogue.ts');
  const { buildTerrain } = await load('/src/plan/terrain.ts');
  const { surveyGithub } = await load('/src/world/sources/github/transform.ts');
  const { isoDay } = await load('/src/world/time.ts');

  const raw = JSON.parse(readFileSync(RAW, 'utf8'));
  const terrain = buildTerrain(catalogue, 'patricks-world');
  const survey = surveyGithub(raw, catalogue, terrain.isLand);
  const world = derive(survey.events, catalogue, isoDay(raw.fetchedAt));

  const round = (n) => Math.round(n * 100) / 100;
  const out = {
    asOf: world.asOf,
    size: catalogue.size,
    regions: catalogue.regions.map((r) => ({ id: r.id, name: r.name, x: r.center.x, y: r.center.y, r: r.radius })),
    places: world.places.map((p) => ({
      id: p.id,
      name: p.name,
      region: p.region,
      x: p.position.x,
      y: p.position.y,
      note: p.note,
      rank: p.rank,
      live: p.liveliness,
      heat: round(p.heat),
      commits: p.commits,
      users: p.users,
      founded: p.foundedAt,
      last: p.lastWorkAt ?? null,
      f: p.features.map((f) => ({
        id: f.id,
        n: f.name,
        k: f.kind,
        w: f.ward ?? null,
        s: f.stage,
        st: f.storeys,
        pr: round(f.progress),
        h: round(f.heat),
        c: f.commits,
        lm: f.landmark,
        note: f.note ?? null,
        last: f.lastWorkAt ?? null,
      })),
    })),
    links: world.links.map((l) => ({ a: l.a, b: l.b, g: l.grade, k: l.kinds, carries: l.carries ?? null })),
  };
  writeFileSync(OUT, JSON.stringify(out));

  // Counts only. No project's name is echoed except where its definition needs attention.
  const features = out.places.reduce((n, p) => n + p.f.length, 0);
  console.log(`World as of ${out.asOf}: ${out.places.length} projects, ${features} features, ${out.links.length} ties.`);
  console.log(`  ${survey.described} of ${out.places.length} are drawn from their own patrick-world.json; the rest are guessed from commits.`);
  if (out.links.length === 0) console.log('  No ties: nothing has said how the projects connect. A definition file is where that is said.');
  for (const note of survey.notes) console.log(`  note: ${note}`);
  console.log(`  wrote ${OUT}`);
} finally {
  await server.close();
}
