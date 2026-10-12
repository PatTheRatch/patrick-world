# Visual direction

**The world is a survey atlas that is still being drawn.**

Patrick's World is rendered as a working fire-insurance atlas: the kind of large-scale town
survey where every building is a measured footprint, coloured by what it is made of, numbered by
how tall it stands, and corrected over the years by pasting fresh slips of paper over what
changed. It is a map made by someone who walked every street and came back every year.

This is a direction, not a costume. It was chosen because the form already says, in its own
language, almost everything the product needs to say.

## Why this form carries the product

| The product needs to say | The atlas already says it as |
|---|---|
| This is only an idea | A pencilled lot with a surveyor's stake |
| This is decided on | A solid pencil outline |
| This is designed | A dashed ink outline, lettered FROM PLANS |
| This is being built | Washed as far as it has risen, hatched beyond, its outline crawling |
| This works | A full colour wash, a storey numeral, a cast shadow |
| This is mature | A heavy wall, a deeper wash, annexes |
| Work happened here recently | A fresh, brighter correction slip pasted under the building |
| Nobody has been here in a while | Ink faded toward sepia, washes gone chalky |
| This was abandoned | A broken outline, a stain where the wash was, lettered RUINS |
| What did this look like a year ago | Peel the correction slips back to an earlier edition |
| We do not know this ground yet | The paper is simply blank. Unsurveyed. |

None of those are invented game states. They are how survey atlases have always recorded the
truth about buildings, which is why nothing needs a status badge.

## What it should feel like

**Quiet proprietorship.** Walking your own land at the end of a day and seeing what is
standing. "This is mine, it is real, and I know what I would build next."

- **Leans toward:** steadiness; appetite at the sight of a pegged lot; fondness for small
  things left alone; the click of a check passing.
- **Kept out:** urgency, guilt, being scored, being cheered at, cuteness.
- **Aftertaste:** a session ends with one more thing standing or one thing more clearly
  defined. Never with a count of what is left.

Heuristics for every later decision:

1. Show, do not tell. Faded ink says "untouched"; no message does.
2. Stillness is information. Nothing moves unless work is happening.
3. The map never speaks first. No prompts, no reminders, no congratulations.
4. Record over reward. A date on a building, not a flourish.
5. Pencil before ink. Intent is always visibly lighter than fact.
6. Let ruins be handsome. Abandonment is history, not failure.

Strongest signal today: permanence and honesty. Weakest: **appetite.** The prototype is
entirely retrospective; nothing on it makes him want to act. The build loop, and a ready lot
that looks ready, are what supply it.

## The second pass: the world encodes attention

Patrick's verdict on the first map: "a beautiful atlas with project markers, not yet a living
world." An independent critique agreed and named the mechanism: every town was the same object
at a different count, name size came from rank alone, and at whole-territory zoom nothing
answered "what am I working on" without reading. The second pass optimises for one test:

> Looking at the whole territory, without reading a label, can he tell what is alive, what is
> growing, what is steady, what he has neglected, and what is newly emerging?

**One vocabulary, three channels that already existed** (paper, ink line, motion). No new
visual dimension was added; the uniform pale "town ground" tint, which encoded nothing, was
retired to pay for it.

| State | Paper under the place | Its edge | Moves |
|---|---|---|---|
| Being worked on | A fresh slip, with its hard shadow | Black, dashed | The edge crawls |
| Standing | Bare sheet | Black, solid | Still |
| Quiet | Light foxing | Browned, thin | Still |
| Dormant | Foxed | Sepia, dotted | Still |
| Ruins | Stained | Broken dash and dot | Still |
| Newly founded | A small slip under its mark, a pencil traverse to its neighbour | | Drawn once |
| Left half built | | Old ink round an open hatch, chalky wash | Still |

Every row survives in greyscale: paper value and line continuity carry it, not hue.

**What else changed, and what each thing encodes:**

- **A town's size is the work in it.** Around the named buildings stand ordinary houses, one
  for about nine commits. A project with twelve hundred commits is physically several times the
  size of one with fifty, before any label is read.
