# Product

<!-- impeccable:product-schema 1 -->

> Provenance: written from Patrick's founding brief (2026-10-12) while he was asleep. Nothing here
> was confirmed in an interview. Lines marked **[inferred]** are my reading of the brief, not
> something Patrick said; everything else paraphrases the brief directly.

## Platform

web

## Stack

Delegated ("investigate the best architecture rather than assuming a conventional React dashboard").
Chosen: Vite + TypeScript, a custom Canvas 2D world renderer, and a thin Preact layer for the few
DOM surfaces. Reasoning and rejected alternatives are in [ARCHITECTURE.md](ARCHITECTURE.md).

## Users

One person: Patrick. He builds software products and has far more ideas than he has time to
build. He is the ruler, planner and explorer of this world, and its only audience.

He opens it at a desk, on a large screen, in two situations **[inferred]**:

- **Surveying.** Looking over everything he has made and might make, to decide where to spend
  the next stretch of effort, or simply to enjoy seeing it.
- **Capturing.** A new idea has arrived, or a project has moved, and he wants the world to
  reflect it.

## Product Purpose

Patrick's World turns his projects, ideas, experiments and ambitions into a living world he can
explore, instead of lists, boards and folders.

It exists because lists flatten everything: a thought he had once and a product he has built for
six months look the same in a list. In the world they cannot look the same. One is a mark on
open ground; the other is a city.

Success is an emotional response backed by an honest picture:

- He can see which projects matter most without reading anything.
- He can tell "thought of this once" from "built this for six months" at a glance.
- He wants to put his real projects into it.
- He would keep it open.

## Positioning

Everything visible is evidence. Size, light, construction, roads, ruins and unlocked
technologies are all computed from what actually happened (commits, shipped features, time
invested, real usage) and never from clicking, streaks or points. A project-management tool
with a map skin could not copy this truthfully, because its map would be decoration over
statuses someone typed. Here there is no status field to type: a city's state is derived.

## Operating Context

- A personal desktop web app, run locally for now.
- Separate from Patrick OS (his personal intelligence and memory system). Patrick OS may later
  supply structured entities and events; the world must work without it.
- Eventual sources: GitHub, Patrick OS, manually captured ideas, project metadata, deployed
  applications, project analytics. None are connected yet. All of them arrive through one
  adapter boundary as an append-only stream of events.
- The first build runs entirely on a synthetic fixture world.

## Capabilities and Constraints

Confirmed by the brief:

- An explorable world: pan, zoom, see everything at once, descend from world to city to feature.
- Projects are cities; ideas are smaller places that may or may not grow; features are
  buildings; skills are civilization-wide technologies; related projects are joined by roads.
- Features move through stages: concept, planned, designed, building, working, mature. Each
  stage must look different.
- Ideas grow through stages: spark, discovered site, outpost, settlement, town, city, major
  city. Growth comes from development, investment and evidence.
- Dormant projects go quiet. Abandoned projects become ruins. Revived projects show renewed
  construction. History is never destroyed.
- Time is a first-class dimension: he should be able to see the world as it was a year ago.
- New things can be added, expanded and connected from inside the world.

Hard constraints:

- No fake currencies, gems, streaks, XP or any reward that does not correspond to real work.
- Not a clone of any specific game's art, interface or mechanics.
- Not a dashboard with game icons; no card walls; no sidebar-plus-map layout.
- Not childish, not ornamented fantasy, not pixel art for its own sake.
- Must stay readable and fast with dozens to hundreds of projects, ideas and features.
- No real accounts connected, nothing pushed to a remote, in this phase.

Undecided (recorded, not invented):

- Where the world's data is stored once it is real (local file, database, Patrick OS).
- Whether anyone other than Patrick ever sees it.
- How private or unreleased projects should appear if it is ever shown to someone else.
- Whether the capture flow should eventually trigger real work (for example, opening an issue).

## Brand Commitments

- Working title: **Patrick's World**.
- Tone from the brief: experimental and playful, taken seriously as a product; "sophisticated
  enough that a professional adult would actually enjoy keeping open."
- Named inspirations are genres, not sources: strategy maps, city builders, technology trees,
  data visualization, simulation interfaces.

## Evidence on Hand

- One real project name appears in the brief: Boxout Fantasy, with features named there
  (fantasy league integration, Player Listener, MCP, injury intelligence, UI redesign).
- Everything else in the first build is synthetic: project names, features, dates, commit
  counts, usage numbers. The fixture world is fiction and is labelled as such inside the app.
- There is no real commit history, analytics or usage data in this repository. Future work must
  not present fixture numbers as Patrick's real numbers.

## Product Principles

1. **Evidence, not effort theatre.** If it is on the map, something real put it there.
2. **Scale is the message.** Importance, maturity and activity are read from size, density,
   light and motion before any word is read.
3. **Nothing is deleted.** Ruins, dormant towns and abandoned outposts are history, and
   history is the point.
4. **The world is the interface.** Chrome stays out of the way; the map is never a widget
   inside a layout.
5. **Small things stay small.** A half-formed thought is a mark on the ground, and that is a
   legitimate, permanent thing for it to be.

## Accessibility & Inclusion

No requirement was stated. Adopted as a baseline **[inferred]**: every place reachable and
operable from the keyboard, state never carried by colour alone (shape and structure change
with state), reduced-motion honoured, text contrast at WCAG AA.
