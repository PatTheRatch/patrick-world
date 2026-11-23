#!/usr/bin/env node
// Serve mockups/out/ on this machine only, so the pages can be opened in a browser.
// Run as `npm run world:serve` (or `npm run world`). No dependencies; Ctrl-C to stop.
//
//   node mockups/serve.mjs [port]     default 5290

import { createReadStream, existsSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { dirname, extname, normalize, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), 'out');
const port = Number(process.argv[2] ?? 5290);
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.json': 'application/json', '.png': 'image/png' };

if (!existsSync(root)) {
  console.error('Nothing built yet. Run: npm run world:build');
  process.exit(1);
}

createServer((req, res) => {
  const path = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
  const file = resolve(root, `.${normalize(path === '/' ? '/world.html' : path)}`);
  // Never serve anything outside mockups/out/.
  if (file !== root && !file.startsWith(root + sep)) return void res.writeHead(403).end('Forbidden');
  if (!existsSync(file) || !statSync(file).isFile()) return void res.writeHead(404).end('Not found');
  res.writeHead(200, { 'content-type': TYPES[extname(file)] ?? 'application/octet-stream', 'cache-control': 'no-store' });
  createReadStream(file).pipe(res);
})
  // Bound to this machine: a page built from your own projects carries their names.
  .listen(port, '127.0.0.1', () => {
    console.log(`The new world, on this machine only:`);
    console.log(`  http://localhost:${port}/world.html        the fictional specimen`);
    if (existsSync(resolve(root, 'world-mine.html'))) console.log(`  http://localhost:${port}/world-mine.html   your own projects`);
    console.log('Add ?hour=21 to see it after dark. Ctrl-C to stop.');
  });