- **Names follow the work.** A wider scale by rank, and within a rank a larger name for more
  work, never reaching the next rank. Sparks and sites are marks without names from the whole
  territory. Region names are atmosphere and are never louder than a place.
- **The land has shape.** Slopes are shaded from the north-west and woodland is a broken tone,
  everywhere, because geography exists whether or not anyone has built there. Survey detail
  (hachures, single trees, names) is still reserved for ground near founded places.
- **Tracks between places that share methods.** Inferred, sparse (each place to its nearest
  such neighbour), marked as inferred, and running into the town instead of stopping short.
- **Construction is drawn honestly.** The old left-to-right fill was a progress bar in a
  footprint. Now the ground is hatched, the wash deepens as the work rises, and the wall is
  inked round the perimeter as far as the work has got.

**Motion and life, under the rule Patrick set on 13 October.** The first version of this
section refused smoke, lights, traffic and weather on the ground that a survey atlas could not
contain them. That was the wrong test, and he replaced it: *important visual signals must
correspond to real underlying state, but they may use metaphor, animation and world
simulation to communicate that state.* The atlas is the foundation, not a veto. So the
question for each motion is what it encodes:

| Motion | Encodes | State |
|---|---|---|
| A place's edge crawling | Work logged there in the last three weeks | Built |
| A building's wall crawling | That feature is under construction and was touched recently | Built |
| Traffic along a route | Code or data really flows between two places, and one end is being worked on now | Built, for declared mains |
| Construction on one lot (scaffold, a ranging pole) | A builder session is open on that feature right now | Needs builder sessions |
| Inspection at a building | A verification is running against its criteria | Needs builder sessions |
| Something leaving a town | A release or deploy just went out | Data exists (releases); not drawn |
| Stillness | Nothing has happened. A quiet town must genuinely not move | Built |

Still refused, because they encode nothing: weather, a day and night cycle, drifting smoke
with no source, and ports or cliffs scattered for texture.

**Town form by rank is now built** (see "Settlements" below). **Not yet done:** worked fields round a town and woodland creeping
back over a neglected one; the district and building zoom layers (criteria ticks, built-order
numbers, revision slips); bridges; and orienting each town to the ground it stands on.

## Settlements: form that changes in kind

The first town generator laid every place out on the same rotated block grid, so maturity read
as small grid, larger grid, larger grid. It was replaced (`src/plan/settlement.ts`).

Every place has a **latent skeleton**, fixed by its id before anything is built: a through
route, a crossing route, side streets off each, and room for later quarters. Evidence does not
shape the skeleton; it only reveals it. Each feature takes the nearest free frontage, so:

| What exists | What it looks like |
|---|---|
| A thought | A survey mark |
| Proposed features, nothing real | Pencilled lots standing alone, no street |
| Two or three buildings | A few buildings strung along a track |
| A handful | A ribbon reaching a crossing, frontages stepping in and out |
| A dozen or more, a town's rank | A crossroads with a square, side streets, back rows of terraces |
| Several quarters | An old irregular core, and later quarters at their own angle, each founded at the edge of the town as it stood that day |

Nothing already standing ever moves: the lot for a feature depends only on the features
before it. Rank changes how made the streets are (a dashed track, a single lane, a ruled
street, an avenue) and whether the middle is a common, a square or a plaza. It never moves a wall.

**Places are born with different ground plans.** A crossroads, a T where one road meets
another, a fork, a bend, or a wide green: one of five, fixed by the place's id. So towns of the
same size are not the same shape, and a larger town is not a larger copy.

**The outline is the built ground itself**, traced round the lots and streets, not a hull drawn
round them. A ribbon reads as a ribbon and a fork as a fork from across the territory. Ordinary
fabric is left out of the outline, so effort thickens a place without enlarging its footprint.

**What a place is made of shows in its shape**, without colour. Terraces are narrow lots hard
on a high street, and a quarter founded on them runs on down its street instead of turning the
corner. Works are solid blocks with yards. Reservoirs are round tanks standing in open ground.
Observatories are octagonal domes in their own grounds. Utilities are long sheds along the
line. A place that is mostly data and one that is mostly interface have different outlines.

