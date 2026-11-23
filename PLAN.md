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

## What we do not know, and the order to find out

From the design review. Each prototype answers a question; none exists to look finished.

| Known | |
|---|---|
| Known knowns | The drawing reads; stage by technique works; the model derives and scrubs fast. |
| Known unknowns | Will he recognise his world from GitHub alone? Will he write plans? Can an agent session be mapped to plan steps without the agent reporting on itself? |
| Unknown knowns | He already plans somewhere (plan mode, notes, Patrick OS). The world must take those in, not compete with them. He builds across several tools and machines. |
| Suspected blind spots | **What a building is** (directory, pull request, capability?). Whether watching an agent on a map gives anything a terminal does not. Plans rotting. What a permanent layout looks like after six months of mis-scoped lots. Whether an honest map of mostly outposts discourages him. |

| # | Prototype | Question it answers | Stop when |
|---|---|---|---|
| 1 | His real GitHub on the sheet (built; awaiting his read of it) | Does he recognise it? Is a directory a building? | He can name three things it gets wrong and three it showed him |
| 2 | One real feature, planned by hand: a plan as a JSON file, built the usual way, events fed in by a tiny command | Is a plan the right size? Do the seven stages match how the work really went? | The feature is done, or the format was changed twice |
| 3 | The manual builder in the app, on a second feature | Is committing cheap enough to do unprompted? | He plans a third without being asked, or does not |
| 4 | A headless Claude Code run on one small plan, events only, no interface | Can steps and file changes be read from the stream? | Step boundaries are detected, or shown to need self-report |
| 5 | The companion and the builder chooser | Only if 2 to 4 held | |

**Now:** real data; the plan in a building's note; the manual builder; how-it-passed and
rewritten-promise marks. **Test first:** prototypes 2 and 4. **Later:** companion, Codex and
Cursor adapters, scaffolding, Patrick OS. **Not now:** drawing revenue, mobile, more
cartographic ornament, more Key of Methods, finishing the reverse-edition motion (it serves
reflection, not the loop).

## The world view, second pass

- [x] Attention at a glance: paper, edge and motion per place
- [x] A town's mass follows its work (houses)
- [x] Wider name scale; small ideas are marks without names from afar
- [x] Shaded relief and woodland under the survey
- [x] Inferred tracks between places that share methods
- [x] Honest construction drawing; stalled work weathers
- [x] Newly founded places marked
- [x] Town form by rank, growth-stable (latent skeleton; `src/plan/settlement.ts`)
- [x] What a place is made of shows in its lots and outline
- [x] Fabric saturates and infills
- [x] Traffic on routes where something really flows and work is current
- [x] Concave built-up outlines; five ground plans; fabric smaller, time-gated; motion means this week
- [x] Survey frozen by snapshot
- [x] Quarter purity (one grain to a street front) and one wash per quarter from afar
- [x] Regional roads enter by a town's own street ends
- [x] Side streets close into blocks; back lanes behind the frontages
- [x] Towns oriented to the ground (through route along the contour)
- [x] Ward bounds, and ward names beside them through district zoom
- [x] Streets and lots keep off each other's ground (re-surveyed 12 October 2026)
- [ ] Worked fields and regrowth
- [ ] District and building layers: built order, revision slips
- [ ] Bridges; lots that avoid water and steep ground; one ring for a ward on two arms

## Stage 8: Real data

- [x] GitHub adapter: fetch, transform to events, load in place of the specimen
- [x] The sync reads beyond the owner's own repositories: organisations, named repositories,
      GitHub Enterprise hosts; a team's record counts everyone's commits; unchanged
      repositories are reused so a large sync can resume
- [ ] Regions that are not the owner's personal four: a work map needs its own countries
- [ ] A way to hand the map to someone else (a build that carries a chosen record)
- [ ] Review inferred stages against what Patrick knows to be true; tune the rules
- [x] A city's own definition: `patrick-world.json` in each repository names its features, their
      paths, what is planned, its region and its links; the sync reads it with its history
- [x] The founding questionnaire: the `patrick-world-init` skill, to run in a repository with
      Claude Code, GitHub Copilot or Codex. It surveys the code, asks what it cannot see,
      writes the definition and checks it
- [x] AGENTS.md, so that any coding agent can work in this repository
- [ ] Run the questionnaire on real repositories; revise its questions from what it gets wrong
- [ ] A link to a city that does not exist yet drawn as a pencilled site
- [ ] The event log on disk, with a schema version

