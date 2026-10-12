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
much binds them: a bare "related" link is a surveyed line of dots; shared methods and shared
activity grade it into a dashed track, then a solid road. A `shares` or `feeds` link adds a
main alongside.

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

- **Effort that is not commits.** Design, research and thinking leave no commit. The model has
  an `hours` field on work events and nothing feeds it yet.
- **Quality.** A mature feature and a mess with many commits look alike. Stage events are the
  only corrective.
- **Shared ownership.** Everything is Patrick's. Collaborators are not modelled.
- **Merges.** Splits are modelled (a link of kind `split-from`). Merging two places into one is
  specified in the data model and not yet exercised by the fixtures.