**Effort thickens a town; it does not sprawl it.** Ordinary fabric is aggregated terraces:
infill in the gaps between named buildings, and rows on the back lanes, each smaller than any
named building. It grows with the logarithm of the work and is capped by the weeks worked, so
twelve hundred commits is a dense town, not a plain of houses, and a furious first week builds
no suburbs. Outposts have none.

**Motion means this week.** A place's edge stays dashed for three weeks after work, but it only
moves in the week of the work.

**Open after the second review, in order:** quarters with one grain each (a continuous terrace
wall, tanks spaced on a spur) and one generalised wash per quarter from afar; regional roads
entering by the ends of a town's own streets; side streets closing into blocks; a ward boundary
and name held through district zoom; criteria ticks and a builder's mark on the building, which
need the build model wired in. The survey is now frozen by a snapshot test: changing the ground
plan rules moves every town once and must be done on purpose.

## The scene

Patrick at his desk in the evening, a large monitor, a lamp. The atlas sheet lies under the
light on a dark drafting table. So: a toned paper ground (not white, not cream; a cool
buff-grey linen that is restful at night), surrounded by dark table where the sheet ends.
Colour arrives through the washes, which are saturated and cover real area in a dense city.

## Palette: every colour is an entry in the Key

Strategy: full palette, strictly limited. No colour appears on the map unless it is an ink in
the Key. Five washes say what a building *is*; drawing technique says how *far along* it is.
Colour never carries stage, so stage survives without colour.

| Ink | Role |
|---|---|
| Linen | The sheet itself. Cool buff-grey paper with visible fibre. |
| Slip | Fresh correction paper. Brighter and whiter than the sheet; recent work literally shows as patches. |
| Black ink | Outlines, lettering, streets. Fades toward sepia with dormancy. |
| Graphite | Pencil: everything not yet real. Concepts, plans, unsurveyed notes. |
| Rose | Wash for **frontage**: what people see and touch (interface, product surface). |
| Chrome yellow | Wash for **works**: logic, services, the machinery of the thing. |
| Prussian blue | Wash for **reservoirs**: data, storage, pipelines. Also all water and mains. |
| Viridian | Wash for **observatories**: intelligence, models, research, analysis. |
| Slate | Wash for **utilities**: infrastructure, operations, connective plumbing. |
| Surveyor's red | The surveyor's own hand: selection, the current edition, things Patrick is touching now. Used for nothing else. |

Table surface: near-black umber-green baize, seen only at the margins and behind sheets.

## Type

Two families, chosen as objects from the atlas's world:

- **Besley** (a Clarendon). Town names, sheet titles, the cartouche. Clarendons are the
  nineteenth-century map-title face; bracketed slabs that stay legible lettered small on a
  wash.
- **Archivo** (variable width). The engineering gothic: wide tracked caps for streets and
  districts, condensed for dense labels and numerals inside footprints. One family covers the
  whole range of hand-lettered gothic an atlas uses.

Hierarchy on the map is cartographic: a place's name is sized and weighted by its rank, so the
biggest words are the biggest places. Lettering follows the thing it names (along streets,
across districts). No centred floating labels in boxes.

## Depth without 3D

A true plan, never an oblique or isometric view. Depth comes from two honest sources:

1. **Cast shadows.** Each finished building throws a shadow whose length is its storeys, and
   its storeys are the work invested in it. A long-worked feature visibly stands taller.
2. **Stacked paper.** The atlas is physical: sheets lie on the table, slips lie on sheets,
   notes lie on slips. Each layer casts a hairline shadow on the one below. Zooming is a
   camera lowering toward the paper through those layers.

## Motion: the pen, the wash, the paste

Three verbs carry the drawing. (As built there is a fourth, their reverse: turning the edition
back drains a wash. Roads, outlines and whole places do not yet un-draw; see HANDOFF.md.)

- **The pen draws.** Lines ink themselves along their length. New things are drawn, not faded in.
- **The wash floods.** Colour bleeds outward from a point inside the outline and settles.
- **The slip is pasted.** A revision lands with a small overshoot and a hairline shadow.