## Stage 9: The build model in the app

- [x] Build events joined to the world: `overlayBuilds` lays each feature's build state over
      the derived world, at any edition
- [x] A feature with a plan takes its stage from the plan; inferred stages remain for the rest
- [x] Ready (pegged corners) and verifying (washed, wall still dashed) drawn
- [x] The wall moves only while a session is open on a planned feature
- [x] Acceptance criteria marked on the frontage: shape is how it is checked, fill is the verdict
- [x] A pennant on a lot with a live session, visible from every height
- [x] A building's note: stage and why, objective, builder, blockers, steps, criteria
- [x] The plan sheet: objective, steps, criteria with evidence, who is building, what is in
      the way, what has happened
- [x] A scripted build in the specimen world, to scrub through
- [ ] Migrate `FeatureStage` to `BuildStage` outright (today build stages are mapped onto the
      older drawing stages; rank still counts inferred stages only)
- [ ] An agent's draft plan shown beside the accepted one, to accept or discard

## Stage 10: Building by hand

- [x] Write and revise a plan in the plan sheet; dropping a criterion is remembered
- [x] Start and end a manual session; finish steps; record a check with its evidence
- [x] Raise and clear blockers
- [x] A failed check holds it at verifying; a later failure takes done away
- [ ] Dependencies chosen in the sheet; a dependency across places grades the road
- [ ] How each criterion passed drawn on the wall itself; rewritten promises carry a slip
- [ ] "Since you were last here"

## Project understanding and resume

- [x] Evidence fetched per repository: README, recent commits and the files they changed, issues
- [x] An advisory understanding of each project, every claim with confidence and sources
- [x] "What this is" in each place's note, with its provenance
- [x] Suggestion rules over build plans, stages and work: "Pick up here because…", with evidence
- [x] "Where to pick up" in a place's note; field notes across the whole territory
- [x] Wording rules enforced in code: no score, no count of the undone, no guilt
- [ ] Regenerate understandings from a script (today they were written by an agent in a session)
- [x] Fetch the documents READMEs point to (STATUS, ROADMAP, PLAN) as further evidence; the
      lines they mark as not done are read as evidence of unfinished work
- [x] `understand.mjs --check` says which readings the repository has moved past, and which
      documents a reading cites nothing from
- [ ] TODOs from the working tree (GitHub's code search does not index these repositories)
- [ ] Understanding shown at building zoom; open questions and architecture on a place's own sheet

## Stage 11: The companion and the first agent

- [ ] The local companion: event channel, log on disk
- [ ] Neutral runner for `command` criteria, with output kept as evidence
- [ ] `ClaudeCodeBuilder`: headless launch from a brief, stream mapped to execution events
- [ ] Choose a builder per session: Claude Code, Codex, Cursor, manual
- [ ] `CodexBuilder`, `CursorBuilder`

## Stage 12: Ideas

- [ ] `origin` on founding; sparks from Claude, ChatGPT, Patrick OS
- [ ] A place stands where he puts it; keyword regions retired
- [ ] `ScaffoldProvider` and one implementation
- [ ] Scaffold in a spark's note; accept, revise, pursue
- [ ] Pursuing stakes lots from the MVP

## Stage 13: Patrick OS

- [ ] `PatrickOsSource`: suggestions and context in
- [ ] `WorldObserver`: meaningful events out

## Stage 14: The new world: board and bay

Chosen in November 2026, after an interview (top of [PRODUCT.md](PRODUCT.md)), six structural
sketches and an art pass. The survey atlas is retired. The direction is recorded in
`.impeccable/surfaces/index-html.md`; the working mockup is in `mockups/` (`npm run world`).

- [x] The board: every project at once, on a lit board; brass roads between tied projects
- [x] The bay: one project, arrived at; its skyline at dusk and bridges to its neighbours
- [x] The two joined: go down from the board to a project, and back
- [x] A rule that places any set of projects in the bay, in the order they were founded, so
      that adding one never moves another (in the mockup; tried on 9, 23, 69 and 345 projects)
- [ ] Store each project's berth once it is chosen. The rule alone is not permanent: a tie
      added later, or an old project growing, would move things if positions were worked out
      afresh. A berth should be an event, like a founding.
- [x] The owner's real projects in the mockup (`npm run world:export`, then
      `mockups/out/world-mine.html`; private and kept out of git). With no definitions yet it is sparse and has no ties at all, which is the
      case for the questionnaire.
