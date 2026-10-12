# Plan

Each stage runs plan → build → test → review → refine → commit. Status is updated as stages
land; the morning summary is in [HANDOFF.md](HANDOFF.md).

## Stage 0: Decide

- [x] PRODUCT, WORLD_MODEL, GAME_METAPHOR, VISUAL_DIRECTION, ARCHITECTURE, DATA_MODEL,
      INTERACTION_MODEL, PLAN

## Stage 1: The model

- [x] Scaffold (Vite, TypeScript, Preact, Vitest)
- [x] `world/types.ts`: events, catalogue, derived state, `WorldSource`
- [x] `world/derive.ts` with thresholds, and tests for the rules
- [x] Fixture world: authored as phases of activity, expanded to weekly events
- [x] `plan/`: terrain, city plans, roads; tests for stability across dates

## Stage 2: A world on screen

- [x] Camera, paper, ink primitives
- [x] Territory layer: coast, rivers, relief near places, region lettering
- [x] Places at four levels of detail
- [x] Roads and mains
- [x] Names with rank-based collision

## Stage 3: Exploring it

- [x] Pan, zoom, flights, hit-testing, hover
- [x] Survey notes for places and buildings
- [x] Cartouche and scale
- [x] Keyboard and the accessible index

## Stage 4: Time

- [x] Edition dial and scrubbing
- [x] Play forward
- [x] Faded ink, slips, ruins all driven by the edition date

## Stage 5: The Key

- [x] Key page: washes and stages
- [x] Key of Methods as a prerequisite layout
- [x] Method selection lighting places on the territory

## Stage 6: Adding

- [x] Mark a site
- [x] Stake a lot
- [x] Survey a road
- [x] Manual source persisted locally

## Stage 7: Critique and refine

- [x] Screenshot review at each scale against VISUAL_DIRECTION
- [x] Independent design review; fix what it finds
- [x] Performance pass with `?perf`
- [x] Remove anything that reads as a gimmick
- [x] DESIGN.md recorded from what was built
- [x] HANDOFF.md

## Out of scope tonight

Real data sources, persistence beyond local storage, accounts, deployment, mobile layout,
merging places, drawing revenue.
