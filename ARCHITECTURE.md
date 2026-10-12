# Architecture

## Decision

- **Vite + TypeScript**, no backend.
- **A custom Canvas 2D renderer** for the world.
- **Preact + signals** for the handful of DOM surfaces lettered over it.
- **An event log and a pure derivation** for all state (see [WORLD_MODEL.md](WORLD_MODEL.md)).

## Choosing the renderer

The experience decided this, so the question was: what draws ink, wash and paper best, stays
smooth while zooming from a whole territory to one building, and holds a few thousand shapes?

| Candidate | Verdict | Why |
|---|---|---|
| **Canvas 2D** | **Chosen** | The look is strokes, fills and multiply-blended washes over a paper texture. That is Canvas 2D's native vocabulary: `Path2D`, dash offsets for the pen, `multiply` compositing for washes. One immediate-mode draw pass with culling comfortably handles the shape counts at each zoom level. No asset pipeline. |
| SVG / D3 | Rejected for the world | Perfect for a few hundred nodes, and the DOM gives hit-testing free. But a dense city is thousands of paths, each a DOM node, restyled on every zoom. Zooming a large SVG re-rasterises everything and stutters exactly where the product needs to be smoothest. D3's scales and zoom maths are nice but small enough to write. |
| PixiJS (WebGL) | Rejected for now | Best raw throughput, and the right move if the world reaches tens of thousands of visible sprites. But its strength is textured sprites, and this look is procedural vector line work with variable dashes and blended washes, which in Pixi means tessellating everything or pre-rendering to textures and fighting blur at deep zoom. More machinery, less fidelity, for headroom not yet needed. |
| Three.js | Rejected | The brief warned against 3D for its own sake, and the direction is a true plan. A 3D scene would add a camera rig, lighting and materials to draw a flat sheet. |
| React map/graph libraries | Rejected | They bring their own visual assumptions (tiles, nodes and edges). The drawing *is* the product; it cannot be a theme on someone else's component. |

The escape hatch is real: the renderer consumes plain geometry (`CityPlan`, `Terrain`) and
draws through a small set of ink primitives. Replacing Canvas 2D with WebGL means rewriting
`src/render/`, not the model, layout or app.

## Why Preact and not a full React app

There are perhaps six DOM surfaces: the cartouche, the edition dial, the survey note, the Key,
the capture slip, and an accessible index of places. Preact with signals keeps them reactive
at 4 kB, and signals let the canvas loop read the same state without a render cycle.

## Module map

```
src/
  world/            The model. No DOM, no canvas. Fully unit-tested.
    types.ts          Events, catalogue, derived state, the WorldSource interface
    thresholds.ts     Every tunable rule in one place
    derive.ts         events + date → WorldState
    sources/          FixtureSource, ManualSource (the adapter boundary)
    fixtures/         The synthetic world, authored as phases and expanded to events
  plan/             Geometry. Pure, seeded, deterministic. Unit-tested.
    rng.ts            Seeded random
    terrain.ts        Coast, rivers, relief, region outlines
    city.ts           WorldState place → streets, blocks, lots, footprints
    roads.ts          Routes between places
  render/           Canvas. Reads plans and state; writes pixels.
    camera.ts         World↔screen transform, inertial pan, eased flights
    ink.ts            The primitives: pencil, pen, wash, hatch, slip, shadow, lettering
    paper.ts          Paper and table textures
    territory.ts      Draws the world layer
    city.ts           Draws a city at the level of detail the zoom deserves
    renderer.ts       Frame loop, culling, layer order, hit-testing
  app/              State and DOM.
    store.ts          Signals: log, edition date, selection, camera target
    ui/               Cartouche, EditionDial, SurveyNote, Key, Capture, Index
  main.ts
```

Dependencies point one way: `app → render → plan → world`. `world` imports nothing.

## The frame

1. **Table.** Dark ground beyond the sheet.
2. **Sheet.** Paper pattern, sheet edge and shadow.
3. **Territory.** Water, relief, region lettering. Detail fades in only near founded places.
4. **Connections.** Roads and mains.
5. **Places.** Each drawn by `city.ts` at one of four levels of detail.
6. **Lettering.** Names, collision-resolved by rank so big places always win.
7. **The surveyor's hand.** Selection, hover, in-progress capture: surveyor's red.

DOM surfaces sit above the canvas and are positioned from the same camera.

## Level of detail

Zoom is continuous; detail is chosen per place from its size on screen.

| On-screen size | Drawn as |
|---|---|
| A few pixels | A mark: cross, stake or dot, plus a name if rank earns one |
| Tens of pixels | Massing: blocks as merged washes by dominant kind, the main streets |
| Hundreds of pixels | Buildings: every footprint, stage rendering, shadows, slips |
| Fills the view | Detail: storey numerals, building names, ward and street lettering, build order |

Adjacent levels cross-fade over a zoom band so nothing pops.

### Exaggeration

At true scale a city seen from territory height is a speck, and the brief's first requirement
(see which projects matter without reading) fails. So towns are drawn larger than life when far
away, up to 2.3 times, settling to true scale by the time buildings are legible. This is
ordinary cartographic practice: a road on a national map is not drawn at its true width either.
The apparent size is interpolated so it only ever grows as the camera comes down. Hit-testing,
lettering and selection all go through the same transform (`Renderer.drawn`).

## Performance plan

- **Draw only on change.** The loop sleeps unless the camera is moving, the edition is
  scrubbing, a pen/wash/paste animation is running, or a building under construction is on
  screen (which crawls at a throttled rate).
- **Cull by bounds** before any path work.
- **Cache geometry, not pixels.** City plans and terrain are `Path2D` objects in world space,
  built once per place per edition change and stroked under the camera transform. Line widths
  are set in screen pixels so ink stays crisp at every zoom.
- **Batch by ink.** All black outlines in a city are one path and one stroke; each wash is one
  fill.
- **Texture once.** Paper is a small generated tile used as a pattern.
- **Budget.** 60 fps while panning the fixture world on a laptop; under 4 ms derive; under
  8 ms a frame at territory zoom. `?perf` shows frame and derive timings.

If the world outgrows this, the order of escalation is: tile-cache the territory layer to
offscreen canvases, then move the place layer to WebGL.

## Determinism

Every random choice (terrain, street angles, lot sizes, line wobble) is seeded from stable ids.
The same log always draws the same world, on any machine, at any date. This is what makes the
map feel like a place and not a visualisation.

## Testing

- `world/` and `plan/`: Vitest unit tests for the rules (rank ladders, liveliness, monotonic
  history, stable layout across dates, no overlapping lots).
- Rendering: verified by eye with screenshots at fixed cameras; no pixel tests yet.
- `npm run check` runs typecheck, tests and a production build.