- [ ] Smooth with a few hundred projects: cached layers, less redrawn per frame
- [ ] One page and one engine, in `src/`, in place of two mockup pages held side by side
- [ ] DESIGN.md rewritten from what is built; the old atlas rules removed
- [ ] The plain export: what is planned, what is being worked on, what was lately finished
- [ ] Each project's history, and a dial that skips stretches where nothing happened
- [ ] Work in flight (open pull requests) on a building's card

## Stage 15: Quality and upgrades

Asked for on 23 November 2026. Today a building shows how much work is in it (its size) and
how far along it is (its stage). Neither says whether it is any good. This stage adds a third
thing the picture can show: **how good it is**, as a grade, on buildings and on the bridges
and roads between projects.

What Patrick said, and what follows from it:

- "We need to know what good is." The grade needs a rubric with evidence behind it, so that
  it can be checked and argued with. It cannot be a mood.
- "If I make something robust on the first try it should already be really nice." A grade is
  assessed, not earned by time or by the number of commits. New work can arrive at the top.
- "Use AI to assess a feature and then it assigns it a level." The assessor may be a model.
  Its reading is an inference and is shown as one, with who made it, when, and on what.
- "Upgrade a bridge or a road." A grade can rise, and when it does the thing is visibly
  rebuilt finer. It can also fall, when what it rested on stops being true.

How it fits the rules this repository already keeps:

- **Size, stage and grade are three separate things.** Size is how much work, stage is how
  far along, grade is how good. A small excellent feature is a small jewel of a building; a
  large sloppy one is a large shabby one. A strong tie that is badly built is a wide rickety
  bridge. Never fold one into another.
- **A grade is an event, not a field.** `quality.assessed`, carrying the grade, the assessor,
  the reasons and the commit it was read at. `derive` gives the grade at any date, so the dial
  shows an upgrade on the day it happened. (Rule 1 in AGENTS.md.)
- **Fact beats claim, claim beats inference.** What can be measured (tests exist and pass,
  it is typed, its checks in a build plan were verified) is fact. The owner's own grade is a
  claim. A model's reading is an inference. Where they disagree the stronger wins, and the
  card says which it was.
- **Nothing leaves the machine that should not.** At work, source code may not be sent to a
  model the employer has not approved. So the assessor is the owner's own agent, run in the
  repository like the founding questionnaire, and what it writes down is the grade and its
  reasons, never the code.

The work, in order:

- [x] **Decide what good means.** A short rubric, each line something evidence can speak to.
      Patrick accepted this first draft as close enough on 23 November 2026; revise it once
      grades have been seen on real work. It is tested; it handles what goes wrong; it does what it
      set out to do (its acceptance criteria were checked); it has been used; it has not
      needed fixing since; someone else could pick it up (it is named and documented).
      For a tie: there is a stated contract between the two projects; it is tested from both
      sides; a change on one side does not silently break the other.
- [ ] **Decide the grades.** Few enough to tell apart in a drawing: probably four or five,
      named in the world's own words and not as numbers.
- [ ] **Measure what can be measured** from the record the sync already makes, with no model:
      tests beside the code, a passing check run, fixes after it was called done.
- [ ] **An assess command** in the `patrick-world-init` skill: the owner's agent reads one
      feature against the rubric and writes its grade, its reasons and what would raise it.
      Kept apart from the owner's own claims, and dated by the commit that recorded it.
- [ ] `quality.assessed` in the event log and a grade on each feature and link in `derive`,
      with the source it came from. Tests for: a grade that rises, one that falls, an owner's
      grade overruling a model's, a measured fact overruling both.
- [ ] **Draw it.** A manner of building for each grade (material, finish, ornament) on the
      board and in the bay, and the same for bridges and roads. An upgrade is drawn as one:
      scaffold, then the finer thing.
- [ ] **On the card:** the grade, who assessed it and when, the reasons, and what would raise
      it. That last line is also a list of what to do next.
- [ ] **In the plain export:** what could be upgraded and what each would take.

Open, and Patrick's to settle: whether a grade may ever be shown without reasons; whether an
unassessed feature is drawn plain or drawn as its best guess; whether colleagues may see the
grades of each other's work.

## Out of scope tonight

Real data sources, persistence beyond local storage, accounts, deployment, mobile layout,
merging places, drawing revenue.
