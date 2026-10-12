# World model

How real information becomes a world. [DATA_MODEL.md](DATA_MODEL.md) has the exact types; this
is the reasoning.

## One idea: the world is a function of its history

```
events  ──►  derive(events, asOf)  ──►  WorldState  ──►  layout  ──►  drawing
(facts)      (pure, deterministic)      (meaning)        (geometry)   (ink)
```

The only thing stored is an append-only log of **events**: things that happened, with a date
and a source. Everything else (ranks, stages, liveliness, roads, technologies) is computed
from that log for a chosen date.

This one decision buys most of what the brief asks for:

- **History is free.** The world a year ago is `derive(events, oneYearAgo)`. Nothing is
  snapshotted; nothing can drift.
- **History cannot be destroyed.** There is no update or delete, only new events. Abandoning a
  project is an event. Renaming is an event. A split is an event.
- **Sources are interchangeable.** GitHub, Patrick OS and Patrick typing into the map all
  produce the same events. The world does not know or care where a fact came from.
- **The rules can change.** If a city should need eight working features instead of six, change
  the threshold and the entire history re-derives consistently.
- **No status field exists to lie.** Dormancy is the absence of events, so it cannot be
  forgotten or left stale.

## The nouns

**Place.** Anything Patrick might build, from a one-line spark to a major product. There is no
separate "idea" type and "project" type. An idea is a place with little evidence; a project is
the same place with more. This is what lets a spark become a city without being converted.

**Feature.** A part of a place: a capability, component or piece of work that could be finished.
Has a kind (which wash it gets), an optional ward, and the methods it uses.

**Method.** A skill or technology: TypeScript, PostgreSQL, LLM evaluation. Defined in a small
catalogue with prerequisites. Its level is derived from use.

**Link.** A relationship between two places: related, shares code, one feeds the other, one
was split from the other.

**Region.** A stretch of the territory standing for a domain of interest. A place is founded
in a region, which is what puts related things near each other.

## Derived meaning

### Feature stage

Stages advance by explicit stage events, because "designed" and "working" are judgments a
commit count cannot make. But a stage event is itself evidence from a source: a merged design
doc, a deploy, a passing check. Patrick stating a stage by hand is allowed and recorded as
`source: manual`, so claims and observations stay distinguishable.

Within a stage, **progress** and **storeys** come from work:

- Storeys: `1 + floor(log2(1 + commits / 6))`, capped at 9. Six commits is a single-storey
  shed; a few hundred is a tower.
- While `building`, progress is work logged since building began, against the typical cost of
  that kind of feature in this world. It drives how much of the footprint is hatched.

### Place rank

A ladder of cumulative thresholds over working features, weeks containing work, releases and
measured traction (table in [GAME_METAPHOR.md](GAME_METAPHOR.md)). Rank is the highest rung
ever reached and never falls.

### Liveliness

A function of time since the last work event, plus an explicit abandonment. See the table in
the metaphor document. Ruins can be revived by new work: the place returns to Building, and the
log still shows the gap.

### Heat

A continuous measure used for fine visual differences: work in recent weeks with exponential
decay (half-life three weeks). Drives how many fresh slips a city carries and which buildings
they sit under.

### Method level

For each method, evidence is the work logged against features that use it, summed across
places, plus breadth (how many distinct places).

| Level | Evidence | In the Key |
|---|---|---|
| Unknown | None | Not listed |
| Noted | Appears on a proposed feature only | Pencilled |
| Practised | Real work in one place | Inked outline |
| Fluent | Substantial work, or work in three places | Washed |
| Mastered | Heavy work across several places over a long span | Washed, double-ruled |

### Roads

A road exists between two places when a link event says so. Its build-out is derived from how
much binds them:

- **Surveyed** (a line of dots): related on Patrick's word alone.
- **Track** (dashed): a real dependency (`shares`, `feeds`, `split-from`), or at least one shared
  method between two places that have both had real work.
- **Road** (two ink lines): both places are towns or larger, and they share three or more
  methods or a real dependency.

An idea that merely lists the same methods as a city does not earn a road. Until both ends are
built, shared methods are a coincidence of intent. A `shares` or `feeds` link also lays a main
alongside, lettered with what flows.

## Building: what stands under a building

The world is not only a record of work done elsewhere. It is where work is planned, started
and judged finished. Contract and rule: `src/world/build.ts`.

### The principle

**A building's stage is derived from its build plan and from what builders report. Nobody sets
it.** This is the same rule as the rest of the model (no status field), carried down a level.
It is also what makes the brief's requirement checkable: if a building is drawn complete, there
is a plan whose every acceptance criterion has a recorded passing verdict.

### The plan

A feature may carry a **build plan**: an objective, acceptance criteria (each with how it will
be verified), implementation steps (with ordering and the files they are expected to touch),
dependencies on other features, further verification requirements, and notes. Blockers are
raised and cleared against it as events.

A plan is revised by writing a new revision. An agent may draft a revision; it is not the plan
until Patrick accepts it. Accepting a new revision voids verdicts given on the old one, because
they were about a different promise.

### The stages

| Stage | True when | Drawn as |
|---|---|---|
| Idea | It has a name and nothing else | A pencilled lot and a stake |
| Specified | It has an objective and at least one acceptance criterion | A solid pencil outline |
| Planned | It has implementation steps, but a dependency or blocker is outstanding | A dashed ink outline: from plans |
| Ready | Planned, every dependency done, no blocker open | The same, with its corners pegged: ground can be broken |
| Building | A session has started, or a step is under way or finished | Washed as far as its steps are finished, hatched beyond; the outline crawls while a session is open |
| Verifying | Every step is finished; criteria are unchecked or failing | Fully washed, the outline still dashed: built, not yet passed |
| Done | Every acceptance criterion has passed on the current revision | Solid ink wall and a cast shadow |