Ambient life is limited to what is true: construction dashes crawl around buildings that are
actually being built right now. A city with no current work is perfectly still, and that
stillness is information. Reduced motion: everything is drawn in its final state, no crawl.

## The first viewport

The whole territory, drawn. Blank paper at the edges where nothing is known. Two or three
cities are unmistakably large from across the room: dense multi-block fields of wash with long
shadows and big Clarendon names. Around them, towns, and further out, single pencilled marks.
Roads run between related places. A small title cartouche sits in a corner of the sheet the
way one does on a real map: title, the edition date, a tally of what stands, the Key. No toolbar, no
sidebar, no panel.

The signature interaction is the **edition dial**: drag the edition date backwards and the
slips peel away, washes drain back to pencil, roads un-draw, and cities shrink to the outposts
they once were.

There is no scale bar. World distances stand for nothing measurable, and a bar would be the
one mark on the sheet with no evidence behind it. The cartouche carries a tally instead.

The territory is an island in a sea, which a fire-insurance atlas would never show. That is a
deliberate adaptation: the atlas supplies the towns, and a coast gives the territory an edge
and a frontier without a fantasy map's ornament. Water is drawn as a chart draws it.

## What this direction refuses

- The fantasy parchment game map: no scrollwork, no compass-rose flourish, no sea monsters,
  no burnt edges.
- The dark neon data globe: no glows, no gradients-as-atmosphere, no particle fields.
- The dashboard: no cards, no badges, no progress bars, no icon set. If a fact matters it is
  drawn on the map or lettered beside the thing it describes.

## How the direction was chosen (record)

Seed key `a2007292`, mode Experience, code-led (no image generation in this session). Patrick was
asleep, so the assigned direction was taken without a decision round; all seven grounded
candidates and the dealt challengers are recorded here so he can overrule it.

Grounded candidates, ordered by my own sense of resonance:

1. National topographic survey sheet: relief shading, hachured rock, names sized by population.
2. Plan-oblique pictorial city map: hand-drawn buildings rising from a true plan.
3. Architect's site model: card and basswood massing on a contoured board under raking light.
4. Earth at night from orbit: settlement read purely as light.
5. **Fire-insurance survey atlas: assigned by the roll.**
6. Strategy-game terrain map: the literal reading of the brief.
7. Geological survey section: history as strata.

Candidate 1 was my own top pick. Its honest risk is that it is where most "map of my projects"
builds land: handsome, familiar, and with no native vocabulary for construction state. If the
atlas feels too dry in the morning, candidate 1 or 4 is the re-roll to ask for.

Dealt challengers, all weighed on audience identification and product clarity. None won. Each
left one discipline behind, which the direction adopted:

| Challenger | Verdict | Raise kept |
|---|---|---|
| Depot destination blind | Declined | *Three dyes only.* The palette is closed: no colour outside the Key, ever. |
| Nixie laboratory counter | Declined | *Fixed digit positions.* Numerals live in fixed places: storeys in the footprint corner, sheet numbers in the margin. |
| Polish film poster | Declined | *One image is the whole territory.* Secondary matter rides inside the drawing; nothing sits in a panel beside it. |
| Desert sign-shop drawing | Declined | *Sequence numbered on the elevation.* Buildings carry the order they were built in. |
| Multiplane cel dawn | Competitive (atmosphere) | *Travel is camera movement through layers.* Zoom lowers through stacked paper; there are no page swaps. |
| Exposed coptic binding | Declined | *Structure showing.* Revisions are never hidden: slip edges and edition stamps stay visible. |

## Honest risks

- A paper atlas can read as static. The edition dial, the pen, and construction crawl have to
  carry "living"; if they do not land, the world will feel like a nice poster.
- Toned paper with ink is adjacent to the overused cream-and-serif look. The defence is the
  saturated washes covering real area, gothic caps doing most of the lettering, and no
  editorial layout anywhere. If a screenshot could be mistaken for a literary magazine, it
  has failed.
- A true plan gives up the pleasure of skylines. Shadows and density have to supply scale.
