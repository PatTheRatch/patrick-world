#!/usr/bin/env node
// Assemble the mockup of the new world into self-contained pages under mockups/out/.
// Run as `npm run world:build`, or `npm run world` to export, build and serve in one go.
//
// Three pages for each world drawn:
//
//   world.html   holds the other two and hands you from one to the other. Open this one.
//   board.html   every project at once, on a lit board: how much there is, what connects
//   bay.html     one project, arrived at: its skyline at dusk and the bridges to its neighbours
//
// Two worlds are drawn when both are there:
//
//   the specimen (mockups/specimen.json, fictional)        → world.html
//   your own     (public/data/world.json, private; made by
//                 `npm run world:export` from the last sync) → world-mine.html
//
// Everything under mockups/out/ is kept out of git: a page built from your own projects
// carries their names.
//
// How a page is put together: kit.js up to its marker (maths, the hour, the camera, the
// geometry builder, the building types and the shared drawing helpers), then the view's own
// tail.js, which runs inside the kit's function and closes it. themes.js gives the looks.

import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const out = resolve(here, 'out');
mkdirSync(out, { recursive: true });

const kitSource = readFileSync(resolve(here, 'kit.js'), 'utf8');
const themes = readFileSync(resolve(here, 'themes.js'), 'utf8');
// The kit is the first half of the first-round engine, and its drawing helpers.
const KIT =
  kitSource.slice(0, kitSource.indexOf('  // ───────────────────────── a city ─────────────────────────')) +
  kitSource.slice(kitSource.indexOf('  let hover = null;'), kitSource.indexOf('  function draw(t) {'));

const BASE = `
*{box-sizing:border-box}
html,body{margin:0;height:100%;overflow:hidden;background:var(--page)}
body{font:15px/1.45 var(--body);color:var(--ink)}
canvas{position:fixed;inset:0;width:100vw;height:100vh;display:block;cursor:grab;touch-action:none}
canvas:active{cursor:grabbing}
::selection{background:var(--accent);color:var(--on-accent)}
#plate{position:fixed;left:28px;top:24px;max-width:22rem;pointer-events:none}
#plate h1{margin:0;font:var(--title);letter-spacing:var(--title-track);text-transform:var(--title-case);color:var(--title-ink)}
#plate p{margin:6px 0 0;color:var(--plate-ink)}
#plate .specimen{font-size:12.5px;opacity:.9}
#hint{position:fixed;left:28px;bottom:20px;margin:0;font-size:13px;color:var(--plate-ink);pointer-events:none}
aside{position:fixed;right:24px;width:21rem;max-width:calc(100vw - 48px);padding:18px 20px 16px;background:var(--panel);color:var(--panel-ink);border:var(--panel-border);border-radius:var(--radius);box-shadow:var(--panel-shadow)}
#city{top:24px}
#building{bottom:24px}
aside h2,aside h3{margin:0 0 6px;font:var(--heading);letter-spacing:var(--heading-track);text-transform:var(--heading-case)}
aside h3{font-size:1.15rem}
aside p{margin:0 0 8px}
aside .what{max-width:34ch}
aside .tally,aside .facts,aside .kind{font-size:13px;color:var(--panel-soft)}
aside .note{font-style:italic}
aside ul{list-style:none;margin:12px 0 0;padding:10px 0 0;border-top:var(--rule)}
aside li{display:flex;align-items:center;gap:9px;padding:3px 0;font-size:14px}
aside li i{width:12px;height:12px;flex:none;border-radius:var(--chip-radius);border:var(--chip-border)}
aside li b{margin-left:auto;font-weight:600;font-variant-numeric:tabular-nums}
#back{position:fixed;left:28px;top:118px;padding:9px 16px 8px;font:600 13px var(--body);letter-spacing:.04em;color:var(--on-accent);background:var(--accent);border:var(--button-border);border-radius:var(--button-radius);cursor:pointer}
#back:hover{filter:brightness(1.08)}
#back:focus-visible{outline:3px solid var(--focus);outline-offset:3px}
#plate,#hint{transition:opacity .5s}
.in-city #plate,.in-city #hint{opacity:0}
.in-city #back{top:24px}
[hidden]{display:none!important}
`;
// Defaults a view's own meta.json overrides in its `skin`.
const SKIN = `:root{--page:#0a0e18;--ink:#eadfc8;--body:"Avenir Next","Helvetica Neue","Segoe UI",sans-serif;
--title:600 13px/1 "Avenir Next","Helvetica Neue","Segoe UI",sans-serif;--title-track:.3em;--title-case:uppercase;--title-ink:#cdb88a;--plate-ink:#8f93a3;
--panel:rgba(13,17,28,.9);--panel-ink:#ece1ca;--panel-soft:#a69d88;--panel-border:1px solid rgba(217,166,64,.45);--radius:2px;--panel-shadow:0 24px 60px rgba(0,0,0,.6);
--heading:600 22px/1.15 "Avenir Next","Helvetica Neue","Segoe UI",sans-serif;--heading-track:0;--heading-case:none;--rule:1px solid rgba(217,166,64,.28);
--chip-radius:2px;--chip-border:0;--accent:#c9983c;--on-accent:#14100a;--button-border:0;--button-radius:2px;--focus:#f3e6c8}`;

function page(view, data) {
  const dir = resolve(here, view);
  const meta = JSON.parse(readFileSync(resolve(dir, 'meta.json'), 'utf8'));
  const tail = readFileSync(resolve(dir, 'tail.js'), 'utf8');
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Patrick's World: ${meta.title}</title>
<style>${SKIN}${meta.skin ?? ''}${BASE}</style>
</head>
<body>
<canvas id="world" aria-label="A world of projects. Each building is something a project does."></canvas>
<header id="plate"><h1>Patrick&rsquo;s World</h1><p id="tally"></p><p class="specimen">${meta.note ?? ''}</p></header>
<button id="back" type="button" hidden>${meta.back ?? 'Back'}</button>
<aside id="city" hidden></aside>
<aside id="building" hidden></aside>
<p id="hint">${meta.hint ?? ''}</p>
${meta.body ?? ''}
<script>const DATA=${data};</script>
<script>${themes}</script>
<script>const THEME=THEMES[${JSON.stringify(meta.theme ?? 'sketch')}];</script>
<script>${KIT}${tail}</script>
</body>
</html>
`;
}

function build(dataFile, suffix, label) {
  const data = readFileSync(dataFile, 'utf8');
  const count = JSON.parse(data).places.length;
  for (const view of ['board', 'bay']) writeFileSync(resolve(out, `${view}${suffix}.html`), page(view, data));
  // The holding page opens its two halves by name.
  const shell = readFileSync(resolve(here, 'world.html'), 'utf8').replaceAll('board.html', `board${suffix}.html`).replaceAll('bay.html', `bay${suffix}.html`);
  writeFileSync(resolve(out, `world${suffix}.html`), shell);
  const kb = (statSync(resolve(out, `board${suffix}.html`)).size + statSync(resolve(out, `bay${suffix}.html`)).size) / 1024;
  console.log(`  world${suffix}.html  ${label}: ${count} projects (${kb.toFixed(0)} kB)`);
}

console.log('Built into mockups/out/:');
build(resolve(here, 'specimen.json'), '', 'the fictional specimen');
const mine = resolve(here, '..', 'public', 'data', 'world.json');
if (existsSync(mine)) build(mine, '-mine', 'your own projects, from the last export');
else console.log('  (no world-mine.html: run `npm run world:export` after a sync to draw your own projects)');
