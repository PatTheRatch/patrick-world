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
- **Building.** He picks a feature, writes or accepts its plan, chooses who builds it (himself
  or a coding agent), and watches it go up. *(Stated in the second brief, 12 October 2026.)*

## Product Purpose

Patrick's World turns his projects, ideas, experiments and ambitions into a living world he can
explore, instead of lists, boards and folders. It is also where he builds them: each building
stands on a build plan, and work is started, watched and judged finished from inside the world.

It exists because lists flatten everything: a thought he had once and a product he has built for
six months look the same in a list. In the world they cannot look the same. One is a mark on
open ground; the other is a city.

Success is an emotional response backed by an honest picture:

- He can see which projects matter most without reading anything.
- He can tell "thought of this once" from "built this for six months" at a glance.
- He wants to put his real projects into it.
- He would keep it open.
- Planning a feature properly here is easier than not planning it, and "done" means the same
  thing whether he or an agent did the work.

## What it is for, as of 13 October 2026

Patrick's World should not only show what he has built. It should understand what each
project is, show him where he left off, help him decide where to go next, and let him build
from inside the world. Morphology work waited behind the first build-plan slice and the first
understanding layer, and was taken up again once both were in.

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

Stated in the second brief (12 October 2026), designed for and not yet built:

- **Build plans.** A feature can carry a plan: objective, acceptance criteria, implementation
  steps, dependencies, files expected to change, verification requirements, blockers.
- **Build stages.** Idea, specified, planned, ready, building, verifying, done. Each is a fact
  about the plan, never a label someone sets.
- **Builders.** Work can be handed to Claude Code, Codex, Cursor or a future tool, or done by
  hand. All of them work from the same plan and reach done the same way.
- **Idea scaffolding.** A spark can be worked up, with an AI's help, into problem, hypothesis,
  target user, capabilities, MVP, risks, open questions, technical possibilities and a first
  experiment. Choosing to pursue it stakes its first lots. No idea is required to be scaffolded.
- **Ideas from elsewhere.** Sparks may arrive from Patrick, Claude, ChatGPT, Patrick OS or other
  sources, and their origin is recorded.
- **Patrick OS as a peer.** It may suggest ideas, supply context, and observe build events,
  through explicit interfaces only. The two never share a database.

Hard constraints:

- Patrick's World owns canonical build state. A builder executes and reports; it never decides
  that something is finished.
- A building that looks complete must have a reason in its plan to be complete.
- Not coupled to any one coding agent.
- Manual work is a first-class way to build, not a fallback.

- No fake currencies, gems, streaks, XP or any reward that does not correspond to real work.
- Not a clone of any specific game's art, interface or mechanics.
- Not a dashboard with game icons; no card walls; no sidebar-plus-map layout.
- Not childish, not ornamented fantasy, not pixel art for its own sake.
- Must stay readable and fast with dozens to hundreds of projects, ideas and features.
- No real accounts connected, nothing pushed to a remote, in this phase.

Undecided (recorded, not invented):

- Whether a builder session runs on Patrick's machine, in a container, or remotely, and what
  it is allowed to touch.
- Who may check a `manual` or `review` criterion when an agent did the work (the model requires
  that it not be the agent itself; whether a second agent qualifies is open).
- How much of a plan an agent may draft before Patrick must accept it.

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

## Goal

Patrick finishes more of what he starts, and knows what "finished" meant, because each
feature's plan and its proof live where he can see them.

Signals that it is working, all countable from the event log:

- Features reaching done with every criterion passed, per month.
- The share of work that had a plan before it was built.
- Days on which he opened the world and something on it changed.
- First: one real feature taken from spark to done through the world within two weeks of the
  build loop existing.

Signals that it is failing: he opens it to look and never to act; plans stop being written
while commits continue; "done" is mostly recorded on his own word.

## Design Pillars

Each one names what it gives up. A pillar that cannot say no is not doing any work. When two
collide, the earlier one wins.

0. **Truthful semantics, free metaphor.** Patrick's World is a metaphorical world, not a
   historical survey. Every important visual signal must correspond to real underlying state,
   and it may use metaphor, animation and simulation to say so. The atlas is the visual
   foundation and never a veto: the question for any element is "what real thing does this
   encode?", not "could a surveyor have drawn it?". Motion that encodes nothing is still refused.
1. **Earned ink.** Nothing is drawn that did not happen. *Gives up:* flattering progress, quick
   wins, tidying the map by hand, and a full-looking world on day one.
2. **Done is proven.** A building stands when its acceptance criteria pass, and the map shows
   how they passed: by a command, by a review, or on Patrick's word. *Gives up:* a "mark as
   done" button, speed, and any builder's right to declare victory.
3. **Nothing moves, nothing is erased.** Places stay where they were founded; ruins stay;
   rewritten plans leave their old revisions showing. *Gives up:* reorganising, deleting what is
   embarrassing, and optimal layouts.
4. **The map is the workplace.** He acts on a thing where it stands. *Gives up:* tables, bulk
   editing and density. One accepted exception: a build plan is a document and opens as its own
   sheet of the atlas, the way the Key does.
5. **Small is legitimate.** A spark may stay a spark forever. Discipline begins only when he
   chooses to build. *Gives up:* reminders, backlog pressure, and any count of what is undone.

Standing rule from these: **no new visual dimension without retiring one**, and no real thing
carried by two unrelated devices or two real things fused into one. The assignment:

| Real thing | Carried by |
|---|---|
| Breadth: how many capabilities | Footprint: how far the streets run, how many quarters, named buildings |
| What it is made of | The grain and plan of its lots and quarters; from afar, its silhouette |
| Effort invested | Density: infill, storeys, ordinary fabric. Saturating, never a field of identical houses |
| Maturity | How made the streets are; a common, then a square, then a plaza; landmarks |
| Current attention | Paper, edge and motion: fresh slip, crawling line, construction, traffic |
| Dependencies and shared systems | Roads, mains and what moves along them |

## Accessibility & Inclusion

No requirement was stated. Adopted as a baseline **[inferred]**: every place reachable and
operable from the keyboard, state never carried by colour alone (shape and structure change
with state), reduced-motion honoured, text contrast at WCAG AA.