Three consequences worth stating:

- **A builder saying it is finished changes nothing.** `build.completed` is a report. Only
  passing criteria make a building done. This is tested.
- **Done can be lost.** A later failing verdict on a criterion returns the building to
  verifying. Regressions are visible.
- **The crawl means something exact.** A building's outline moves only while a session is open
  on it. If Claude Code is implementing a feature right now, that building, and only that one,
  is visibly under construction.

"Mature" is no longer a stage. It becomes a derived quality of a done building that has been
returned to and extended over time, drawn with the heavier wall and annexes as now.

### Builders

Work is done by a **builder**: Claude Code, Codex, Cursor, a future tool, or Patrick by hand.
Every builder is behind the same small interface (`BuilderAdapter`): it is handed a brief (the
plan, a workspace, the steps to attempt, context) and it reports execution events. It never
writes state and never concludes.

```
Build Plan ──► BuilderAdapter ──► Claude Code / Codex / Cursor / hands
                                          │
   world state ◄── derive ◄── event log ◄─┘  execution events
```

**Manual is a builder like any other.** The manual adapter's "session" is Patrick working; its
reports are him ticking off steps and recording checks. The plan, the stages and the rule for
done are identical, which is the point: agent-built and hand-built features are comparable.

Verification has three kinds: a **command** (its exit status decides), a **manual** check
(Patrick looks), and a **review** (someone other than the builder judges). For the last two,
whoever did the work may not be the one who checks it.

### Ideas, before any plan

A spark can arrive from Patrick, Claude, ChatGPT, Patrick OS or anywhere else; its origin is
recorded. It can then be **scaffolded**: worked up into problem, hypothesis, target user,
possible capabilities, an MVP, risks, open questions, technical possibilities and a first
experiment. An AI may draft the scaffold. Like a plan, it is a suggestion until accepted.

Scaffolding does not move an idea up the ladder: thinking about something is not building it.
A scaffolded spark is drawn as a site with survey notes around it, and no more. The decision to
**pursue** it is a separate event, and that event is what stakes lots on the map, one per MVP
entry Patrick chooses. From there each lot is an idea-stage feature waiting for a plan.

No idea is required to be scaffolded, and none is required to be pursued.

### Adopted from the design review

Five additions, each derivable from events that already exist or are already specified:

- **How it passed.** A done building records whether its criteria passed by command, by
  review, or on Patrick's word. Derived from `criterion.checked`; shown in the note and, on the
  map, as the difference between a wall inked on evidence and one inked on say-so.
- **Rewritten promises.** A plan revision that removes or loosens a criterion is detectable by
  comparing revisions. Such a building carries a slip per rewrite.
- **Dependencies are roads.** A plan that depends on a feature in another place is a real
  relation between the two places and grades their road. A road should come to mean "this
  needs that", not "these are related".
- **Unplanned work is drawn.** Commits against a feature with no plan raise storeys and an
  inferred stage, marked as unplanned. Never hidden, never prompted about.
- **Unsurveyed ground.** A plan using a method at level unknown or noted stands on ground the
  world has not surveyed, and says so.

And one piece of state that is not an event about the work: **when he last looked.** Needed to
show what changed since. It is per viewer and lives beside the log, not in it.

### What this changes about evidence

Until now, evidence meant commits. With plans, the stronger evidence is criteria passing, and
commits become what they really are: effort. So:

- **Stage** comes from the plan when a feature has one.
- **Storeys** still come from work invested (commits, and now session activity).
- A feature with no plan (everything arriving from GitHub today) keeps an **inferred** stage,
  marked as inferred, and is drawn the same way. Writing a plan for it replaces the inference.

## Layout: where things go, and why they never move

A map that rearranges itself is not a map. Three rules:

1. **A place's position is fixed when it is founded.** It is chosen once, near the centre of
   its region and near any place it was founded "near", pushed clear of neighbours with room
   to grow. The position is stored on the founding event.
2. **A city grows outward.** Each city has a street grid at its own angle. Lots are claimed in
   a fixed outward order as features are proposed, grouped by ward. Feature number seven always
   stands where feature number seven stood.
3. **Time only adds.** Scrubbing the edition backwards removes the newest things first and
   never shifts what remains.

Because of rule 1, layout is part of the record, not a presentation detail. Because of rules 2
and 3, a city viewed at any two dates lines up exactly, which is what makes the edition dial
feel like peeling paper rather than shuffling tiles.

## Scale

The design target is 300 places and 3,000 features.

- Derivation is linear in events and is re-run only when the edition date or the log changes.
  Weekly work events for 300 places over ten years is roughly 150,000 events, which derives in
  well under a frame's worth of milliseconds per thousand; a checkpoint cache per year is the
  planned next step if scrubbing ever stutters.
- Drawing is governed by zoom: at territory scale a city is a few dozen filled polygons, not
  three thousand buildings. See [ARCHITECTURE.md](ARCHITECTURE.md).
- The territory has room: regions are large and mostly blank, by design.

## What the model does not know yet

- **Running a builder.** The interface exists; nothing implements it yet, including manual.
- **Where a session runs** and what it may touch.

- **Effort that is not commits.** Design, research and thinking leave no commit. The model has
  an `hours` field on work events and nothing feeds it yet.
- **Quality.** A mature feature and a mess with many commits look alike. Stage events are the
  only corrective.
- **Shared ownership.** Everything is Patrick's. Collaborators are not modelled.
- **Merges.** Splits are modelled (a link of kind `split-from`). Merging two places into one is
  specified in the data model and not yet exercised by the fixtures.
