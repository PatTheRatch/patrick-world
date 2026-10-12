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

## Stage 8: Real data

- [ ] GitHub adapter: fetch, transform to events, load in place of the specimen
- [ ] Review inferred stages against what Patrick knows to be true; tune the rules
- [ ] A repository-to-place and path-to-feature mapping file for where inference is wrong
- [ ] The event log on disk, with a schema version

## Stage 9: The build model in the app

Contract and rule exist (`src/world/build.ts`, tested). Nothing below is built.

- [ ] Join `BuildEvent` to the world log; one ordering rule for days and date-times
- [ ] Migrate `FeatureStage` to `BuildStage`; `feature.staged` becomes inference only
- [ ] Draw the two new stages: ready (pegged corners) and verifying (washed, outline still dashed)
- [ ] The crawl follows an open session, not the stage
- [ ] A building's note shows its plan: objective, criteria with verdicts, steps, blockers, and
      the sentence saying why it stands where it does
- [ ] Write and revise a plan in the note; accept an agent's draft

## Stage 10: Building by hand

The first builder, because it needs no companion and proves the model.

- [ ] `ManualBuilder`: start a session, tick steps, record checks
- [ ] "Build manually" from a ready building
- [ ] Dependencies across features and places, drawn as a faint line while one is waiting

## Stage 11: The companion and the first agent

- [ ] The local companion: event channel, log on disk
- [ ] Neutral runner for `command` criteria, with output kept as evidence
- [ ] `ClaudeCodeBuilder`: headless launch from a brief, stream mapped to execution events
- [ ] Choose a builder per session: Claude Code, Codex, Cursor, manual
- [ ] `CodexBuilder`, `CursorBuilder`

## Stage 12: Ideas

- [ ] `origin` on founding; sparks from Claude, ChatGPT, Patrick OS
- [ ] `ScaffoldProvider` and one implementation
- [ ] Scaffold in a spark's note; accept, revise, pursue
- [ ] Pursuing stakes lots from the MVP

## Stage 13: Patrick OS

- [ ] `PatrickOsSource`: suggestions and context in
- [ ] `WorldObserver`: meaningful events out

## Out of scope tonight

Real data sources, persistence beyond local storage, accounts, deployment, mobile layout,
merging places, drawing revenue.
