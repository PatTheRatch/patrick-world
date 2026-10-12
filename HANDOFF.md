# Morning handoff

Written at the end of the overnight build, 12 October 2026.

```sh
npm run dev      # http://localhost:5199
```

The first time you open it in a session, the atlas draws itself from its first edition (early
2023) to today in a few seconds. Then: scroll to zoom, click a town, double-click to go in,
drag the dial at the bottom to turn the edition back, `K` for the Key.

## What you have

A working prototype that meets all fifteen of the brief's success criteria on desktop. The
independent design review ended at **fix, not ship**: it passed the look and the model and left
five items open, listed under "What did not work". Nothing is pushed anywhere; 8 commits on
local `main`.

**Three decisions I made for you while you slept, which you should accept or overrule:**

1. **The visual direction.** The world is drawn as a fire-insurance survey atlas. This was
   assigned by the design process's dice, not chosen by taste, and it was not my own first pick
   (a national topographic sheet was). I think it turned out to be the stronger choice, because
   the form already has words for "from plans", "being built" and "ruins". The other six
   candidates and why each lost are in [VISUAL_DIRECTION.md](VISUAL_DIRECTION.md).
2. **No scale bar.** Distances in the world measure nothing, so a bar would be the one mark with
   no evidence behind it. The cartouche carries a tally instead.
3. **The territory is an island.** A fire atlas would never show a coast. I added one so the
   world has an edge and a frontier.

## What was built

- **The model** (`src/world/`). An append-only event log and one pure function,
  `derive(events, catalogue, asOf)`, that turns it into the world at any date. Ranks,
  liveliness, storeys, road grades and method levels are all computed. No status is stored.
- **A synthetic world.** 23 places, 1,469 events from early 2023 to today: Boxout Fantasy as a
  major city of 32 features, three more cities and towns under construction, a revived town
  (Wirefeed), a dormant one (Shotchart), ruins (Hooplytics, which Boxout split from), and 14
  ideas from pencil crosses to outposts. Patrick's World itself is on the map as a one-day-old
  outpost.
- **Geometry** (`src/plan/`). A procedural coast, rivers and relief; town plans that grow
  outward on a street grid and never rearrange; roads.
- **The renderer** (`src/render/`). Canvas 2D. Pencil, plans, hatching, wash, shadows by
  storey, correction slips under recent work, ink that browns with age.
- **The lettered surfaces** (`src/app/`). Cartouche, edition dial, survey notes, the Key and
  Key of Methods, and three ways to add to the world: mark a site, stake a lot, survey a road.
- **Twelve documents**, including [DESIGN.md](DESIGN.md), recorded from the built result.

## How the world model works

