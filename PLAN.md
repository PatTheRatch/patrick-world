# Plan

Each stage runs plan → build → test → review → refine → commit. Status is updated as stages
land; the morning summary is in [HANDOFF.md](HANDOFF.md).

## Stage 0: Decide

- [x] PRODUCT, WORLD_MODEL, GAME_METAPHOR, VISUAL_DIRECTION, ARCHITECTURE, DATA_MODEL,
      INTERACTION_MODEL, PLAN

## Stage 1: The model

- [ ] Scaffold (Vite, TypeScript, Preact, Vitest)
- [ ] `world/types.ts`: events, catalogue, derived state, `WorldSource`
- [ ] `world/derive.ts` with thresholds, and tests for the rules
- [ ] Fixture world: authored as phases of activity, expanded to weekly events
- [ ] `plan/`: terrain, city plans, roads; tests for stability across dates

## Stage 2: A world on screen

- [ ] Camera, paper, ink primitives
- [ ] Territory layer: coast, rivers, relief near places, region lettering
- [ ] Places at four levels of detail
- [ ] Roads and mains
- [ ] Names with rank-based collision

## Stage 3: Exploring it

- [ ] Pan, zoom, flights, hit-testing, hover
- [ ] Survey notes for places and buildings
- [ ] Cartouche and scale
- [ ] Keyboard and the accessible index

## Stage 4: Time

- [ ] Edition dial and scrubbing
- [ ] Play forward
- [ ] Faded ink, slips, ruins all driven by the edition date

## Stage 5: The Key

- [ ] Key page: washes and stages
- [ ] Key of Methods as a prerequisite layout
- [ ] Method selection lighting places on the territory

## Stage 6: Adding

- [ ] Mark a site
- [ ] Stake a lot
- [ ] Survey a road
- [ ] Manual source persisted locally

## Stage 7: Critique and refine

- [ ] Screenshot review at each scale against VISUAL_DIRECTION
- [ ] Independent design review; fix what it finds
- [ ] Performance pass with `?perf`
- [ ] Remove anything that reads as a gimmick
- [ ] DESIGN.md recorded from what was built
- [ ] HANDOFF.md

## Out of scope tonight

Real data sources, persistence beyond local storage, accounts, deployment, mobile layout,
merging places, drawing revenue.