Everything is a function of history. A source reports facts ("work was logged on this feature
this week", "this feature reached working"); the derivation decides what they mean.

- A **place** is anything you might build. An idea and a project are the same thing with
  different amounts of evidence, which is why a spark can become a city without being converted.
- **Rank** (spark to major city) is a ladder over working features, weeks with work in them,
  releases and measured users. It only rises.
- **Liveliness** comes from time since the last work. Dormancy cannot go stale because it is an
  absence, not a field.
- **Time travel** is `derive` with an earlier date. Nothing is snapshotted.
- **Position is permanent.** A place stands where it was founded; a city's seventh feature
  always stands on the seventh lot. That is what makes the edition dial feel like peeling paper.

Every tunable number is in `src/world/thresholds.ts`. The adapter boundary is the `WorldSource`
interface in `src/world/types.ts`; [DATA_MODEL.md](DATA_MODEL.md) says what a Patrick OS or
GitHub adapter would have to emit.

## What is mocked

| Thing | State |
|---|---|
| All places, features, dates, commits, users | Fiction, generated in `src/world/fixtures/`. Labelled on screen. |
| Boxout Fantasy and Patrick OS | Real names from your brief; everything inside them is invented. |
| "Today" | Pinned to 2026-10-12 in `src/app/store.ts`, where the fixture history ends. |
| Things you add | Real events, kept in this browser's local storage only. |
| GitHub, Patrick OS, analytics, deploys | Not connected. Only the interface exists. |
| Stage changes | In the fixture they are authored. "Record as…" in a building's note is your own claim, logged as `manual`. |

## Architecture choices

- **Canvas 2D, not SVG, WebGL or Three.js.** The look is strokes, washes and paper, which is
  Canvas's native vocabulary; shape counts are modest at every zoom. Measured: about 2 ms a frame
  for the real world. The renderer only consumes plain geometry, so moving to WebGL later means
  rewriting `src/render/` and nothing else. Reasoning in [ARCHITECTURE.md](ARCHITECTURE.md).
- **Preact and signals** for six DOM surfaces. The canvas loop reads the same state directly.
- **True plan, no 3D.** Height is read from cast shadows: a building's storeys are the work in it.
- **Towns are drawn larger than life from far away** (up to 2.3 times) and settle to true scale
  as you descend. Without this, cities were specks and the first criterion failed.

## What worked visually

- A city seen close: dense blocks of wash, each building's shadow as long as the work in it.
- Stage carried by drawing technique instead of colour. The six stages are told apart without a
  legend, and the legend in the Key uses the same drawings.
- The past. Turn the dial to 2024 and Boxout Fantasy is a small town with a lowercase name, most
  of the country is lettered UNSURVEYED, and the relief has not been drawn yet.
- Lighting a method (try MCP) rings the four places that used it and fades the rest.
- Red used for nothing except your own hand: selection, the current edition, what you are drawing.

## What did not work, or is not finished

From the design review's final verdict, most material first:

1. **Turning the edition back only half un-builds.** Washes drain, but roads, outlines, slips and
   whole places cut out instead of un-drawing. This is the signature interaction, so it is the
   most important open item.
2. **New towns fade in** instead of being drawn by the pen. Only pencil crosses are stroke-drawn.
3. **Small place names sit on a visible pale plate** where they cross the coast or a stream.
4. **The top neat line is cropped at home** on a wide window; the sheet is taller in proportion
   than the screen.
5. **Mobile is a courtesy layout.** The home view clips the territory. It was out of scope.

My own additions:

- The Boxout note is still tall. On a 1024 x 700 window its actions fall below the fold.
- Staked lots are unlabelled until you are close in.
- A city's ward names are faint and could be lettered along streets instead.
- Revenue is not drawn at all. I found no honest spatial form for it.
- A feature you mark "working" by hand, with no commits, reads oddly ("Stands 1 storey: 0
  commits of work").

## Test and build status

- `npm run check` passes: typecheck clean, **108 of 108 tests** in 9 files, production build
  succeeds.
- Tests cover the rules (rank never falls, each cast member reaches its required state, layout
  is identical across dates, no lot overlaps, every place stands on dry land). There are no
  pixel tests; rendering was verified by eye from screenshots.
- A QA agent drove the app with a real pointer and keyboard and found twelve bugs. Ten are
  fixed and re-verified, including a past edition that could be edited three ways and a
  double-click that opened "Mark a site" instead of entering a town. Two are not fixed: hover can
  go stale after a camera flight ends (it is corrected after a wheel zoom), and the note at
  1024 x 700 mentioned above.
- Not tested: touch and pinch, Safari and Firefox, screen readers, the `prefers-reduced-motion`
  media query itself (only the equivalent `?still`).

## Performance

Measured in headless Chrome on this machine, 1440 x 900, dev build, 60 Hz cap.
`?stress=N` multiplies the world; `?perf` shows timings.

| Places | Pan and zoom | Dragging the dial | Draw per frame | Derive |
|---|---|---|---|---|
| 23 (the real world) | 60 fps | 60 fps | about 2 ms | under 1 ms |
| 299 | 60 fps | 60 fps (was 54 before fixes) | about 10 ms | about 3 ms |
| 713 | 60 fps, no headroom | 95th percentile 33 ms (was 67 ms) | about 21 ms | about 6 ms |

So the design target of 300 places holds. Beyond that the costs, in order, are: drawing every
visible town in full detail every frame, laying out place names every frame, and rebuilding a
path per road per frame. Each has a known fix (sprite cache below a pixel size, cached label
layout on a pure pan, cached road paths), written up in the QA report's ranking. None are needed
until the world is several times its current size.

## Five highest-value next steps

1. **A GitHub adapter.** One repository to one place, commits bucketed by week, tags as
   releases. This is the step that turns the specimen into your world, and the only
   configuration it needs is a small repository-to-place mapping. Until real data is in, nobody
   can judge whether the rank thresholds are right.
2. **Finish the un-build.** Roads un-draw, outlines retract, slips lift, towns are drawn by the
   pen. The dial is what makes this feel alive and it is half done.
3. **Decide where the log lives.** Manual marks are in local storage. A JSON file in a private
   repository would be enough and would give the world its own git history.
4. **Tune the ladder against your real projects.** Six working features for a city and a hundred
   users for a major city are guesses. So is what counts as dormant.
5. **A Patrick OS adapter and a capture path from outside the app.** Ideas should arrive on the
   map from wherever you have them, not only when the map is open.

## Where things are

| | |
|---|---|
| Rules and thresholds | `src/world/thresholds.ts`, `src/world/derive.ts` |
| The fictional history | `src/world/fixtures/world.ts` |
| The adapter interface | `src/world/types.ts` (`WorldSource`) |
| Inks | `src/render/palette.ts` (the only place colours are defined) |
| How each stage is drawn | `src/render/place.ts` |
| Keyboard and pointer | `src/app/World.tsx`, `src/app/view.ts` |
| Review screenshots | `.impeccable/review/` (not committed) |
